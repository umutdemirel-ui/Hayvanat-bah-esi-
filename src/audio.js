// ---------------------------------------------------------------------------
// Ses: tamamen WebAudio ile sentezlenmiş efektler (dosya yok)
// ---------------------------------------------------------------------------

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.ready = true;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---- ortam sesi: rüzgar + kuş cıvıltıları ----
  ambienceOn() {
    if (!this.ready || this.ambience) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambience = { src, gain };

    const chirp = () => {
      if (!this.ambience) return;
      const base = 1700 + Math.random() * 1500;
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        this.tone({
          freq: base * (0.9 + Math.random() * 0.4), type: 'sine',
          dur: 0.09, gain: 0.05, slideTo: base * (1.2 + Math.random() * 0.5),
          delay: i * 0.11, attack: 0.01,
        });
      }
      this.chirpTimer = setTimeout(chirp, 3500 + Math.random() * 8000);
    };
    this.chirpTimer = setTimeout(chirp, 2500);
  }

  ambienceOff() {
    clearTimeout(this.chirpTimer);
    if (this.ambience) {
      try { this.ambience.src.stop(); } catch { /* yoksay */ }
      this.ambience = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.3, slideTo = null, delay = 0, detune = 0, attack = 0.005 }) {
    if (!this.ready) return;
    const t0 = this.t + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.value = detune;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.25, gain = 0.3, type = 'lowpass', freq = 1200, sweepTo = null, delay = 0, q = 1 }) {
    if (!this.ready) return;
    const t0 = this.t + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const fade = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  play(name, opts = {}) {
    if (!this.ready || this.muted) return;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'whoosh':
        this.noise({ dur: 0.22, gain: 0.16 * v, freq: 2200, sweepTo: 500, type: 'bandpass', q: 1.4 });
        break;
      case 'netHit':
        this.noise({ dur: 0.16, gain: 0.3 * v, freq: 900, sweepTo: 300 });
        this.tone({ freq: 320, type: 'triangle', dur: 0.12, gain: 0.16 * v, slideTo: 180 });
        break;
      case 'catch': {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.24, gain: 0.16 * v, delay: i * 0.075 }));
        this.noise({ dur: 0.4, gain: 0.1 * v, freq: 4000, sweepTo: 1200, type: 'highpass' });
        break;
      }
      case 'dart':
        this.tone({ freq: 900, type: 'square', dur: 0.1, gain: 0.1 * v, slideTo: 200 });
        this.noise({ dur: 0.12, gain: 0.14 * v, freq: 3000, sweepTo: 800, type: 'bandpass' });
        break;
      case 'roar': {
        const base = opts.pitch ?? 90;
        this.tone({ freq: base, type: 'sawtooth', dur: 0.7, gain: 0.2 * v, slideTo: base * 0.55, attack: 0.06 });
        this.tone({ freq: base * 1.5, type: 'square', dur: 0.45, gain: 0.07 * v, slideTo: base * 0.9 });
        this.noise({ dur: 0.55, gain: 0.12 * v, freq: 700, sweepTo: 180, type: 'lowpass', q: 3 });
        break;
      }
      case 'hurt':
        this.tone({ freq: 220, type: 'square', dur: 0.18, gain: 0.18 * v, slideTo: 90 });
        this.noise({ dur: 0.18, gain: 0.18 * v, freq: 600, sweepTo: 120 });
        break;
      case 'down':
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.9, gain: 0.22 * v, slideTo: 60 });
        this.noise({ dur: 0.7, gain: 0.16 * v, freq: 800, sweepTo: 90 });
        break;
      case 'revive':
        [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.3, gain: 0.14 * v, delay: i * 0.09 }));
        break;
      case 'slip':
        this.tone({ freq: 1200, type: 'sine', dur: 0.5, gain: 0.16 * v, slideTo: 180 });
        this.noise({ dur: 0.3, gain: 0.1 * v, freq: 2000, sweepTo: 400, type: 'bandpass' });
        break;
      case 'explode':
        this.noise({ dur: 0.8, gain: 0.36 * v, freq: 1400, sweepTo: 60, type: 'lowpass', q: 2 });
        this.tone({ freq: 90, type: 'sine', dur: 0.7, gain: 0.3 * v, slideTo: 30 });
        break;
      case 'fuse':
        this.noise({ dur: 0.6, gain: 0.08 * v, freq: 4000, type: 'highpass' });
        break;
      case 'trap':
        this.tone({ freq: 180, type: 'square', dur: 0.12, gain: 0.16 * v, slideTo: 120 });
        this.noise({ dur: 0.2, gain: 0.14 * v, freq: 1200, sweepTo: 300, type: 'bandpass' });
        break;
      case 'steal':
        this.tone({ freq: 700, type: 'square', dur: 0.09, gain: 0.12 * v });
        this.tone({ freq: 1000, type: 'square', dur: 0.09, gain: 0.1 * v, delay: 0.1 });
        break;
      case 'click':
        this.tone({ freq: 660, type: 'square', dur: 0.05, gain: 0.08 * v });
        break;
      case 'tick':
        this.tone({ freq: 1000, type: 'square', dur: 0.06, gain: 0.1 * v });
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.4, gain: 0.18 * v, delay: i * 0.11 }));
        break;
      case 'lose':
        [440, 392, 330, 262].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.45, gain: 0.14 * v, delay: i * 0.13 }));
        break;
      case 'spawn':
        [262, 330, 392, 523].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.25, gain: 0.13 * v, delay: i * 0.06 }));
        break;
      case 'whiff':
        this.noise({ dur: 0.16, gain: 0.1 * v, freq: 1400, sweepTo: 600, type: 'bandpass' });
        break;
      case 'thud':
        this.tone({ freq: 120, type: 'sine', dur: 0.1, gain: 0.1 * v, slideTo: 70 });
        break;
      default:
        break;
    }
  }
}
