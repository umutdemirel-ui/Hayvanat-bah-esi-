// ---------------------------------------------------------------------------
// Harita: çitler, engeller, dekor. Sunucu ve istemci aynı veriyi kullanır.
// ---------------------------------------------------------------------------

// deterministik rastgele (herkeste aynı harita)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240719);

export const MAP = {
  bounds: 58,
  walls: [],
  circles: [],
  props: [],
  enclosures: [],
  paths: [],
  ponds: [],
  playerSpawns: [
    { x: -3, z: 5 }, { x: 3, z: 5 }, { x: -3, z: 9 }, { x: 3, z: 9 },
  ],
};

const wall = (x, z, w, d, h = 3, kind = 'fence') => {
  MAP.walls.push({ x, z, w, d, h, kind });
};
const circleBlock = (x, z, r, kind = 'rock') => MAP.circles.push({ x, z, r, kind });

// --- çit dikdörtgeni, kapı boşluklu ----------------------------------------
function fenceRect(cx, cz, w, d, gaps = []) {
  const t = 0.35;                 // çit kalınlığı
  const hx = w / 2, hz = d / 2;
  const sides = [
    { id: 'n', ax: cx - hx, az: cz - hz, bx: cx + hx, bz: cz - hz },
    { id: 's', ax: cx - hx, az: cz + hz, bx: cx + hx, bz: cz + hz },
    { id: 'w', ax: cx - hx, az: cz - hz, bx: cx - hx, bz: cz + hz },
    { id: 'e', ax: cx + hx, az: cz - hz, bx: cx + hx, bz: cz + hz },
  ];
  for (const s of sides) {
    const gap = gaps.find((g) => g.side === s.id);
    const horizontal = s.id === 'n' || s.id === 's';
    const len = horizontal ? w : d;
    const start = horizontal ? s.ax : s.az;
    const fixed = horizontal ? s.az : s.ax;
    let segs;
    if (!gap) segs = [[0, len]];
    else {
      const gStart = Math.max(0, len / 2 + (gap.offset || 0) - (gap.width || 5) / 2);
      const gEnd = Math.min(len, len / 2 + (gap.offset || 0) + (gap.width || 5) / 2);
      segs = [];
      if (gStart > 0.2) segs.push([0, gStart]);
      if (gEnd < len - 0.2) segs.push([gEnd, len]);
    }
    for (const [a, b] of segs) {
      const mid = start + (a + b) / 2;
      const L = b - a;
      if (L < 0.2) continue;
      if (horizontal) wall(mid, fixed, L, t, 2.8, 'fence');
      else wall(fixed, mid, t, L, 2.8, 'fence');
    }
  }
}

// --- dekor ------------------------------------------------------------------
function tree(x, z, s = 1) {
  MAP.props.push({ type: 'tree', x, z, rot: rnd() * Math.PI * 2, scale: s });
  circleBlock(x, z, 0.55 * s, 'tree');
}
function bush(x, z, s = 1) {
  MAP.props.push({ type: 'bush', x, z, rot: rnd() * Math.PI * 2, scale: s });
}
function rock(x, z, s = 1) {
  MAP.props.push({ type: 'rock', x, z, rot: rnd() * Math.PI * 2, scale: s });
  circleBlock(x, z, 0.9 * s, 'rock');
}
function lamp(x, z) {
  MAP.props.push({ type: 'lamp', x, z, rot: 0, scale: 1 });
  circleBlock(x, z, 0.3, 'lamp');
}
function bench(x, z, rot = 0) {
  MAP.props.push({ type: 'bench', x, z, rot, scale: 1 });
}

// ===========================================================================
// YERLEŞİM
// ===========================================================================

// sınır çiti
wall(0, -MAP.bounds, MAP.bounds * 2, 1, 4, 'stone');
wall(0, MAP.bounds, MAP.bounds * 2, 1, 4, 'stone');
wall(-MAP.bounds, 0, 1, MAP.bounds * 2, 4, 'stone');
wall(MAP.bounds, 0, 1, MAP.bounds * 2, 4, 'stone');

// ---- kuş bakışı yerleşim ----
const ZONES = [
  { id: 'aslan', label: 'ASLAN', emoji: '🦁', x: -34, z: -30, w: 26, d: 22, gap: { side: 'e', width: 6 }, color: 0x8a6a3a },
  { id: 'kaplan', label: 'KAPLAN', emoji: '🐯', x: 31, z: -33, w: 26, d: 22, gap: { side: 'w', width: 6 }, color: 0x7d5a2c },
  { id: 'fil', label: 'FİL', emoji: '🐘', x: 44, z: 0, w: 20, d: 26, gap: { side: 'w', width: 7 }, color: 0x606a5a },
  { id: 'goril', label: 'GORİL', emoji: '🦍', x: -34, z: 31, w: 24, d: 22, gap: { side: 'n', width: 6 }, color: 0x46523f },
  { id: 'devekusu', label: 'DEVEKUŞU', emoji: '🦤', x: 32, z: 31, w: 26, d: 20, gap: { side: 'n', width: 6 }, color: 0x8c7a4a },
  { id: 'maymun', label: 'MAYMUN ADASI', emoji: '🐒', x: 10, z: -42, w: 18, d: 14, gap: { side: 's', width: 6 }, color: 0x5e7a3e },
  { id: 'yilan', label: 'SÜRÜNGEN EVİ', emoji: '🐍', x: -47, z: 8, w: 16, d: 16, gap: { side: 'e', width: 6 }, color: 0x4f6b3a },
  { id: 'penguen', label: 'PENGUEN HAVUZU', emoji: '🐧', x: -9, z: 43, w: 18, d: 14, gap: { side: 'n', width: 6 }, color: 0x4a6b7a },
];

