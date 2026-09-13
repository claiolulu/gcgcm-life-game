import { db, stmts, getSettings, setSetting, getActivities } from './db.js';
import {
  ACTIVITIES,
} from './config.js';
import { safeJSON, clamp, uid } from './util.js';

/**
 * 按 id 找一个可盖章的条目：8 个游戏关卡，或者任意一场活动。
 *
 * 活动清单现在存在设置表里、总控台随时能改，所以**不能**在模块加载时
 * 算好一张静态表 —— 那样同工加了新活动，服务端会一直说「未知关卡」，
 * 直到重启为止。每次现查，活动一共几条，开销可以忽略。
 *
 * 两边共用同一张 events 表和那条「一站只能盖一次」的唯一索引：
 * 语义正好一致（一场活动也只盖一次章）。
 */
export function normalizedPlayerRole(role) {
  return role === 'staff' ? 'staff' : 'normal';
}

const AUDIENCES = ['staff', 'normal', 'signed'];

export function activityAudience(activity) {
  return AUDIENCES.includes(activity?.audience) ? activity.audience : 'all';
}

/**
 * 这一场活动，对这个人可见吗。
 *
 * `signed`（报名可见）和另外两档不是一类：它不看角色，看这个人有没有报名。
 * 所以要多传一份他报过名的活动 id 集合 —— 没传就按「没报名」算。
 * 同工一律可见：否则没法核对名单，也没法给报名的人盖章。
 */
export function activityVisibleTo(activity, role, signedIds = null) {
  const audience = activityAudience(activity);
  if (audience === 'all') return true;
  if (audience === 'signed') {
    return normalizedPlayerRole(role) === 'staff' || !!signedIds?.has(activity.id);
  }
  return audience === normalizedPlayerRole(role);
}

/**
 * 只按角色判，把 `signed` 当作所有人可见。
 *
 * 报名这条路必须用它：扫码落地页和报名接口**不能**被 `signed` 拦住，
 * 否则没报名的人看不到、也报不了名，这一档就成了一把锁死的门。
 */
export function activityRoleVisibleTo(activity, role) {
  const audience = activityAudience(activity);
  if (audience === 'all' || audience === 'signed') return true;
  return audience === normalizedPlayerRole(role);
}

/** 某人报过名的活动 id 集合 */
export function signupSetOf(playerId) {
  return new Set(stmts.signupsOf.all(playerId).map((r) => r.activity_id));
}

function stationById(id, role = null, signedIds = null) {
  // 每次现查：总控台加了一场活动，同工立刻就能给它盖章，不用重启。
  // 活动就几条，这点开销可以忽略
  return getActivities().find((x) => x.id === id
    && (role == null || activityVisibleTo(x, role, signedIds))) || null;
}

/**
 * 当前还挂在清单上的活动 id。
 *
 * 总控台随时能删活动，而章是不可逆的历史，删活动不动已经盖下去的章 ——
 * 所以「有一批章指向的活动已经不存在了」是常态。这些章留在库里
 * （哪天把同 id 的活动加回来，它们自己就回来了），但不再计入分数和场次：
 * 不这么做的话，分子数了已删活动、分母只数现存活动，会印出「参加 5/1 场」。
 */
function liveStationIds(role = null, signedIds = null) {
  return new Set(getActivities()
    .filter((a) => role == null || activityVisibleTo(a, role, signedIds))
    .map((a) => a.id));
}

/* ------------------------- 派生状态（不落库，全靠算） ------------------------- */

export function totalFor(playerId) {
  return stmts.totalFor.get(playerId)?.total ?? 0;
}

/**
 * 把一个选手的事件流折叠成完整状态。
 * 所有"当前值"都是算出来的，因此乱序同步、重放、补录都能收敛到同一结果。
 */
