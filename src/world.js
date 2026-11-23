// ---------------------------------------------------------------------------
// Hayvanat bahçesi sahnesi (tamamen prosedürel)
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { MAP } from '../shared/map.js';
import { mat } from './models.js';

// eski tarayıcılar için roundRect yedeği
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rad = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  };
}

const SIZE = MAP.bounds * 2;
const w2c = (v, px) => ((v + MAP.bounds) / SIZE) * px;

function noise(ctx, size, count, colors, rmin, rmax) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const x = Math.random() * size, y = Math.random() * size;
    const r = rmin + Math.random() * (rmax - rmin);
    ctx.globalAlpha = 0.12 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function groundTexture() {
  const PX = 2048;
  const c = document.createElement('canvas');
  c.width = PX; c.height = PX;
  const ctx = c.getContext('2d');

  // çim tabanı
  const g = ctx.createLinearGradient(0, 0, PX, PX);
  g.addColorStop(0, '#557f42');
  g.addColorStop(0.5, '#4a743a');
  g.addColorStop(1, '#3f6833');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PX, PX);
  noise(ctx, PX, 2600, ['#6b9a52', '#3c6130', '#7aa85e', '#2f5228', '#86a457'], 4, 26);

  // çit içi zeminler
  for (const z of MAP.enclosures) {
    const x = w2c(z.x, PX), y = w2c(z.z, PX);
    const w = (z.w / SIZE) * PX, h = (z.d / SIZE) * PX;
    ctx.save();
    const col = new THREE.Color(z.color).getStyle();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#00000022' : '#ffffff18';
      const rx = x - w / 2 + Math.random() * w;
      const ry = y - h / 2 + Math.random() * h;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 6 + Math.random() * 30, 4 + Math.random() * 16, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // yollar
  for (const p of MAP.paths) {
    ctx.save();
    ctx.translate(w2c(p.x, PX), w2c(p.z, PX));
    ctx.rotate(p.rot);
    const w = (p.w / SIZE) * PX, h = (p.d / SIZE) * PX;
    ctx.fillStyle = '#c9b183';
    ctx.globalAlpha = 0.95;
    const r = w * 0.45;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#a68f63';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#8f7a52' : '#e2d3ae';
      ctx.beginPath();
      ctx.ellipse(-w / 2 + Math.random() * w, -h / 2 + Math.random() * h, 3 + Math.random() * 10, 2 + Math.random() * 6, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  // merkez meydan (taş)
  ctx.save();
  const cx = w2c(0, PX), cy = w2c(0, PX), cr = (15 / SIZE) * PX;
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, 7);
  ctx.fillStyle = '#b6ad9b';
  ctx.fill();
  ctx.strokeStyle = '#8e8674';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  for (let ring = 1; ring < 7; ring++) {
    ctx.beginPath();
    ctx.arc(cx, cy, (cr / 7) * ring, 0, 7);
    ctx.strokeStyle = ring % 2 ? '#8e8674' : '#d4cbb8';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // gölet kenarı
  for (const p of MAP.ponds) {
    ctx.beginPath();
    ctx.arc(w2c(p.x, PX), w2c(p.z, PX), (p.r / SIZE) * PX * 1.18, 0, 7);
    ctx.fillStyle = '#9fb08a';
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function radialSpriteTexture(inner = 'rgba(255,236,180,0.95)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, 'rgba(255,210,120,0.35)');
  g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(label, emoji) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f2013';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 176, 22);
  ctx.fill();
  ctx.strokeStyle = '#c99a4a';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#ffe9b8';
  ctx.font = 'bold 62px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${emoji} ${label}`, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addTree(g, x, z, rot, scale) {
  const t = new THREE.Group();
  const trunkH = 2.6 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, trunkH, 7),
    mat(0x6b4a2c),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  t.add(trunk);
  const leafColors = [0x3f7d33, 0x4b8f3a, 0x356b2c];
  const blobs = 3 + ((Math.random() * 2) | 0);
  for (let i = 0; i < blobs; i++) {
    const r = (1.1 + Math.random() * 0.8) * scale;
    const leaf = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      mat(leafColors[i % 3], { flat: true }),
    );
    leaf.position.set(
      (Math.random() - 0.5) * 1.5 * scale,
      trunkH + (Math.random() * 0.9) * scale,
      (Math.random() - 0.5) * 1.5 * scale,
    );
    leaf.castShadow = true;
    t.add(leaf);
  }
  t.position.set(x, 0, z);
  t.rotation.y = rot;
  g.add(t);
}

function addBush(g, x, z, rot, scale) {
  const b = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const r = (0.5 + Math.random() * 0.35) * scale;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(i % 2 ? 0x3c7233 : 0x497f38, { flat: true }));
    m.position.set((Math.random() - 0.5) * 1.1 * scale, r * 0.85, (Math.random() - 0.5) * 1.1 * scale);
    m.castShadow = true;
    b.add(m);
  }
  b.position.set(x, 0, z);
  b.rotation.y = rot;
  g.add(b);
}

