// Coop kaldırma (revive) testi: B aslana yem olur, A gelip kaldırır.
import WebSocket from 'ws';

const URL = 'ws://127.0.0.1:3000/ws';
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(URL);
  const c = {
    name, ws, id: null, room: null, snap: null, events: [], errors: [],
    send(o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); },
    pos() { return this.snap?.players.find((x) => x.id === this.id); },
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') { c.id = m.id; c.room = m.room; }
    if (m.t === 'state') c.snap = m;
    if (m.t === 'events') {
      c.events.push(...m.list);
      for (const e of m.list) if (['downed', 'revive', 'catch', 'rescue'].includes(e.kind)) log(`[${name}] ${e.kind}`, e.id || e.target || '');
    }
    if (m.t === 'error') { c.errors.push(m.msg); log(`[${name}] HATA:`, m.msg); }
  });
  return new Promise((res) => { ws.on('open', () => res(c)); });
}

const A = await client('A');
A.send({ t: 'create', name: 'Ali' });
await wait(400);
const B = await client('B');
B.send({ t: 'join', room: A.room, name: 'Bekçi B' });
await wait(500);

// kaldırma testi için B'yi aslanın yanına koy
A.send({ t: 'start' });
await wait(500);

const lion = () => A.snap?.animals.find((a) => a.s === 'aslan');
log('aslan:', lion());

let downed = false;
const walkB = setInterval(() => {
  const l = lion();
  const b = B.pos();
  if (!l || !b || b.d) return;
  const ang = Math.atan2(l.x - 6 - b.x, l.z - b.z);
  B.send({ t: 'move', x: l.x - 5, z: l.z, yaw: ang, mv: 1, sp: 1 });
  if (b.d) downed = true;
}, 60);

for (let i = 0; i < 400; i++) {
  await wait(100);
  const b = B.pos();
  if (b?.d) { downed = true; log('B yere düştü! t=' + (i / 10).toFixed(1) + 's'); break; }
}
clearInterval(walkB);
if (!downed) log('⚠️ B yere düşmedi (aslan yakalamadı)');

// A, B'ye gider ve E'ye basılı tutar
for (let i = 0; i < 400; i++) {
  const b = B.pos();
  const a = A.pos();
  if (!b || !a) break;
  const ang = Math.atan2(b.x - a.x, b.z - a.z);
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const step = Math.min(1.1, d);
  A.send({ t: 'move', x: a.x + (dx / (d || 1)) * step, z: a.z + (dz / (d || 1)) * step, yaw: ang, mv: 1, sp: 1 });
  if (d < 3.0) A.send({ t: 'interact', targetId: B.id });
  await wait(60);
  if (i % 25 === 0) log(`  i=${i} d=${d.toFixed(2)} aHp=${a.hp} bYerde=${b.d} rv=${b.rv}`);
  if (!B.pos()?.d) { log('✅ B kaldırıldı! süre ~' + (i * 0.06).toFixed(1) + 's'); break; }
}

await wait(500);
const b = B.pos();
const a = A.pos();
log('durum → B yerde mi:', b?.d, '| hp:', b?.hp, '| A skor:', a?.sc, '| hatalar:', A.errors, B.errors);
const kinds = {};
for (const e of A.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
log('olaylar:', kinds);
A.ws.close(); B.ws.close();
process.exit(0);
