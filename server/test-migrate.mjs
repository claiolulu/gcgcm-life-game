// 建一个旧版结构的库，跑一遍启动迁移，检查数据有没有丢。
//
// 这条测试值得单独存在：迁移是「跑一次就回不去」的那种代码，
// 而它平时不跑 —— 只有第一次升级那一下会跑，出错就是所有人的档案。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'data-migrate-test');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n=== 老库升级迁移 ===\n');

/* ---------- 造一个迎新游戏那一版的库 ---------- */
{
  const db = new Database(path.join(dir, 'game.db'));
  db.exec(`
    CREATE TABLE players (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, canon TEXT NOT NULL,
      token TEXT NOT NULL, name TEXT NOT NULL,
      surname TEXT NOT NULL DEFAULT '', given TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '{}', contact TEXT NOT NULL DEFAULT '',
      identity TEXT, team_id TEXT, team_color TEXT, team_symbol TEXT,
      team_name TEXT NOT NULL DEFAULT '', start_station TEXT,
      route TEXT NOT NULL DEFAULT '', tokens_total INTEGER NOT NULL DEFAULT 1,
      modifiers TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, station_id TEXT, card_id TEXT,
      points INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '', operator TEXT NOT NULL DEFAULT '',
      meta TEXT NOT NULL DEFAULT '{}', client_ts INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE awards (
      award_id TEXT PRIMARY KEY, player_id TEXT, note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
  const now = Date.now();
  const ins = db.prepare(`INSERT INTO players
    (id, code, canon, token, name, surname, given, avatar, contact,
     identity, team_id, team_color, team_symbol, start_station, route, tokens_total, modifiers,
     notes, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('p1', '01', 'linxiaoman', 'tok1', '林小满', '林', '小满', '{"skin":1}', 'wx:xm',
          'trio', 'team-a', 'red', '★', 'music', '["music","uk"]', 1, '[]', '备注一', now, now);
  ins.run('p2', '02', 'chenzimo', 'tok2', '陈子墨', '', '', '{}', '',
          'solo', null, null, null, null, '', 0, '[]', '', now, now);

  const ev = db.prepare(`INSERT INTO events
    (id, player_id, kind, station_id, card_id, points, label, note, operator, meta, client_ts, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  ev.run('e1', 'p1', 'station', 'freshers', null, 1, '迎新之夜', '', '佳琪', '{"checkin":true}', now, now);
  ev.run('e6', 'p1', 'station', 'retreat', null, 9, '退修会', '', '梁潇', '{}', now, now);   // 游戏时代的 9 分
  ev.run('e2', 'p1', 'life_event', null, 'crypto_crash', -9, '投资暴雷', '', '昊阳', '{}', now, now);
  ev.run('e3', 'p2', 'station', 'bible-study', null, 1, '查经小组', '', '佳琪', '{}', now, now);
  ev.run('e4', 'p1', 'grace', null, null, 0, 'Help Token', '', 'Yihan', '{}', now, now);
  ev.run('e5', 'p2', 'adjust', null, null, 3, '手动调整', '', '管理员', '{}', now, now);

  db.prepare('INSERT INTO awards VALUES (?,?,?,?)').run('top_score', 'p1', '', now);
  db.prepare('INSERT INTO settings VALUES (?,?)').run('scoreTiers', '[3,6,9]');
  db.prepare('INSERT INTO settings VALUES (?,?)').run('identitiesDrawnAt', '1788000000000');
  db.prepare('INSERT INTO settings VALUES (?,?)').run('gameState', '"lobby"');

  // 一场在画布里存过版式的活动。它的栏目里有一栏绑着迎新游戏那套的
  // 「身份」—— 那个来源已经不存在了，留着的话保存这场活动会被服务端拒掉。
  db.prepare('INSERT INTO settings VALUES (?,?)').run('_activities', JSON.stringify([{
    id: 'freshers', name: '迎新之夜', icon: '🎉', state: 'upcoming',
    blocks: [{
      kind: 'fields', x: 4, y: 27, w: 92, h: 58, cols: 2,
      rows: [
        { key: 'surname', label: 'SURNAME 姓', src: 'surname' },
        { key: 'class', label: 'CLASS 身份', src: 'identity' },
        { key: 'control', label: 'CONTROL NUMBER 控制号', src: 'control' },
      ],
    }],
  }]));
  db.close();
}

/* ---------- 启动一次，让迁移跑起来 ---------- */
const run = spawnSync(process.execPath, ['-e', `
  process.env.MLG_DATA_DIR = ${JSON.stringify(dir)};
  const m = await import(${JSON.stringify(path.join(here, 'src', 'db.js'))});
  console.log('ACTS:' + JSON.stringify(m.getActivities()));
  m.db.close();
`], { env: { ...process.env, MLG_DATA_DIR: dir }, encoding: 'utf8' });

check('迁移跑完没有报错', run.status === 0, run.stderr?.slice(0, 300));
check('日志里说明了动了什么', /已重建/.test(run.stdout), run.stdout.slice(0, 200));
check('重建前留了一份备份',
  fs.readdirSync(dir).some((f) => f.startsWith('pre-rebuild-') && f.endsWith('.db')),
  fs.readdirSync(dir).join(' '));

/* ---------- 查结果 ---------- */
{
  const db = new Database(path.join(dir, 'game.db'), { readonly: true });
  const pcols = db.prepare('PRAGMA table_info(players)').all().map((c) => c.name);
  const ecols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);

  check('游戏那几列没了',
    !['identity', 'team_id', 'team_color', 'team_symbol', 'team_name',
      'start_station', 'route', 'tokens_total', 'modifiers'].some((c) => pcols.includes(c)),
    pcols.join(' '));
  check('该留的列都在',
    ['id', 'code', 'canon', 'pin', 'token', 'name', 'surname', 'given',
     'avatar', 'contact', 'theme', 'notes'].every((c) => pcols.includes(c)),
    pcols.join(' '));
  check('events 去掉了 card_id', !ecols.includes('card_id'), ecols.join(' '));
  check('awards 表没了',
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='awards'").get());

  const p1 = db.prepare("SELECT * FROM players WHERE code = '01'").get();
  check('人一个没少', db.prepare('SELECT COUNT(*) n FROM players').get().n === 2);
  check('名字、姓名、头像、联系方式、备注都搬过来了',
    p1.name === '林小满' && p1.surname === '林' && p1.given === '小满'
    && p1.avatar === '{"skin":1}' && p1.contact === 'wx:xm' && p1.notes === '备注一',
    JSON.stringify(p1));

  const kinds = db.prepare('SELECT kind, COUNT(*) n FROM events GROUP BY kind').all();
  const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k.n]));
  check('盖章记录一条没丢', byKind.station === 3, JSON.stringify(byKind));
  check('老盖章的分值归一成 1（打卡本里一次就是一分）',
    db.prepare("SELECT COUNT(*) n FROM events WHERE kind='station' AND points <> 1").get().n === 0);
  check('归一之后总分等于盖章数',
    db.prepare("SELECT COALESCE(SUM(points),0) t FROM events WHERE player_id='p1'").get().t === 2,
    JSON.stringify(db.prepare("SELECT id,kind,points FROM events WHERE player_id='p1'").all()));
  check('手动调整也留着', byKind.adjust === 1, JSON.stringify(byKind));
  check('盲盒和恩典的记录清掉了', !byKind.life_event && !byKind.grace, JSON.stringify(byKind));
  check('盖章上的 checkin 标记还在',
    db.prepare("SELECT meta FROM events WHERE id = 'e1'").get().meta.includes('checkin'));

  check('唯一索引重建了（一场只盖一次靠它）',
    !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='events_station_once'").get());
  check('外键约束还连得上',
    db.prepare('PRAGMA foreign_key_check').all().length === 0);
  check('库是完整的', db.pragma('integrity_check', { simple: true }) === 'ok');
  check('游戏那几项设置清掉了',
    !db.prepare("SELECT 1 FROM settings WHERE key = 'scoreTiers'").get());
  check('别的设置留着',
    !!db.prepare("SELECT 1 FROM settings WHERE key = 'gameState'").get());
  check('抽身份的时间戳也清掉了',
    !db.prepare("SELECT 1 FROM settings WHERE key = 'identitiesDrawnAt'").get());
  db.close();
}

/* ---------- 存过版式的活动：绑着死来源的栏目要剔掉 ---------- */
{
  const line = (run.stdout || '').split('\n').find((l) => l.startsWith('ACTS:'));
  const acts = line ? JSON.parse(line.slice(5)) : [];
  const rows = acts[0]?.blocks?.[0]?.rows || [];
  const srcs = rows.map((r) => r.src);
  check('绑着「身份」的那一栏被剔掉了（留着会让这场活动保存失败）',
    !srcs.includes('identity'), JSON.stringify(srcs));
  check('同一块里其它栏目原样留着',
    srcs.join(',') === 'surname,control', JSON.stringify(srcs));
  check('顺手把「控制号」的标题迁成「编号」',
    rows.find((r) => r.src === 'control')?.label === 'NUMBER 编号',
    JSON.stringify(rows.map((r) => r.label)));
}

/* ---------- 再跑一次，不该重复迁移 ---------- */
const again = spawnSync(process.execPath, ['-e', `
  const { db } = await import(${JSON.stringify(path.join(here, 'src', 'db.js'))});
  db.close();
`], { env: { ...process.env, MLG_DATA_DIR: dir }, encoding: 'utf8' });
check('第二次启动不再重建（迁移是幂等的）', !/已重建/.test(again.stdout), again.stdout.slice(0, 200));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