function addRock(g, x, z, rot, scale) {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.9 * scale, 0),
    mat(0x8d8f88, { flat: true }),
  );
  m.position.set(x, 0.45 * scale, z);
  m.rotation.set(Math.random(), rot, Math.random() * 0.3);
  m.scale.y = 0.75;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
}

function addLamp(g, x, z, glowTex) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.6, 7), mat(0x33383c, { metalness: 0.4 }));
  pole.position.y = 1.8;
  pole.castShadow = true;
  grp.add(pole);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 10, 8),
    mat(0xffe6a8, { emissive: 0xffcf6a, emissiveIntensity: 1.6 }),
  );
  head.position.y = 3.7;
  grp.add(head);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(3.2);
  glow.position.y = 3.7;
  grp.add(glow);
  grp.position.set(x, 0, z);
  g.add(grp);
}

function addBench(g, x, z, rot) {
  const b = new THREE.Group();
  const wood = mat(0x8a6134);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.6), wood);
  seat.position.y = 0.55;
  seat.castShadow = true;
  b.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.1), wood);
  back.position.set(0, 0.85, -0.26);
  back.castShadow = true;
  b.add(back);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.5), mat(0x4c4c4c, { metalness: 0.4 }));
    leg.position.set(s * 0.75, 0.27, 0);
    b.add(leg);
  }
  b.position.set(x, 0, z);
  b.rotation.y = rot;
  g.add(b);
}

function addFountain(g, x, z) {
  const f = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.7, 20), mat(0xb9b3a4));
  basin.position.y = 0.35;
  basin.castShadow = true;
  basin.receiveShadow = true;
  f.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.05, 0.08, 20),
    mat(0x4fa8d8, { transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.2, unique: true }),
  );
  water.position.y = 0.68;
  f.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.9, 10), mat(0xc5bfae));
  column.position.y = 1.4;
  column.castShadow = true;
  f.add(column);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.6, 0.32, 14), mat(0xc5bfae));
  bowl.position.y = 2.4;
  bowl.castShadow = true;
  f.add(bowl);
  const spray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.02, 1.1, 6),
    mat(0xaee6ff, { transparent: true, opacity: 0.5, emissive: 0x77ccff, emissiveIntensity: 0.5 }),
  );
  spray.position.y = 3.0;
  f.add(spray);
  f.position.set(x, 0, z);
  f.userData.spray = spray;
  f.userData.water = water;
  g.add(f);
  return f;
}

function addBuilding(g, x, z) {
  const b = new THREE.Group();
  const wallMat = mat(0x9c8f74);
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 4.5, 7), wallMat);
  body.position.y = 2.25;
  body.castShadow = true;
  body.receiveShadow = true;
  b.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 8), mat(0x7a3a2a));
  roof.position.y = 4.75;
  roof.castShadow = true;
  b.add(roof);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.2, 4), mat(0x8c4630, { flat: true }));
  roof2.position.y = 6;
  roof2.rotation.y = Math.PI / 4;
  b.add(roof2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.2), mat(0x3a2a1c));
  door.position.set(0, 1.5, 3.55);
  b.add(door);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 1.2),
    new THREE.MeshBasicMaterial({ map: signTexture('YEM DEPOSU', '🍖'), transparent: true }),
  );
  sign.position.set(0, 3.6, 3.56);
  b.add(sign);
  b.position.set(x, 0, z);
  g.add(b);
}

