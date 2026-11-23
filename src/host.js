// ---------------------------------------------------------------------------
// Tarayıcı içi otoriter oda (host)
//
// Sunucudaki `Room` sınıfı (server/sim.js) hiç değiştirilmeden tarayıcıda
// çalıştırılır. Simülasyon yalnızca `io.to(code).emit('json', obj)` üzerinden
// konuştuğu için, bu kanalı Supabase Realtime yayınına bağlamak yeterli.
//
// Kurucunun sekmesi oyun sunucusudur:
//   - 30 Hz simülasyon adımı, 15 Hz snapshot yayını
//   - misafirlerden gelen komutlar `room.handle(player, msg)` ile işlenir
// ---------------------------------------------------------------------------
import { Room } from '../server/sim.js';

export class HostRoom {
  /**
   * @param {string} code oda kodu
   * @param {{ relay: (obj: any, to?: string|null) => void }} io
   *        relay: mesajı yerel istemciye + misafirlere iletir
   */
  constructor(code, { relay }) {
    this.code = code;
    this.relay = relay;
    this.byTag = new Map();   // misafir etiketi → oyuncu
    this.tagById = new Map(); // oyuncu id → misafir etiketi
    this.room = new Room(code, {
      to: () => ({ emit: (_evt, obj) => relay(obj, null) }),
    });
    this.timer = null;
    this.last = 0;
  }

  get phase() { return this.room.phase; }

  /** Kurucunun kendisini odaya ekler. */
  addSelf(name) {
    const p = this.room.addPlayer(this._fakeWs(null), name);
    return p;
  }

  /** Misafir geldi → oyuncu oluştur (oda doluysa null). */
  join(tag, name) {
    const existing = this.byTag.get(tag);
    if (existing) return existing;
    if (this.room.players.size >= 4) return null;
    const p = this.room.addPlayer(this._fakeWs(tag), name);
    if (!p) return null;
    this.byTag.set(tag, p);
    this.tagById.set(p.id, tag);
    return p;
  }

  /** Misafir komutu. */
  message(tag, msg) {
    const p = this.byTag.get(tag);
    if (!p || !msg || typeof msg !== 'object') return;
    this.room.handle(p, msg);
  }

  /** Misafir ayrıldı. */
  leave(tag) {
    const p = this.byTag.get(tag);
    if (!p) return;
    this.byTag.delete(tag);
    this.tagById.delete(p.id);
    this.room.removePlayer(p.id);
  }

  /** Kurucunun kendi komutu (host oyuncu). */
  hostMessage(msg) {
    const me = this.room.players.get(this.room.hostId);
    if (me) this.room.handle(me, msg);
  }

  _fakeWs(tag) {
    return {
      readyState: 1,
      roomCode: this.code,
      // sim.js oyuncuya özel mesaj göndermiyor; yine de güvenli bir kanal bırak
      send: (raw) => {
        try {
          const obj = JSON.parse(raw);
          if (tag) this.relay(obj, tag);
        } catch { /* yoksay */ }
      },
    };
  }

  /** Sunucudaki RoomManager.startLoop() ile birebir aynı zamanlama. */
  startLoop() {
    if (this.timer) return;
    this.last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      const room = this.room;
      if (room.phase === 'playing') {
        room.step(dt);
      } else if (room.phase === 'lobby') {
        room.t += dt;
        room.stepPlayers(dt);
        room.snapshotTick++;
        if (room.snapshotTick % 6 === 0) room.broadcast();
      }
      // boşalan odayı kapat
      if (room.players.size === 0 && this.timer) this.stop();
    }, 1000 / 30);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
