import { io } from 'socket.io-client';

/**
 * 实时通道。服务端只广播一个「有变化」的信号，不推数据，
 * 各端收到后自己按需拉增量 —— payload 小、逻辑不重复、弱网下更抗造。
 * socket 连不上会自动降级成轮询（见 startPolling）。
 */

let socket = null;
const listeners = new Set();
let connected = false;
let pollTimer = null;

function emitTick(payload) {
  for (const fn of listeners) {
    try { fn(payload); } catch (err) { console.warn('[realtime]', err); }
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!connected && navigator.onLine) emitTick({ ts: Date.now(), reason: 'poll' });
  }, 10_000);
}

export function connectRealtime() {
  if (socket) return socket;

  socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    timeout: 6000,
  });

  socket.on('connect', () => {
    connected = true;
    emitTick({ ts: Date.now(), reason: 'connect', connected: true });
  });
  socket.on('disconnect', () => {
    connected = false;
    emitTick({ ts: Date.now(), reason: 'disconnect', connected: false });
  });
  socket.on('connect_error', () => { connected = false; });
  socket.on('tick', (payload) => emitTick({ ...payload, connected: true }));

  startPolling();
  return socket;
}

export function onTick(fn) {
  listeners.add(fn);
  connectRealtime();
  return () => listeners.delete(fn);
}

// 只有这些服务端事件会改变排行榜内容或它的公开状态。
// config / signup / pin 等事件与排名无关，收到后不必再下载整份榜单。
const LEADERBOARD_REASONS = new Set([
  'connect', 'hello', 'register', 'profile', 'sync', 'player', 'reset', 'settings',
]);

export function changesLeaderboard(reason) {
  return LEADERBOARD_REASONS.has(reason);
}
