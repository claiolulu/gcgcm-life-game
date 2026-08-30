import { useSyncExternalStore } from 'react';
import { api, ApiError, uid } from './api.js';
import { kvGet, kvSet, outboxAdd, outboxAll, outboxRemove, outboxClear } from './idb.js';
import { getStaffSession, setStaffSession, clearStaffSession } from './session.js';
import { onTick } from './realtime.js';

/**
 * 工作人员端离线引擎。
 *
 * 核心约定：
 *  1. 每次记分先落本地 outbox，界面立刻更新，完全不等网络；
 *  2. 每条操作带客户端生成的 opId，服务端以它做主键去重，重试一百次也不会重复加分；
 *  3. 分数是「事件求和」而不是「覆盖字段」，所以多台设备离线记分同步后能收敛；
 *  4. 界面显示的分数 = 服务端快照 + 本地未同步操作的叠加。
 */

const listeners = new Set();

const state = {
  session: getStaffSession(),
  players: [],
  outbox: [],
  lastSync: 0,
  epoch: 0,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  connected: false,
  lastSyncedAt: 0,
  lastError: null,
  issues: [],        // 冲突/失败的操作，需要工作人员肉眼确认
  hydrated: false,
};

function notify() {
  snapshotCache = null;
  for (const fn of listeners) fn();
}

let snapshotCache = null;
function getSnapshot() {
  if (!snapshotCache) snapshotCache = { ...state };
  return snapshotCache;
}

export function useStaff() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot,
    getSnapshot
  );
}

/* --------------------------- 本地叠加计算 --------------------------- */

/** 把还没同步的操作叠加到服务端快照上，得到界面该显示的状态 */
export function foldPending(player, pendingOps) {
  if (!player) return player;
  const ops = pendingOps.filter((o) => o.playerId === player.id);
  if (ops.length === 0) return player;

  const next = {
    ...player,
    stations: { ...player.stations },
    modifiers: [...(player.modifiers || [])],
    pending: [],
  };

  for (const op of ops) {
    next.pending.push(op);
    if (op.type === 'score') {
      next.total += op.points;
      next.stations[op.stationId] = {
        stationId: op.stationId,
        points: op.points,
        operator: op.operator,
        note: op.note,
        at: op.clientTs,
        pending: true,
      };
    } else if (op.type === 'life_event') {
      next.total += op.provisionalPoints || 0;
      next.lifeEventsTaken += 1;
    } else if (op.type === 'grace') {
      next.tokensUsed += 1;
      next.tokensLeft = Math.max(0, next.tokensLeft - 1);
    } else if (op.type === 'adjust') {
      next.total += op.points || 0;
    }
  }

  next.stationsDone = Object.keys(next.stations).length;
  next.hasPending = next.pending.length > 0;
  return next;
}

export function getPlayer(id) {
  const base = state.players.find((p) => p.id === id);
  return base ? foldPending(base, state.outbox) : null;
}

/** 扫码/手输之后找人。编号是纯数字，"7" / "07" / "MLG:07" 都能命中同一个人 */
export function findByCode(input) {
  const raw = String(input || '');
  const m = raw.match(/(?:MLG:|\/j\/|\/p\/)\s*(\d{1,6})/i);
  const digits = (m ? m[1] : raw).replace(/\D/g, '');
  if (!digits) return null;

  const hit =
    state.players.find((p) => p.code === digits) ||
    state.players.find((p) => parseInt(p.code, 10) === parseInt(digits, 10));
  return hit ? foldPending(hit, state.outbox) : null;
}

export function allPlayers() {
  return state.players.map((p) => foldPending(p, state.outbox));
}

export function leaderboardLocal() {
  const rows = allPlayers().sort(
    (a, b) => b.total - a.total || b.stationsDone - a.stationsDone || a.createdAt - b.createdAt
  );
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (prev === null || r.total !== prev) { rank = i + 1; prev = r.total; }
    r.rank = rank;
  });
  return rows;
}

/* ------------------------------ 持久化 ------------------------------ */

async function persistRoster() {
  await kvSet('staff.roster', {
    players: state.players, lastSync: state.lastSync, epoch: state.epoch, at: Date.now(),
  });
}

export async function hydrate() {
  const cached = await kvGet('staff.roster');
  if (cached?.players) {
    state.players = cached.players;
    state.lastSync = cached.lastSync || 0;
    state.epoch = cached.epoch || 0;
    state.lastSyncedAt = cached.at || 0;
  }
  state.outbox = await outboxAll();
  state.hydrated = true;
  notify();
}

/* ------------------------------- 登录 ------------------------------- */

export async function login({ pin, name, station }) {
  const res = await api('/api/staff/login', { method: 'POST', body: { pin, name, station } });
  state.session = res;
  setStaffSession(res);
  notify();
  await flush({ full: true });
  return res;
}

