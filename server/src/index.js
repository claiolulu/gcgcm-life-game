import express from 'express';
import compression from 'compression';
import cors from 'cors';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketServer } from 'socket.io';

import {
  GAME, RESET_PIN, ACTIVITIES, THEME_PRESETS, VISA_ROW_SOURCES,
} from './config.js';
import {
  db, stmts, getSettings, setSetting, secret, epoch, staffPin, adminPin,
  writeSnapshot, resetAll, snapshot,
  getActivities, setActivities, getTheme, UPLOAD_DIR,
  getVisaTemplate,
} from './db.js';
import {
  playerState, roster, leaderboard, rankOf, applyOp,
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
// 上传活动配图那一条要走大 body，其余接口卡在 512kb ——
// 一个开放的 4mb 入口够别人拿来灌满磁盘了
const jsonSmall = express.json({ limit: '512kb' });
const jsonImage = express.json({ limit: '4mb' });
app.use((req, res, next) => (
  req.path === '/api/admin/upload' ? jsonImage : jsonSmall
)(req, res, next));

// 上传的图。放在 API 之前 —— 静态文件不该走那些鉴权中间件
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',              // 文件名是内容哈希，改图就是换名字，可以放心长缓存
  immutable: true,
  fallthrough: false,         // 找不到就 404，不要落到 SPA 的 index.html 上
}));

/* ------------------------------ 实时广播 ------------------------------ */
// 只广播一个"有变化"的信号，不推数据 —— payload 极小，客户端各自按需拉增量。
// 弱网下这比推全量安全得多。
let broadcastTimer = null;
let broadcastReason = 'update';
function broadcast(reason = 'update') {
  // 400ms 内的多次广播合并成一次，但原因不能随便丢：
  // config / settings 是客户端要据此重新拉配置的信号，被一条普通的
  // update 盖掉的话，改了模版或活动清单，已经开着页面的人就收不到。
  if (reason === 'config' || reason === 'settings') broadcastReason = reason;
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    const r = broadcastReason;
    broadcastTimer = null;
    broadcastReason = 'update';
    io.emit('tick', { ts: Date.now(), reason: r });
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
    activities: getActivities(),
    resetPin: RESET_PIN,
    theme: getTheme(),
    themePresets: THEME_PRESETS,
    visaTemplate: getVisaTemplate(),
    visaSources: VISA_ROW_SOURCES,
    settings: getSettings(),
    serverTs: Date.now(),
  });
});