export function playerState(player, settings = getSettings(), live = null, signedIds = null) {
  // 报名集合要先有：`signed` 那一档的可见性按它算，而可见性又决定
  // 哪些章计分（liveStationIds）。默认参数在函数体之前求值，拿不到它，
  // 所以 live 改成进来再算
  const signups = signedIds || signupSetOf(player.id);
  const liveSet = live || liveStationIds(player.role, signups);
  const events = stmts.eventsByPlayer.all(player.id);
  let total = 0;
  let done = 0;
  const stations = {};

  for (const e of events) {
    // 指向已删活动的章不计分、不计场次，但下面照样带出去 ——
    // 前端按现存活动索引，看不到它们；导出和备份里还留着这段历史。
    const counts = e.kind !== 'station' || (e.station_id && liveSet.has(e.station_id));
    if (counts) total += e.points;
    if (e.kind === 'station' && e.station_id) {
      if (counts) done += 1;
      stations[e.station_id] = {
        stationId: e.station_id,
        points: e.points,
        note: e.note,
        operator: e.operator,
        at: e.created_at,
        meta: safeJSON(e.meta, {}),
      };
    }
  }

  return {
    id: player.id,
    code: player.code,
    // 4 位找回密码。选手看自己的，Reception 也要能查到帮人找回。
    // 排行榜另建对象，不会带出去。
    pin: player.pin || '',
    name: player.name,
    role: normalizedPlayerRole(player.role),
    // 报名时选填；留空前端按 name 猜
    surname: player.surname || '',
    given: player.given || '',
    avatar: safeJSON(player.avatar, {}),
    // 这个人自己调过的护照配色。没调过是 null，护照按默认那套渲染
    theme: player.theme ? safeJSON(player.theme, null) : null,
    contact: player.contact,
    // 关卡访问顺序。赛前是空的，签证页据此留白（见 bookVals 的 buildPages）
    notes: player.notes,
    total,
    stations,
    // 报过名的活动 id。护照上据此显示「已报名」，也决定报名按钮是
    // 「我要报名」还是「取消报名」
    signups: [...signups],
    // 只数现存活动上的章，和分母对得上，也和资料页上打勾的数量对得上
    stationsDone: done,
    stationsTotal: liveSet.size,
    updatedAt: player.updated_at,
    createdAt: player.created_at,
    history: events.map(shapeEvent),
  };
}

function shapeEvent(e) {
  return {
    id: e.id,
    kind: e.kind,
    stationId: e.station_id,
    points: e.points,
    label: e.label,
    note: e.note,
    operator: e.operator,
    meta: safeJSON(e.meta, {}),
    at: e.created_at,
  };
}

/** 一次拉全部报名再按人分组 —— 免得给花名册里每个人各查一次 */
function signupsByPlayer() {
  const map = new Map();
  for (const r of stmts.allSignups.all()) {
    let set = map.get(r.player_id);
    if (!set) { set = new Set(); map.set(r.player_id, set); }
    set.add(r.activity_id);
  }
  return map;
}

const NO_SIGNUPS = new Set();

/** 花名册：工作人员端离线缓存的全量数据（50 人量级，压缩后几 KB） */
export function roster(since = 0) {
  const settings = getSettings();
  const players = since > 0 ? stmts.playersSince.all(since) : stmts.allPlayers.all();
  const signups = signupsByPlayer();
  return players.map((p) => {
    const mine = signups.get(p.id) || NO_SIGNUPS;
    const s = playerState(p, settings, liveStationIds(p.role, mine), mine);
    delete s.history; // 花名册不带完整历史，扫到人再单独拉
    return s;
  });
}

export function leaderboard({ limit = 0 } = {}) {
  const settings = getSettings();
  const players = stmts.allPlayers.all();
  const signups = signupsByPlayer();
  const rows = players.map((p) => {
    const mine = signups.get(p.id) || NO_SIGNUPS;
    const s = playerState(p, settings, liveStationIds(p.role, mine), mine);
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      avatar: s.avatar,
      total: s.total,
      stationsDone: s.stationsDone,
      stationsTotal: s.stationsTotal,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    };
  });

  rows.sort((a, b) =>
    b.total - a.total ||
    b.stationsDone - a.stationsDone ||
    a.createdAt - b.createdAt ||
    a.name.localeCompare(b.name, 'zh')
  );

  // 并列同名次
  let rank = 0;
  let prev = null;
  rows.forEach((r, i) => {
    if (prev === null || r.total !== prev) {
      rank = i + 1;
      prev = r.total;
    }
    r.rank = rank;
  });

  return limit > 0 ? rows.slice(0, limit) : rows;
}



