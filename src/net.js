// ---------------------------------------------------------------------------
// WebSocket istemcisi
// ---------------------------------------------------------------------------
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.latency = 0;
    this.closedByUser = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  emit(type, data) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(data);
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === 1) { resolve(); return; }
      let ws;
      try {
        ws = new WebSocket(this.url());
      } catch (e) { reject(e); return; }
      this.ws = ws;
      const timeout = setTimeout(() => {
        if (!this.connected) { try { ws.close(); } catch { /* */ } reject(new Error('timeout')); }
      }, 8000);

      ws.onopen = () => {
        this.connected = true;
        clearTimeout(timeout);
        this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 2500);
        this.emit('open');
        resolve();
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'pong') { this.latency = Date.now() - msg.c; return; }
        this.emit(msg.t, msg);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        if (!this.connected) reject(new Error('connect-failed'));
      };
      ws.onclose = () => {
        this.connected = false;
        clearInterval(this.pingTimer);
        this.emit('close');
      };
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  create(name) { return this.send({ t: 'create', name }); }
  join(room, name) { return this.send({ t: 'join', room, name }); }
  close() {
    this.closedByUser = true;
    if (this.ws) this.ws.close();
  }
}
