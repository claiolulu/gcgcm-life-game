/**
 * 选手端只读不变式测试。
 * 选手端是纯展示端：入场阶段可以自助报名，游戏一开始就必须一行也写不进去。
 * 所有写入（记分、盲盒、Token、调分）只能来自管理员／工作人员端。
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const j = async (url, opts = {}) => {
  const r = await fetch(BASE + url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n=== 选手端只读不变式 ===\n');

const admin = await j('/api/staff/login', { method: 'POST', body: { pin: process.env.ADMIN_PIN || 'stm2026', name: '只读测试' } });
const A = { authorization: `Bearer ${admin.body.token}` };
const staffLogin = await j('/api/staff/login', { method: 'POST', body: { pin: process.env.STAFF_PIN || '2026', name: '只读测试同工' } });
const S = { authorization: `Bearer ${staffLogin.body.token}` };
const setState = (gameState) =>
  j('/api/admin/settings', { method: 'POST', headers: A, body: { gameState } });

/* ---------- 入场阶段：允许自助报名和改资料 ---------- */

await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });

const reg = await j('/api/register', { method: 'POST', body: { name: '只读测试员', avatar: { skin: 3 } } });
check('入场阶段可以自助报名', reg.status === 200 && reg.body.player?.code, JSON.stringify(reg.body).slice(0, 120));
const P = { authorization: `Bearer ${reg.body.token}` };
const playerId = reg.body.player.id;

const edit = await j('/api/me', { method: 'POST', headers: P, body: { name: '改了名字' } });
check('入场阶段可以改名字/头像', edit.status === 200 && edit.body.player.name === '改了名字');

/* ---------- 开赛：选手端立刻全面只读 ---------- */

await setState('running');

const cfg = await j('/api/config');
check('切到「游戏进行中」会自动关闭报名通道', cfg.body.settings.registrationOpen === false,
  `registrationOpen=${cfg.body.settings.registrationOpen}`);

const regAfter = await j('/api/register', { method: 'POST', body: { name: '迟到的人' } });
check('开赛后拒绝自助报名', regAfter.status === 403, `状态码 ${regAfter.status}`);

const editAfter = await j('/api/me', { method: 'POST', headers: P, body: { name: '偷偷改名' } });
check('开赛后拒绝改护照信息', editAfter.status === 403, `状态码 ${editAfter.status}`);

const stillOld = await j('/api/me', { headers: P });
check('护照信息确实没被改动', stillOld.body.player.name === '改了名字', stillOld.body.player.name);

/* ---------- 拉取始终可用 ---------- */

check('开赛后仍能拉取自己的护照', stillOld.status === 200 && stillOld.body.player.code);
const lb = await j('/api/leaderboard');
check('开赛后仍能拉取排行榜', lb.status === 200 && Array.isArray(lb.body.board));
const aw = await j('/api/awards');
check('开赛后仍能拉取奖项', aw.status === 200 && Array.isArray(aw.body.awards));
check('开赛后仍能拉取游戏配置', cfg.status === 200 && cfg.body.stations.length > 0,
  `${cfg.body.stations?.length} 个关卡`);

/* ---------- 拿着选手令牌打不动任何写接口 ---------- */

const asPlayer = [
  ['记分', '/api/staff/sync', { ops: [{ opId: 'ro-1', type: 'score', playerId, stationId: 'music', points: 9 }], since: 0 }],
  ['抽身份', '/api/admin/draw', {}],
  ['改游戏参数', '/api/admin/settings', { gameState: 'lobby' }],
  ['重置数据', '/api/admin/reset', { confirm: 'RESET' }],
  ['颁奖', '/api/admin/award', { awardId: 'top_score', playerId }],
];
for (const [label, path, body] of asPlayer) {
  const r = await j(path, { method: 'POST', headers: P, body });
  check(`选手令牌不能${label}`, r.status === 401 || r.status === 403, `状态码 ${r.status}`);
}

const exportCsv = await fetch(BASE + '/api/admin/export.csv', { headers: P });
check('选手令牌不能导出成绩单', exportCsv.status === 401 || exportCsv.status === 403, `状态码 ${exportCsv.status}`);

/* ---------- 无令牌同样打不动 ---------- */

const anon = await j('/api/staff/sync', { method: 'POST', body: { ops: [], since: 0 } });
check('匿名请求不能调记分接口', anon.status === 401, `状态码 ${anon.status}`);

/* ---------- 结束阶段依旧只读 ---------- */

await setState('ended');
const regEnded = await j('/api/register', { method: 'POST', body: { name: '结束后报名' } });
check('结束后依旧拒绝自助报名', regEnded.status === 403, `状态码 ${regEnded.status}`);
const editEnded = await j('/api/me', { method: 'POST', headers: P, body: { name: 'x' } });
check('结束后依旧拒绝改护照', editEnded.status === 403, `状态码 ${editEnded.status}`);
const badgeData = await j('/api/me', { headers: P });
check('结束后仍能拉取护照用于生成徽章', badgeData.status === 200);

// 复位，别把库留在 ended 状态
await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });


