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
  const group = new THREE.Group();
  const root = new THREE.Group();          // yalpalamayı/düşmeyi yönetir
  group.add(root);

  const skin = 0xf3c9a0;
  const khaki = color;
  const shade = new THREE.Color(color).multiplyScalar(0.62).getHex();
  const dark = new THREE.Color(color).multiplyScalar(0.34).getHex();
  const pants = 0x3b4a34;
  const bootColor = 0x2a2420;

  // ---------- kalça ----------
  const hips = new THREE.Group();
  hips.position.y = 0.8;
  root.add(hips);

  const pelvis = box(0.4, 0.19, 0.27, pants);
  hips.add(pelvis);
  const belt = box(0.43, 0.075, 0.3, 0x4a3524);
  belt.position.y = 0.12;
  hips.add(belt);
  const buckle = box(0.075, 0.06, 0.02, 0xd8b06a);
  buckle.position.set(0, 0.12, 0.155);
  hips.add(buckle);

  // ---------- bacaklar ----------
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.125, -0.03, 0);
    hips.add(hip);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.22, 4, 8), mat(pants));
    thigh.position.y = -0.17;
    thigh.castShadow = true;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.35;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.22, 4, 8), mat(pants));
    shin.position.y = -0.15;
    shin.castShadow = true;
    knee.add(shin);
    const boot = box(0.17, 0.11, 0.28, bootColor);
    boot.position.set(0, -0.29, 0.05);
    knee.add(boot);
    legs.push({ hip, knee });
  }

  // ---------- gövde ----------
  const chest = new THREE.Group();
  chest.position.y = 0.11;
  hips.add(chest);

  const torso = box(0.42, 0.46, 0.26, khaki);
  torso.position.y = 0.27;
  torso.castShadow = true;
  chest.add(torso);
  const vest = box(0.39, 0.32, 0.3, dark);
  vest.position.set(0, 0.33, 0.004);
  chest.add(vest);
  const pocket = box(0.12, 0.09, 0.02, shade);
  pocket.position.set(-0.13, 0.29, 0.165);
  chest.add(pocket);
  const badge = box(0.065, 0.065, 0.02, 0xffd166);
  badge.position.set(0.13, 0.38, 0.165);
  chest.add(badge);
  const pack = box(0.33, 0.35, 0.16, 0x6b5a3a);
  pack.position.set(0, 0.31, -0.19);
  chest.add(pack);
  for (const s of [-1, 1]) {
    const strap = box(0.055, 0.32, 0.03, 0x4a3a24);
    strap.position.set(s * 0.12, 0.33, -0.11);
    strap.rotation.x = 0.12;
    chest.add(strap);
  }

  // ---------- kafa ----------
  const head = new THREE.Group();
  head.position.y = 0.58;
  chest.add(head);
  const neck = cyl(0.075, 0.085, 0.09, skin);
  neck.position.y = -0.06;
  head.add(neck);
  const skull = sph(0.215, skin);
  skull.scale.set(1, 1.03, 0.96);
  head.add(skull);
  // ---------- yüz (gözler, kaşlar, ağız) ----------
  const face = new THREE.Group();
  head.add(face);
  const eyeWhiteMat = mat(0xf8f5ef, { unique: true });
  const pupilMat = mat(0x141414, { unique: true, roughness: 0.28 });
  const lids = [];
  const brows = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.082, 0.032, 0.166);
    face.add(eye);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), eyeWhiteMat);
    white.scale.set(1, 1, 0.5);
    eye.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), pupilMat);
    pupil.position.set(0, 0, 0.019);
    eye.add(pupil);
    // göz kapağı (kırpma / sersem / yerde) — sadece kapanırken görünür
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.041, 10, 8), mat(skin, { unique: true }));
    lid.scale.set(1.05, 1, 0.62);
    lid.position.set(0, 0.078, 0.002);
    lid.visible = false;
    eye.add(lid);
    lids.push(lid);
    // kaş
    const brow = box(0.075, 0.016, 0.018, 0x3a2a1e);
    brow.position.set(s * 0.083, 0.079, 0.19);
    brow.rotation.z = s * -0.14;
    face.add(brow);
    brows.push(brow);
  }
  const nose = sph(0.032, 0xd8a37a);
  nose.position.set(0, -0.045, 0.205);
  head.add(nose);
  // ağız: üzgün/koşarken açılır
  // ağız: kapalıyken ince çizgi, koşarken/bağırırken açılır
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.012), mat(0x4a1c18, { unique: true }));
  mouth.position.set(0, -0.118, 0.192);
  face.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), mat(0xfdf7ee, { unique: true }));
  teeth.position.set(0, 0.014, 0.004);
  mouth.add(teeth);
  teeth.visible = false;
  const cap = cyl(0.225, 0.238, 0.1, dark);
  cap.position.y = 0.165;
  head.add(cap);
  const capTop = sph(0.228, dark);
  capTop.scale.set(1, 0.5, 1);
  capTop.position.y = 0.2;
  head.add(capTop);
  const brim = box(0.35, 0.032, 0.19, dark);
  brim.position.set(0, 0.145, 0.185);
  head.add(brim);
  const capBadge = box(0.055, 0.055, 0.02, 0xffd166);
  capBadge.position.set(0, 0.2, 0.215);
  head.add(capBadge);

  // ---------- kollar ----------
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.252, 0.46, 0);
    chest.add(shoulder);
    const deltoid = sph(0.078, khaki);
    deltoid.position.y = -0.01;
    shoulder.add(deltoid);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.19, 4, 8), mat(khaki));
    upper.position.y = -0.155;
    upper.castShadow = true;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), mat(shade));
    fore.position.y = -0.14;
    fore.castShadow = true;
    elbow.add(fore);
    const hand = sph(0.075, skin);
    hand.position.y = -0.27;
    elbow.add(hand);
    arms.push({ shoulder, elbow, hand });
  }

  // ---------- ağ (sağ el) ----------
  const netGroup = new THREE.Group();
  netGroup.position.set(0.03, -0.26, 0.04);
  netGroup.rotation.set(0.34, 0, 0.17);
  arms[1].elbow.add(netGroup);
  const stick = cyl(0.026, 0.032, 0.9, 0x8a6b3f);
  stick.position.y = 0.45;
  netGroup.add(stick);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 6, 14), mat(0xd8d8c0));
  hoop.position.y = 0.88;
  netGroup.add(hoop);
  const netMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.34, 10, 1, true),
    mat(0xe8e6d0, { transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  netMesh.position.y = 0.72;
  netMesh.rotation.x = Math.PI;
  netGroup.add(netMesh);

  // ---------- animasyon durumu ----------
  const ACTION_DUR = { net: 0.55, dart: 0.45, bait: 0.5, trap: 0.6, shove: 0.36, peel: 0.44, fire: 0.5 };
  const st = {
    phase: 0,
    lastT: 0,
    fall: 0,
    spin: 0,
    slipAngle: 0,
    wasSlip: false,
    cur: {
      thighL: 0, thighR: 0, kneeL: 0.05, kneeR: 0.05,
      armLx: 0, armRx: 0, armLz: 0.14, armRz: -0.14,
      elbowL: -0.22, elbowR: -0.3, lean: 0, twist: 0,
      headX: 0, headY: 0, headLook: 0, hipY: 0, hipRoll: 0, rootY: 0, fall: 0,
    },
  };
  const ease = (a, b, x) => a + (b - a) * Math.max(0, Math.min(1, x));

  const api = {
    group,
    root,
    hips,
    chest,
    head,
    legs,
    arms,
    netGroup,
    face: { lids, brows, mouth, teeth },
    downed: false,
    actionDur: ACTION_DUR,

    animate(t, opts = {}) {
      const dt = Math.min(0.06, Math.max(0.008, t - st.lastT || 0.016));
      st.lastT = t;

      const moving = !!opts.moving;
      const speed = Math.min(1.8, opts.speed ?? 1);
      const sprint = !!opts.sprint && moving;
      const downed = !!opts.downed;
      const netted = !!opts.netted;
      const slip = !!opts.slip;
      const dizzy = !!opts.dizzy;
      const revive = opts.revive || 0;
      const act = opts.action || null;
      const hurt = opts.hurt || 0;
      const headYaw = Math.max(-1.0, Math.min(1.0, opts.headYaw || 0));

      const P = {
        thighL: 0, thighR: 0, kneeL: 0.06, kneeR: 0.06,
        armLx: 0, armRx: 0, armLz: 0.14, armRz: -0.14,
        elbowL: -0.22, elbowR: -0.3, lean: 0.02, twist: 0,
        headX: 0, headY: 0, headLook: 0, hipY: 0, hipRoll: 0, rootY: 0,
      };

      // nefes alma
      const breathe = Math.sin(t * 1.7) * 0.018;
      P.lean += breathe * 0.5;
      P.rootY += breathe * 0.2;
      P.headLook = headYaw;

      if (moving) {
        const stride = sprint ? 13 : 8.4;
        st.phase += dt * stride * speed;
        const s = Math.sin(st.phase);
        const amp = sprint ? 1.0 : 0.72;
        P.thighL = s * amp;
        P.thighR = -s * amp;
        P.kneeL = Math.max(0, -s) * (sprint ? 1.5 : 1.05) + 0.06;
        P.kneeR = Math.max(0, s) * (sprint ? 1.5 : 1.05) + 0.06;
        P.armLx = -s * amp * 0.85;
        P.armRx = s * amp * 0.85;
        P.elbowL = -0.45 - Math.max(0, s) * (sprint ? 1.1 : 0.45);
        P.elbowR = -0.45 - Math.max(0, -s) * (sprint ? 1.1 : 0.45);
        P.rootY += Math.abs(Math.sin(st.phase)) * (sprint ? 0.055 : 0.03);
        P.lean = (sprint ? 0.23 : 0.1) + breathe * 0.4;
        P.headX = -P.lean * 0.6;
        P.hipRoll = Math.sin(st.phase) * 0.045;
        P.hipY = -0.01;
      } else {
        P.armLx = Math.sin(t * 1.05) * 0.045;
        P.armRx = Math.sin(t * 1.05 + 1.4) * 0.045;
        P.armLz = 0.16;
        P.armRz = -0.16;
        P.hipY = Math.sin(t * 1.7) * 0.008;
        P.headY = Math.sin(t * 0.42) * 0.1;
      }

      // ---------- araç animasyonları ----------
      if (act && ACTION_DUR[act.type]) {
        const p = Math.min(1, act.t / ACTION_DUR[act.type]);
        switch (act.type) {
          case 'net':
            if (p < 0.4) {
              const w = p / 0.4;
              P.armRx = ease(0, -2.3, w);
              P.elbowR = ease(-0.3, -1.15, w);
              P.twist = ease(0, 0.38, w);
              P.lean -= 0.05 * w;
            } else {
              const w = Math.min(1, (p - 0.4) / 0.32);
              P.armRx = ease(-2.3, 1.4, w);
              P.elbowR = ease(-1.15, -0.1, w);
              P.twist = ease(0.38, -0.3, w);
              P.lean += 0.14 * w;
            }
            P.hipY -= 0.03;
            break;
          case 'dart':
            P.armRx = p < 0.35 ? ease(0, -1.85, p / 0.35) : ease(-1.85, 0.55, (p - 0.35) / 0.5);
            P.elbowR = -0.55;
            P.twist = 0.14;
            break;
          case 'bait': {
            const w = Math.sin(p * Math.PI);
            P.lean = 0.05 + 0.55 * w;
            P.hipY -= 0.11 * w;
            P.armRx = -0.55 * w;
            P.armLx = -0.35 * w;
            P.elbowR = -0.1;
            break;
          }
          case 'trap': {
            const w = Math.sin(p * Math.PI);
            P.hipY -= 0.32 * w;
            P.kneeL += 1.15 * w;
            P.kneeR += 1.15 * w;
            P.thighL -= 0.58 * w;
            P.thighR -= 0.58 * w;
            P.armLx = -1.0 * w;
            P.armRx = -1.0 * w;
            P.elbowL = -0.85 * w;
            P.elbowR = -0.85 * w;
            P.lean = 0.08 + 0.42 * w;
            break;
          }
          case 'shove': {
            const w = Math.min(1, p / 0.22);
            P.armLx = -1.55 * w;
            P.armRx = -1.55 * w;
            P.armLz = 0.05;
            P.armRz = -0.05;
            P.elbowL = -0.08;
            P.elbowR = -0.08;
            P.lean = 0.08 + 0.26 * w;
            break;
          }
          case 'peel': {
            const w = Math.sin(Math.min(1, p / 0.7) * Math.PI);
            P.armRx = -0.35 - 1.15 * w;
            P.armRz = -0.95 * w - 0.14;
            P.twist = -0.22 * w;
            break;
          }
          case 'fire':
            P.armRx = p < 0.38 ? ease(0, -2.65, p / 0.38) : ease(-2.65, 0.9, (p - 0.38) / 0.62);
            P.elbowR = -0.85;
            P.lean = p < 0.38 ? -0.09 : 0.2;
            P.armLx = -0.3;
            break;
          default:
            break;
        }
      }

      // ---------- durum pozları ----------
      if (netted) {
        P.armLz = 0.55; P.armRz = -0.55;
        P.armLx = 0.25; P.armRx = 0.25;
        P.elbowL = -1.2; P.elbowR = -1.2;
        P.hipRoll = Math.sin(t * 17) * 0.055;
      }
      if (dizzy) {
        P.headY = Math.sin(t * 6.2) * 0.55;
        P.headX = Math.sin(t * 4.1) * 0.16;
        P.hipRoll = Math.sin(t * 3.1) * 0.09;
        P.armLz = 0.6;
        P.armRz = -0.6;
        P.lean = 0.06 + Math.sin(t * 2.2) * 0.06;
      }
      if (revive > 0) {
        P.hipY -= 0.34;
        P.thighL -= 0.5;
        P.thighR -= 0.5;
        P.kneeL += 1.5;
        P.kneeR += 1.5;
        P.lean = 0.42;
        P.armLx = -1.15;
        P.armRx = -1.15;
        P.elbowL = -0.55;
        P.elbowR = -0.55;
        P.headX = 0.2;
      }
      if (hurt > 0) {
        P.lean = -0.22;
        P.headX = -0.28;
        P.armLx = 0.5;
        P.armRx = 0.5;
      }

      // düşme / kayma
      if (slip && !st.wasSlip) {
        st.spin = 7 + Math.random() * 3;
        st.slipAngle = 0;
      }
      st.wasSlip = slip;
      if (slip) {
        st.fall = Math.min(1, st.fall + dt * 7);
        st.slipAngle += dt * st.spin;
        st.spin *= Math.exp(-3.5 * dt);
        P.armLz = 1.0;
        P.armRz = -1.0;
        P.armLx = -0.9;
        P.armRx = -0.9;
        P.kneeL = 0.6;
        P.kneeR = 0.6;
      } else if (downed) {
        st.fall = Math.min(1, st.fall + dt * 7);
        st.slipAngle *= Math.exp(-6 * dt);
        const crawl = Math.sin(t * 3.2);
        P.armLx = -1.3 + crawl * 0.45;
        P.armRx = -1.3 - crawl * 0.45;
        P.elbowL = -0.9;
        P.elbowR = -0.9;
        P.thighL = 0.35 + crawl * 0.2;
        P.thighR = 0.35 - crawl * 0.2;
        P.kneeL = 0.5;
        P.kneeR = 0.5;
        P.headX = -0.35;
      } else {
        st.fall = Math.max(0, st.fall - dt * 6);
        st.slipAngle *= Math.exp(-6 * dt);
      }

      // ---------- yumuşat ve uygula ----------
      const k = 1 - Math.exp(-17 * dt);
      const c = st.cur;
      for (const key of Object.keys(c)) {
        if (key === 'fall') continue;
        const target = P[key] !== undefined ? P[key] : c[key];
        c[key] += (target - c[key]) * k;
      }
      c.fall += (st.fall - c.fall) * (1 - Math.exp(-12 * dt));

      legs[0].hip.rotation.x = c.thighL;
      legs[1].hip.rotation.x = c.thighR;
      legs[0].hip.rotation.z = 0.03;
      legs[1].hip.rotation.z = -0.03;
      legs[0].knee.rotation.x = c.kneeL;
      legs[1].knee.rotation.x = c.kneeR;
      for (let i = 0; i < 2; i++) {
        const sx = i === 0 ? 1 : -1;
        arms[i].shoulder.rotation.x = i === 0 ? c.armLx : c.armRx;
        arms[i].shoulder.rotation.z = i === 0 ? c.armLz : c.armRz;
        arms[i].elbow.rotation.x = i === 0 ? c.elbowL : c.elbowR;
      }
      hips.position.y = 0.8 + c.hipY;
      hips.rotation.z = c.hipRoll;
      chest.rotation.x = c.lean;
      chest.rotation.y = c.twist + c.headLook * 0.34;
      head.rotation.x = c.headX - c.lean * 0.5;
      head.rotation.y = c.headY + c.headLook * 0.72;

      // ---------- yüz: kırpma, kaş, ağız ----------
      const blinkCycle = t % 3.7;
      let blink = blinkCycle < 0.15 ? Math.sin((blinkCycle / 0.15) * Math.PI) : 0;
      if (dizzy) blink = Math.max(blink, 0.55 + Math.sin(t * 9) * 0.2);
      if (downed || slip) blink = 1;
      for (const lid of lids) {
        lid.visible = blink > 0.02;
        lid.position.y = 0.078 - blink * 0.082;
      }

      const browLift = sprint ? 0.014 : 0;
      const browAngry = dizzy || hurt > 0 ? -0.016 : 0;
      for (let i = 0; i < brows.length; i++) {
        const sgn = i === 0 ? -1 : 1;
        brows[i].position.y = 0.079 + browLift + browAngry + Math.sin(t * 1.6 + i) * 0.003;
        brows[i].rotation.z = sgn * (-0.14 - (dizzy || hurt ? 0.22 : 0));
      }

      const openMouth = (sprint && moving ? 0.55 : 0) + (hurt > 0 ? 1 : 0) + (downed ? 0.7 : 0);
      const mouthOpen = Math.min(1.6, openMouth + (act ? 0.25 : 0));
      mouth.scale.set(1 + mouthOpen * 0.25, 1 + mouthOpen * 2.6, 1);
      mouth.position.y = -0.118 - mouthOpen * 0.012;
      mouth.rotation.z = downed ? 0.16 : 0;
      teeth.visible = mouthOpen > 0.55;
      root.position.y = c.rootY + c.fall * 0.16;
      root.rotation.z = -c.fall * 1.36;
      root.rotation.x = c.fall * 0.11;
      root.rotation.y = st.slipAngle * 0.35;
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
  ayi(cfg) {
    const root = new THREE.Group();
    const body = sph(0.85, cfg.color);
    body.scale.set(1.1, 0.92, 1.35);
    body.position.y = 1.35;
    root.add(body);
    const hump = sph(0.55, cfg.color);
    hump.scale.set(1, 0.8, 1);
    hump.position.set(0, 1.85, 0.45);
    root.add(hump);
    const headG = new THREE.Group();
    headG.position.set(0, 1.85, 1.15);
    root.add(headG);
    const head = sph(0.42, cfg.color);
    headG.add(head);
    const snout = box(0.3, 0.24, 0.34, cfg.dark);
    snout.position.set(0, -0.12, 0.34);
    headG.add(snout);
    const nose = sph(0.09, 0x241a12);
    nose.position.set(0, -0.04, 0.52);
    headG.add(nose);
    eyes(headG, 0.05, 0.15, 0.1, 0.34);
    for (const s of [-1, 1]) {
      const ear = sph(0.15, cfg.color);
      ear.scale.set(1, 1, 0.6);
      ear.position.set(s * 0.3, 0.32, 0.02);
      headG.add(ear);
      const earIn = sph(0.08, cfg.dark);
      earIn.scale.set(1, 1, 0.5);
      earIn.position.set(s * 0.3, 0.32, 0.09);
      headG.add(earIn);
      const claw = cone(0.055, 0.16, 0xf0e6d0);
      claw.position.set(s * 0.12, -0.2, 0.44);
      claw.rotation.x = Math.PI;
      headG.add(claw);
    }
    const legs = makeLegs(root, 4, 0.34, 0.19, cfg.dark, [
      [-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6],
    ]);
    const tail = sph(0.14, cfg.dark);
    tail.position.set(0, 1.5, -1.05);
    root.add(tail);
    return { root, legs, head: headG, quadruped: true, height: 2.1 };
  },

  timsah(cfg) {
    const root = new THREE.Group();
    const body = sph(0.72, cfg.color);
    body.scale.set(1.0, 0.5, 1.9);
    body.position.y = 0.5;
    root.add(body);
    // sırt çıkıntıları
    for (let i = 0; i < 6; i++) {
      const spike = cone(0.1, 0.22, cfg.dark);
      spike.position.set(0, 0.82, 0.9 - i * 0.32);
      root.add(spike);
    }
    const headG = new THREE.Group();
    headG.position.set(0, 0.52, 1.35);
    root.add(headG);
    const skull = sph(0.32, cfg.color);
    skull.scale.set(1, 0.55, 0.9);
    headG.add(skull);
    const jaw = box(0.34, 0.16, 0.85, cfg.color);
    jaw.position.set(0, -0.06, 0.6);
    headG.add(jaw);
    const jawLow = box(0.3, 0.1, 0.78, cfg.dark);
    jawLow.position.set(0, -0.17, 0.58);
    headG.add(jawLow);
    for (let i = 0; i < 5; i++) {
      for (const s of [-1, 1]) {
        const tooth = cone(0.028, 0.11, 0xffffff);
        tooth.position.set(s * 0.15, -0.14, 0.3 + i * 0.16);
        tooth.rotation.x = Math.PI;
        headG.add(tooth);
      }
    }
    for (const s of [-1, 1]) {
      const eye = sph(0.09, 0xe8e04a);
      eye.position.set(s * 0.15, 0.14, 0.12);
      headG.add(eye);
      const pupil = sph(0.035, 0x101010, { unique: true });
      pupil.position.set(s * 0.15, 0.16, 0.2);
      headG.add(pupil);
    }
    // kuyruk (animasyonlu)
    const tail = new THREE.Group();
    tail.position.set(0, 0.45, -1.2);
    root.add(tail);
    for (let i = 0; i < 5; i++) {
      const seg = sph(0.34 - i * 0.06, i % 2 ? cfg.dark : cfg.color);
      seg.scale.set(1, 0.5, 1.1);
      seg.position.set(0, 0, -i * 0.36);
      tail.add(seg);
    }
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.2, 4, 8);
    const legs = [];
    for (const [x, z] of [[-0.6, 0.75], [0.6, 0.75], [-0.6, -0.7], [0.6, -0.7]]) {
      const leg = new THREE.Mesh(legGeo, mat(cfg.dark));
      leg.position.set(x, 0.2, z);
      leg.rotation.z = x > 0 ? -0.9 : 0.9;
      leg.castShadow = true;
      root.add(leg);
      legs.push(leg);
    }
    return { root, legs, head: headG, height: 1.1, tail, croc: true };
  },
};

// oyun içinde daha okunaklı görünsünler diye hafif büyütme
const SIZE_SCALE = {
  aslan: 1.14, kaplan: 1.12, goril: 1.14, devekusu: 1.12, maymun: 1.18,
  yilan: 1.25, fil: 1.04, penguen: 1.22, tavus: 1.14, ayi: 1.1, timsah: 1.15,
};

export function createAnimal(species, cfg) {
  const builder = BUILDERS[species] || BUILDERS.maymun;
  const built = builder(cfg);
  const group = new THREE.Group();
  group.add(built.root);
  group.scale.setScalar(SIZE_SCALE[species] || 1.1);

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
      if (p.tail && p.croc) {
        p.tail.rotation.y = Math.sin(t * 3 + this.phase) * 0.32 * (moving ? 1.6 : 0.7);
        p.tail.rotation.x = Math.sin(t * 2 + this.phase) * 0.07;
      }
      if (state.lunge > 0) {
        p.root.position.z = Math.sin(state.lunge * Math.PI) * 0.5;
        p.root.rotation.x = -Math.sin(state.lunge * Math.PI) * 0.25;
      } else {
        p.root.position.z = 0;
        p.root.rotation.x = 0;
      }
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
