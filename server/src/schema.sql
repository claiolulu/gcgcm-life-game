-- ============================================================
-- 人生护照 · GCGCM —— 建表脚本
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
  -- 参与者分组：normal 普通成员 | staff 同工。只用于活动可见范围，
  -- 不授予工作人员端或总控台权限（后台权限仍由独立 PIN 控制）。
  role          TEXT NOT NULL DEFAULT 'normal',
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

-- 参与者为某场活动提交的文字或图片素材。
-- activity_id 对应的是 settings._activities 里的活动 id，不能做 SQLite 外键；
-- player_id 可以做外键，删除护照时自动清掉其投稿。
CREATE TABLE IF NOT EXISTS activity_materials (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                         -- text | image
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS materials_activity ON activity_materials(activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS materials_player   ON activity_materials(player_id, activity_id, created_at DESC);

-- 自建标签。
--
-- 「普通成员 / 同工」这两个不在这张表里 —— 它们仍然由 players.role 派生，
-- 当作两个内置标签用。这样既不用动 role 那一列（导出、花名册、总控台的
-- 角色下拉都还指着它），又能让一个人同时挂任意多个自建标签。
--
-- 一个人的**有效标签集** = {role} ∪ player_tags 里的自建标签。
-- 活动的可见范围就是拿这个集合去求交集（见 game.js 的 activityVisibleTo）。
CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  -- 标签颜色 #rrggbb。新建时自动挑一个还没被用的，总控台里点色点可以换。
  -- 老库里这张表已经存在、CREATE IF NOT EXISTS 不会补列 —— 见 db.js 的迁移
  color      TEXT NOT NULL DEFAULT '',
  -- 排序用，总控台里拖动或新增时写入
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 谁挂了哪些自建标签。主键是 (人, 标签)，所以重复挂天然幂等。
CREATE TABLE IF NOT EXISTS player_tags (
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, tag_id)
);
CREATE INDEX IF NOT EXISTS player_tags_tag ON player_tags(tag_id);
