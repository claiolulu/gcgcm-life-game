import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_SETTINGS, ACTIVITIES, THEME, VISA_TEMPLATE, VISA_ROW_SOURCES, normalizeActivityDate,
} from './config.js';
import { randomToken, safeJSON } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MLG_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'game.db');

/**
 * 总控台上传的活动配图。跟数据库放在一起 —— data/ 是整个部署里唯一
 * 需要挂持久卷的目录，图片放别处升级一次就没了。
 * 文件名是内容哈希，所以同一张图传两次不会存两份。
 */
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');   // 并发读不阻塞写，断电也不会烂库
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

/* ------------------------------ 建表 ------------------------------ */
//
// 表结构在 schema.sql 里，不在这儿重写一遍 —— 两份 CREATE TABLE 迟早对不上。
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

/* ------------------------------ 迁移 ------------------------------ */

/**
 * 把迎新游戏那一版的表重建成现在这套。
 *
 * 那一版的 players 上挂着身份、队伍、关卡顺序、Help Token、状态效果，
 * events 上挂着盲盒卡号 —— 那套玩法整个拆掉之后，这些列再没有代码读写。
 * SQLite 3.35 之后能 DROP COLUMN，但一列一列删要发七八条语句，还得挨个
 * 判断存不存在；直接照 schema 重建一张再把活着的列搬过去，更短也更好读。
 *
 * 整件事在一个事务里：中途出错就整个回滚，不会留下一张搬到一半的表。
 * 外键先关掉 —— events / signups 指着 players，不关的话删旧表那一步会被拦。
 */
function rebuildIfLegacy() {
  const cols = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name);
  const legacy = ['identity', 'team_id', 'tokens_total', 'modifiers', 'route', 'start_station'];
  const found = legacy.filter((c) => cols.includes(c));
  const hasAwards = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='awards'"
  ).get();
  if (found.length === 0 && !hasAwards) return;

  // 重建之前先留一份完整拷贝。这一步动的是所有人的档案，
  // 出了事得有东西可以退回去
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `pre-rebuild-${stamp}.db`);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(DB_PATH, backup);
  console.log(`[db] 重建前已备份到 ${path.basename(backup)}`);

  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    // players：留下的列照抄，游戏那几列直接不带过去
    db.exec(`
      CREATE TABLE players_new (
        id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, canon TEXT NOT NULL,
        pin TEXT NOT NULL DEFAULT '', token TEXT NOT NULL, name TEXT NOT NULL,
        surname TEXT NOT NULL DEFAULT '', given TEXT NOT NULL DEFAULT '',
        avatar TEXT NOT NULL DEFAULT '{}', contact TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO players_new
        SELECT id, code, canon, pin, token, name, surname, given, avatar, contact,
               theme, notes, created_at, updated_at
          FROM players;
      DROP TABLE players;
      ALTER TABLE players_new RENAME TO players;
      CREATE INDEX IF NOT EXISTS players_canon   ON players(canon);
      CREATE INDEX IF NOT EXISTS players_updated ON players(updated_at);
    `);

    // events：去掉盲盒卡号那一列。
    // 老的 life_event / grace 记录一并丢掉 —— 它们既不再显示，也不该继续
    // 算进总分（总分是 SUM(points)，留着会让「参加过几场」对不上）
    if (db.prepare('PRAGMA table_info(events)').all().some((c) => c.name === 'card_id')) {
      db.exec(`
        CREATE TABLE events_new (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, station_id TEXT, points INTEGER NOT NULL DEFAULT 0,
          label TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
          operator TEXT NOT NULL DEFAULT '', meta TEXT NOT NULL DEFAULT '{}',
          client_ts INTEGER, created_at INTEGER NOT NULL
        );
        INSERT INTO events_new
          SELECT id, player_id, kind, station_id, points, label, note, operator,
                 meta, client_ts, created_at
            FROM events WHERE kind IN ('station', 'adjust');
        DROP TABLE events;
        ALTER TABLE events_new RENAME TO events;
        CREATE INDEX IF NOT EXISTS events_player  ON events(player_id);
        CREATE INDEX IF NOT EXISTS events_created ON events(created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS events_station_once
          ON events(player_id, station_id) WHERE kind = 'station';
      `);
    }

    // 老的盖章记录带着游戏时代的分值（3 / 6 / 9 —— 勉强 / 正常 / 出色）。
    // 打卡本里一次盖章就是 1 分，总分等于「参加过几场」；不抹平的话，
    // 页眉会显示 19 分而资料页写着参加过 5 场，对不上。
    const fixed = db.prepare(
      "UPDATE events SET points = 1 WHERE kind = 'station' AND points <> 1"
    ).run().changes;
    if (fixed) console.log(`[db] ${fixed} 条老盖章的分值归一成 1（打卡本里一次就是一分）`);

    db.exec('DROP TABLE IF EXISTS awards');
    // 记分档位、盲盒红线那几项设置也跟着走
    db.exec(`DELETE FROM settings WHERE key IN
      ('scoreTiers', 'maxStationScore', 'lifeEventThresholds', 'helpTokens')`);
  })();
  db.pragma('foreign_keys = ON');

  console.log(`[db] 已重建：去掉 ${found.join(' / ') || '（无）'}${hasAwards ? ' 和 awards 表' : ''}`);
}

