-- ============================================================
-- Mini Life Game · 人生护照 —— 建表脚本
--
-- 这份是权威：db.js 启动时直接执行它，不在代码里再写一遍 CREATE TABLE。
-- 要加字段就改这里，同时在 db.js 的 rebuildIfLegacy() 里补一条迁移。
--
-- 分数永远是 SUM(events.points) 算出来的，库里没有「当前分数」这种
-- 可以被覆盖掉的字段 —— 并发写入和离线补传都靠这一点才安全。
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  -- 顺序编号，找回护照用。一旦发出就不再变
  code          TEXT UNIQUE NOT NULL,
  -- 名字的归一化形式，用来查重名（见 canonCode）
  canon         TEXT NOT NULL,
  -- 4 位找回密码
  pin           TEXT NOT NULL DEFAULT '',
  token         TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- 护照资料页印的姓 / 名。报名时选填，留空就按 name 猜（中文取首字为姓）
  surname       TEXT NOT NULL DEFAULT '',
  given         TEXT NOT NULL DEFAULT '',
  avatar        TEXT NOT NULL DEFAULT '{}',
  contact       TEXT NOT NULL DEFAULT '',
  -- 这个人自己调的护照配色（JSON）。空串 = 没调过，用默认那套
  theme         TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_canon   ON players(canon);
CREATE INDEX IF NOT EXISTS players_updated ON players(updated_at);

-- 仅追加的事件日志。
CREATE TABLE IF NOT EXISTS events (
  -- 客户端生成的 opId。重复提交靠主键自动忽略，弱网重试才安全
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                          -- station | adjust
  station_id TEXT,
  points     INTEGER NOT NULL DEFAULT 0,
  label      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  operator   TEXT NOT NULL DEFAULT '',
  meta       TEXT NOT NULL DEFAULT '{}',
  client_ts  INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_player  ON events(player_id);
CREATE INDEX IF NOT EXISTS events_created ON events(created_at);
-- 一场活动只盖一次章：同一人同一活动只能有一条 station 记录。
-- 这条索引就是幂等的最后一道防线，应用层的检查挡不住并发
CREATE UNIQUE INDEX IF NOT EXISTS events_station_once
  ON events(player_id, station_id) WHERE kind = 'station';

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 活动报名。
--
-- 和 events 里的盖章是两回事：报名是「我打算来」，盖章是「我真的来了」。
-- 两个数字都要，因为差额本身就是信息 —— 报了 30 个来了 12 个，
-- 说明提醒没做到位，不是活动没人要。
--
-- 主键就是 (活动, 人)，所以重复提交天然幂等，取消报名就是删掉那一行。
CREATE TABLE IF NOT EXISTS signups (
  activity_id TEXT NOT NULL,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (activity_id, player_id)
);
