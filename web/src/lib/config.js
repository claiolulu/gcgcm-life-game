import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { kvGet, kvSet } from './idb.js';

/**
 * 静态配置（活动清单、护照版式、可调参数）。
 * 拉一次就缓存进 IndexedDB，之后断网也能完整渲染界面。
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

/**
 * 这一场活动对某个角色可见吗。
 *
 * 和服务端 game.js 的 stationById(id, role) 是同一条规则 —— 不可见的活动
 * 连盖章都会被拒（「这场活动对该用户角色不可见」）。总控台据此把盖不上的
 * 按钮收起来，而不是让人点了才发现。
 */
export function activityVisibleTo(activity, role = 'normal') {
  const normalized = role === 'staff' ? 'staff' : 'normal';
  const audience = activity?.audience === 'staff' || activity?.audience === 'normal'
    ? activity.audience : 'all';
  return audience === 'all' || audience === normalized;
}

/** 参与者护照只装订其角色可见的活动；后台页面仍直接使用完整 activities。 */
export function activitiesForRole(config, role = 'normal') {
  return (config?.activities || []).filter((a) => activityVisibleTo(a, role));
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