export function logout() {
  state.session = null;
  clearStaffSession();
  notify();
}

export function setStation(station) {
  if (!state.session) return;
  state.session = { ...state.session, station };
  setStaffSession(state.session);
  notify();
}

/* ------------------------------ 记分入队 ------------------------------ */

/**
 * 入队一条操作。**立即返回**，不等网络。
 * 界面据此马上给出反馈，同步在后台自己完成。
 */
export async function queueOp(op) {
  const full = {
    opId: uid(),
    clientTs: Date.now(),
    operator: state.session?.name || '',
    ...op,
  };
  await outboxAdd(full);
  state.outbox = [...state.outbox, full];
  notify();
  flush().catch(() => {});
  return full;
}

export async function retryAll() {
  state.issues = [];
  notify();
  return flush();
}

export async function dismissIssue(opId) {
  state.issues = state.issues.filter((i) => i.opId !== opId);
  notify();
}

export async function clearOutbox() {
  await outboxClear();
  state.outbox = [];
  notify();
}

/* ------------------------------- 同步 ------------------------------- */

function mergeRoster(incoming, isFull) {
  if (isFull) {
    state.players = incoming;
    return;
  }
  const byId = new Map(state.players.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  state.players = [...byId.values()];
}

let flushing = null;

/**
 * 直接套用服务端回传的整份花名册。
 * 管理端的分配接口已经把结果带回来了，用这个就不用再发一次同步请求，
 * 少一个来回，界面响应快一倍。
 */
export function applyRoster(players, epoch, serverTs) {
  if (!Array.isArray(players)) return;
  state.players = players;
  if (epoch) state.epoch = epoch;
  if (serverTs) { state.lastSync = serverTs; state.lastSyncedAt = Date.now(); }
  notify();
  persistRoster().catch(() => {});
}

export async function flush({ full = false } = {}) {
  if (!state.session?.token) return;
  // 需要全量时不能搭便车：正在飞的那次可能是增量、而且是点击之前发出的，
  // 拿回来的是旧数据。等它结束后再单独跑一次全量。
  if (flushing) {
    if (!full) return flushing;
    return flushing.then(() => flush({ full: true }));
  }

  state.syncing = true;
  state.lastError = null;
  notify();

  flushing = (async () => {
    try {
      const ops = await outboxAll();
      const since = full ? 0 : state.lastSync;

      const res = await api('/api/staff/sync', {
        method: 'POST',
        token: state.session.token,
        timeout: 12000,
        body: { ops, since, epoch: state.epoch },
      });

      // 服务端已经给出结论的操作就从队列里移除；冲突和失败单独留给人看
      for (const r of res.results || []) {
        await outboxRemove(r.opId);
        if (r.status === 'conflict' || r.status === 'error') {
          const op = ops.find((o) => o.opId === r.opId);
          state.issues = [
            ...state.issues.filter((i) => i.opId !== r.opId),
            { ...r, op, at: Date.now() },
          ];
        }
      }

      state.outbox = await outboxAll();
      // 服务端说纪元变了就整份替换，把已经被删掉的人清出去
      if (res.epoch && res.epoch !== state.epoch) {
        state.players = res.players || [];
        state.epoch = res.epoch;
        state.issues = [];
      } else {
        mergeRoster(res.players || [], res.full);
      }
      state.lastSync = res.serverTs;
      state.lastSyncedAt = Date.now();
      state.online = true;
      if (res.settings) await kvSet('settings', res.settings);
      await persistRoster();
    } catch (err) {
      state.lastError = err instanceof ApiError ? err.message : String(err);
      if (err instanceof ApiError && err.status === 401) {
        logout();
      }
      if (err instanceof ApiError && err.offline) state.online = false;
    } finally {
      state.syncing = false;
      flushing = null;
      notify();
    }
  })();

  return flushing;
}

/* ------------------------------ 后台循环 ------------------------------ */

let started = false;

export function startStaffSync() {
  if (started) return;
  started = true;

  hydrate().then(() => flush({ full: true }).catch(() => {}));

  // 有变化就拉；socket 挂了 realtime 会降级成 10 秒轮询
  onTick((payload) => {
    state.connected = !!payload.connected;
    notify();
    if (payload.reason !== 'disconnect') flush().catch(() => {});
  });

  // 兜底心跳：即使 socket 和轮询都失灵，队列里有东西也会被重试推上去
  setInterval(() => {
    if (state.outbox.length > 0 || Date.now() - state.lastSyncedAt > 25_000) {
      flush().catch(() => {});
    }
  }, 8000);

  window.addEventListener('online', () => {
    state.online = true;
    notify();
    flush().catch(() => {});
  });
  window.addEventListener('offline', () => {
    state.online = false;
    notify();
  });

  // 切回前台立刻同步，避免工作人员看着过期数据做判断
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush().catch(() => {});
  });
}
