import { useSyncExternalStore } from 'react';
import { api, ApiError } from './api.js';
import { kvGet, kvSet, kvDel } from './idb.js';
import { getPlayerSession, setPlayerSession, clearPlayerSession } from './session.js';
import { onTick } from './realtime.js';

/**
 * 选手端。比工作人员端简单得多 —— 选手只读，不写分。
 * 关键要求：断网时护照和二维码必须照常显示，所以最后一次成功的状态永远留在本地。
 */

const listeners = new Set();

const state = {
  session: getPlayerSession(),
  me: null,
  rank: null,
  of: 0,
  loading: true,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  connected: false,
  lastSyncedAt: 0,
  stale: false,
  error: null,
};

let snap = { ...state };
function notify() {
  snap = { ...state };
  for (const fn of listeners) fn();
}

export function usePlayer() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => snap,
    () => snap
  );
}

export const hasSession = () => !!getPlayerSession()?.token;

async function cacheMe(payload) {
  await kvSet('player.me', { ...payload, at: Date.now() });
}

export async function hydratePlayer() {
  const cached = await kvGet('player.me');
  if (cached?.player) {
    state.me = cached.player;
    state.rank = cached.rank ?? null;
    state.of = cached.of ?? 0;
    state.lastSyncedAt = cached.at || 0;
    state.stale = true;
  }
  state.loading = false;
  notify();
}

export async function refreshMe() {
  const session = getPlayerSession();
  if (!session?.token) {
    state.loading = false;
    notify();
    return null;
  }
  try {
    const res = await api('/api/me', { token: session.token, timeout: 8000 });
    state.me = res.player;
    state.rank = res.rank;
    state.of = res.of;
    state.online = true;
    state.stale = false;
    state.lastSyncedAt = Date.now();
    state.error = null;
    await cacheMe(res);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // 令牌失效（比如后台重置过），让用户用短码找回
      clearPlayerSession();
      state.session = null;
      state.me = null;
      await kvDel('player.me');
    } else if (err instanceof ApiError && err.offline) {
      state.online = false;
      state.stale = true;
    }
    state.error = err.message;
  } finally {
    state.loading = false;
    notify();
  }
  return state.me;
}

export async function register({ name, surname, given, avatar, contact, pin, confirmNew }) {
  const res = await api('/api/register', {
    method: 'POST',
    // surname / given 是护照资料页上的姓和名，报名时选填。
    // 早先这里漏了没透传，UI 上填了也传不到服务端
    body: { name, surname, given, avatar, contact, pin, confirmNew },
    timeout: 12000,
  });
  const session = { token: res.token, playerId: res.player.id, code: res.player.code };
  setPlayerSession(session);
  state.session = session;
  state.me = res.player;
  state.rank = res.rank;
  state.of = res.of;
  state.lastSyncedAt = Date.now();
  state.stale = false;
  await cacheMe(res);
  notify();
  return res.player;
}

export async function restore({ code, pin }) {
  const res = await api('/api/restore', { method: 'POST', body: { code, pin }, timeout: 12000 });
  const session = { token: res.token, playerId: res.player.id, code: res.player.code };
  setPlayerSession(session);
  state.session = session;
  state.me = res.player;
  state.rank = res.rank;
  state.of = res.of;
  state.lastSyncedAt = Date.now();
  state.stale = false;
  await cacheMe(res);
  notify();
  return res.player;
}

/** 忘了编号：用名字或编号片段找。只回编号和姓名，不回密码 */
export async function lookup(q) {
  const res = await api('/api/lookup', { method: 'POST', body: { q }, timeout: 8000 });
  return res.matches || [];
}

/**
 * 用原密码改一个好记的。
 * 服务端改完直接返回 token，所以顺手把人也登录了 —— 忘了密码来改密码的人，
 * 十有八九下一步就是要进护照。
 */
export async function changePin({ code, pin, newPin }) {
  const res = await api('/api/pin', { method: 'POST', body: { code, pin, newPin }, timeout: 12000 });
  const session = { token: res.token, playerId: res.player.id, code: res.player.code };
  setPlayerSession(session);
  state.session = session;
  state.me = res.player;
  state.rank = res.rank;
  state.of = res.of;
  state.lastSyncedAt = Date.now();
  state.stale = false;
  await cacheMe(res);
  notify();
  return res.player;
}

/** 改队名。队员自己改，全队生效 */
export async function renameTeam(name) {
  const session = getPlayerSession();
  if (!session?.token) throw new Error('没有登录');
  const res = await api('/api/team/name', {
    method: 'POST', body: { name }, token: session.token, timeout: 10000,
  });
  state.me = res.player;
  state.rank = res.rank;
  state.of = res.of;
  await cacheMe(res);
  notify();
  return res.player;
}

export async function updateProfile(patch) {
  const session = getPlayerSession();
  if (!session?.token) throw new Error('没有登录');
  const res = await api('/api/me', { method: 'POST', body: patch, token: session.token });
  state.me = res.player;
  await cacheMe({ player: res.player, rank: state.rank, of: state.of });
  notify();
  return res.player;
}

export async function signOut() {
  clearPlayerSession();
  await kvDel('player.me');
  state.session = null;
  state.me = null;
  notify();
}

let started = false;

export function startPlayerSync() {
  if (started) return;
  started = true;

  hydratePlayer().then(() => refreshMe());

  onTick((payload) => {
    state.connected = !!payload.connected;
    notify();
    if (payload.reason !== 'disconnect') refreshMe();
  });

  window.addEventListener('online', () => { state.online = true; notify(); refreshMe(); });
  window.addEventListener('offline', () => { state.online = false; state.stale = true; notify(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshMe();
  });
  setInterval(() => { if (navigator.onLine) refreshMe(); }, 30_000);
}
