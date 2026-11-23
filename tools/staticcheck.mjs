// Statik tutarlılık: DOM id'leri, hud metotları, olay türleri
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const jsFiles = ['src/main.js', 'src/game.js', 'src/hud.js'];
let problems = 0;
for (const f of jsFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:getElementById|\$)\(\s*'([^']+)'\s*\)/g)) {
    if (m[1] === 'fatalErr') continue; // dinamik oluşturuluyor
    if (!ids.has(m[1])) { console.log(`❌ ${f}: DOM id yok → #${m[1]}`); problems++; }
  }
}

// hud'da tanımlı metotlar
const hudSrc = fs.readFileSync('src/hud.js', 'utf8');
const hudMethods = new Set([...hudSrc.matchAll(/^\s{2}([a-zA-Z_]\w*)\(/gm)].map((m) => m[1]));
for (const f of ['src/game.js', 'src/main.js']) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bhud\.([a-zA-Z_]\w*)\s*\(/g)) {
    if (!hudMethods.has(m[1])) { console.log(`❌ ${f}: hud.${m[1]}() tanımsız`); problems++; }
  }
}

// sunucu olay türleri ↔ istemci
const simSrc = fs.readFileSync('server/sim.js', 'utf8');
const serverKinds = new Set([...simSrc.matchAll(/pushEvent\(\{\s*kind:\s*'([^']+)'/g)].map((m) => m[1]));
const gameSrc = fs.readFileSync('src/game.js', 'utf8');
const handled = new Set([...gameSrc.matchAll(/case '([^']+)':/g)].map((m) => m[1]));
for (const k of serverKinds) {
  if (!handled.has(k)) { console.log(`⚠️  istemci '${k}' olayını işlemiyor`); }
}

// araç anahtarları
const cfg = fs.readFileSync('shared/config.js', 'utf8');
const tools = [...cfg.matchAll(/^\s{2}(\w+): \{\n\s{4}name:/gm)].map((m) => m[1]);
console.log('araçlar:', tools.join(', '));
console.log('sunucu olayları:', [...serverKinds].join(', '));
console.log(problems === 0 ? '✅ statik kontrol temiz' : `❌ ${problems} sorun`);
process.exit(problems ? 1 : 0);
