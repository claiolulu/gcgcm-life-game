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
 * 这一场活动对这个人可见吗。
 *
 * 和服务端 game.js 是同一条规则 —— 不可见的活动连盖章都会被拒，总控台据此
 * 把盖不上的按钮收起来，而不是让人点了才发现。
 *
 * 可见范围有三种模式：
 *   all    —— 所有人
 *   signed —— 只给报了名的人（不看标签；同工一律可见，否则没法核对和盖章）
 *   tags   —— 只给挂着 audienceTags 里任一标签的人
 */
export function activityAudience(activity) {
  return ['signed', 'tags'].includes(activity?.audience) ? activity.audience : 'all';
}

/**
 * 一个人的**有效标签集**：内置的 role（normal / staff），加上他挂着的自建标签。
 *
 * 服务端把两者分开下发（role 一个字段、tags 一个数组），因为 role 那一列
 * 还被导出和总控台的角色下拉用着 —— 合并只在判可见性时发生。
 */
export function playerTags(me) {
  return new Set([me?.role === 'staff' ? 'staff' : 'normal', ...(me?.tags || [])]);
}

function tagsHit(activity, tags) {
  const want = Array.isArray(activity?.audienceTags) ? activity.audienceTags : [];
  if (!want.length) return true;   // 一个都没勾 = 不限制（服务端已规整，这里兜底）
  return want.some((x) => tags.has(x));
}

function asTagSet(tags) {
  if (tags instanceof Set) return tags;
  if (Array.isArray(tags)) return new Set(tags);
  return playerTags(tags);         // 直接把 me 传进来也认
}

export function activityVisibleTo(activity, tags, signedIds = null) {
  const set = asTagSet(tags);
  const audience = activityAudience(activity);
  if (audience === 'all') return true;
  if (audience === 'signed') {
    if (set.has('staff')) return true;
    const ids = signedIds instanceof Set ? signedIds : new Set(signedIds || []);
    return ids.has(activity?.id);
  }
  return tagsHit(activity, set);
}

/**
 * 报名入口专用：把「报名可见」当作所有人可见。
 * 扫码落地页和报名按钮要用它 —— 不然没报名的人看不到也报不进来。
 */
export function activityOpenForSignup(activity, tags) {
  const audience = activityAudience(activity);
  if (audience === 'all' || audience === 'signed') return true;
  return tagsHit(activity, asTagSet(tags));
}

/**
 * 参与者护照只装订对他可见的活动；后台页面仍直接使用完整 activities。
 * 直接把 `me` 传进来：可见性同时要用他的角色、标签和报名记录。
 */
export function activitiesForPlayer(config, me) {
  const tags = playerTags(me);
  const signed = new Set(me?.signups || []);
  return (config?.activities || []).filter((a) => activityVisibleTo(a, tags, signed));
}

/**
 * 标签清单（内置 + 自建），服务端随 config 一起下发。
 *
 * 服务端没下发时（比如前端已经更新、服务端还没重启）也要把内置那两个兜出来 ——
 * 否则活动的可见范围里连「普通成员 / 同工」都选不了，看起来像功能坏了，
 * 而真正的原因只是服务端旧。
 */
const BUILTIN = [
  { id: 'normal', name: '普通成员', builtin: true },
  { id: 'staff', name: '同工', builtin: true },
];

export function allTags(config) {
  const list = Array.isArray(config?.tags) ? config.tags : [];
  return list.length ? list : BUILTIN;
}

export function tagName(config, id) {
  return allTags(config).find((t) => t.id === id)?.name || id;
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
