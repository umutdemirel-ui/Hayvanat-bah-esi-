// ---------------------------------------------------------------------------
// Giriş noktası: ekran akışı, bağlantı, oyun kurulumu
// ---------------------------------------------------------------------------
import { Game } from './game.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Net } from './net.js';
import { Input } from './input.js';
import './style.css';

const $ = (id) => document.getElementById(id);

// beklenmeyen hataları kullanıcıya göster (sessiz çökme olmasın)
function showFatal(msg) {
  let el = document.getElementById('fatalErr');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatalErr';
    el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99;'
      + 'background:rgba(40,8,8,.94);border:1px solid #ff6b6b;color:#ffd9d9;padding:10px 16px;'
      + 'border-radius:10px;font:12px/1.45 Trebuchet MS,sans-serif;max-width:80vw;white-space:pre-wrap';
    document.body.appendChild(el);
  }
  el.textContent = `⚠️ ${msg}`;
}
window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  showFatal(e.message || 'Bilinmeyen hata');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  showFatal(String(e.reason && e.reason.message ? e.reason.message : e.reason));
});

const audio = new Audio();
const hud = new Hud();
const net = new Net();
const canvas = $('scene');
const game = new Game(canvas, hud, audio, net);
const input = new Input(canvas);
game.input = input;

const state = {
  name: localStorage.getItem('zoo:name') || '',
  room: null,
  myId: null,
  pendingSolo: false,
  inGame: false,
  host: null,
};

// ---------------- yükleme ----------------
game.init();
game.start();
setTimeout(() => {
  $('loading').classList.add('hidden');
}, 400);

// ---------------- isim ----------------
const nameInput = $('nameInput');
nameInput.value = state.name;
nameInput.addEventListener('input', () => {
  state.name = nameInput.value.trim();
  localStorage.setItem('zoo:name', state.name);
});

function getName() {
  const n = (nameInput.value || '').trim().slice(0, 14);
  if (!n) return 'Bekçi' + Math.floor(Math.random() * 90 + 10);
  return n;
}

// ---------------- bağlantı ----------------
async function ensureConnection() {
  if (net.connected) return true;
  setError('');
  try {
    await net.connect();
    return true;
  } catch (e) {
    setError('Sunucuya bağlanılamadı. Sayfayı yenileyip tekrar dene.');
    return false;
  }
}

function setError(msg) {
  $('menuError').textContent = msg || '';
}

hud.onSlotClick = (tool) => {
  input.actions.push(tool);
};

// ---------------- ekranlar ----------------
function showScreen(id) {
  for (const s of ['menu', 'help', 'lobby', 'results']) {
    $(s).classList.toggle('hidden', s !== id);
  }
  if (!id) {
    for (const s of ['menu', 'help', 'lobby', 'results']) $(s).classList.add('hidden');
  }
}

function enterGame() {
  showScreen(null);
  hud.show();
  input.enabled = true;
  state.inGame = true;
  if (game.phase !== 'playing') game.startRound();
  requestLockSoon();
}

function requestLockSoon() {
  if (input.touchMode) return;
  hud.banner('🖱️ Fare ile bak', 'Tıkla → fare kilidi · kilitlenmezse sağ tıkla sürükle', 2600);
}

// ---------------- menü olayları ----------------
$('btnCreate').addEventListener('click', async () => {
  audio.init();
  audio.play('click');
  if (!(await ensureConnection())) return;
  state.pendingSolo = false;
  net.create(getName());
});

$('btnSolo').addEventListener('click', async () => {
  audio.init();
  audio.play('click');
  if (!(await ensureConnection())) return;
  state.pendingSolo = true;
  net.create(getName());
});

$('btnJoinMode').addEventListener('click', () => {
  audio.init();
  audio.play('click');
  const row = $('joinRow');
  row.classList.toggle('hidden');
  $('codeInput').focus();
});

$('btnJoin').addEventListener('click', async () => {
  audio.init();
  const code = ($('codeInput').value || '').trim().toUpperCase();
  if (code.length !== 4) { setError('Oda kodu 4 karakter olmalı.'); return; }
  if (!(await ensureConnection())) return;
  state.pendingSolo = false;
  net.join(code, getName());
});
$('codeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btnJoin').click();
});

$('btnHelp').addEventListener('click', () => { audio.play('click'); showScreen('help'); });
$('btnHelpClose').addEventListener('click', () => {
  audio.play('click');
  if (state.inGame) showScreen(null);
  else showScreen('menu');
});

$('btnStart').addEventListener('click', () => {
  audio.play('click');
  net.send({ t: 'start' });
});

