// İki oyunculu çok oyunculu + trolleme testi
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:3000/ws';
const log = (...a) => console.log(...a);

function client(name) {
  const ws = new WebSocket(URL);
  const c = {
    name, ws, id: null, room: null, snap: null, events: [], errors: [],
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    pos() {
      const p = this.snap?.players.find((x) => x.id === this.id);
      return p ? { x: p.x, z: p.z, d: p.d, st: p.st } : null;
    },
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { c.id = m.id; c.room = m.room; }
    if (m.t === 'state') c.snap = m;
    if (m.t === 'events') { c.events.push(...m.list); for (const e of m.list) log(`[${name}] olay:`, e.kind, e.item || '', e.target || e.id || ''); }
    if (m.t === 'error') { c.errors.push(m.msg); log(`[${name}] HATA:`, m.msg); }
    if (m.t === 'lobby') c.lobby = m;
  });
  return new Promise((res) => { ws.on('open', () => res(c)); });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const A = await client('A');
A.send({ t: 'create', name: 'Ali' });
await wait(400);
log('oda:', A.room);
const B = await client('B');
B.send({ t: 'join', room: A.room, name: 'Bekçi B' });
await wait(500);
log('oyuncular:', A.snap?.players.map((p) => p.n));

A.send({ t: 'start' });
await wait(600);
log('faz:', A.snap?.phase, 'hayvan:', A.snap?.animals.length);

const ap = A.pos(), bp = B.pos();
log('A:', ap, 'B:', bp);

// A, B'ye yaklaş
A.send({ t: 'move', x: bp.x - 2.2, z: bp.z, yaw: Math.PI / 2, mv: 1, sp: 0 });
await wait(300);
// yaw: A'dan B'ye bak
const ay = Math.atan2(bp.x - A.pos().x, bp.z - A.pos().z);
A.send({ t: 'act', tool: 'net', yaw: ay });
await wait(500);
log('B ağda mı?', B.pos()?.st.net, '| A troll:', A.snap?.players.find((p) => p.id === A.id)?.sc);

// B yem bırakır, A yemi aşırır
B.send({ t: 'act', tool: 'bait', yaw: 0 });
await wait(300);
B.send({ t: 'act', tool: 'trap', yaw: 0 });
await wait(300);
let bait = A.snap?.baits?.[0];
log('yem:', bait);
if (bait) {
  A.send({ t: 'move', x: bait.x, z: bait.z, yaw: 0, mv: 1, sp: 0 });
  await wait(500);
  A.send({ t: 'move', x: bait.x, z: bait.z, yaw: 0, mv: 1, sp: 0 });
  await wait(400);
}
log('kapanlar:', A.snap?.traps?.map((t) => `${t.x},${t.z}`));

// kapanın üstüne yürü (A)
const trap = A.snap?.traps?.[0];
if (trap) {
  A.send({ t: 'move', x: trap.x, z: trap.z, yaw: 0, mv: 1, sp: 0 });
  await wait(300);
  A.send({ t: 'move', x: trap.x, z: trap.z, yaw: 0, mv: 1, sp: 0 });
  await wait(600);
}
log('A ağda mı?', A.pos()?.st.net);

// maytap + muz
B.send({ t: 'act', tool: 'fire', yaw: 0 });
B.send({ t: 'act', tool: 'peel', yaw: 0 });
await wait(900);

const kinds = {};
for (const e of [...A.events, ...B.events]) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
log('\nson faz:', A.snap?.phase, '| türler:', kinds);
log('hatalar:', A.errors, B.errors);
log('skorlar:', A.snap?.players.map((p) => `${p.n}:${p.sc}${p.d ? ' (yerde)' : ''}`));
A.send({ t: 'restart' });
await wait(600);
log('yeniden başlatma sonrası faz:', A.snap?.phase, '| hayvan:', A.snap?.animals.length);
A.ws.close(); B.ws.close();
process.exit(0);
