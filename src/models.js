// ---------------------------------------------------------------------------
// Prosedürel 3D modeller: bekçiler ve hayvanlar (harici dosya yok)
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.02,
    flatShading: opts.flat ?? false,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
    wireframe: opts.wireframe ?? false,
    side: opts.side ?? THREE.FrontSide,
  });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

function box(w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.castShadow = true;
  return m;
}
function sph(r, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, opts.seg ?? 12, opts.seg2 ?? 9), mat(color, opts));
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opts.seg ?? 10), mat(color, opts));
  m.castShadow = true;
  return m;
}
function cone(r, h, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, opts.seg ?? 8), mat(color, opts));
  m.castShadow = true;
  return m;
}

function eyes(parent, size, spread, y, z, color = 0x101010) {
  for (const s of [-1, 1]) {
    const e = sph(size, color, { unique: true, roughness: 0.35 });
    e.position.set(s * spread, y, z);
    parent.add(e);
  }
}

// ===========================================================================
// BEKÇİ (oyuncu)
// ===========================================================================
export function createRanger(color) {
  const g = new THREE.Group();
  const root = new THREE.Group();
  g.add(root);

  const skin = 0xf3c9a0;
  const khaki = color;
  const dark = new THREE.Color(color).multiplyScalar(0.45).getHex();

  // bacaklar
  const legGeo = new THREE.CapsuleGeometry(0.13, 0.42, 4, 8);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat(0x3a4a33));
    leg.position.set(s * 0.16, 0.42, 0);
    leg.castShadow = true;
    root.add(leg);
    const boot = box(0.24, 0.16, 0.32, 0x2a2420);
    boot.position.set(s * 0.16, 0.16, 0.05);
    root.add(boot);
    legs.push(leg);
  }

  // gövde
  const torso = box(0.56, 0.66, 0.34, khaki);
  torso.position.y = 1.0;
  root.add(torso);
  const belt = box(0.58, 0.09, 0.36, 0x4a3524);
  belt.position.y = 0.72;
  root.add(belt);
  const vest = box(0.5, 0.32, 0.38, dark);
  vest.position.set(0, 1.1, 0.01);
  root.add(vest);
  const badge = box(0.09, 0.09, 0.02, 0xffd166);
  badge.position.set(-0.16, 1.18, 0.2);
  root.add(badge);

  // kollar
  const arms = [];
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.38, 4, 8);
  for (const s of [-1, 1]) {
    const holder = new THREE.Group();
    holder.position.set(s * 0.36, 1.28, 0);
    const arm = new THREE.Mesh(armGeo, mat(khaki));
    arm.position.y = -0.24;
    arm.castShadow = true;
    holder.add(arm);
    const hand = sph(0.1, skin);
    hand.position.y = -0.48;
    holder.add(hand);
    root.add(holder);
    arms.push(holder);
  }

  // kafa
  const head = new THREE.Group();
  head.position.y = 1.52;
  root.add(head);
  const skull = sph(0.25, skin);
  head.add(skull);
  eyes(head, 0.045, 0.09, 0.04, 0.22);
  const cap = cyl(0.24, 0.26, 0.14, dark);
  cap.position.y = 0.18;
  head.add(cap);
  const brim = box(0.4, 0.04, 0.22, dark);
  brim.position.set(0, 0.13, 0.2);
  head.add(brim);

  // ağ (sağ elde)
  const netGroup = new THREE.Group();
  netGroup.position.set(0.36, 0.9, 0.12);
  netGroup.rotation.set(-0.5, 0, -0.25);
  const stick = cyl(0.035, 0.04, 1.15, 0x8a6b3f);
  stick.position.y = 0.1;
  netGroup.add(stick);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 14), mat(0xd8d8c0));
  hoop.position.y = 0.72;
  netGroup.add(hoop);
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.25, 0.42, 10, 1, true),
    mat(0xe8e6d0, { transparent: true, opacity: 0.42, side: THREE.DoubleSide, wireframe: false }),
  );
  mesh.position.y = 0.52;
  mesh.rotation.x = Math.PI;
  netGroup.add(mesh);
  root.add(netGroup);

  // sırt çantası
  const pack = box(0.36, 0.4, 0.2, 0x6b5a3a);
  pack.position.set(0, 1.06, -0.26);
  root.add(pack);

  const api = {
    group: g,
    root,
    legs,
    arms,
    head,
    netGroup,
    downed: false,
    animate(t, moving, speed = 1) {
      const w = moving ? Math.sin(t * 9.5 * Math.min(1.4, 0.6 + speed)) : 0;
      const amp = moving ? 0.55 : 0;
      legs[0].rotation.x = w * amp;
      legs[1].rotation.x = -w * amp;
      arms[0].rotation.x = -w * amp * 0.8;
      arms[1].rotation.x = w * amp * 0.5;
      root.position.y = moving ? Math.abs(Math.sin(t * 9.5)) * 0.045 : 0;
      head.rotation.z = Math.sin(t * 1.6) * 0.02;
      if (api.downed) {
        root.rotation.z = Math.PI * 0.42;
        root.rotation.x = -0.25;
        root.position.y = -0.72;
        netGroup.rotation.x = -0.2;
      } else {
        root.rotation.z *= 0.85;
        root.rotation.x *= 0.85;
      }
    },
  };
  return api;
}

