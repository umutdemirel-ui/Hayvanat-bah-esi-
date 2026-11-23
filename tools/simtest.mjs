// Sunucu duman testi: oda kur, turu başlat, otomatik oyna, sonuçları yazdır.
// kullanım: node tools/simtest.mjs [saniye]
import WebSocket from 'ws';

const SECONDS = Number(process.argv[2] || 45);
const url = 'ws://127.0.0.1:3000/ws';

const ws = new WebSocket(url);
const state = { id: null, room: null, snap: null, events: [], catches: [], ended: null, errors: [] };
let me = { x: 0, z: 6, yaw: Math.PI };
let lastAct = 0;
let lastAct2 = 0;
let lastAct3 = 0;

const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

ws.on('open', () => send({ t: 'create', name: 'TestBot' }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'joined') {
    state.id = m.id;
    state.room = m.room;
    console.log('katıldı', m.room, m.id);
    setTimeout(() => send({ t: 'start' }), 300);
  }
  if (m.t === 'lobby' && m.phase === 'playing') console.log('tur başladı');
  if (m.t === 'error') state.errors.push(m.msg);
  if (m.t === 'state') state.snap = m;
  if (m.t === 'events') {
    for (const e of m.list) {
      state.events.push(e);
      if (e.kind === 'catch') state.catches.push(e);
      if (e.kind === 'end') state.ended = e;
      if (e.kind === 'attack') console.log('saldırı!', e.species, '→', e.target);
    }
  }
});

// basit bot: en yakın hayvana yürü, yaklaşınca ağ at
const aiTick = setInterval(() => {
  const snap = state.snap;
  if (!snap || snap.phase !== 'playing' || !state.id) return;
  const meSnap = snap.players.find((p) => p.id === state.id);
  if (!meSnap) return;
  me = { x: meSnap.x, z: meSnap.z, yaw: meSnap.yaw };
  if (meSnap.d) return;

  let target = null; let bd = 1e9;
  for (const a of snap.animals) {
    const d = Math.hypot(a.x - me.x, a.z - me.z);
    if (d < bd) { bd = d; target = a; }
  }
  if (!target) return;
  const ang = Math.atan2(target.x - me.x, target.z - me.z);
  const step = 0.28;
  const nx = me.x + Math.sin(ang) * step;
  const nz = me.z + Math.cos(ang) * step;
  send({ t: 'move', x: nx, z: nz, yaw: ang, mv: 1, sp: 1 });
  me.x = nx; me.z = nz; me.yaw = ang;

  const now = Date.now();
  if (meSnap.hp < 45) {
    // geri çekil
    const away = ang + Math.PI;
    send({ t: 'move', x: me.x + Math.sin(away) * 0.3, z: me.z + Math.cos(away) * 0.3, yaw: ang, mv: 1, sp: 1 });
    return;
  }
  if (bd < 11 && now - lastAct > 300) {
    lastAct = now;
    send({ t: 'act', tool: 'net', yaw: ang });
  }
  if (bd < 13 && now - lastAct2 > 5200) {
    lastAct2 = now;
    send({ t: 'act', tool: 'dart', yaw: ang });
  }
  if (bd < 6 && now - lastAct3 > 7000) {
    lastAct3 = now;
    send({ t: 'act', tool: 'bait', yaw: ang });
  }
}, 50);

setTimeout(() => {
  clearInterval(aiTick);
  const s = state.snap;
  console.log('\n===== SONUÇ =====');
  console.log('olay sayısı:', state.events.length, '| yakalama:', state.catches.length);
  console.log('hatalar:', state.errors);
  if (s) {
    console.log('sahne:', s.phase, '| kalan süre:', s.tl, '| hayvan:', s.animals.length);
    console.log('oyuncu:', JSON.stringify(s.players.map((p) => ({ hp: p.hp, sc: p.sc, d: p.d, st: p.st }))));
    console.log('hayvanlar:', s.animals.map((a) => `${a.s}:${a.cap}%`).join(' '));
  }
  const kinds = {};
  for (const e of state.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log('olay türleri:', kinds);
  if (state.ended) console.log('TUR SONU:', JSON.stringify(state.ended).slice(0, 600));
  // duvar içinde kalan var mı?
  ws.close();
  process.exit(0);
}, SECONDS * 1000);
