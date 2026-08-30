import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { kvGet, kvSet } from './idb.js';

/**
 * 游戏静态配置（关卡、盲盒卡牌、身份卡、可调参数）。
 * 拉一次就缓存进 IndexedDB，之后断网也能完整渲染界面和离线抽卡。
 */

const listeners = new Set();
let state = { config: null, loading: true, error: null };
let snap = state;

function notify() {
  snap = { ...state };
  for (const fn of listeners) fn();
}

export function useConfig() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => snap,
    () => snap
  );
}

export async function loadConfig() {
  const cached = await kvGet('config');
  if (cached) {
    state = { config: cached, loading: false, error: null };
    notify();
  }
  try {
    const fresh = await api('/api/config', { timeout: 6000 });
    await kvSet('config', fresh);
    state = { config: fresh, loading: false, error: null };
    notify();
    return fresh;
  } catch (err) {
    state = { config: cached || null, loading: false, error: cached ? null : err.message };
    notify();
    return cached;
  }
}

export function getConfig() {
  return state.config;
}

/** 离线也能抽盲盒：按权重在本地抽，只把 cardId 上报，倍率由服务端结算 */
export function drawCardLocally(cards) {
  const pool = cards || state.config?.cards || [];
  if (!pool.length) return null;
  const total = pool.reduce((s, c) => s + (c.weight || 1), 0);
  let roll = Math.random() * total;
  for (const c of pool) {
    roll -= c.weight || 1;
    if (roll <= 0) return c;
  }
  return pool[pool.length - 1];
}