/* ---------- 身份分配：自动补齐 与 手动编队 ---------- */

await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });

const newbies = [];
for (const n of ['分配甲', '分配乙', '分配丙', '分配丁']) {
  const r = await j('/api/register', { method: 'POST', body: { name: n, avatar: {} } });
  newbies.push(r.body.player);
}

const fill1 = await j('/api/admin/draw', { method: 'POST', headers: A, body: { mode: 'fill' } });
check('fill 模式给未分配的人分配了身份', fill1.body.assigned > 0, JSON.stringify(fill1.body.counts));

// 再来一个新人，老人不应被打散
const late = (await j('/api/register', { method: 'POST', body: { name: '迟到的', avatar: {} } })).body.player;
const before = await j(`/api/staff/player/${newbies[0].code}`, { headers: A });
const fill2 = await j('/api/admin/draw', { method: 'POST', headers: A, body: { mode: 'fill' } });
const after = await j(`/api/staff/player/${newbies[0].code}`, { headers: A });
check('fill 只分配新人，老人身份不变',
  fill2.body.assigned === 1 && before.body.player.identity === after.body.player.identity &&
  before.body.player.teamSymbol === after.body.player.teamSymbol,
  `assigned=${fill2.body.assigned} skipped=${fill2.body.skipped}`);

// 手动把三个人编成 Trio
const trio = await j('/api/admin/team', {
  method: 'POST', headers: A,
  body: { playerIds: [newbies[0].id, newbies[1].id, newbies[2].id], identity: 'trio' },
});
check('手动编队成功', trio.status === 200 && trio.body.identity === 'trio', JSON.stringify(trio.body).slice(0, 120));

const roster = (await j('/api/staff/sync', { method: 'POST', headers: A, body: { ops: [], since: 0 } })).body.players;
const team = roster.filter((p) => p.teamId === trio.body.teamId);
check('同队三人拿到同一个色号', team.length === 3 &&
  new Set(team.map((p) => `${p.teamColor}|${p.teamSymbol}`)).size === 1);

const byTeam = {};
roster.forEach((p) => { if (p.teamId) byTeam[p.teamId] = `${p.teamColor}|${p.teamSymbol}`; });
const combos = Object.values(byTeam);
check('不同队之间没有撞色', new Set(combos).size === combos.length,
  `${combos.length} 组 / ${new Set(combos).size} 种色号`);

const un = await j('/api/admin/unassign', { method: 'POST', headers: A, body: { playerIds: [newbies[0].id] } });
const cleared = await j(`/api/staff/player/${newbies[0].code}`, { headers: A });
check('可以把人退回未分配', un.status === 200 && !cleared.body.player.identity);

const asPlayerTeam = await j('/api/admin/team', { method: 'POST', headers: P, body: { playerIds: [late.id] } });
check('选手令牌不能手动编队', asPlayerTeam.status === 401 || asPlayerTeam.status === 403, `状态码 ${asPlayerTeam.status}`);

await setState('lobby');


/* ---------- 数据纪元：重置后客户端不能留着幽灵数据 ---------- */

await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });
for (const n of ['纪元甲', '纪元乙']) {
  await j('/api/register', { method: 'POST', body: { name: n, avatar: {} } });
}

const sync1 = await j('/api/staff/sync', { method: 'POST', headers: A, body: { ops: [], since: 0, epoch: 0 } });
const epoch1 = sync1.body.epoch;
const sinceTs = sync1.body.serverTs;
check('同步返回数据纪元', typeof epoch1 === 'number' && epoch1 > 0, String(epoch1));
check('首次全量同步拿到花名册', sync1.body.players.length > 0);

await j('/api/admin/reset', { method: 'POST', headers: A, body: { confirm: 'RESET' } });

// 客户端按老纪元做增量同步，服务端必须强制回全量
const sync2 = await j('/api/staff/sync', { method: 'POST', headers: A, body: { ops: [], since: sinceTs, epoch: epoch1 } });
check('重置后纪元递增', sync2.body.epoch === epoch1 + 1, `${epoch1} → ${sync2.body.epoch}`);
check('纪元不符时强制回全量', sync2.body.full === true);
check('全量结果里已经没有被删掉的人', sync2.body.players.length === 0, `${sync2.body.players.length} 人`);

// 纪元一致时仍然走增量，不浪费带宽
await j('/api/register', { method: 'POST', body: { name: '纪元丙', avatar: {} } });
const sync3 = await j('/api/staff/sync', {
  method: 'POST', headers: A, body: { ops: [], since: Date.now() + 1000, epoch: sync2.body.epoch },
});
check('纪元一致时保持增量同步', sync3.body.full === false && sync3.body.players.length === 0,
  `full=${sync3.body.full} players=${sync3.body.players.length}`);

await setState('lobby');


/* ---------- 编队的人数校验与自动降级 ---------- */

await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });
const crew = [];
for (const n of ['编队甲', '编队乙', '编队丙', '编队丁']) {
  crew.push((await j('/api/register', { method: 'POST', body: { name: n, avatar: {} } })).body.player);
}
const ids = crew.map((p) => p.id);
const teamOf = async (code) => (await j(`/api/staff/player/${code}`, { headers: A })).body.player;

