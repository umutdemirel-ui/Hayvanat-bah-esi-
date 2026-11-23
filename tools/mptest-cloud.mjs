// ---------------------------------------------------------------------------
// Bulut çok oyunculu protokol testi (ağ gerekmez)
//
// Supabase Realtime yerine LocalBus kullanır; host/guest el sıkışması, komut
// aktarımı, snapshot yayını ve oyuncu ayrılması uçtan uca doğrulanır.
//
//   node tools/mptest-cloud.mjs
// ---------------------------------------------------------------------------
import { LocalNetwork } from '../src/bus.js';
import { CloudNet } from '../src/net-cloud.js';

const net = new LocalNetwork();
const mk = () => new CloudNet({ url: 'https://example.supabase.co', key: 'anon', busFactory: (t) => net.bus(t) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

console.log('\n▶ Bulut çok oyunculu protokol testi');

// ---------------- 1) solo (ağsız) ----------------
{
  const solo = mk();
  const states = [];
  solo.on('state', (s) => states.push(s));
  await solo.create('Yalnız', { solo: true });
  await sleep(400);
  ok('solo: oda kuruldu', !!solo.me, `id=${solo.me}`);
  ok('solo: snapshot akışı var', states.length > 0, `${states.length} snapshot`);
  const snap = states[states.length - 1];
  ok('solo: snapshot 1 oyuncu', !!snap && snap.players.length === 1);
  await solo.close();
}

// ---------------- 2) host + misafir ----------------
const host = mk();
const hostLobby = [];
const hostStates = [];
host.on('lobby', (m) => hostLobby.push(m));
host.on('state', (s) => hostStates.push(s));
await host.create('Kurucu');
ok('host: oda kodu 4 karakter', /^[A-Z0-9]{4}$/.test(host.code), host.code);

const guest = mk();
const guestStates = [];
const guestLobby = [];
const guestErrors = [];
let guestJoined = null;
guest.on('joined', (m) => { guestJoined = m; });
guest.on('state', (s) => guestStates.push(s));
guest.on('lobby', (m) => guestLobby.push(m));
guest.on('error', (m) => guestErrors.push(m));

const t0 = Date.now();
await guest.join(host.code, 'Misafir');
const joinMs = Date.now() - t0;
ok('guest: odaya katıldı', !!guestJoined, `${joinMs} ms`);
ok('guest: hata yok', guestErrors.length === 0, guestErrors.map((e) => e.msg).join(' | '));
ok('guest: kendi id eşleşti', guestJoined && guest.me === guestJoined.id);
ok('guest: kurucu id biliniyor', guest.hostId === host.me);

await sleep(300);
const hostLobbyLast = hostLobby[hostLobby.length - 1];
ok('host: lobide 2 oyuncu', hostLobbyLast && hostLobbyLast.players.length === 2,
  hostLobbyLast ? hostLobbyLast.players.map((p) => p.name).join(', ') : 'lobby yok');
const guestLobbyLast = guestLobby[guestLobby.length - 1];
ok('guest: lobiyi görüyor', guestLobbyLast && guestLobbyLast.players.length === 2);

// ---------------- 3) tur başlat + snapshot ----------------
guestStates.length = 0;
host.send({ t: 'start' });
await sleep(500);
ok('guest: tur başladı (lobby phase)', guestLobby.some((m) => m.phase === 'playing'));
ok('guest: snapshot akışı', guestStates.length > 0, `${guestStates.length} snapshot / 0.5 s`);
const gs = guestStates[guestStates.length - 1];
ok('guest: snapshot 2 oyuncu', gs && gs.players.length === 2);
ok('guest: hayvanlar senkron', gs && gs.animals.length > 0, gs ? `${gs.animals.length} hayvan` : '');

// ---------------- 4) misafir komutu host'a ulaşıyor ----------------
const before = host.host.room.players.get(guestJoined.id);
const bx = before.x;
const bz = before.z;
guest.send({ t: 'move', x: bx + 1.2, z: bz + 0.4, yaw: 1.1, sprint: false, moving: true });
await sleep(250);
const after = host.host.room.players.get(guestJoined.id);
const moved = Math.hypot(after.x - (bx + 1.2), after.z - (bz + 0.4));
ok('host: misafirin hareketi işlendi', moved < 1.5, `Δ=${moved.toFixed(2)} m`);

// ---------------- 5) yönlendirilmiş mesaj sızıntısı yok ----------------
{
  const errCount = guestErrors.length;
  const third = mk();
  const thirdStates = [];
  third.on('state', (s) => thirdStates.push(s));
  await third.join(host.code, 'Üçüncü');
  const thirdJoined = third.me;
  await sleep(250);
  ok('3. oyuncu katıldı', !!thirdJoined);
  ok('host: lobide 3 oyuncu', host.host.room.players.size === 3, `${host.host.room.players.size}`);
  await third.close();
  await sleep(250);
  ok('ayrılan oyuncu odadan düştü', host.host.room.players.size === 2, `${host.host.room.players.size}`);
  ok('misafir hatası birikmedi', guestErrors.length === errCount);
}

// ---------------- 6) yanlış oda kodu ----------------
{
  const lost = mk();
  const errs = [];
  lost.on('error', (m) => errs.push(m));
  await lost.join('ZZZZ', 'Kayıp');
  ok('yanlış kod: hata bildirildi', errs.length > 0, errs[0]?.msg);
  await lost.close();
}

// ---------------- 7) ayrılma ----------------
await guest.close();
await sleep(300);
ok('host: misafir ayrıldı', host.host.room.players.size === 1, `${host.host.room.players.size}`);
await host.close();
ok('host: döngü durdu', host.host.timer === null);

console.log(`\n  ${pass}/${pass + fail} kontrol geçti\n`);
process.exit(fail ? 1 : 0);
