import express from 'express';
import compression from 'compression';
import cors from 'cors';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';

import {
  GAME, STATIONS, FUNCTIONAL, IDENTITIES, LIFE_EVENT_CARDS, CARD_KINDS,
  GRACE_OPTIONS, AWARDS, GROUP_COLORS, GROUP_SYMBOLS, TIER_LABELS, RESET_PIN,
} from './config.js';
import {
  db, stmts, getSettings, setSetting, secret, epoch, staffPin, adminPin,
  writeSnapshot, resetAll, snapshot,
} from './db.js';
import {
  playerState, roster, leaderboard, rankOf, applyOp, drawIdentities,
  assignTeam, clearIdentities,
} from './game.js';
import {
  formatPlayerId, canonCode, extractCode, isValidPin, randomPin, uid, randomToken,
  signToken, verifyToken, safeJSON, csvEscape,
} from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: true, credentials: true } });

app.set('trust proxy', 1);
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '512kb' }));

/* ------------------------------ 实时广播 ------------------------------ */
// 只广播一个"有变化"的信号，不推数据 —— payload 极小，客户端各自按需拉增量。
// 弱网下这比推全量安全得多。
let broadcastTimer = null;
function broadcast(reason = 'update') {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    io.emit('tick', { ts: Date.now(), reason });
  }, 400);
}

io.on('connection', (socket) => {
  socket.emit('tick', { ts: Date.now(), reason: 'hello' });
});

/* ------------------------------- 鉴权 ------------------------------- */

function playerAuth(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const player = token && stmts.playerByToken.get(token);
  if (!player) return res.status(401).json({ error: '护照令牌无效，请用短码恢复' });
  req.player = player;
  next();
}

function staffAuth(role = 'staff') {
  return (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const payload = token && verifyToken(token, secret());
    if (!payload) return res.status(401).json({ error: '请重新登录工作人员端' });
    if (role === 'admin' && payload.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    req.staff = payload;
    next();
  };
}

/* ------------------------------ 公共接口 ------------------------------ */

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/config', (_req, res) => {
  res.json({
    game: GAME,
    stations: STATIONS,
    functional: FUNCTIONAL,
    identities: IDENTITIES,
    cards: LIFE_EVENT_CARDS,
    cardKinds: CARD_KINDS,
    graceOptions: GRACE_OPTIONS,
    awards: AWARDS,
    groupColors: GROUP_COLORS,
    groupSymbols: GROUP_SYMBOLS,
    tierLabels: TIER_LABELS,
    resetPin: RESET_PIN,
    settings: getSettings(),
    serverTs: Date.now(),
  });
});

app.post('/api/register', (req, res) => {
  const settings = getSettings();
  // 选手端是纯展示端：只有「入场 / 报名中」这一个阶段允许它写入。
  // 这一道闸是服务端强制的，不依赖前端隐藏按钮，也不依赖同工记得关开关。
  if (settings.gameState !== 'lobby') {
    return res.status(403).json({ error: '游戏已经开始，报名通道已关闭' });
  }
  if (!settings.registrationOpen) {
    return res.status(403).json({ error: '报名通道已关闭，请找 Reception 的同工' });
  }

  const name = String(req.body?.name || '').trim().slice(0, 24);
  if (name.length < 1) return res.status(400).json({ error: '请填写你的名字' });

  // 一个人一个号：同名的多半是「忘了密码干脆重新注册」。
  // 但同名也可能真是两个人（50 个人里出现两个小明很正常），
  // 所以不是硬拦 —— 先告诉他已经有这个名字了，确认过再放行。
  const sameName = stmts.playersByName.all(name);
  if (sameName.length > 0 && !req.body?.confirmNew) {
    return res.status(409).json({
      error: '这个名字已经报过名了',
      duplicate: true,
      existing: sameName.map((p) => ({ code: p.code, at: p.created_at })),
    });
  }

  const count = stmts.countPlayers.get().n;
  if (count >= 300) return res.status(429).json({ error: '报名人数已满' });

  const avatar = JSON.stringify(req.body?.avatar ?? {});
  if (avatar.length > 2000) return res.status(400).json({ error: '头像数据异常' });
  const contact = String(req.body?.contact || '').trim().slice(0, 64);

  // 选手自己挑的 4 位密码；没填或不合法就随机给一个
  const pin = isValidPin(req.body?.pin) ? String(req.body.pin) : randomPin();

  // 顺序编号在事务里分配：先取最大号 +1，撞号了（并发报名）就重试。
  // code 上的 UNIQUE 约束是最后一道保险。
  const now = Date.now();
  const create = db.transaction(() => {
    const next = stmts.maxCodeNum.get().n + 1;
    const code = formatPlayerId(next);
    const player = {
      id: uid(),
      code,
      canon: canonCode(code),
      pin,
      token: randomToken(24),
      name,
      avatar,
      contact,
      tokens_total: settings.helpTokens ?? 1,
      created_at: now,
      updated_at: now,
    };
    stmts.insertPlayer.run(player);
    return player;
  });

  let player = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { player = create(); break; }
    catch (err) {
      if (!String(err?.code || '').includes('SQLITE_CONSTRAINT')) throw err;
    }
  }
  if (!player) return res.status(500).json({ error: '编号分配失败，请重试' });

  broadcast('register');

  const row = stmts.playerById.get(player.id);
  res.json({ token: player.token, player: playerState(row), ...rankOf(player.id) });
});

