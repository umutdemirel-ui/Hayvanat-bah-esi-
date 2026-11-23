// Node'da (tarayıcısız) 3D sahne kurulumunu test eder: API hatalarını yakalar.
function makeCtx() {
  const grad = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'measureText') return () => ({ width: 20 });
      if (prop === 'canvas') return target.canvas;
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, val) { target[prop] = val; return true; },
  };
  const target = {};
  return new Proxy(target, handler);
}

function makeCanvas() {
  const c = { width: 300, height: 150, style: {} };
  const ctx = makeCtx();
  ctx.canvas = c;
  c.getContext = () => ctx;
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  return c;
}

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return makeCanvas();
    return { style: {}, appendChild() {}, addEventListener() {} };
  },
  addEventListener() {},
  createElementNS() { return makeCanvas(); },
};
globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener() {},
  requestAnimationFrame() { return 0; },
};
globalThis.self = globalThis.window;

const THREE = await import('three');
const { createWorld } = await import('../src/world.js');
const { createAnimal, createRanger, createCage } = await import('../src/models.js');
const { SPECIES } = await import('../shared/config.js');

const scene = new THREE.Scene();
let t0 = Date.now();
const world = createWorld(scene);
console.log('dünya kuruldu:', Date.now() - t0, 'ms');
world.update(1.2);

let meshes = 0;
scene.traverse((o) => { if (o.isMesh) meshes++; });
console.log('sahnedeki mesh sayısı:', meshes);

for (const key of Object.keys(SPECIES)) {
  const api = createAnimal(key, SPECIES[key]);
  scene.add(api.group);
  for (const st of [{}, { eating: true }, { stuck: true }, { slowed: true, scared: true }]) {
    api.animate(1.3, true, { speed: 1.2, ...st });
  }
  const box = new THREE.Box3().setFromObject(api.group);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.x) || size.x <= 0) throw new Error(`${key}: geçersiz boyut`);
  console.log(` ${SPECIES[key].emoji} ${SPECIES[key].name.padEnd(12)} boyut ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}`);
}

for (const color of [0xff5d5d, 0x4fa8ff]) {
  const r = createRanger(color);
  scene.add(r.group);
  r.animate(1, true, 1);
  r.downed = true;
  r.animate(2, false, 1);
}
scene.add(createCage());

const box = new THREE.Box3().setFromObject(scene);
console.log('tüm sahne:', box.min.toArray().map((n) => n.toFixed(1)).join(','), '→', box.max.toArray().map((n) => n.toFixed(1)).join(','));
console.log('✅ 3D kurulum testi geçti');
