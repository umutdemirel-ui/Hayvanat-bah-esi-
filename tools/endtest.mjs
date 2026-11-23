import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:3100/ws');
let ended = null, snap = null;
ws.on('open', () => ws.send(JSON.stringify({ t: 'create', name: 'Bitirici' })));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'joined') { console.log('oda', m.room); setTimeout(() => ws.send(JSON.stringify({ t: 'start' })), 300); }
  if (m.t === 'state') snap = m;
  if (m.t === 'events') for (const e of m.list) if (e.kind === 'end') ended = e;
});
setTimeout(() => {
  console.log('faz:', snap?.phase, '| kalan:', snap?.tl);
  console.log('end olayı:', ended ? JSON.stringify(ended).slice(0, 400) : 'YOK');
  ws.close(); process.exit(ended ? 0 : 1);
}, 9000);
