import { db, stmts, getSettings, setSetting } from './db.js';
import {
  STATIONS, ALL_STATION_IDS, LIFE_EVENT_CARDS, GROUP_COLORS, GROUP_SYMBOLS,
  IDENTITIES, GRACE_OPTIONS,
} from './config.js';
import { safeJSON, shuffle, clamp, uid } from './util.js';

const CARD_BY_ID = new Map(LIFE_EVENT_CARDS.map((c) => [c.id, c]));
const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

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
  let lifeEventsTaken = 0;
  let tokensUsed = 0;

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
    if (e.kind === 'life_event') lifeEventsTaken++;
    if (e.kind === 'grace') tokensUsed++;
  }

  const thresholds = settings.lifeEventThresholds || [];
  const crossed = thresholds.filter((t) => total >= t).length;
  const pendingLifeEvents = Math.max(0, crossed - lifeEventsTaken);
  const nextThreshold = thresholds.find((t) => total < t) ?? null;

  // 队友：同一个 team_id 的其他人。选手要靠这个在场内把人找出来，
  // 光有颜色符号还不够 —— 50 个陌生人里按符号找太费劲。
  const teammates = player.team_id
    ? stmts.playersByTeam.all(player.team_id)
        .filter((m) => m.id !== player.id)
        .map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          avatar: safeJSON(m.avatar, {}),
        }))
    : [];

  return {
    id: player.id,
    code: player.code,
    // 4 位找回密码。选手看自己的，Reception 也要能查到帮人找回。
    // 排行榜另建对象，不会带出去。
    pin: player.pin || '',
    name: player.name,
    avatar: safeJSON(player.avatar, {}),
    contact: player.contact,
    identity: player.identity,
    teamId: player.team_id,
    teamColor: player.team_color,
    teamSymbol: player.team_symbol,
    startStation: player.start_station,
    teammates,
    notes: player.notes,
    modifiers: safeJSON(player.modifiers, []),
    total,
    stations,
    stationsDone: Object.keys(stations).length,
    stationsTotal: ALL_STATION_IDS.length,
    lifeEventsTaken,
    pendingLifeEvents,
    nextThreshold,
    tokensTotal: player.tokens_total,
    tokensUsed,
    tokensLeft: Math.max(0, player.tokens_total - tokensUsed),
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
    cardId: e.card_id,
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
      identity: s.identity,
      teamId: s.teamId,
      teamColor: s.teamColor,
      teamSymbol: s.teamSymbol,
      total: s.total,
      stationsDone: s.stationsDone,
      tokensLeft: s.tokensLeft,
      lifeEventsTaken: s.lifeEventsTaken,
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
    card_id: null,
    points: 0,
    label: '',
    note: op.note || '',
    operator: op.operator || '',
    meta: '{}',
    client_ts: op.clientTs || now,
    created_at: now,
  };
}

function consumeModifiers(player, kinds) {
  const mods = safeJSON(player.modifiers, []);
  const consumed = [];
  const kept = [];
  for (const m of mods) {
    if (kinds.includes(m.modifier)) consumed.push(m);
    else kept.push(m);
  }
  if (consumed.length) {
    stmts.setModifiers.run(JSON.stringify(kept), Date.now(), player.id);
  }
  return consumed;
}