/**
 * 换设备 / 清了缓存时找回护照：编号 + 4 位密码。
 * 这是选手端唯一需要「登录」的场景 —— 正常情况下令牌存在本地，打开就是自己的护照。
 */
const restoreFails = new Map(); // canon 编号 -> { count, until }

function restoreGate(key) {
  const rec = restoreFails.get(key);
  if (rec && rec.until > Date.now()) {
    return Math.ceil((rec.until - Date.now()) / 1000);
  }
  return 0;
}

function noteRestoreFail(key) {
  const rec = restoreFails.get(key) || { count: 0, until: 0 };
  rec.count++;
  // 连错 5 次锁 60 秒：4 位密码只有一万种，不限速就能被慢慢试出来
  if (rec.count >= 5) { rec.until = Date.now() + 60_000; rec.count = 0; }
  restoreFails.set(key, rec);
}

app.post('/api/restore', (req, res) => {
  const input = extractCode(req.body?.code);
  const pin = String(req.body?.pin ?? '').replace(/\D/g, '');
  if (!input) return res.status(400).json({ error: '请输入你的编号' });

  const key = canonCode(input);
  const wait = restoreGate(key);
  if (wait) return res.status(429).json({ error: `试错太多次了，请 ${wait} 秒后再试` });

  const player = stmts.playerByCode.get(input) || stmts.playersByCanon.all(key)[0];
  if (!player) {
    noteRestoreFail(key);
    return res.status(404).json({ error: `没有找到 ${input} 号选手` });
  }

  if (player.pin && player.pin !== pin) {
    noteRestoreFail(key);
    return res.status(403).json({ error: '密码不对。忘了的话请找 Reception 的同工查' });
  }

  restoreFails.delete(key);
  res.json({ token: player.token, player: playerState(player), ...rankOf(player.id) });
});

app.get('/api/me', playerAuth, (req, res) => {
  const fresh = stmts.playerById.get(req.player.id);
  res.json({ player: playerState(fresh), ...rankOf(fresh.id), settings: getSettings(), serverTs: Date.now() });
});

app.post('/api/me', playerAuth, (req, res) => {
  const p = stmts.playerById.get(req.player.id);
  const settings = getSettings();
  // 游戏开始后不允许再改名/改头像，避免排行榜上有人中途变身
  if (settings.gameState !== 'lobby') {
    return res.status(403).json({ error: '游戏已经开始，护照信息已锁定' });
  }
  const name = String(req.body?.name ?? p.name).trim().slice(0, 24) || p.name;
  const avatar = JSON.stringify(req.body?.avatar ?? safeJSON(p.avatar, {}));
  const contact = String(req.body?.contact ?? p.contact).trim().slice(0, 64);

  stmts.updatePlayerFields.run({
    id: p.id, name, avatar, contact, notes: p.notes,
    identity: p.identity, team_id: p.team_id, team_color: p.team_color,
    team_symbol: p.team_symbol, start_station: p.start_station,
    tokens_total: p.tokens_total, updated_at: Date.now(),
  });
  broadcast('profile');
  res.json({ player: playerState(stmts.playerById.get(p.id)) });
});

