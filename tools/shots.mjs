// Oyunun farklı ekranlarından görüntüler alır (görsel doğrulama).
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

fs.mkdirSync('shots', { recursive: true });
const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: await chromium.executablePath(),
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810 });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(2500);
await page.screenshot({ path: 'shots/1-menu.png' });

await page.evaluate(() => { document.getElementById('nameInput').value = 'Umut'; });
await page.click('#btnSolo');
await wait(3500);
await page.screenshot({ path: 'shots/2-start.png' });

// hayvanların yanına ışınlan (görsel test: snapshot dondurulur)
const near = await page.evaluate(() => {
  const g = window.__zoo.game;
  g.onSnapshot = () => {};
  const animals = [...g.animals.values()];
  const pick = animals.find((a) => a.snap.s === 'aslan') || animals[0];
  const p = pick.api.group.position;
  g.me.x = p.x + 4.5; g.me.z = p.z + 4.5;
  g.camYaw = Math.atan2(p.x - g.me.x, p.z - g.me.z);
  g.camPitch = 0.12;
  g.me.yaw = g.camYaw;
  pick.snap.cap = 62;
  return { animal: pick.snap.s, x: p.x, z: p.z };
});
console.log('yakın hayvan:', near);
await wait(2500);
await page.screenshot({ path: 'shots/3-animals.png' });

// efektsel an: ağ + konfeti + hasar yazıları
await page.evaluate(() => {
  const g = window.__zoo.game;
  const p = [...g.animals.values()][0].api.group.position;
  g.effects.confetti(p.x, 0.5, p.z);
  g.effects.ring(p.x, 0.2, p.z, 0xffd93d, 8);
  g.floatText(p.x, 2.4, p.z, '+120', '#8cf05c', 8);
  g.handleEvent({ kind: 'attack', species: 'aslan', target: 1, x: p.x, z: p.z, animalId: 1 });
  g.hud.banner('🦁 ASLAN YAKALANDI!', 'Umut · +120 puan', 8000);
  g.hud.feed('🦁 <b>Aslan</b> yakalandı — <b>Umut</b> +120', 'good');
  g.hud.setDanger(0.5);
});
await wait(1500);
await page.screenshot({ path: 'shots/4-effects.png' });

// yardım ekranı
await page.evaluate(() => { window.__zoo.game.hud.setDanger(0); });
await page.keyboard.press('KeyH');
await wait(800);
await page.screenshot({ path: 'shots/5-help.png' });
await page.keyboard.press('KeyH');
await wait(400);

// sonuç ekranı
await page.evaluate(() => {
  const g = window.__zoo.game;
  g.onEvents([{ kind: 'end', win: true, reason: 'all-caught', caught: 10, total: 10, time: 268,
    rewards: [
      { id: 1, name: 'Umut', colorIdx: 0, score: 780, catches: 5, assists: 3, revives: 2, downed: 1, troll: 6, title: 'Trolün Kralı 😈' },
      { id: 2, name: 'Bekçi B', colorIdx: 1, score: 610, catches: 3, assists: 4, revives: 1, downed: 2, troll: 1, title: 'Büyük Avcı 🏆' },
      { id: 3, name: 'Çırak', colorIdx: 2, score: 320, catches: 2, assists: 1, revives: 0, downed: 4, troll: 0, title: 'Aslan Yemi 🥩' },
    ],
    caughtList: [
      { species: 'aslan', by: 1, byName: 'Umut', points: 120 },
      { species: 'kaplan', by: 2, byName: 'Bekçi B', points: 145 },
      { species: 'fil', by: 1, byName: 'Umut', points: 180 },
    ] }]);
});
await wait(1200);
await page.screenshot({ path: 'shots/6-results.png' });

// mobil görünüm
const mob = await browser.newPage();
await mob.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await mob.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2' });
await wait(2500);
await mob.screenshot({ path: 'shots/7-mobile-menu.png' });

console.log('konsol hataları:', logs.slice(0, 10));
await browser.close();
