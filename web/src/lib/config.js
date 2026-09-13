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
export function activityAudience(activity) {
  return ['staff', 'normal', 'signed'].includes(activity?.audience) ? activity.audience : 'all';
}

export function activityVisibleTo(activity, role = 'normal', signedIds = null) {
  const normalized = role === 'staff' ? 'staff' : 'normal';
  const audience = activityAudience(activity);
  if (audience === 'all') return true;
  if (audience === 'signed') {
    // 报名可见：不看角色，看这个人报了没有。同工一律可见，否则没法核对和盖章
    if (normalized === 'staff') return true;
    const ids = signedIds instanceof Set ? signedIds : new Set(signedIds || []);
    return ids.has(activity?.id);
  }
  return audience === normalized;
}

/**
 * 只按角色判，把「报名可见」当作所有人可见。
 * 报名入口（扫码落地页、报名按钮）要用它 —— 不然没报名的人看不到也报不进来。
 */
export function activityRoleVisibleTo(activity, role = 'normal') {
  const audience = activityAudience(activity);
  if (audience === 'all' || audience === 'signed') return true;
  return audience === (role === 'staff' ? 'staff' : 'normal');
}

/**
 * 参与者护照只装订对他可见的活动；后台页面仍直接使用完整 activities。
 * `signedIds` 传他报过名的活动 id（`me.signups`）—— 「报名可见」那一档要用。
 */
export function activitiesForRole(config, role = 'normal', signedIds = null) {
  const ids = signedIds instanceof Set ? signedIds : new Set(signedIds || []);
  return (config?.activities || []).filter((a) => activityVisibleTo(a, role, ids));
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