app.get('/api/leaderboard', (req, res) => {
  const settings = getSettings();
  if (!settings.leaderboardPublic && !req.get('authorization')) {
    return res.json({ board: [], hidden: true, serverTs: Date.now() });
  }
  const limit = Number(req.query.limit) || 0;
  res.json({ board: leaderboard({ limit }), hidden: false, gameState: settings.gameState, serverTs: Date.now() });
});

/* ---------------------------- 工作人员接口 ---------------------------- */

app.post('/api/staff/login', (req, res) => {
  const pin = String(req.body?.pin || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 24);
  const station = String(req.body?.station || '').trim();

  let role = null;
  if (pin && pin === adminPin()) role = 'admin';
  else if (pin && pin === staffPin()) role = 'staff';
  if (!role) return res.status(401).json({ error: 'PIN 不正确' });

  const token = signToken({ role, name, station, iat: Date.now() }, secret());
  res.json({ token, role, name, station });
});

/**
 * 一个接口同时完成「推本地队列」和「拉增量花名册」。
 * 弱网下每多一次往返就多一次失败机会，所以合并成一次。
 */
app.post('/api/staff/sync', staffAuth('staff'), (req, res) => {
  const settings = getSettings();
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  const results = [];

  for (const op of ops) {
    results.push(applyOp({ ...op, operator: op.operator || req.staff.name || '' }, settings));
  }
  if (ops.length) broadcast('sync');

  // 客户端纪元和服务端对不上（比如中间被重置过），一律回全量，
  // 否则它手里那些已经被删掉的人会永远留着
  const serverEpoch = epoch();
  const clientEpoch = Number(req.body?.epoch) || 0;
  const stale = clientEpoch !== serverEpoch;

  const since = stale ? 0 : Number(req.body?.since) || 0;
  const players = roster(since > 0 ? since - 1 : 0);

  res.json({
    results,
    players,
    full: since <= 0,
    epoch: serverEpoch,
    settings,
    serverTs: Date.now(),
  });
});

/** 扫到码之后拉这个人的完整档案（含历史） */
app.get('/api/staff/player/:code', staffAuth('staff'), (req, res) => {
  const input = extractCode(req.params.code);
  let player = stmts.playerByCode.get(input) || stmts.playerById.get(req.params.code);
  if (!player) {
    const matches = stmts.playersByCanon.all(canonCode(input));
    if (matches.length === 1) player = matches[0];
    else if (matches.length > 1) {
      return res.status(409).json({
        error: '有多个相近的护照码，请确认',
        candidates: matches.map((m) => ({ id: m.id, code: m.code, name: m.name })),
      });
    }
  }
  if (!player) return res.status(404).json({ error: `没有找到护照码 ${input}` });
  res.json({ player: playerState(player), ...rankOf(player.id), serverTs: Date.now() });
});

/* ------------------------------ 管理员接口 ------------------------------ */

app.post('/api/admin/draw', staffAuth('admin'), (req, res) => {
  // mode='fill' 只补分配还没有身份的人（陆续有人报名时用）；'all' 全部重新洗牌
  const mode = req.body?.mode === 'all' ? 'all' : 'fill';
  const result = drawIdentities({ ...(req.body?.ratios || {}), mode });
  broadcast('draw');
  // 把更新后的花名册一起带回去，管理端就不用再发一次同步请求了
  res.json({ ...result, players: roster(0), epoch: epoch(), serverTs: Date.now() });
});