// ===========================================================================
// HAYVANLAR
// ===========================================================================
function makeLegs(parent, count, len, r, color, positions) {
  const legGeo = new THREE.CapsuleGeometry(r, len, 4, 8);
  const legs = [];
  for (const [x, z] of positions) {
    const leg = new THREE.Mesh(legGeo, mat(color));
    leg.position.set(x, len / 2 + r * 0.6, z);
    leg.castShadow = true;
    parent.add(leg);
    legs.push(leg);
  }
  return legs;
}

const BUILDERS = {
  aslan(cfg) {
    const root = new THREE.Group();
    const body = sph(0.8, cfg.color);
    body.scale.set(1.05, 0.92, 1.55);
    body.position.y = 1.0;
    root.add(body);
    const chest = sph(0.6, cfg.color);
    chest.scale.set(1.05, 1.05, 0.9);
    chest.position.set(0, 1.1, 0.75);
    root.add(chest);
    // yele
    const mane = sph(0.66, 0x7a4d16);
    mane.scale.set(1.02, 1.02, 0.62);
    mane.position.set(0, 1.28, 1.12);
    root.add(mane);
    const headG = new THREE.Group();
    headG.position.set(0, 1.34, 1.32);
    root.add(headG);
    const head = sph(0.42, cfg.color);
    headG.add(head);
    const muzzle = box(0.34, 0.24, 0.3, 0xe8d4a8);
    muzzle.position.set(0, -0.1, 0.34);
    headG.add(muzzle);
    const nose = sph(0.07, 0x2a1c10);
    nose.position.set(0, -0.04, 0.48);
    headG.add(nose);
    eyes(headG, 0.055, 0.16, 0.09, 0.34);
    for (const s of [-1, 1]) {
      const ear = sph(0.11, cfg.color);
      ear.scale.set(1, 1, 0.5);
      ear.position.set(s * 0.3, 0.28, -0.02);
      headG.add(ear);
    }
    const legs = makeLegs(root, 4, 0.42, 0.15, cfg.color, [
      [-0.42, 0.55], [0.42, 0.55], [-0.42, -0.55], [0.42, -0.55],
    ]);
    const tail = cyl(0.05, 0.06, 1.0, cfg.color);
    tail.rotation.x = -0.9;
    tail.position.set(0, 1.1, -1.1);
    root.add(tail);
    const tuft = sph(0.13, 0x7a4d16);
    tuft.position.set(0, 1.6, -1.5);
    root.add(tuft);
    return { root, legs, head: headG, quadruped: true, height: 1.5 };
  },

  kaplan(cfg) {
    const root = new THREE.Group();
    const body = sph(0.72, cfg.color);
    body.scale.set(0.95, 0.85, 1.62);
    body.position.y = 1.02;
    root.add(body);
    for (let i = 0; i < 6; i++) {
      const st = box(1.3, 0.06, 0.14, cfg.dark);
      st.position.set(0, 1.55, -0.85 + i * 0.32);
      root.add(st);
      const st2 = box(0.06, 0.5, 0.1, cfg.dark);
      st2.position.set(0.66, 1.1, -0.85 + i * 0.32);
      root.add(st2);
      const st3 = st2.clone();
      st3.position.x = -0.66;
      root.add(st3);
    }
    const headG = new THREE.Group();
    headG.position.set(0, 1.25, 1.18);
    root.add(headG);
    const head = sph(0.4, cfg.color);
    headG.add(head);
    const muzzle = box(0.36, 0.26, 0.28, 0xf5ead2);
    muzzle.position.set(0, -0.11, 0.32);
    headG.add(muzzle);
    const nose = sph(0.06, 0x2a1410);
    nose.position.set(0, -0.06, 0.46);
    headG.add(nose);
    eyes(headG, 0.055, 0.15, 0.08, 0.33);
    for (const s of [-1, 1]) {
      const ear = sph(0.1, cfg.color);
      ear.position.set(s * 0.27, 0.3, -0.02);
      headG.add(ear);
    }
    for (const s of [-1, 1]) {
      const wh = box(0.05, 0.26, 0.05, 0xffffff);
      wh.position.set(s * 0.16, -0.16, 0.44);
      headG.add(wh);
    }
    const legs = makeLegs(root, 4, 0.44, 0.13, cfg.color, [
      [-0.38, 0.55], [0.38, 0.55], [-0.38, -0.6], [0.38, -0.6],
    ]);
    const tail = cyl(0.055, 0.07, 1.25, cfg.color);
    tail.rotation.x = -0.55;
    tail.position.set(0, 1.25, -1.2);
    root.add(tail);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 5, 8), mat(cfg.dark));
      ring.position.set(0, 1.35 + i * 0.18, -1.5 - i * 0.12);
      ring.rotation.x = 0.3;
      root.add(ring);
    }
    return { root, legs, head: headG, quadruped: true, height: 1.4 };
  },

  goril(cfg) {
    const root = new THREE.Group();
    const torso = sph(0.78, cfg.color);
    torso.scale.set(1.15, 1.15, 0.9);
    torso.position.y = 1.25;
    root.add(torso);
    const belly = sph(0.5, 0x4a4a56);
    belly.scale.set(1, 1.1, 0.7);
    belly.position.set(0, 0.95, 0.35);
    root.add(belly);
    const headG = new THREE.Group();
    headG.position.set(0, 1.95, 0.16);
    root.add(headG);
    const head = sph(0.42, cfg.color);
    head.scale.set(1, 0.95, 0.9);
    headG.add(head);
    const brow = box(0.5, 0.1, 0.2, 0x2a2a32);
    brow.position.set(0, 0.12, 0.3);
    headG.add(brow);
    const face = sph(0.27, 0x565660);
    face.scale.set(1, 0.85, 0.6);
    face.position.set(0, -0.05, 0.3);
    headG.add(face);
    eyes(headG, 0.05, 0.13, 0.05, 0.36, 0xffffff);
    for (const s of [-1, 1]) {
      const pupil = sph(0.03, 0x101010, { unique: true });
      pupil.position.set(s * 0.13, 0.05, 0.4);
      headG.add(pupil);
      const ear = sph(0.08, cfg.color);
      ear.position.set(s * 0.36, 0.06, 0);
      headG.add(ear);
    }
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = cyl(0.14, 0.18, 1.15, cfg.color);
      arm.position.set(s * 0.7, 1.15, 0.05);
      arm.rotation.z = s * 0.15;
      root.add(arm);
      const fist = sph(0.19, 0x2a2a32);
      fist.position.set(s * 0.78, 0.55, 0.12);
      root.add(fist);
      arms.push(arm);
    }
    const legs = makeLegs(root, 2, 0.32, 0.17, cfg.color, [[-0.32, 0.1], [0.32, 0.1]]);
    return { root, legs, arms, head: headG, quadruped: false, height: 2.2 };
  },

  devekusu(cfg) {
    const root = new THREE.Group();
    const body = sph(0.6, cfg.color);
    body.scale.set(1, 1.15, 1.25);
    body.position.y = 1.55;
    root.add(body);
    const tail = sph(0.4, cfg.dark);
    tail.scale.set(1, 0.8, 1.1);
    tail.position.set(0, 1.72, -0.55);
    root.add(tail);
    const neck = cyl(0.11, 0.15, 1.25, cfg.dark);
    neck.position.set(0, 2.35, 0.3);
    neck.rotation.x = 0.2;
    root.add(neck);
    const headG = new THREE.Group();
    headG.position.set(0, 2.95, 0.42);
    root.add(headG);
    const head = sph(0.2, cfg.dark);
    head.scale.set(0.9, 1, 1.2);
    headG.add(head);
    const beak = cone(0.09, 0.26, 0xe8a33a);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.26);
    headG.add(beak);
    eyes(headG, 0.05, 0.11, 0.06, 0.12);
    const legGeo = new THREE.CapsuleGeometry(0.07, 1.0, 4, 6);
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mat(0xd9b48a));
      leg.position.set(s * 0.18, 0.62, 0);
      leg.castShadow = true;
      root.add(leg);
      legs.push(leg);
      const foot = box(0.2, 0.1, 0.34, 0xd9b48a);
      foot.position.set(s * 0.18, 0.09, 0.08);
      root.add(foot);
    }
    for (const s of [-1, 1]) {
      const wing = box(0.08, 0.42, 0.5, cfg.color);
      wing.position.set(s * 0.58, 1.5, -0.1);
      wing.rotation.z = s * 0.15;
      root.add(wing);
    }
    return { root, legs, head: headG, quadruped: false, height: 2.2 };
  },

  maymun(cfg) {
    const root = new THREE.Group();
    const body = sph(0.4, cfg.color);
    body.scale.set(1, 1.15, 0.95);
    body.position.y = 1.0;
    root.add(body);
    const belly = sph(0.28, cfg.dark);
    belly.position.set(0, 0.95, 0.24);
    belly.scale.set(1, 1.1, 0.6);
    root.add(belly);
    const headG = new THREE.Group();
    headG.position.set(0, 1.45, 0.05);
    root.add(headG);
    const head = sph(0.3, cfg.color);
    headG.add(head);
    const face = sph(0.2, cfg.dark);
    face.scale.set(1, 0.9, 0.6);
    face.position.set(0, -0.03, 0.22);
    headG.add(face);
    eyes(headG, 0.045, 0.09, 0.06, 0.26);
    for (const s of [-1, 1]) {
      const ear = sph(0.11, cfg.dark);
      ear.scale.set(0.5, 1, 1);
      ear.position.set(s * 0.3, 0, 0);
      headG.add(ear);
    }
    for (const s of [-1, 1]) {
      const arm = cyl(0.07, 0.08, 0.75, cfg.color);
      arm.position.set(s * 0.42, 0.85, 0.05);
      arm.rotation.z = s * 0.45;
      root.add(arm);
    }
    const legs = makeLegs(root, 2, 0.3, 0.09, cfg.color, [[-0.16, 0.05], [0.16, 0.05]]);
    const tail = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const seg = sph(0.06 - i * 0.007, cfg.color);
      seg.position.set(0, 0.9 + Math.sin(i * 0.9) * 0.25, -0.4 - i * 0.12);
      tail.add(seg);
    }
    root.add(tail);
    return { root, legs, head: headG, quadruped: false, height: 1.7, tail };
  },

  yilan(cfg) {
    const root = new THREE.Group();
    const segs = [];
    for (let i = 0; i < 11; i++) {
      const r = 0.26 * (1 - i * 0.055);
      const s = sph(r, i % 2 ? cfg.color : cfg.dark);
      s.position.set(0, r + 0.05, 0);
      root.add(s);
      segs.push(s);
    }
    const headG = new THREE.Group();
    root.add(headG);
    const head = sph(0.3, cfg.color);
    head.scale.set(1, 0.75, 1.3);
    headG.add(head);
    eyes(headG, 0.05, 0.13, 0.08, 0.16, 0xf0e050);
    const tongue = box(0.04, 0.03, 0.3, 0xff4d6d);
    tongue.position.set(0, -0.04, 0.42);
    headG.add(tongue);
    const spot = sph(0.16, 0xd93b3b);
    spot.position.set(0, 0.24, -0.05);
    headG.add(spot);
    return { root, segs, head: headG, height: 0.6, snake: true };
  },

  fil(cfg) {
    const root = new THREE.Group();
    const body = sph(1.35, cfg.color);
    body.scale.set(1.05, 0.95, 1.35);
    body.position.y = 2.25;
    root.add(body);
    const headG = new THREE.Group();
    headG.position.set(0, 2.55, 1.4);
    root.add(headG);
    const head = sph(0.85, cfg.color);
    head.scale.set(1, 0.95, 0.9);
    headG.add(head);
    for (const s of [-1, 1]) {
      const ear = sph(0.9, cfg.dark);
      ear.scale.set(0.16, 1, 0.85);
      ear.position.set(s * 0.8, 0.05, -0.15);
      ear.rotation.z = s * 0.2;
      headG.add(ear);
    }
    const trunk = new THREE.Group();
    trunk.position.set(0, -0.45, 0.6);
    headG.add(trunk);
    for (let i = 0; i < 5; i++) {
      const seg = cyl(0.15 - i * 0.012, 0.17 - i * 0.012, 0.34, cfg.color);
      seg.position.set(0, -i * 0.32, i * 0.06);
      seg.rotation.x = 0.08 * i;
      trunk.add(seg);
    }
    eyes(headG, 0.07, 0.42, 0.25, 0.68);
    for (const s of [-1, 1]) {
      const tusk = cone(0.07, 0.5, 0xfff3d6);
      tusk.position.set(s * 0.28, -0.5, 0.72);
      tusk.rotation.x = -0.35;
      tusk.rotation.z = s * 0.2;
      headG.add(tusk);
    }
    const legGeo = new THREE.CylinderGeometry(0.32, 0.36, 1.5, 10);
    const legs = [];
    for (const [x, z] of [[-0.62, 0.9], [0.62, 0.9], [-0.62, -0.9], [0.62, -0.9]]) {
      const leg = new THREE.Mesh(legGeo, mat(cfg.color));
      leg.position.set(x, 0.78, z);
      leg.castShadow = true;
      root.add(leg);
      legs.push(leg);
    }
    const tail = cyl(0.06, 0.08, 0.9, cfg.color);
    tail.position.set(0, 2.1, -1.75);
    tail.rotation.x = 0.3;
    root.add(tail);
    return { root, legs, head: headG, height: 3.4, trunk };
  },

  penguen(cfg) {
    const root = new THREE.Group();
    const body = sph(0.42, cfg.color);
    body.scale.set(1, 1.5, 0.95);
    body.position.y = 1.0;
    root.add(body);
    const belly = sph(0.34, cfg.dark);
    belly.scale.set(0.85, 1.45, 0.7);
    belly.position.set(0, 0.96, 0.16);
    root.add(belly);
    const headG = new THREE.Group();
    headG.position.set(0, 1.62, 0.02);
    root.add(headG);
    const head = sph(0.26, cfg.color);
    headG.add(head);
    const beak = cone(0.09, 0.24, 0xffa32e);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.26);
    headG.add(beak);
    eyes(headG, 0.045, 0.1, 0.07, 0.2);
    for (const s of [-1, 1]) {
      const flip = box(0.07, 0.5, 0.26, cfg.color);
      flip.position.set(s * 0.42, 1.05, 0);
      flip.rotation.z = s * 0.22;
      root.add(flip);
      const foot = box(0.2, 0.08, 0.26, 0xffa32e);
      foot.position.set(s * 0.15, 0.05, 0.12);
      root.add(foot);
    }
    const legs = [];
    return { root, legs, head: headG, height: 1.7 };
  },

  tavus(cfg) {
    const root = new THREE.Group();
    const body = sph(0.45, cfg.color);
    body.scale.set(1, 1.1, 1.4);
    body.position.y = 1.35;
    root.add(body);
    const neck = cyl(0.08, 0.12, 0.95, cfg.color);
    neck.position.set(0, 1.95, 0.24);
    root.add(neck);
    const headG = new THREE.Group();
    headG.position.set(0, 2.42, 0.3);
    root.add(headG);
    const head = sph(0.16, cfg.color);
    headG.add(head);
    const beak = cone(0.06, 0.18, 0xe8d45c);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.01, 0.19);
    headG.add(beak);
    eyes(headG, 0.035, 0.07, 0.05, 0.12);
    for (let i = 0; i < 3; i++) {
      const cr = cyl(0.006, 0.012, 0.22, cfg.dark);
      cr.position.set(-0.05 + i * 0.05, 0.16, 0);
      cr.rotation.z = (i - 1) * 0.35;
      headG.add(cr);
    }
    // kuyruk yelpazesi
    const fan = new THREE.Group();
    fan.position.set(0, 1.35, -0.5);
    for (let i = 0; i < 11; i++) {
      const a = (-Math.PI / 2) + (i / 10) * Math.PI;
      const feather = box(0.12, 0.95, 0.04, 0x1f9f9f);
      feather.position.set(Math.sin(a) * 0.55, Math.cos(a) * 0.55 - 0.1, 0);
      feather.rotation.z = -a;
      fan.add(feather);
      const eyeF = sph(0.07, 0x2a5fbf);
      eyeF.position.set(Math.sin(a) * 0.95, Math.cos(a) * 0.95 - 0.1, 0);
      fan.add(eyeF);
    }
    fan.rotation.x = -0.35;
    root.add(fan);
    const legGeo = new THREE.CapsuleGeometry(0.05, 0.7, 4, 6);
    const legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, mat(0xd9b48a));
      leg.position.set(s * 0.14, 0.5, 0);
      root.add(leg);
      legs.push(leg);
    }
    return { root, legs, head: headG, height: 1.8, fan };
  },
};

