// ---------------------------------------------------------------------------
// Girdi: klavye, fare, işaretçi kilidi (pointer lock) ve dokunmatik
// ---------------------------------------------------------------------------
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.actions = [];
    this.lookX = 0;
    this.lookY = 0;
    this.locked = false;
    this.enabled = false;
    this.interact = false;
    this.rightDown = false;
    this.dragLook = false;
    this.lastMouse = { x: 0, y: 0 };
    this.touch = { active: false, moveX: 0, moveZ: 0, lookId: null, moveId: null, mx: 0, my: 0, lx: 0, ly: 0, sprint: false };
    this.onEscape = null;
    this.onHelp = null;
    this.touchMode = matchMedia('(pointer: coarse)').matches;

    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.repeat) {
        if (e.code === 'KeyE') this.interact = true;
        return;
      }
      const code = e.code;
      this.keys.add(code);
      if (code === 'KeyE') this.interact = true;
      if (code === 'Escape') { if (this.onEscape) this.onEscape(); }
      if (!this.enabled) return;
      const map = {
        Digit1: 'net', Digit2: 'dart', Digit3: 'bait', Digit4: 'trap',
        KeyV: 'shove', KeyB: 'peel', KeyG: 'fire',
        KeyZ: 'emote_help', KeyX: 'emote_haha', KeyC: 'emote_sorry',
        KeyF: 'emote_mine', KeyT: 'emote_troll',
        KeyH: 'help', KeyM: 'minimapZoom', KeyP: 'mute',
      };
      const act = map[code];
      if (act) {
        this.actions.push(act);
        if (code === 'KeyH' && this.onHelp) this.onHelp();
      }
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.interact = false;
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.interact = false;
    });
  }

  requestLock() {
    if (this.touchMode) return;
    const el = this.canvas;
    if (document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock?.({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => { /* kilit reddedildi: sağ tıkla bak */ });
    } catch { /* desteklenmiyor */ }
  }

  bindMouse() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) {
        if (this.touchMode) return;
        if (!this.locked) {
          this.requestLock();
          // kilit yoksa: yine de ağ at (tık = ağ)
        }
        this.actions.push('net');
      } else if (e.button === 2) {
        this.rightDown = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.rightDown = false;
    });
    window.addEventListener('contextmenu', (e) => {
      if (e.target === this.canvas) e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      } else if (this.rightDown) {
        this.lookX += (e.clientX - this.lastMouse.x) * 1.1;
        this.lookY += (e.clientY - this.lastMouse.y) * 1.1;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
  }

  bindTouch() {
    if (!this.touchMode) return;
    const t = this.touch;
    const half = () => window.innerWidth * 0.5;

    const onStart = (e) => {
      if (!this.enabled) return;
      for (const touch of e.changedTouches) {
        if (touch.clientX < half() && t.moveId === null) {
          t.moveId = touch.identifier;
          t.mx = touch.clientX; t.my = touch.clientY;
          t.active = true;
        } else if (touch.clientX >= half() && t.lookId === null) {
          t.lookId = touch.identifier;
          t.lx = touch.clientX; t.ly = touch.clientY;
        }
      }
    };
    const onMove = (e) => {
      if (!this.enabled) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === t.moveId) {
          const dx = touch.clientX - t.mx;
          const dy = touch.clientY - t.my;
          const max = 70;
          t.moveX = Math.max(-1, Math.min(1, dx / max));
          t.moveZ = Math.max(-1, Math.min(1, -dy / max));
          const len = Math.hypot(t.moveX, t.moveZ);
          if (len > 1) { t.moveX /= len; t.moveZ /= len; }
        } else if (touch.identifier === t.lookId) {
          this.lookX += (touch.clientX - t.lx) * 0.9;
          this.lookY += (touch.clientY - t.ly) * 0.9;
          t.lx = touch.clientX; t.ly = touch.clientY;
        }
      }
      if (t.moveId !== null) e.preventDefault();
    };
    const onEnd = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === t.moveId) {
          t.moveId = null; t.moveX = 0; t.moveZ = 0;
        }
        if (touch.identifier === t.lookId) t.lookId = null;
      }
    };
    this.canvas.addEventListener('touchstart', onStart, { passive: true });
    this.canvas.addEventListener('touchmove', onMove, { passive: false });
    this.canvas.addEventListener('touchend', onEnd, { passive: true });
    this.canvas.addEventListener('touchcancel', onEnd, { passive: true });
  }

  get moveX() {
    let x = 0;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    if (this.touch.active) x += this.touch.moveX;
    return Math.max(-1, Math.min(1, x));
  }

  get moveZ() {
    let z = 0;
    if (this.keys.has('KeyW')) z += 1;
    if (this.keys.has('KeyS')) z -= 1;
    if (this.touch.active) z += this.touch.moveZ;
    return Math.max(-1, Math.min(1, z));
  }

  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeLook() {
    const l = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return l;
  }

  takeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  clear() {
    this.actions = [];
    this.keys.clear();
    this.interact = false;
    this.lookX = this.lookY = 0;
  }
}