app.post('/api/register', (req, res) => {
  const settings = getSettings();
  // 报名只看「开放报名」这一个开关，不再额外卡游戏阶段。
  //
  // 原来是「非 lobby 一律拒绝」，但现场真实需求是：开场之后陆续还有人来，
  // 同工手动把开关打开就该能报名 —— 状态切走时开关会自动关掉（见
  // /api/admin/settings），所以默认仍然是关的，打开是一次明确的决定。
  //
  // 改名换头像仍然只限 lobby（见 POST /api/me）：那会影响排行榜上的
  // 显示，中途变身不合适。报名是新增一个人，没有这个问题。
  if (!settings.registrationOpen) {
    return res.status(403).json({
      error: settings.gameState === 'lobby'
        ? '报名通道已关闭，请找 Reception 的同工'
        : '游戏已经开始。想让人中途加入，请同工在总控台打开「开放报名」',
    });
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
  // 护照资料页印的姓 / 名，选填。两个都留空就交给前端按 name 猜。
  const surname = String(req.body?.surname || '').trim().slice(0, 24);
  const given = String(req.body?.given || '').trim().slice(0, 24);

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
      surname,
      given,
      avatar,
      contact,
      tokens_total: 0,   // Help Token 跟着恩典站一起去掉了，列还在（老数据用）
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

  // 已经开赛还在报名（同工手动开了通道），立刻按当前各关的排队情况
  // 给他排一条路线，从最空的那一关切入。赛前不排 —— 等宣布开始时统一排。

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

// 查编号的限流：按 IP 计，一分钟 20 次。防的是有人拿它当花名册批量导出。
const lookupHits = new Map();

function lookupGate(ip) {
  const now = Date.now();
  const rec = lookupHits.get(ip) || { n: 0, reset: now + 60_000 };
  if (now > rec.reset) { rec.n = 0; rec.reset = now + 60_000; }
  rec.n++;
  lookupHits.set(ip, rec);
  return rec.n > 20;
}

/**
 * 忘了编号：用名字找。
 *
 * 只回编号和姓名 —— 这两样排行榜上本来就是公开的，所以这个接口
 * 不比现状多暴露任何东西。密码绝不回，找到编号之后照样要输密码。
 *
 * 要求至少 2 个字符、最多回 6 条：不给「空查询把全场名单拖走」的机会。
 */
app.post('/api/lookup', (req, res) => {
  if (lookupGate(req.ip)) {
    return res.status(429).json({ error: '查得太频繁了，歇一会儿再试' });
  }
  const q = String(req.body?.q ?? '').trim().slice(0, 24);
  if (q.length < 2) return res.json({ matches: [] });

  const digits = q.replace(/\D/g, '');
  const lower = q.toLowerCase();
  const matches = stmts.allPlayers.all()
    .filter((p) => {
      if (digits && (p.code === digits || canonCode(p.code) === canonCode(digits))) return true;
      return String(p.name || '').toLowerCase().includes(lower);
    })
    .slice(0, 6)
    .map((p) => ({ code: p.code, name: p.name }));

  res.json({ matches });
});

/**
 * 用原密码改成一个好记的。
 *
 * 不需要先登录 —— 知道原密码本身就是身份证明，而且忘了密码的人
 * 本来就登不进去。改完直接把 token 一起返回，省得再输一遍。
 *
 * 和找回护照共用同一个防爆破计数：4 位密码只有一万种，
 * 这个接口同样能拿来试密码，不限速等于开后门。
 */
app.post('/api/pin', (req, res) => {
  const input = extractCode(req.body?.code);
  const pin = String(req.body?.pin ?? '').replace(/\D/g, '');
  const next = String(req.body?.newPin ?? '').replace(/\D/g, '');
  if (!input) return res.status(400).json({ error: '请输入你的编号' });
  if (!isValidPin(next)) return res.status(400).json({ error: '新密码要是 4 位数字' });

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
    return res.status(403).json({ error: '原密码不对' });
  }

  stmts.setPin.run(next, Date.now(), player.id);
  restoreFails.delete(key);
  const fresh = stmts.playerById.get(player.id);
  res.json({ token: fresh.token, player: playerState(fresh), ...rankOf(fresh.id) });
});

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

/**
 * 改自己那本护照的配色。
 *
 * 原来这是总控台上的一个全局设置，全场一个样子。搬到每个人自己身上之后
 * 它就是「我的护照长什么样」—— 一本用一年的册子，本来就该允许各人不同。
 *
 * 校验照旧卡死：这些值会变成 CSS 变量，放任意字符串进去等于把一个样式
 * 注入口开在护照上。传 null 表示恢复默认。
 */
app.post('/api/me/theme', playerAuth, (req, res) => {
  const b = req.body?.theme;
  if (b === null) {
    stmts.setTheme_.run('', Date.now(), req.player.id);
    return res.json({ theme: null });
  }
  if (!b || typeof b !== 'object') return res.status(400).json({ error: '格式不对' });

  const t = {};
  for (const k of ['ink', 'gold', 'paper', 'text', 'stamp']) {
    if (b[k] === undefined) continue;
    if (!HEX.test(String(b[k]))) return res.status(400).json({ error: `${k} 要是 #rrggbb 格式的颜色` });
    t[k] = String(b[k]).toLowerCase();
  }
  if (b.watermark !== undefined) {
    const n = Number(b.watermark);
    if (!Number.isFinite(n) || n < 0 || n > 0.3) {
      return res.status(400).json({ error: '水印浓度要在 0 到 0.3 之间' });
    }
    t.watermark = Math.round(n * 100) / 100;
  }
  if (b.preset !== undefined) t.preset = String(b.preset).slice(0, 20);
  if (!Object.keys(t).length) return res.status(400).json({ error: '没有可改的字段' });

  stmts.setTheme_.run(JSON.stringify(t), Date.now(), req.player.id);
  res.json({ theme: t });
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

  // 护照上的姓/名。报名时填错了总得能自己改，不然只能找同工。
  // 没传就保持原样（前端只在编辑弹层里传）。
  if (req.body?.surname !== undefined || req.body?.given !== undefined) {
    stmts.setNameParts.run(
      String(req.body?.surname ?? p.surname).trim().slice(0, 24),
      String(req.body?.given ?? p.given).trim().slice(0, 24),
      Date.now(), p.id,
    );
  }

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
    return res.json({ board: [], teams: [], hidden: true, serverTs: Date.now() });
  }
  const limit = Number(req.query.limit) || 0;
  // 组队榜搭同一个响应，不额外发请求 —— 排行榜每 20 秒就要拉一次
  res.json({
    board: leaderboard({ limit }),
    hidden: false,
    gameState: settings.gameState,
    serverTs: Date.now(),
  });
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


/**
 * 改活动清单。总控台整份替换，不做增量 —— 排序、删除、改字段
 * 都是同一个动作，前端拿着完整列表回传最简单。
 *
 * id 是历史数据的锚：盖过的章存在 events.station_id 里。改 id 等于
 * 让那些章失去归属，所以新建时自动生成、之后不允许改（前端也不给改）。
 */
app.post('/api/admin/activities', staffAuth('admin'), (req, res) => {
  const raw = Array.isArray(req.body?.activities) ? req.body.activities : null;
  if (!raw) return res.status(400).json({ error: '格式不对，要一个数组' });
  if (raw.length > 60) return res.status(400).json({ error: '活动太多了（上限 60）' });

  const seen = new Set();
  const clean = [];
  for (const a of raw) {
    const id = String(a?.id || '').trim().slice(0, 40);
    // id 只允许安全字符：它会进 URL 和数据库，也是历史章的锚
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: `活动 id「${id}」不合法，只能用字母数字和 - _` });
    }
    if (seen.has(id)) return res.status(400).json({ error: `活动 id「${id}」重复了` });
    seen.add(id);

    const name = String(a?.name || '').trim().slice(0, 20);
    if (!name) return res.status(400).json({ error: '每个活动都要有名字' });

    let links, blocks;
    try {
      links = cleanLinks(a?.links, `「${name}」`);
      blocks = cleanBlocks(a?.blocks, `「${name}」`);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    clean.push({
      id, name,
      order: clean.length + 1,
      icon: String(a?.icon || '📍').trim().slice(0, 4),
      en: String(a?.en || '').trim().slice(0, 40),
      date: String(a?.date || '').trim().slice(0, 20),
      tag: String(a?.tag || '').trim().slice(0, 12),
      host: String(a?.host || '').trim().slice(0, 20),
      // 签发机构。留空就用护照模版上的那个（整本护照的签发方）
      issuer: String(a?.issuer || '').trim().slice(0, 24),
      desc: String(a?.desc || '').trim().slice(0, 200),
      landmarkKey: String(a?.landmarkKey || '').trim().slice(0, 40),
      photo: safePhoto(a?.photo),
      links: links || [],
      state: ['upcoming', 'live', 'done'].includes(a?.state) ? a.state : 'upcoming',
      // 空数组是有意义的：那是「这一页我要留白」，不是「没设计过」
      ...(blocks !== undefined ? { blocks } : {}),
    });
  }

  const live = clean.filter((a) => a.state === 'live');
  if (live.length > 1) {
    return res.status(400).json({
      error: `同时只能有一场「进行中」，现在有 ${live.length} 场（${live.map((a) => a.name).join('、')}）`,
    });
  }

  setActivities(clean);

  /**
   * 全局的 gameState 从此由活动状态推出来，不再单独设置。
   *
   * 它还在被几处用着：护照信息锁定（活动期间锁住，两场之间可以改名）、
   * 报名时要不要排路线。留着这层映射，那些地方就不用跟着改。
   */
  const nextState = live.length ? 'running' : 'lobby';
  if (getSettings().gameState !== nextState) setSetting('gameState', nextState);

  broadcast('config');
  res.json({ activities: clean, gameState: nextState });
});

/**
 * 配图地址只收两种：本机上传的 /uploads/xxx，或者一个 https 外链。
 *
 * 不能直收任意字符串 —— 这个值会变成签证页上的 background-image，
 * 塞个 javascript: 或 data: 进去就是一条 XSS。
 */
function safePhoto(v) {
  const s = String(v || '').trim().slice(0, 300);
  if (!s) return '';
  if (/^\/uploads\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
  return '';
}

const SRC_KEYS = new Set(VISA_ROW_SOURCES.map((x) => x.key));

/**
 * 签证页的栏目表。
 *
 * 只有 src === 'text' 的那一栏能带同工填的内容；其余都是绑定值，
 * 内容由服务端按人算。把 text 也一起收下反而更省事 —— 存着无害，
 * 同工把一栏从「固定文字」改成「活动日期」再改回来，原来打的字还在。
 */
function cleanRows(raw, where) {
  if (!Array.isArray(raw)) throw new Error(`${where}的栏目要是一个数组`);
  if (raw.length > 20) throw new Error(`${where}最多 20 栏`);
  const seen = new Set();
  return raw.map((r, i) => {
    const src = String(r?.src || 'text');
    if (!SRC_KEYS.has(src)) throw new Error(`${where}第 ${i + 1} 栏的数据来源「${src}」不认识`);
    const label = String(r?.label || '').replace(/[\r\n]/g, ' ').trim().slice(0, 40);
    if (!label) throw new Error(`${where}第 ${i + 1} 栏没有标题`);
    // key 只用来做 React 的 key 和去重，不进历史数据，撞了就补一个后缀
    let key = String(r?.key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || `r${i + 1}`;
    while (seen.has(key)) key += '_';
    seen.add(key);
    return {
      key, label, src,
      text: String(r?.text || '').replace(/[\r\n]/g, ' ').trim().slice(0, 40),
      accent: !!r?.accent,
    };
  });
}

/**
 * 页面上那几个可跳转的小图标。
 *
 * 只收 http(s)：这个值会变成 <a href>，收 javascript: 就是一条 XSS，
 * 而 mailto:/tel: 这类在护照页上也没有用武之地。
 */
function cleanLinks(raw, where) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${where}的链接要是一个数组`);
  if (raw.length > 6) throw new Error(`${where}最多放 6 个链接`);
  const out = [];
  for (const l of raw) {
    const url = String(l?.url || '').trim().slice(0, 300);
    if (!url) continue;                      // 只填了名字没填地址：当没加
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
      throw new Error(`链接地址「${url.slice(0, 40)}」不合法，要以 http:// 或 https:// 开头`);
    }
    out.push({
      icon: String(l?.icon || '🔗').trim().slice(0, 4) || '🔗',
      label: String(l?.label || '').replace(/[\r\n]/g, ' ').trim().slice(0, 12),
      url,
    });
  }
  return out;
}

