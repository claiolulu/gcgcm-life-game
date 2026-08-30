// 端到端冒烟测试：验证幂等、每站一次、倍率结算、Token、排行榜
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

console.log('\n=== Mini Life Game 后端流程测试 ===\n');

// 测试用的是固定 opId，必须先清库，否则第二次跑会全部撞成 duplicate。
// 这样整套测试可以反复执行。
{
  const admin = await j('/api/staff/login', { method: 'POST', body: { pin: process.env.ADMIN_PIN || 'stm2026', name: '测试' } });
  await j('/api/admin/reset', {
    method: 'POST',
    headers: { authorization: `Bearer ${admin.body.token}` },
    body: { confirm: 'RESET' },
  });
  await j('/api/admin/settings', {
    method: 'POST',
    headers: { authorization: `Bearer ${admin.body.token}` },
    body: { gameState: 'lobby', registrationOpen: true },
  });
}

// 1. 报名
const reg = await j('/api/register', { method: 'POST', body: { name: '测试阿May', avatar: { skin: 1 }, pin: '4827' } });
check('报名成功', reg.status === 200 && reg.body.player.code, JSON.stringify(reg.body));
const player = reg.body.player;
const playerToken = reg.body.token;
console.log(`     编号 = ${player.code}  密码 = ${player.pin}`);
check('编号是纯数字顺序编号', /^\d{2,}$/.test(player.code), player.code);
check('自选的 4 位密码被采纳', player.pin === '4827', player.pin);

// 2. 短码永不改变
const me1 = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
const me2 = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('刷新后编号不变', me1.body.player.code === player.code && me2.body.player.code === player.code);

// 3. 工作人员登录
const login = await j('/api/staff/login', { method: 'POST', body: { pin: '2026', name: '梁潇', station: 'music' } });
check('工作人员 PIN 登录', login.status === 200 && login.body.role === 'staff');
const staffH = { authorization: `Bearer ${login.body.token}` };

// 4. 记一次分
const op1 = { opId: 'op-test-001', type: 'score', playerId: player.id, stationId: 'music', points: 6, operator: '梁潇' };
const s1 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op1], since: 0 } });
check('音乐站记 6 分', s1.body.results[0].status === 'ok', JSON.stringify(s1.body.results[0]));

// 5. 幂等：同一个 opId 重发（模拟弱网重试）
const s2 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op1], since: 0 } });
check('重复提交同一 opId 不重复加分', s2.body.results[0].status === 'duplicate');

// 6. 每站只有一次机会：不同 opId、同一关卡
const op2 = { opId: 'op-test-002', type: 'score', playerId: player.id, stationId: 'music', points: 9, operator: '益嘉' };
const s3 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op2], since: 0 } });
check('同一关卡二次记分被拒', s3.body.results[0].status === 'conflict', JSON.stringify(s3.body.results[0]));

// 7. 再拿几站分，凑过 15 分红线
const more = [
  { opId: 'op-test-003', type: 'score', playerId: player.id, stationId: 'uk', points: 6, operator: '逸欣' },
  { opId: 'op-test-004', type: 'score', playerId: player.id, stationId: 'memory', points: 6, operator: '德浩' },
];
await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: more, since: 0 } });
const afterScores = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('总分 = 6+6+6 = 18', afterScores.body.player.total === 18, `实际 ${afterScores.body.player.total}`);
check('跨过 15 分红线后触发盲盒提醒', afterScores.body.player.pendingLifeEvents === 1,
  `pending=${afterScores.body.player.pendingLifeEvents}`);

// 8. 抽到「投资暴雷」→ 减半。验证乘法被结算成加法增量
const op5 = { opId: 'op-test-005', type: 'life_event', playerId: player.id, cardId: 'crypto_crash', operator: '昊阳' };
const s5 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op5], since: 0 } });
const ev5 = s5.body.results[0];
check('盲盒减半：18 → 9，落库为 -9 的加法事件', ev5.status === 'ok' && ev5.event.points === -9,
  JSON.stringify(ev5.event));

const afterCrash = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('减半后总分 = 9', afterCrash.body.player.total === 9, `实际 ${afterCrash.body.player.total}`);
check('抽完盲盒后提醒清除', afterCrash.body.player.pendingLifeEvents === 0);

