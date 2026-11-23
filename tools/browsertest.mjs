// Gerçek Chromium ile oyunu açar, hata toplar ve ekran görüntüsü alır.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const exe = await chromium.executablePath();
const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  executablePath: exe,
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
page.on('requestfailed', (r) => logs.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText));

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 40000 });
await new Promise((r) => setTimeout(r, 3000));

const info = await page.evaluate(() => ({
  webgl: (() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); return gl ? gl.getParameter(gl.VERSION) : 'YOK'; })(),
  menuVisible: !document.getElementById('menu').classList.contains('hidden'),
  loadingHidden: document.getElementById('loading').classList.contains('hidden'),
  fatal: document.getElementById('fatalErr')?.textContent || null,
  canvasSize: [document.getElementById('scene').width, document.getElementById('scene').height],
}));
console.log('bilgi:', JSON.stringify(info));
await page.screenshot({ path: 'shots/menu.png' });

// Tek başına oyna → oyun ekranı
await page.evaluate(() => { document.getElementById('nameInput').value = 'Test Ranger'; });
await page.click('#btnSolo');
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: 'shots/lobby-or-game.png' });
console.log('faz:', await page.evaluate(() => ({
  hud: !document.getElementById('hud').classList.contains('hidden'),
  results: !document.getElementById('results').classList.contains('hidden'),
  lobby: !document.getElementById('lobby').classList.contains('hidden'),
  chips: document.getElementById('animalList').children.length,
  timer: document.getElementById('timer').textContent,
})));

// oyun içi: yürü ve ağ at
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.up('KeyW');
await page.mouse.click(720, 405);
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/game.png' });

// biraz daha oyna, hayvan yaklaşsın
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 2500));
await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shots/game2.png' });

const state = await page.evaluate(() => ({
  chips: [...document.querySelectorAll('#animalList .chip')].map((c) => c.textContent.trim()),
  feed: [...document.querySelectorAll('#feed .feed-item')].map((f) => f.textContent.trim()),
  team: document.getElementById('teamPanel').textContent.replace(/\s+/g, ' ').trim(),
  banner: document.getElementById('banner').textContent.trim(),
  fatal: document.getElementById('fatalErr')?.textContent || null,
}));
console.log('durum:', JSON.stringify(state, null, 1));
console.log('konsol:', logs.slice(0, 12));
await browser.close();
