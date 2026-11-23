// ---------------------------------------------------------------------------
// Oyun istemcisi: sahne, hareket, kamera, ağ senkronu, efektler
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { createWorld } from './world.js';
import { Effects } from './effects.js';
import { createRanger, createAnimal, createCage, mat } from './models.js';
import { MAP, resolveCollisions, isBlocked } from '../shared/map.js';
import { WORLD, SPECIES, TOOLS, COLORS, ANIMAL_SPAWNS } from '../shared/config.js';

const tmpV = new THREE.Vector3();
const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class Game {
  constructor(canvas, hud, audio, net) {
    this.canvas = canvas;
    this.hud = hud;
    this.audio = audio;
    this.net = net;
    this.players = new Map();
    this.animals = new Map();
    this.projectiles = new Map();
    this.traps = new Map();
    this.baits = new Map();
    this.peels = new Map();
    this.bombs = new Map();
    this.floats = [];
    this.snapshot = null;
    this.myId = null;
    this.phase = 'lobby';
    this.time = 0;
    this.running = false;
    this.shake = 0;
    this.cd = {};
    this.sendAcc = 0;
    this.interactAcc = 0;
    this.minimapAcc = 0;
    this.prevHp = 100;
    this.hudTick = 0;
    this.aimTarget = null;
    this.tickTimer = 0;
    this.me = { x: 0, z: 6, yaw: Math.PI, vx: 0, vz: 0, downed: false, hp: 100, status: {} };
    this.camYaw = Math.PI;
    this.camPitch = 0.2;
    this.camDist = 7.8;
    this.camDistTarget = 7.8;
    this.baitKindIdx = 0;
    this.wheelAcc = 0;
    this.cinematic = true;
    this.cinematicAngle = 0;
    this.stamina = 1;
    this.staminaDelay = 0;
    this.bodyYaw = 0;
    this.aimUntil = 0;
    this.localAction = null;
    this.hurtAt = -10;
    this.invertX = false;
    this.invertY = false;
    this.cages = [];
    this.stepAcc = 0;
    this.ready = false;
  }

  init(opts = {}) {
    if (opts.renderer) {
      // test/gömülü renderer (WebGL olmadan mantık testi)
      this.renderer = opts.renderer;
      this.headless = true;
    } else {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: true, powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = renderer;
    }

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(0, 26, 40);

    this.world = createWorld(scene);
    this.effects = new Effects(scene);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('wheel', (e) => {
      if (this.phase !== 'playing') return;
      this.wheelAcc += e.deltaY;
    }, { passive: true });
    this.ready = true;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  // ---------------- dış API ----------------
  setMe(id) {
    this.myId = id;
    this.hud.setMyId(id);
  }

  startRound() {
    this.phase = 'playing';
    this.audio.ambienceOn();
    this.cinematic = false;
    this.cd = {};
    this.prevHp = 100;
    this.me.downed = false;
    this.me.vx = this.me.vz = 0;
    this.bodyYaw = this.camYaw;
    this.aimUntil = 0;
    this.stamina = 1;
    this.staminaDelay = 0;
    this.bodyYaw = 0;
    this.aimUntil = 0;
    this.localAction = null;
    this.audio.play('spawn');
  }

  endRound() {
    this.phase = 'ended';
    this.audio.ambienceOff();
    this.cinematic = true;
    this.cinematicAngle = this.camYaw;
  }

  resetRound() {
    this.cinematic = false;
    this.phase = 'playing';
    this.cd = {};
    this.me.downed = false;
    this.me.hp = 100;
    this.prevHp = 100;
    this.stamina = 1;
    this.staminaDelay = 0;
    this.bodyYaw = 0;
    this.aimUntil = 0;
    this.localAction = null;
    this.hurtAt = -10;
    for (const c of this.cages) this.scene.remove(c.group);
    this.cages = [];
    this.hud.resetRound();
    for (const p of this.players.values()) p.group.position.set(0, -50, 0);
    for (const a of this.animals.values()) a.group.position.set(0, -50, 0);
    this.clearProps();
  }

  clearProps() {
    for (const map of [this.projectiles, this.traps, this.baits, this.peels, this.bombs]) {
      for (const v of map.values()) this.scene.remove(v.group);
      map.clear();
    }
  }

  // ---------------- ağ olayları ----------------
  onSnapshot(snap) {
    this.snapshot = snap;
    const meSnap = snap.players.find((p) => p.id === this.myId);
    if (meSnap) {
      if (snap.phase === 'playing' && this.cinematic) this.startRound();
      // konum düzeltmesi (sunucu itme/knockback uygular)
      const d = Math.hypot(meSnap.x - this.me.x, meSnap.z - this.me.z);
      if (d > 4) { this.me.x = meSnap.x; this.me.z = meSnap.z; }
      else if (d > 0.35) {
        this.me.x += (meSnap.x - this.me.x) * 0.22;
        this.me.z += (meSnap.z - this.me.z) * 0.22;
      }
      this.me.hp = meSnap.hp;
      this.me.downed = !!meSnap.d;
      this.me.status = meSnap.st || {};
      this.me.downed = !!meSnap.d;
      if (meSnap.hp < this.prevHp - 1) {
        this.hud.damage();
        this.shake = Math.min(1, this.shake + 0.35);
        this.audio.play('hurt');
      }
      this.prevHp = meSnap.hp;
    }

    // oyuncular
    const seenP = new Set();
    for (const p of snap.players) {
      seenP.add(p.id);
      let ent = this.players.get(p.id);
      if (!ent) {
        const api = createRanger(COLORS[p.c % COLORS.length]);
        this.scene.add(api.group);
        // isim etiketi
        const label = this.makeLabel(p.n, COLORS[p.c % COLORS.length]);
        label.position.y = 2.15;
        api.group.add(label);
        ent = { api, target: { x: p.x, z: p.z, yaw: p.yaw }, moving: 0, label, action: null, hurtAt: -10 };
        this.players.set(p.id, ent);
        api.group.position.set(p.x, 0, p.z);
      }
      ent.target.x = p.x;
      ent.target.z = p.z;
      ent.target.yaw = p.yaw;
      ent.moving = p.st?.mv ?? 0;
      ent.speed = p.st?.sp ? 1.35 : 1;
      ent.snap = p;
      if (p.sk >= 2 && ent.lastStreak !== p.sk) {
        ent.lastStreak = p.sk;
        this.hud.feed(`🔥 <b>${escape(p.n)}</b> seri yaptı: <b>x${p.sk}</b>`, 'good');
      }
      const netted = !!p.st?.net;
      ent.api.netGroup.visible = !netted;
      ent.api.downed = !!p.d;
      if (netted && !ent.netMesh) {
        ent.netMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.85, 10, 8),
          mat(0xf0ecd0, { wireframe: true, transparent: true, opacity: 0.6, unique: true }),
        );
        ent.netMesh.position.y = 1.05;
        ent.api.group.add(ent.netMesh);
      }
      if (ent.netMesh) ent.netMesh.visible = netted;
    }
    for (const [id, ent] of this.players) {
      if (!seenP.has(id)) {
        this.scene.remove(ent.api.group);
        this.players.delete(id);
      }
    }

    // hayvanlar
    const seenA = new Set();
    for (const a of snap.animals) {
      seenA.add(a.id);
      let ent = this.animals.get(a.id);
      if (!ent) {
        const cfg = SPECIES[a.s];
        const api = createAnimal(a.s, cfg);
        this.scene.add(api.group);
        const bar = this.makeBar();
        bar.group.position.y = (api.parts.height || 1.5) + 0.7;
        api.group.add(bar.group);
        ent = { api, bar, target: { x: a.x, z: a.z, yaw: a.yaw }, speed: 0, snap: a, cage: null, label: null, lungeAt: -10, aura: null };
        api.group.position.set(a.x, 0, a.z);
        this.animals.set(a.id, ent);
      }
      ent.target.x = a.x;
      ent.target.z = a.z;
      ent.target.yaw = a.yaw;
      ent.snap = a;
      ent.bar.fill.scale.x = Math.max(0.001, a.cap / 100);
      ent.bar.fill.position.x = -(1 - a.cap / 100) * 0.8;
      ent.bar.group.visible = a.cap > 2 || a.st || a.ea;
      ent.bar.fill.material.color.set(a.cap > 70 ? 0xff5a2e : 0xffb02e);
      if (a.en && !ent.aura) {
        const aura = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTexture(), color: 0xff3a2a, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        aura.scale.setScalar(3.4);
        aura.position.y = 0.8;
        ent.api.group.add(aura);
        ent.aura = aura;
      }
      if (ent.aura) {
        ent.aura.visible = !!a.en;
        ent.aura.scale.setScalar(3.2 + Math.sin(this.time * 6) * 0.45);
      }
      if (a.st && !ent.cage) {
        ent.cage = this.makeCage();
        ent.api.group.add(ent.cage);
      }
      if (ent.cage) ent.cage.visible = !!a.st;
    }
    for (const [id, ent] of this.animals) {
      if (!seenA.has(id)) {
        this.scene.remove(ent.api.group);
        this.animals.delete(id);
      }
    }

    // mermiler
    const seenPr = new Set();
    for (const pr of snap.proj) {
      seenPr.add(pr.id);
      let ent = this.projectiles.get(pr.id);
      if (!ent) {
        ent = { group: this.makeProjectile(pr.k), spin: 0 };
        this.scene.add(ent.group);
        this.projectiles.set(pr.id, ent);
      }
      ent.group.position.set(pr.x, pr.k === 'net' ? 1.0 : 1.2, pr.z);
      ent.spin = pr.sp;
    }
    for (const [id, ent] of this.projectiles) {
      if (!seenPr.has(id)) { this.scene.remove(ent.group); this.projectiles.delete(id); }
    }

    // kapanlar
    this.syncProps(this.traps, snap.traps, (t) => this.makeTrap(), (ent, t) => {
      ent.group.position.set(t.x, 0, t.z);
    });
    this.syncProps(this.baits, snap.baits, (b) => this.makeBait(b.k), (ent, b) => {
      ent.group.position.set(b.x, 0.15, b.z);
    });
    this.syncProps(this.peels, snap.peels, () => this.makePeel(), (ent, p) => {
      ent.group.position.set(p.x, 0.08, p.z);
    });
    this.syncProps(this.bombs, snap.bombs, () => this.makeBomb(), (ent, b) => {
      ent.group.position.set(b.x, 0.3, b.z);
    });
  }

  syncProps(map, list, create, place) {
    const seen = new Set();
    for (const item of list || []) {
      seen.add(item.id);
      let ent = map.get(item.id);
      if (!ent) {
        ent = { group: create(item) };
        this.scene.add(ent.group);
        map.set(item.id, ent);
      }
      place(ent, item);
    }
    for (const [id, ent] of map) {
      if (!seen.has(id)) { this.scene.remove(ent.group); map.delete(id); }
    }
  }

  onEvents(list) {
    for (const e of list) this.handleEvent(e);
  }

  nameOf(id) {
    const p = this.snapshot?.players.find((x) => x.id === id);
    return p ? p.n : 'Biri';
  }

  colorOf(id) {
    const p = this.snapshot?.players.find((x) => x.id === id);
    return p ? COLORS[p.c % COLORS.length] : 0xffffff;
  }

  handleEvent(e) {
    const sp = e.species ? SPECIES[e.species] : null;
    switch (e.kind) {
      case 'start':
        this.hud.resetRound();
        this.hud.feed(`🎯 <b>Hedef:</b> ${ANIMAL_SPAWNS.length} kaçkını 7 dakikada yakala`, 'good');
        this.hud.feed('💡 Yem → ağ = 2 kat etkili. <kbd>R</kbd> ile yem çeşidini diyete göre seç.');
        this.hud.feed('😈 Arkadaşını ağa dolamak serbest. Kaldırmayı unutma!', 'troll');
        this.hud.banner('🚨 KAÇKINLAR SERBEST!', `${ANIMAL_SPAWNS.length} hayvanı 7 dakikada yakala — arkadaşlarını da unutma`, 3000);
        this.audio.play('spawn');
        break;
      case 'catch': {
        this.audio.play('catch');
        this.effects.confetti(e.x, 0.5, e.z);
        this.effects.ring(e.x, 0.2, e.z, 0xffd93d, 5);
        this.floatText(e.x, 2.6, e.z, `+${e.points}`, '#8cf05c', 1.6);
        this.spawnCageFx(e.x, e.z);
        const mine = e.by === this.myId;
        const streakTxt = e.streak >= 2 ? ` · 🔥 SERİ x${e.streak + 1}` : '';
        this.hud.banner(
          `${sp.emoji} ${sp.name.toUpperCase()} YAKALANDI!`,
          `${mine ? 'Senin eserin' : e.byName} · +${e.points} puan${e.teamBonus ? ' · EKİP BONUSU!' : ''}${streakTxt}`,
          2200,
        );
        this.hud.feed(`${sp.emoji} <b>${sp.name}</b> yakalandı — <b>${escape(e.byName)}</b> +${e.points}`, 'good');
        break;
      }
      case 'anim':
        if (e.id !== this.myId) {
          const ent = this.players.get(e.id);
          if (ent) ent.action = { type: e.act, t0: this.time };
        }
        break;
      case 'enrage':
        this.audio.play('enrage');
        this.effects.ring(e.x, 0.2, e.z, 0xff3a2a, 6);
        this.effects.burst(e.x, 1.2, e.z, 0xff3a2a, 22, { speed: 6, life: 0.8 });
        this.hud.feed(`😡 <b>${sp?.name || 'Hayvan'}</b> öfkelendi! Yakala ya da kaç`, 'bad');
        break;
      case 'heavy':
        this.audio.play('heavy', { vol: this.distanceToMe(e.x, e.z) < 22 ? 1 : 0.4 });
        if (e.id === this.myId) { this.hud.banner('🐻 AYI PENÇESİ', 'Sersemledin!', 1300); this.shake = 1.1; }
        break;
      case 'crush':
        this.audio.play('crush', { vol: this.distanceToMe(e.x, e.z) < 22 ? 1 : 0.4 });
        if (e.id === this.myId) { this.hud.banner('🐊 TİMSAH ISIRDI', 'Sersem + yavaş', 1400); this.shake = 1.2; }
        break;
      case 'netHit': {
        this.audio.play('netHit');
        const col = e.capture >= 100 ? 0x8cf05c : 0xffd93d;
        this.effects.burst(e.x, 1.1, e.z, col, 16, { speed: 5, life: 0.55 });
        this.floatText(e.x, 2.2, e.z, `+${e.gain}%`, e.capture >= 70 ? '#ff8a1f' : '#ffd93d', 0.9);
        break;
      }
      case 'hit': {
        if (e.id === this.myId) this.hurtAt = this.time;
        else {
          const ent = this.players.get(e.id);
          if (ent) ent.hurtAt = this.time;
        }
        this.effects.burst(e.x, 1.3, e.z, 0xff4d4d, 10, { speed: 4.5, life: 0.5 });
        this.floatText(e.x, 2.4, e.z, `-${e.dmg}`, '#ff6b6b', 0.85);
        if (e.id !== this.myId && this.distanceToMe(e.x, e.z) < 14) {
          this.audio.play('hurt', { vol: 0.45 });
        }
        break;
      }
      case 'recharge':
        if (e.id === this.myId) {
          this.audio.play('click', { vol: 0.5 });
          this.hud.feed(`${TOOLS[e.tool]?.emoji || '🎒'} ${TOOLS[e.tool]?.name || 'Araç'} yenilendi`, 'good');
        }
        break;
      case 'dartHit':
        this.audio.play('dart');
        this.effects.burst(e.x, 1.1, e.z, 0x9d7bff, 14, { speed: 3.2, life: 0.7, gravity: 3 });
        this.floatText(e.x, 2.0, e.z, 'uyudu 💤', '#c9b5ff', 1);
        break;
      case 'attack': {
        const ent = this.animals.get(e.animalId);
        if (ent) ent.lungeAt = this.time;
        this.audio.play('roar', { pitch: sp?.danger >= 3 ? 70 : 130, vol: 0.8 });
        this.effects.smoke(e.x, 1, e.z, 8, 0xd8c8a8);
        this.effects.ring(e.x, 0.15, e.z, 0xff6a3d, 3.2);
        const mine = e.target === this.myId;
        if (mine) this.shake = Math.min(1.4, this.shake + 0.9);
        else if (this.distanceToMe(e.x, e.z) < 12) this.shake = Math.min(1, this.shake + 0.25);
        this.hud.feed(`${sp?.emoji} <b>${sp?.name}</b> saldırdı → <b>${escape(this.nameOf(e.target))}</b>`, 'bad');
        break;
      }
      case 'downed': {
        const mine = e.id === this.myId;
        if (mine) {
          this.hud.banner('💀 YERDESİN!', 'Arkadaşın yanına gelip E ile kaldırsın', 2600);
          this.audio.play('down');
          this.shake = 1.2;
        } else {
          this.hud.feed(`💀 <b>${escape(this.nameOf(e.id))}</b> yerde! Kaldırmaya git`, 'bad');
          this.audio.play('down', { vol: 0.4 });
        }
        break;
      }
      case 'revive':
        this.audio.play('revive');
        this.hud.feed(`🩹 <b>${escape(this.nameOf(e.by))}</b>, <b>${escape(this.nameOf(e.target))}</b> kaldırdı`, 'good');
        if (e.by === this.myId) this.hud.banner('🩹 KALDIRDIN!', '+40 puan', 1200);
        break;
      case 'selfRevive':
        if (e.id === this.myId) this.hud.banner('😤 Ayağa kalktın', 'Kimse gelmedi…', 1600);
        break;
      case 'rescue':
        this.hud.banner('🚁 KURTARMA EKİBİ', `Herkes kaldırıldı · -${e.penalty} saniye`, 2600);
        this.audio.play('spawn');
        break;
      case 'trollNet':
        this.audio.play('netHit', { vol: 0.6 });
        this.hud.feed(`😈 <b>${escape(this.nameOf(e.by))}</b> → <b>${escape(this.nameOf(e.target))}</b> ağa doladı`, 'troll');
        if (e.target === this.myId) this.hud.banner('🕸️ AĞA DOLANDIN!', `${escape(this.nameOf(e.by))} seni ağladı`, 1400);
        break;
      case 'trollTrap':
        this.audio.play('trap', { vol: 0.7 });
        this.hud.feed(`🪤 <b>${escape(this.nameOf(e.target))}</b> kapana düştü`, 'troll');
        if (e.target === this.myId) this.hud.banner('🪤 KAPANDA!', 'Arkadaşın kurdu bu tuzağı', 1400);
        break;
      case 'trollDart':
        this.audio.play('dart');
        this.hud.feed(`💉 <b>${escape(this.nameOf(e.by))}</b> → <b>${escape(this.nameOf(e.target))}</b> sersemletti`, 'troll');
        break;
      case 'shove':
        this.audio.play('whiff');
        this.effects.smoke(e.x ?? 0, 1, e.z ?? 0, 5, 0xdddddd);
        this.hud.feed(`✋ <b>${escape(this.nameOf(e.by))}</b>, <b>${escape(this.nameOf(e.target))}</b> itti`, 'troll');
        break;
      case 'slip':
        this.audio.play('slip');
        if (e.id === this.myId) this.hud.banner('🍌 KAYDIN!', 'Muz kabuğu — klasik', 1200);
        break;
      case 'baitSteal':
        this.audio.play('click');
        this.hud.feed(`🍖 <b>${escape(this.nameOf(e.by))}</b>, <b>${escape(this.nameOf(e.owner))}</b> yemini aşırdı`, 'troll');
        break;
      case 'monkeySteal':
        this.audio.play('steal');
        this.hud.feed(`🐒 Maymun, <b>${escape(this.nameOf(e.target))}</b> eşyasını çaldı (${TOOLS[e.item]?.name || e.item})`, 'troll');
        if (e.target === this.myId) this.hud.banner('🐒 MAY MUN EŞYANI ÇALDI!', 'Onu yakalarsan geri gelir', 1600);
        break;
      case 'trapAnimal':
        this.audio.play('trap');
        this.effects.burst(e.x, 0.8, e.z, 0xffd93d, 18, { speed: 4 });
        this.floatText(e.x, 2.2, e.z, 'KAPAN! 🪤', '#ffd93d', 1.1);
        break;
      case 'trample':
        this.audio.play('thud');
        this.effects.smoke(e.x, 0.4, e.z, 12, 0xb0a080);
        this.hud.feed('🐘 Fil kapanı ezdi', 'bad');
        break;
      case 'explode':
        this.audio.play('explode');
        this.effects.ring(e.x, 0.2, e.z, 0xffb02e, 9);
        this.effects.burst(e.x, 0.6, e.z, 0xffb02e, 42, { speed: 12, life: 0.9, gravity: 12 });
        this.effects.smoke(e.x, 0.8, e.z, 20, 0x8a8a8a);
        this.shake = Math.min(1.4, this.shake + (this.distanceToMe(e.x, e.z) < 14 ? 0.8 : 0.2));
        this.hud.feed('🧨 Maytap patladı — hayvanlar kaçıştı', 'troll');
        break;
      case 'eating':
        this.effects.burst(e.x, 0.8, e.z, 0xff8f4d, 6, { speed: 2, life: 0.6, gravity: -1 });
        break;
      case 'hop':
        this.effects.burst(e.x0, 0.5, e.z0, 0x9fe8ff, 10, { speed: 3, life: 0.5 });
        this.effects.burst(e.x, 0.5, e.z, 0x9fe8ff, 10, { speed: 3, life: 0.5 });
        this.audio.play('whoosh', { vol: 0.5 });
        break;
      case 'roar':
        this.audio.play('roar', { pitch: sp?.danger >= 3 ? 78 : 150, vol: 0.6 });
        this.effects.ring(e.x, 0.2, e.z, 0xffb02e, 3.5);
        break;
      case 'venom':
        if (e.id === this.myId) this.hud.banner('🐍 ZEHİRLENDİN', 'Yavaşladın, dikkat', 1400);
        break;
      case 'grab':
        if (e.id === this.myId) {
          this.hud.banner('🦍 GORİL SENİ YAKALADI', '', 1400);
          this.shake = 1.3;
        }
        break;
      case 'assist':
        if (e.id === this.myId) this.hud.feed('🤝 Asist! +%25 puan', 'good');
        break;
      case 'sfx':
        this.audio.play(e.sfx || 'click', { vol: 0.7 });
        break;
      case 'join':
        this.hud.feed(`👋 <b>${escape(e.name || '')}</b> katıldı`);
        break;
      case 'leave':
        this.hud.feed(`🚪 <b>${escape(e.name || '')}</b> ayrıldı`);
        break;
      case 'emote': break;
      case 'end':
        this.endRound();
        this.hud.showResults(e, this.myId);
        this.audio.play(e.win ? 'win' : 'lose');
        break;
      default:
        break;
    }
  }

  distanceToMe(x, z) {
    return Math.hypot(x - this.me.x, z - this.me.z);
  }

  // ---------------- görsel yardımcılar ----------------
  glowTexture() {
    if (this._glowTex) return this._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    this._glowTex = new THREE.CanvasTexture(c);
    return this._glowTex;
  }

  makeLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,16,11,0.6)';
    ctx.beginPath();
    ctx.roundRect(4, 8, 248, 48, 14);
    ctx.fill();
    ctx.font = 'bold 30px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(2.4, 0.6, 1);
    spr.renderOrder = 5;
    return spr;
  }

  makeBar() {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.17),
      new THREE.MeshBasicMaterial({ color: 0x0b1a10, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, depthWrite: false }),
    );
    fill.position.z = 0.01;
    g.add(bg);
    g.add(fill);
    g.renderOrder = 4;
    return { group: g, fill, bg };
  }

  headLookOffset() {
    let d = this.camYaw - this.bodyYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return d;
  }

  currentAction(ent) {
    if (!ent || !ent.action) return null;
    const dur = ent.api?.actionDur?.[ent.action.type] ?? 0.5;
    const t = this.time - ent.action.t0;
    if (t > dur) { ent.action = null; return null; }
    return { type: ent.action.type, t };
  }

  spawnCageFx(x, z) {
    const g = this.makeCage();
    g.position.set(x, -1.5, z);
    g.rotation.y = Math.random() * Math.PI;
    this.scene.add(g);
    this.cages.push({ group: g, t: 0 });
  }

  makeCage() {
    const g = new THREE.Group();
    const matBar = mat(0xb8bcc4, { metalness: 0.6, roughness: 0.4, unique: true });
    const barGeo = new THREE.BoxGeometry(0.07, 1.5, 0.07);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 1.0;
      const bar = new THREE.Mesh(barGeo, matBar);
      bar.position.set(Math.cos(a) * r, 0.75, Math.sin(a) * r);
      g.add(bar);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.08, 12), matBar);
    top.position.y = 1.5;
    g.add(top);
    return g;
  }

  makeProjectile(kind) {
    const g = new THREE.Group();
    if (kind === 'net') {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 8, 6),
        mat(0xf2edd6, { wireframe: true, transparent: true, opacity: 0.9, unique: true }),
      );
      g.add(ball);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.45, 0.045, 5, 12),
        mat(0xd8cfae, { unique: true }),
      );
      g.add(ring);
      g.userData.ring = ring;
      g.userData.ball = ball;
    } else {
      const dart = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.5, 6),
        mat(0x9d7bff, { emissive: 0x6a4cff, emissiveIntensity: 0.7, unique: true }),
      );
      dart.rotation.x = Math.PI / 2;
      g.add(dart);
      const trail = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x9d7bff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      trail.scale.setScalar(1.1);
      g.add(trail);
    }
    return g;
  }

  makeTrap() {
    const g = new THREE.Group();
    const m = mat(0x8a8f96, { metalness: 0.6, roughness: 0.45, unique: true });
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), m);
      post.position.set(x, 0.4, z);
      g.add(post);
    }
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 4, 16), m);
    jaw.rotation.x = -Math.PI / 2;
    jaw.position.y = 0.12;
    g.add(jaw);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12),
      mat(0xffd93d, { emissive: 0xffb02e, emissiveIntensity: 0.5, unique: true }),
    );
    plate.position.y = 0.05;
    g.add(plate);
    return g;
  }

  makeBait(kindKey) {
    const g = new THREE.Group();
    const kind = TOOLS.bait.kinds.find((k) => k.k === kindKey) || TOOLS.bait.kinds[0];
    const color = kind.color;
    if (kind.k === 'balik') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 7), mat(color, { roughness: 0.5, unique: true }));
      body.scale.set(1.6, 0.85, 0.6);
      body.position.y = 0.22;
      body.castShadow = true;
      g.add(body);
      const tailGeo = new THREE.ConeGeometry(0.2, 0.3, 4);
      const tail = new THREE.Mesh(tailGeo, mat(color, { roughness: 0.5, unique: true }));
      tail.rotation.z = Math.PI / 2;
      tail.position.set(-0.46, 0.22, 0);
      g.add(tail);
    } else if (kind.k === 'meyve') {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat(color, { roughness: 0.7, unique: true }));
      fruit.position.y = 0.27;
      fruit.castShadow = true;
      g.add(fruit);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), mat(0x4faa3a, { unique: true }));
      leaf.scale.set(1.6, 0.35, 0.8);
      leaf.position.set(0.08, 0.52, 0);
      g.add(leaf);
    } else if (kind.k === 'ot') {
      const grass = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat(color, { roughness: 1, unique: true }));
      grass.scale.set(1.3, 0.5, 1.3);
      grass.position.y = 0.16;
      g.add(grass);
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 4), mat(0x9fe06a, { unique: true }));
        blade.position.set(Math.cos(i * 2.1) * 0.18, 0.42, Math.sin(i * 2.1) * 0.18);
        g.add(blade);
      }
    } else {
      const meat = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.32, 0),
        mat(color, { roughness: 1, unique: true }),
      );
      meat.position.y = 0.25;
      meat.castShadow = true;
      g.add(meat);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), mat(0xf4e6c8, { unique: true }));
      bone.rotation.z = Math.PI / 2;
      bone.position.y = 0.18;
      g.add(bone);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, map: this.glowTexture(),
    }));
    glow.scale.setScalar(2);
    glow.position.y = 0.3;
    g.add(glow);
    return g;
  }

  makePeel() {
    const g = new THREE.Group();
    const m = mat(0xffd93d, { unique: true, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 4, 8, Math.PI * 0.9), m);
      strip.position.y = 0.08;
      strip.rotation.set(-Math.PI / 2, 0, (i / 3) * Math.PI * 2);
      g.add(strip);
    }
    return g;
  }

  makeBomb() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 8), mat(0xd93b3b, { unique: true }));
    body.position.y = 0.25;
    g.add(body);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), mat(0x333333, { unique: true }));
    fuse.position.set(0, 0.6, 0);
    fuse.rotation.z = 0.4;
    g.add(fuse);
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xffcf6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    spark.scale.setScalar(0.8);
    spark.position.set(0.12, 0.78, 0);
    g.add(spark);
    g.userData.spark = spark;
    return g;
  }

  floatText(x, y, z, text, color = '#fff', dur = 1.1) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 56px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(6,12,8,0.85)';
    ctx.strokeText(text, 128, 48);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
    }));
    spr.position.set(x, y, z);
    spr.scale.set(2.4, 0.9, 1);
    spr.renderOrder = 10;
    this.scene.add(spr);
    this.floats.push({ spr, life: dur, max: dur, y });
  }

  // ---------------- girdi ----------------
  handleInput(dt) {
    const input = this.input;
    if (!input) return;
    const actions = input.takeActions();
    if (this.phase !== 'playing') return;
    for (const a of actions) {
      if (a.startsWith('emote_')) {
        this.net.send({ t: 'emote', id: a.slice(6) });
        continue;
      }
      if (a === 'minimapZoom') { this.hud.toggleMinimapZoom(); continue; }
      if (a === 'mute') {
        const m = this.audio.toggleMute();
        this.hud.feed(m ? '🔇 Ses kapalı' : '🔊 Ses açık');
        continue;
      }
      if (a === 'rotateBait') {
        const kinds = TOOLS.bait.kinds;
        this.baitKindIdx = (this.baitKindIdx + 1) % kinds.length;
        const k = kinds[this.baitKindIdx];
        this.hud.setBaitKind(k);
        this.hud.feed(`${k.emoji} Yem türü: <b>${k.name}</b> — diyeti tutan hayvan daha güçlü gelir`, 'good');
        continue;
      }
      const tool = TOOLS[a];
      if (!tool) continue;
      if (this.me.downed) continue;
      if ((this.cd[a] || 0) > this.time) continue;
      // mermi/isabet gecikmesi: ses ve cooldown hemen
      this.cd[a] = this.time + tool.cooldown;
      if (a === 'net') this.audio.play('whoosh');
      else if (a === 'dart') this.audio.play('dart', { vol: 0.5 });
      else if (a === 'bait') this.audio.play('click');
      else if (a === 'trap') this.audio.play('trap', { vol: 0.35 });
      else if (a === 'shove') this.audio.play('whiff');
      else if (a === 'peel') this.audio.play('click');
      else if (a === 'fire') this.audio.play('fuse');
      // namlu ağzı efekti
      const fx = this.me.x + Math.sin(this.me.yaw) * 1.1;
      const fz = this.me.z + Math.cos(this.me.yaw) * 1.1;
      if (a === 'net') this.effects.burst(fx, 1.1, fz, 0xffe8b0, 5, { speed: 2, life: 0.25, gravity: 0 });
      const msg = { t: 'act', tool: a, yaw: this.me.yaw };
      if (a === 'bait') msg.kind = TOOLS.bait.kinds[this.baitKindIdx].k;
      this.net.send(msg);
      this.localAction = { type: a, t0: this.time };
      this.aimUntil = this.time + 1.0;
      this.slotFlash = a;
    }
  }

  // ---------------- yerel oyuncu ----------------
  updateLocalPlayer(dt) {
    const input = this.input;
    if (!input) return;
    const look = input.consumeLook();
    // fare sağa → görüş sağa döner (kamera sağa yatar); istenirse ters çevrilir
    this.camYaw -= (this.invertX ? -1 : 1) * look.x * 0.0026;
    this.camPitch = Math.max(
      -0.35,
      Math.min(0.85, this.camPitch + (this.invertY ? -1 : 1) * look.y * 0.0022),
    );
    // klavye ile dönüş (fare kilidi yoksa da oynanabilsin)
    const turn = (input.keys.has('ArrowRight') ? 1 : 0) - (input.keys.has('ArrowLeft') ? 1 : 0);
    if (turn) this.camYaw -= turn * 2.6 * dt;
    const tilt = (input.keys.has('ArrowDown') ? 1 : 0) - (input.keys.has('ArrowUp') ? 1 : 0);
    if (tilt) this.camPitch = Math.max(-0.35, Math.min(0.85, this.camPitch + tilt * 1.4 * dt));

    if (this.phase !== 'playing') {
      this.sendAcc += dt;
      return;
    }

    const st = this.me.status || {};
    // --- stamina (koşu enerjisi) ---
    const mspd0 = Math.hypot(this.me.vx, this.me.vz);
    const wantSprint = !!input.sprint && mspd0 > 0.6 && !this.me.downed && !st.net;
    if (wantSprint && this.stamina > 0.02) {
      this.stamina = Math.max(0, this.stamina - dt * 0.24);
      this.staminaDelay = 0.65;
      if (this.stamina === 0) this.hud.banner('😮‍💨 NEFESİN KESİLDİ', 'Yürüyerek toparlan', 900);
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay === 0) this.stamina = Math.min(1, this.stamina + dt * 0.21);
    }
    const canSprint = this.stamina > 0.02 && !this.me.downed && !st.net;

    let speed = WORLD.playerSpeed;
    if (this.me.downed) speed *= 0.33;
    if (st.net) speed = 0;
    if (st.slow) speed *= 0.55;
    if (st.dizzy) speed *= 0.8;
    if (st.slip) speed *= 0.35;
    if (input.sprint && canSprint) speed *= 1.26;

    const mx = input.moveX;
    const mz = input.moveZ;
    const fwdX = Math.sin(this.camYaw), fwdZ = Math.cos(this.camYaw);
    // D/A → ekranda sağ/sol (kameranın sağ vektörü)
    const rightX = -Math.cos(this.camYaw), rightZ = Math.sin(this.camYaw);
    let dx = fwdX * mz + rightX * mx;
    let dz = fwdZ * mz + rightZ * mx;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) { dx /= len; dz /= len; }
    const tvx = dx * speed * (len > 0.001 ? 1 : 0);
    const tvz = dz * speed * (len > 0.001 ? 1 : 0);
    const k = 1 - Math.exp(-14 * dt);
    this.me.vx += (tvx - this.me.vx) * k;
    this.me.vz += (tvz - this.me.vz) * k;

    const res = resolveCollisions(this.me.x + this.me.vx * dt, this.me.z + this.me.vz * dt, WORLD.playerRadius);
    this.me.x = res.x;
    this.me.z = res.z;
    // nişan yönü (araçlar bu yöne gider)
    this.me.yaw = lerpAngle(this.me.yaw, this.camYaw, 1 - Math.exp(-18 * dt));

    // gövde yönü: WASD ile hareket ederken gövde/yüz hareket yönüne döner,
    // nişan alırken (son 1 sn içinde araç kullanıldıysa) kameraya döner.
    const aiming = this.time < this.aimUntil;
    // geri geri giderken gövde dönmesin (yüz kameraya dönük kalsın)
    const backpedal = (dx * Math.sin(this.camYaw) + dz * Math.cos(this.camYaw)) < -0.45;
    const turnToMove = len > 0.001 && !aiming && !backpedal;
    const bodyTarget = turnToMove ? Math.atan2(dx, dz) : this.camYaw;
    this.bodyYaw = lerpAngle(this.bodyYaw, bodyTarget, 1 - Math.exp(-(len > 0.001 ? 12 : 15) * dt));

    // ağ senkronu
    this.sendAcc += dt;
    if (this.sendAcc > 0.05) {
      this.sendAcc = 0;
      this.net.send({
        t: 'move',
        x: +this.me.x.toFixed(3), z: +this.me.z.toFixed(3),
        yaw: +this.bodyYaw.toFixed(3),
        mv: len > 0.01 ? 1 : 0, sp: !!input.sprint && canSprint && len > 0.01 ? 1 : 0,
      });
    }

    // kaldırma
    let target = null;
    let bestD = WORLD.reviveRange;
    for (const p of this.snapshot?.players || []) {
      if (p.id === this.myId || !p.d) continue;
      const d = Math.hypot(p.x - this.me.x, p.z - this.me.z);
      if (d < bestD) { bestD = d; target = p; }
    }
    this.reviveTarget = target;
    if (target && input.interact && !this.me.downed) {
      this.interactAcc += dt;
      if (this.interactAcc > 0.1) {
        this.interactAcc = 0;
        this.net.send({ t: 'interact', targetId: target.id });
      }
    } else {
      this.interactAcc = 0;
    }
  }

  // ---------------- kare güncelleme ----------------
  update(dt) {
    this.time += dt;
    if (!this.renderer) return;
    this.world.update(this.time);
    this.effects.update(dt);

    for (const map of [this.traps, this.baits, this.peels, this.bombs]) {
      for (const ent of map.values()) {
        if (ent.group.userData.spark) {
          ent.group.userData.spark.scale.setScalar(0.6 + Math.abs(Math.sin(this.time * 20)) * 0.7);
        }
      }
    }
    for (const ent of this.traps.values()) {
      ent.group.rotation.y = this.time * 0.6;
    }
    for (const ent of this.baits.values()) {
      const meat = ent.group.children[0];
      meat.rotation.y = this.time * 1.5;
      meat.position.y = 0.25 + Math.sin(this.time * 3) * 0.05;
    }
    for (const ent of this.projectiles.values()) {
      ent.group.rotation.y = ent.spin;
      ent.group.rotation.z = this.time * 4;
      if (ent.group.userData.ring) ent.group.userData.ring.rotation.x = this.time * 6;
    }

    // yakalama kafesleri
    for (let i = this.cages.length - 1; i >= 0; i--) {
      const c = this.cages[i];
      c.t += dt;
      const up = Math.min(1, c.t / 0.34);
      c.group.position.y = -1.5 + (1 - Math.pow(1 - up, 3)) * 1.5;
      c.group.rotation.y += dt * (c.t < 0.34 ? 3.2 : 0.5);
      if (c.t > 1.7) {
        this.scene.remove(c.group);
        this.cages.splice(i, 1);
      }
    }

    if (this.phase === 'playing' && this.stamina > 0.05) {
      const spd = Math.hypot(this.me.vx, this.me.vz);
      if (spd > 4.2 && !this.me.downed) {
        this.stepAcc += dt * spd;
        if (this.stepAcc > 2.4) {
          this.stepAcc = 0;
          this.effects.smoke(this.me.x, 0.12, this.me.z, 2, 0xc9b89a);
        }
      } else this.stepAcc = 0;
    }

    if (this.phase === 'playing') this.handleInput(dt);
    this.updateLocalPlayer(dt);

    if (this.phase !== 'playing' || !this.myId) {
      // sinematik kamera (menü / lobi / tur sonu)
      this.cinematicAngle += dt * 0.09;
      const r = 34;
      const cx = Math.cos(this.cinematicAngle) * r;
      const cz = Math.sin(this.cinematicAngle) * r;
      this.camera.position.set(cx, 20 + Math.sin(this.cinematicAngle * 0.7) * 3, cz);
      this.camera.lookAt(0, 3, 0);
    } else {
      this.updateCamera(dt);
    }

    // oyuncu interpolasyonu
    for (const [id, ent] of this.players) {
      const isMe = id === this.myId;
      if (isMe) {
        ent.api.group.position.set(this.me.x, 0, this.me.z);
        ent.api.group.rotation.y = this.bodyYaw;
        const mspd = Math.hypot(this.me.vx, this.me.vz);
        const mst = this.me.status || {};
        ent.api.animate(this.time, {
          moving: mspd > 0.6,
          speed: Math.max(0.45, Math.min(1.7, mspd / 4.1)),
          sprint: (mst.sp || (this.input?.sprint && mspd > 1)) && mspd > 1.1,
          downed: !!this.me.downed,
          netted: !!mst.net,
          slip: !!mst.slip,
          dizzy: !!mst.dizzy,
          revive: this.reviveHeld || 0,
          action: this.currentAction(ent),
          hurt: this.time - this.hurtAt < 0.35 ? 1 : 0,
          headYaw: this.headLookOffset(),
        });
      } else {
        const k = 1 - Math.exp(-12 * dt);
        ent.api.group.position.x += (ent.target.x - ent.api.group.position.x) * k;
        ent.api.group.position.z += (ent.target.z - ent.api.group.position.z) * k;
        ent.api.group.rotation.y = lerpAngle(ent.api.group.rotation.y, ent.target.yaw, 1 - Math.exp(-14 * dt));
        const rst = ent.snap?.st || {};
        ent.api.animate(this.time, {
          moving: !!ent.moving,
          speed: Math.max(0.5, Math.min(1.7, ent.speed || 1)),
          sprint: !!rst.sp && !!ent.moving,
          downed: !!ent.snap?.d,
          netted: !!rst.net,
          slip: !!rst.slip,
          dizzy: !!rst.dizzy,
          revive: ent.snap?.rv || 0,
          action: this.currentAction(ent),
          hurt: this.time - (ent.hurtAt || -10) < 0.35 ? 1 : 0,
        });
      }
      ent.api.group.visible = true;
      if (ent.label) ent.label.visible = !isMe;
    }

    // hayvan interpolasyonu + animasyon
    for (const [id, ent] of this.animals) {
      const k = 1 - Math.exp(-10 * dt);
      const prevX = ent.api.group.position.x;
      const prevZ = ent.api.group.position.z;
      const dx = ent.target.x - prevX;
      const dz = ent.target.z - prevZ;
      const d = Math.hypot(dx, dz);
      if (d > 5) {
        ent.api.group.position.set(ent.target.x, 0, ent.target.z);
      } else {
        ent.api.group.position.x += dx * k;
        ent.api.group.position.z += dz * k;
      }
      ent.speed = d / Math.max(dt, 0.001) * 0.55;
      ent.api.group.rotation.y = lerpAngle(ent.api.group.rotation.y, ent.target.yaw, 1 - Math.exp(-9 * dt));
      const snap = ent.snap;
      const lungeP = (this.time - (ent.lungeAt || -10)) / 0.42;
      ent.api.animate(this.time, {
        speed: snap?.s === 'fil' ? 0.8 : 1.2,
        eating: !!snap?.ea,
        stuck: !!snap?.st,
        slowed: !!snap?.sl,
        scared: snap?.cap > 60,
        enraged: !!snap?.en,
        lunge: lungeP > 0 && lungeP < 1 ? lungeP : 0,
        moving: d > 0.02,
      });
      if (ent.bar.group.visible) {
        // her zaman kameraya bakan can göstergesi
        ent.bar.group.lookAt(this.camera.position);
      }
    }

    // yakında saldırgan hayvan varsa kırmızı kenar
    if (this.phase === 'playing') {
      let danger = 0;
      for (const a of this.snapshot?.animals || []) {
        const d = Math.hypot(a.x - this.me.x, a.z - this.me.z);
        if (d < 9.5) danger = Math.max(danger, (1 - d / 9.5) * 0.75);
      }
      this.hud.setDanger(danger);
    }

    // konuşma baloncukları
    this.updateBubbles();

    // uçan yazılar
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.spr.position.y += dt * 0.9;
      f.spr.material.opacity = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        this.scene.remove(f.spr);
        f.spr.material.map.dispose();
        f.spr.material.dispose();
        this.floats.splice(i, 1);
      }
    }

    // HUD
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const me = this.me;
    const targetY = 1.6 + (me.downed ? -0.9 : 0);
    this.camDistTarget = Math.max(4.6, Math.min(12.5, this.camDistTarget + this.wheelAcc * 0.0022));
    this.wheelAcc = 0;
    this.camDist += (this.camDistTarget - this.camDist) * (1 - Math.exp(-8 * dt));
    const dist = this.camDist;
    const cy = Math.cos(this.camPitch);
    const sy = Math.sin(this.camPitch);
    const ox = -Math.sin(this.camYaw) * dist * cy;
    const oz = -Math.cos(this.camYaw) * dist * cy;
    const oy = 2.2 + dist * sy * 0.9;

    let camX = me.x + ox;
    let camZ = me.z + oz;
    let camY = targetY + oy;

    // duvar arkasında kalmasın (sadece çitler/bineler; ağaçlar kamerayı çekmesin)
    let blockedT = 1;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const sx = me.x + ox * t;
      const sz = me.z + oz * t;
      if (blockedByWall(sx, sz, 0.4)) { blockedT = Math.max(0.34, (i - 1) / steps); break; }
    }
    if (blockedT < 1) {
      camX = me.x + ox * blockedT;
      camZ = me.z + oz * blockedT;
      camY = targetY + oy * (0.62 + blockedT * 0.4);
    }

    const k = 1 - Math.exp(-16 * dt);
    this.camera.position.x += (camX - this.camera.position.x) * k;
    this.camera.position.y += (camY - this.camera.position.y) * k;
    this.camera.position.z += (camZ - this.camera.position.z) * k;

    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * this.shake * 0.5;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }

    const lookX = me.x + Math.sin(this.camYaw) * 1.6;
    const lookZ = me.z + Math.cos(this.camYaw) * 1.6;
    this.camera.lookAt(lookX, targetY + 0.5, lookZ);
    const st = this.me.status || {};
    this.camera.fov = 66 + (st.slip ? Math.sin(this.time * 8) * 3 : 0);
    this.camera.updateProjectionMatrix();

    // nişan hedefi
    let aim = null, bestScore = 0;
    for (const a of this.snapshot?.animals || []) {
      const dx = a.x - me.x, dz = a.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > 16) continue;
      const dot = dirtyDot(dx / (d || 1), dz / (d || 1), this.camYaw);
      if (dot > 0.96 && dot > bestScore) { bestScore = dot; aim = a; }
    }
    this.aimTarget = aim;
    this.hud.setCrosshair(!!aim);
    if (aim) {
      const sp = SPECIES[aim.s];
      const hint = aim.st ? '🪤 Kapanda! Hemen ağ at'
        : aim.ea ? '🍖 Yem yiyor — ağ 2 kat etkili'
          : aim.sl ? '💤 Yavaşlamış — ağ 2 kat etkili'
            : sp.desc;
      this.hud.setAim({ emoji: sp.emoji, name: sp.name, cap: aim.cap, hint });
    } else {
      this.hud.setAim(null);
    }
  }

  updateBubbles() {
    const list = [];
    if (!this.snapshot) { this.hud.setBubbles(list); return; }
    const w = window.innerWidth, h = window.innerHeight;
    for (const p of this.snapshot.players) {
      if (!p.em) continue;
      const ent = this.players.get(p.id);
      if (!ent) continue;
      tmpV.set(ent.api.group.position.x, 2.9, ent.api.group.position.z);
      tmpV.project(this.camera);
      const visible = tmpV.z < 1 && tmpV.x > -1.1 && tmpV.x < 1.1;
      list.push({
        id: p.id,
        text: p.em,
        x: (tmpV.x * 0.5 + 0.5) * w,
        y: (-tmpV.y * 0.5 + 0.5) * h - 20,
        visible,
      });
    }
    this.hud.setBubbles(list);
  }

  updateHud(dt) {
    const snap = this.snapshot;
    if (!snap) return;
    this.hudTick += dt;
    const me = snap.players.find((p) => p.id === this.myId);

    // araç çubuğu
    const cdFrac = {};
    for (const [key, t] of Object.entries(this.cd)) {
      const max = TOOLS[key]?.cooldown || 1;
      cdFrac[key] = Math.max(0, Math.min(1, (t - this.time) / max));
    }
    this.hud.updateTools(me?.ch, cdFrac, this.slotFlash ? { [this.slotFlash]: true } : null);
    this.slotFlash = null;

    if (this.hudTick > 0.08) {
      this.hudTick = 0;
      this.hud.updateTop(snap.tl, snap.caught, ANIMAL_SPAWNS.length);
      this.hud.updateTeam(snap.players, null);
      this.hud.updateAnimalList(snap.animals, null);
      const st = me?.st || {};
      const badges = [];
      if (st.net) badges.push('🕸️ Ağdasın');
      if (st.netlock) badges.push('🐒 Ağın çalındı');
      if (st.slow) badges.push('🐍 Yavaşsın');
      if (st.dizzy) badges.push('💫 Sersem');
      if (st.deaf) badges.push('🔇 Kulaklar çınlıyor');
      if (st.slip) badges.push('🍌 Kaydın');
      if (me?.d) badges.push('💀 Yerde');
      this.hud.setBadges(badges);
      this.hud.setNet(!!st.net);
      this.hud.setStamina(this.stamina);
      this.hud.trimFeed(performance.now());
    }

    // minimap
    this.minimapAcc += dt;
    if (this.minimapAcc > 0.06) {
      this.minimapAcc = 0;
      this.hud.drawMinimap(snap, snap.animals, null);
    }

    // etkileşim uyarısı
    if (me?.d) {
      this.hud.prompt('💀 Yerdesin — arkadaşını bekle · <kbd>Z</kbd> ile yardım çağır');
    } else if (this.reviveTarget) {
      const rv = this.reviveTarget.rv || 0;
      this.hud.prompt(`<kbd>E</kbd> basılı tut — <b>${escape(this.reviveTarget.n)}</b> kaldırılıyor`, rv);
    } else {
      this.hud.prompt(null);
    }

    if (this.phase === 'playing') {
      const timeLeft = snap.tl;
      if (timeLeft <= 10 && Math.ceil(timeLeft) !== this.lastTick) {
        this.lastTick = Math.ceil(timeLeft);
        this.audio.play('tick');
      }
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.update(dt);
    requestAnimationFrame(this.loop);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() { this.running = false; }
}

// sadece çit/duvar/bina engelleri (kamera için)
function blockedByWall(x, z, r) {
  for (const w of MAP.walls) {
    if (Math.abs(x - w.x) < w.w / 2 + r && Math.abs(z - w.z) < w.d / 2 + r) return true;
  }
  return false;
}

function dirtyDot(nx, nz, yaw) {
  return nx * Math.sin(yaw) + nz * Math.cos(yaw);
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
