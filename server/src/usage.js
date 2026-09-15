/**
 * 使用情况统计（自建埋点）。
 *
 * 只记「谁、哪天、做了哪一类操作、在哪场活动」：登录的人记到护照上，没登录的
 * 访客记浏览器里随机生成的设备号。不记 IP、位置、页面内容和任何用户填写的文字。
 * 原始记录保留 180 天，过期的由 pruneUsage 删掉 —— 启动时跑一次，之后每 6 小时一次。
 */
import { db } from './db.js';

export const USAGE_RETENTION_DAYS = 180;
export const USAGE_RANGES = [7, 30, 90, 180];

const DAY_MS = 86_400_000;
const MAX_BATCH = 50;
// 单台设备 10 分钟最多收 600 条。正常翻护照远到不了，防的是有人拿脚本灌数据把库撑大
const DEVICE_BUDGET = 600;
const BUDGET_WINDOW_MS = 10 * 60_000;
// 离线攒下的记录联网才补发。客户端时间在这个范围内就信它，否则按收到的时间算
const MAX_BACKDATE_MS = 3 * DAY_MS;

/** 前端能上报的事件。名单外的一律丢掉 —— 这张表是给人看的，不能被随便灌东西 */
export const USAGE_EVENTS = {
  open: '打开网页',
  page: '翻护照',
  visa: '看活动签证页',
  board: '打开排名榜',
  guide: '打开使用说明',
  qr: '打开护照码',
  token: '查看编号密码',
  theme: '打开自定义资料',
  contribution: '打开上传',
  tour: '看新手引导',
  push_on: '开启通知',
  push_off: '关闭通知',
  join: '打开活动报名页',
  signup: '报名',
  cancel: '取消报名',
  register: '领取护照',
  recover: '找回护照',
  badge_share: '分享护照图',
  badge_save: '保存护照图',
  notif_open: '点开通知',
};

/** 服务端自己记的事件：不是谁的操作，不算进活跃人数和操作次数。label 存数量 */
export const SERVER_EVENTS = {
  notif_sent: '发出通知',
};

// 按英国时间分天 —— 晚上 11 点半在格拉斯哥用的，应该算当天
const TZ = process.env.MLG_TZ || 'Europe/London';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayOf = (ts) => dayFmt.format(new Date(ts));

/** 日期串前后挪几天。按日历算，不按 24 小时算，夏令时切换那天也不会错位 */
function shiftDay(day, delta) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

const ID_RE = /^[\w-]{1,64}$/;
const LABEL_RE = /^[\w-]{1,32}$/;
const DEVICE_RE = /^[\w-]{8,64}$/;

const insertEvent = db.prepare(`
  INSERT INTO usage_events (ts, day, player_id, device, event, activity_id, label)
  VALUES (@ts, @day, @playerId, @device, @event, @activityId, @label)
`);
const insertMany = db.transaction((rows) => { for (const r of rows) insertEvent.run(r); });
const pruneStmt = db.prepare('DELETE FROM usage_events WHERE ts < ?');

const budgets = new Map();
function takeBudget(device, want, now) {
  let b = budgets.get(device);
  if (!b || now - b.start > BUDGET_WINDOW_MS) {
    b = { start: now, used: 0 };
    budgets.set(device, b);
  }
  const ok = Math.max(0, Math.min(want, DEVICE_BUDGET - b.used));
  b.used += ok;
  if (budgets.size > 5000) {
    for (const [k, v] of budgets) if (now - v.start > BUDGET_WINDOW_MS) budgets.delete(k);
  }
  return ok;
}

/**
 * 收一批前端上报。events 里每条是 { n: 事件名, a: 活动 id, l: 小标签, ts }。
 * playerId 由调用方从护照令牌里认出来，前端传什么名字都不信。
 */
export function recordUsage({ playerId = null, device, events, now = Date.now() }) {
  const list = Array.isArray(events) ? events : [];
  if (!DEVICE_RE.test(String(device || ''))) return { accepted: 0, dropped: list.length };
  const rows = [];
  for (const e of list.slice(0, MAX_BATCH)) {
    const event = String(e?.n || '');
    if (!Object.hasOwn(USAGE_EVENTS, event)) continue;
    const t = Number(e?.ts);
    const ts = Number.isFinite(t) && t <= now + 60_000 && t >= now - MAX_BACKDATE_MS ? Math.round(t) : now;
    const a = String(e?.a ?? '');
    const l = String(e?.l ?? '');
    rows.push({
      ts, day: dayOf(ts), playerId, device, event,
      activityId: ID_RE.test(a) ? a : '',
      label: LABEL_RE.test(l) ? l : '',
    });
  }
  const accepted = takeBudget(device, rows.length, now);
  if (accepted) insertMany(rows.slice(0, accepted));
  return { accepted, dropped: list.length - accepted };
}