function pushModifier(player, mod) {
  const mods = safeJSON(player.modifiers, []);
  mods.push({ id: uid(), ...mod, at: Date.now() });
  stmts.setModifiers.run(JSON.stringify(mods), Date.now(), player.id);
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
      const station = STATION_BY_ID.get(op.stationId);
      if (!station) return { status: 'error', message: '未知关卡' };

      const already = stmts.stationEvent.get(player.id, op.stationId);
      if (already) {
        return {
          status: 'conflict',
          event: shapeEvent(already),
          message: `${station.name} 已由 ${already.operator || '其他工作人员'} 记过分（${already.points} 分），每站只有一次机会`,
        };
      }

      const raw = clamp(Math.round(Number(op.points) || 0), -20, settings.maxStationScore);
      const consumed = consumeModifiers(player, ['cap_next', 'must_invite_stranger', 'swap_queue']);
      const cap = consumed.find((m) => m.modifier === 'cap_next');
      const points = cap ? Math.min(raw, cap.value ?? 1) : raw;

      const row = baseEvent(op);
      row.kind = 'station';
      row.station_id = op.stationId;
      row.points = points;
      row.label = station.name;
      row.meta = JSON.stringify({ raw, cappedBy: cap ? cap.label || cap.cardId : null, consumed });

      if (!insertEvent(row)) return { status: 'duplicate', message: '该操作已记录' };
      return {
        status: 'ok',
        event: shapeEvent({ ...row, meta: row.meta }),
        message: cap && points < raw ? `因「${cap.label}」上限 ${cap.value} 分，实得 ${points} 分` : null,
      };
    }

    case 'life_event': {
      const card = CARD_BY_ID.get(op.cardId);
      if (!card) return { status: 'error', message: '未知盲盒卡牌' };

      // 关键：倍率类效果在服务端用"服务端当前总分"结算成一个加减法增量，
      // 这样事件流始终是纯加法，多设备乱序同步依然收敛。
      const base = totalFor(player.id);
      let points = 0;
      let resolved = { ...card.effect };

      if (card.effect.type === 'add') {
        points = card.effect.points;
      } else if (card.effect.type === 'multiply') {
        if (base > 0) {
          const factor = card.effect.factor;
          const next = factor < 1 ? Math.floor(base * factor) : Math.round(base * factor);
          points = next - base;
        }
        resolved.base = base;
      } else if (card.effect.type === 'modifier') {
        pushModifier(player, {
          modifier: card.effect.modifier,
          value: card.effect.value ?? null,
          cardId: card.id,
          label: card.title,
          text: card.effectText,
        });
      } else if (card.effect.type === 'swap_queue') {
        pushModifier(player, {
          modifier: 'swap_queue',
          cardId: card.id,
          label: card.title,
          text: card.effectText,
        });
      }

      const row = baseEvent(op);
      row.kind = 'life_event';
      row.card_id = card.id;
      row.points = points;
      row.label = card.title;
      row.meta = JSON.stringify({ kind: card.kind, effect: resolved, effectText: card.effectText, base });

      if (!insertEvent(row)) return { status: 'duplicate', message: '该操作已记录' };
      return { status: 'ok', event: shapeEvent(row), card };
    }

    case 'grace': {
      const state = playerState(player, settings);
      if (state.tokensLeft <= 0 && !op.force) {
        return { status: 'conflict', message: 'Help Token 已经用完了' };
      }
      const option = GRACE_OPTIONS.find((g) => g.id === op.option) || GRACE_OPTIONS[0];
      const row = baseEvent(op);
      row.kind = 'grace';
      row.label = option.name;
      row.points = Math.round(Number(op.points) || 0);
      row.meta = JSON.stringify({ option: option.id });

      if (!insertEvent(row)) return { status: 'duplicate', message: '该操作已记录' };
      return { status: 'ok', event: shapeEvent(row), option };
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

    case 'clear_modifiers': {
      stmts.setModifiers.run('[]', Date.now(), player.id);
      return { status: 'ok', message: '已清除状态效果' };
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
export function drawIdentities({ solo = 0.30, duo = 0.36, trio = 0.34, mode = 'fill' } = {}) {
  const everyone = stmts.allPlayers.all();
  const pool = mode === 'all' ? everyone : everyone.filter((p) => !p.identity);
  const players = shuffle(pool);
  const n = players.length;
  if (n === 0) return { assigned: 0, groups: [], counts: { solo: 0, duo: 0, trio: 0 }, mode };

  let trioCount = Math.max(0, Math.floor((n * trio) / 3));
  let duoCount = Math.max(0, Math.floor((n * duo) / 2));
  let soloCount = n - trioCount * 3 - duoCount * 2;

  // 余数收敛：优先用 solo 兜底，solo 为负就拆队
  while (soloCount < 0 && duoCount > 0) { duoCount--; soloCount += 2; }
  while (soloCount < 0 && trioCount > 0) { trioCount--; soloCount += 3; }
  // 剩下 2 个人时凑成一个 duo，比两个孤零零的 solo 更符合破冰意图
  while (soloCount >= 2 && duoCount + trioCount === 0 && n > 2) { duoCount++; soloCount -= 2; }

  const groups = [];
  let i = 0;
  for (let k = 0; k < trioCount; k++) groups.push({ identity: 'trio', members: players.slice(i, (i += 3)) });
  for (let k = 0; k < duoCount; k++) groups.push({ identity: 'duo', members: players.slice(i, (i += 2)) });
  for (let k = 0; k < soloCount; k++) groups.push({ identity: 'solo', members: players.slice(i, (i += 1)) });

  const shuffled = shuffle(groups);
  const now = Date.now();
  const settings = getSettings();

  // fill 模式下要避开已在使用的色号组合，否则新人会和场上已有的队伍撞色
  const taken = new Set(
    everyone.filter((p) => p.team_color && p.team_symbol).map((p) => `${p.team_color}|${p.team_symbol}`)
  );
  const combos = [];
  for (let si = 0; si < GROUP_SYMBOLS.length; si++) {
    for (let ci = 0; ci < GROUP_COLORS.length; ci++) {
      const c = GROUP_COLORS[ci], sym = GROUP_SYMBOLS[si];
      if (!taken.has(`${c.key}|${sym}`)) combos.push({ color: c, symbol: sym });
    }
  }
  const usedIds = new Set(everyone.map((p) => p.team_id).filter(Boolean));
  let nextTeamNum = 1;
  const newTeamId = () => {
    let id;
    do { id = `G${String(nextTeamNum++).padStart(2, '0')}`; } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };

  const tx = db.transaction(() => {
    shuffled.forEach((g, idx) => {
      const combo = combos[idx % combos.length] || { color: GROUP_COLORS[0], symbol: GROUP_SYMBOLS[0] };
      const color = combo.color;
      const symbol = combo.symbol;
      const startStation = STATIONS[idx % STATIONS.length].id;
      const teamId = g.identity === 'solo' ? null : newTeamId();
      g.teamId = teamId;
      g.color = color.key;
      g.symbol = symbol;
      g.startStation = startStation;

      for (const p of g.members) {
        stmts.updatePlayerFields.run({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          contact: p.contact,
          notes: p.notes,
          identity: g.identity,
          team_id: teamId,
          team_color: color.key,
          team_symbol: symbol,
          start_station: startStation,
          tokens_total: settings.helpTokens ?? p.tokens_total,
          updated_at: now,
        });
      }
    });
    setSetting('identitiesDrawnAt', now);
  });
  tx();

  return {
    mode,
    assigned: n,
    skipped: everyone.length - n,
    counts: { solo: soloCount, duo: duoCount, trio: trioCount },
    groups: shuffled.map((g) => ({
      teamId: g.teamId,
      identity: g.identity,
      color: g.color,
      symbol: g.symbol,
      startStation: g.startStation,
      members: g.members.map((m) => ({ id: m.id, code: m.code, name: m.name })),
    })),
  };
}



/**
 * 有人被抽走之后，把旧队伍剩下的人降级到与人数相符的身份。
 *
 * 三人队被抽走一个 → 剩下两人自动变 Duo；两人队被抽走一个 → 剩下一人变 Solo。
 * 不做这件事的话，场上会留下「只有两个人的 Trio」，而 Trio 的评分要求是
 * 三个人各答一题，工作人员当场没法判。
 *
 * 降成 Solo 的人不再属于任何队伍，但保留原来的颜色符号 —— 跟随机抽签时
 * Solo 的处理保持一致。
 */
function rebalanceTeam(teamId, settings = getSettings()) {
  if (!teamId) return null;
  const rest = stmts.playersByTeam.all(teamId);
  if (rest.length === 0) return null;

  const kind = rest.length >= 3 ? 'trio' : rest.length === 2 ? 'duo' : 'solo';
  const now = Date.now();
  for (const m of rest) {
    if (m.identity === kind && (kind !== 'solo' || !m.team_id)) continue;
    stmts.updatePlayerFields.run({
      id: m.id, name: m.name, avatar: m.avatar, contact: m.contact, notes: m.notes,
      identity: kind,
      team_id: kind === 'solo' ? null : teamId,
      team_color: m.team_color,
      team_symbol: m.team_symbol,
      start_station: m.start_station,
      tokens_total: settings.helpTokens ?? m.tokens_total,
      updated_at: now,
    });
  }
  return { teamId, remaining: rest.length, identity: kind,
           members: rest.map((m) => ({ id: m.id, code: m.code, name: m.name })) };
}

/**
 * 手动把一批选手编成一队（管理员在总控台勾选后调用）。
 * 身份由人数决定：1 人 Solo、2 人 Duo、3 人及以上 Trio，
 * 也可以用 identity 参数强制指定。
 */
export function assignTeam({ playerIds = [], identity = null, startStation = null } = {}) {
  const players = playerIds.map((id) => stmts.playerById.get(id)).filter(Boolean);
  if (players.length === 0) return { ok: false, message: '没有选中任何人' };

  const kind = identity || (players.length === 1 ? 'solo' : players.length === 2 ? 'duo' : 'trio');
  if (!IDENTITIES[kind]) return { ok: false, message: `未知身份：${kind}` };

  // 身份和人数必须对得上：Duo 就是两个人，Trio 就是三个人。
  // 不校验的话会出现「两个人的 Trio」，而 Trio 的评分要求是三个人各答一题，直接玩不了。
  const NEED = { solo: 1, duo: 2, trio: 3 };
  if (players.length !== NEED[kind]) {
    return {
      ok: false,
      message: `${kind.toUpperCase()} 需要 ${NEED[kind]} 人，现在选了 ${players.length} 人`,
    };
  }

  const everyone = stmts.allPlayers.all();
  const chosen = new Set(playerIds);
  const taken = new Set(
    everyone.filter((p) => !chosen.has(p.id) && p.team_color && p.team_symbol)
      .map((p) => `${p.team_color}|${p.team_symbol}`)
  );
  let combo = null;
  outer:
  for (const sym of GROUP_SYMBOLS) {
    for (const c of GROUP_COLORS) {
      if (!taken.has(`${c.key}|${sym}`)) { combo = { color: c, symbol: sym }; break outer; }
    }
  }
  if (!combo) combo = { color: GROUP_COLORS[0], symbol: GROUP_SYMBOLS[0] };

  const usedIds = new Set(everyone.map((p) => p.team_id).filter(Boolean));
  let teamId = null;
  if (kind !== 'solo') {
    let n = 1;
    do { teamId = `G${String(n++).padStart(2, '0')}`; } while (usedIds.has(teamId));
  }

  const station = startStation || STATIONS[Math.floor(Math.random() * STATIONS.length)].id;
  const now = Date.now();
  const settings = getSettings();

  // 这些人原来所属的队伍，稍后要把剩下的人降级
  const vacated = [...new Set(players.map((p) => p.team_id).filter((t) => t && t !== teamId))];

  const tx = db.transaction(() => {
    for (const p of players) {
      stmts.updatePlayerFields.run({
        id: p.id, name: p.name, avatar: p.avatar, contact: p.contact, notes: p.notes,
        identity: kind,
        team_id: teamId,
        team_color: combo.color.key,
        team_symbol: combo.symbol,
        start_station: station,
        tokens_total: settings.helpTokens ?? p.tokens_total,
        updated_at: now,
      });
    }
    // 抽人和降级必须在同一个事务里，否则中间状态会被同步出去
    for (const t of vacated) rebalanceTeam(t, settings);
  });
  tx();

  const demoted = vacated.map((t) => stmts.playersByTeam.all(t)).flat().length;

  return {
    ok: true,
    identity: kind,
    rebalanced: vacated.length,
    teamId,
    color: combo.color.key,
    symbol: combo.symbol,
    startStation: station,
    members: players.map((p) => ({ id: p.id, code: p.code, name: p.name })),
  };
}

/** 清掉一批选手的身份，让他们回到「未分配」 */
export function clearIdentities(playerIds = []) {
  const now = Date.now();
  const settings = getSettings();
  const vacated = new Set();

  const tx = db.transaction(() => {
    for (const id of playerIds) {
      const p = stmts.playerById.get(id);
      if (!p) continue;
      if (p.team_id) vacated.add(p.team_id);
      stmts.updatePlayerFields.run({
        id: p.id, name: p.name, avatar: p.avatar, contact: p.contact, notes: p.notes,
        identity: null, team_id: null, team_color: null, team_symbol: null, start_station: null,
        tokens_total: settings.helpTokens ?? p.tokens_total, updated_at: now,
      });
    }
    // 队里被抽走人之后，剩下的按人数降级
    for (const t of vacated) rebalanceTeam(t, settings);
  });
  tx();

  return { ok: true, cleared: playerIds.length, rebalanced: vacated.size };
}

export { IDENTITIES, STATION_BY_ID, CARD_BY_ID };