function addTruck(g, x, z, rot) {
  const t = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.2), mat(0x2f6b4a));
  cab.position.set(0, 1.5, 2.9);
  cab.castShadow = true;
  t.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.9, 0.15), mat(0x9fd8ff, { metalness: 0.6, roughness: 0.2 }));
  glass.position.set(0, 2, 4.0);
  t.add(glass);
  const cage = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 4.4), mat(0x5a5f66, { metalness: 0.5, roughness: 0.5 }));
  cage.position.set(0, 1.9, -0.6);
  cage.castShadow = true;
  t.add(cage);
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), mat(0xb9bec7, { metalness: 0.7 }));
    bar.position.set(-1.5, 1.9, -2.4 + i * 1.2);
    t.add(bar);
    const bar2 = bar.clone();
    bar2.position.x = 1.5;
    t.add(bar2);
  }
  for (const [wx, wz] of [[-1.4, 3.2], [1.4, 3.2], [-1.4, -2.2], [1.4, -2.2], [-1.4, 0.4], [1.4, 0.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), mat(0x1c1c1e));
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.55, wz);
    t.add(w);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture('TAŞIMA', '🚚'), transparent: true }),
  );
  sign.position.set(0, 2.4, -2.83);
  sign.rotation.y = Math.PI;
  t.add(sign);
  t.position.set(x, 0, z);
  t.rotation.y = rot;
  g.add(t);
}