// 9. 抽到「重感冒」→ 下一关最多 1 分
const op6 = { opId: 'op-test-006', type: 'life_event', playerId: player.id, cardId: 'flu', operator: '静文' };
await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op6], since: 0 } });
const withMod = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('状态效果已挂到选手身上', withMod.body.player.modifiers.some((m) => m.modifier === 'cap_next'));

const op7 = { opId: 'op-test-007', type: 'score', playerId: player.id, stationId: 'photo', points: 9, operator: '任飞' };
const s7 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op7], since: 0 } });
check('重感冒生效：给 9 分实际只记 1 分', s7.body.results[0].event.points === 1,
  JSON.stringify(s7.body.results[0].event));

const afterFlu = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('状态效果用掉后自动消失', !afterFlu.body.player.modifiers.some((m) => m.modifier === 'cap_next'));

// 10. Help Token
const op8 = { opId: 'op-test-008', type: 'grace', playerId: player.id, option: 'second_chance', operator: 'Yihan' };
await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op8], since: 0 } });
const afterGrace = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('Help Token 用掉后剩 0', afterGrace.body.player.tokensLeft === 0);

const op9 = { opId: 'op-test-009', type: 'grace', playerId: player.id, option: 'hint', operator: 'Yihan' };
const s9 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op9], since: 0 } });
check('Token 用完后再用被拒', s9.body.results[0].status === 'conflict');

// 11. 增量同步（要带上数据纪元，否则会被判定为过期而强制回全量）
const baseline = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [], since: 0, epoch: 0 } });
const ep = baseline.body.epoch;
const now = Date.now();
const delta = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [], since: now, epoch: ep } });
check('增量同步：无变化时不返回全量', delta.body.players.length === 0, `返回 ${delta.body.players.length} 条`);

// 12. 编号 + 密码找回护照
const restore = await j('/api/restore', { method: 'POST', body: { code: player.code, pin: '4827' } });
check('用编号+密码找回护照', restore.status === 200 && restore.body.player.id === player.id);

const noPad = await j('/api/restore', { method: 'POST', body: { code: String(parseInt(player.code, 10)), pin: '4827' } });
check('去掉前导零也能找回（7 == 07）', noPad.status === 200 && noPad.body.player.id === player.id);

const wrongPin = await j('/api/restore', { method: 'POST', body: { code: player.code, pin: '0000' } });
check('密码不对被拒', wrongPin.status === 403, `状态码 ${wrongPin.status}`);

const noSuch = await j('/api/restore', { method: 'POST', body: { code: '9999', pin: '1234' } });
check('不存在的编号被拒', noSuch.status === 404, `状态码 ${noSuch.status}`);

// 连错 5 次触发限速
let limited = false;
for (let i = 0; i < 6; i++) {
  const r = await j('/api/restore', { method: 'POST', body: { code: player.code, pin: '1111' } });
  if (r.status === 429) { limited = true; break; }
}
check('连续试错会被限速锁定', limited);

// 13. 排行榜
const lb = await j('/api/leaderboard');
check('排行榜可读且有名次', lb.status === 200 && lb.body.board.length > 0 && lb.body.board[0].rank === 1);

// 14. 管理员抽身份
const alogin = await j('/api/staff/login', { method: 'POST', body: { pin: 'stm2026', name: '昊阳' } });
check('管理员登录', alogin.body.role === 'admin');
const adminH = { authorization: `Bearer ${alogin.body.token}` };
const draw = await j('/api/admin/draw', { method: 'POST', headers: adminH, body: {} });
check('随机抽取身份/组队', draw.status === 200 && draw.body.assigned > 0,
  JSON.stringify(draw.body.counts));

const drawn = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('选手拿到身份和首站', !!drawn.body.player.identity && !!drawn.body.player.startStation,
  `${drawn.body.player.identity} / ${drawn.body.player.startStation}`);

// 15. 权限
const noAuth = await j('/api/admin/draw', { method: 'POST', headers: staffH, body: {} });
check('普通工作人员不能调管理员接口', noAuth.status === 403);

const badPin = await j('/api/staff/login', { method: 'POST', body: { pin: '0000' } });
check('错误 PIN 被拒', badPin.status === 401);

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