export function rankOf(playerId) {
  const board = leaderboard();
  const row = board.find((r) => r.id === playerId);
  return { rank: row?.rank ?? null, of: board.length };
}

/* ------------------------------ 记分核心 ------------------------------ */

function baseEvent(op) {
  const now = Date.now();
  return {
    id: op.opId,
    player_id: op.playerId,
    kind: 'adjust',
    station_id: null,
    points: 0,
    label: '',
    note: op.note || '',
    operator: op.operator || '',
    meta: '{}',
    client_ts: op.clientTs || now,
    created_at: now,
  };
}



/**
 * 落一条事件。opId 是主键，重复提交返回 duplicate 而不是报错 ——
 * 这是弱网下工作人员反复重试也不会重复加分的根本保证。
 */
function insertEvent(row) {
  const info = stmts.insertEvent.run(row);
  if (info.changes === 0) return false;
  stmts.touchPlayer.run(Date.now(), row.player_id);
  return true;
}

const applyOpTx = db.transaction((op, settings) => {
  const player = stmts.playerById.get(op.playerId);
  if (!player) return { status: 'error', message: '找不到该选手' };

  const existing = stmts.eventById.get(op.opId);
  if (existing) {
    return { status: 'duplicate', event: shapeEvent(existing), message: '该操作已记录' };
  }

  switch (op.type) {
    case 'score': {
      const existingStation = stationById(op.stationId);
      if (!existingStation) return { status: 'error', message: '未知活动，可能已被删除' };
      const signedIds = signupSetOf(player.id);
      const station = stationById(op.stationId, player.role, signedIds);
      if (!station) {
        // 分开说：角色不对和没报名是两回事，处理办法也不一样
        const why = activityAudience(existingStation) === 'signed'
          ? `${existingStation.name} 只对报名的人可见，而他没有报名这一场`
          : '这场活动对该用户角色不可见';
        return { status: 'error', message: why };
      }

      const already = stmts.stationEvent.get(player.id, op.stationId);
      if (already) {
        return {
          status: 'conflict',
          event: shapeEvent(already),
          message: `${station.name} 已由 ${already.operator || '其他工作人员'} 记过分（${already.points} 分），每站只有一次机会`,
        };
      }

      const row = baseEvent(op);
      row.kind = 'station';
      row.station_id = op.stationId;
      row.points = clamp(Math.round(Number(op.points) || 0), -20, 20);
      row.label = station.name;
      // checkin 标记：这一笔是「到了就盖章」。印章据此显示「已参加」；
      // 给 1 分只是让总数等于参加场次，不是打了个低分。
      //
      // 「状态效果」（下一关最多 N 分之类）跟着人生盲盒一起去掉了 ——
      // 那是靠盲盒卡牌挂上去的，没有盲盒就没有东西会挂它。
      row.meta = JSON.stringify(op.checkin ? { checkin: true } : {});

      if (!insertEvent(row)) return { status: 'duplicate', message: '该操作已记录' };
      return { status: 'ok', event: shapeEvent({ ...row, meta: row.meta }) };
    }

    case 'adjust': {
      const row = baseEvent(op);
      row.kind = 'adjust';
      row.points = clamp(Math.round(Number(op.points) || 0), -200, 200);
      row.label = op.label || '手动调整';
      row.station_id = op.stationId || null;

      if (!insertEvent(row)) return { status: 'duplicate', message: '该操作已记录' };
      return { status: 'ok', event: shapeEvent(row) };
    }

    default:
      return { status: 'error', message: `未知操作类型：${op.type}` };
  }
});

export function applyOp(op, settings = getSettings()) {
  if (!op || !op.opId || !op.playerId || !op.type) {
    return { opId: op?.opId ?? null, status: 'error', message: '操作格式不完整' };
  }
  try {
    const result = applyOpTx(op, settings);
    return { opId: op.opId, playerId: op.playerId, ...result };
  } catch (err) {
    if (String(err?.code || '').includes('SQLITE_CONSTRAINT')) {
      return { opId: op.opId, playerId: op.playerId, status: 'conflict', message: '该记录与已有数据冲突' };
    }
    console.error('[applyOp]', err);
    return { opId: op.opId, playerId: op.playerId, status: 'error', message: '服务端处理失败' };
  }
}

export { stationById };
