import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPlayerSession } from './session.js';

/**
 * 使用情况埋点（参与者端）。
 *
 * 只报「做了哪一类操作、在哪场活动」，不报页面内容、输入的文字和位置。
 * 攒一小批再发：页面切到后台或关掉时用 sendBeacon 送出；断网时先存在本机，
 * 联网后补发。同工端（/staff 路径和 staff. 域名）不统计。
 * 事件白名单、保留期（180 天）和报表在 server/src/usage.js。
 */
const DEVICE_KEY = 'mlg.device';
const QUEUE_KEY = 'mlg.usageQueue';
const MAX_QUEUE = 200;
const BATCH = 50;
const FLUSH_MS = 10_000;

let queue = readQueue();
let timer = null;
let memDevice = null;
const seen = new Set();

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function saveQueue() {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(QUEUE_KEY);
  } catch { /* 隐私模式存不进去，就只放内存里 */ }
}

const newId = () => crypto.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** 这台设备的随机编号。只用来区分没登录的访客，和人没有任何对应关系 */
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!/^[\w-]{8,64}$/.test(id || '')) {
      id = newId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return (memDevice ||= newId());
  }
}

function disabled() {
  if (typeof window === 'undefined') return true;
  return location.pathname.startsWith('/staff') || location.hostname.startsWith('staff.');
}

/**
 * 记一笔。once: 同一天里同样的事（事件 + 活动 + 标签）只记一次 ——
 * 「今天看过这场活动的签证页」有用，来回翻了几十次不需要。
 */
export function track(event, { activityId, label, once = false } = {}) {
  if (disabled()) return;
  if (once) {
    const key = `${new Date().toDateString()}|${event}|${activityId || ''}|${label || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
  }
  const e = { n: event, ts: Date.now() };
  if (activityId) e.a = String(activityId);
  if (label) e.l = String(label);
  queue.push(e);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  saveQueue();
  if (queue.length >= 20) flushUsage();
  else if (!timer) timer = setTimeout(flushUsage, FLUSH_MS);
}

export function flushUsage() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (typeof navigator === 'undefined' || navigator.onLine === false || !queue.length) return;
  while (queue.length) {
    const batch = queue.slice(0, BATCH);
    // 令牌放在 body 里：sendBeacon 带不了 Authorization 头
    const body = JSON.stringify({ d: deviceId(), t: getPlayerSession()?.token || undefined, e: batch });
    let sent = false;
    try {
      sent = !!navigator.sendBeacon?.('/api/t', new Blob([body], { type: 'text/plain' }));
    } catch { sent = false; }
    if (!sent) {
      try {
        fetch('/api/t', { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true })
          .catch(() => {});
        sent = true;
      } catch { sent = false; }
    }
    if (!sent) break;
    queue = queue.slice(batch.length);
  }
  saveQueue();
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUsage();
  });
  window.addEventListener('pagehide', () => flushUsage());
  window.addEventListener('online', () => flushUsage());
  // 上次断网时关掉的页面没发出去的，这次打开补发
  if (queue.length) setTimeout(flushUsage, 3000);
}

function routeKind(path) {
  if (path === '/') return 'home';
  const m = path.match(/^\/(register|join|passport|leaderboard|badge)(\/|$)/);
  return m ? m[1] : '';
}

/**
 * 打开了哪一类页面。每类一天记一次；主屏幕上的护照可能开着过夜，
 * 所以切回前台时也再报一次（跨了天才会真的记上）。
 */
export function useRouteTracking() {
  const { pathname } = useLocation();
  useEffect(() => {
    const kind = routeKind(pathname);
    if (kind) track('open', { label: kind, once: true });
  }, [pathname]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const kind = routeKind(location.pathname);
      if (kind) track('open', { label: kind, once: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
