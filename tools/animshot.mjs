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
  // sadece karakter kalsın: arka planı sadeleştir, ışıkları güçlendir
  window.__studio = () => {
    const lights = [];
    g.scene.traverse((o) => { if (o.isLight) lights.push(o); });
    for (const c of g.scene.children) {
      if (c === ent.api.group || c.isLight) continue;
      c.visible = false;
    }
    for (const l of lights) {
      g.scene.add(l);
      if (l.isAmbientLight || l.isHemisphereLight) l.intensity = Math.max(l.intensity, 1.15);
      if (l.isDirectionalLight) {
        if (l.target) g.scene.add(l.target);
        l.position.set(ent.api.group.position.x + 2.5, 6, ent.api.group.position.z + 2.5);
        l.intensity = 2.6;
        if (l.target) {
          l.target.position.set(ent.api.group.position.x, 0.9, ent.api.group.position.z);
          l.target.updateMatrixWorld();
        }
      }
    }
    g.renderer.setClearColor(0x2b3f31, 1);
  };
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

// 4) yüz yakın planı (kırpma/ağız/kaşlar görünsün)
await pose('18-ranger-face', () => {
  const g = window.__zoo.game, ent = window.__ent;
  window.__studio();
  const yaw = ent.api.group.rotation.y;
  for (let i = 0; i < 40; i++) ent.api.animate(40 + i * 0.016, { moving: false });
  g.camera.position.set(
    ent.api.group.position.x + Math.sin(yaw) * 1.15,
    1.5,
    ent.api.group.position.z + Math.cos(yaw) * 1.15,
  );
  g.camera.lookAt(ent.api.group.position.x, 1.45, ent.api.group.position.z);
  g.renderer.render(g.scene, g.camera);
});

// 5) gerçek WASD: yan adım atarken gövde hareket yönüne, yüz kameraya döner
await page.evaluate(() => {
  const g = window.__zoo.game, ent = window.__ent;
  g.running = true;
  g.last = performance.now();
  requestAnimationFrame(g.loop);
  g.input.enabled = true;
  g.me.x = 12; g.me.z = 12;
  g.input.keys.add('KeyD');
});
await wait(900);
const yawInfo = await page.evaluate(() => {
  const g = window.__zoo.game;
  g.input.keys.clear();
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const out = {
    camYaw: +g.camYaw.toFixed(2),
    bodyYaw: +g.bodyYaw.toFixed(2),
    bodyOffset: +norm(g.bodyYaw - g.camYaw).toFixed(2),
    headYaw: +g.headLookOffset().toFixed(2),
  };
  g.running = false;
  const ent = g.players.get(g.myId);
  // yüzün baktığı yöne (camYaw) 4 m ileriye kamera koy
  const fx = Math.sin(g.camYaw), fz = Math.cos(g.camYaw);
  window.__studio();
  g.camera.position.set(g.me.x + fx * 3.1, 1.5, g.me.z + fz * 3.1);
  g.camera.lookAt(g.me.x, 1.1, g.me.z);
  window.__pos = { x: +g.me.x.toFixed(1), z: +g.me.z.toFixed(1) };
  g.renderer.render(g.scene, g.camera);
  return out;
});
console.log('yan adım:', yawInfo, await page.evaluate(() => window.__pos));
await wait(250);
await page.screenshot({ path: 'shots/19-ranger-strafe.png' });
console.log('kaydedildi 19-ranger-strafe');

await browser.close();