for (const z of ZONES) {
  fenceRect(z.x, z.z, z.w, z.d, [z.gap]);
  MAP.enclosures.push({ ...z });
}

// penguen havuzu (çarpışmasız su)
MAP.ponds.push({ x: -9, z: 43, r: 5.5 });

// merkez meydan çeşmesi
circleBlock(0, 0, 2.2, 'fountain');
MAP.props.push({ type: 'fountain', x: 0, z: 0, rot: 0, scale: 1 });

// bakım binası (yem deposu)
wall(-2, -20, 12, 7, 4.5, 'building');
MAP.props.push({ type: 'building', x: -2, z: -20, rot: 0, scale: 1 });

// kafes kamyonu / taşıma aracı (yakalananların gittiği yer) — dekor
MAP.props.push({ type: 'truck', x: 6, z: 14, rot: 0.35, scale: 1 });

// yollar (görsel)
MAP.paths.push(
  { x: 0, z: 0, w: 13, d: 9, rot: 0 },
  { x: -17, z: -14, w: 7, d: 30, rot: 0.65 },
  { x: 16, z: -16, w: 7, d: 30, rot: -0.6 },
  { x: -22, z: 14, w: 7, d: 24, rot: -0.6 },
  { x: 22, z: 14, w: 7, d: 24, rot: 0.6 },
  { x: -16, z: 26, w: 7, d: 20, rot: 0.5 },
  { x: 0, z: -26, w: 7, d: 20, rot: 0 },
  { x: 22, z: 0, w: 22, d: 7, rot: 0 },
  { x: -24, z: 0, w: 16, d: 7, rot: 0 },
  { x: -9, z: 26, w: 7, d: 16, rot: 0 },
);

// ağaçlar — meydanın etrafında ve yollar boyunca
const treeSpots = [
  [-13, -6], [13, -6], [-13, 8], [13, 9], [-10, -12], [11, -13],
  [-24, -20], [-20, 3], [-16, -26], [18, -24], [24, -12], [26, 8],
  [8, 22], [-6, 20], [-16, 20], [18, 20], [-28, 16], [28, 18],
  [-44, -12], [-20, -40], [22, -44], [40, -20], [42, 16], [6, -30],
  [-30, 6], [-36, -14], [36, 8], [-2, 30], [4, 34],
];
treeSpots.forEach(([x, z], i) => tree(x, z, 0.85 + (i % 4) * 0.12));

// çalılar + kayalar
const bushSpots = [[-9, -3], [9, -3], [-9, 12], [9, 13], [-20, 12], [20, 12], [-34, -18], [33, -20], [42, 12], [-40, 24]];
bushSpots.forEach(([x, z], i) => bush(x, z, 0.9 + (i % 3) * 0.2));

const rockSpots = [[-8, -16], [9, -18], [-28, 12], [30, 12], [-52, -8], [52, 8], [16, 38], [-18, 38], [44, 32], [-44, -44]];
rockSpots.forEach(([x, z], i) => rock(x, z, 0.8 + (i % 3) * 0.35));

// aydınlatma direkleri
[[-7, 7], [7, 7], [-7, -7], [7, -7], [-20, 0], [20, 0], [0, 20], [0, -20]].forEach(([x, z]) => lamp(x, z));

// banklar
bench(-5, 3, 0.2); bench(5, 3, -0.2); bench(-5, -3, 2.9); bench(5, -3, 3.3);
bench(-15, 11, 1.2); bench(15, 11, -1.2);

// giriş tabelaları (çit kapılarının yanında)
for (const z of ZONES) {
  const s = z.gap.side;
  const off = (z.gap.width || 6) / 2 + 1.6;
  let sx = z.x, sz = z.z;
  if (s === 'n') { sx = z.x - off; sz = z.z - z.d / 2 - 1.2; }
  if (s === 's') { sx = z.x - off; sz = z.z + z.d / 2 + 1.2; }
  if (s === 'w') { sx = z.x - z.w / 2 - 1.2; sz = z.z - off; }
  if (s === 'e') { sx = z.x + z.w / 2 + 1.2; sz = z.z - off; }
  MAP.props.push({ type: 'sign', x: sx, z: sz, rot: 0, scale: 1, label: z.label, emoji: z.emoji });
}

// yardımcı: nokta herhangi bir engelin içinde mi?
export function isBlocked(x, z, r = 0.4) {
  for (const w of MAP.walls) {
    if (Math.abs(x - w.x) < w.w / 2 + r && Math.abs(z - w.z) < w.d / 2 + r) return true;
  }
  for (const c of MAP.circles) {
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return true;
  }
  return false;
}

// daireyi engellerden dışarı it (sunucu + istemci tahmini)
export function resolveCollisions(x, z, r) {
  let px = x, pz = z;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const w of MAP.walls) {
      const hw = w.w / 2 + r, hd = w.d / 2 + r;
      const dx = px - w.x, dz = pz - w.z;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
        const ox = hw - Math.abs(dx);
        const oz = hd - Math.abs(dz);
        if (ox < oz) px += dx >= 0 ? ox : -ox;
        else pz += dz >= 0 ? oz : -oz;
        moved = true;
      }
    }
    for (const c of MAP.circles) {
      const dx = px - c.x, dz = pz - c.z;
      const rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.0001;
        px = c.x + (dx / d) * rr;
        pz = c.z + (dz / d) * rr;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const b = MAP.bounds - 1.2 - r;
  px = Math.max(-b, Math.min(b, px));
  pz = Math.max(-b, Math.min(b, pz));
  return { x: px, z: pz };
}

// görüş hattı (ağ/şırınga için basit duvar kontrolü)
export function segmentBlocked(ax, az, bx, bz) {
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const w of MAP.walls) {
      if (Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2) return true;
    }
  }
  return false;
}
