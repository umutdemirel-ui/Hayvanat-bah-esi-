// jsdom + sahte renderer ile istemci mantığını uçtan uca çalıştırır.
// WebGL yok; ama HUD, oyun döngüsü, olaylar, kamera, interpolasyon çalışır.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:3000/', pretendToBeVisual: true });
const { window } = dom;

// ---- tarayıcı ortamı taklidi -------------------------------------------------
const grad = { addColorStop() {} };
function ctx2d(canvas) {
  const target = { canvas, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', globalAlpha: 1, textAlign: '', textBaseline: '', lineCap: '' };
  return new Proxy(target, {
    get(t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
      if (p === 'measureText') return () => ({ width: 24 });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
  if (type === '2d') {
    if (!this.__ctx) this.__ctx = ctx2d(this);
    return this.__ctx;
  }
  return null;
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.AudioContext = class {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
  createOscillator() {
    return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, detune: { value: 0 }, connect() { return this; }, start() {}, stop() {} };
  }
  createBiquadFilter() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, connect() { return this; } }; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, connect() { return this; }, start() {} }; }
  resume() {}
};

const g = globalThis;
for (const key of ['window', 'document', 'navigator', 'location', 'localStorage', 'matchMedia', 'requestAnimationFrame',
  'cancelAnimationFrame', 'AudioContext', 'HTMLCanvasElement', 'HTMLMediaElement', 'getComputedStyle']) {
  if (key === 'window') { g.window = window; continue; }
  if (key === 'document') { g.document = window.document; continue; }
  if (key === 'location') { g.location = window.location; continue; }
  if (window[key] !== undefined) {
    try { g[key] = window[key]; } catch { /* salt-okunur global */ }
  }
}
g.self = window;

const THREE = await import('three');
const { Game } = await import('../src/game.js');
const { Hud } = await import('../src/hud.js');
const { Audio } = await import('../src/audio.js');
const { Input } = await import('../src/input.js');
const { SPECIES, COLORS, ANIMAL_SPAWNS, TOOLS, ROUND } = await import('../shared/config.js');

const hud = new Hud();
const audio = new Audio();
audio.init();
const net = { sent: [], send(o) { this.sent.push(o); return true; } };
const canvas = window.document.getElementById('scene');
const fakeRenderer = { render() {}, setSize() {}, setPixelRatio() {}, shadowMap: {}, domElement: canvas };
const game = new Game(canvas, hud, audio, net);
game.init({ renderer: fakeRenderer });
const input = new Input(canvas);
game.input = input;
input.enabled = true;

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));

// ---- sahte sunucu snapshot'ı ------------------------------------------------
let animalId = 100;
const animals = ANIMAL_SPAWNS.map((s) => ({
  id: animalId++, s: s.species, x: s.x, z: s.z, yaw: 0, cap: 0, mv: 1, ti: 1,
  sl: false, st: false, ea: false, lo: 0,
}));

function makeSnap(t) {
  return {
    t: 'state', time: t, tl: ROUND.time - t, phase: 'playing', host: 1,
    players: [
      {
        id: 1, n: 'Ali', c: 0, x: 0, z: 6, yaw: 0, hp: 100, d: 0, sc: 120, ch: { net: 0, dart: 3, bait: 2, trap: 1 },
        cd: {}, st: { stun: false, slow: false, net: false, slip: false, dizzy: false, deaf: false, netlock: false, mv: 1, sp: 0 },
        rv: 0, em: t > 1 && t < 3 ? 'Hahaha 😂' : null, cat: 1, as: 0, rev: 0,
      },
      {
        id: 2, n: 'Bekçi B', c: 1, x: 3, z: 5, yaw: 0, hp: 40, d: 1, sc: 60, ch: { net: 0, dart: 1, bait: 1, trap: 0 },
        cd: {}, st: { stun: false, slow: true, net: true, slip: false, dizzy: false, deaf: false, netlock: false, mv: 0, sp: 0 },
        rv: 0.4, em: null, cat: 0, as: 1, rev: 0,
      },
    ],
    animals,
    proj: [{ id: 900, k: 'net', x: 1, z: 2, sp: 1.2 }, { id: 901, k: 'dart', x: -1, z: 2, sp: 2 }],
    traps: [{ id: 950, x: 5, z: 5, o: 1 }],
    baits: [{ id: 960, x: 6, z: 2, o: 2 }],
    peels: [{ id: 970, x: -2, z: 4 }],
    bombs: [{ id: 980, x: 8, z: 8, f: 0.5 }],
    caught: 1,
  };
}

game.setMe(1);
hud.show();
game.startRound();
game.onSnapshot(makeSnap(0.1));

