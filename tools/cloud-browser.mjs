// ---------------------------------------------------------------------------
// Canlı bulut çok oyunculu testi — iki gerçek tarayıcı sayfası
//
//   node tools/cloud-browser.mjs                        # https://catchanimal.vercel.app
//   node tools/cloud-browser.mjs http://127.0.0.1:3000   # yerel bulut modu
//
// Kurucu + misafir el sıkışması, lobi senkronu, tur başlangıcı ve misafirin
// hareketinin kurucunun ekranına ulaşması doğrulanır.
// ---------------------------------------------------------------------------
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

fs.mkdirSync('shots', { recursive: true });
const URL_BASE = (process.argv[2] || 'https://catchanimal.vercel.app').replace(/\/$/, '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: await chromium.executablePath(),
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});

async function newPage(label, url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 700 });
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__zoo, { timeout: 60000 });
  await wait(1200);
  return page;
}

console.log(`\n▶ Canlı çok oyunculu test — ${URL_BASE}`);

const A = await newPage('A', `${URL_BASE}/`);
const transport = await A.evaluate(() => window.__zoo.net.transport);
ok('taşıyıcı bulut (Supabase)', transport === 'cloud', transport);

await A.evaluate(() => { document.getElementById('nameInput').value = 'Kurucu Ali'; });
await A.evaluate(() => document.getElementById('btnCreate').click());
await A.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden'), { timeout: 30000 })
  .catch(() => {});
const code = await A.evaluate(() => document.getElementById('lobbyCode').textContent.trim());
ok('oda kuruldu', /^[A-Z0-9]{4}$/.test(code), code);
await A.screenshot({ path: 'shots/cloud-1-lobby-host.png' });

const B = await newPage('B', `${URL_BASE}/?oda=${encodeURIComponent(code)}`);
await B.evaluate(() => { document.getElementById('nameInput').value = 'Misafir Zeynep'; });
await B.evaluate((c) => {
  document.getElementById('codeInput').value = c;
  document.getElementById('btnJoin').click();
}, code);
await B.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden'), { timeout: 30000 })
  .catch(() => {});

const joined = await B.evaluate(() => ({ room: window.__zoo.state.room, me: window.__zoo.state.myId }));
ok('misafir odaya katıldı', joined.room === code && !!joined.me, JSON.stringify(joined));

await wait(1500);
const lobbyA = await A.evaluate(() => [...document.querySelectorAll('#lobbyPlayers .lp')].map((e) => e.textContent.trim()));
ok('kurucu lobisinde 2 oyuncu', lobbyA.length >= 2, lobbyA.join(' | '));
await A.screenshot({ path: 'shots/cloud-2-lobby-both.png' });
await B.screenshot({ path: 'shots/cloud-3-lobby-guest.png' });

// turu başlat
await A.evaluate(() => document.getElementById('btnStart').click());
await wait(2500);
const inGameA = await A.evaluate(() => window.__zoo.state.inGame === true);
const inGameB = await B.evaluate(() => window.__zoo.state.inGame === true);
ok('kurucu oyunda', inGameA);
ok('misafir oyunda', inGameB);

await wait(1500);
const snapA = await A.evaluate(() => {
  const s = window.__zoo.game.snapshot;
  return s ? { phase: s.phase, n: s.players.length, animals: s.animals.length } : null;
});
const snapB = await B.evaluate(() => {
  const s = window.__zoo.game.snapshot;
  return s ? { phase: s.phase, n: s.players.length, animals: s.animals.length } : null;
});
ok('kurucu snapshot: 2 oyuncu', snapA && snapA.n === 2 && snapA.phase === 'playing', JSON.stringify(snapA));
ok('misafir snapshot: 2 oyuncu', snapB && snapB.n === 2 && snapB.phase === 'playing', JSON.stringify(snapB));

// misafir yürüsün, kurucu görsün
const myIdB = await B.evaluate(() => window.__zoo.state.myId);
const posB0 = await A.evaluate((id) => {
  const p = window.__zoo.game.snapshot?.players.find((q) => q.id === id);
  return p ? { x: p.x, z: p.z } : null;
}, myIdB);
await B.evaluate(() => { window.__zoo.input.setKey?.('KeyW', true); });
await B.keyboard.down('w');
await wait(1400);
await B.keyboard.up('w');
await wait(700);
const posB1 = await A.evaluate((id) => {
  const p = window.__zoo.game.snapshot?.players.find((q) => q.id === id);
  return p ? { x: p.x, z: p.z } : null;
}, myIdB);
const moved = posB0 && posB1 ? Math.hypot(posB1.x - posB0.x, posB1.z - posB0.z) : 0;
ok('misafirin hareketi kurucuya ulaştı', moved > 0.6, `Δ=${moved.toFixed(2)} m`);

await A.screenshot({ path: 'shots/cloud-4-game-host.png' });
await B.screenshot({ path: 'shots/cloud-5-game-guest.png' });

ok('sayfa hatası yok', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n  ${pass}/${pass + fail} kontrol geçti\n`);
await browser.close();
process.exit(fail ? 1 : 0);
