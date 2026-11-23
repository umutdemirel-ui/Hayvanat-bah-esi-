// ---------------------------------------------------------------------------
// Arayüz katmanı: HUD, minimap, akış, sonuç ekranı
// ---------------------------------------------------------------------------
import { MAP } from '../shared/map.js';
import { TOOLS, SPECIES, COLORS, DIET_LABEL } from '../shared/config.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      timer: $('timer'),
      catchCount: $('catchCount'),
      animalList: $('animalList'),
      teamPanel: $('teamPanel'),
      minimap: $('minimap'),
      minimapWrap: $('minimapWrap'),
      feed: $('feed'),
      banner: $('banner'),
      prompt: $('prompt'),
      toolbar: $('toolbar'),
      trollbar: $('trollbar'),
      bubbles: $('bubbles'),
      badges: $('statusBadges'),
      damage: $('damageFlash'),
      netOverlay: $('netOverlay'),
      crosshair: $('crosshair'),
    };
    this.ctx = this.el.minimap.getContext('2d');
    this.myId = null;
    this.slots = new Map();
    this.chips = new Map();
    this.minimapZoom = 1;
    this.bannerTimer = null;
    this.lastChipUpdate = 0;
    this.teamCache = new Map();
    this.feedItems = [];
    this.baseMap = null;
    this.bubbleEls = new Map();
    this.buildMinimapBase();
    this.buildToolbar();
  }

  // ---------------- kurulum ----------------
  buildToolbar() {
    const toolKeys = ['net', 'dart', 'bait', 'trap'];
    for (const key of toolKeys) {
      const t = TOOLS[key];
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `
        <span class="t-key">${t.key}</span>
        <span class="t-emoji">${t.emoji}</span>
        <span class="t-name">${t.name}</span>
        <span class="t-charges"></span>
        <div class="cd"></div>`;
      d.title = t.desc;
      d.addEventListener('click', () => this.onSlotClick?.(key));
      this.el.toolbar.appendChild(d);
      this.slots.set(key, d);
    }
    for (const key of ['shove', 'peel', 'fire']) {
      const t = TOOLS[key];
      const d = document.createElement('div');
      d.className = 'slot trollslot';
      d.innerHTML = `
        <span class="t-key">${t.key}</span>
        <span class="t-emoji">${t.emoji}</span>
        <div class="cd"></div>`;
      d.title = `${t.name} — ${t.desc}`;
      d.addEventListener('click', () => this.onSlotClick?.(key));
      this.el.trollbar.appendChild(d);
      this.slots.set(key, d);
    }
  }

  buildMinimapBase() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const B = MAP.bounds;
    const f = (v) => ((v + B) / (B * 2)) * S;

    ctx.fillStyle = '#16281a';
    ctx.fillRect(0, 0, S, S);

    // zemin
    const g = ctx.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.72);
    g.addColorStop(0, '#33502f');
    g.addColorStop(1, '#1d3220');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // çit alanları
    for (const z of MAP.enclosures) {
      ctx.fillStyle = `${hex(z.color)}55`;
      ctx.fillRect(f(z.x - z.w / 2), f(z.z - z.d / 2), (z.w / (B * 2)) * S, (z.d / (B * 2)) * S);
      ctx.strokeStyle = `${hex(z.color)}aa`;
      ctx.lineWidth = 2;
      ctx.strokeRect(f(z.x - z.w / 2), f(z.z - z.d / 2), (z.w / (B * 2)) * S, (z.d / (B * 2)) * S);
    }

    // yollar
    ctx.fillStyle = '#a08e68';
    for (const p of MAP.paths) {
      ctx.save();
      ctx.translate(f(p.x), f(p.z));
      ctx.rotate(p.rot);
      ctx.fillRect(-(p.w / (B * 2)) * S / 2, -(p.d / (B * 2)) * S / 2, (p.w / (B * 2)) * S, (p.d / (B * 2)) * S);
      ctx.restore();
    }

    // gölet
    for (const p of MAP.ponds) {
      ctx.beginPath();
      ctx.arc(f(p.x), f(p.z), (p.r / (B * 2)) * S, 0, 7);
      ctx.fillStyle = '#3b6f88';
      ctx.fill();
    }

    // duvarlar
    for (const w of MAP.walls) {
      ctx.fillStyle = w.kind === 'stone' ? '#5c6152' : '#c9d0bd';
      ctx.fillRect(f(w.x - w.w / 2), f(w.z - w.d / 2), Math.max(1, (w.w / (B * 2)) * S), Math.max(1, (w.d / (B * 2)) * S));
    }

    // meydan
    ctx.beginPath();
    ctx.arc(f(0), f(0), (15 / (B * 2)) * S, 0, 7);
    ctx.strokeStyle = '#8f9585';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(f(0), f(0), (2.4 / (B * 2)) * S, 0, 7);
    ctx.fillStyle = '#6f8fa0';
    ctx.fill();

    // sınır
    ctx.strokeStyle = '#6b6f60';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, S - 4, S - 4);
    this.baseMap = c;
  }

  setMyId(id) {
    this.myId = id;
  }

  resetRound() {
    this.chips.clear();
    this.el.animalList.innerHTML = '';
    this.feedItems.forEach((f) => f.el.remove());
    this.feedItems = [];
    this.el.feed.innerHTML = '';
    this.bubbleEls.forEach((el) => el.remove());
    this.bubbleEls.clear();
    this.el.banner.className = '';
    this.el.prompt.classList.remove('show');
    this.el.results && this.el.results.classList.add('hidden');
    $('results').classList.add('hidden');
  }

  setAim(info) {
    let el = this.aimEl;
    if (!el) {
      el = document.createElement('div');
      el.id = 'aimInfo';
      this.el.hud.appendChild(el);
      this.aimEl = el;
    }
    if (!info) { el.style.opacity = '0'; return; }
    el.style.opacity = '1';
    el.innerHTML = `<b>${info.emoji} ${info.name}</b>
      <div class="ai-bar"><i style="width:${info.cap}%"></i></div>
      <div class="ai-hint">${info.hint}</div>`;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  // ---------------- araç çubuğu ----------------
  updateTools(charges, cdFrac, activeCooldowns) {
    for (const [key, el] of this.slots) {
      const t = TOOLS[key];
      const cdEl = el.querySelector('.cd');
      const frac = cdFrac[key] || 0;
      cdEl.style.height = `${Math.round(frac * 100)}%`;
      const chargeEl = el.querySelector('.t-charges');
      if (t.charges) {
        const n = charges?.[t.charges] ?? 0;
        chargeEl.textContent = n > 0 ? `×${n}` : '×0';
        chargeEl.style.color = n > 0 ? '#ffb02e' : '#ff5d5d';
        el.classList.toggle('empty', n <= 0);
      } else if (t.infinite) {
        chargeEl.textContent = '∞';
        chargeEl.style.color = '#8cf05c';
        el.classList.toggle('empty', false);
      } else {
        el.classList.toggle('empty', frac > 0.02);
      }
      el.classList.toggle('active', !!activeCooldowns?.[key]);
    }
  }

  // ---------------- hayvan listesi ----------------
  updateAnimalList(animals, caughtList) {
    const seen = new Set();
    for (const a of animals) {
      seen.add(a.id);
      let chip = this.chips.get(a.id);
      if (!chip) {
        const sp = SPECIES[a.s];
        const d = document.createElement('div');
        d.className = 'chip';
        d.innerHTML = `<span class="em">${sp.emoji}</span><span class="name">${sp.name}</span><span class="cap-bar"><i></i></span>`;
        d.title = `${sp.name} — ${sp.desc}`;
        this.el.animalList.appendChild(d);
        chip = d;
        this.chips.set(a.id, d);
      }
      const bar = chip.querySelector('.cap-bar i');
      bar.style.width = `${a.cap}%`;
      chip.classList.toggle('warn', a.cap >= 60);
    }
    for (const [id, chip] of this.chips) {
      if (!seen.has(id) && !chip.classList.contains('caught')) {
        chip.classList.add('caught');
        const bar = chip.querySelector('.cap-bar i');
        if (bar) bar.style.width = '100%';
      }
    }
  }

  // ---------------- takım paneli ----------------
  updateTeam(players, latencies) {
    const wrap = this.el.teamPanel;
    const seen = new Set();
    const sorted = [...players].sort((a, b) => {
      if (a.id === this.myId) return -1;
      if (b.id === this.myId) return 1;
      return b.sc - a.sc;
    });
    for (const p of sorted) {
      seen.add(p.id);
      let row = this.teamCache.get(p.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'tp';
        wrap.appendChild(row);
        this.teamCache.set(p.id, row);
      }
      const col = hex(COLORS[p.c % COLORS.length]);
      const hpPct = Math.max(0, Math.min(100, p.hp));
      const hpCls = hpPct > 60 ? '' : hpPct > 30 ? 'mid' : 'low';
      const tags = [];
      if (p.d) tags.push('<span class="tag bad">YERDE</span>');
      if (p.st?.net) tags.push('<span class="tag net">AĞDA</span>');
      if (p.st?.dizzy) tags.push('<span class="tag bad">SERSEM</span>');
      if (p.st?.slip) tags.push('<span class="tag bad">KAYDI</span>');
      if (p.st?.slow) tags.push('<span class="tag bad">YAVAŞ</span>');
      if (p.rv > 0) tags.push(`<span class="tag rev">KALDIRILIYOR ${Math.round(p.rv * 100)}%</span>`);
      row.className = `tp${p.id === this.myId ? ' me' : ''}${p.d ? ' down' : ''}`;
      row.innerHTML = `
        <span class="dot" style="background:${col};color:${col}"></span>
        <span class="nm" style="color:${col}">${escapeHtml(p.n)}${p.id === this.myId ? ' (sen)' : ''}</span>
        <span class="sc">${p.sc}</span>
        <div class="hpwrap"><div class="hpbar ${hpCls}" style="width:${hpPct}%"></div></div>
        ${tags.length ? `<div class="tags">${tags.join('')}</div>` : ''}
      `;
    }
    for (const [id, row] of this.teamCache) {
      if (!seen.has(id)) { row.remove(); this.teamCache.delete(id); }
    }
  }

  // ---------------- üst bilgi ----------------
  updateTop(timeLeft, caughtCount, total) {
    const m = Math.floor(Math.max(0, timeLeft) / 60);
    const s = Math.floor(Math.max(0, timeLeft) % 60);
    this.el.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.el.timer.classList.toggle('low', timeLeft <= 60);
    this.el.catchCount.textContent = `${caughtCount}/${total}`;
  }

  // ---------------- minimap ----------------
  drawMinimap(snapshot, animals, caughtIds) {
    const ctx = this.ctx;
    const W = this.el.minimap.width;
    const S = W;
    const B = MAP.bounds;
    const f = (v) => ((v + B) / (B * 2)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.baseMap, 0, 0, S, S);

    // kapanlar
    for (const t of snapshot.traps || []) {
      ctx.beginPath();
      ctx.arc(f(t.x), f(t.z), 4, 0, 7);
      ctx.strokeStyle = '#ffcf6a';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // yemler
    for (const b of snapshot.baits || []) {
      ctx.beginPath();
      ctx.arc(f(b.x), f(b.z), 3, 0, 7);
      ctx.fillStyle = '#ff8f4d';
      ctx.fill();
    }
    // maytaplar
    for (const b of snapshot.bombs || []) {
      ctx.beginPath();
      ctx.arc(f(b.x), f(b.z), 5, 0, 7);
      ctx.fillStyle = `rgba(255,70,70,${0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 120))})`;
      ctx.fill();
    }
    // hayvanlar
    for (const a of animals) {
      const sp = SPECIES[a.s];
      const x = f(a.x), y = f(a.z);
      if (a.cap >= 55) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, 7);
        ctx.fillStyle = 'rgba(255,90,46,0.22)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, 7);
      ctx.fillStyle = hex(sp.color);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d1a12';
      ctx.stroke();
      if (a.cap > 0) {
        ctx.beginPath();
        ctx.arc(x, y, 7.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * a.cap) / 100);
        ctx.strokeStyle = '#ffb02e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // oyuncular
    for (const p of snapshot.players || []) {
      const x = f(p.x), y = f(p.z);
      const col = hex(COLORS[p.c % COLORS.length]);
      if (p.id === this.myId) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-p.yaw + Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-6, 6);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 7);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      if (p.d) {
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 7);
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // yakalananlar işareti
    if (caughtIds?.size) {
      // (harita üzerinde kamyon noktası)
      const tx = f(15), ty = f(19);
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, 7);
      ctx.fillStyle = '#6ef07a';
      ctx.fill();
    }
  }

  // ---------------- akış / mesajlar ----------------
  feed(html, cls = '') {
    const d = document.createElement('div');
    d.className = `feed-item ${cls}`;
    d.innerHTML = html;
    this.el.feed.appendChild(d);
    this.feedItems.push({ el: d, t: performance.now() });
    while (this.feedItems.length > 7) {
      const first = this.feedItems.shift();
      first.el.remove();
    }
  }

  trimFeed(now) {
    while (this.feedItems.length && now - this.feedItems[0].t > 7000) {
      const f = this.feedItems.shift();
      f.el.style.opacity = '0';
      f.el.style.transition = 'opacity .4s';
      setTimeout(() => f.el.remove(), 400);
    }
  }

  banner(main, sub = '', ms = 1800, cls = '') {
    const b = this.el.banner;
    b.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ''}`;
    b.className = `show ${cls}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.className = ''; }, ms);
  }

  prompt(text, progress = null) {
    const p = this.el.prompt;
    if (!text) { p.classList.remove('show'); return; }
    p.innerHTML = `${text}${progress !== null ? `<div class="bar"><i style="width:${Math.round(progress * 100)}%"></i></div>` : ''}`;
    p.classList.add('show');
  }

  damage() {
    const d = this.el.damage;
    d.classList.add('on');
    clearTimeout(this.dmgT);
    this.dmgT = setTimeout(() => d.classList.remove('on'), 120);
  }

  setNet(on) { this.el.netOverlay.classList.toggle('on', on); }

  setBadges(list) {
    this.el.badges.innerHTML = list.map((b) => `<span class="badge">${b}</span>`).join('');
  }

  setCrosshair(active) { this.el.crosshair.classList.toggle('hot', active); }

  setDanger(v) {
    if (!this.el.danger) this.el.danger = $('danger');
    if (this.el.danger) this.el.danger.style.opacity = String(Math.min(0.85, v * 0.85));
  }

  // ---------------- baloncuklar ----------------
  setBubbles(list) {
    const alive = new Set();
    for (const b of list) {
      alive.add(b.id);
      let el = this.bubbleEls.get(b.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        this.el.bubbles.appendChild(el);
        this.bubbleEls.set(b.id, el);
      }
      if (el.textContent !== b.text) el.textContent = b.text;
      el.style.left = `${b.x}px`;
      el.style.top = `${b.y}px`;
      el.style.opacity = b.visible ? '1' : '0';
    }
    for (const [id, el] of this.bubbleEls) {
      if (!alive.has(id)) { el.remove(); this.bubbleEls.delete(id); }
    }
  }

  toggleMinimapZoom() {
    this.minimapZoom = this.minimapZoom === 1 ? 1.55 : 1;
    this.el.minimap.style.width = `${220 * this.minimapZoom}px`;
    this.el.minimap.style.height = `${220 * this.minimapZoom}px`;
  }

  // ---------------- sonuç ----------------
  showResults(data, myId) {
    const title = $('resultTitle');
    const sub = $('resultSub');
    const wrap = $('resultAwards');
    title.textContent = data.win ? '🎉 BAHÇE TEMİZ!' : '⌛ SÜRE DOLDU';
    title.className = `result-title ${data.win ? 'win' : 'lose'}`;
    const mm = Math.floor(data.time / 60);
    const ss = Math.floor(data.time % 60);
    sub.innerHTML = data.win
      ? `Tüm kaçkınlar yakalandı! <b>${mm}:${String(ss).padStart(2, '0')}</b> · ${data.rewards.length} bekçi`
      : `${data.caught}/${data.total} hayvan yakalandı · ${data.rewards.length} bekçi daha hızlı olmalıydı`;

    const rewards = [...data.rewards].sort((a, b) => b.score - a.score);
    const medals = ['🥇', '🥈', '🥉', '4.'];
    wrap.innerHTML = rewards.map((r, i) => `
      <div class="aw ${r.id === myId ? 'me' : ''}">
        <div class="rank">${medals[i] || i + 1}</div>
        <div>
          <div class="nm" style="color:${hex(COLORS[(r.colorIdx ?? i) % COLORS.length])}">${escapeHtml(r.name)}</div>
          <div class="title">${r.title || ''}</div>
          <div class="detail">
            ${r.catches} yakalama · ${r.assists} asist · ${r.revives} kaldırma ·
            ${r.troll > 0 ? `${r.troll} trolleme 😈` : 'trolleme yok 😇'}
          </div>
        </div>
        <div class="pts">${r.score}</div>
      </div>
    `).join('');

    if (data.caughtList?.length) {
      const list = document.createElement('div');
      list.className = 'dim';
      list.style.cssText = 'font-size:12px;text-align:center;padding:4px 0 12px';
      list.innerHTML = data.caughtList
        .map((c) => `${SPECIES[c.species].emoji} <b>${SPECIES[c.species].name}</b> → ${escapeHtml(c.byName)}`)
        .join(' &nbsp;·&nbsp; ');
      wrap.appendChild(list);
    }

    $('results').classList.remove('hidden');
    this.hide();
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export { TOOLS, SPECIES, DIET_LABEL };