$('btnCopy').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?oda=${state.room || ''}`;
  try {
    await navigator.clipboard.writeText(url);
    $('btnCopy').textContent = '✅ Kopyalandı!';
    setTimeout(() => { $('btnCopy').textContent = '🔗 Davet bağlantısını kopyala'; }, 1800);
  } catch {
    window.prompt('Bu bağlantıyı arkadaşlarına gönder:', url);
  }
});

$('btnLeave').addEventListener('click', () => {
  net.send({ t: 'leave' });
  location.reload();
});

$('btnAgain').addEventListener('click', () => {
  audio.play('click');
  $('results').classList.add('hidden');
  game.resetRound();
  hud.show();
  input.enabled = true;
  state.inGame = true;
  net.send({ t: 'restart' });
});

$('btnMenu').addEventListener('click', () => {
  location.reload();
});

input.onHelp = () => {
  if (state.inGame) {
    const helpOpen = !$('help').classList.contains('hidden');
    if (helpOpen) showScreen(null);
    else showScreen('help');
    if (document.pointerLockElement) document.exitPointerLock();
    hud.banner('📖 Yardım açık', 'Tur devam ediyor — hayvanlar beklemez!', 2200);
  }
};
input.onEscape = () => {
  // fare kilidi çıkışı tarayıcı tarafından yapılır; menü aç
  if (state.inGame && $('help').classList.contains('hidden')) {
    // kısa bilgi
    hud.banner('⏸️ Fare serbest', 'Devam etmek için ekrana tıkla · H yardım', 1600);
  }
};

// dokunmatik: uyarıya bas → kaldırma
$('prompt').style.pointerEvents = 'auto';
$('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); input.interact = true; });
window.addEventListener('pointerup', () => { if (input.touchMode) input.interact = false; });

// ---------------- ağ olayları ----------------
net.on('joined', (msg) => {
  state.myId = msg.id;
  state.room = msg.room;
  state.host = msg.host;
  game.setMe(msg.id);
  hud.setMyId(msg.id);
  $('lobbyCode').textContent = msg.room;
  if (msg.phase === 'playing') {
    enterGame();
    return;
  }
  if (state.pendingSolo) {
    state.pendingSolo = false;
    net.send({ t: 'start' });
    enterGame();
    return;
  }
  showScreen('lobby');
  game.cinematic = true;
  if (input.touchMode) canvas.addEventListener('touchstart', () => audio.init(), { once: true });
});

net.on('lobby', (msg) => {
  state.host = msg.host;
  const isHost = msg.host === state.myId;
  const wrap = $('lobbyPlayers');
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const p = msg.players[i];
    if (p) {
      const color = `#${[0xff5d5d, 0x4fa8ff, 0x8cf05c, 0xffd93d, 0xc65cff, 0x31e8c4][p.colorIdx % 6].toString(16).padStart(6, '0')}`;
      rows.push(`<div class="lp"><span class="dot" style="background:${color};color:${color}"></span>
        <span>${escapeHtml(p.name)}${p.id === state.myId ? ' (sen)' : ''}</span>
        ${p.host ? '<span class="host-tag">KURUCU</span>' : ''}</div>`);
    } else {
      rows.push('<div class="lp empty"><span class="dot" style="background:#555"></span><span>Boş yer — arkadaşını davet et</span></div>');
    }
  }
  wrap.innerHTML = rows.join('');
  $('btnStart').classList.toggle('hidden', !isHost || msg.phase === 'playing');
  $('lobbyMsg').innerHTML = isHost
    ? 'Hazır olduğunda turu başlat. Hayvanlar seni bekliyor 🦁'
    : 'Kurucunun turu başlatması bekleniyor…';
  if (msg.phase === 'playing' && !state.inGame) enterGame();
});

net.on('state', (snap) => {
  game.onSnapshot(snap);
});

net.on('events', (msg) => {
  game.onEvents(msg.list || []);
});

net.on('error', (msg) => {
  setError(msg.msg || 'Bir hata oldu.');
  showScreen('menu');
  $('joinRow').classList.remove('hidden');
});

net.on('close', () => {
  if (state.inGame) {
    hud.banner('🔌 BAĞLANTI KOPTU', 'Sayfayı yenileyip tekrar bağlan', 6000);
    input.enabled = false;
  }
});

// ---------------- bağlantı sonrası ----------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && state.inGame) hud.toggleMinimapZoom();
});

// URL'den oda kodu
const params = new URLSearchParams(location.search);
const roomParam = (params.get('oda') || params.get('room') || '').toUpperCase();
if (roomParam) {
  $('joinRow').classList.remove('hidden');
  $('codeInput').value = roomParam.slice(0, 4);
  if (state.name) nameInput.value = state.name;
}

// ilk tıklamada sesi başlat
window.addEventListener('pointerdown', () => audio.init(), { once: true });
window.addEventListener('keydown', () => audio.init(), { once: true });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
