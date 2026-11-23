// Tüm hayvan modellerini yan yana dizip yakın plan görüntü alır.
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
await page.setViewport({ width: 1440, height: 810 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(2000);
await page.evaluate(() => { document.getElementById('nameInput').value = 'Umut'; });
await page.click('#btnSolo');
await wait(3000);
await page.evaluate(() => {
  const g = window.__zoo.game;
  g.onSnapshot = () => {};
  const list = [...g.animals.values()];
  // meydanda ızgara düzeni
  list.forEach((ent, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = -9 + col * 4.5, z = -10 + row * 5;
    ent.api.group.position.set(x, 0, z);
    ent.target.x = x; ent.target.z = z;
    ent.snap.x = x; ent.snap.z = z;
    ent.api.group.rotation.y = 0.5;
    ent.speed = 0;
    ent.snap.cap = 0;
    ent.bar.group.visible = false;
    ent.api.animate(i, true, { speed: 1.2 });
  });
  g.me.x = 0; g.me.z = 2; g.me.yaw = Math.PI;
  g.camYaw = Math.PI; g.camPitch = 0.05;
  g.camDist = 9;
  g.hud.hide();
});
await wait(2500);
await page.screenshot({ path: 'shots/8-showcase.png' });
await browser.close();