// 老库没有 pin / surname / given / theme 几列的话先补上，
// 重建那一步才有东西可抄
{
  const cols = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name);
  for (const col of ['pin', 'surname', 'given', 'theme']) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE players ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
      console.log(`[db] 已为 players 表添加 ${col} 列`);
    }
  }
}
rebuildIfLegacy();

// 迎新游戏那套留下的设置项。rebuildIfLegacy 只对还没重建过的库跑，
// 已经重建过的库里这几行还留着 —— 无害，但会让人以为功能还在。
{
  const gone = db.prepare(`DELETE FROM settings WHERE key IN
    ('identitiesDrawnAt', 'scoreTiers', 'maxStationScore', 'lifeEventThresholds', 'helpTokens')`).run().changes;
  if (gone) console.log(`[db] 清掉 ${gone} 项迎新游戏留下的设置`);
}

/* ----------------------------- settings ----------------------------- */

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  return row ? safeJSON(row.value, fallback) : fallback;
}

export function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
  return value;
}

const SRC_KEYS = new Set(VISA_ROW_SOURCES.map((x) => x.key));

/**
 * 当前的活动清单。总控台改过就用库里的，没改过就是 config.js 的默认值。
 *
 * 不放进 getSettings() 一起返回：它是个数组，而 settings 那个对象
 * 到处在传，混进去会让每个用到设置的地方都白背这份数据。
 */
export function getActivities() {
  const row = getSettingStmt.get('_activities');
  const list = row ? safeJSON(row.value, null) : null;
  const out = Array.isArray(list) && list.length ? list : ACTIVITIES;
  // state 是后加的字段，库里存着的老记录没有它。补上默认值，
  // 免得前端拿到 undefined 之后各处都得写一遍兜底
  const normalized = out.map((a) => ({
    ...a,
    state: a?.state || 'upcoming',
    date: normalizeActivityDate(a?.date),
    // 已经保存过版式的活动，栏目标题也要从旧「控制号」迁移成「编号」。
    ...(Array.isArray(a?.blocks) ? {
      blocks: a.blocks.map((b) => b?.kind === 'fields' && Array.isArray(b.rows) ? {
        ...b,
        rows: b.rows
          // 绑着已经不存在的来源的栏目直接扔掉（比如迎新游戏那套的
          // 「CLASS 身份」和「队伍」）。它们本来就渲染成空白，但留着更糟：
          // 保存活动时服务端不认这个来源，整份提交会被拒，同工只会看到
          // 一句「数据来源不认识」，不知道是自己十个月前存下的一栏。
          .filter((r) => SRC_KEYS.has(String(r?.src || 'text')))
          .map((r) => (r?.src === 'control' && r.label === 'CONTROL NUMBER 控制号'
            ? { ...r, label: 'NUMBER 编号' } : r)),
      } : b),
    } : {}),
  }));
  // 启动后第一次读取就把旧日期/标题真正写回库，之后存储始终是新格式。
  if (row && JSON.stringify(normalized) !== JSON.stringify(out)) setSetting('_activities', normalized);
  return normalized;
}

export function setActivities(list) {
  setSetting('_activities', list);
}

/**
 * 所有人共同的护照配色起点。
 *
 * 每个人可以在自己的资料页上改（players.theme），这里这份是他还没改过时
 * 看到的样子。以前它是总控台上的一个全局设置，现在没有那个入口了。
 *
 * 一定要和默认值合并再返回：以后往 THEME 里加字段时，库里那份老记录
 * 缺这个键，不合并的话前端拿到 undefined，页面上就是一块没颜色的地方。
 */
export function getTheme() {
  const row = getSettingStmt.get('_theme');
  const saved = row ? safeJSON(row.value, null) : null;
  return { ...THEME, ...(saved && typeof saved === 'object' ? saved : {}) };
}

