// ---------------------------------------------------------------------------
// Parçacık efektleri, şok dalgaları, toz, konfeti
// ---------------------------------------------------------------------------
import * as THREE from 'three';

const MAX = 900;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.baseCol = new Float32Array(MAX * 3);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.cursor = 0;

    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, MAX);
    const mat = new THREE.PointsMaterial({
      size: 0.42, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // başlangıçta hepsi görünmez
    for (let i = 0; i < MAX; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -999;
    }

    // şok dalgası havuzu
    this.rings = [];
    const ringGeo = new THREE.TorusGeometry(1, 0.09, 6, 28);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffcc66, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.userData.t = 0;
      m.userData.active = false;
      scene.add(m);
      this.rings.push(m);
    }
  }

  spawn(x, y, z, color, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    const c = new THREE.Color(color);
    const sp = opts.speed ?? 4;
    const up = opts.up ?? 1;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * sp;
    this.vel[i * 3] = Math.cos(ang) * r;
    this.vel[i * 3 + 1] = Math.random() * sp * up + (opts.upBias ?? 0);
    this.vel[i * 3 + 2] = Math.sin(ang) * r;
    this.baseCol[i * 3] = c.r;
    this.baseCol[i * 3 + 1] = c.g;
    this.baseCol[i * 3 + 2] = c.b;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    const l = (opts.life ?? 0.7) * (0.65 + Math.random() * 0.7);
    this.life[i] = l;
    this.maxLife[i] = l;
    this.grav[i] = opts.gravity ?? 9;
    this.drag[i] = opts.drag ?? 1.6;
  }

  burst(x, y, z, color, count = 18, opts = {}) {
    for (let i = 0; i < count; i++) this.spawn(x, y, z, color, opts);
  }

  confetti(x, y, z, colors = [0xff5d5d, 0xffd93d, 0x4fa8ff, 0x8cf05c, 0xc65cff]) {
    for (let i = 0; i < 42; i++) {
      this.spawn(x, y + 1, z, colors[i % colors.length], {
        speed: 7, up: 1.6, life: 1.3, gravity: 7, drag: 1.1,
      });
    }
  }

  ring(x, y, z, color = 0xffcc66, size = 6) {
    const r = this.rings.find((rr) => !rr.userData.active) || this.rings[0];
    r.position.set(x, y ?? 0.12, z);
    r.rotation.set(-Math.PI / 2, 0, 0);
    r.material.color.set(color);
    r.material.opacity = 0.9;
    r.scale.setScalar(0.4);
    r.userData.active = true;
    r.userData.t = 0;
    r.userData.size = size;
    r.visible = true;
  }

  smoke(x, y, z, count = 14, color = 0xbba888) {
    for (let i = 0; i < count; i++) {
      this.spawn(x, y, z, color, { speed: 3.5, up: 0.6, life: 1.1, gravity: -0.6, drag: 2.2, upBias: 0.8 });
    }
  }

  update(dt) {
    const p = this.pos, c = this.col, v = this.vel;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0;
        p[i * 3 + 1] = -999;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= d;
      v[i * 3 + 2] *= d;
      v[i * 3 + 1] = v[i * 3 + 1] * d - this.grav[i] * dt;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.05) {
        p[i * 3 + 1] = 0.05;
        v[i * 3 + 1] *= -0.32;
        v[i * 3] *= 0.6;
        v[i * 3 + 2] *= 0.6;
      }
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const fade = k * k;
      c[i * 3] = this.baseCol[i * 3] * fade;
      c[i * 3 + 1] = this.baseCol[i * 3 + 1] * fade;
      c[i * 3 + 2] = this.baseCol[i * 3 + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.userData.active) continue;
      r.userData.t += dt;
      const t = r.userData.t / 0.55;
      if (t >= 1) {
        r.userData.active = false;
        r.visible = false;
        continue;
      }
      r.scale.setScalar(0.4 + t * r.userData.size);
      r.material.opacity = 0.85 * (1 - t);
    }
  }
}
