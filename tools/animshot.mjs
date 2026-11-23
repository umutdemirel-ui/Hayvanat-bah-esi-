// Bekçi karakterinin animasyon pozlarını yakın plandan görüntüler.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
fs.mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(1500);
await page.evaluate(() => { document.getElementById('nameInput').value = 'Umut'; });
await page.click('#btnSolo');
await wait(2600);

const setup = await page.evaluate(() => {
  const g = window.__zoo.game;
  g.onSnapshot = () => {};
  g.onEvents = () => {};
  g.running = false;          // döngüyü durdur, pozları elle sürelim
  g.hud.hide();
  const ent = g.players.get(g.myId);
  if (!ent) return { ok: false };
  ent.api.group.position.set(12, 0, 12);
  ent.api.group.rotation.y = 0.35;
  ent.api.group.visible = true;
  if (ent.label) ent.label.visible = false;
  for (const a of g.animals.values()) a.api.group.visible = false;
  g.world?.update?.(1);
  g.camera.position.set(14.3, 1.7, 15.3);
  g.camera.lookAt(12, 1.0, 12);
  window.__ent = ent;
  return { ok: true, kids: ent.api.group.children.length };
});
console.log('kurulum:', setup);

async function pose(name, fn) {
  await page.evaluate(fn);
  await wait(220);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('kaydedildi', name);
}

// 1) koşu pozu (kare dalgasının tepe noktası)
await pose('15-ranger-run', () => {
  const g = window.__zoo.game, ent = window.__ent;
  for (let i = 0; i < 24; i++) {
    ent.api.animate(10 + i * 0.016, { moving: true, speed: 1.5, sprint: true });
  }
  g.renderer.render(g.scene, g.camera);
});

// 2) ağ atma (kolun en yukarıda olduğu an)
await pose('16-ranger-net', () => {
  const g = window.__zoo.game, ent = window.__ent;
  ent.api.animate(20, { moving: false });
  for (let i = 1; i <= 11; i++) {
    ent.api.animate(20 + i * 0.016, { moving: false, action: { type: 'net', t: i * 0.016 } });
  }
  g.renderer.render(g.scene, g.camera);
});

// 3) hasar / düşme pozu
await pose('17-ranger-downed', () => {
  const g = window.__zoo.game, ent = window.__ent;
  for (let i = 0; i < 40; i++) {
    ent.api.animate(30 + i * 0.016, { moving: false, downed: true, hurt: i < 6 ? 1 : 0 });
  }
  g.camera.position.set(14.6, 1.2, 15.4);
  g.camera.lookAt(12, 0.5, 12);
  g.renderer.render(g.scene, g.camera);
});

await browser.close();
