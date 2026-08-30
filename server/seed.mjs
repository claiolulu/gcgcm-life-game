/**
 * 灌一批演示数据，方便平时开发和现场彩排。
 *
 *   npm run seed          库里已经有人就跳过，不覆盖
 *   npm run seed -- --force   先清空再重新灌
 *
 * 数据是特意配出来的，覆盖各种需要肉眼验证的状态：
 *   · 有人满分、有人零分、有人并列 —— 排行榜排序和并列名次
 *   · 有人已分配身份、有人还没有 —— 总控台的「一键分配这 N 人」要有活干
 *   · Solo / Duo / Trio 都有，同队同色同符号
 *   · 有人用掉了 Help Token、有人抽过人生盲盒、有人挂着状态效果
 *   · 头像用满了帽子/眼镜/饰品三个槽位的组合
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const FORCE = process.argv.includes('--force');

const j = async (url, opts = {}) => {
  const r = await fetch(BASE + url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${url} → ${r.status} ${JSON.stringify(body)}`);
  return body;
};

/* 10 位选手。avatar 的三个配饰槽位（hat / face / extra）刻意各不相同。 */
const PEOPLE = [
  { name: '林小满', pin: '2580', avatar: { bg: 2, skin: 2, hair: 3, hairColor: 0, eyes: 5, mouth: 0, outfit: 1, hat: 4, face: 2, extra: 2 } },
  { name: '陈子墨', pin: '1470', avatar: { bg: 0, skin: 1, hair: 0, hairColor: 1, eyes: 0, mouth: 1, outfit: 0, hat: 2, face: 1, extra: 1 } },
  { name: '王诗涵', pin: '3690', avatar: { bg: 6, skin: 0, hair: 5, hairColor: 4, eyes: 2, mouth: 5, outfit: 3, hat: 7, face: 0, extra: 3 } },
  { name: '张远航', pin: '1122', avatar: { bg: 5, skin: 3, hair: 1, hairColor: 0, eyes: 1, mouth: 2, outfit: 6, hat: 8, face: 3, extra: 0 } },
  { name: '刘思睿', pin: '8520', avatar: { bg: 1, skin: 4, hair: 8, hairColor: 2, eyes: 4, mouth: 0, outfit: 4, hat: 0, face: 2, extra: 2 } },
  { name: '黄嘉怡', pin: '7410', avatar: { bg: 7, skin: 1, hair: 2, hairColor: 6, eyes: 2, mouth: 3, outfit: 5, hat: 1, face: 0, extra: 4 } },
  { name: '吴承翰', pin: '9630', avatar: { bg: 3, skin: 5, hair: 6, hairColor: 0, eyes: 0, mouth: 4, outfit: 7, hat: 3, face: 4, extra: 1 } },
  { name: '徐雨桐', pin: '2468', avatar: { bg: 4, skin: 2, hair: 4, hairColor: 5, eyes: 5, mouth: 0, outfit: 2, hat: 6, face: 1, extra: 3 } },
  { name: '孙亦泽', pin: '1357', avatar: { bg: 2, skin: 0, hair: 9, hairColor: 3, eyes: 3, mouth: 2, outfit: 0, hat: 5, face: 0, extra: 0 } },
  { name: '何欣然', pin: '4826', avatar: { bg: 5, skin: 3, hair: 7, hairColor: 7, eyes: 2, mouth: 1, outfit: 3, hat: 9, face: 3, extra: 2 } },
];

/* 谁在哪一关拿了多少分。留白的关卡就是还没挑战。 */
const SCORES = [
  { i: 0, s: { music: 9, uk: 6, interview: 9, photo: 6, memory: 9 } },   // 领先
  { i: 1, s: { music: 6, uk: 9, interview: 6, photo: 9 } },
  { i: 2, s: { music: 9, uk: 9, library: 6, decisions: 6 } },
  { i: 3, s: { uk: 6, photo: 3, blindbox: 9 } },
  { i: 4, s: { music: 3, memory: 6, library: 3 } },
  { i: 5, s: { interview: 6, photo: 6 } },                                // 与下一位并列，测并列名次
  { i: 6, s: { music: 6, blindbox: 6 } },
  { i: 7, s: { uk: 3 } },
  // 8、9 一分未得，且下面不给他们分配身份 —— 总控台的「一键分配」才有活干
];

const cyan = (t) => `\x1b[36m${t}\x1b[0m`;
const dim = (t) => `\x1b[2m${t}\x1b[0m`;

const admin = await j('/api/staff/login', {
  method: 'POST',
  body: { pin: process.env.ADMIN_PIN || 'stm2026', name: '种子脚本' },
});
const A = { authorization: `Bearer ${admin.token}` };

