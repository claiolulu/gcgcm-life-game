import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS } from './config.js';
import { randomToken, safeJSON } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MLG_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'game.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');   // 并发读不阻塞写，断电也不会烂库
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  canon         TEXT NOT NULL,
  token         TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar        TEXT NOT NULL DEFAULT '{}',
  contact       TEXT NOT NULL DEFAULT '',
  identity      TEXT,
  team_id       TEXT,
  team_color    TEXT,
  team_symbol   TEXT,
  start_station TEXT,
  tokens_total  INTEGER NOT NULL DEFAULT 1,
  modifiers     TEXT NOT NULL DEFAULT '[]',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_canon ON players(canon);
CREATE INDEX IF NOT EXISTS players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS players_updated ON players(updated_at);

-- 仅追加的事件日志。总分永远是 SUM(points) 算出来的，没有"当前分数"这个可被覆盖的字段。
CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,                       -- 客户端生成的 opId，重复提交自动忽略
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                          -- station | life_event | grace | adjust
  station_id TEXT,
  card_id    TEXT,
  points     INTEGER NOT NULL DEFAULT 0,
  label      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  operator   TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  client_ts  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_player ON events(player_id);
CREATE INDEX IF NOT EXISTS events_created ON events(created_at);
-- 每站只有一次挑战机会：同一人同一主线关卡只能有一条 station 记录
CREATE UNIQUE INDEX IF NOT EXISTS events_station_once
  ON events(player_id, station_id) WHERE kind = 'station';

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS awards (
  award_id   TEXT PRIMARY KEY,
  player_id  TEXT REFERENCES players(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

/* ------------------------------ 迁移 ------------------------------ */
// 老库没有 pin 列，补上。空字符串表示还没设置密码（只会出现在升级前建的档）。
{
  const cols = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name);
  if (!cols.includes('pin')) {
    db.exec("ALTER TABLE players ADD COLUMN pin TEXT NOT NULL DEFAULT ''");
    console.log('[db] 已为 players 表添加 pin 列');
  }
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

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key.startsWith('_')) continue; // 内部键（密钥、PIN）不外发
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
  if (!getSettingStmt.get('_staffPin')) setSetting('_staffPin', process.env.STAFF_PIN || '2026');
  if (!getSettingStmt.get('_adminPin')) setSetting('_adminPin', process.env.ADMIN_PIN || 'stm2026');
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
  insertPlayer: db.prepare(`
    INSERT INTO players (id, code, canon, pin, token, name, avatar, contact, tokens_total, created_at, updated_at)
    VALUES (@id, @code, @canon, @pin, @token, @name, @avatar, @contact, @tokens_total, @created_at, @updated_at)
  `),
  // 顺序编号：取当前最大号 +1。放在事务里分配，配合 code 的 UNIQUE 约束防并发撞号。
  maxCodeNum: db.prepare("SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) AS n FROM players"),
  setPin: db.prepare('UPDATE players SET pin = ?, updated_at = ? WHERE id = ?'),
  playerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  playerByToken: db.prepare('SELECT * FROM players WHERE token = ?'),
  playerByCode: db.prepare('SELECT * FROM players WHERE code = ?'),
  playersByCanon: db.prepare('SELECT * FROM players WHERE canon = ?'),
  playersByTeam: db.prepare('SELECT * FROM players WHERE team_id = ? ORDER BY created_at ASC'),
  playersByName: db.prepare('SELECT * FROM players WHERE name = ? ORDER BY created_at ASC'),
  allPlayers: db.prepare('SELECT * FROM players ORDER BY created_at ASC'),
  playersSince: db.prepare('SELECT * FROM players WHERE updated_at > ? ORDER BY updated_at ASC'),
  countPlayers: db.prepare('SELECT COUNT(*) AS n FROM players'),
  touchPlayer: db.prepare('UPDATE players SET updated_at = ? WHERE id = ?'),
  setModifiers: db.prepare('UPDATE players SET modifiers = ?, updated_at = ? WHERE id = ?'),
  updatePlayerFields: db.prepare(`
    UPDATE players SET name = @name, avatar = @avatar, contact = @contact,
      notes = @notes, identity = @identity, team_id = @team_id, team_color = @team_color,
      team_symbol = @team_symbol, start_station = @start_station, tokens_total = @tokens_total,
      updated_at = @updated_at
    WHERE id = @id
  `),

  insertEvent: db.prepare(`
    INSERT OR IGNORE INTO events
      (id, player_id, kind, station_id, card_id, points, label, note, operator, meta, client_ts, created_at)
    VALUES
      (@id, @player_id, @kind, @station_id, @card_id, @points, @label, @note, @operator, @meta, @client_ts, @created_at)
  `),
  eventById: db.prepare('SELECT * FROM events WHERE id = ?'),
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

  setAward: db.prepare(`
    INSERT INTO awards(award_id, player_id, note, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(award_id) DO UPDATE SET player_id = excluded.player_id, note = excluded.note
  `),
  allAwards: db.prepare('SELECT * FROM awards'),
  clearAward: db.prepare('DELETE FROM awards WHERE award_id = ?'),
};

/** 备份：把整个库导出成一份 JSON 快照 */
export function snapshot() {
  return {
    exportedAt: Date.now(),
    settings: getSettings(),
    players: stmts.allPlayers.all(),
    events: stmts.allEvents.all(),
    awards: stmts.allAwards.all(),
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
    db.prepare('DELETE FROM awards').run();
    if (!keepPlayers) db.prepare('DELETE FROM players').run();
    else db.prepare("UPDATE players SET modifiers = '[]', updated_at = ?").run(Date.now());
    setSetting('gameState', 'lobby');
  });
  tx();
  return backup;
}

seedSettings();