// setTheme 没有了：配色搬到每个人自己身上（players.theme），
// 这里这份只是所有人共同的起点。

/**
 * 签证页的默认版式。
 *
 * 以前它是个可改的设置（settings 的 _visaTpl），现在退回成代码常量 ——
 * 每一场的版式在它自己的画布编辑器里排。多一个全局「模版」只会让人
 * 先去改模版、发现某一场没跟着变、再回来找原因。
 *
 * 前端仍然要它：没排过版的活动按它生成默认那几个块。
 */
export function getVisaTemplate() {
  return VISA_TEMPLATE;
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    // registrationOpen 是旧版的全局报名开关。护照签发与单场活动已经解耦，
    // 老数据库里即使还留着这个键，也不能再让旧值影响新客户端。
    if (r.key.startsWith('_') || r.key === 'registrationOpen') continue;
    out[r.key] = safeJSON(r.value, out[r.key]);
  }
  return out;
}

/** 首次启动写入默认值；密钥持久化，服务器重启后已登录的工作人员不掉线 */
export function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!getSettingStmt.get(key)) setSetting(key, value);
  }
  if (!getSettingStmt.get('_secret')) setSetting('_secret', randomToken(32));
  if (!getSettingStmt.get('_epoch')) setSetting('_epoch', 1);

  // 活动清单存进设置表，总控台可以改。config.js 里那份只是首次启动的种子，
  // 之后以库里的为准 —— 否则同工改完，一升级代码就被覆盖回去了。
  if (!getSettingStmt.get('_activities')) setSetting('_activities', ACTIVITIES);

  // 兜底 PIN。开发环境用固定值，测试脚本和 npm run seed 依赖它；
  // 生产环境（NODE_ENV=production）绝不能有写死的默认值 —— 这个仓库是公开的，
  // 写死等于把总控台的钥匙贴在门上。没设环境变量就随机生成并打到日志里，
  // 部署方用 `fly logs` 能看到，正确做法仍然是 `fly secrets set`。
  const prod = process.env.NODE_ENV === 'production';
  if (!getSettingStmt.get('_staffPin')) {
    setSetting('_staffPin', process.env.STAFF_PIN || (prod ? randomDigits(4) : '2026'));
  }
  if (!getSettingStmt.get('_adminPin')) {
    setSetting('_adminPin', process.env.ADMIN_PIN || (prod ? randomDigits(8) : 'stm2026'));
  }
}

/** 生产环境兜底 PIN 用的随机数字串 */
function randomDigits(n) {
  let out = '';
  const bytes = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) out += String(bytes[i] % 10);
  return out;
}

export const secret = () => getSetting('_secret');
export const epoch = () => getSetting('_epoch', 1) || 1;

/**
 * PIN 的取值顺序：环境变量优先，其次是库里存的值。
 *
 * 环境变量必须优先，否则 `fly secrets set STAFF_PIN=...` 会完全不起作用 ——
 * 首次启动时 PIN 已经被写进数据库了，之后 seedSettings 不会再覆盖它，
 * 部署方改了 secret 却发现旧 PIN 照样能登录，而新 PIN 进不去。
 */
export const staffPin = () => String(process.env.STAFF_PIN || getSetting('_staffPin'));
export const adminPin = () => String(process.env.ADMIN_PIN || getSetting('_adminPin'));

/* ------------------------------ players ------------------------------ */

