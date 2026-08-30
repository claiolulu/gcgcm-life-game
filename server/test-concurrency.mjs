/**
 * 并发 / 弱网韧性测试。
 * 模拟多台工作人员手机同时（且乱序、重复）推送记分，验证最终结果收敛且不重复。
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const j = async (url, opts = {}) => {
  const r = await fetch(BASE + url, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return r.json();
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log('\n=== 并发 / 弱网韧性测试 ===\n');

// 准备一位干净的选手
const reg = await j('/api/register', { method: 'POST', body: { name: '并发测试员', avatar: {} } });
const player = reg.body?.player || reg.player;
const pToken = reg.token;
console.log(`  选手 ${player.name} (${player.code})\n`);

const login = await j('/api/staff/login', { method: 'POST', body: { pin: '2026', name: '并发' } });
const H = { authorization: `Bearer ${login.token}` };

/* --------- 场景 1：三台设备同时推送互不重叠的记分 --------- */

const deviceOps = [
  [{ opId: 'c-a1', type: 'score', playerId: player.id, stationId: 'music', points: 6, operator: '设备A' }],
  [{ opId: 'c-b1', type: 'score', playerId: player.id, stationId: 'uk', points: 9, operator: '设备B' }],
  [{ opId: 'c-c1', type: 'score', playerId: player.id, stationId: 'photo', points: 3, operator: '设备C' }],
];

await Promise.all(
  deviceOps.map((ops) => j('/api/staff/sync', { method: 'POST', headers: H, body: { ops, since: 0 } }))
);

let me = await j('/api/me', { headers: { authorization: `Bearer ${pToken}` } });
check('三台设备并发记分全部生效（6+9+3=18）', me.player.total === 18, `实际 ${me.player.total}`);
check('三个关卡都盖上章', me.player.stationsDone === 3, `实际 ${me.player.stationsDone}`);

/* --------- 场景 2：同一批操作被重复推送 8 次（弱网疯狂重试） --------- */

const allOps = deviceOps.flat();
await Promise.all(
  Array.from({ length: 8 }, () =>
    j('/api/staff/sync', { method: 'POST', headers: H, body: { ops: allOps, since: 0 } })
  )
);

me = await j('/api/me', { headers: { authorization: `Bearer ${pToken}` } });
check('重复推送 8 轮后总分不变（仍为 18）', me.player.total === 18, `实际 ${me.player.total}`);
check('事件条数不变（仍为 3 条）', me.player.history.length === 3, `实际 ${me.player.history.length}`);

/* --------- 场景 3：两台设备抢同一个关卡（只能有一个赢） --------- */

const race = await Promise.all([
  j('/api/staff/sync', { method: 'POST', headers: H, body: { ops: [{ opId: 'c-r1', type: 'score', playerId: player.id, stationId: 'memory', points: 9, operator: '设备A' }], since: 0 } }),
  j('/api/staff/sync', { method: 'POST', headers: H, body: { ops: [{ opId: 'c-r2', type: 'score', playerId: player.id, stationId: 'memory', points: 3, operator: '设备B' }], since: 0 } }),
]);
const statuses = race.map((r) => r.results[0].status).sort();
check('同一关卡的竞争只有一方成功', JSON.stringify(statuses) === '["conflict","ok"]', JSON.stringify(statuses));

me = await j('/api/me', { headers: { authorization: `Bearer ${pToken}` } });
check('记忆站只有一条记录', Object.keys(me.player.stations).length === 4);

/* --------- 场景 4：乱序到达（后发的先到） --------- */

const before = me.player.total;
const later = { opId: 'c-late', type: 'adjust', playerId: player.id, points: 5, label: '后发', clientTs: Date.now() };
const earlier = { opId: 'c-early', type: 'adjust', playerId: player.id, points: -2, label: '先发', clientTs: Date.now() - 60000 };

await j('/api/staff/sync', { method: 'POST', headers: H, body: { ops: [later], since: 0 } });
await j('/api/staff/sync', { method: 'POST', headers: H, body: { ops: [earlier], since: 0 } });

me = await j('/api/me', { headers: { authorization: `Bearer ${pToken}` } });
check('乱序同步结果与顺序无关（加法可交换）', me.player.total === before + 3, `实际 ${me.player.total}，期望 ${before + 3}`);

/* --------- 场景 5：50 人 × 7 关一次性灌入（现场满负载） --------- */

const t0 = Date.now();
const players = [];
for (let i = 0; i < 50; i++) {
  const r = await j('/api/register', { method: 'POST', body: { name: `压测${i}`, avatar: {} } });
  players.push(r.player);
}
const stations = ['music', 'uk', 'interview', 'photo', 'memory', 'blindbox', 'library', 'decisions'];
const bulk = [];
players.forEach((p, pi) => {
  stations.forEach((s, si) => {
    bulk.push({ opId: `load-${pi}-${si}`, type: 'score', playerId: p.id, stationId: s, points: 6, operator: '压测' });
  });
});

// 拆成 10 台设备并发推
const chunks = Array.from({ length: 10 }, (_, i) => bulk.filter((_, idx) => idx % 10 === i));
const t1 = Date.now();
const results = await Promise.all(
  chunks.map((ops) => j('/api/staff/sync', { method: 'POST', headers: H, body: { ops, since: 0 } }))
);
const elapsed = Date.now() - t1;
const okCount = results.flatMap((r) => r.results).filter((r) => r.status === 'ok').length;

const expected = players.length * stations.length;
check(`${expected} 条记分并发写入全部成功（耗时 ${elapsed}ms）`, okCount === expected, `成功 ${okCount}`);
check('并发写入耗时在可接受范围（<3000ms）', elapsed < 3000, `${elapsed}ms`);

const lb = await j('/api/leaderboard');
check('排行榜能算出全部选手', lb.board.length >= 50, `${lb.board.length} 人`);
const t2 = Date.now();
await j('/api/leaderboard');
check(`排行榜响应够快（${Date.now() - t2}ms）`, Date.now() - t2 < 500);

console.log(`\n  报名 ${players.length} 人 + 写入 ${bulk.length} 条记分总耗时：${Date.now() - t0}ms`);
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
