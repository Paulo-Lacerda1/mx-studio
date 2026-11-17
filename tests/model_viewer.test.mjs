import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/model-viewer.js', import.meta.url), 'utf8');

async function setup() {
  const instances = [], frames = new Map();
  let nextFrame = 0;
  class Element {
    constructor() { this.attributes = {}; this.events = {}; this.children = []; this.clientHeight = 500; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.events[name] = handler; }
    append(child) { this.children.push(child); }
    focus() {}
    setPointerCapture() {}
    dispatch(type, values = {}) {
      const event = {pointerId: 1, button: 0, clientX: 0, clientY: 0, preventDefault() {this.prevented = true}, ...values};
      this.events[type](event);
      return event;
    }
  }
  class Sketchfab {
    constructor(iframe) { this.iframe = iframe; instances.push(this); }
    init(id, options) { this.id = id; this.options = options; }
    ready() {
      const calls = this.calls = {start: 0, stop: 0, cameras: [], interaction: []};
      const listeners = {};
      this.options.success({
        addEventListener(name, callback) { listeners[name] = callback; },
        start() { calls.start++; }, stop() { calls.stop++; },
        setUserInteraction(enabled) { calls.interaction.push(enabled); },
        getCameraLookAt(callback) { callback(null, {position: [3, 4, 5], target: [0, 0, 0]}); },
        setCameraLookAt(position, target, duration) { calls.cameras.push({position, target, duration}); },
      });
      listeners.viewerready();
    }
  }
  const context = vm.createContext({
    window: {Sketchfab}, document: {createElement: () => new Element()}, URLSearchParams, console,
    requestAnimationFrame(callback) {frames.set(++nextFrame, callback); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
  });
  const module = new vm.SourceTextModule(source, {context});
  await module.link(() => new vm.SyntheticModule([], function () {}, {context}));
  await module.evaluate();
  const container = new Element();
  const viewer = new module.namespace.ModelViewer(container);
  const show = id => viewer.show({id, title: id}, 'autostart=1&ui_help=0');
  const flush = () => {const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());};
  return {viewer, container, instances, show, flush, frames};
}

test('isolates iframe input and excludes popup, navigation, form and modal permissions', async () => {
  const {container, instances, show} = await setup();
  show('mx3s');
  const iframe = container.children[0];
  assert.equal(iframe.tabIndex, -1);
  assert.equal(iframe.inert, true);
  assert.equal(iframe.attributes['aria-hidden'], 'true');
  assert.equal(iframe.attributes.sandbox, 'allow-scripts allow-same-origin');
  assert.equal(iframe.attributes.allow, 'autoplay');
  assert.equal(instances[0].options.ui_help, '0');
  assert.ok(container.dispatch('selectstart').prevented);
  assert.ok(container.dispatch('contextmenu').prevented);
});

test('clicks never select nodes; dragging and wheel only change the camera', async () => {
  const {container, instances, show, flush} = await setup();
  show('mx3s'); instances[0].ready();
  const calls = instances[0].calls;
  assert.deepEqual(calls.interaction, [false]);
  container.dispatch('pointerdown'); container.dispatch('pointerup'); flush();
  assert.equal(calls.cameras.length, 0);
  container.dispatch('pointerdown');
  container.dispatch('pointermove', {clientX: 30, clientY: 20});
  container.dispatch('pointerup'); flush();
  assert.equal(calls.cameras.length, 1);
  assert.ok(calls.cameras[0].position.every(Number.isFinite));
  assert.equal(calls.cameras[0].duration, 0);
  assert.ok(container.dispatch('wheel', {deltaY: 40, deltaMode: 0}).prevented);
  flush(); assert.equal(calls.cameras.length, 2);
});

test('supports pinch, keyboard, reset and bounded zoom', async () => {
  const {container, viewer, show, instances, flush} = await setup();
  show('mx4'); instances[0].ready();
  const initial = viewer.active.initial.radius;
  container.dispatch('pointerdown');
  container.dispatch('pointerdown', {pointerId: 2, clientX: 100});
  container.dispatch('pointermove', {pointerId: 2, clientX: 200}); flush();
  assert.ok(viewer.active.camera.radius < initial);
  assert.ok(container.dispatch('keydown', {key: 'ArrowRight'}).prevented); flush();
  viewer.zoom(1e10); assert.equal(viewer.active.camera.radius, initial * 3);
  viewer.zoom(1e-10); assert.equal(viewer.active.camera.radius, initial * .3);
  viewer.reset(); flush();
  instances[0].calls.cameras.at(-1).position.forEach((v, i) => assert.ok(Math.abs(v - [3, 4, 5][i]) < 1e-10));
});

test('switches models without duplicate SDK instances and stops hidden renderers', async () => {
  const {viewer, container, instances, show, flush, frames} = await setup();
  show('mx3s'); instances[0].ready();
  viewer.rotate(.1, .1); assert.equal(frames.size, 1);
  show('mx4'); assert.equal(frames.size, 0);
  assert.equal(container.children[0].hidden, true);
  assert.equal(instances[0].calls.stop, 1);
  instances[1].ready();
  show('mx3s'); assert.equal(instances.length, 2);
  assert.equal(container.children[0].hidden, false);
  assert.equal(container.children[1].hidden, true);
  assert.equal(instances[0].calls.start, 2);
  viewer.hide(); flush();
  assert.equal(viewer.active, null);
  assert.equal(viewer.pointers.size, 0);
});

test('late ready event cannot reactivate a hidden model', async () => {
  const {viewer, instances, show} = await setup();
  show('mx3s'); show('mx4');
  instances[0].ready();
  assert.equal(instances[0].calls.stop, 1);
  assert.equal(viewer.active, viewer.models.get('mx4'));
});
