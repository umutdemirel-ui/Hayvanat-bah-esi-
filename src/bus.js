// ---------------------------------------------------------------------------
// Oda veri yolu (bus) — Supabase Realtime Broadcast / Presence sarmalayıcısı
//
// Host ve misafir aynı bus arayüzünü kullanır:
//   await bus.open()            → kanala abone ol
//   bus.send(payload)           → odadaki herkese yayın (kendine gelmez)
//   bus.track(meta)             → presence (kim odada?)
//   bus.onMessage(fn)           → gelen payload
//   bus.onPresence(fn)          → presence değişimi
//   bus.close()                 → ayrıl
//
// Testler `LocalBus` ile aynı arayüzü ağ olmadan kullanır.
// ---------------------------------------------------------------------------

export const MP_EVENT = 'mp';

/** Kanaldaki herkesin ortak olduğu, tarayıcı içi sahte bus (test / çevrimdışı). */
export class LocalBus {
  constructor(net, topic) {
    this.net = net;
    this.topic = topic;
    this.handlers = new Set();
    this.presenceHandlers = new Set();
    this.meta = null;
    this.closed = false;
  }

  async open() {
    this.net.channels.add(this);
    this._syncPresence();
    return this;
  }

  send(payload) {
    if (this.closed) return Promise.resolve('closed');
    for (const ch of this.net.channels) {
      if (ch === this || ch.topic !== this.topic) continue;
      // gerçek Realtime gibi asenkron teslim et
      Promise.resolve().then(() => { if (!ch.closed) ch._deliver(payload); });
    }
    return Promise.resolve('ok');
  }

  track(meta) {
    this.meta = meta;
    this._syncPresence();
    return Promise.resolve('ok');
  }

  onMessage(fn) { this.handlers.add(fn); return this; }
  onPresence(fn) { this.presenceHandlers.add(fn); return this; }

  _deliver(payload) { for (const fn of this.handlers) fn(payload); }

  _syncPresence() {
    for (const ch of this.net.channels) {
      if (ch.topic !== this.topic) continue;
      const state = {};
      let i = 0;
      for (const other of this.net.channels) {
        if (other.topic !== this.topic || !other.meta) continue;
        state[`p${i++}`] = [other.meta];
      }
      for (const fn of ch.presenceHandlers) fn(state);
    }
  }

  close() {
    this.closed = true;
    this.net.channels.delete(this);
    this._syncPresence();
    return Promise.resolve('ok');
  }
}

/** Basit ağ: LocalBus örnekleri için ortak kanal defteri. */
export class LocalNetwork {
  constructor() { this.channels = new Set(); }
  bus(topic) { return new LocalBus(this, topic); }
}

// ---------------------------------------------------------------------------
// Supabase Realtime bus
// ---------------------------------------------------------------------------
export class SupaBus {
  constructor({ url, key }) {
    this.url = url;
    this.key = key;
    this.topic = null;
    this.client = null;
    this.channel = null;
    this.handlers = new Set();
    this.presenceHandlers = new Set();
    this.status = 'idle';
    this.meta = null;
  }

  async open(topic) {
    this.topic = topic;
    if (!this.client) {
      const mod = await import('@supabase/supabase-js');
      this.client = mod.createClient(this.url, this.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 40 } },
      });
    }
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setTimeout(() => reject(new Error('realtime-timeout')), 12000);
      const ch = this.client.channel(topic, {
        config: { broadcast: { self: false, ack: false }, presence: { key: this.meta?.tag || undefined } },
      });
      ch.on('broadcast', { event: MP_EVENT }, ({ payload }) => {
        for (const fn of this.handlers) fn(payload);
      });
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        for (const fn of this.presenceHandlers) fn(state);
      });
      ch.subscribe((status) => {
        this.status = status;
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          this.channel = ch;
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // supabase-js kendi yeniden bağlanma denemesini yapar; ilk saniyelerdeki
          // dalgalanmayı hata sayma, sadece uzun süren başarısızlığı bildir.
          if (Date.now() - start > 6000) {
            clearTimeout(timer);
            reject(new Error(status.toLowerCase()));
          }
        }
      });
    });
    return this;
  }

  send(payload) {
    if (!this.channel) return Promise.resolve('closed');
    return this.channel.send({ type: 'broadcast', event: MP_EVENT, payload });
  }

  track(meta) {
    this.meta = meta;
    if (!this.channel) return Promise.resolve('closed');
    return this.channel.track(meta);
  }

  onMessage(fn) { this.handlers.add(fn); return this; }
  onPresence(fn) { this.presenceHandlers.add(fn); return this; }

  async close() {
    if (this.channel && this.client) {
      try { await this.client.removeChannel(this.channel); } catch { /* yoksay */ }
    }
    this.channel = null;
  }
}

/** Presence durumundan kurucu var mı? */
export function presenceHasHost(state) {
  if (!state) return false;
  for (const key of Object.keys(state)) {
    const list = state[key];
    if (Array.isArray(list) && list.some((m) => m && m.role === 'host')) return true;
  }
  return false;
}