export function createAnimal(species, cfg) {
  const builder = BUILDERS[species] || BUILDERS.maymun;
  const built = builder(cfg);
  const group = new THREE.Group();
  group.add(built.root);

  const api = {
    group,
    parts: built,
    phase: Math.random() * 10,
    stuckGlow: null,
    animate(t, moving, state = {}) {
      const p = this.parts;
      const sp = state.speed ?? 1;
      const bob = moving ? Math.abs(Math.sin(t * (5 + sp * 0.6) + this.phase)) * 0.08 : 0;
      p.root.position.y = bob;
      if (p.legs && p.legs.length && !p.snake) {
        const w = moving ? Math.sin(t * (6 + sp * 0.8) + this.phase) : 0;
        const amp = moving ? 0.5 : 0;
        p.legs.forEach((leg, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          leg.rotation.x = w * amp * dir;
        });
      }
      if (p.head) {
        p.head.rotation.x = (state.eating ? 0.75 : 0) + Math.sin(t * 1.4 + this.phase) * 0.04;
        p.head.rotation.y = state.scared ? Math.sin(t * 8) * 0.2 : Math.sin(t * 0.7 + this.phase) * 0.12;
      }
      if (p.snake && p.segs) {
        p.segs.forEach((seg, i) => {
          const wob = Math.sin(t * 4 + this.phase - i * 0.55) * (0.16 + i * 0.02);
          seg.position.x = wob;
          seg.position.z = -i * 0.28;
          seg.position.y = 0.2 + Math.abs(Math.sin(t * 3 + this.phase - i * 0.4)) * 0.03;
        });
        if (p.head) {
          p.head.position.set(Math.sin(t * 4 + this.phase) * 0.2, 0.26, 0.16);
          p.head.rotation.y = Math.cos(t * 4 + this.phase) * 0.3;
        }
      }
      if (p.fan) {
        p.fan.rotation.x = -0.35 - (state.scared ? 1.1 : Math.sin(t * 0.8) * 0.07);
      }
      if (p.trunk) p.trunk.rotation.x = Math.sin(t * 1.5 + this.phase) * 0.12 + (state.scared ? -0.4 : 0);
      if (p.arms) {
        p.arms.forEach((arm, i) => {
          arm.rotation.x = moving ? Math.sin(t * 5 + this.phase + i * Math.PI) * 0.35 : 0;
        });
      }
      if (state.stuck) {
        p.root.position.x = Math.sin(t * 30) * 0.04;
      } else {
        p.root.position.x = 0;
      }
      if (state.slowed) {
        p.root.rotation.z = Math.sin(t * 2.4) * 0.04;
      } else {
        p.root.rotation.z = 0;
      }
    },
  };
  return api;
}

// yakalanan hayvan için sepet/kafes (kamyona giderken kısa animasyon)
export function createCage(color = 0x9aa0a6) {
  const g = new THREE.Group();
  const barMat = mat(color, { metalness: 0.5, roughness: 0.5 });
  const s = 0.8;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), barMat);
    bar.position.set(x, 0.8, z);
    g.add(bar);
  }
  for (const y of [0.2, 1.5]) {
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ax ? s * 2 : 0.06, 0.06, az ? s * 2 : 0.06), barMat);
      bar.position.set(0, y, 0);
      g.add(bar);
    }
  }
  return g;
}
