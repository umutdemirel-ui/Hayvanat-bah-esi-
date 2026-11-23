// ---------------------------------------------------------------------------
// HAYVANAT BAHÇESİ KAÇKINLARI — paylaşılan ayarlar (sunucu + istemci)
// ---------------------------------------------------------------------------

export const WORLD = {
  size: 120,          // dünya -60..60
  playerSpeed: 7.6,
  playerRadius: 0.48,
  playerMaxHp: 100,
  reviveRange: 3.1,
  reviveTime: 2.4,
  autoReviveTime: 18,  // tek başınaysan bu kadar sonra ayağa kalkarsın
  interactRange: 2.4,
};

export const ROUND = {
  animals: 10,
  time: 420,            // 7 dakika
  // ağ sınırsızdır (sadece bekleme süresi), diğerleri sınırlı ve zamanla yenilenir
  startingToolCharges: { net: 0, dart: 4, bait: 4, trap: 3 },
};

export const SPECIES = {
  aslan: {
    name: 'Aslan', emoji: '🦁', points: 120, speed: 6.4, radius: 1.05,
    color: 0xd8a24a, dark: 0x9a6b28, aggression: 0.92, aggroRange: 20,
    fear: 0.35, diet: 'et', danger: 3, attackRange: 2.0, attackDamage: 38,
    desc: 'Ağır pençe. Yem atıp sakinleştir, sonra ağla.',
  },
  kaplan: {
    name: 'Kaplan', emoji: '🐯', points: 145, speed: 7.6, radius: 1.0,
    color: 0xe87b1e, dark: 0x2b1d12, aggression: 0.8, aggroRange: 22,
    fear: 0.45, diet: 'et', danger: 3, attackRange: 2.0, attackDamage: 34,
    ambush: true, desc: 'Pusu kurar, sonra şarj eder. Sırtını dönme!',
  },
  goril: {
    name: 'Goril', emoji: '🦍', points: 150, speed: 5.4, radius: 1.0,
    color: 0x3b3b46, dark: 0x22222a, aggression: 0.7, aggroRange: 18,
    fear: 0.2, diet: 'meyve', danger: 3, attackRange: 2.2, attackDamage: 40,
    grabber: true, desc: 'Seni yakalar ve fırlatır. Uzaktan ağ at.',
  },
  devekusu: {
    name: 'Devekuşu', emoji: '🦤', points: 95, speed: 9.6, radius: 0.75,
    color: 0x2f2f38, dark: 0xd98b3f, aggression: 0.5, aggroRange: 15,
    fear: 0.85, diet: 'ot', danger: 2, attackRange: 2.0, attackDamage: 22,
    desc: 'Çok hızlı ve ürkek. Köşeye sıkıştır ya da yemle.',
  },
  maymun: {
    name: 'Maymun', emoji: '🐒', points: 85, speed: 7.0, radius: 0.62,
    color: 0x8a5a33, dark: 0xd9b08a, aggression: 0.3, aggroRange: 16,
    fear: 0.7, diet: 'meyve', danger: 1, attackRange: 1.8, attackDamage: 10,
    thief: true, desc: 'Eşyalarını çalar! Ağın elinden gidebilir.',
  },
  yilan: {
    name: 'Yılan', emoji: '🐍', points: 75, speed: 4.6, radius: 0.55,
    color: 0x4c9a3f, dark: 0x2d6b27, aggression: 0.65, aggroRange: 9,
    fear: 0.3, diet: 'et', danger: 2, attackRange: 1.7, attackDamage: 16,
    venom: true, desc: 'Zehirli. Isırdığında yavaşlarsın. Küçük hedef.',
  },
  fil: {
    name: 'Fil', emoji: '🐘', points: 180, speed: 4.2, radius: 1.7,
    color: 0x8b8f9a, dark: 0x5d6069, aggression: 0.55, aggroRange: 14,
    fear: 0.1, diet: 'ot', danger: 3, attackRange: 3.0, attackDamage: 45,
    pusher: true, desc: 'Devasa. Kapanları ezer, seni savurur.',
  },
  penguen: {
    name: 'Penguen', emoji: '🐧', points: 65, speed: 7.8, radius: 0.58,
    color: 0x2d3b52, dark: 0xf4f7ff, aggression: 0.25, aggroRange: 10,
    fear: 0.9, diet: 'balik', danger: 1, attackRange: 1.6, attackDamage: 8,
    jitter: true, desc: 'Zikzak kaçar, ağ atmak zor. Kapan kur.',
  },
  tavus: {
    name: 'Tavus Kuşu', emoji: '🦚', points: 110, speed: 5.8, radius: 0.72,
    color: 0x1f8f8f, dark: 0x144e86, aggression: 0.2, aggroRange: 12,
    fear: 0.95, diet: 'ot', danger: 1, attackRange: 1.6, attackDamage: 6,
    hopper: true, desc: 'Kısa mesafe uçar, çitlerden atlar. Köşeye sıkıştır.',
  },
};

