// ---------------------------------------------------------------------------
// Çok oyunculu istemci (Supabase Realtime) — `Net` (WebSocket) ile aynı arayüz
//
//   net.on(type, fn) / net.emit / net.connect / net.send / net.create / net.join
//
// Model: **kurucu-otoriter**. Odayı açan tarayıcı simülasyonu çalıştırır
// (server/sim.js birebir aynı kod), misafirler Supabase Realtime kanalından
// komut gönderip snapshot alır. Böylece sunucu gerektirmeyen statik dağıtımda
// (Vercel) da gerçek zamanlı çok oyunculu oynanır.
//
// Kanal:  ca:<ODA KODU>
// Mesajlar (broadcast payload):
//   { k:'hello', gid, name }          misafir → host: beni odaya al
//   { k:'msg',   gid, m }             misafir → host: oyun komutu
//   { k:'ping',  gid, c }             misafir → host: gecikme ölçümü
//   { k:'bye',   gid }                misafir → host: ayrıldım
//   { k:'out',   to, m }              host → herkes (to doluysa sadece o misafir)
// ---------------------------------------------------------------------------
import { HostRoom } from './host.js';
import { SupaBus, LocalNetwork, presenceHasHost } from './bus.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HELLO_TRIES = 8;
const HELLO_INTERVAL = 450;

