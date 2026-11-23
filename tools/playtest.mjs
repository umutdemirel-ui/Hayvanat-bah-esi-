// Gerçek oynanış testi: hareket, araçlar, trolleme araçları ve görseller
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
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810 });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(2000);
await page.evaluate(() => { document.getElementById('nameInput').value = 'Umut'; });
await page.click('#btnSolo');
await wait(3000);

const aimAtNearest = async () => page.evaluate(() => {
  const g = window.__zoo.game;
  const snap = g.snapshot;
  if (!snap) return null;
  let best = null, bd = 1e9;
  for (const a of snap.animals) {
    const d = Math.hypot(a.x - g.me.x, a.z - g.me.z);
    if (d < bd) { bd = d; best = a; }
  }
  if (!best) return null;
  g.camYaw = Math.atan2(best.x - g.me.x, best.z - g.me.z);
  g.camPitch = 0.14;
  return { species: best.s, dist: +bd.toFixed(1), cap: best.cap };
});

console.log('hedef:', await aimAtNearest());
await page.keyboard.down('KeyW');
await wait(4000);
await aimAtNearest();
await wait(2000);
await page.keyboard.up('KeyW');

// araçları dene
for (const key of ['Digit1', 'Digit1', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyV', 'KeyB', 'KeyG']) {
  await page.keyboard.press(key);
  await wait(450);
}
await wait(1200);
await page.screenshot({ path: 'shots/9-play.png' });

const st = await page.evaluate(() => {
  const z = window.__zoo;
  const g = z.game;
  return {
    anims: g.animals.size,
    traps: g.traps.size,
    baits: g.baits.size,
    peels: g.peels.size,
    bombs: g.bombs.size,
    proj: g.projectiles.size,
    feed: [...document.querySelectorAll('#feed .feed-item')].map((f) => f.textContent.trim()).slice(-4),
    sent: z.net ? 'n/a' : null,
    me: { hp: g.me.hp, x: +g.me.x.toFixed(1), z: +g.me.z.toFixed(1), downed: g.me.downed },
    toolCharges: [...document.querySelectorAll('#toolbar .t-charges')].map((e) => e.textContent),
    danger: document.getElementById('danger').style.opacity,
    fps: z.game.fps,
  };
});
console.log('durum:', JSON.stringify(st, null, 1));

// yakalama anını taklit et (görsel doğrulama)
await page.evaluate(() => {
  const g = window.__zoo.game;
  const a = [...g.animals.values()][0];
  if (a) {
    const p = a.api.group.position;
    g.handleEvent({ kind: 'catch', species: a.snap.s, by: g.myId, byName: 'Umut', points: 145, x: p.x, z: p.z, teamBonus: true });
  }
});
await wait(700);
await page.screenshot({ path: 'shots/10-catch.png' });

// uzun oturumda hata var mı
await wait(4000);
console.log('konsol hataları:', logs.slice(0, 8));
console.log('fatal:', await page.evaluate(() => document.getElementById('fatalErr')?.textContent || 'yok'));
await browser.close();
