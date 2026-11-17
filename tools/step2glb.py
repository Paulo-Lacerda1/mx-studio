"""Tessellate a STEP file into a GLB. Each B-rep face is tagged with 's<solid>f<face>'.

Requires: pip install cadquery-ocp numpy  (use a virtualenv)

usage: step2glb.py in.stp out.glb [groups.json]
groups.json maps group name -> list of face tags (or solid tags 's<n>'); unlisted faces go to 'body'.
Without groups.json every face becomes its own node (debug).

Environment:
  RULES=tools/mx3s_rules.py  per-triangle part classification + scale/centre transform
  DEFL=0.07 ANG=0.25         tessellation tolerance (mm / radians)

The app model was built with:
  DEFL=0.07 ANG=0.25 RULES=tools/mx3s_rules.py python tools/step2glb.py mouse8.stp web/models/mx3s.glb
"""
import sys, json, struct
import numpy as np
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopoDS import TopoDS
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRep import BRep_Tool
from OCP.TopLoc import TopLoc_Location
from OCP.BRepLib import BRepLib_ToolTriangulatedShape

src, dst = sys.argv[1], sys.argv[2]
groups = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None
r = STEPControl_Reader(); r.ReadFile(src); r.TransferRoots(); shape = r.OneShape()
import os
BRepMesh_IncrementalMesh(shape, float(os.environ.get('DEFL', '0.05')), False, float(os.environ.get('ANG', '0.2')), True)
RULES = None
if os.environ.get('RULES'):
    import importlib.util
    spec = importlib.util.spec_from_file_location('rules', os.environ['RULES']); RULES = importlib.util.module_from_spec(spec); spec.loader.exec_module(RULES)

lookup = {}
if groups:
    for name, tags in groups.items():
        for t in tags: lookup[t] = name

parts = {}
se = TopExp_Explorer(shape, TopAbs_SOLID); si = 0
while se.More():
    solid = TopoDS.Solid(se.Current())
    fe = TopExp_Explorer(solid, TopAbs_FACE); fi = 0
    while fe.More():
        face = TopoDS.Face(fe.Current()); loc = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, loc)
        tag = f's{si}f{fi}'
        if tri is not None:
            BRepLib_ToolTriangulatedShape.ComputeNormals_s(face, tri)
            trsf = loc.Transformation(); n = tri.NbNodes()
            pts = np.empty((n, 3), np.float32); nrm = np.empty((n, 3), np.float32)
            for k in range(1, n + 1):
                p = tri.Node(k).Transformed(trsf); pts[k-1] = (p.X(), p.Y(), p.Z())
                d = tri.Normal(k).Transformed(trsf); nrm[k-1] = (d.X(), d.Y(), d.Z())
            rev = face.Orientation() == TopAbs_REVERSED
            if rev: nrm = -nrm
            idx = np.empty((tri.NbTriangles(), 3), np.uint32)
            for k in range(1, tri.NbTriangles() + 1):
                a, b, c = tri.Triangle(k).Get()
                idx[k-1] = (a-1, c-1, b-1) if rev else (a-1, b-1, c-1)
            if RULES:
                cent = pts[idx].mean(1)
                names = [RULES.classify(si, fi, c) for c in cent]
                for name in set(names):
                    sel = idx[np.array([n == name for n in names])]
                    used = np.unique(sel); remap = np.full(len(pts), -1, np.int64); remap[used] = np.arange(len(used))
                    parts.setdefault(name, []).append((pts[used], nrm[used], remap[sel]))
            else:
                name = (lookup.get(tag) or lookup.get(f's{si}') or 'body') if groups else tag
                parts.setdefault(name, []).append((pts, nrm, idx))
        fi += 1; fe.Next()
    si += 1; se.Next()

# glTF writer: one mesh/node per part, positions in millimetres as authored.
buf = bytearray(); views = []; accessors = []; meshes = []; nodes = []
def add(data, target, comp, typ, minmax=False):
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf.extend(data.tobytes())
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': data.nbytes, 'target': target})
    acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(data), 'type': typ}
    if minmax: acc['min'] = data.min(0).tolist(); acc['max'] = data.max(0).tolist()
    accessors.append(acc); return len(accessors) - 1
if RULES and hasattr(RULES, 'transform'):
    allp = np.concatenate([p for ch in parts.values() for p, _, _ in ch])
    fn = RULES.transform(allp.min(0), allp.max(0))
    parts = {k: [(fn(p).astype(np.float32), n, i) for p, n, i in ch] for k, ch in parts.items()}
for name, chunks in parts.items():
    P, N, I, base = [], [], [], 0
    for p, n, i in chunks: P.append(p); N.append(n); I.append(i + base); base += len(p)
    P = np.concatenate(P); N = np.concatenate(N); I = np.concatenate(I).astype(np.uint32).ravel()
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    pa = add(P, 34962, 5126, 'VEC3', True); na = add(N.astype(np.float32), 34962, 5126, 'VEC3'); ia = add(I, 34963, 5125, 'SCALAR')
    meshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia}]})
    nodes.append({'name': name, 'mesh': len(meshes) - 1})
while len(buf) % 4: buf.append(0)
gltf = {'asset': {'version': '2.0', 'generator': 'mx-studio step2glb'}, 'scene': 0,
        'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(buf)
print(dst, len(parts), 'parts', sum(len(c) for c in parts.values()), 'faces', round(len(buf)/1e6, 1), 'MB')