export function randomCode() {
  let out = '';
  const buf = new Uint8Array(4);
  (globalThis.crypto || {}).getRandomValues?.(buf);
  for (let i = 0; i < 4; i++) out += CODE_CHARS[(buf[i] || Math.floor(Math.random() * 255)) % CODE_CHARS.length];
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CloudNet {
  /**
   * @param {{url?: string, key?: string, busFactory?: (topic: string) => any,
   *          localNet?: LocalNetwork}} opts
   */
  constructor({ url = '', key = '', busFactory = null, localNet = null } = {}) {
    this.url = url;
    this.key = key;
    this.busFactory = busFactory || ((topic) => new SupaBus({ url: this.url, key: this.key, topic }));
    this.localNet = localNet;
    this.handlers = new Map();
    this.role = 'idle';       // 'host' | 'guest'
    this.code = null;
    this.me = null;
    this.hostId = null;
    this.connected = false;
    this.joined = false;
    this.closedByUser = false;
    this.latency = 0;
    this.bus = null;
    this.host = null;
    this.gid = `g-${Math.random().toString(36).slice(2, 10)}`;
    this.name = '';
    this.pingTimer = null;
    this.sawHost = false;
  }

  // ---------------- Net uyumlu yüzey ----------------
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  emit(type, data) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(data);
  }

  /** Yapılandırma var mı? Yoksa solo oyun yine çalışır, çok oyunculu çalışmaz. */
  get configured() { return !!(this.url && this.key); }

  async connect() {
    this.connected = true;
    return true;
  }

  // ---------------- oda kur ----------------
  async create(name, { solo = false } = {}) {
    this.name = name;
    this.role = 'host';
    this.code = randomCode();
    this.joined = true;

    const code = this.code;
    this.host = new HostRoom(code, { relay: (obj, to) => this._relay(obj, to) });

    if (!solo) {
      if (!this.configured) {
        this._fail('Çok oyunculu mod için Supabase ayarları eksik (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
        return;
      }
      try {
        this.bus = this.busFactory(`ca:${code}`);
        this.bus.onMessage((payload) => this._onGuestTraffic(payload));
        await this.bus.open();
        await this.bus.track({ role: 'host', tag: `host-${code}`, name, code });
      } catch (e) {
        this._fail('Oda açılamadı: Supabase Realtime bağlantısı kurulamadı.');
        return;
      }
      // misafirlerin taze durumu hemen görmesi için
      this._broadcastStatus();
    }

    const p = this.host.addSelf(name);
    this.me = p.id;
    this.hostId = p.id;
    this.host.startLoop();

    // kurucunun kendi istemcisine "joined" — ağa gitmez
    this.emit('joined', {
      t: 'joined', id: p.id, room: code, host: this.hostId,
      phase: this.host.room.phase, colorIdx: p.colorIdx,
    });
    this.host.room.broadcastLobby();
    this._startPing(false);
  }

  // ---------------- odaya katıl ----------------
  async join(code, name) {
    this.name = name;
    this.role = 'guest';
    this.code = String(code || '').toUpperCase().slice(0, 4);
    if (!this.configured) {
      this._fail('Çok oyunculu mod için Supabase ayarları eksik.');
      return;
    }
    this.bus = this.busFactory(`ca:${this.code}`);
    this.bus.onMessage((payload) => this._onHostTraffic(payload));
    this.bus.onPresence((state) => {
      if (presenceHasHost(state)) this.sawHost = true;
      else if (this.joined && this.sawHost && !this.closedByUser) {
        this.emit('close', { t: 'close' });
        this.connected = false;
      }
    });
    try {
      await this.bus.open();
      await this.bus.track({ role: 'guest', tag: this.gid, name });
    } catch (e) {
      this._fail('Sunucuya bağlanılamadı. Sayfayı yenileyip tekrar dene.');
      return;
    }
    for (let i = 0; i < HELLO_TRIES && !this.joined; i++) {
      this._busSend({ k: 'hello', gid: this.gid, name });
      await sleep(HELLO_INTERVAL);
    }
    if (!this.joined) {
      this._fail('Oda bulunamadı. Kodu kontrol et veya yeni oda kur.');
      await this.close(true);
    }
  }

  // ---------------- komut gönder ----------------
  send(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (this.role === 'host' && this.host) {
      if (obj.t === 'leave') { this.close(); return true; }
      if (obj.t === 'ping') return true;
      this.host.hostMessage(obj);
      // kurucu turu başlattıysa misafirlere fazladan tur durumu gitsin
      if (obj.t === 'start' || obj.t === 'restart') this._broadcastStatus();
      return true;
    }
    if (this.role === 'guest' && this.bus && this.joined) {
      if (obj.t === 'leave') { this.close(); return true; }
      if (obj.t === 'ping') return true; // gecikme bus üzerinden ölçülür
      this._busSend({ k: 'msg', gid: this.gid, m: obj });
      return true;
    }
    return false;
  }

  // ---------------- kapanış ----------------
  async close(silent = false) {
    this.closedByUser = !silent;
    this._stopPing();
    if (this.role === 'guest' && this.bus && this.joined) {
      this._busSend({ k: 'bye', gid: this.gid });
    }
    if (this.host) this.host.stop();
    if (this.bus) { try { await this.bus.close(); } catch { /* yoksay */ } }
    this.bus = null;
    this.connected = false;
    this.joined = false;
    if (!silent) this.emit('close', { t: 'close' });
  }

  // ---------------- host → dünya ----------------
  _relay(obj, to) {
    // kurucunun kendi ekranı
    if (!to) this.emit(obj.t, obj);
    // misafirlere yayın (hata olsa da oyun devam eder)
    this._busSend({ k: 'out', to: to || null, m: obj });
  }

  _busSend(payload) {
    if (!this.bus) return;
    try {
      const p = this.bus.send(payload);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* yoksay */ }
  }

  _broadcastStatus() {
    if (!this.bus || !this.host) return;
    const room = this.host.room;
    this._busSend({
      k: 'status',
      phase: room.phase,
      host: room.hostId,
      count: room.players.size,
    });
  }

  _onGuestTraffic(payload) {
    if (!payload || this.role !== 'host') return;
    const { k, gid } = payload;
    if (!gid || gid === this.gid) return;
    switch (k) {
      case 'hello': {
        const p = this.host.join(gid, payload.name);
        if (!p) {
          this._busSend({ k: 'out', to: gid, m: { t: 'error', msg: 'Oda dolu (en fazla 4 bekçi).' } });
          return;
        }
        this._busSend({
          k: 'out', to: gid,
          m: {
            t: 'joined', id: p.id, room: this.code, host: this.host.room.hostId,
            phase: this.host.room.phase, colorIdx: p.colorIdx,
          },
        });
        this.host.room.broadcastLobby();
        this.host.room.broadcast();
        break;
      }
      case 'msg':
        this.host.message(gid, payload.m);
        break;
      case 'ping':
        this._busSend({ k: 'out', to: gid, m: { t: 'pong', c: payload.c } });
        break;
      case 'bye':
        this.host.leave(gid);
        break;
      default:
        break;
    }
  }

  // ---------------- misafir → host trafiği ----------------
  _onHostTraffic(payload) {
    if (!payload || this.role !== 'guest' || !this.bus) return;
    switch (payload.k) {
      case 'out': {
        if (payload.to && payload.to !== this.gid) return;
        const m = payload.m;
        if (!m) return;
        if (m.t === 'pong') { this.latency = Math.max(0, Math.round((Date.now() - m.c) / 2)); return; }
        if (m.t === 'joined') {
          if (this.joined) return;
          this.joined = true;
          this.me = m.id;
          this.hostId = m.host;
          this.connected = true;
          this.emit('joined', m);
          this._startPing(true);
          return;
        }
        this.emit(m.t, m);
        break;
      }
      case 'status':
        // tur başladıysa lobide bekleyen istemci oyuna girsin
        if (payload.host) this.hostId = payload.host;
        this.emit('status', payload);
        break;
      default:
        break;
    }
  }

  // ---------------- gecikme ----------------
  _startPing(remote) {
    this._stopPing();
    if (!remote) return;
    this.pingTimer = setInterval(() => {
      if (this.joined) this._busSend({ k: 'ping', gid: this.gid, c: Date.now() });
    }, 2500);
  }

  _stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  _fail(message) {
    this.emit('error', { t: 'error', msg: message });
  }
}

export { LocalNetwork };
