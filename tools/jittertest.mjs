// ---------------------------------------------------------------------------
// Titreme/hız regresyon testi.
// Gerçek zamanlı kare hızından bağımsız ölçmek için oyun döngüsünü durdurup
// kareleri 60 fps sabit dt ile elle sürer; sunucuyu 15 Hz snapshot + ~0.76 m
// gecikmeyle taklit eder. Kameranın sabit bir landmark üzerindeki titremesini
// (2. fark = jerk) ve koşu hızını ölçer.
//   node tools/jittertest.mjs      (sunucu 3000'de çalışıyor olmalı)
// ---------------------------------------------------------------------------
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  executablePath: await chromium.executablePath(),
  headless: true,
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs2' },
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => { document.getElementById('nameInput').value = 'Titresim'; });
await page.click('#btnSolo');
await new Promise((r) => setTimeout(r, 2500));

const res = await page.evaluate(() => {
  const g = window.__zoo.game;
  const applySnap = g.onSnapshot.bind(g); // kendi snapshot'ımızı uygula
  g.running = false;                      // rAF döngüsünü durdur
  g.onSnapshot = () => {};                // gerçek sunucu snapshot'larını yut (deterministik olsun)
  g.input.enabled = true;
  g.camYaw = 0; g.camPitch = 0.15;
  g.camDist = 7.8; g.camDistTarget = 7.8; g.camBlock = 1;
  g.me.x = -3; g.me.z = 5; g.me.vx = 0; g.me.vz = 0;
  g.camFocus = { x: -3, y: 1.6, z: 5 };
  g.camera.position.set(-3, 12, -4);
  g.input.keys.add('KeyW');

  const P = g.camera.position.constructor;
  const DT = 1 / 60;
  const trail = [];
  const snap = {
    t: 'state', phase: 'playing', host: 1, animals: [], proj: [], traps: [], baits: [],
    peels: [], bombs: [], caught: 0, tl: 400, time: 0,
  };
  const ndc = [];
  const cam = [];
  let z60 = 0, z230 = 0;

  for (let i = 0; i < 420; i++) {
    g.time += DT;
    trail.push({ x: g.me.x, z: g.me.z });
    if (trail.length > 40) trail.shift();

    g.handleInput(DT);
    g.updateLocalPlayer(DT);

    if (i % 4 === 0 && trail.length > 8) {          // 15 Hz snapshot, sunucu ~6 kare geride
      const lag = trail[trail.length - 7];
      snap.players = [{
        id: g.myId, n: 'Titresim', c: 0, x: lag.x, z: lag.z, yaw: g.bodyYaw,
        hp: 100, d: 0, sc: 0, ch: { net: 0, dart: 3, bait: 3, trap: 2 }, cd: {},
        st: { net: false, slow: false, slip: false, dizzy: false, sp: 0 }, rv: 0, em: null, sk: 0,
      }];
      applySnap(snap);
    }

    g.updateCamera(DT);
    g.camera.updateMatrixWorld();

    if (i === 60) z60 = g.me.z;
    if (i === 230) z230 = g.me.z;
    if (i >= 60 && i <= 230) {                      // duvara çarpmadan koşarken ölç
      const v = new P(3, 2, 35).project(g.camera);
      ndc.push([v.x, v.y]);
      cam.push([g.camera.position.x, g.camera.position.y, g.camera.position.z]);
    }
  }
  g.input.keys.clear();

  const jerk = (arr) => {
    let s = 0, mx = 0, n = 0;
    for (let i = 2; i < arr.length; i++) {
      for (let c = 0; c < arr[i].length; c++) {
        const d2 = Math.abs(arr[i][c] - 2 * arr[i - 1][c] + arr[i - 2][c]);
        s += d2; mx = Math.max(mx, d2); n++;
      }
    }
    return { mean: s / n, max: mx };
  };
  return {
    frames: ndc.length,
    runSpeed: ((z230 - z60) * 60) / 170,
    ndc: jerk(ndc),
    cam: jerk(cam),
  };
});

const limits = [
  ['koşu hızı (≈7.6 m/s)', res.runSpeed, 7.0, (v) => v >= 7.0, 'm/s'],
  ['landmark titremesi (ort.)', res.ndc.mean, 2e-4, (v) => v <= 2e-4, 'ndc'],
  ['landmark titremesi (maks)', res.ndc.max, 2e-3, (v) => v <= 2e-3, 'ndc'],
  ['kamera sıçraması (ort.)', res.cam.mean, 2e-3, (v) => v <= 2e-3, 'm'],
];

console.log(`\n📊 ${res.frames} kare ölçüldü (60 fps sabit dt, 15 Hz snapshot)`);
let ok = true;
for (const [label, val, , test, unit] of limits) {
  const pass = test(val);
  ok = ok && pass;
  console.log(`  ${pass ? '✅' : '❌'} ${label}: ${val.toFixed(5)} ${unit}`);
}
console.log(`\n${ok ? '✅ titreme testi geçti' : '❌ titreme testi başarısız'}`);
if (errors.length) console.log('sayfa hataları:', errors);
await browser.close();
process.exit(ok ? 0 : 1);
