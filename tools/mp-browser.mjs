// İki gerçek tarayıcı sekmesiyle oda kurma / katılma / canlı coop testi
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
fs.mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

const A = await browser.newPage();
await A.setViewport({ width: 1280, height: 720 });
A.on('pageerror', (e) => errs.push('A: ' + e.message));
await A.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(2000);
await A.evaluate(() => { document.getElementById('nameInput').value = 'Ali'; });
await A.evaluate(() => document.getElementById('btnCreate').click());
await wait(1500);
const code = await A.evaluate(() => document.getElementById('lobbyCode').textContent.trim());
console.log('oda kodu:', code);
await A.screenshot({ path: 'shots/11-lobby.png' });

const B = await browser.newPage();
await B.setViewport({ width: 1280, height: 720 });
B.on('pageerror', (e) => errs.push('B: ' + e.message));
await B.goto(`http://127.0.0.1:3000/?oda=${code}`, { waitUntil: 'networkidle2', timeout: 60000 });
await wait(1500);
await B.evaluate(() => { document.getElementById('nameInput').value = 'Bekçi B'; });
await B.evaluate((c) => {
  document.getElementById('codeInput').value = c;
  document.getElementById('btnJoin').click();
}, code);
await wait(1800);

const lobbyA = await A.evaluate(() => ({
  players: [...document.querySelectorAll('#lobbyPlayers .lp')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  startVisible: !document.getElementById('btnStart').classList.contains('hidden'),
}));
console.log('A lobi:', JSON.stringify(lobbyA));

await A.evaluate(() => document.getElementById('btnStart').click());
await wait(3500);
const stA = await A.evaluate(() => ({
  inGame: !document.getElementById('hud').classList.contains('hidden'),
  team: [...document.querySelectorAll('#teamPanel .tp')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  models: window.__zoo.game.players.size,
  me: window.__zoo.game.myId,
  animals: window.__zoo.game.animals.size,
  timer: document.getElementById('timer').textContent,
}));
const stB = await B.evaluate(() => ({
  inGame: !document.getElementById('hud').classList.contains('hidden'),
  team: [...document.querySelectorAll('#teamPanel .tp')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  models: window.__zoo.game.players.size,
  me: window.__zoo.game.myId,
}));
console.log('A oyun:', JSON.stringify(stA));
console.log('B oyun:', JSON.stringify(stB));
await A.screenshot({ path: 'shots/12-coop-A.png' });

// A, B'yi ağa dolasın (trolleme)
const bPos = await B.evaluate(() => { const g = window.__zoo.game; return { id: g.myId, x: g.me.x, z: g.me.z }; });
await A.evaluate((bp) => {
  const g = window.__zoo.game;
  g.me.x = bp.x - 2.5; g.me.z = bp.z;
  g.camYaw = Math.atan2(bp.x - g.me.x, bp.z - g.me.z);
  g.net.send({ t: 'move', x: g.me.x, z: g.me.z, yaw: g.camYaw });
}, bPos);
await wait(300);
await A.evaluate(() => window.__zoo.game.net.send({ t: 'act', tool: 'net', yaw: window.__zoo.game.camYaw }));
await wait(900);
const bState = await B.evaluate(() => ({
  netted: window.__zoo.game.me.status.net,
  banner: document.getElementById('banner').textContent.replace(/\s+/g, ' ').trim(),
  feed: [...document.querySelectorAll('#feed .feed-item')].map((e) => e.textContent.trim()),
  overlay: document.getElementById('netOverlay').classList.contains('on'),
}));
console.log('B ağ durumu:', JSON.stringify(bState));
await B.screenshot({ path: 'shots/13-coop-trolled.png' });

console.log('hatalar:', errs);
await browser.close();