function addSign(g, p) {
  const s = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 6), mat(0x6b4a2c));
  post.position.y = 1.15;
  post.castShadow = true;
  s.add(post);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.9),
    new THREE.MeshBasicMaterial({ map: signTexture(p.label, p.emoji), transparent: true, side: THREE.DoubleSide }),
  );
  board.position.y = 2.45;
  s.add(board);
  s.position.set(p.x, 0, p.z);
  // tabela meydana baksın
  s.rotation.y = Math.atan2(-p.x, -p.z);
  g.add(s);
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const updates = [];

  // ---- gökyüzü ----
  const skyGeo = new THREE.SphereGeometry(400, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(0x5aa7dd) },
      bottom: { value: new THREE.Color(0xffe3b0) },
      offset: { value: 40 },
      exp: { value: 0.75 },
    },
    vertexShader: `varying vec3 vWorld; void main(){ vWorld = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exp;
      varying vec3 vWorld;
      void main(){
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exp);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(0xcfe0c8, 90, 210);

  // ---- ışık ----
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x5c7f46, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
  sun.position.set(48, 74, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -72;
  sun.shadow.camera.right = 72;
  sun.shadow.camera.top = 72;
  sun.shadow.camera.bottom = -72;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6);
  fill.position.set(-40, 30, -30);
  scene.add(fill);

  // ---- zemin ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- gölet ----
  for (const p of MAP.ponds) {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(p.r, 32),
      mat(0x3f9fd4, { transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.3, unique: true }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(p.x, 0.06, p.z);
    group.add(water);
    updates.push((t) => { water.position.y = 0.06 + Math.sin(t * 1.4) * 0.015; });
  }

  // ---- çitler ----
  const postPositions = [];
  const railMat = mat(0xdfe3d8, { roughness: 0.7, metalness: 0.25 });
  const postMat = mat(0xbfc4b8, { roughness: 0.7, metalness: 0.25 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const railMeshes = [];

  for (const wall of MAP.walls) {
    if (wall.kind === 'building') continue;
    if (wall.kind === 'stone') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wall.h, wall.d), mat(0x8b8474));
      m.position.set(wall.x, wall.h / 2, wall.z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(wall.w + 0.2, 0.25, wall.d + 0.2), mat(0x6d6759));
      cap.position.set(wall.x, wall.h + 0.1, wall.z);
      cap.castShadow = true;
      group.add(cap);
      continue;
    }
    const horizontal = wall.w > wall.d;
    const len = horizontal ? wall.w : wall.d;
    // raylar
    for (const hy of [0.85, 1.75, 2.55]) {
      const rail = new THREE.Mesh(unitBox, railMat);
      rail.scale.set(horizontal ? len : 0.09, 0.09, horizontal ? 0.09 : len);
      rail.position.set(wall.x, hy, wall.z);
      rail.castShadow = true;
      group.add(rail);
      railMeshes.push(rail);
    }
    // direkler
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = horizontal ? wall.x - len / 2 + t * len : wall.x;
      const pz = horizontal ? wall.z : wall.z - len / 2 + t * len;
      postPositions.push([px, pz]);
    }
  }

  const postGeo = new THREE.CylinderGeometry(0.075, 0.095, 2.85, 6);
  const posts = new THREE.InstancedMesh(postGeo, postMat, postPositions.length);
  posts.castShadow = true;
  const m4 = new THREE.Matrix4();
  postPositions.forEach(([x, z], i) => {
    m4.makeTranslation(x, 1.42, z);
    posts.setMatrixAt(i, m4);
  });
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // ---- dekor ----
  const glowTex = radialSpriteTexture();
  let fountain = null;
  let truck = null;
  for (const p of MAP.props) {
    switch (p.type) {
      case 'tree': addTree(group, p.x, p.z, p.rot, p.scale); break;
      case 'bush': addBush(group, p.x, p.z, p.rot, p.scale); break;
      case 'rock': addRock(group, p.x, p.z, p.rot, p.scale); break;
      case 'lamp': addLamp(group, p.x, p.z, glowTex); break;
      case 'bench': addBench(group, p.x, p.z, p.rot); break;
      case 'sign': addSign(group, p); break;
      case 'building': addBuilding(group, p.x, p.z); break;
      case 'truck': addTruck(group, p.x, p.z, p.rot); break;
      case 'fountain': fountain = addFountain(group, p.x, p.z); break;
      default: break;
    }
  }
  if (fountain) {
    const spray = fountain.userData.spray;
    updates.push((t) => {
      spray.scale.y = 1 + Math.sin(t * 3) * 0.12;
      spray.position.y = 3.0 + Math.sin(t * 3) * 0.05;
      fountain.userData.water.rotation.y = t * 0.1;
    });
  }

  // ---- bulutlar ----
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 1, transparent: true, opacity: 0.82, depthWrite: false,
  });
  for (let i = 0; i < 8; i++) {
    const cl = new THREE.Group();
    const blobs = 3 + ((Math.random() * 3) | 0);
    for (let j = 0; j < blobs; j++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(5 + Math.random() * 6, 0), cloudMat);
      s.position.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14);
      s.scale.y = 0.55;
      cl.add(s);
    }
    cl.position.set(-140 + Math.random() * 280, 46 + Math.random() * 26, -140 + Math.random() * 280);
    group.add(cl);
    const speed = 0.35 + Math.random() * 0.5;
    updates.push((t) => {
      cl.position.x += speed * 0.016;
      if (cl.position.x > 170) cl.position.x = -170;
    });
  }

  // ---- kelebekler / kuşlar (küçük canlılık) ----
  const birdMat = mat(0x2a2a30, { flat: true });
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), birdMat);
    body.rotation.x = Math.PI / 2;
    b.add(body);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.28), new THREE.MeshBasicMaterial({ color: 0x2a2a30, side: THREE.DoubleSide }));
      wing.position.set(s * 0.35, 0, 0);
      wing.userData.side = s;
      b.add(wing);
    }
    b.position.set(-50 + Math.random() * 100, 22 + Math.random() * 12, -50 + Math.random() * 100);
    b.userData = { r: 14 + Math.random() * 28, a: Math.random() * 7, y: b.position.y, cx: b.position.x, cz: b.position.z, sp: 0.15 + Math.random() * 0.2 };
    group.add(b);
    birds.push(b);
  }
  updates.push((t) => {
    for (const b of birds) {
      const u = b.userData;
      u.a += u.sp * 0.016;
      b.position.x = u.cx + Math.cos(u.a) * u.r;
      b.position.z = u.cz + Math.sin(u.a) * u.r;
      b.position.y = u.y + Math.sin(u.a * 2) * 1.6;
      b.rotation.y = -u.a + Math.PI / 2;
      b.children.forEach((ch) => {
        if (ch.userData.side) ch.rotation.z = Math.sin(t * 9 + u.a * 3) * 0.6 * ch.userData.side;
      });
    }
  });

  return {
    group, sun, updates,
    update(t) { for (const u of updates) u(t); },
  };
}
