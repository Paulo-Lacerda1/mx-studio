import './vendor/sketchfab-viewer-1.12.1.js';

// The iframe receives no user input. Only camera commands cross the boundary.
// Keep at most one SDK instance per model: the SDK has no public destroy method.
//
// Button callouts: each model carries calibrated anchors in Sketchfab world space
// (metres, Z up) as [x, y, z, nx, ny, nz]. After every camera change they are projected
// with getWorldToScreenCoordinates and drawn in a sibling overlay (setMarkers).
export class ModelViewer {
  constructor(container) {
    this.container = container;
    this.models = new Map();
    this.pointers = new Map();
    this.markers = [];
    this.projection = 0;
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.project(true)).observe(container);
    container.tabIndex = 0;
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Modelo 3D. Arrasta ou usa as setas para rodar. Usa a roda ou as teclas mais e menos para aproximar.');
    container.addEventListener('selectstart', event => event.preventDefault());
    container.addEventListener('contextmenu', event => event.preventDefault());
    container.addEventListener('pointerdown', event => {
      if (!this.active?.camera || event.button !== 0) return;
      event.preventDefault();
      container.focus({preventScroll: true});
      container.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      this.press = {x: event.clientX, y: event.clientY, moved: false};
    });
    container.addEventListener('pointermove', event => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      event.preventDefault();
      const before = this.pinchDistance();
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      const after = this.pinchDistance();
      if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > 5) this.press.moved = true;
      if (before && after) this.zoom(before / after);
      else this.rotate((event.clientX - previous[0]) * -.006, (event.clientY - previous[1]) * .006);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      container.addEventListener(type, event => {
        if (type === 'pointerup' && this.press && !this.press.moved && this.pointers.size === 1) this.pickMarker(event);
        if (type !== 'lostpointercapture') this.press = null;
        this.pointers.delete(event.pointerId);
      });
    }
    container.addEventListener('wheel', event => {
      if (!this.active?.camera) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1;
      this.zoom(Math.exp(Math.max(-1, Math.min(1, event.deltaY * units * .001))));
    }, {passive: false});
    container.addEventListener('keydown', event => {
      if (!this.active?.camera) return;
      const arrows = {ArrowLeft: [.12, 0], ArrowRight: [-.12, 0], ArrowUp: [0, .12], ArrowDown: [0, -.12]};
      if (arrows[event.key]) this.rotate(...arrows[event.key]);
      else if (['+', '='].includes(event.key)) this.zoom(.85);
      else if (event.key === '-') this.zoom(1 / .85);
      else if (event.key === 'Home') this.reset();
      else return;
      event.preventDefault();
    });
  }

  pinchDistance() {
    const [a, b] = this.pointers.values();
    return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  }

  show(model, params) {
    this.hide();
    let entry = this.models.get(model.id);
    if (!entry) {
      const iframe = document.createElement('iframe');
      iframe.title = model.title;
      iframe.tabIndex = -1;
      iframe.inert = true;
      iframe.setAttribute('aria-hidden', 'true');
      // No popups, forms, modal dialogs, downloads, or navigation of the parent.
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('allow', 'autoplay');
      this.container.append(iframe);
      entry = {iframe, anchors: model.anchors || {}, view: model.view};
      this.models.set(model.id, entry);
      this.active = entry;
      entry.client = new window.Sketchfab(iframe);
      entry.client.init(model.id, {
        ...Object.fromEntries(new URLSearchParams(params)),
        success: api => {
          entry.api = api;
          api.addEventListener('viewerready', () => {
            api.setUserInteraction(false);
            api.getCameraLookAt((error, camera) => {
              if (error) return;
              const {position, target} = camera;
              const [x, y, z] = position.map((v, i) => v - target[i]);
              const radius = Math.hypot(x, y, z);
              if (!Number.isFinite(radius) || radius <= 0) return;
              entry.initial = {target: [...target], radius, yaw: Math.atan2(y, x), pitch: Math.asin(z / radius)};
              // Optional per-model starting direction, so every model opens on the same side.
              if (entry.view) {
                const [vx, vy, vz] = entry.view, length = Math.hypot(vx, vy, vz);
                Object.assign(entry.initial, {yaw: Math.atan2(vy, vx), pitch: Math.asin(vz / length)});
              }
              entry.camera = {...entry.initial};
              if (entry.view && this.active === entry) this.render();
              this.settleCamera(entry, api, camera);
              if (this.active === entry) { this.buildMarkers(); this.project(true); }
            });
            if (this.active !== entry) api.stop();
          });
          api.start();
        },
        error: error => console.warn('O visualizador 3D não respondeu.', error),
      });
    } else {
      this.active = entry;
      entry.iframe.hidden = false;
      entry.api?.start();
    }
    this.buildMarkers();
    this.project(true);
  }

  // Some models still animate the camera after viewerready. While the user has not moved it,
  // re-read the resting camera until two readings match (at most ~3 s).
  settleCamera(entry, api, previous, attempt = 0) {
    if (typeof setTimeout !== 'function' || attempt > 20) return;
    setTimeout(() => api.getCameraLookAt((error, camera) => {
      if (error || !camera || !entry.initial) return;
      const moved = camera.position.some((v, i) => Math.abs(v - previous.position[i]) > 1e-6);
      if (moved) return this.settleCamera(entry, api, camera, attempt + 1);
      const untouched = ['yaw', 'pitch', 'radius'].every(key => entry.camera[key] === entry.initial[key]);
      const radius = Math.hypot(...camera.position.map((v, i) => v - camera.target[i]));
      if (!untouched || !Number.isFinite(radius) || Math.abs(radius - entry.initial.radius) < 1e-9) return;
      Object.assign(entry.initial, {target: [...camera.target], radius});
      entry.camera = {...entry.initial};
      if (this.active === entry) this.render();
    }), 150);
  }

  hide() {
    this.pointers.clear();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.active) {
      this.active.api?.stop();
      this.active.iframe.hidden = true;
    }
    this.active = null;
    this.buildMarkers();
  }

  rotate(yaw, pitch) {
    const camera = this.active?.camera;
    if (!camera) return;
    camera.yaw += yaw;
    camera.pitch = Math.max(-Math.PI * .48, Math.min(Math.PI * .48, camera.pitch + pitch));
    this.render();
  }

  zoom(factor) {
    const entry = this.active;
    if (!entry?.camera) return;
    entry.camera.radius = Math.max(entry.initial.radius * .3, Math.min(entry.initial.radius * 3, entry.camera.radius * factor));
    this.render();
  }

  reset() {
    if (!this.active?.initial) return;
    this.active.camera = {...this.active.initial};
    this.render();
  }

  render() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const entry = this.active;
      if (!entry?.camera) return;
      const {target, radius, yaw, pitch} = entry.camera;
      const horizontal = radius * Math.cos(pitch);
      entry.api.setCameraLookAt([
        target[0] + horizontal * Math.cos(yaw),
        target[1] + horizontal * Math.sin(yaw),
        target[2] + radius * Math.sin(pitch),
      ], target, 0);
      if (!this.markers.length) return;
      this.project();
      // The camera applies on the viewer's next frame: settle the callouts once more.
      clearTimeout(this.settle);
      this.settle = setTimeout(() => this.project(true), 150);
    });
  }

  // buttons: [{id, label, number}] in list order; onSelect(id) when a callout is chosen.
  setMarkers(overlay, buttons, onSelect) {
    this.overlay = overlay;
    this.buttons = buttons;
    this.onSelect = onSelect;
    this.buildMarkers();
    this.project(true);
  }

  buildMarkers() {
    if (!this.overlay) return;
    const entry = this.active;
    this.overlay.replaceChildren();
    this.markers = [];
    if (!entry?.camera) return;
    for (const button of this.buttons || []) {
      const anchor = entry.anchors[button.id];
      if (!anchor) continue;
      const el = document.createElement('button');
      el.className = 'hotspot';
      el.textContent = button.number;
      el.title = button.label;
      el.hidden = true;
      el.setAttribute('aria-label', `Selecionar ${button.label}`);
      el.onclick = () => this.onSelect?.(button.id);
      this.overlay.append(el);
      this.markers.push({id: button.id, el, anchor, occluded: false});
    }
    this.select(this.selected);
  }

  select(id) {
    this.selected = id;
    for (const marker of this.markers) {
      marker.el.classList.toggle('selected', marker.id === id);
      marker.el.setAttribute('aria-pressed', marker.id === id);
    }
  }

  project(occlusion = false) {
    const entry = this.active;
    const api = entry?.api;
    if (!entry?.camera || !this.markers.length || typeof api?.getWorldToScreenCoordinates !== 'function') return;
    const request = ++this.projection;
    const {yaw, pitch} = entry.camera;
    const view = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
    const ratio = window.devicePixelRatio || 1;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    // The camera is far away, so view rays are nearly parallel: cast 30 cm towards the anchor
    // along the view direction; a hit well before the anchor means the mouse hides it.
    const hidden = marker => !occlusion || typeof api.pickFromScene !== 'function' ? Promise.resolve(marker.occluded) : new Promise(resolve => {
      const point = marker.anchor.slice(0, 3);
      const start = point.map((v, i) => v + view[i] * .3), end = point.map((v, i) => v - view[i] * .004);
      api.pickFromScene(start, end, (error, hit) => {
        const p = hit?.position3D;
        resolve(!error && p ? Math.hypot(p[0] - start[0], p[1] - start[1], p[2] - start[2]) < .297 : false);
      });
    });
    Promise.all(this.markers.map(marker => Promise.all([new Promise(resolve => {
      api.getWorldToScreenCoordinates(marker.anchor.slice(0, 3), coord => resolve(coord?.canvasCoord));
    }), hidden(marker)]))).then(results => {
      if (request !== this.projection || this.active !== entry) return;
      results.forEach(([point, occluded], index) => {
        const marker = this.markers[index], {el, anchor} = marker;
        marker.occluded = occluded;
        const facing = anchor[3] * view[0] + anchor[4] * view[1] + anchor[5] * view[2];
        const x = point?.[0] / ratio, y = point?.[1] / ratio;
        el.hidden = !point || occluded || facing < -.2 || !(x >= 12 && x <= width - 12 && y >= 12 && y <= height - 12);
        el.screen = [x, y];
      });
      // Nudge overlapping callouts apart (same rule as the local scene).
      const shown = this.markers.filter(m => !m.el.hidden).map(m => ({m, x: m.el.screen[0], y: m.el.screen[1]}));
      for (let pass = 0; pass < 8; pass++) {
        for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i], b = shown[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d >= 30) continue;
          const push = (30 - d) / 2, ux = d ? dx / d : 1, uy = d ? dy / d : 0;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
      }
      for (const {m, x, y} of shown) { m.el.style.left = x + 'px'; m.el.style.top = y + 'px'; }
    });
  }

  pickMarker(event) {
    if (!this.markers.length || !this.onSelect) return;
    const rect = this.container.getBoundingClientRect?.() || {left: 0, top: 0};
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    let best = null, distance = 48;
    for (const marker of this.markers) {
      if (marker.el.hidden || !marker.el.screen) continue;
      const d = Math.hypot(marker.el.screen[0] - x, marker.el.screen[1] - y);
      if (d < distance) { distance = d; best = marker; }
    }
    if (best) this.onSelect(best.id);
  }
}