const existing = await j('/api/leaderboard');
if (existing.board.length > 0 && !FORCE) {
  console.log(`\n库里已经有 ${existing.board.length} 个人了，不动它。`);
  console.log(dim('  要重新灌请加 --force：npm run seed -- --force\n'));
  process.exit(0);
}
if (FORCE && existing.board.length > 0) {
  console.log(dim(`\n--force：先清掉现有的 ${existing.board.length} 人（会自动备份）`));
  await j('/api/admin/reset', { method: 'POST', headers: A, body: { confirm: 'RESET' } });
}

await j('/api/admin/settings', {
  method: 'POST', headers: A,
  body: { gameState: 'lobby', registrationOpen: true },
});

console.log('\n正在灌入演示数据…\n');

const players = [];
for (const p of PEOPLE) {
  const r = await j('/api/register', { method: 'POST', body: p });
  players.push({ ...r.player, token: r.token, pin: p.pin });
}

/* 前 8 人分配身份：2 个 Trio、1 个 Duo，其余 Solo。后 2 人故意留着不分配。 */
await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: [players[0].id, players[1].id, players[2].id], identity: 'trio' } });
await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: [players[3].id, players[4].id, players[5].id], identity: 'trio' } });
await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: [players[6].id, players[7].id], identity: 'duo' } });

/* 记分。用固定的 opId，重复跑也不会重复加分。 */
const staff = await j('/api/staff/login', { method: 'POST', body: { pin: process.env.STAFF_PIN || '2026', name: '各站同工' } });
const S = { authorization: `Bearer ${staff.token}` };
const OPERATORS = { music: '梁潇', uk: '陈逸欣', interview: 'Emy', photo: '任飞', memory: '德浩', blindbox: 'Sean', library: '卫红', decisions: '昊阳' };

const ops = [];
for (const row of SCORES) {
  for (const [station, points] of Object.entries(row.s)) {
    ops.push({
      opId: `seed-${row.i}-${station}`,
      type: 'score', playerId: players[row.i].id, stationId: station, points,
      operator: OPERATORS[station] || '同工',
    });
  }
}
await j('/api/staff/sync', { method: 'POST', headers: S, body: { ops, since: 0, epoch: 0 } });

/* 几个特殊状态，方便验证界面 */
// 林小满抽到「投资暴雷」，总分会被减半 —— 验证倍率结算
await j('/api/staff/sync', { method: 'POST', headers: S, body: { ops: [
  { opId: 'seed-life-0', type: 'life_event', playerId: players[0].id, cardId: 'crypto_crash', operator: '昊阳' },
], since: 0, epoch: 0 } });
// 王诗涵抽到「重感冒」，身上挂着「下一关最多 1 分」
await j('/api/staff/sync', { method: 'POST', headers: S, body: { ops: [
  { opId: 'seed-life-2', type: 'life_event', playerId: players[2].id, cardId: 'flu', operator: '静文' },
], since: 0, epoch: 0 } });
// 张远航用掉了 Help Token
await j('/api/staff/sync', { method: 'POST', headers: S, body: { ops: [
  { opId: 'seed-grace-3', type: 'grace', playerId: players[3].id, option: 'second_chance', operator: 'Yihan' },
], since: 0, epoch: 0 } });

/* 打印一张对照表，方便直接用某个人的身份登录 */
const board = await j('/api/leaderboard');
const byId = new Map(board.board.map((r) => [r.id, r]));

console.log(cyan('  编号  姓名      密码   身份   分数  已闯关  备注'));
console.log(dim('  ────────────────────────────────────────────────────────'));
for (const p of players) {
  const r = byId.get(p.id) || {};
  const notes = [];
  if (!r.identity) notes.push('未分配身份');
  if (r.lifeEventsTaken > 0) notes.push('抽过盲盒');
  if (r.tokensLeft === 0) notes.push('Token 已用');
  console.log(
    `  ${String(p.code).padEnd(5)} ${p.name.padEnd(8)} ${p.pin}  ` +
    `${String(r.identity || '——').toUpperCase().padEnd(6)} ${String(r.total ?? 0).padStart(4)}` +
    `  ${String(r.stationsDone ?? 0)}/8    ${dim(notes.join(' · '))}`
  );
}

console.log(dim('\n  想以某位选手身份打开护照，在浏览器控制台执行：'));
console.log(dim(`  localStorage.setItem('mlg.player', JSON.stringify({token:'${players[0].token}',code:'${players[0].code}'})); location.href='/passport'`));
console.log(`\n完成：${players.length} 人，其中 ${players.filter((p) => !byId.get(p.id)?.identity).length} 人未分配身份。\n`);
