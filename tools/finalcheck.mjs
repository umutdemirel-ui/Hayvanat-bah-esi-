import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  executablePath: await chromium.executablePath(), headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await wait(2000);
await page.evaluate(() => { document.getElementById('nameInput').value = 'Final'; document.getElementById('btnSolo').click(); });
await wait(5000);
await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
await page.keyboard.press('Digit1'); await wait(400);
await page.keyboard.press('Digit3'); await wait(400);
await page.keyboard.press('KeyG'); await wait(1500);
await page.screenshot({ path: 'shots/14-final.png' });
const st = await page.evaluate(() => {
  const z = window.__zoo;
  return {
    phase: z.game.phase, ambience: !!z.audio.ambience, hud: !document.getElementById('hud').classList.contains('hidden'),
    timer: document.getElementById('timer').textContent, chips: document.getElementById('animalList').children.length,
    fatal: document.getElementById('fatalErr')?.textContent || null,
  };
});
console.log('durum:', JSON.stringify(st));
console.log('hatalar:', logs.slice(0, 5));
await browser.close();
