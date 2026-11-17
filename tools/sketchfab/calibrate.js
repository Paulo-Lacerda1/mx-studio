// Sketchfab world: metres, Z up, front = +Y, left (thumb) = -X.  CAD (GLB): mm, Y up, front = -Z, left = -X.
const pick = (a, b) => new Promise(res => { const t = setTimeout(() => res(null), 4000); window.api.pickFromScene(a, b, (e, c) => { clearTimeout(t); res(e || !c ? null : {p: [c.position3D[0], c.position3D[1], c.position3D[2]], n: [c.normal[0], c.normal[1], c.normal[2]]}); }); });
const range = (a, b, n) => Array.from({length: n}, (_, i) => a + (b - a) * i / (n - 1));
const W = window.CAL || {};
// 1) extents
let xmin = 1, xmax = -1, ymin = 1, ymax = -1, zmax = -1;
for (const z of range(0.004, 0.045, 10)) {
  const rows = await Promise.all(range(-0.07, 0.07, 36).map(async y => [await pick([-0.3, y, z], [0.3, y, z]), await pick([0.3, y, z], [-0.3, y, z])]));
  for (const [a, b] of rows) { if (a) xmin = Math.min(xmin, a.p[0]); if (b) xmax = Math.max(xmax, b.p[0]); }
  const cols = await Promise.all(range(-0.06, 0.04, 26).map(async x => [await pick([x, -0.3, z], [x, 0.3, z]), await pick([x, 0.3, z], [x, -0.3, z])]));
  for (const [a, b] of cols) { if (a) ymin = Math.min(ymin, a.p[1]); if (b) ymax = Math.max(ymax, b.p[1]); }
}
for (const x of range(xmin, xmax, 30)) {
  const hits = await Promise.all(range(ymin, ymax, 30).map(y => pick([x, y, 0.3], [x, y, -0.3])));
  for (const h of hits) if (h) zmax = Math.max(zmax, h.p[2]);
}
const zmin = W.zmin ?? 0;
const cad = W.cad || {x: [-41.7, 41.7], y: [0, 51.8], z: [-62.4, 62.4]};
const toSF = (x, y, z) => [
  xmin + (x - cad.x[0]) / (cad.x[1] - cad.x[0]) * (xmax - xmin),
  ymax - (z - cad.z[0]) / (cad.z[1] - cad.z[0]) * (ymax - ymin),
  zmin + (y - cad.y[0]) / (cad.y[1] - cad.y[0]) * (zmax - zmin),
];
// 2) anchors: [id, cad x, cad y, cad z, mode]
const specs = W.specs || [
  ['left', -8, 0, -40, 'top'], ['right', 24, 0, -40, 'top'], ['middle', 9.6, 0, -43, 'top'], ['shift', 9.5, 0, -16.5, 'top'],
  ['forward', 0, 29.5, -4.5, 'side'], ['back', 0, 34, 8, 'side'], ['gesture', 0, 16, 6, 'side'],
];
const anchors = {};
for (const [id, x, y, z, mode] of specs) {
  const s = toSF(x, y, z);
  const hit = mode === 'top' ? await pick([s[0], s[1], 0.3], [s[0], s[1], -0.3]) : await pick([-0.3, s[1], s[2]], [0.3, s[1], s[2]]);
  anchors[id] = hit ? {p: hit.p.map((v, i) => +(v + hit.n[i] * 0.0025).toFixed(5)), n: hit.n.map(v => +v.toFixed(3))} : {p: s, n: null};
}
// 3) draw for a visual check (optionally from the same front-left view as the MX 3S default)
if (W.view) {
  const cam = await new Promise(r => window.api.getCameraLookAt((e, c) => r(c)));
  const t = cam.target, d = cam.position.map((v, i) => v - t[i]), radius = Math.hypot(...d);
  const dir = [-3.37, 3.63, 0.71], len = Math.hypot(...dir);
  await new Promise(r => window.api.setCameraLookAt(dir.map((v, i) => t[i] + v / len * radius), t, 0, r));
  await new Promise(r => setTimeout(r, 2500));
}
const f = document.getElementById('f');
for (const [id, a] of Object.entries(anchors)) {
  const c = await new Promise(r => window.api.getWorldToScreenCoordinates(a.p, r));
  const d = document.createElement('div');
  d.textContent = id;
  d.style.cssText = `position:absolute;left:${c.canvasCoord[0] / devicePixelRatio}px;top:${c.canvasCoord[1] / devicePixelRatio}px;transform:translate(-50%,-50%);background:#9fb0ff;color:#000;font:bold 12px sans-serif;padding:2px 5px;border-radius:9px;z-index:9`;
  document.body.append(d);
}
return {extents: {xmin, xmax, ymin, ymax, zmin, zmax}, size_mm: [(xmax - xmin) * 1000, (ymax - ymin) * 1000, (zmax - zmin) * 1000].map(v => +v.toFixed(1)), anchors};