/* ------------------------- 块的取值工具 ------------------------- */

const CANVAS_FONTS = new Set(['serif', 'mono', 'sans']);
const CANVAS_ALIGN = new Set(['left', 'center', 'right']);
const CANVAS_FIT = new Set(['cover', 'contain']);

/** 数值夹回区间；不是数就用兜底值。坐标、字号、透明度都走它 */
function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

const BLOCK_KINDS = new Set([
  'banner', 'fields', 'station', 'note', 'photo', 'links', 'mrz', 'text', 'image',
]);

function cleanBlocks(raw, where) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${where}的版式要是一个数组`);
  if (raw.length > 40) throw new Error(`${where}最多放 40 个块`);

  const seen = new Set();
  return raw.map((b, i) => {
    const kind = BLOCK_KINDS.has(b?.kind) ? b.kind : 'text';
    let id = String(b?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || `b${i + 1}`;
    while (seen.has(id)) id += '_';
    seen.add(id);

    const base = {
      id, kind,
      x: num(b?.x, -20, 120, 10),
      y: num(b?.y, -20, 120, 10),
      w: num(b?.w, 1, 140, 30),
      h: num(b?.h, 1, 140, 10),
      rot: num(b?.rot, -180, 180, 0),
      opacity: num(b?.opacity, 0.05, 1, 1),
      // 链接不合法就当没挂，不是整份拒掉 —— 同工打到一半就保存是常事
      href: /^https?:\/\/[^\s"'<>]+$/i.test(String(b?.href || '')) ? String(b.href).slice(0, 300) : '',
    };

    const str = (v, max) => String(v ?? '').replace(/[\r\n]/g, ' ').trim().slice(0, max);

    switch (kind) {
      case 'banner':
        return { ...base, word: str(b?.word, 16), brand: str(b?.brand, 24), brandCn: str(b?.brandCn, 16) };
      case 'fields':
        return { ...base, cols: Math.min(4, Math.max(1, Math.round(Number(b?.cols) || 2))),
                 rows: cleanRows(b?.rows || [], where) };
      case 'station':
      case 'note':
        return { ...base, label: str(b?.label, 30) };
      case 'photo':
        return { ...base, fit: CANVAS_FIT.has(b?.fit) ? b.fit : 'cover' };
      case 'links':
      case 'mrz':
        return base;
      case 'image':
        return { ...base, src: safePhoto(b?.src),
                 fit: CANVAS_FIT.has(b?.fit) ? b.fit : 'cover', radius: num(b?.radius, 0, 50, 0) };
      default:
        return {
          ...base, kind: 'text',
          text: String(b?.text ?? '').slice(0, 400),
          size: num(b?.size, 1, 24, 4),
          color: HEX.test(String(b?.color)) ? String(b.color).toLowerCase() : '',
          font: CANVAS_FONTS.has(b?.font) ? b.font : 'sans',
          align: CANVAS_ALIGN.has(b?.align) ? b.align : 'left',
          bold: !!b?.bold,
          lh: num(b?.lh, 0.9, 3, 1.5),
        };
    }
  });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * 上传一张活动配图。
 *
 * 收 data URL 而不是 multipart：前端本来就要在 canvas 里压缩一遍
 * （手机直出的照片有四五兆，原样传上来护照页要加载好几秒），
 * 压完手里拿到的就是 data URL，再包成 multipart 只是白绕一圈。
 *
 * 文件名用内容哈希：同一张图传几次都只存一份，也不用管重名。
 */
app.post('/api/admin/upload', staffAuth('admin'), (req, res) => {
  const raw = String(req.body?.data || '');
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!m) return res.status(400).json({ error: '只收 jpeg / png / webp 图片' });

  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch { return res.status(400).json({ error: '图片数据坏了' }); }
  if (buf.length < 64) return res.status(400).json({ error: '图片数据坏了' });
  if (buf.length > 2_000_000) return res.status(413).json({ error: '图片太大了（压缩后上限 2MB）' });

  // 认头几个字节，不认它自己声明的类型 —— 声明是客户端说了算的
  const ext =
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'jpg'
    : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png'
    : buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp'
    : null;
  if (!ext) return res.status(400).json({ error: '这不是一张图片' });

  const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16) + '.' + ext;
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buf);

  res.json({ url: `/uploads/${name}`, bytes: buf.length });
});

/* ------------------------------ 活动报名 ------------------------------ */

/**
 * 一场活动的公开信息。扫二维码进来的人先看到这个。
 *
 * 不需要登录，所以只给能贴在海报上的东西 —— 名字、日期、说明、配图、
 * 报了多少人。谁报的不在这里，那是同工才看得到的。
 */
app.get('/api/activity/:id', (req, res) => {
  const a = getActivities().find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: '找不到这场活动' });
  const counts = new Map(stmts.signupCounts.all().map((r) => [r.activity_id, r.n]));
  res.json({
    activity: {
      id: a.id, icon: a.icon, name: a.name, en: a.en, date: a.date,
      tag: a.tag, host: a.host, desc: a.desc, photo: a.photo || '',
      links: a.links || [], state: a.state || 'upcoming',
    },
    signupCount: counts.get(a.id) || 0,
    registrationOpen: !!getSettings().registrationOpen,
  });
});

/** 报名。已经报过就当没事发生 —— 主键就是 (活动, 人)，天然幂等。 */
app.post('/api/activity/:id/signup', playerAuth, (req, res) => {
  const a = getActivities().find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: '找不到这场活动' });
  stmts.addSignup.run(a.id, req.player.id, Date.now());
  broadcast('signup');
  res.json({ ok: true, signedUp: true });
});

/** 取消报名。人会变卦，别让他只能来找同工改。 */
app.delete('/api/activity/:id/signup', playerAuth, (req, res) => {
  stmts.dropSignup.run(req.params.id, req.player.id);
  broadcast('signup');
  res.json({ ok: true, signedUp: false });
});

/** 各场活动报了多少人。总控台的清单上一行一个数字，不用逐个去问。 */
app.get('/api/admin/signups', staffAuth('admin'), (_req, res) => {
  const counts = {};
  for (const r of stmts.signupCounts.all()) counts[r.activity_id] = r.n;
  res.json({ counts });
});

/** 谁报了名。同工才看得到 —— 这是一份带联系方式的名单。 */
app.get('/api/admin/activity/:id/signups', staffAuth('admin'), (req, res) => {
  const rows = stmts.signupsFor.all(req.params.id);
  res.json({
    signups: rows.map((r) => ({
      id: r.player_id, name: r.name, code: r.code,
      avatar: safeJSON(r.avatar, {}), contact: r.contact || '', at: r.created_at,
    })),
  });
});

app.post('/api/admin/settings', staffAuth('admin'), (req, res) => {
  const patch = req.body || {};
  // 记分档位、盲盒红线、Help Token 这几项跟着迎新游戏一起去掉了
  const allowed = ['gameState', 'registrationOpen', 'leaderboardPublic', 'showFullNames'];
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



app.get('/api/admin/export.csv', staffAuth('admin'), (_req, res) => {
  const board = leaderboard();
  // 一场活动一列，打了勾的写盖章日期 —— 比写个分数有用，
  // 打卡本里每一场的分都是 1
  const acts = getActivities();
  const header = [
    '排名', '编号', '密码', '姓名', '参加过几场',
    ...acts.map((a) => a.name), '联系方式', '备注',
  ];
  const lines = [header.map(csvEscape).join(',')];

  const day = (ts) => new Date(ts).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

  for (const row of board) {
    const p = stmts.playerById.get(row.id);
    const st = playerState(p);
    lines.push([
      row.rank, row.code, p.pin, row.name, st.stationsDone,
      ...acts.map((a) => (st.stations[a.id] ? day(st.stations[a.id].at) : '')),
      p.contact, p.notes,
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
