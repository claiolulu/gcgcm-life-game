import { db, stmts, getSettings, setSetting, getActivities } from './db.js';
import {
  ACTIVITIES,
} from './config.js';
import { safeJSON, shuffle, clamp, uid } from './util.js';

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
function stationById(id) {
  // 每次现查：总控台加了一场活动，同工立刻就能给它盖章，不用重启。
  // 活动就几条，这点开销可以忽略
  return getActivities().find((x) => x.id === id) || null;
}

/* ------------------------- 派生状态（不落库，全靠算） ------------------------- */

export function totalFor(playerId) {
  return stmts.totalFor.get(playerId)?.total ?? 0;
}

/**
 * 把一个选手的事件流折叠成完整状态。
 * 所有"当前值"都是算出来的，因此乱序同步、重放、补录都能收敛到同一结果。
 */
export function playerState(player, settings = getSettings()) {
  const events = stmts.eventsByPlayer.all(player.id);
  let total = 0;
  const stations = {};

  for (const e of events) {
    total += e.points;
    if (e.kind === 'station' && e.station_id) {
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
    signups: stmts.signupsOf.all(player.id).map((r) => r.activity_id),
    stationsDone: Object.keys(stations).length,
    // 分母是当前的活动场数。原来数的是游戏那八个关卡，加了活动也不变
    stationsTotal: getActivities().length,
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

/** 花名册：工作人员端离线缓存的全量数据（50 人量级，压缩后几 KB） */
export function roster(since = 0) {
  const settings = getSettings();
  const players = since > 0 ? stmts.playersSince.all(since) : stmts.allPlayers.all();
  return players.map((p) => {
    const s = playerState(p, settings);
    delete s.history; // 花名册不带完整历史，扫到人再单独拉
    return s;
  });
}

export function leaderboard({ limit = 0 } = {}) {
  const settings = getSettings();
  const players = stmts.allPlayers.all();
  const rows = players.map((p) => {
    const s = playerState(p, settings);
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      avatar: s.avatar,
      total: s.total,
      stationsDone: s.stationsDone,
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
      const station = stationById(op.stationId);
      if (!station) return { status: 'error', message: '未知关卡' };

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

/* --------------------------- 随机抽取身份 / 组队 --------------------------- */

/**
 * 把全部选手打散成 Solo / Duo / Trio。
 * 同色同符号的人需要在场内互相寻找 —— 这是 PDF 里的破冰机制。
 * 同时给每个组分配一个不同的首站，实现分流、避免开局全挤在一个关卡。
 */
/**
 * 随机抽取身份并分组。
 *
 * mode='fill'（默认）：只给还没有身份的人分配，已经组好队的人原封不动。
 *   陆续有人报名时按这个模式点一下就行，不会把现场已经找到队友的人打散。
 * mode='all'：全部重新洗牌。
 */
/* ============================ 关卡路线 ============================ */


















export { stationById };