/** 手动把勾选的几个人编成一队 */
app.post('/api/admin/team', staffAuth('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.playerIds) ? req.body.playerIds.slice(0, 12) : [];
  const result = assignTeam({
    playerIds: ids,
    identity: req.body?.identity || null,
    startStation: req.body?.startStation || null,
  });
  if (!result.ok) return res.status(400).json({ error: result.message });
  broadcast('team');
  res.json({ ...result, players: roster(0), epoch: epoch(), serverTs: Date.now() });
});

/**
 * 把勾选的人的密码统一重置成 RESET_PIN。
 * 忘了密码的人不该去重新注册（会多出一个空号、积分也对不上），
 * 而是找 Reception 重置一下，用原来的编号找回。
 */
app.post('/api/admin/reset-pin', staffAuth('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.playerIds) ? req.body.playerIds.slice(0, 400) : [];
  const now = Date.now();
  const done = [];
  const tx = db.transaction(() => {
    for (const id of ids) {
      const p = stmts.playerById.get(id);
      if (!p) continue;
      stmts.setPin.run(RESET_PIN, now, p.id);
      done.push({ id: p.id, code: p.code, name: p.name });
    }
  });
  tx();
  // 重置后清掉这些编号的失败计数，免得他刚被重置就因为之前试错被锁着
  for (const d of done) restoreFails.delete(canonCode(d.code));
  broadcast('pin');
  res.json({ ok: true, pin: RESET_PIN, players: done, epoch: epoch(), serverTs: Date.now() });
});

/** 把勾选的人退回「未分配」 */
app.post('/api/admin/unassign', staffAuth('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.playerIds) ? req.body.playerIds.slice(0, 400) : [];
  const result = clearIdentities(ids);
  broadcast('team');
  res.json({ ...result, players: roster(0), epoch: epoch(), serverTs: Date.now() });
});

app.post('/api/admin/settings', staffAuth('admin'), (req, res) => {
  const patch = req.body || {};
  const allowed = [
    'gameState', 'scoreTiers', 'maxStationScore', 'lifeEventThresholds',
    'helpTokens', 'registrationOpen', 'leaderboardPublic', 'showFullNames',
  ];
  for (const [k, v] of Object.entries(patch)) {
    if (allowed.includes(k)) setSetting(k, v);
  }
  // 一旦离开 lobby，选手端立刻进入只读：顺手把报名通道也关掉，
  // 不指望现场有人记得多点一下那个开关。
  if (patch.gameState && patch.gameState !== 'lobby') {
    setSetting('registrationOpen', false);
  }
  broadcast('settings');
  res.json({ settings: getSettings() });
});

app.post('/api/admin/player/:id', staffAuth('admin'), (req, res) => {
  const p = stmts.playerById.get(req.params.id);
  if (!p) return res.status(404).json({ error: '找不到该选手' });
  const b = req.body || {};
  stmts.updatePlayerFields.run({
    id: p.id,
    name: String(b.name ?? p.name).trim().slice(0, 24) || p.name,
    avatar: JSON.stringify(b.avatar ?? safeJSON(p.avatar, {})),
    contact: String(b.contact ?? p.contact).slice(0, 64),
    notes: String(b.notes ?? p.notes).slice(0, 500),
    identity: b.identity ?? p.identity,
    team_id: b.teamId ?? p.team_id,
    team_color: b.teamColor ?? p.team_color,
    team_symbol: b.teamSymbol ?? p.team_symbol,
    start_station: b.startStation ?? p.start_station,
    tokens_total: Number.isFinite(b.tokensTotal) ? b.tokensTotal : p.tokens_total,
    updated_at: Date.now(),
  });
  broadcast('player');
  res.json({ player: playerState(stmts.playerById.get(p.id)) });
});

app.post('/api/admin/award', staffAuth('admin'), (req, res) => {
  const { awardId, playerId, note } = req.body || {};
  if (!awardId) return res.status(400).json({ error: '缺少奖项' });
  if (playerId) stmts.setAward.run(awardId, playerId, String(note || ''), Date.now());
  else stmts.clearAward.run(awardId);
  broadcast('award');
  res.json({ awards: stmts.allAwards.all() });
});