// ---- tüm olay türlerini tetikle --------------------------------------------
const evs = [
  { kind: 'netHit', animalId: 100, species: 'aslan', by: 1, x: 2, z: 2, gain: 26, capture: 26 },
  { kind: 'dartHit', animalId: 100, species: 'aslan', by: 1, x: 2, z: 2 },
  { kind: 'hit', id: 1, dmg: 38, cause: 'aslan', x: 0, z: 6 },
  { kind: 'attack', animalId: 100, species: 'aslan', target: 1, x: 1, z: 5 },
  { kind: 'catch', animalId: 101, species: 'kaplan', by: 2, byName: 'Bekçi B', points: 145, x: 3, z: 3, teamBonus: true },
  { kind: 'assist', id: 1, animalId: 101 },
  { kind: 'downed', id: 2, cause: 'goril' },
  { kind: 'revive', by: 1, target: 2 },
  { kind: 'selfRevive', id: 1 },
  { kind: 'rescue', penalty: 30 },
  { kind: 'trollNet', by: 2, target: 1, x: 0, z: 6 },
  { kind: 'trollTrap', by: 2, target: 1, x: 5, z: 5 },
  { kind: 'trollDart', by: 2, target: 1, x: 0, z: 6 },
  { kind: 'shove', by: 1, target: 2 },
  { kind: 'slip', id: 1, x: 0, z: 6 },
  { kind: 'baitSteal', by: 1, owner: 2, x: 6, z: 2 },
  { kind: 'monkeySteal', animalId: 105, target: 1, item: 'dart', x: 0, z: 6 },
  { kind: 'trapAnimal', animalId: 102, species: 'devekusu', x: 4, z: 4, by: 1 },
  { kind: 'trample', x: 5, z: 5, animalId: 106 },
  { kind: 'explode', x: 8, z: 8, by: 1 },
  { kind: 'eating', animalId: 103, species: 'fil', x: 9, z: 9 },
  { kind: 'hop', animalId: 108, x0: 1, z0: 1, x: 12, z: 12 },
  { kind: 'roar', animalId: 100, species: 'aslan', x: 2, z: 2 },
  { kind: 'venom', id: 1 },
  { kind: 'grab', id: 1, animalId: 102 },
  { kind: 'sfx', sfx: 'trap', x: 0, z: 0 },
  { kind: 'recharge', id: 1, tool: 'dart' },
  { kind: 'emote', id: 2, text: 'Yardım edin! 🆘' },
  { kind: 'join', id: 3, name: 'Yeni' },
  { kind: 'leave', id: 3, name: 'Yeni' },
];
game.onEvents(evs);

// ---- birkaç saniye oyun döngüsü --------------------------------------------
input.actions.push('net');
input.actions.push('dart');
input.actions.push('emote_haha');
input.keys.add('KeyW');
input.keys.add('ShiftLeft');
input.lookX = 40; input.lookY = 12;

let t = 0;
for (let i = 0; i < 240; i++) {
  t += 1 / 60;
  // hayvanlar hareket etsin, biri yakalanmış gibi silinsin
  if (i === 60) animals.splice(0, 1);
  for (const a of animals) { a.x += Math.sin(t + a.id) * 0.05; a.z += Math.cos(t * 0.7 + a.id) * 0.05; a.cap = (a.cap + 0.7) % 100; }
  if (i % 8 === 0) game.onSnapshot(makeSnap(t));
  game.update(1 / 60);
  if (i === 120) {
    // tur bitiş ekranı
    game.onEvents([{
      kind: 'end', win: true, reason: 'all-caught', caught: 10, total: 10, time: 123,
      rewards: [
        { id: 1, name: 'Ali', colorIdx: 0, score: 620, catches: 4, assists: 2, revives: 1, downed: 1, troll: 3, title: 'Trolün Kralı 😈' },
        { id: 2, name: 'Bekçi B', colorIdx: 1, score: 410, catches: 3, assists: 3, revives: 0, downed: 2, troll: 0, title: 'Büyük Avcı 🏆' },
      ],
      caughtList: [{ species: 'aslan', by: 1, byName: 'Ali', points: 120 }],
    }]);
  }
}

// ---- kontroller -------------------------------------------------------------
const q = (sel) => window.document.querySelector(sel);
const checks = [];
const check = (name, cond) => { checks.push({ name, ok: !!cond }); };
check('minimap çizildi', q('#minimap') !== null);
check('hayvan çipleri', q('#animalList').children.length > 0);
check('takım paneli', q('#teamPanel').children.length === 2);
check('araç slotları', q('#toolbar').children.length === 4 && q('#trollbar').children.length === 3);
check('akış mesajı', q('#feed').children.length > 0);
check('sahne mesh', game.scene.children.length > 0);
check('oyuncu modeli', game.players.size === 2);
check('hayvan modeli', game.animals.size === 9);
check('mermi modeli', game.projectiles.size === 2);
check('kapan/yem/muz/bomba', game.traps.size === 1 && game.baits.size === 1 && game.peels.size === 1 && game.bombs.size === 1);
check('sonuç ekranı', !q('#results').classList.contains('hidden'));
check('ağ paketleri', net.sent.length > 10);
check('oyun içi hata yok', errors.length === 0);

for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
if (errors.length) console.log('hatalar:', errors);
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `❌ ${failed} kontrol başarısız` : '✅ istemci entegrasyon testi geçti');
process.exit(failed ? 1 : 0);
