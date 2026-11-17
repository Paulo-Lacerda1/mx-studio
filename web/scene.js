import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

/*
 * Procedural MX Master model, built in millimetres from the published dimensions:
 *   MX Master 3 / 3S: 124.9 × 84.3 × 51 mm
 *   MX Master 4:      128.2 × 88.4 × 50.8 mm
 * Coordinates: x → right, y → up, z → back (the front of the mouse is at negative z).
 * The shell is a loft of superellipse sections over the real top-view outline. The
 * left/right click plates, the wheel slot and the seams are drawn in the shader so
 * the joints stay crisp at every zoom level.
 */

const MM = 1 / 30;
const SLOT = {z: -38, halfX: 5.4, halfZ: 12.5, radius: 4};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FINISHES = {
  graphite: {
    body: 0x393c40, bodyRough: .6, rest: 0x2a2c2f, base: 0x1b1d1f, side: 0x46494d,
    thumbWheel: 0x4b4f53, steel: 0x9aa0a6, shift: 0x2a2c2f, logo: '#8d9196', panel: 0x2f3134,
  },
  pale: {
    body: 0xb4b4ae, bodyRough: .6, rest: 0xa6a6a0, base: 0x86877f, side: 0xaaaaa4,
    thumbWheel: 0x9a9c9a, steel: 0xaeb3b8, shift: 0x7d7e79, logo: '#8c8d87', panel: 0xa3a39d,
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.min(1, Math.max(0, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Smooth 1D interpolation through [x, y] samples (cubic Hermite, Catmull-Rom tangents).
function curve1(table) {
  return x => {
    if (x <= table[0][0]) return table[0][1];
    const last = table.length - 1;
    if (x >= table[last][0]) return table[last][1];
    let i = 0;
    while (table[i + 1][0] < x) i++;
    const [x0, y0] = table[i], [x1, y1] = table[i + 1];
    const slope = k => {
      const a = table[Math.max(0, k - 1)], b = table[Math.min(last, k + 1)];
      return (b[1] - a[1]) / (b[0] - a[0]);
    };
    const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * slope(i)
      + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * slope(i + 1);
  };
}

function outline(points, count) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  return curve.getSpacedPoints(count).slice(0, count);
}

// Top-view outlines (mm), measured against product photography at 1:1 scale.
const BODY_OUTLINE = [
  [-16, -60], [-6, -62.4], [8, -62], [20, -59], [28, -52], [33, -40], [36, -24], [37.3, -6],
  [36.8, 12], [34.3, 30], [29, 44], [21, 55], [11, 61.5], [0, 62.5], [-11, 61], [-20, 55],
  [-25.5, 45], [-28.2, 32], [-28.6, 18], [-27.9, 4], [-27.6, -10], [-27.6, -25], [-25, -40], [-21, -53],
];
const REST_OUTLINE = [
  [-22, -12], [-27, -19], [-33.5, -19.5], [-40, -13], [-45, -2], [-47.2, 10], [-47.4, 22], [-45.6, 34],
  [-40.5, 44.5], [-32, 51.5], [-23, 53], [-19, 40], [-20, 15], [-21, 0],
];

// Crown height along the length, measured on the side profile (front at -62 mm).
const crown = curve1([[-63, 22], [-50, 30.5], [-30, 39.5], [-8, 46.5], [12, 50.3], [28, 48], [44, 40], [56, 29], [63, 18]]);

function bodyHeight(x, z) {
  const ridge = lerp(-2, -7, (z + 62) / 125);
  const dx = x - ridge;
  const fall = dx > 0 ? 1 - .42 * Math.pow(dx / 40, 2.1) : 1 - .16 * Math.pow(-dx / 26, 2.4);
  return crown(z) * fall;
}

function restHeight(x, z, r = 0) {
  let h = 13.2 + .17 * (x + 48) + 9 * Math.pow(smooth(-33, -22, x), 1.6); // climbs into the body wall
  h += 2.1 * smooth(.6, .96, r) * clamp01((-30 - x) / 10); // raised outer lip of the thumb scoop
  h *= 1 - .3 * smooth(2, -19, z);
  h *= 1 - .16 * smooth(40, 54, z);
  return h;
}

/*
 * Loft a closed outline into a dome. Each ring is a superellipse section:
 * horizontal = cos(φ)^(2/n), vertical = sin(φ)^(2/n); the exponent n shapes the wall.
 */
function loft({points, center: [cx, cz], height, exponent, bulge = () => 0, base = 0, rings = 96}) {
  const count = points.length, position = [], uv = [], phi = [], index = [];
  for (let j = 0; j < rings; j++) {
    const t = j / rings, angle = t * Math.PI / 2;
    const c = Math.max(0, Math.cos(angle)), s = Math.sin(angle);
    for (const p of points) {
      const n = exponent(p);
      const v = Math.pow(s, 2 / n);
      const r = Math.pow(c, 2 / n) * (1 + bulge(p) * Math.sin(Math.PI * v));
      const x = cx + (p.x - cx) * r, z = cz + (p.z - cz) * r;
      position.push(x, base + (height(x, z, r) - base) * v, z);
      uv.push(x / 36, z / 36);
      phi.push(t);
    }
  }
  const top = position.length / 3;
  position.push(cx, height(cx, cz, 0), cz);
  uv.push(cx / 36, cz / 36);
  phi.push(1);
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < count; i++) {
      const a = j * count + i, b = j * count + (i + 1) % count;
      if (j === rings - 1) { index.push(a, b, top); continue; }
      const c = a + count, d = b + count;
      index.push(a, b, d, a, d, c);
    }
  }
  // Keep normals pointing outward regardless of the outline direction.
  const p = i => new THREE.Vector3(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
  const normal = new THREE.Vector3().crossVectors(p(1).sub(p(0)), p(count + 1).sub(p(0)));
  const outward = new THREE.Vector3(points[0].x - cx, 0, points[0].z - cz);
  if (normal.dot(outward) < 0) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aPhi', new THREE.Float32BufferAttribute(phi, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedPlate(width, length, radius, depth, bevel) {
  const w = width / 2 - bevel, l = length / 2 - bevel, r = Math.min(radius, w, l);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -l);
  shape.lineTo(w - r, -l); shape.quadraticCurveTo(w, -l, w, -l + r);
  shape.lineTo(w, l - r); shape.quadraticCurveTo(w, l, w - r, l);
  shape.lineTo(-w + r, l); shape.quadraticCurveTo(-w, l, -w, l - r);
  shape.lineTo(-w, -l + r); shape.quadraticCurveTo(-w, -l, -w + r, -l);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 10});
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// A ribbed wheel: radial grooves cut into the rim (axis = local y).
function ribbedWheel(radius, width, ribs, depth, segments = 384) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, segments, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), r = Math.hypot(x, z);
    if (r < radius - .01) continue;
    const a = Math.atan2(z, x);
    const groove = Math.pow(.5 + .5 * Math.cos(a * ribs), 4);
    const rr = radius - depth * groove;
    position.setXYZ(i, Math.cos(a) * rr, position.getY(i), Math.sin(a) * rr);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function dotTexture(size, count) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#5c5c5c';
  const step = size / count;
  for (let y = 0; y < count; y++) for (let x = 0; x <= count; x++) {
    ctx.beginPath();
    ctx.arc((x + (y % 2) * .5) * step, (y + .5) * step, step * .24, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function noiseTexture(size, contrast, dots = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (Math.random() - .5) * contrast;
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  if (dots) {
    ctx.fillStyle = '#000';
    const step = size / dots;
    for (let y = 0; y < dots; y++) for (let x = 0; x < dots; x++) {
      ctx.beginPath();
      ctx.arc((x + (y % 2) * .5) * step, (y + .5) * step, step * .26, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(0,0,0,.62)');
  gradient.addColorStop(.55, 'rgba(0,0,0,.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

// Region rules shared by the shader and the picking code.
function slotDistance(x, z) {
  const qx = Math.abs(x) - SLOT.halfX + SLOT.radius, qz = Math.abs(z - SLOT.z) - SLOT.halfZ + SLOT.radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - SLOT.radius;
}
function shellRegion(x, z, phi) {
  if (slotDistance(x, z) < 0 && phi > .6) return 'middle';
  const rear = -14 + .0055 * x * x;
  const side = x > 0 ? .3 : .48;
  if (phi > side && z < rear) return x < 0 ? 'left' : 'right';
  return null;
}

const SHELL_GLSL = /* glsl */`
uniform float uSel;
uniform float uHover;
uniform vec3 uAccent;
varying float vPhi;
varying vec3 vLocal;
float slotSd(vec2 p) {
  vec2 q = abs(p - vec2(0.0, ${SLOT.z.toFixed(1)})) - vec2(${SLOT.halfX}, ${SLOT.halfZ.toFixed(1)}) + ${SLOT.radius.toFixed(1)};
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${SLOT.radius.toFixed(1)};
}
float seamMm(float f) {
  float w = fwidth(f);
  float hw = max(0.28, 0.65 * w);
  return 1.0 - smoothstep(hw, hw + w, abs(f));
}
float shellSlot;
float shellSeam;
float shellRegionId;
void shellRegions() {
  float rear = -14.0 + 0.0055 * vLocal.x * vLocal.x;
  float side = vLocal.x > 0.0 ? 0.3 : 0.48;
  float onTop = step(side, vPhi) * step(vLocal.z, rear);
  float slot = slotSd(vLocal.xz);
  float outsideSlot = step(0.0, slot);
  shellRegionId = onTop * outsideSlot * (vLocal.x < 0.0 ? 1.0 : 2.0);
  float sideSeam = (1.0 - smoothstep(0.6, 1.5, abs(vPhi - side) / max(fwidth(vPhi), 1e-6))) * step(vLocal.z, rear);
  float rearSeam = seamMm(vLocal.z - rear) * step(side, vPhi);
  float centerSeam = seamMm(vLocal.x) * onTop * outsideSlot;
  shellSeam = max(max(sideSeam, rearSeam), centerSeam);
  float w = fwidth(slot);
  shellSlot = (1.0 - smoothstep(-w, w, slot)) * step(0.6, vPhi);
}
`;

export class MouseScene {
  constructor(container, overlays, onSelect) {
    this.container = container; this.overlays = overlays; this.onSelect = onSelect;
    this.finish = 'graphite';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.append(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.scene.environmentIntensity = .7;
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !reducedMotion;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.2; this.controls.maxDistance = 14;
    this.controls.minPolarAngle = .04; this.controls.maxPolarAngle = Math.PI * .47;
    this.controls.target.set(-.1, .6, 0);

    const key = new THREE.DirectionalLight(0xfff6ec, 2.6);
    key.position.set(-4, 9, -3); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 25});
    key.shadow.normalBias = .02; key.shadow.radius = 6;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 1.6); rim.position.set(5, 3, 6); this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({color: 0x000000, opacity: .28}));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.6), new THREE.MeshBasicMaterial({map: contactShadow(), transparent: true, depthWrite: false, opacity: .9}));
    contact.rotation.x = -Math.PI / 2; contact.position.set(-.15, .003, 0); this.scene.add(contact);

    this.textures = {grain: noiseTexture(256, 26), fine: noiseTexture(256, 60), dots: dotTexture(256, 12)};
    this.textures.grain.repeat.set(3, 3);
    this.textures.fine.repeat.set(5, 5);

    this.group = new THREE.Group(); this.scene.add(this.group);
    this.targets = {}; this.markers = []; this.disposables = [];
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', e => { this.down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', e => {
      if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5) return;
      const id = this.pick(e);
      if (id) this.onSelect(id);
    });
    canvas.addEventListener('pointermove', e => {
      if (e.buttons) return;
      this.pendingHover = e;
      if (this.hoverFrame) return;
      this.hoverFrame = requestAnimationFrame(() => { this.hoverFrame = null; this.hover(this.pick(this.pendingHover)); });
    });
    canvas.addEventListener('pointerleave', () => this.hover(null));
    this.controls.addEventListener('change', () => this.requestRender());
    this.setView('perspective', true);
    this.resize();
  }

  requestRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (!this.width || !this.height) return;
      const animating = this.tween && this.stepTween();
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.positionMarkers();
      if (animating || moving) this.requestRender();
    });
  }

  resize() {
    const {width, height} = this.container.getBoundingClientRect();
    this.width = width; this.height = height;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.fov = this.camera.aspect < .8 ? 46 : this.camera.aspect < 1.1 ? 38 : 30;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.requestRender();
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.group.children, true)[0];
    if (!hit) return null;
    if (hit.object === this.shell) {
      const local = hit.object.worldToLocal(hit.point.clone());
      const phi = hit.object.geometry.attributes.aPhi;
      const pos = hit.object.geometry.attributes.position;
      const [a, b, c] = [hit.face.a, hit.face.b, hit.face.c].map(i => new THREE.Vector3().fromBufferAttribute(pos, i));
      const bary = THREE.Triangle.getBarycoord(local, a, b, c, new THREE.Vector3());
      const value = phi.getX(hit.face.a) * bary.x + phi.getX(hit.face.b) * bary.y + phi.getX(hit.face.c) * bary.z;
      const region = shellRegion(local.x, local.z, value);
      return this.available.has(region) ? region : null;
    }
    const id = hit.object.userData.button;
    return id && this.available.has(id) ? id : null;
  }

  hover(id) {
    if (this.hovered === id) return;
    this.hovered = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.paint();
  }

  physical(color, options = {}) {
    const material = new THREE.MeshPhysicalMaterial({color, roughness: .55, metalness: 0, ...options});
    this.disposables.push(material);
    return material;
  }

  part(geometry, material, button = null) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (button) { mesh.userData.button = button; (this.targets[button] ??= []).push(mesh); }
    this.model.add(mesh);
    this.disposables.push(geometry);
    return mesh;
  }

  // Cast onto the shell to place details exactly on the surface.
  surface(origin, direction) {
    this.raycaster.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());
    const hit = this.raycaster.intersectObject(this.shell, false)[0];
    if (!hit) return null;
    return {point: hit.point.clone(), normal: hit.face.normal.clone()};
  }
  top(x, z) { return this.surface([x, 200, z], [0, -1, 0]); }
  wall(y, z) { return this.surface([-200, y, z], [1, 0, 0]); }

  orient(mesh, point, normal, offset = 0) {
    const forward = new THREE.Vector3(0, 0, -1).addScaledVector(normal, normal.z);
    forward.normalize();
    const x = new THREE.Vector3().crossVectors(forward, normal);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, forward, normal));
    mesh.position.copy(point).addScaledVector(normal, offset);
    return mesh;
  }

  clear() {
    for (const item of this.disposables) item.dispose();
    this.disposables = [];
    if (this.model) this.group.remove(this.model);
    this.targets = {}; this.markers = []; this.overlays.replaceChildren();
  }

  build(model, buttons) {
    this.clear();
    this.modelId = model;
    this.buttons = buttons;
    this.available = new Set(buttons.map(b => b.id));
    const mx4 = model === 'mx4';
    const f = FINISHES[this.finish];
    this.model = new THREE.Group();
    this.group.add(this.model);

    // Shell with click plates and slot drawn in the shader.
    const shellGeometry = loft({
      points: outline(BODY_OUTLINE, 256), center: [-3, 6], base: 2.4, height: bodyHeight,
      exponent: p => 2.5 + 2.6 * Math.pow(clamp01(-(p.x + 3) / 26), 2) + .4 * clamp01(-p.z / 60),
      bulge: p => .035 * clamp01((p.x + 5) / 30) + .025 * clamp01(p.z / 60),
    });
    const shellMaterial = this.physical(f.body, {
      roughness: mx4 ? f.bodyRough - .06 : f.bodyRough, roughnessMap: this.textures.grain,
      bumpMap: this.textures.grain, bumpScale: .1, clearcoat: mx4 ? .12 : 0, clearcoatRoughness: .6,
    });
    this.shellUniforms = {uSel: {value: 0}, uHover: {value: 0}, uAccent: {value: new THREE.Color(0x3a5cff)}};
    shellMaterial.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.shellUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhi;\nvarying float vPhi;\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPhi = aPhi;\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SHELL_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          shellRegions();
          float shellPick = step(0.5, shellRegionId) * (1.0 - step(0.5, abs(shellRegionId - uSel)));
          float shellOver = step(0.5, shellRegionId) * (1.0 - step(0.5, abs(shellRegionId - uHover)));
          diffuseColor.rgb = mix(diffuseColor.rgb, uAccent * 0.5 + diffuseColor.rgb * 0.5, shellPick * 0.45);
          diffuseColor.rgb *= 1.0 - 0.72 * shellSeam;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), shellSlot);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, shellSlot);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uAccent * (shellPick * 0.1 + shellOver * 0.05);');
    };
    shellMaterial.customProgramCacheKey = () => 'mx-shell';
    this.shell = this.part(shellGeometry, shellMaterial);
    this.model.updateMatrixWorld(true);

    // Base plate (darker bottom shell with a small lip).
    const baseMaterial = this.physical(f.base, {roughness: .8});
    for (const points of [BODY_OUTLINE, REST_OUTLINE]) {
      const shape = new THREE.Shape(outline(points, 128).map(p => new THREE.Vector2(p.x * .985, -p.z * .985)));
      const geometry = new THREE.ExtrudeGeometry(shape, {depth: 2, bevelEnabled: true, bevelThickness: .7, bevelSize: .7, bevelSegments: 4, curveSegments: 48});
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, .7, 0);
      this.part(geometry, baseMaterial);
    }

    // Thumb rest: the gesture button on MX 3/3S, a plain support with a haptic panel on MX 4.
    const restMaterial = this.physical(mx4 ? f.body : f.rest, {
      roughness: mx4 ? f.bodyRough : .82, roughnessMap: this.textures.fine, bumpMap: this.textures.fine, bumpScale: mx4 ? .1 : .35,
    });
    this.part(loft({
      points: outline(REST_OUTLINE, 160), center: [-34, 18], base: 2.2, rings: 64, height: restHeight,
      exponent: p => 2.2 + 1.2 * clamp01((p.x + 30) / 8),
    }), restMaterial, mx4 ? null : 'gesture');

    if (mx4) {
      const panel = new THREE.SphereGeometry(1, 64, 32);
      const pos = panel.attributes.position, uv = panel.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) * 9.5, Math.max(pos.getY(i), -.2) * .7, pos.getZ(i) * 16);
        uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
      }
      panel.computeVertexNormals();
      const dots = this.textures.dots;
      const mesh = this.part(panel, this.physical(f.panel, {roughness: .8, map: dots, bumpMap: dots, bumpScale: -1.5}), 'thumb');
      const px = -36.5, pz = 21;
      mesh.position.set(px, restHeight(px, pz, .3) - .05, pz);
      mesh.rotation.z = -Math.atan(.17);
    }

    // MagSpeed wheel in its slot.
    const slotTop = this.top(0, SLOT.z);
    const steel = this.physical(f.steel, {metalness: 1, roughness: .32, clearcoat: .2});
    const wheel = this.part(ribbedWheel(11.6, 7.4, 110, .32), steel, 'middle');
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, slotTop.point.y + 4.6 - 11.6, SLOT.z);

    // Mode-shift button behind the wheel.
    const shiftAt = this.top(0, -19.5);
    this.part(roundedPlate(6.2, 8.4, 2.6, .7, .7), this.physical(f.shift, {roughness: .32, clearcoat: .5}), 'shift');
    this.orient(this.targets.shift[0], shiftAt.point, shiftAt.normal, .35);

    // Thumb wheel: a horizontal roller embedded in the left wall.
    const wheelAt = this.wall(32.5, mx4 ? -21 : -23);
    const axis = new THREE.Vector3(0, 1, 0).addScaledVector(wheelAt.normal, -wheelAt.normal.y).normalize();
    const basis = new THREE.Matrix4().makeBasis(wheelAt.normal, axis, new THREE.Vector3().crossVectors(wheelAt.normal, axis));
    const housing = this.part(new THREE.CylinderGeometry(12.6, 12.6, 10.2, 96), this.physical(0x111213, {roughness: .7}));
    housing.quaternion.setFromRotationMatrix(basis);
    housing.position.copy(wheelAt.point).addScaledVector(wheelAt.normal, 2 - 12.6);
    const thumbWheel = this.part(ribbedWheel(12, 7.6, 46, .55, 368), this.physical(f.thumbWheel, {metalness: .55, roughness: .38}));
    thumbWheel.quaternion.setFromRotationMatrix(basis);
    thumbWheel.position.copy(wheelAt.point).addScaledVector(wheelAt.normal, 3.8 - 12);

    // Side buttons below the thumb wheel; on MX 4 the gesture button joins the row in front.
    const sideMaterial = () => this.physical(f.side, {roughness: .4, clearcoat: .35});
    const sideButton = (id, z, length) => {
      const at = this.wall(23.2, z);
      const mesh = this.part(roundedPlate(5.2, length, 2.5, .9, .8), sideMaterial(), id);
      this.orient(mesh, at.point, at.normal, .25);
      return at;
    };
    const anchors = {};
    if (mx4) anchors.gesture = sideButton('gesture', -35, 6.4);
    anchors.forward = sideButton('forward', mx4 ? -24.5 : -27, 11);
    anchors.back = sideButton('back', mx4 ? -12 : -13.5, 11);

    // Battery LED, USB-C port and palm logo.
    const led = this.wall(18.5, mx4 ? -44 : -40);
    if (led) {
      const mesh = this.part(new THREE.CircleGeometry(.75, 24), new THREE.MeshStandardMaterial({color: 0x9effc4, emissive: 0x4fe08f, emissiveIntensity: .8}));
      this.orient(mesh, led.point, led.normal, .08);
      this.disposables.push(mesh.material);
    }
    const port = this.surface([2, 9.5, -200], [0, 0, 1]);
    if (port) {
      const mesh = this.part(roundedPlate(9, 3.4, 1.6, .2, .2), this.physical(0x060606, {roughness: .9}));
      mesh.position.copy(port.point).addScaledVector(port.normal, .05);
      mesh.lookAt(mesh.position.clone().add(port.normal));
    }
    const logoAt = this.top(-3, 37);
    if (logoAt) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = f.logo; ctx.font = '600 72px "Ubuntu Sans", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('logi', 128, 64);
      const texture = new THREE.CanvasTexture(canvas); texture.anisotropy = 4; this.disposables.push(texture);
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), new THREE.MeshStandardMaterial({map: texture, transparent: true, roughness: .4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2}));
      this.disposables.push(decal.geometry, decal.material);
      const forward = new THREE.Vector3(0, 0, -1);
      decal.position.copy(logoAt.point).addScaledVector(logoAt.normal, .15);
      decal.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), forward.clone().addScaledVector(logoAt.normal, logoAt.normal.z).normalize(), logoAt.normal));
      this.model.add(decal);
    }

    // Callout anchors (model mm, slightly above the surface).
    const lift = (hit, amount) => hit.point.clone().addScaledVector(hit.normal, amount);
    const leftTop = this.top(-15, -46), rightTop = this.top(17, -44);
    const points = {
      left: lift(leftTop, 2), right: lift(rightTop, 2),
      middle: new THREE.Vector3(0, wheel.position.y + 11.6 + 1.5, SLOT.z),
      shift: lift(shiftAt, 2.5),
      back: lift(anchors.back, 3), forward: lift(anchors.forward, 3),
      gesture: mx4 ? lift(anchors.gesture, 3) : new THREE.Vector3(-36, restHeight(-36, -6, .3) + 2, -6),
      thumb: new THREE.Vector3(-37, restHeight(-37, 21, .3) + 3, 21),
    };
    // Real proportions per model.
    const scale = mx4 ? [88.4 / 84.3, 50.8 / 51, 128.2 / 124.9] : [1, 1, 1];
    this.model.scale.set(scale[0] * MM, scale[1] * MM, scale[2] * MM);
    this.model.position.set(.05, 0, 0);
    this.model.updateMatrixWorld(true);

    buttons.forEach((button, index) => {
      const el = document.createElement('button');
      const leader = document.createElement('span');
      leader.className = 'hotspot-leader';
      leader.setAttribute('aria-hidden', 'true');
      leader.hidden = true;
      el.className = 'hotspot';
      el.textContent = index + 1;
      el.title = button.label;
      el.setAttribute('aria-label', `Selecionar ${button.label}`);
      el.onclick = () => this.onSelect(button.id);
      el.onpointerenter = () => this.hover(button.id);
      el.onpointerleave = () => this.hover(null);
      this.overlays.append(leader, el);
      const world = points[button.id].clone().applyMatrix4(this.model.matrixWorld);
      this.markers.push({id: button.id, el, leader, position: world});
    });
    this.select(this.selected || 'gesture');
  }

  setFinish(name) {
    if (!FINISHES[name] || name === this.finish) return;
    this.finish = name;
    if (this.modelId) this.build(this.modelId, this.buttons);
  }

  select(id) {
    this.selected = id;
    this.paint();
    for (const marker of this.markers) {
      const selected = marker.id === id;
      marker.el.classList.toggle('selected', selected);
      marker.el.setAttribute('aria-pressed', selected);
    }
  }

  paint() {
    const regionId = {left: 1, right: 2};
    if (this.shellUniforms) {
      this.shellUniforms.uSel.value = regionId[this.selected] || 0;
      this.shellUniforms.uHover.value = regionId[this.hovered] || 0;
    }
    for (const [key, meshes] of Object.entries(this.targets)) {
      const glow = key === this.selected ? .13 : key === this.hovered ? .06 : 0;
      for (const mesh of meshes) {
        mesh.material.emissive.set(glow ? 0x3a5cff : 0x000000);
        mesh.material.emissiveIntensity = glow;
      }
    }
    for (const marker of this.markers) marker.el.classList.toggle('hovered', marker.id === this.hovered);
    this.requestRender();
  }

  positionMarkers() {
    const visible = [];
    for (const marker of this.markers) {
      const point = marker.position.clone().project(this.camera);
      marker.el.hidden = point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      marker.leader.hidden = true;
      if (marker.el.hidden) continue;
      const anchorX = (point.x * .5 + .5) * this.width;
      const anchorY = (-point.y * .5 + .5) * this.height;
      visible.push({marker, anchorX, anchorY, x: anchorX, y: anchorY});
    }

    // Separate nearby markers while keeping their projected button positions as anchors.
    const spacing = 34;
    for (let pass = 0; pass < 12; pass++) {
      for (const [index, first] of visible.entries()) {
        for (const next of visible.slice(index + 1)) {
          const dx = next.x - first.x, dy = next.y - first.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= spacing) continue;
          const push = (spacing - distance) / 2;
          const x = distance ? dx / distance * push : push;
          const y = distance ? dy / distance * push : 0;
          first.x -= x; first.y -= y; next.x += x; next.y += y;
        }
      }
    }

    for (const {marker, anchorX, anchorY, x, y} of visible) {
      const centerX = THREE.MathUtils.clamp(x, 16, this.width - 16);
      const centerY = THREE.MathUtils.clamp(y, 16, this.height - 16);
      marker.el.style.left = centerX + 'px';
      marker.el.style.top = centerY + 'px';
      const dx = centerX - anchorX, dy = centerY - anchorY;
      const length = Math.hypot(dx, dy);
      if (length < 12) continue;
      marker.leader.hidden = false;
      marker.leader.style.left = anchorX + 'px';
      marker.leader.style.top = anchorY + 'px';
      marker.leader.style.width = length + 'px';
      marker.leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    }
  }

  stepTween() {
    const t = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
    const e = 1 - Math.pow(1 - t, 3);
    this.camera.position.lerpVectors(this.tween.from, this.tween.to, e);
    if (t >= 1) this.tween = null;
    return Boolean(this.tween);
  }

  setView(view, instant = false) {
    const views = {perspective: [-5.2, 4.1, -6.3], top: [-.1, 9.4, .01], side: [-9.4, 2.4, .4]};
    const to = new THREE.Vector3(...views[view]);
    this.controls.target.set(-.1, .75, 0);
    if (instant || reducedMotion) {
      this.tween = null;
      this.camera.position.copy(to);
    } else {
      this.tween = {from: this.camera.position.clone(), to, start: performance.now(), duration: 650};
    }
    this.controls.update();
    this.requestRender();
  }
}
