// ---------------------------------------------------------------------------
// Oyun simülasyonu — sunucu yetkili (authoritative)
// ---------------------------------------------------------------------------
import {
  WORLD, ROUND, SPECIES, ANIMAL_SPAWNS, COLORS,
  clamp, dist2, rand,
} from '../shared/config.js';
import { MAP, resolveCollisions } from '../shared/map.js';

export const TICK = 1 / 30;
export const SNAPSHOT_EVERY = 2; // 15 Hz

let nextId = 1;
const uid = () => nextId++;

const EMOTES = {
  help: 'Yardım edin! 🆘',
  haha: 'Hahaha 😂',
  sorry: 'Pardon 🙏',
  mine: 'Benim hayvanım! 😤',
  come: 'Buraya gel! 👋',
  troll: 'İzle şimdi 😈',
};

function makeAnimal(spawn, i) {
  const sp = SPECIES[spawn.species];
  const p = resolveCollisions(spawn.x + rand(-1.5, 1.5), spawn.z + rand(-1.5, 1.5), sp.radius * 0.9);
  return {
    id: uid(),
    species: spawn.species,
    x: p.x, z: p.z,
    yaw: rand(0, Math.PI * 2),
    vx: 0, vz: 0,
    capture: 0,
    anger: rand(0.2, 0.55),
    attackCd: 0,
    slowUntil: 0,
    stuckUntil: 0,
    eatUntil: 0,
    scaredUntil: 0,
    scaredX: 0, scaredZ: 0,
    stealCd: 0,
    hopCd: rand(2, 5),
    chargeUntil: 0,
    chargeX: 0, chargeZ: 0,
    wanderX: spawn.x, wanderZ: spawn.z,
    wanderCd: 0,
    avoidCd: 0,
    saver: 0,
    loot: 0,
    lootItems: [],
    stam: 1,
    lastNetAt: 0,
    growlAt: 0,
    iframeUntil: 0,
    netHitters: [],
    idx: i,
    moving: 0,
  };
}

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.players = new Map();
    this.animals = [];
    this.projectiles = [];
    this.traps = [];
    this.baits = [];
    this.peels = [];
    this.bombs = [];
    this.phase = 'lobby';
    this.t = 0;
    this.timeLeft = ROUND.time;
    this.hostId = null;
    this.events = [];
    this.caught = [];
    this.wipeCount = 0;
    this.lastJoin = 0;
    this.snapshotTick = 0;
    this.startedAt = 0;
    this.bestTime = null;
    this.tickHandle = null;
    this.emptySince = Date.now();
  }

  // ---------------- oyuncu yönetimi ----------------
  addPlayer(ws, name) {
    if (this.players.size >= 4) return null;
    const id = uid();
    const spawn = MAP.playerSpawns[this.players.size % 4];
    const p = {
      id,
      ws,
      name: (name || 'Bekçi').slice(0, 14).trim() || 'Bekçi',
      colorIdx: this.players.size % COLORS.length,
      x: spawn.x, z: spawn.z, yaw: 0,
      hp: WORLD.playerMaxHp,
      downed: false,
      downedAt: 0,
      score: 0,
      catches: 0,
      assists: 0,
      revives: 0,
      timesDowned: 0,
      troll: 0,
      stats: { netted: 0, shoved: 0, trapped: 0, stole: 0, nettedBy: 0 },
      charges: { ...ROUND.startingToolCharges },
      cds: {},
      stunUntil: 0,
      slowUntil: 0,
      netUntil: 0,
      slipUntil: 0,
      dizzyUntil: 0,
      deafUntil: 0,
      kvx: 0, kvz: 0,
      iframeUntil: 0,
      netLockUntil: 0,
      regen: { dart: 0, bait: 0, trap: 0 },
      moving: 0,
      sprint: 0,
      lastMoveAt: Date.now(),
      lastInteractAt: 0,
      revive: null,
      emoteUntil: 0,
      emote: null,
      joinedAt: Date.now(),
      lastPacket: Date.now(),
      reward: null,
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    this.emptySince = 0;
    this.pushEvent({ kind: 'join', id, name: p.name });
    this.broadcastLobby();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.trollTargetOf) delete this.trollTargetOf[id];
    if (this.hostId === id) {
      const next = this.players.values().next().value;
      this.hostId = next ? next.id : null;
    }
    this.pushEvent({ kind: 'leave', id, name: p.name });
    this.broadcastLobby();
    if (this.players.size === 0) this.emptySince = Date.now();
  }

  broadcastLobby() {
    const list = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, colorIdx: p.colorIdx, host: p.id === this.hostId,
    }));
    this.io.to(this.code).emit('json', {
      t: 'lobby', room: this.code, host: this.hostId,
      phase: this.phase, players: list,
    });
  }

  // ---------------- tur akışı ----------------
  start(playerId) {
    if (this.phase === 'playing') return;
    if (this.phase === 'lobby' && playerId && playerId !== this.hostId) return;
    this.phase = 'playing';
    this.t = 0;
    this.wipeAt = null;
    this.timeLeft = ROUND.time;
    this.animals = ANIMAL_SPAWNS.map((s, i) => makeAnimal(s, i));
    this.projectiles = [];
    this.traps = [];
    this.baits = [];
    this.peels = [];
    this.bombs = [];
    this.caught = [];
    this.events = [];
    this.wipeCount = 0;
    let i = 0;
    for (const p of this.players.values()) {
      const spawn = MAP.playerSpawns[i % 4];
      i++;
      p.x = spawn.x; p.z = spawn.z; p.yaw = Math.PI;
      p.hp = WORLD.playerMaxHp;
      p.downed = false;
      p.score = 0; p.catches = 0; p.assists = 0; p.revives = 0; p.timesDowned = 0; p.troll = 0;
      p.stats = { netted: 0, shoved: 0, trapped: 0, stole: 0, nettedBy: 0 };
      p.charges = { ...ROUND.startingToolCharges };
      p.cds = {};
      p.netUntil = 0; p.slipUntil = 0; p.dizzyUntil = 0; p.stunUntil = 0; p.slowUntil = 0;
      p.iframeUntil = 0; p.netLockUntil = 0;
      p.regen = { dart: 0, bait: 0, trap: 0 };
      p.revive = null; p.reward = null;
    }
    this.pushEvent({ kind: 'start' });
    this.broadcastLobby();
  }

  endRound(win, reason) {
    if (this.phase !== 'playing') return;
    this.phase = 'ended';
    for (const p of this.players.values()) p.reward = this.awards(p);
    this.bestTime = this.t;
    this.pushEvent({
      kind: 'end', win, reason,
      caught: this.caught.length,
      total: ANIMAL_SPAWNS.length,
      time: this.t,
      rewards: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, colorIdx: p.colorIdx, ...p.reward,
      })),
      caughtList: this.caught,
    });
    this.flushEvents();
    this.broadcastLobby();
    this.broadcast();
  }

  awards(p) {
    const troll = p.stats.netted + p.stats.trapped + p.stats.shoved + p.stats.stole;
    return {
      score: p.score,
      catches: p.catches,
      assists: p.assists,
      revives: p.revives,
      downed: p.timesDowned,
      troll,
      title: troll > 2 ? 'Trolün Kralı 😈'
        : p.catches >= 3 ? 'Büyük Avcı 🏆'
          : p.revives > 0 ? 'Şifacı 🩹'
            : p.timesDowned > 2 ? 'Aslan Yemi 🥩' : 'Gönüllü Çırak',
    };
  }

  pushEvent(e) {
    this.events.push(e);
  }

  // ---------------- mesajlar ----------------
  handle(p, msg) {
    p.lastPacket = Date.now();
    switch (msg.t) {
      case 'move': this.onMove(p, msg); break;
      case 'act': this.onAct(p, msg); break;
      case 'interact': this.onInteract(p, msg); break;
      case 'emote': this.onEmote(p, msg); break;
      case 'start': this.start(p.id); break;
      case 'restart': this.start(p.id); break;
      case 'lobby': this.broadcastLobby(); break;
      default: break;
    }
  }

  onMove(p, m) {
    // lobide de hareket serbest
    const tx = Number(m.x), tz = Number(m.z);
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;
    const now = Date.now();
    const dt = clamp((now - p.lastMoveAt) / 1000, 0.008, 0.35);
    p.lastMoveAt = now;
    const maxStep = WORLD.playerSpeed * 1.55 * dt + 0.55;
    let nx = tx, nz = tz;
    const dx = nx - p.x, dz = nz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > maxStep) {
      nx = p.x + (dx / d) * maxStep;
      nz = p.z + (dz / d) * maxStep;
    }
    const res = resolveCollisions(nx, nz, WORLD.playerRadius);
    p.x = res.x; p.z = res.z;
    if (Number.isFinite(m.yaw)) p.yaw = m.yaw;
    p.moving = m.mv ? 1 : 0;
    p.sprint = m.sp ? 1 : 0;
  }

  onEmote(p, m) {
    p.emote = EMOTES[m.id] || null;
    p.emoteUntil = this.t + 3;
    if (p.emote) this.pushEvent({ kind: 'emote', id: p.id, text: p.emote });
  }

  canUse(p, tool) {
    const cfg = {
      net: { cd: 0.95 },
      dart: { cd: 5, charge: 'dart' },
      bait: { cd: 6.5, charge: 'bait' },
      trap: { cd: 8.5, charge: 'trap' },
      shove: { cd: 2.6 },
      peel: { cd: 8 },
      fire: { cd: 11 },
    }[tool];
    if (!cfg) return false;
    if (p.downed) return false;
    if ((p.cds[tool] || 0) > this.t) return false;
    if (cfg.charge && (p.charges[cfg.charge] || 0) <= 0) return false;
    if (p.netUntil > this.t || p.stunUntil > this.t) return false;
    if (tool === 'net' && p.netLockUntil > this.t) return false;
    return cfg;
  }

  onAct(p, m) {
    if (this.phase !== 'playing') return;
    const cfg = this.canUse(p, m.tool);
    if (!cfg) return;
    p.cds[m.tool] = this.t + cfg.cd;
    if (cfg.charge) p.charges[cfg.charge]--;

    let yaw = Number.isFinite(m.yaw) ? m.yaw : p.yaw;
    let dirX = Math.sin(yaw), dirZ = Math.cos(yaw);

    // hafif nişan yardımı: yakındaki hayvana doğru yönü yumuşakça çek
    if (m.tool === 'net' || m.tool === 'dart') {
      let best = null, bestDot = Math.cos(0.16);
      for (const a of this.animals) {
        const dx = a.x - p.x, dz = a.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6 || d > 10) continue;
        const dot = (dx / d) * dirX + (dz / d) * dirZ;
        if (dot > bestDot) { bestDot = dot; best = a; }
      }
      if (best) {
        const dx = best.x - p.x, dz = best.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        dirX = dirX * 0.45 + (dx / d) * 0.55;
        dirZ = dirZ * 0.45 + (dz / d) * 0.55;
        const l = Math.hypot(dirX, dirZ) || 1;
        dirX /= l; dirZ /= l;
        yaw = Math.atan2(dirX, dirZ);
      }
    }

    switch (m.tool) {
      case 'net':
        this.projectiles.push({
          id: uid(), kind: 'net', owner: p.id,
          x: p.x + dirX * 0.9, z: p.z + dirZ * 0.9,
          vx: dirX * 34, vz: dirZ * 34,
          life: 0.5, spin: 0,
        });
        break;
      case 'dart':
        this.projectiles.push({
          id: uid(), kind: 'dart', owner: p.id,
          x: p.x + dirX * 0.9, z: p.z + dirZ * 0.9,
          vx: dirX * 48, vz: dirZ * 48,
          life: 0.4, spin: 0,
        });
        break;
      case 'bait':
        this.baits.push({
          id: uid(), owner: p.id, x: p.x + dirX * 1.8, z: p.z + dirZ * 1.8,
          life: 14, captured: 0, eaters: 0,
        });
        this.pushEvent({ kind: 'sfx', sfx: 'bait', x: p.x, z: p.z });
        break;
      case 'trap':
        this.traps.push({
          id: uid(), owner: p.id, x: p.x + dirX * 1.6, z: p.z + dirZ * 1.6,
          life: 45, armAt: this.t + 0.6, used: false,
        });
        this.pushEvent({ kind: 'sfx', sfx: 'trap', x: p.x, z: p.z });
        break;
      case 'shove': {
        let hit = 0;
        for (const o of this.players.values()) {
          if (o.id === p.id) continue;
          const dx = o.x - p.x, dz = o.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d > 2.6) continue;
          const dot = (dx / (d || 1)) * dirX + (dz / (d || 1)) * dirZ;
          if (dot < 0.05) continue;
          o.kvx += (dx / (d || 1)) * 13;
          o.kvz += (dz / (d || 1)) * 13;
          o.stunUntil = Math.max(o.stunUntil, this.t + 0.85);
          hit++;
          p.stats.shoved++; p.troll++;
          this.pushEvent({ kind: 'shove', by: p.id, target: o.id });
        }
        for (const a of this.animals) {
          const d = Math.hypot(a.x - p.x, a.z - p.z);
          if (d < 2.8) {
            a.anger = clamp(a.anger + 0.25, 0, 1.4);
            a.attackCd = 0;
            if (a.species === 'fil') { a.vx += dirX * 6; a.vz += dirZ * 6; }
            hit++;
          }
        }
        if (!hit) this.pushEvent({ kind: 'sfx', sfx: 'whiff', x: p.x, z: p.z });
        break;
      }
      case 'peel':
        this.peels.push({
          id: uid(), owner: p.id,
          x: p.x + dirX * 1.9, z: p.z + dirZ * 1.9, life: 35,
        });
        break;
      case 'fire':
        this.bombs.push({
          id: uid(), owner: p.id,
          x: p.x + dirX * 3.2, z: p.z + dirZ * 3.2, fuse: this.t + 0.75,
        });
        this.pushEvent({ kind: 'sfx', sfx: 'fuse', x: p.x, z: p.z });
        break;
      default: break;
    }
  }

  onInteract(p, m) {
    if (this.phase !== 'playing' || p.downed) return;
    const target = this.players.get(m.targetId);
    if (!target || !target.downed) { p.revive = null; return; }
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d > WORLD.reviveRange) {
      // menzilden çıkınca ilerleme sıfırlanmaz, yavaşça erir
      if (p.revive && p.revive.id === target.id) {
        p.revive.progress = Math.max(0, p.revive.progress - 0.35);
        if (p.revive.progress <= 0) p.revive = null;
      }
      return;
    }
    if (!p.revive || p.revive.id !== target.id) p.revive = { id: target.id, progress: 0 };
    const now = Date.now();
    const dt = clamp((now - (p.lastInteractAt || now - 33)) / 1000, 0, 0.12);
    p.lastInteractAt = now;
    p.revive.progress += dt;
    if (p.revive.progress >= WORLD.reviveTime) {
      target.downed = false;
      target.hp = 60;
      target.kvx = 0; target.kvz = 0;
      p.revive = null;
      p.revives++;
      p.score += 40;
      this.pushEvent({ kind: 'revive', by: p.id, target: target.id });
    }
  }

  // ---------------- hasar / yakalama ----------------
  hitPlayer(target, dmg, srcX, srcZ, cause, opts = {}) {
    if (!target || target.downed) return;
    if (target.iframeUntil > this.t) return;
    target.iframeUntil = this.t + 0.65;
    target.hp -= dmg;
    target.lastHurtAt = this.t;
    const dx = target.x - srcX, dz = target.z - srcZ;
    const d = Math.hypot(dx, dz) || 1;
    const force = opts.force ?? 9;
    target.kvx += (dx / d) * force;
    target.kvz += (dz / d) * force;
    this.pushEvent({
      kind: 'hit', id: target.id, dmg: Math.round(dmg), cause,
      x: target.x, z: target.z, by: opts.by || null,
    });
    if (target.hp <= 0) {
      target.hp = 0;
      target.downed = true;
      target.downedAt = this.t;
      target.revive = null;
      target.timesDowned++;
      target.stunUntil = this.t + 0.4;
      this.pushEvent({ kind: 'downed', id: target.id, cause });
      if (opts.by) {
        const by = this.players.get(opts.by);
        if (by && by.id !== target.id) { by.stats.netted += 0; }
      }
    }
  }

  hitAnimal(a, kind, ownerId) {
    const sp = SPECIES[a.species];
    const slowed = a.slowUntil > this.t;
    const eating = a.eatUntil > this.t;
    const stuck = a.stuckUntil > this.t;
    if (kind === 'net') {
      let gain = 26;
      if (slowed) gain += 16;
      if (eating) gain += 26;
      if (stuck) gain += 30;
      a.capture = clamp(a.capture + gain, 0, 100);
      a.lastNetAt = this.t;
      a.anger = clamp(a.anger + 0.22, 0, 1.5);
      if (!a.netHitters.includes(ownerId)) a.netHitters.push(ownerId);
      this.pushEvent({
        kind: 'netHit', animalId: a.id, species: a.species, by: ownerId,
        x: a.x, z: a.z, gain, capture: a.capture,
      });
      if (a.capture >= 100) this.catchAnimal(a, ownerId);
    } else if (kind === 'dart') {
      a.slowUntil = Math.max(a.slowUntil, this.t + 6);
      a.anger = clamp(a.anger - 0.25, 0, 1.5);
      a.capture = clamp(a.capture + 14, 0, 100);
      if (!a.netHitters.includes(ownerId)) a.netHitters.push(ownerId);
      this.pushEvent({ kind: 'dartHit', animalId: a.id, species: a.species, by: ownerId, x: a.x, z: a.z });
    } else if (kind === 'scare') {
      a.anger = clamp(a.anger - 0.5, 0, 1.5);
      a.scaredUntil = this.t + 4;
    }
  }

  catchAnimal(a, ownerId) {
    const sp = SPECIES[a.species];
    const idx = this.animals.indexOf(a);
    if (idx < 0) return;
    this.animals.splice(idx, 1);

    // ekip bonusu: yakınlarda başka oyuncu varsa +%25
    let nearby = 0;
    for (const p of this.players.values()) {
      if (p.downed) continue;
      if (dist2(p.x, p.z, a.x, a.z) < 8 * 8) nearby++;
    }
    const teamBonus = nearby >= 2 ? 1.25 : 1;
    const base = Math.round(sp.points * teamBonus);
    const owner = this.players.get(ownerId);
    const hitters = a.netHitters.filter((h) => this.players.has(h));
    if (owner) {
      owner.catches++;
      owner.score += base;
      if (a.lootItems && a.lootItems.length) {
        const maxes = { dart: 4, bait: 4, trap: 3 };
        for (const item of a.lootItems) {
          owner.charges[item] = Math.min(maxes[item] ?? 4, (owner.charges[item] || 0) + 1);
        }
        a.lootItems = [];
        a.loot = 0;
      }
      // yakalama ödülü: tüm araçlardan +1
      owner.charges.dart = Math.min(4, owner.charges.dart + 1);
      owner.charges.bait = Math.min(4, owner.charges.bait + 1);
      owner.charges.trap = Math.min(3, owner.charges.trap + 1);
      owner.netLockUntil = 0;
    }
    // yardımcılar
    for (const h of hitters) {
      if (h === ownerId) continue;
      const hp = this.players.get(h);
      if (!hp) continue;
      hp.assists++;
      hp.score += Math.round(base * 0.25);
      this.pushEvent({ kind: 'assist', id: h, animalId: a.id });
    }
    this.caught.push({ species: a.species, by: ownerId, byName: owner ? owner.name : '?', points: base });
    this.pushEvent({
      kind: 'catch', animalId: a.id, species: a.species, by: ownerId,
      byName: owner ? owner.name : '?', points: base, x: a.x, z: a.z,
      teamBonus: teamBonus > 1,
    });

    if (this.animals.length === 0) this.endRound(true, 'all-caught');
  }

  flushEvents() {
    if (!this.events.length) return;
    this.io.to(this.code).emit('json', { t: 'events', list: this.events });
    this.events.length = 0;
  }

  // ---------------- simülasyon adımı ----------------
  step(dt) {
    this.t += dt;
    this.stepPlayers(dt);
    this.stepProjectiles(dt);
    this.stepTraps(dt);
    this.stepBaits(dt);
    this.stepPeels(dt);
    this.stepBombs(dt);
    this.stepAnimals(dt);

    this.flushEvents();

    // tur süresi
    if (this.phase === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound(false, 'timeout');
      }
      // herkes yerdeyse kurtarma ekibi
      const list = [...this.players.values()];
      if (list.length > 1 && list.every((p) => p.downed)) {
        if (!this.wipeAt) this.wipeAt = this.t + 3;
        else if (this.t >= this.wipeAt) {
          this.wipeAt = null;
          this.wipeCount++;
          this.timeLeft = Math.max(20, this.timeLeft - 30);
          for (const p of list) { p.downed = false; p.hp = 55; p.kvx = 0; p.kvz = 0; }
          this.pushEvent({ kind: 'rescue', penalty: 30 });
        }
      } else if (this.wipeAt) this.wipeAt = null;
    }

    this.snapshotTick++;
    if (this.snapshotTick % SNAPSHOT_EVERY === 0) this.broadcast();
  }

  stepPlayers(dt) {
    for (const p of this.players.values()) {
      // binek/knockback
      if (Math.abs(p.kvx) > 0.01 || Math.abs(p.kvz) > 0.01) {
        const r = resolveCollisions(p.x + p.kvx * dt, p.z + p.kvz * dt, WORLD.playerRadius);
        p.x = r.x; p.z = r.z;
        const decay = Math.pow(0.02, dt);
        p.kvx *= decay; p.kvz *= decay;
      }
      // araç yenilenmesi
      for (const key of ['dart', 'bait', 'trap']) {
        const cfg = { dart: { max: 4, regen: 26 }, bait: { max: 4, regen: 22 }, trap: { max: 3, regen: 30 } }[key];
        if ((p.charges[key] || 0) < cfg.max) {
          p.regen[key] += dt;
          if (p.regen[key] >= cfg.regen) {
            p.regen[key] = 0;
            p.charges[key]++;
            this.pushEvent({ kind: 'recharge', id: p.id, tool: key });
          }
        } else p.regen[key] = 0;
      }
      // kendini iyileştirme (yavaş)
      if (!p.downed && p.hp > 0 && p.hp < WORLD.playerMaxHp && this.t - (p.lastHurtAt || -99) > 5) {
        p.hp = Math.min(WORLD.playerMaxHp, p.hp + 3 * dt * 4);
      }
      // tek başına otomatik kalkma
      const autoT = this.players.size === 1 ? 8 : WORLD.autoReviveTime;
      if (p.downed && this.t - p.downedAt > autoT) {
        p.downed = false;
        p.hp = 40;
        this.pushEvent({ kind: 'selfRevive', id: p.id });
      }
      // pasif trol göstergeleri sıfırla
      if (p.netUntil && p.netUntil < this.t) p.netUntil = 0;
      if (p.slipUntil && p.slipUntil < this.t) p.slipUntil = 0;
      if (p.dizzyUntil && p.dizzyUntil < this.t) p.dizzyUntil = 0;
    }
  }

  stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.life -= dt;
      pr.spin += dt * 12;
      let dead = pr.life <= 0;

      // duvara çarpma
      if (!dead) {
        for (const w of MAP.walls) {
          if (Math.abs(pr.x - w.x) < w.w / 2 && Math.abs(pr.z - w.z) < w.d / 2 && w.h > 1) {
            dead = true;
            this.pushEvent({ kind: 'sfx', sfx: 'thud', x: pr.x, z: pr.z });
            break;
          }
        }
      }

      // hayvanlara isabet
      if (!dead) {
        for (const a of this.animals) {
          const sp = SPECIES[a.species];
          if (dist2(pr.x, pr.z, a.x, a.z) < (sp.radius + 0.75) ** 2) {
            this.hitAnimal(a, pr.kind, pr.owner);
            dead = true;
            break;
          }
        }
      }

      // oyunculara isabet (trolleme!)
      if (!dead) {
        for (const p of this.players.values()) {
          if (p.id === pr.owner || p.downed) continue;
          if (dist2(pr.x, pr.z, p.x, p.z) < 0.95 * 0.95) {
            if (pr.kind === 'net') {
              p.netUntil = Math.max(p.netUntil, this.t + 2.6);
              const shooter = this.players.get(pr.owner);
              if (shooter) { shooter.stats.netted++; shooter.troll++; }
              p.stats.nettedBy++;
              this.pushEvent({ kind: 'trollNet', by: pr.owner, target: p.id, x: p.x, z: p.z });
            } else {
              p.stunUntil = Math.max(p.stunUntil, this.t + 0.9);
              p.dizzyUntil = Math.max(p.dizzyUntil, this.t + 3.2);
              p.slowUntil = Math.max(p.slowUntil, this.t + 3);
              this.hitPlayer(p, 6, pr.x, pr.z, 'dart', { force: 3, by: pr.owner });
              this.pushEvent({ kind: 'trollDart', by: pr.owner, target: p.id, x: p.x, z: p.z });
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  stepTraps(dt) {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      tr.life -= dt;
      if (tr.life <= 0 || tr.used) { this.traps.splice(i, 1); continue; }
      let consumed = false;
      for (const a of this.animals) {
        if (dist2(tr.x, tr.z, a.x, a.z) < 1.5 * 1.5) {
          if (a.species === 'fil') {
            this.pushEvent({ kind: 'trample', x: tr.x, z: tr.z, animalId: a.id });
            consumed = true;
            break;
          }
          a.stuckUntil = Math.max(a.stuckUntil, this.t + 5);
          this.pushEvent({ kind: 'trapAnimal', animalId: a.id, species: a.species, x: a.x, z: a.z, by: tr.owner });
          this.hitAnimal(a, 'net', tr.owner);
          a.capture = clamp(a.capture + 20, 0, 100);
          if (a.capture >= 100) this.catchAnimal(a, tr.owner);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const p of this.players.values()) {
          if (p.downed || this.t < tr.armAt) continue;
          if (p.id === tr.owner && tr.life > 43) continue;
          if (dist2(tr.x, tr.z, p.x, p.z) < 1.25 * 1.25) {
            p.netUntil = Math.max(p.netUntil, this.t + 2.2);
            const owner = this.players.get(tr.owner);
            if (owner && owner.id !== p.id) { owner.stats.trapped++; owner.troll++; }
            this.pushEvent({ kind: 'trollTrap', by: tr.owner, target: p.id, x: tr.x, z: tr.z });
            consumed = true;
            break;
          }
        }
      }
      if (consumed) this.traps.splice(i, 1);
    }
  }

  stepBaits(dt) {
    for (let i = this.baits.length - 1; i >= 0; i--) {
      const b = this.baits[i];
      b.life -= dt;
      if (b.life <= 0) { this.baits.splice(i, 1); continue; }
      let eaten = false;
      for (const a of this.animals) {
        if (a.eatUntil > this.t) continue;
        if (dist2(a.x, a.z, b.x, b.z) < 1.6 * 1.6) {
          a.eatUntil = this.t + 5;
          a.anger = clamp(a.anger - 0.3, 0, 1.5);
          a.wanderX = b.x; a.wanderZ = b.z;
          this.pushEvent({ kind: 'eating', animalId: a.id, species: a.species, x: a.x, z: a.z });
          eaten = true;
          break;
        }
      }
      if (eaten) { this.baits.splice(i, 1); continue; }
      // arkadaşının yemini aşırmak (trolleme)
      for (const p of this.players.values()) {
        if (p.downed) continue;
        if (dist2(p.x, p.z, b.x, b.z) < 1.1 * 1.1) {
          p.charges.bait++;
          if (b.owner !== p.id) {
            const o = this.players.get(b.owner);
            if (o) { o.stats.stole++; o.troll++; }
            this.pushEvent({ kind: 'baitSteal', by: p.id, owner: b.owner, x: b.x, z: b.z });
          }
          this.baits.splice(i, 1);
          break;
        }
      }
    }
  }

  stepPeels(dt) {
    for (let i = this.peels.length - 1; i >= 0; i--) {
      const pe = this.peels[i];
      pe.life -= dt;
      if (pe.life <= 0) { this.peels.splice(i, 1); continue; }
      let used = false;
      for (const p of this.players.values()) {
        if (p.downed || p.slipUntil > this.t) continue;
        if (dist2(p.x, p.z, pe.x, pe.z) < 1.0 * 1.0) {
          p.slipUntil = this.t + 1.7;
          p.kvx += 2.5; p.kvz += 2.5;
          if (pe.owner !== p.id) {
            const o = this.players.get(pe.owner);
            if (o) o.troll++;
          }
          this.pushEvent({ kind: 'slip', id: p.id, x: pe.x, z: pe.z });
          used = true;
          break;
        }
      }
      if (used) this.peels.splice(i, 1);
    }
  }

  stepBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (this.t >= b.fuse) {
        this.bombs.splice(i, 1);
        this.pushEvent({ kind: 'explode', x: b.x, z: b.z, by: b.owner });
        for (const a of this.animals) {
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < 16) {
            a.scaredUntil = this.t + 4.5;
            a.scaredX = b.x; a.scaredZ = b.z;
            a.eatUntil = 0;
            a.anger = clamp(a.anger - 0.4, 0, 1.5);
            a.capture = clamp(a.capture + 4, 0, 100);
          }
        }
        for (const p of this.players.values()) {
          const d = Math.hypot(p.x - b.x, p.z - b.z);
          if (d < 7) {
            p.deafUntil = this.t + 3;
            p.stunUntil = Math.max(p.stunUntil, this.t + 0.7);
            p.dizzyUntil = Math.max(p.dizzyUntil, this.t + 2);
            if (b.owner !== p.id) {
              const o = this.players.get(b.owner);
              if (o) o.troll++;
            }
          }
        }
      }
    }
  }

  stepAnimals(dt) {
    const players = [...this.players.values()];
    const active = players.filter((p) => !p.downed);

    for (const a of this.animals) {
      const sp = SPECIES[a.species];
      let speed = sp.speed;
      const slowed = a.slowUntil > this.t;
      const stuck = a.stuckUntil > this.t;
      const eating = a.eatUntil > this.t;
      const scared = a.scaredUntil > this.t;
      if (slowed) speed *= 0.42;

      // en yakın tehdit
      let near = null, nd = Infinity;
      for (const p of active) {
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d < nd) { nd = d; near = p; }
      }

      // yakalama göstergesi zamanla sönümlenir (komitmen ol)
      if (a.capture > 0 && a.capture < 100 && this.t - (a.lastNetAt || 0) > 9) {
        a.capture = Math.max(0, a.capture - dt * 1.8);
      }

      // saldırganlık doğal artış
      a.anger = clamp(a.anger + dt * 0.012, 0, 2);
      a.attackCd = Math.max(0, a.attackCd - dt);
      a.stealCd = Math.max(0, a.stealCd - dt);
      a.hopCd = Math.max(0, a.hopCd - dt);
      a.wanderCd -= dt;
      a.avoidCd = Math.max(0, a.avoidCd - dt);

      let tx = null, tz = null; let mode = 'roam';

      if (stuck) {
        mode = 'stuck';
      } else if (eating) {
        mode = 'eat';
      } else if (scared && !slowed) {
        mode = 'flee';
        const dx = a.x - a.scaredX, dz = a.z - a.scaredZ;
        const d = Math.hypot(dx, dz) || 1;
        tx = a.x + (dx / d) * 12;
        tz = a.z + (dz / d) * 12;
        speed *= 1.15;
      } else if (near && nd < sp.aggroRange) {
        const wantsFight = a.anger > (1 - sp.aggression) * 0.85 + (nd < 5 ? 0.18 : 0);
        if (wantsFight) {
          mode = 'chase';
          tx = near.x; tz = near.z;
          if (nd < 8 && this.t > (a.growlAt || 0)) {
            a.growlAt = this.t + 12;
            this.pushEvent({ kind: 'roar', animalId: a.id, species: a.species, x: a.x, z: a.z });
          }
          if (sp.ambush && a.chargeUntil < this.t && nd < 16 && nd > 4) {
            a.chargeUntil = this.t + 1.3;
            a.chargeX = near.x; a.chargeZ = near.z;
            this.pushEvent({ kind: 'roar', animalId: a.id, species: a.species, x: a.x, z: a.z });
          }
          if (sp.ambush && a.chargeUntil > this.t) {
            tx = a.chargeX; tz = a.chargeZ;
            speed *= 1.5;
          }
        } else {
          mode = 'flee';
          const dx = a.x - near.x, dz = a.z - near.z;
          const d = Math.hypot(dx, dz) || 1;
          // kaçarken duvara sıkışmasın: engel varsa yana kaç
          tx = a.x + (dx / d) * 10;
          tz = a.z + (dz / d) * 10;
          speed *= 1.0;
        }
      }

      // yem arama (saldırmıyorsa)
      if (mode === 'roam' || (mode === 'flee' && a.anger < 0.4)) {
        let best = null, bd = 15 * 15;
        for (const b of this.baits) {
          const d = dist2(a.x, a.z, b.x, b.z);
          if (d < bd) { bd = d; best = b; }
        }
        if (best) {
          mode = 'seek';
          tx = best.x; tz = best.z;
        }
      }

      if (mode === 'roam' || mode === 'seek') {
        if (mode === 'roam') {
          if (a.wanderCd <= 0 || dist2(a.x, a.z, a.wanderX, a.wanderZ) < 4) {
            a.wanderX = clamp(a.x + rand(-22, 22), -52, 52);
            a.wanderZ = clamp(a.z + rand(-22, 22), -52, 52);
            a.wanderCd = rand(3, 7);
          }
          tx = a.wanderX; tz = a.wanderZ;
        }
      }

      // penguen zikzak
      let mvx = 0, mvz = 0;
      if (tx !== null && mode !== 'stuck' && mode !== 'eat') {
        const dx = tx - a.x, dz = tz - a.z;
        const d = Math.hypot(dx, dz) || 1;
        mvx = dx / d; mvz = dz / d;
        if (sp.jitter) {
          const wob = Math.sin(this.t * 5 + a.id) * 0.75;
          const nx = mvx * Math.cos(wob) - mvz * Math.sin(wob);
          const nz = mvx * Math.sin(wob) + mvz * Math.cos(wob);
          mvx = nx; mvz = nz;
        }
        if (a.avoidCd > 0) {
          const ang = 1.25 * (a.id % 2 ? 1 : -1);
          const nx = mvx * Math.cos(ang) - mvz * Math.sin(ang);
          const nz = mvx * Math.sin(ang) + mvz * Math.cos(ang);
          mvx = nx; mvz = nz;
        }
      }

      // tavus kuşu kaçarken zıplar
      if (sp.hopper && a.hopCd <= 0 && (mode === 'flee' || mode === 'chase')) {
        a.hopCd = rand(3.5, 6);
        const ang = rand(0, Math.PI * 2);
        const dist = rand(7, 11);
        const nx = clamp(a.x + Math.cos(ang) * dist, -52, 52);
        const nz = clamp(a.z + Math.sin(ang) * dist, -52, 52);
        const rr = resolveCollisions(nx, nz, sp.radius);
        this.pushEvent({ kind: 'hop', animalId: a.id, x0: a.x, z0: a.z, x: rr.x, z: rr.z });
        a.x = rr.x; a.z = rr.z;
      }

      // yorulma: uzun kovalamacada hayvan yavaşlar
      const running = mode === 'flee' || mode === 'chase' || mode === 'seek';
      if (running) a.stam = Math.max(0, a.stam - dt * 0.13);
      else a.stam = Math.min(1, a.stam + dt * 0.26);
      const stamFactor = 0.6 + 0.4 * a.stam;

      // hareket
      const spd = mode === 'stuck' || mode === 'eat' ? 0 : speed * stamFactor;
      const beforeX = a.x, beforeZ = a.z;
      const res = resolveCollisions(a.x + mvx * spd * dt, a.z + mvz * spd * dt, sp.radius * 0.95);
      a.x = res.x; a.z = res.z;
      const moved = Math.hypot(a.x - beforeX, a.z - beforeZ);
      const wanted = spd * dt;
      if (wanted > 0.001 && moved < wanted * 0.35) a.avoidCd = 0.8;
      a.moving = spd > 0.01 ? 1 : 0;
      if (spd > 0.01 && (Math.abs(mvx) > 0.01 || Math.abs(mvz) > 0.01)) {
        a.yaw = Math.atan2(mvx, mvz);
      }

      // fil kapanları ezer
      if (sp.pusher) {
        for (let i = this.traps.length - 1; i >= 0; i--) {
          if (dist2(this.traps[i].x, this.traps[i].z, a.x, a.z) < 2.4 * 2.4) {
            this.traps.splice(i, 1);
            this.pushEvent({ kind: 'trample', x: a.x, z: a.z, animalId: a.id });
          }
        }
      }

      // saldırı
      if (near && mode === 'chase' && nd < sp.attackRange + 0.4 && a.attackCd <= 0 && !slowed) {
        a.attackCd = sp.ambush ? 2.1 : 2.6;
        const netted = near.netUntil > this.t;
        let dmg = sp.attackDamage * (netted ? 1.5 : 1);
        if (sp.ambush) dmg *= 1.15;
        this.hitPlayer(near, dmg, a.x, a.z, a.species, {
          force: sp.ambush ? 14 : sp.grabber ? 16 : 10,
        });
        this.pushEvent({
          kind: 'attack', animalId: a.id, species: a.species,
          target: near.id, x: a.x, z: a.z,
        });
        if (sp.venom && !near.downed) {
          near.slowUntil = Math.max(near.slowUntil, this.t + 5);
          this.pushEvent({ kind: 'venom', id: near.id });
        }
        if (sp.grabber && !near.downed) {
          near.stunUntil = Math.max(near.stunUntil, this.t + 1.1);
          this.pushEvent({ kind: 'grab', id: near.id, animalId: a.id });
        }
        a.anger = clamp(a.anger - 0.1, 0, 2);
      }

      // maymun eşya çalar
      if (sp.thief && near && nd < 2.6 && a.stealCd <= 0 && !a.downed) {
        const opts = ['dart', 'bait', 'trap'].filter((k) => near.charges[k] > 0);
        const key = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 'net';
        if (opts.length) {
          near.charges[key]--;
          a.loot++;
          a.lootItems.push(key);
        } else {
          // elinde araç yoksa ağını 5 sn kilitler
          near.netLockUntil = this.t + 5;
        }
        a.stealCd = 6;
        a.scaredUntil = this.t + 2.5;
        a.scaredX = near.x; a.scaredZ = near.z;
        this.pushEvent({
          kind: 'monkeySteal', animalId: a.id, target: near.id,
          item: key, x: near.x, z: near.z,
        });
      }

      // kaçma sırasında tıkanma: duvar diplerinde yön değiştir
      if (mode === 'flee' && a.avoidCd > 0.7) a.wanderCd = 0;
    }
  }

  // ---------------- ağ ----------------
  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, n: p.name, c: p.colorIdx,
        x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2),
        hp: Math.round(p.hp), d: p.downed ? 1 : 0, sc: p.score,
        ch: p.charges, cd: p.cds,
        st: {
          stun: p.stunUntil > this.t, slow: p.slowUntil > this.t,
          net: p.netUntil > this.t, slip: p.slipUntil > this.t,
          dizzy: p.dizzyUntil > this.t, deaf: p.deafUntil > this.t,
          netlock: p.netLockUntil > this.t,
          mv: p.moving, sp: p.sprint,
        },
        rv: p.revive ? +Math.min(1, p.revive.progress / WORLD.reviveTime).toFixed(2) : 0,
        em: p.emoteUntil > this.t ? p.emote : null,
        cat: p.catches, as: p.assists, rev: p.revives,
      });
    }
    return {
      t: 'state',
      time: +this.t.toFixed(2),
      tl: +this.timeLeft.toFixed(1),
      phase: this.phase,
      host: this.hostId,
      players,
      animals: this.animals.map((a) => ({
        id: a.id, s: a.species,
        x: +a.x.toFixed(2), z: +a.z.toFixed(2), yaw: +a.yaw.toFixed(2),
        cap: Math.round(a.capture), mv: a.moving, ti: +a.stam.toFixed(2),
        sl: a.slowUntil > this.t, st: a.stuckUntil > this.t,
        ea: a.eatUntil > this.t, lo: a.loot,
      })),
      proj: this.projectiles.map((p) => ({
        id: p.id, k: p.kind, x: +p.x.toFixed(1), z: +p.z.toFixed(1), sp: +p.spin.toFixed(2),
      })),
      traps: this.traps.map((t) => ({ id: t.id, x: +t.x.toFixed(1), z: +t.z.toFixed(1), o: t.owner })),
      baits: this.baits.map((b) => ({ id: b.id, x: +b.x.toFixed(1), z: +b.z.toFixed(1), o: b.owner })),
      peels: this.peels.map((p) => ({ id: p.id, x: +p.x.toFixed(1), z: +p.z.toFixed(1) })),
      bombs: this.bombs.map((b) => ({ id: b.id, x: +b.x.toFixed(1), z: +b.z.toFixed(1), f: Math.max(0, +(b.fuse - this.t).toFixed(2)) })),
      caught: this.caught.length,
    };
  }

  broadcast() {
    this.io.to(this.code).emit('json', this.snapshot());
  }
}

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.loop = null;
    this.last = Date.now();
  }

  createRoom() {
    let code;
    do {
      code = Math.random().toString(36).slice(2, 6).toUpperCase();
    } while (this.rooms.has(code));
    const room = new Room(code, this.io);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase());
  }

  startLoop() {
    if (this.loop) return;
    this.last = Date.now();
    this.loop = setInterval(() => {
      const now = Date.now();
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      for (const room of this.rooms.values()) {
        if (room.phase === 'playing') room.step(dt);
        else if (room.phase === 'lobby') {
          // lobide de hareket senkronu
          room.t += dt;
          room.stepPlayers(dt);
          room.snapshotTick++;
          if (room.snapshotTick % 6 === 0) room.broadcast();
        }
        // boş odaları temizle
        if (room.players.size === 0 && room.emptySince && now - room.emptySince > 120000) {
          this.rooms.delete(room.code);
        }
      }
    }, 1000 / 30);
  }
}