export const stmts = {
  /* ---------------------------- 报名 ---------------------------- */
  addSignup: db.prepare(
    'INSERT OR IGNORE INTO signups (activity_id, player_id, created_at) VALUES (?, ?, ?)'),
  dropSignup: db.prepare('DELETE FROM signups WHERE activity_id = ? AND player_id = ?'),
  signupsFor: db.prepare(`
    SELECT s.player_id, s.created_at, p.name, p.code, p.avatar, p.contact
      FROM signups s JOIN players p ON p.id = s.player_id
     WHERE s.activity_id = ?
     ORDER BY s.created_at
  `),
  signupCounts: db.prepare('SELECT activity_id, COUNT(*) AS n FROM signups GROUP BY activity_id'),
  signupsOf: db.prepare('SELECT activity_id FROM signups WHERE player_id = ?'),
  insertPlayer: db.prepare(`
    INSERT INTO players (id, code, canon, pin, token, name, surname, given, avatar, contact, created_at, updated_at)
    VALUES (@id, @code, @canon, @pin, @token, @name, @surname, @given, @avatar, @contact, @created_at, @updated_at)
  `),
  // 顺序编号：取当前最大号 +1。放在事务里分配，配合 code 的 UNIQUE 约束防并发撞号。
  maxCodeNum: db.prepare("SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) AS n FROM players"),
  setPin: db.prepare('UPDATE players SET pin = ?, updated_at = ? WHERE id = ?'),
  playerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  playerByToken: db.prepare('SELECT * FROM players WHERE token = ?'),
  playerByCode: db.prepare('SELECT * FROM players WHERE code = ?'),
  playersByCanon: db.prepare('SELECT * FROM players WHERE canon = ?'),
  playersByName: db.prepare('SELECT * FROM players WHERE name = ? ORDER BY created_at ASC'),
  allPlayers: db.prepare('SELECT * FROM players ORDER BY created_at ASC'),
  playersSince: db.prepare('SELECT * FROM players WHERE updated_at > ? ORDER BY updated_at ASC'),
  countPlayers: db.prepare('SELECT COUNT(*) AS n FROM players'),
  touchPlayer: db.prepare('UPDATE players SET updated_at = ? WHERE id = ?'),
  // 姓/名单独更新：updatePlayerFields 被记分、编队等多处复用，
  // 往那条里塞字段会逼所有调用点都传，不值得
  // 路线单独更新，理由同 setNameParts：不往被多处复用的
  // 护照配色单独更新，理由同 setNameParts：不往被多处复用的
  // updatePlayerFields 里塞字段
  setTheme_: db.prepare('UPDATE players SET theme = ?, updated_at = ? WHERE id = ?'),
  setNameParts: db.prepare(
    'UPDATE players SET surname = ?, given = ?, updated_at = ? WHERE id = ?',
  ),
  updatePlayerFields: db.prepare(`
    UPDATE players SET name = @name, avatar = @avatar, contact = @contact,
      notes = @notes, updated_at = @updated_at
    WHERE id = @id
  `),

  insertEvent: db.prepare(`
    INSERT OR IGNORE INTO events
      (id, player_id, kind, station_id, points, label, note, operator, meta, client_ts, created_at)
    VALUES
      (@id, @player_id, @kind, @station_id, @points, @label, @note, @operator, @meta, @client_ts, @created_at)
  `),
  eventById: db.prepare('SELECT * FROM events WHERE id = ?'),
  // 一次取回所有已盖章的（选手, 关卡）对：算各关排队人数时用，
  // 免得对着 50 个人各查一次
  allStationPairs: db.prepare(
    "SELECT player_id, station_id FROM events WHERE kind = 'station' AND station_id IS NOT NULL",
  ),
  eventsByPlayer: db.prepare('SELECT * FROM events WHERE player_id = ? ORDER BY created_at ASC'),
  allEvents: db.prepare('SELECT * FROM events ORDER BY created_at ASC'),
  stationEvent: db.prepare(
    "SELECT * FROM events WHERE player_id = ? AND station_id = ? AND kind = 'station'"
  ),
  totals: db.prepare('SELECT player_id, SUM(points) AS total FROM events GROUP BY player_id'),
  totalFor: db.prepare('SELECT COALESCE(SUM(points), 0) AS total FROM events WHERE player_id = ?'),
  eventCounts: db.prepare(
    'SELECT player_id, kind, COUNT(*) AS n FROM events GROUP BY player_id, kind'
  ),
};

/** 备份：把整个库导出成一份 JSON 快照 */
export function snapshot() {
  return {
    exportedAt: Date.now(),
    settings: getSettings(),
    players: stmts.allPlayers.all(),
    events: stmts.allEvents.all(),
  };
}

export function writeSnapshot() {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'latest.json');
  fs.writeFileSync(file, JSON.stringify(snapshot(), null, 2));
  return file;
}

/** 危险操作：清空全部游戏数据（管理员后台需二次确认） */
export function resetAll({ keepPlayers = false } = {}) {
  const backup = writeSnapshot();
  const tx = db.transaction(() => {
    // 纪元 +1：各端的增量同步靠 updated_at，删除是看不见的。
    // 纪元一变，客户端就知道自己手里的花名册作废了，必须整份重拉。
    setSetting('_epoch', (getSetting('_epoch', 0) || 0) + 1);
    db.prepare('DELETE FROM events').run();
    if (!keepPlayers) db.prepare('DELETE FROM players').run();
    setSetting('gameState', 'lobby');
  });
  tx();
  return backup;
}

seedSettings();
