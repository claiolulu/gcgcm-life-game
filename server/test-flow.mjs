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

// 16. 护照模版
{
  const before = await j('/api/config');
  check('配置里带着模版和预设',
    !!before.body.theme?.ink && Array.isArray(before.body.themePresets) && before.body.themePresets.length > 0);

  const ok = await j('/api/admin/theme', {
    method: 'POST', headers: adminH,
    body: { ink: '#1F3A5C', watermark: 0.2, coverTitle: '打卡护照', preset: 'midnight' },
  });
  check('管理员能改模版', ok.status === 200 && ok.body.theme.ink === '#1f3a5c', JSON.stringify(ok.body));

  const after = await j('/api/config');
  check('改完立刻下发给所有人',
    after.body.theme.ink === '#1f3a5c' && after.body.theme.watermark === 0.2
    && after.body.theme.coverTitle === '打卡护照');
  check('没提到的字段保持不变', after.body.theme.gold === before.body.theme.gold);

  const badHex = await j('/api/admin/theme', { method: 'POST', headers: adminH, body: { ink: 'red; background:url(x)' } });
  check('非法颜色被拒', badHex.status === 400, `状态码 ${badHex.status}`);

  const badWm = await j('/api/admin/theme', { method: 'POST', headers: adminH, body: { watermark: 5 } });
  check('水印浓度越界被拒', badWm.status === 400, `状态码 ${badWm.status}`);

  const notAdmin = await j('/api/admin/theme', { method: 'POST', headers: staffH, body: { ink: '#000000' } });
  check('普通工作人员改不了模版', notAdmin.status === 403);

  // 改回默认，免得留给后面的测试一套花里胡哨的颜色
  await j('/api/admin/theme', {
    method: 'POST', headers: adminH,
    body: { ink: '#5c1a22', watermark: 0.13, coverTitle: '人生护照', preset: 'classic' },
  });
}

// 17. 活动配图
{
  // 最小的合法 PNG（1×1 透明），够走完嗅探那一段
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    + 'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  const up = await j('/api/admin/upload', {
    method: 'POST', headers: adminH, body: { data: `data:image/png;base64,${png1x1}` },
  });
  check('能上传配图', up.status === 200 && /^\/uploads\/[a-f0-9]{16}\.png$/.test(up.body.url || ''),
    JSON.stringify(up.body));

  const again = await j('/api/admin/upload', {
    method: 'POST', headers: adminH, body: { data: `data:image/png;base64,${png1x1}` },
  });
  check('同一张图传两次是同一个地址（按内容哈希存）', again.body.url === up.body.url);

  const got = await fetch(BASE + up.body.url);
  check('上传的图能直接访问', got.status === 200 && (got.headers.get('content-type') || '').includes('png'));

  // 声明是 png、内容是一段文本 —— 认头几个字节才拦得住
  const fake = await j('/api/admin/upload', {
    method: 'POST', headers: adminH,
    body: { data: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>'.repeat(8)).toString('base64') },
  });
  check('伪装成图片的文件被拒', fake.status === 400, `状态码 ${fake.status}`);

  const notAdmin = await j('/api/admin/upload', {
    method: 'POST', headers: staffH, body: { data: `data:image/png;base64,${png1x1}` },
  });
  check('普通工作人员不能上传', notAdmin.status === 403);

  const missing = await fetch(BASE + '/uploads/deadbeefdeadbeef.jpg');
  check('不存在的图返回 404，不会掉到首页上', missing.status === 404, `状态码 ${missing.status}`);

  // 存进活动里
  const cfg = await j('/api/config');
  const acts = cfg.body.activities.map((a, i) => (i === 0 ? { ...a, photo: up.body.url } : a));
  const saved = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: acts } });
  check('配图存得进活动', saved.status === 200 && saved.body.activities[0].photo === up.body.url,
    JSON.stringify(saved.body?.activities?.[0]));

  const evil = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: acts.map((a, i) => (i === 0 ? { ...a, photo: 'javascript:alert(1)' } : a)) },
  });
  check('危险的配图地址被清空（不是原样存下来）',
    evil.status === 200 && evil.body.activities[0].photo === '', JSON.stringify(evil.body?.activities?.[0]));

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: cfg.body.activities } });
}