const wrongTrio = await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: ids.slice(0, 2), identity: 'trio' } });
check('2 人不能编成 Trio', wrongTrio.status === 400, `状态码 ${wrongTrio.status} ${wrongTrio.body?.error || ''}`);

const wrongDuo = await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: ids.slice(0, 3), identity: 'duo' } });
check('3 人不能编成 Duo', wrongDuo.status === 400, `状态码 ${wrongDuo.status}`);

const wrongSolo = await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: ids.slice(0, 2), identity: 'solo' } });
check('2 人不能编成 Solo', wrongSolo.status === 400, `状态码 ${wrongSolo.status}`);

const okTrio = await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: ids.slice(0, 3), identity: 'trio' } });
check('3 人可以编成 Trio', okTrio.status === 200 && okTrio.body.identity === 'trio');
const teamId = okTrio.body.teamId;

// 抽走一人 → 剩下两人自动降级成 Duo
await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: [ids[0]], identity: 'solo' } });
const after1 = await Promise.all([teamOf(crew[1].code), teamOf(crew[2].code)]);
check('三人队被抽走一人后，剩下两人自动降为 Duo',
  after1.every((p) => p.identity === 'duo' && p.teamId === teamId),
  after1.map((p) => `${p.name}:${p.identity}`).join(' '));

// 再抽一人 → 剩下一人自动降级成 Solo，且不再属于任何队伍
await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: [ids[1]], identity: 'solo' } });
const after2 = await teamOf(crew[2].code);
check('两人队再被抽走一人后，剩下一人自动降为 Solo 且脱离队伍',
  after2.identity === 'solo' && !after2.teamId, `${after2.identity} / ${after2.teamId}`);

// 退回未分配也要触发降级
const t2 = await j('/api/admin/team', { method: 'POST', headers: A, body: { playerIds: ids.slice(1, 4), identity: 'trio' } });
await j('/api/admin/unassign', { method: 'POST', headers: A, body: { playerIds: [ids[1]] } });
const after3 = await Promise.all([teamOf(crew[2].code), teamOf(crew[3].code)]);
check('有人退回未分配后，同队剩下的人也会降级',
  after3.every((p) => p.identity === 'duo'), after3.map((p) => `${p.name}:${p.identity}`).join(' '));

await setState('lobby');


/* ---------- 一个人一个号：重名拦截 与 管理员重置密码 ---------- */

await setState('lobby');
await j('/api/admin/settings', { method: 'POST', headers: A, body: { registrationOpen: true } });

const uniqName = '重名测试' + Date.now().toString(36).slice(-4);
const first = await j('/api/register', { method: 'POST', body: { name: uniqName, pin: '1234' } });
check('首次用这个名字报名成功', first.status === 200, `状态码 ${first.status}`);

const again = await j('/api/register', { method: 'POST', body: { name: uniqName, pin: '5678' } });
check('同名再报被拦下', again.status === 409 && again.body.duplicate === true, `状态码 ${again.status}`);
check('拦截时告知已有的编号',
  Array.isArray(again.body.existing) && again.body.existing[0]?.code === first.body.player.code,
  JSON.stringify(again.body.existing));

const forced = await j('/api/register', { method: 'POST', body: { name: uniqName, pin: '5678', confirmNew: true } });
check('确认「不是我」后可以开新号', forced.status === 200 && forced.body.player.code !== first.body.player.code);

// 管理员重置密码
const code = first.body.player.code;
for (let i = 0; i < 6; i++) await j('/api/restore', { method: 'POST', body: { code, pin: '0000' } });
const locked = await j('/api/restore', { method: 'POST', body: { code, pin: '1234' } });
check('连错多次后被锁', locked.status === 429, `状态码 ${locked.status}`);

const rp = await j('/api/admin/reset-pin', { method: 'POST', headers: A, body: { playerIds: [first.body.player.id] } });
check('管理员可以重置密码', rp.status === 200 && rp.body.pin === '3927', JSON.stringify(rp.body).slice(0, 80));

const withNew = await j('/api/restore', { method: 'POST', body: { code, pin: '3927' } });
check('用重置后的 3927 能立刻登录（锁定一并解除）', withNew.status === 200, `状态码 ${withNew.status}`);

const withOld = await j('/api/restore', { method: 'POST', body: { code, pin: '1234' } });
check('原密码已失效', withOld.status === 403, `状态码 ${withOld.status}`);

const asStaff = await j('/api/admin/reset-pin', { method: 'POST', headers: S, body: { playerIds: [first.body.player.id] } });
check('普通工作人员不能重置密码', asStaff.status === 403, `状态码 ${asStaff.status}`);

const asPlayerPin = await j('/api/admin/reset-pin', { method: 'POST', headers: P, body: { playerIds: [first.body.player.id] } });
check('选手令牌不能重置密码', asPlayerPin.status === 401 || asPlayerPin.status === 403, `状态码 ${asPlayerPin.status}`);

await setState('lobby');

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