app.get('/api/awards', (_req, res) => {
  const rows = stmts.allAwards.all();
  res.json({
    awards: rows.map((a) => {
      const p = a.player_id ? stmts.playerById.get(a.player_id) : null;
      return {
        awardId: a.award_id,
        note: a.note,
        player: p ? { id: p.id, name: p.name, code: p.code, avatar: safeJSON(p.avatar, {}) } : null,
      };
    }),
  });
});

app.get('/api/admin/export.csv', staffAuth('admin'), (_req, res) => {
  const board = leaderboard();
  const stationIds = STATIONS.map((s) => s.id);
  const header = [
    '排名', '编号', '密码', '姓名', '身份', '队伍', '总分', '完成关卡数',
    ...STATIONS.map((s) => s.name), 'Token 剩余', '盲盒次数', '联系方式', '备注',
  ];
  const lines = [header.map(csvEscape).join(',')];

  for (const row of board) {
    const p = stmts.playerById.get(row.id);
    const st = playerState(p);
    lines.push([
      row.rank, row.code, p.pin, row.name,
      IDENTITIES[row.identity]?.name || '', row.teamId || '',
      st.total, st.stationsDone,
      ...stationIds.map((id) => (st.stations[id] ? st.stations[id].points : '')),
      st.tokensLeft, st.lifeEventsTaken, p.contact, p.notes,
    ].map(csvEscape).join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mini-life-game.csv"');
  res.send('﻿' + lines.join('\n')); // BOM，Excel 打开中文不乱码
});

app.get('/api/admin/backup.json', staffAuth('admin'), (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="mlg-backup.json"');
  res.json(snapshot());
});

app.post('/api/admin/reset', staffAuth('admin'), (req, res) => {
  if (req.body?.confirm !== 'RESET') {
    return res.status(400).json({ error: '需要输入 RESET 确认' });
  }
  const backup = resetAll({ keepPlayers: !!req.body?.keepPlayers });
  // 找回护照的失败计数只存在内存里，重置时一并清掉 ——
  // 否则新一轮的 01 号会继承上一轮被锁的状态。
  restoreFails.clear();
  broadcast('reset');
  res.json({ ok: true, backup });
});

/* --------------------------- 前端静态资源 --------------------------- */

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, {
    setHeaders(res, filePath) {
      // 带 hash 的静态资源可以长缓存；HTML 和 SW 必须每次校验，否则更新推不下去
      if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.status(503).send('前端还没构建。请先在 web/ 目录运行 npm run build。')
  );
}

app.use((req, res) => res.status(404).json({ error: `未知接口 ${req.path}` }));

/* ------------------------------ 定时备份 ------------------------------ */

setInterval(() => {
  try { writeSnapshot(); } catch (err) { console.error('[backup]', err.message); }
}, 60_000).unref();

process.on('SIGTERM', () => { try { writeSnapshot(); } catch {} process.exit(0); });
process.on('SIGINT', () => { try { writeSnapshot(); } catch {} process.exit(0); });

server.listen(PORT, () => {
  const s = getSettings();
  console.log(`\n  🎲 Mini Life Game 人生护照系统`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → 状态：${s.gameState}｜已报名 ${stmts.countPlayers.get().n} 人`);
  const usingEnv = !!(process.env.STAFF_PIN && process.env.ADMIN_PIN);
  if (process.env.NODE_ENV === 'production' && !usingEnv) {
    // 生产环境没设 secret：PIN 是随机生成的，只能从这里看到
    console.log(`  ⚠️  没有设置 STAFF_PIN / ADMIN_PIN，已随机生成：`);
    console.log(`      工作人员端 PIN = ${staffPin()}`);
    console.log(`      管理员端  PIN = ${adminPin()}`);
    console.log(`      建议改成自己好记的：fly secrets set STAFF_PIN=… ADMIN_PIN=…\n`);
  } else if (staffPin() === '2026' || adminPin() === 'stm2026') {
    console.log(`  ⚠️  正在使用开发用默认 PIN，正式部署请设置 STAFF_PIN / ADMIN_PIN\n`);
  } else {
    console.log('');
  }
});