export function recordServerUsage(event, { activityId = '', count = 0, now = Date.now() } = {}) {
  if (!Object.hasOwn(SERVER_EVENTS, event)) return;
  insertEvent.run({
    ts: now, day: dayOf(now), playerId: null, device: '', event,
    activityId: ID_RE.test(activityId) ? activityId : '',
    label: String(Math.max(0, Math.floor(Number(count) || 0))),
  });
}

export function pruneUsage(now = Date.now()) {
  return pruneStmt.run(now - USAGE_RETENTION_DAYS * DAY_MS).changes;
}

/* ------------------------------ 报表 ------------------------------ */

// 「一个人」：登录了按护照算，没登录按设备算
const PERSON = `COALESCE(player_id, 'd:' || device)`;

const stmtDaily = db.prepare(`
  SELECT day, COUNT(DISTINCT player_id) AS users, SUM(event <> 'open') AS actions
    FROM usage_events WHERE day >= ? AND device <> '' GROUP BY day
`);
// 访客 = 那天从头到尾没登录过的设备。登录前后各点了几下的人只算用户，不重复算访客
const stmtVisitorsDaily = db.prepare(`
  SELECT day, COUNT(*) AS visitors FROM (
    SELECT day, device FROM usage_events WHERE day >= ? AND device <> ''
     GROUP BY day, device HAVING COUNT(player_id) = 0
  ) GROUP BY day
`);
const stmtUsersSince = db.prepare(`
  SELECT COUNT(DISTINCT player_id) AS n FROM usage_events WHERE day >= ? AND device <> ''
`);
const stmtVisitorsSince = db.prepare(`
  SELECT COUNT(*) AS n FROM (
    SELECT device FROM usage_events WHERE day >= ? AND device <> ''
     GROUP BY device HAVING COUNT(player_id) = 0
  )
`);
const stmtByEvent = db.prepare(`
  SELECT event, COUNT(*) AS n, COUNT(DISTINCT ${PERSON}) AS people
    FROM usage_events WHERE day >= ? AND device <> '' GROUP BY event
`);
const stmtByActivity = db.prepare(`
  SELECT activity_id AS activityId, event, COUNT(*) AS n, COUNT(DISTINCT ${PERSON}) AS people,
         SUM(CASE WHEN device = '' THEN CAST(label AS INTEGER) ELSE 0 END) AS total
    FROM usage_events WHERE day >= ? AND activity_id <> '' GROUP BY activity_id, event
`);
const stmtOldest = db.prepare('SELECT MIN(day) AS day FROM usage_events');

export function usageReport({ days = 30, now = Date.now() } = {}) {
  const span = USAGE_RANGES.includes(Number(days)) ? Number(days) : 30;
  const today = dayOf(now);
  const since = shiftDay(today, -(span - 1));

  const daily = new Map(stmtDaily.all(since).map((r) => [r.day, r]));
  const visitors = new Map(stmtVisitorsDaily.all(since).map((r) => [r.day, r.visitors]));
  const series = [];
  for (let k = span - 1; k >= 0; k--) {
    const day = shiftDay(today, -k);
    const r = daily.get(day);
    series.push({ day, users: r?.users || 0, visitors: visitors.get(day) || 0, actions: r?.actions || 0 });
  }

  const events = stmtByEvent.all(since)
    .map((r) => ({ ...r, label: USAGE_EVENTS[r.event] || r.event }))
    .sort((a, b) => b.n - a.n);

  const activities = {};
  for (const r of stmtByActivity.all(since)) {
    const a = (activities[r.activityId] ||= {});
    a[r.event] = Object.hasOwn(SERVER_EVENTS, r.event)
      ? { n: r.n, total: r.total || 0 }
      : { n: r.n, people: r.people };
  }

  const last = series[series.length - 1];
  return {
    days: span,
    today,
    since,
    retentionDays: USAGE_RETENTION_DAYS,
    oldestDay: stmtOldest.get().day || null,
    kpi: {
      todayUsers: last.users,
      todayVisitors: last.visitors,
      users7: stmtUsersSince.get(shiftDay(today, -6)).n,
      usersRange: stmtUsersSince.get(since).n,
      visitorsRange: stmtVisitorsSince.get(since).n,
      actionsRange: series.reduce((s, r) => s + r.actions, 0),
    },
    series,
    events,
    activities,
  };
}
