// ---------------------------------------------------------------------------
// Sunucu: statik dosyalar + WebSocket oyun odaları (tek port)
// ---------------------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './sim.js';
import { ROUND } from '../shared/config.js';

// geliştirme kolaylığı: tur süresini kısalt (test için)
if (process.env.ROUND_TIME) ROUND.time = Number(process.env.ROUND_TIME);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const DEV = process.env.DEV === '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

let vite = null;
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({
    server: { middlewareMode: true, hmr: false, host: '0.0.0.0', allowedHosts: true },
    appType: 'spa',
    root: ROOT,
  });
  console.log('[dev] Vite middleware modunda');
}

function serveStatic(req, res) {
  const dist = path.join(ROOT, 'dist');
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(dist, urlPath);
  if (!filePath.startsWith(dist)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      filePath = path.join(dist, 'index.html');
      fs.stat(filePath, (e2) => {
        if (e2) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Oyun derlenmemiş. Önce `npm run build` çalıştır.');
          return;
        }
        sendFile(filePath, res);
      });
      return;
    }
    sendFile(filePath, res);
  });
}

function sendFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': type, 'cache-control': cache, 'content-length': data.length });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size }));
    return;
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404).end('not found');
    });
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
const manager = new RoomManager({
  to(room) {
    return {
      emit(_evt, payload) {
        const roomObj = manager.rooms.get(room);
        if (!roomObj) return;
        const data = JSON.stringify(payload);
        for (const p of roomObj.players.values()) {
          if (p.ws && p.ws.readyState === 1) p.ws.send(data);
        }
      },
    };
  },
});

manager.startLoop();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let room = null;
  let player = null;

  const send = (obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  function joinRoom(target, name) {
    if (!target) { send({ t: 'error', msg: 'Oda bulunamadı. Kodu kontrol et.' }); return; }
    if (target.players.size >= 4) { send({ t: 'error', msg: 'Oda dolu (en fazla 4 bekçi).' }); return; }
    if (target.phase === 'playing' && target.players.size >= 4) {
      send({ t: 'error', msg: 'Tur başladı, oda dolu.' }); return;
    }
    room = target;
    player = room.addPlayer(ws, name);
    if (!player) { send({ t: 'error', msg: 'Odaya giremedin.' }); return; }
    ws.roomCode = room.code;
    ws.playerId = player.id;
    send({
      t: 'joined', id: player.id, room: room.code, host: room.hostId,
      phase: room.phase, colorIdx: player.colorIdx,
    });
    room.broadcastLobby();
    room.broadcast();
    console.log(`[oda ${room.code}] ${player.name} katıldı (${room.players.size}/4)`);
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'create':
        joinRoom(manager.createRoom(), msg.name);
        return;
      case 'join':
        joinRoom(manager.getRoom(msg.room), msg.name);
        return;
      case 'leave':
        if (room && player) { room.removePlayer(player.id); }
        room = null; player = null;
        return;
      case 'ping':
        send({ t: 'pong', c: msg.c });
        return;
      default:
        break;
    }
    if (room && player) room.handle(player, msg);
  });

  ws.on('close', () => {
    if (room && player) {
      room.removePlayer(player.id);
      console.log(`[oda ${room.code}] ${player.name} ayrıldı (${room.players.size}/4)`);
    }
  });

  ws.on('error', () => {});
});

// ölü bağlantıları temizle
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* yoksay */ }
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🦁 Hayvanat Bahçesi Kaçkınları → http://0.0.0.0:${PORT}  (dev: ${DEV})`);
});