// kaçkınlar çitlerin dışında, açık alanda başlar
export const ANIMAL_SPAWNS = [
  { species: 'aslan', x: -36, z: -10 },
  { species: 'kaplan', x: 26, z: -20 },
  { species: 'goril', x: -24, z: 14 },
  { species: 'devekusu', x: 40, z: 18 },
  { species: 'maymun', x: 16, z: -30 },
  { species: 'yilan', x: -36, z: -2 },
  { species: 'fil', x: 48, z: 20 },
  { species: 'penguen', x: -4, z: 30 },
  { species: 'tavus', x: 20, z: 16 },
  { species: 'maymun', x: -18, z: -6 },
];

export const DIET_LABEL = {
  et: 'Et',
  meyve: 'Meyve',
  ot: 'Ot',
  balik: 'Balık',
};

export const TOOLS = {
  net: {
    name: 'Ağ', key: '1', emoji: '🕸️', cooldown: 0.95, charges: null, infinite: true,
    desc: 'Hedefe ağ at. Hayvanı yakalamaya yaklaştırır, arkadaşını ağa dolatır.',
  },
  dart: {
    name: 'Şırınga', key: '2', emoji: '💉', cooldown: 5, charges: 'dart', max: 4, regen: 26,
    desc: 'Sakinleştirici. Hayvanı yavaşlatır — arkadaşını sersemletir.',
  },
  bait: {
    name: 'Yem', key: '3', emoji: '🍖', cooldown: 6.5, charges: 'bait', max: 4, regen: 22,
    desc: 'Yem bırak; hayvan yemeye gelir (yakalamak kolaylaşır).',
  },
  trap: {
    name: 'Kapan', key: '4', emoji: '🪤', cooldown: 8.5, charges: 'trap', max: 3, regen: 30,
    desc: 'Kapan kur. Hayvanı kilitler. Arkadaşın da içine düşebilir.',
  },
  shove: {
    name: 'İt', key: 'V', emoji: '✋', cooldown: 2.6,
    desc: 'Yakındakini sertçe it. Aslanın önüne doğru itmek serbest.',
  },
  peel: {
    name: 'Muz Kabuğu', key: 'B', emoji: '🍌', cooldown: 8,
    desc: 'Yere muz kabuğu at. Basan kayar. İstisnasız herkes.',
  },
  fire: {
    name: 'Maytap', key: 'G', emoji: '🧨', cooldown: 11,
    desc: 'Patlat: hayvanları korkutup kaçır (sürüleri yönlendir!).',
  },
};

export const COLORS = [
  0xff5d5d, 0x4fa8ff, 0x8cf05c, 0xffd93d, 0xc65cff, 0x31e8c4,
  0xff8c42, 0xff6bd6,
];

export const NAMES = ['Ranger', 'Bekçi', 'Korucu', 'Şef', 'Çırak', 'Gönüllü'];

// --- küçük yardımcılar -----------------------------------------------------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
export const rand = (a, b) => a + Math.random() * (b - a);

export function weightedPoint() {
  return { x: rand(-52, 52), z: rand(-52, 52) };
}