// 18. 签证页模版
{
  const before = await j('/api/config');
  check('配置里带着签证页模版和可选的数据来源',
    Array.isArray(before.body.visaTemplate?.rows) && before.body.visaTemplate.rows.length === 11
    && (before.body.visaSources || []).some((x) => x.key === 'text'));

  const ok = await j('/api/admin/visa-template', {
    method: 'POST', headers: adminH,
    body: {
      banner: '打卡', annotationLabel: '这场是什么',
      showLinks: true,
      rows: [
        { key: 'a', label: '活动 EVENT', src: 'name' },
        { key: 'a', label: '日期 DATE', src: 'date' },       // key 撞了，服务端该自己补开
        { key: 'c', label: '出席 ATTENDED', src: 'status', accent: true },
      ],
    },
  });
  check('管理员能改签证页模版', ok.status === 200 && ok.body.visaTemplate.banner === '打卡',
    JSON.stringify(ok.body).slice(0, 120));
  check('栏目表整份替换（3 栏就是 3 栏，不和默认的 11 栏合并）',
    ok.body.visaTemplate.rows.length === 3);
  check('撞了的 key 被自动错开',
    new Set(ok.body.visaTemplate.rows.map((r) => r.key)).size === 3,
    JSON.stringify(ok.body.visaTemplate.rows.map((r) => r.key)));
  check('没提到的字段保持不变',
    ok.body.visaTemplate.stationLabel === before.body.visaTemplate.stationLabel);

  const badSrc = await j('/api/admin/visa-template', {
    method: 'POST', headers: adminH, body: { rows: [{ label: 'X', src: 'rm -rf' }] } });
  check('不认识的数据来源被拒', badSrc.status === 400, `状态码 ${badSrc.status}`);

  const noLabel = await j('/api/admin/visa-template', {
    method: 'POST', headers: adminH, body: { rows: [{ label: '   ', src: 'text' }] } });
  check('没有标题的栏目被拒', noLabel.status === 400);

  const noRows = await j('/api/admin/visa-template', {
    method: 'POST', headers: adminH, body: { rows: [] } });
  check('一栏都不剩的模版被拒', noRows.status === 400);

  const notAdmin = await j('/api/admin/visa-template', {
    method: 'POST', headers: staffH, body: { banner: 'X' } });
  check('普通工作人员改不了签证页模版', notAdmin.status === 403);

  // 改回默认
  await j('/api/admin/visa-template', {
    method: 'POST', headers: adminH,
    body: { banner: 'VISA', annotationLabel: 'ANNOTATION 备注', rows: before.body.visaTemplate.rows },
  });
}

// 19. 每场活动自己那套版式 + 页面链接
{
  const cfg = await j('/api/config');
  const base = cfg.body.activities;

  const withPage = base.map((a, i) => (i === 0 ? {
    ...a,
    page: { banner: '迎新', rows: [{ key: 'only', label: '就一栏', src: 'name' }] },
    links: [
      { icon: '📷', label: '相册', url: 'https://photos.example.com/freshers' },
      { icon: '📝', label: '报名', url: 'https://forms.example.com/x' },
      { icon: '💬', label: '没地址的', url: '' },
    ],
  } : a));
  const saved = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: withPage } });
  const a0 = saved.body.activities?.[0];
  check('活动能带上自己那套版式', saved.status === 200 && a0?.page?.banner === '迎新' && a0?.page?.rows?.length === 1,
    JSON.stringify(a0?.page));
  check('其它活动仍然跟随模版（没有 page 字段）',
    saved.body.activities.slice(1).every((a) => a.page === undefined));
  check('页面链接存下来了', a0?.links?.length === 2 && a0.links[0].label === '相册',
    JSON.stringify(a0?.links));
  check('只填名字没填地址的那条被丢掉', !(a0?.links || []).some((l) => l.label === '没地址的'));

  const evil = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0
      ? { ...a, links: [{ icon: '💀', label: 'x', url: 'javascript:alert(1)' }] } : a)) },
  });
  check('javascript: 链接被拒（整份不保存）', evil.status === 400, `状态码 ${evil.status}`);

  const tooMany = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0
      ? { ...a, links: Array.from({ length: 7 }, () => ({ url: 'https://a.example.com' })) } : a)) },
  });
  check('超过 6 个链接被拒', tooMany.status === 400);

  const badPageSrc = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0
      ? { ...a, page: { rows: [{ label: 'X', src: '../../etc/passwd' }] } } : a)) },
  });
  check('活动版式里不认识的数据来源也被拒', badPageSrc.status === 400);

  // 回到跟随模版
  const back = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
  check('去掉 page 之后回到跟随模版', back.body.activities[0].page === undefined);
}

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
