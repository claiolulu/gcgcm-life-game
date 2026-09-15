// 端到端冒烟测试：验证幂等、一场只盖一次、盖章、排行榜
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
const op1 = { opId: 'op-test-001', type: 'score', playerId: player.id, stationId: 'freshers', points: 6, operator: '梁潇' };
const s1 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op1], since: 0 } });
check('音乐站记 6 分', s1.body.results[0].status === 'ok', JSON.stringify(s1.body.results[0]));

// 5. 幂等：同一个 opId 重发（模拟弱网重试）
const s2 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op1], since: 0 } });
check('重复提交同一 opId 不重复加分', s2.body.results[0].status === 'duplicate');

// 6. 每站只有一次机会：不同 opId、同一关卡
const op2 = { opId: 'op-test-002', type: 'score', playerId: player.id, stationId: 'freshers', points: 9, operator: '益嘉' };
const s3 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op2], since: 0 } });
check('同一关卡二次记分被拒', s3.body.results[0].status === 'conflict', JSON.stringify(s3.body.results[0]));

// 7. 再拿几站分，凑过 15 分红线
const more = [
  { opId: 'op-test-003', type: 'score', playerId: player.id, stationId: 'bible-study', points: 6, operator: '逸欣' },
  { opId: 'op-test-004', type: 'score', playerId: player.id, stationId: 'retreat', points: 6, operator: '德浩' },
];
await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: more, since: 0 } });
const afterScores = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });
check('总分 = 6+6+6 = 18', afterScores.body.player.total === 18, `实际 ${afterScores.body.player.total}`);

// 8. 打卡：到了就盖章，不评分
const chk = { opId: 'op-test-005', type: 'score', playerId: player.id, stationId: 'christmas',
              points: 1, checkin: true, operator: '佳琪' };
const s5 = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [chk], since: 0 } });
check('盖章记下来了', s5.body.results[0].status === 'ok', JSON.stringify(s5.body.results[0]));
check('盖章带 checkin 标记（印章据此写「已参加」）',
  s5.body.results[0].event.meta?.checkin === true, JSON.stringify(s5.body.results[0].event.meta));

// 9. 迎新游戏那几种操作已经不认了
for (const [label, op] of [
  ['人生盲盒', { opId: 'gone-1', type: 'life_event', playerId: player.id, cardId: 'crypto_crash' }],
  ['恩典站',   { opId: 'gone-2', type: 'grace', playerId: player.id, option: 'hint' }],
]) {
  const r = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [op], since: 0 } });
  check(`${label}这种操作已经不认了`, r.body.results[0].status === 'error',
    JSON.stringify(r.body.results[0]));
}

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

// 14. 管理员登录
const alogin = await j('/api/staff/login', { method: 'POST', body: { pin: 'stm2026', name: '昊阳' } });
check('管理员登录', alogin.body.role === 'admin');
const adminH = { authorization: `Bearer ${alogin.body.token}` };

// 15. 权限
const noAuth = await j('/api/admin/activities', { method: 'POST', headers: staffH, body: { activities: [] } });
check('普通工作人员不能调管理员接口', noAuth.status === 403);

const badPin = await j('/api/staff/login', { method: 'POST', body: { pin: '0000' } });
check('错误 PIN 被拒', badPin.status === 401);

// 15b. 用户角色、活动可见范围与活动排序
{
  const playerH = { authorization: `Bearer ${playerToken}` };
  const base = (await j('/api/config')).body.activities;
  const target = base[0];
  const restricted = base.map((a, i) => ({ ...a, audience: i === 0 ? 'staff' : 'all' }));
  const savedAudience = await j('/api/admin/activities', {
    method: 'POST', headers: adminH, body: { activities: restricted },
  });
  // 旧写法 audience:'staff' 会被迁成 tags 模式挂上内置的 staff 标签，
  // 行为不变（下面那条隐藏断言仍然成立），但存储形状变了
  check('活动能标成仅同工可见（旧值迁成 tags 模式）', savedAudience.status === 200
    && savedAudience.body.activities[0].audience === 'tags'
    && JSON.stringify(savedAudience.body.activities[0].audienceTags) === '["staff"]',
    JSON.stringify(savedAudience.body.activities[0].audience));

  // 落地页**故意不按可见范围拦**：它是二维码入口，拦住就成了打不开的死页，
  // 而 /api/config 本来就无鉴权地下发全部活动，拦这一下没有任何保密作用。
  // 够不够资格改用 eligible 表达，报名接口那一关才真的拦。
  const anonSee = await j(`/api/activity/${target.id}`);
  const normalSee = await j(`/api/activity/${target.id}`, { headers: playerH });
  check('同工专属活动的落地页照样打得开（二维码入口不能死）',
    anonSee.status === 200 && normalSee.status === 200,
    `匿名 ${anonSee.status} / 普通 ${normalSee.status}`);
  check('但告诉他们没资格报名', anonSee.body.eligible === false && normalSee.body.eligible === false,
    JSON.stringify([anonSee.body.eligible, normalSee.body.eligible]));
  const denied = await j(`/api/activity/${target.id}/signup`, { method: 'POST', headers: playerH });
  check('真去报名会被拦，而且是 403 不是 404（活动存在，只是不对他开放）',
    denied.status === 403, `${denied.status} ${JSON.stringify(denied.body)}`);

  const roleDenied = await j(`/api/admin/player/${player.id}/role`, {
    method: 'POST', headers: staffH, body: { role: 'staff' },
  });
  check('普通工作人员不能修改用户角色', roleDenied.status === 403);
  const roleSet = await j(`/api/admin/player/${player.id}/role`, {
    method: 'POST', headers: adminH, body: { role: 'staff' },
  });
  const staffVisible = await j(`/api/activity/${target.id}`, { headers: playerH });
  check('管理员能把用户设为同工且同工能看到专属活动',
    roleSet.body.player?.role === 'staff' && staffVisible.status === 200);

  const reversed = [...restricted].reverse();
  const sorted = await j('/api/admin/activities', {
    method: 'POST', headers: adminH, body: { activities: reversed },
  });
  const sortedConfig = await j('/api/config');
  check('活动重排后配置与护照使用相同顺序', sorted.status === 200
    && sortedConfig.body.activities.map((a) => a.id).join(',') === reversed.map((a) => a.id).join(','));

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
  await j(`/api/admin/player/${player.id}/role`, {
    method: 'POST', headers: adminH, body: { role: 'normal' },
  });

  const disposable = await j('/api/register', {
    method: 'POST', body: { name: '等待删除的用户', pin: '2468' },
  });
  const deleteDenied = await j(`/api/admin/player/${disposable.body.player.id}`, {
    method: 'DELETE', headers: staffH,
  });
  const deleted = await j(`/api/admin/player/${disposable.body.player.id}`, {
    method: 'DELETE', headers: adminH,
  });
  const deletedMe = await j('/api/me', {
    headers: { authorization: `Bearer ${disposable.body.token}` },
  });
  check('普通工作人员不能删除用户', deleteDenied.status === 403);
  check('管理员删除用户后其令牌立即失效', deleted.status === 200 && deletedMe.status === 401);
}

// 16. 护照配色（搬到每个人自己身上了，不再是总控台的全局设置）
{
  const playerH = { authorization: `Bearer ${playerToken}` };

  const before = await j('/api/me', { headers: playerH });
  check('没调过的人 theme 是 null', before.body.player.theme === null);

  const ok = await j('/api/me/theme', {
    method: 'POST', headers: playerH,
    body: { theme: { ink: '#26452F', watermark: 0.2, preset: 'forest' } },
  });
  check('选手能改自己那本的配色', ok.status === 200 && ok.body.theme.ink === '#26452f',
    JSON.stringify(ok.body));

  const after = await j('/api/me', { headers: playerH });
  check('改完自己看得到', after.body.player.theme?.watermark === 0.2);

  // 另一个人不受影响 —— 这是「搬到个人身上」的全部意义
  const other = await j('/api/register', { method: 'POST', body: { name: '配色不受影响的人', pin: '4321' } });
  const otherMe = await j('/api/me', { headers: { authorization: `Bearer ${other.body.token}` } });
  check('别人的护照不受影响', otherMe.body.player.theme === null);

  const badHex = await j('/api/me/theme', {
    method: 'POST', headers: playerH, body: { theme: { ink: 'red; background:url(x)' } } });
  check('非法颜色被拒', badHex.status === 400, `状态码 ${badHex.status}`);

  const badWm = await j('/api/me/theme', {
    method: 'POST', headers: playerH, body: { theme: { watermark: 9 } } });
  check('水印浓度越界被拒', badWm.status === 400);

  const anon = await j('/api/me/theme', { method: 'POST', body: { theme: { ink: '#000000' } } });
  check('匿名改不了', anon.status === 401);

  const gone = await j('/api/admin/theme', { method: 'POST', headers: adminH, body: { ink: '#000000' } });
  check('总控台那个全局模版接口已经没有了', gone.status === 404, `状态码 ${gone.status}`);

  const reset = await j('/api/me/theme', { method: 'POST', headers: playerH, body: { theme: null } });
  check('能换回默认', reset.status === 200 && reset.body.theme === null);
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
    evil.status === 200 && evil.body.activities[0].photo === '', JSON.stringify(evil.body?.activities?.[0]?.photo));

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: cfg.body.activities } });
}

// 18. 签证页的默认版式（现在是代码常量，不再是可改的设置）
{
  const cfg = await j('/api/config');
  check('配置里带着默认版式和可选的数据来源',
    Array.isArray(cfg.body.visaTemplate?.rows) && cfg.body.visaTemplate.rows.length === 9
    && (cfg.body.visaSources || []).some((x) => x.key === 'text'));
  check('数据来源里有持照人的名字（栏目条能绑它）',
    (cfg.body.visaSources || []).some((x) => x.key === 'player' && x.group === '持照人'));
  check('来源都分了组，下拉才好找', (cfg.body.visaSources || []).every((x) => x.key === 'text' || x.group));
  check('签发站改叫签发机构',
    (cfg.body.visaSources || []).find((x) => x.key === 'post')?.name === '签发机构');
  check('默认版式里没有出席那一栏（章已经说清楚了）',
    !cfg.body.visaTemplate.rows.some((r) => r.src === 'status'));
  check('但出席这个来源还在，需要的话能自己加回来',
    (cfg.body.visaSources || []).some((x) => x.key === 'status'));
  check('默认栏目标题也跟着改了',
    cfg.body.visaTemplate.rows.some((r) => r.src === 'post' && r.label.includes('签发机构')));

  // 签发机构存在活动身上，控制号跟着它走
  const base0 = cfg.body.activities;
  const withIssuer = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base0.map((a, i) => (i === 0 ? { ...a, issuer: 'GCGCM 迎新组' } : a)) },
  });
  check('活动能填签发机构', withIssuer.body.activities?.[0]?.issuer === 'GCGCM 迎新组');
  check('没填的活动是空串（渲染时回落到护照模版上那个）',
    withIssuer.body.activities?.[1]?.issuer === '');
  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base0 } });

  const gone = await j('/api/admin/visa-template', { method: 'POST', headers: adminH, body: { banner: 'X' } });
  check('改模版的接口已经没有了', gone.status === 404, `状态码 ${gone.status}`);
}

// 19. 页面链接
{
  const cfg = await j('/api/config');
  const base = cfg.body.activities;

  const withLinks = base.map((a, i) => (i === 0 ? {
    ...a,
    links: [
      { icon: '📷', label: '相册', url: 'https://photos.example.com/freshers' },
      { icon: '📝', label: '报名', url: 'https://forms.example.com/x' },
      { icon: '💬', label: '没地址的', url: '' },
    ],
  } : a));
  const saved = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: withLinks } });
  const a0 = saved.body.activities?.[0];
  check('页面链接存下来了', a0?.links?.length === 2 && a0.links[0].label === '相册', JSON.stringify(a0?.links));
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

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 20. 活动状态（从原来那个全局「游戏状态」搬过来的）
{
  const cfg = await j('/api/config');
  const base = cfg.body.activities;
  check('活动身上带着状态', base.every((a) => ['upcoming', 'live', 'done'].includes(a.state)),
    JSON.stringify(base.map((a) => a.state)));

  const live1 = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => ({ ...a, state: i === 0 ? 'live' : 'upcoming' })) },
  });
  check('可以把一场设成进行中', live1.status === 200 && live1.body.activities[0].state === 'live');
  check('有一场进行中时，全局状态跟着变成 running', live1.body.gameState === 'running');

  const after = await j('/api/config');
  check('全局状态确实写进去了', after.body.settings.gameState === 'running');

  const liveInfo = await j(`/api/activity/${base[0].id}`);
  check('进行中的活动二维码显示报名截止话术',
    liveInfo.body.registration?.status === 'live'
      && /报名已截止/.test(liveInfo.body.registration?.label || ''),
    JSON.stringify(liveInfo.body.registration));
  const liveSignup = await j(`/api/activity/${base[0].id}/signup`, {
    method: 'POST', headers: { authorization: `Bearer ${playerToken}` },
  });
  check('进行中的活动不再接受线上报名', liveSignup.status === 409, `状态码 ${liveSignup.status}`);

  const upcomingInfo = await j(`/api/activity/${base[1].id}`);
  check('还没开始的活动二维码显示报名中', upcomingInfo.body.registration?.status === 'open',
    JSON.stringify(upcomingInfo.body.registration));
  const upcomingSignup = await j(`/api/activity/${base[1].id}/signup`, {
    method: 'POST', headers: { authorization: `Bearer ${playerToken}` },
  });
  check('还没开始的活动可以报名', upcomingSignup.status === 200, `状态码 ${upcomingSignup.status}`);
  const upcomingCancel = await j(`/api/activity/${base[1].id}/signup`, {
    method: 'DELETE', headers: { authorization: `Bearer ${playerToken}` },
  });
  check('报名中可以取消报名', upcomingCancel.status === 200, `状态码 ${upcomingCancel.status}`);

  const passportDuringLive = await j('/api/register', {
    method: 'POST', body: { name: `活动中领护照-${Date.now()}`, pin: '2468' },
  });
  check('活动进行中仍可独立领取护照', passportDuringLive.status === 200,
    `状态码 ${passportDuringLive.status}`);

  const two = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => ({ ...a, state: i < 2 ? 'live' : 'upcoming' })) },
  });
  check('两场同时进行中被拒', two.status === 400, `状态码 ${two.status}`);
  check('拒的时候说清是哪两场', /迎新之夜/.test(two.body?.error || ''), two.body?.error);

  const stillOne = await j('/api/config');
  check('被拒之后没有半保存', stillOne.body.activities.filter((a) => a.state === 'live').length === 1);

  const none = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a) => ({ ...a, state: 'done' })) },
  });
  check('没有进行中的时候，全局状态回到 lobby', none.body.gameState === 'lobby');

  const endedInfo = await j(`/api/activity/${base[0].id}`);
  check('已结束的活动二维码显示结束话术', endedInfo.body.registration?.status === 'ended'
    && /已结束/.test(endedInfo.body.registration?.label || ''),
    JSON.stringify(endedInfo.body.registration));
  const endedSignup = await j(`/api/activity/${base[0].id}/signup`, {
    method: 'POST', headers: { authorization: `Bearer ${playerToken}` },
  });
  check('已结束的活动不接受报名', endedSignup.status === 409, `状态码 ${endedSignup.status}`);

  const bad = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a) => ({ ...a, state: 'whatever' })) },
  });
  check('不认识的状态被当成 upcoming，不是原样存下来',
    bad.status === 200 && bad.body.activities.every((a) => a.state === 'upcoming'));

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 21. 签证页的块
{
  const cfg = await j('/api/config');
  const base = cfg.body.activities;

  const withBlocks = base.map((a, i) => (i === 0 ? {
    ...a,
    blocks: [
      { id: 'b1', kind: 'banner', x: 4, y: 12, w: 92, h: 11,
        word: '打卡', brand: 'GCGCM 迎新', brandCn: '',
        size: 3.8, color: '#7a1823', font: 'serif', align: 'center', bold: true, lh: 1.3 },
      { id: 'b1', kind: 'fields', x: 4, y: 27, w: 52, h: 60, cols: 3,
        rows: [{ key: 'a', label: '姓 SURNAME', src: 'surname' }],
        size: 2.2, color: '#232323', font: 'mono', align: 'right', bold: false, lh: 1.1 },
      { id: 'b3', kind: 'image', x: 200, y: -90, w: 40, h: 40, rot: 999,
        src: 'javascript:alert(1)', fit: 'squish', href: 'javascript:alert(1)' },
      { id: 'b4', kind: 'rm -rf', x: 5, y: 5, w: 10, h: 10, text: '未知类型退回文字' },
    ],
  } : a));
  const saved = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: withBlocks } });
  const b = saved.body.activities?.[0]?.blocks || [];
  check('版式存得下来', saved.status === 200 && b.length === 4, JSON.stringify(b).slice(0, 100));
  check('横框上那两行字能改', b[0]?.word === '打卡' && b[0].brand === 'GCGCM 迎新');
  check('栏目块能只留一栏', b[1]?.rows?.length === 1 && b[1].cols === 3);
  check('模板块的字体样式能保存', b[0]?.size === 3.8 && b[0]?.color === '#7a1823'
    && b[0]?.align === 'center' && b[0]?.bold === true && b[0]?.lh === 1.3
    && b[1]?.size === 2.2 && b[1]?.align === 'right' && b[1]?.bold === false,
    JSON.stringify([b[0], b[1]]));

  // 栏目条能绑「持照人」那一组的每一个来源
  const holder = ['player', 'code', 'passport', 'contact', 'visited', 'signed', 'stampDate'];
  const bound = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0 ? { ...a, blocks: [{
      kind: 'fields', x: 4, y: 27, w: 92, h: 58, cols: 3,
      rows: holder.map((src, k) => ({ key: `k${k}`, label: src.toUpperCase(), src })),
    }] } : a)) },
  });
  check('持照人那一组的来源都收得下',
    bound.status === 200
    && bound.body.activities[0].blocks[0].rows.map((r) => r.src).join(',') === holder.join(','),
    JSON.stringify(bound.body.activities?.[0]?.blocks?.[0]?.rows?.map((r) => r.src)));
  check('撞了的 id 被错开', b[0]?.id !== b[1]?.id, `${b[0]?.id} / ${b[1]?.id}`);
  check('坐标被夹回合理范围', b[2]?.x <= 120 && b[2]?.y >= -20, `x=${b[2]?.x} y=${b[2]?.y}`);
  check('旋转被夹回 ±180', Math.abs(b[2]?.rot) <= 180, `rot=${b[2]?.rot}`);
  check('javascript: 的图片地址被清空', b[2]?.src === '');
  check('javascript: 的链接被清空（不是整份拒掉）', b[2]?.href === '');
  check('不认识的裁切方式退回 cover', b[2]?.fit === 'cover');
  check('不认识的块类型退回文字', b[3]?.kind === 'text' && b[3].text === '未知类型退回文字');

  // 空数组是「我要一张白页」，不是「没设计过」—— 必须存下来
  const blank = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0 ? { ...a, blocks: [] } : a)) },
  });
  check('清空之后存的是白页，不是「没设计过」',
    blank.status === 200 && Array.isArray(blank.body.activities[0].blocks)
    && blank.body.activities[0].blocks.length === 0);

  const tooMany = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0
      ? { ...a, blocks: Array.from({ length: 41 }, () => ({ kind: 'text', text: 'x' })) } : a)) },
  });
  check('块超过 40 个被拒', tooMany.status === 400, `状态码 ${tooMany.status}`);

  const badRow = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0
      ? { ...a, blocks: [{ kind: 'fields', rows: [{ label: 'X', src: '../../etc' }] }] } : a)) },
  });
  check('栏目块里不认识的数据来源被拒', badRow.status === 400);

  // 没设计过的活动不该被塞一个 blocks 字段
  const back = await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
  check('没提供 blocks 就不写这个字段', back.body.activities[0].blocks === undefined);
}

// 22. 活动附加页与参与者素材库
{
  const cfg = await j('/api/config');
  const base = cfg.body.activities;
  const activityId = base[0].id;
  const pages = [
    { id: 'photos', kind: 'photo', title: '活动照片', blocks: [
      { id: 'photo-title', kind: 'text', x: 8, y: 14, w: 84, h: 10, text: '我们在一起' },
      { id: 'gallery', kind: 'gallery', x: 8, y: 26, w: 84, h: 58,
        photos: ['/uploads/one.jpg', '', 'javascript:bad'], featured: 99, cols: 1 },
    ] },
    { id: 'photos', kind: 'summary', title: '活动总结', blocks: [
      { id: 'summary', kind: 'text', x: 10, y: 25, w: 80, h: 50, text: '这一页是总结。' },
    ] },
  ];
  const saved = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0 ? { ...a, extraPages: pages } : a)) },
  });
  const extras = saved.body.activities?.[0]?.extraPages || [];
  check('一场活动能保存多张附加页', saved.status === 200 && extras.length === 2,
    JSON.stringify(extras));
  check('照片页和总结页类型被保留', extras[0]?.kind === 'photo' && extras[1]?.kind === 'summary');
  check('重复的附加页 id 会自动错开', extras[0]?.id !== extras[1]?.id,
    `${extras[0]?.id} / ${extras[1]?.id}`);
  check('附加页里的画布块能保存', extras[1]?.blocks?.[0]?.text === '这一页是总结。');
  const gallery = extras[0]?.blocks?.find((b) => b.kind === 'gallery');
  check('照片页图库能保存并清理图片地址', gallery?.photos?.length === 1 && gallery.photos[0] === '/uploads/one.jpg',
    JSON.stringify(gallery));
  check('图库首屏数量和列数会收进安全范围', gallery?.featured === 8 && gallery?.cols === 2,
    JSON.stringify(gallery));

  const tooManyPages = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0 ? {
      ...a, extraPages: Array.from({ length: 13 }, (_, n) => ({ id: `p${n}`, blocks: [] })),
    } : a)) },
  });
  check('每场超过 12 张附加页会被拒', tooManyPages.status === 400,
    `状态码 ${tooManyPages.status}`);

  const playerH = { authorization: `Bearer ${playerToken}` };
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
    + 'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const upload = await j(`/api/activity/${activityId}/materials`, {
    method: 'POST', headers: playerH,
    body: { text: '这是参与者整理好的活动感想。', imageData: `data:image/png;base64,${png1x1}` },
  });
  check('参与者一次可以提交文字和照片', upload.status === 200
    && upload.body.materials?.length === 2
    && upload.body.materials.some((m) => m.kind === 'text')
    && upload.body.materials.some((m) => m.kind === 'image'), JSON.stringify(upload.body));

  const mine = await j(`/api/activity/${activityId}/materials/mine`, { headers: playerH });
  check('参与者能看到自己的投稿', mine.status === 200 && mine.body.materials?.length === 2);
  check('参与者自己的素材响应不泄露身份资料',
    mine.body.materials.every((m) => m.player === undefined));

  const contributor2 = await j('/api/register', {
    method: 'POST', body: { name: '另一位投稿者', pin: '3579' },
  });
  const otherH = { authorization: `Bearer ${contributor2.body.token}` };
  const otherMine = await j(`/api/activity/${activityId}/materials/mine`, { headers: otherH });
  check('另一位参与者看不到别人的投稿', otherMine.status === 200 && otherMine.body.materials?.length === 0);

  const adminMaterials = await j(`/api/admin/activity/${activityId}/materials`, { headers: adminH });
  check('管理员素材库能看到投稿和投稿人', adminMaterials.status === 200
    && adminMaterials.body.materials?.length === 2
    && adminMaterials.body.materials.every((m) => m.player?.id === player.id));
  const staffMaterials = await j(`/api/admin/activity/${activityId}/materials`, { headers: staffH });
  check('普通工作人员不能浏览所有参与者素材', staffMaterials.status === 403);

  const firstMaterial = mine.body.materials[0];
  const stealDelete = await j(`/api/activity/${activityId}/materials/${firstMaterial.id}`, {
    method: 'DELETE', headers: otherH,
  });
  check('参与者不能撤回别人的投稿', stealDelete.status === 404);
  const ownDelete = await j(`/api/activity/${activityId}/materials/${firstMaterial.id}`, {
    method: 'DELETE', headers: playerH,
  });
  check('参与者可以撤回自己的投稿', ownDelete.status === 200);

  const empty = await j(`/api/activity/${activityId}/materials`, {
    method: 'POST', headers: playerH, body: { text: '   ' },
  });
  check('空投稿被拒', empty.status === 400);
  const fakeImage = await j(`/api/activity/${activityId}/materials`, {
    method: 'POST', headers: playerH,
    body: { imageData: 'data:image/png;base64,' + Buffer.from('not an image'.repeat(10)).toString('base64') },
  });
  check('参与者伪装成图片的文件也会被拒', fakeImage.status === 400);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 23. 报名
{
  const a0 = (await j('/api/config')).body.activities[0].id;

  const pub = await j(`/api/activity/${a0}`);
  check('活动的公开信息不用登录就能看', pub.status === 200 && pub.body.activity.name);
  check('公开信息里没有谁报了名', pub.body.signups === undefined && typeof pub.body.signupCount === 'number');

  const gone = await j('/api/activity/no-such-thing');
  check('不存在的活动返回 404', gone.status === 404);

  const playerH = { authorization: `Bearer ${playerToken}` };
  const up = await j(`/api/activity/${a0}/signup`, { method: 'POST', headers: playerH, body: {} });
  check('选手能报名', up.status === 200 && up.body.signedUp === true);

  const again = await j(`/api/activity/${a0}/signup`, { method: 'POST', headers: playerH, body: {} });
  check('重复报名是幂等的', again.status === 200);

  const counts = await j('/api/admin/signups', { headers: adminH });
  check('报名数只算一次', counts.body.counts[a0] === 1, JSON.stringify(counts.body.counts));

  const me = await j('/api/me', { headers: playerH });
  check('护照上看得到自己报了哪些', (me.body.player.signups || []).includes(a0));

  const list = await j(`/api/admin/activity/${a0}/signups`, { headers: adminH });
  check('同工能看到报名名单', list.body.signups?.length === 1 && list.body.signups[0].code);

  const notAdmin = await j(`/api/admin/activity/${a0}/signups`, { headers: playerH });
  check('选手看不到别人的报名名单', notAdmin.status === 401 || notAdmin.status === 403,
    `状态码 ${notAdmin.status}`);

  const anon = await j(`/api/activity/${a0}/signup`, { method: 'POST', body: {} });
  check('没护照的匿名请求报不了名', anon.status === 401);

  const off = await j(`/api/activity/${a0}/signup`, { method: 'DELETE', headers: playerH });
  check('可以取消报名', off.status === 200 && off.body.signedUp === false);

  const after = await j('/api/admin/signups', { headers: adminH });
  check('取消之后数字回落', !after.body.counts[a0]);
}


// 24. 活动被删掉之后，指向它的章不能让任何地方出错
//
// 总控台可以随时删活动，但章是不可逆的历史 —— 删活动不该动到已经盖下去的章。
// 于是「有一批章指向的活动已经不存在了」是这套系统的常态，而不是异常。
// 这一节把这个状态造出来，然后把每一个会碰到章的出口都走一遍。
{
  const before = (await j('/api/config')).body.activities;
  const ghostId = 'act-ghost-test';

  await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: [...before, { id: ghostId, name: '待删活动', icon: '👻', tag: 'test', state: 'live' }] },
  });

  const beforeStamp = await j('/api/me', { headers: { authorization: `Bearer ${playerToken}` } });

  const stamped = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'ghost-1', type: 'score', playerId: player.id, stationId: ghostId, points: 1, checkin: true }] },
  });
  check('先在这场活动上盖一个章', stamped.body.results?.[0]?.status === 'ok',
    JSON.stringify(stamped.body.results));

  // 删掉它。章留在 events 里，指向一个不再存在的 id。
  const removed = await j('/api/admin/activities', {
    method: 'POST', headers: adminH, body: { activities: before },
  });
  check('活动能删掉', removed.status === 200 && !removed.body.activities.some((a) => a.id === ghostId));

  const playerH2 = { authorization: `Bearer ${playerToken}` };

  const me = await j('/api/me', { headers: playerH2 });
  check('删完之后本人的护照照常拉得到', me.status === 200);
  check('那个章还在（删活动不动历史）', !!me.body.player.stations[ghostId],
    JSON.stringify(Object.keys(me.body.player.stations || {})));
  check('但它不再计入分数和场次（活动都没了，这一场自然不算）',
    me.body.player.total === beforeStamp.body.player.total
    && me.body.player.stationsDone === beforeStamp.body.player.stationsDone,
    `删前 ${beforeStamp.body.player.total}/${beforeStamp.body.player.stationsDone}，`
    + `删后 ${me.body.player.total}/${me.body.player.stationsDone}`);

  const board = await j('/api/leaderboard');
  check('排行榜照常算得出来', board.status === 200 && board.body.board.some((r) => r.id === player.id));

  const csv = await j('/api/admin/export.csv', { headers: adminH });
  check('成绩单导得出来', csv.status === 200);

  const backup = await j('/api/admin/backup.json', { headers: adminH });
  check('备份导得出来', backup.status === 200);

  const sync = await j('/api/staff/sync', { method: 'POST', headers: staffH, body: { ops: [] } });
  check('同工端同步照常', sync.status === 200 && Array.isArray(sync.body.players));

  const signups = await j('/api/admin/signups', { headers: adminH });
  check('报名统计照常', signups.status === 200);

  const gone = await j(`/api/activity/${ghostId}`);
  check('打开已删活动的页面是干净的 404，不是 500', gone.status === 404, `状态码 ${gone.status}`);

  const signGone = await j(`/api/activity/${ghostId}/signup`, { method: 'POST', headers: playerH2 });
  check('给已删活动报名是干净的 404，不是 500', signGone.status === 404, `状态码 ${signGone.status}`);

  const stampGone = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'ghost-2', type: 'score', playerId: player.id, stationId: ghostId, points: 1, checkin: true }] },
  });
  check('往已删活动上补章会被挡下，并且说得清是为什么',
    stampGone.status === 200 && stampGone.body.results?.[0]?.status === 'error'
    && /未知/.test(stampGone.body.results[0].message || ''),
    JSON.stringify(stampGone.body.results));

  // 极端情况：把活动删到只剩一场，而这个人身上还挂着好几个章。
  // 一年结束清空旧活动就是这个形状。
  await j('/api/admin/activities', {
    method: 'POST', headers: adminH, body: { activities: [before[0]] },
  });

  const thin = await j('/api/me', { headers: playerH2 });
  check('只剩一场活动时护照照样拉得到', thin.status === 200);
  const thinBoard = await j('/api/leaderboard');
  check('只剩一场活动时排行榜照样算得出来', thinBoard.status === 200);
  const thinCsv = await j('/api/admin/export.csv', { headers: adminH });
  check('只剩一场活动时成绩单照样导得出来', thinCsv.status === 200);

  // 分母是「当前有几场活动」，分子却把指向已删活动的章也数进去了，
  // 于是会印出「参加 4/1 场」这种大于一的比例。护照上的进度条按这个比例走。
  check('「参加过几场」不会超过当前的活动场数',
    thin.body.player.stationsDone <= thin.body.player.stationsTotal,
    `实际是 ${thin.body.player.stationsDone}/${thin.body.player.stationsTotal}`);

  // 把同 id 的活动加回来，那个章自己就回来了 —— 数据一直都在，
  // 只是被「这场活动还在不在」这个开关挡着。误删可以这样救回来。
  await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: [...before, { id: ghostId, name: '待删活动', icon: '👻', tag: 'test', state: 'live' }] },
  });
  const restored = await j('/api/me', { headers: playerH2 });
  check('把同 id 的活动加回来，那个章重新算数（误删救得回来）',
    restored.body.player.total === beforeStamp.body.player.total + 1
    && restored.body.player.stationsDone === beforeStamp.body.player.stationsDone + 1,
    `${restored.body.player.total}/${restored.body.player.stationsDone}`);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: before } });
}
// 24. 改活动之后，各端手里的花名册必须作废重拉
//
// 分数和场次是算出来的，算的时候要看活动清单；而花名册是按 updated_at
// 增量同步的。改一次活动，所有人的数字都可能变，却没有任何一行 players
// 被动过 —— 不靠纪元的话，增量同步一个人都不返回，同工端会一直显示改之前
// 的旧分数，刷新也没用。
{
  const base = (await j('/api/config')).body.activities;
  const first = await j('/api/staff/sync', {
    method: 'POST', headers: staffH, body: { ops: [], since: 0, epoch: 0 },
  });
  const epoch0 = first.body.epoch;
  const at0 = first.body.serverTs;
  check('先做一次全量同步拿到纪元', first.status === 200 && epoch0 > 0 && first.body.full === true);

  // 什么都没改的时候，增量同步应该老老实实什么都不回
  const idle = await j('/api/staff/sync', {
    method: 'POST', headers: staffH, body: { ops: [], since: at0, epoch: epoch0 },
  });
  check('没有任何改动时，增量同步不必重拉',
    idle.body.full === false && idle.body.epoch === epoch0, JSON.stringify(idle.body.epoch));

  // 改一场活动的可见范围：一行 players 都不会被动到
  await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a, i) => (i === 0 ? { ...a, audience: 'staff' } : a)) },
  });

  const after = await j('/api/staff/sync', {
    method: 'POST', headers: staffH, body: { ops: [], since: at0, epoch: epoch0 },
  });
  check('改完活动，纪元跟着变', after.body.epoch !== epoch0, `${epoch0} → ${after.body.epoch}`);
  check('于是这一次同步是全量，旧花名册作废', after.body.full === true, JSON.stringify(after.body.full));
  check('全量里带着重新算过的每个人', (after.body.players || []).length > 0);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 25. 「仅报名的人可见」这一档
{
  const playerH = { authorization: `Bearer ${playerToken}` };
  const base = (await j('/api/config')).body.activities;
  const TARGET = 'easter';   // 全程没被盖过章，也没被报名过

  // 先清干净，免得受前面小节影响
  await j(`/api/activity/${TARGET}/signup`, { method: 'DELETE', headers: playerH });

  const saved = await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a) => (a.id === TARGET
      ? { ...a, audience: 'signed', state: 'upcoming' } : a)) },
  });
  const savedOne = (saved.body.activities || []).find((a) => a.id === TARGET);
  check('活动能标成「仅报名的人可见」', saved.status === 200 && savedOne?.audience === 'signed',
    JSON.stringify(savedOne?.audience));

  // 防死锁第一条：扫码落地页不能被这一档挡住，否则没人报得进来
  const landing = await j(`/api/activity/${TARGET}`);
  check('没报名（连匿名）也能打开落地页，否则报名无门', landing.status === 200, `实际 ${landing.status}`);

  const before = await j('/api/me', { headers: playerH });
  check('确认这一场还没报名', !(before.body.player.signups || []).includes(TARGET));

  // 没报名时：不进分母
  const totalBefore = before.body.player.stationsTotal;
  // 按配置自己算一遍普通用户该看到几场：audience 为 signed 的这一场不算在内
  const visibleNow = (saved.body.activities || [])
    .filter((a) => !a.audience || a.audience === 'all' || a.audience === 'normal').length;
  check('没报名时这一场不计入他的场次分母', totalBefore === visibleNow,
    `分母 ${totalBefore}，按配置该是 ${visibleNow}`);

  // 没报名时盖章要被拒，而且理由得说清是「没报名」而不是「角色不符」
  const blocked = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'op-signed-001', type: 'score', playerId: player.id,
                    stationId: TARGET, points: 1, checkin: true }], since: 0 },
  });
  check('没报名的人盖不上这一章', blocked.body.results[0].status === 'error',
    JSON.stringify(blocked.body.results[0]));
  check('拒绝理由说的是没报名，不是角色不符',
    String(blocked.body.results[0].message || '').includes('报名'),
    blocked.body.results[0].message);

  // 防死锁第二条：报名接口本身也不能被拦
  const signup = await j(`/api/activity/${TARGET}/signup`, { method: 'POST', headers: playerH });
  check('没报名的人能报上这一场（这一档不锁死报名）', signup.status === 200, JSON.stringify(signup.body));

  const after = await j('/api/me', { headers: playerH });
  check('报名后这一场进入他的场次分母',
    after.body.player.stationsTotal === totalBefore + 1,
    `${totalBefore} → ${after.body.player.stationsTotal}`);

  // 报名之后才盖得上
  const ok = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'op-signed-002', type: 'score', playerId: player.id,
                    stationId: TARGET, points: 1, checkin: true }], since: 0 },
  });
  check('报名之后就能盖章了', ok.body.results[0].status === 'ok', JSON.stringify(ok.body.results[0]));

  const scored = await j('/api/me', { headers: playerH });
  check('这一章算进了总分', scored.body.player.total === after.body.player.total + 1,
    `${after.body.player.total} → ${scored.body.player.total}`);

  // 还原
  await j(`/api/activity/${TARGET}/signup`, { method: 'DELETE', headers: playerH });
  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 26. 自建标签：一个人可以挂多个，活动按标签可见
{
  const playerH = { authorization: `Bearer ${playerToken}` };
  const base = (await j('/api/config')).body.activities;

  const cfg0 = await j('/api/config');
  check('配置里带着标签清单，内置两个',
    (cfg0.body.tags || []).filter((x) => x.builtin).map((x) => x.id).join(',') === 'normal,staff',
    JSON.stringify(cfg0.body.tags));

  const made = await j('/api/admin/tags', {
    method: 'POST', headers: adminH, body: { tags: [{ name: '学生' }, { name: '新朋友' }] },
  });
  check('能新增标签', made.status === 200 && (made.body.tags || []).length === 2,
    JSON.stringify(made.body));
  const stu = made.body.tags.find((x) => x.name === '学生').id;
  const fresh = made.body.tags.find((x) => x.name === '新朋友').id;
  const c1 = made.body.tags.find((x) => x.id === stu).color;
  const c2 = made.body.tags.find((x) => x.id === fresh).color;
  check('新标签自动配了颜色，而且两个不撞色',
    /^#[0-9a-f]{6}$/.test(c1 || '') && /^#[0-9a-f]{6}$/.test(c2 || '') && c1 !== c2, `${c1} ${c2}`);
  check('内置标签也带颜色', (cfg0.body.tags || []).filter((x) => x.builtin)
    .every((x) => /^#[0-9a-f]{6}$/.test(x.color || '')), JSON.stringify(cfg0.body.tags));
  check('配置里下发色板', Array.isArray(cfg0.body.tagPalette) && cfg0.body.tagPalette.length >= 8);

  const reserved = await j('/api/admin/tags', {
    method: 'POST', headers: adminH, body: { tags: [{ name: 'staff' }] },
  });
  check('保留名当标签名被拒', reserved.status === 400, JSON.stringify(reserved.body));
  const dup = await j('/api/admin/tags', {
    method: 'POST', headers: adminH, body: { tags: [{ name: '甲' }, { name: '甲' }] },
  });
  check('同名标签被拒', dup.status === 400, JSON.stringify(dup.body));

  // 挂两个标签
  const tagged = await j(`/api/admin/player/${player.id}/tags`, {
    method: 'POST', headers: adminH, body: { tags: [stu, fresh] },
  });
  check('一个人能同时挂多个标签', tagged.status === 200
    && (tagged.body.player.tags || []).length === 2, JSON.stringify(tagged.body.player?.tags));

  // 两场活动各限定一个标签 —— 命中任一就该看得见
  const restricted = base.map((a) => {
    if (a.id === 'easter') return { ...a, audience: 'tags', audienceTags: [stu] };
    if (a.id === 'serve') return { ...a, audience: 'tags', audienceTags: [fresh] };
    return { ...a, audience: 'all', audienceTags: [] };
  });
  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: restricted } });

  const mine = await j('/api/me', { headers: playerH });
  check('挂了标签的人，两场限定活动都看得见',
    mine.body.player.stationsTotal === base.length,
    `分母 ${mine.body.player.stationsTotal} / 共 ${base.length}`);

  // 另开一个没标签的人做对照
  const other = await j('/api/register', { method: 'POST', body: { name: '没标签的人' } });
  const otherMe = await j('/api/me', { headers: { authorization: `Bearer ${other.body.token}` } });
  check('没标签的人看不到那两场',
    otherMe.body.player.stationsTotal === base.length - 2,
    `分母 ${otherMe.body.player.stationsTotal}`);

  // 没标签的人盖不上，理由要提标签
  const blocked = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'op-tag-001', type: 'score', playerId: other.body.player.id,
                    stationId: 'easter', points: 1, checkin: true }], since: 0 },
  });
  check('标签不符的人盖不上章', blocked.body.results[0].status === 'error',
    JSON.stringify(blocked.body.results[0]));
  check('拒绝理由提到标签', String(blocked.body.results[0].message || '').includes('标签'),
    blocked.body.results[0].message);

  // 改名不丢挂载
  const renamed = await j('/api/admin/tags', {
    method: 'POST', headers: adminH,
    body: { tags: [{ id: stu, name: '学生们' }, { id: fresh, name: '新朋友' }] },
  });
  check('改名成功', renamed.status === 200
    && renamed.body.tags.find((x) => x.id === stu)?.name === '学生们');
  const afterRename = await j('/api/me', { headers: playerH });
  check('改名不影响挂载', (afterRename.body.player.tags || []).includes(stu));
  check('改名时不带颜色，颜色保持原样', renamed.body.tags.find((x) => x.id === stu)?.color === c1,
    JSON.stringify(renamed.body.tags));
  const recolor = await j('/api/admin/tags', {
    method: 'POST', headers: adminH,
    body: { tags: [{ id: stu, name: '学生们', color: '#FF9B8A' }, { id: fresh, name: '新朋友', color: 'red;background:url(x)' }] },
  });
  check('能手动换颜色（大写也认，存成小写）', recolor.body.tags.find((x) => x.id === stu)?.color === '#ff9b8a',
    JSON.stringify(recolor.body.tags));
  check('不合法的颜色不会被存进去，沿用原来的', recolor.body.tags.find((x) => x.id === fresh)?.color === c2,
    JSON.stringify(recolor.body.tags));

  // 删掉「学生」：挂载要清掉，而且用它限定的活动要退回所有人可见
  const epochBefore = (await j('/api/staff/sync', {
    method: 'POST', headers: staffH, body: { ops: [], since: 0 },
  })).body.epoch;
  const dropped = await j('/api/admin/tags', {
    method: 'POST', headers: adminH, body: { tags: [{ id: fresh, name: '新朋友' }] },
  });
  check('删标签后清单里只剩一个', (dropped.body.tags || []).length === 1);
  check('删标签会递增纪元（一批人的可见活动变了）', dropped.body.epoch !== epochBefore,
    `${epochBefore} → ${dropped.body.epoch}`);

  const afterDrop = await j('/api/me', { headers: playerH });
  check('删掉的标签从人身上一并取下', !(afterDrop.body.player.tags || []).includes(stu),
    JSON.stringify(afterDrop.body.player.tags));

  const acts = (await j('/api/config')).body.activities;
  const easter = acts.find((a) => a.id === 'easter');
  check('用它限定可见范围的活动退回所有人可见，而不是谁都看不见',
    easter.audience === 'all' && (easter.audienceTags || []).length === 0,
    `${easter.audience} ${JSON.stringify(easter.audienceTags)}`);

  // serve 仍限定「新朋友」，而这个人还挂着它
  const stillSees = await j('/api/me', { headers: playerH });
  check('另一个标签不受影响，仍然命中',
    stillSees.body.player.stationsTotal === base.length,
    `分母 ${stillSees.body.player.stationsTotal}`);

  // 一个标签都不勾 → 规整回 all
  await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: acts.map((a) => (a.id === 'serve' ? { ...a, audience: 'tags', audienceTags: [] } : a)) },
  });
  const empty = (await j('/api/config')).body.activities.find((a) => a.id === 'serve');
  check('选了标签模式但一个都没勾 → 退回所有人可见', empty.audience === 'all',
    `${empty.audience} ${JSON.stringify(empty.audienceTags)}`);

  // 还原
  await j('/api/admin/tags', { method: 'POST', headers: adminH, body: { tags: [] } });
  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 27. 文字块的字数上限：3000 字以内原样保存；超出的截到 3000，而且不劈开 emoji
{
  const base = (await j('/api/config')).body.activities;
  const long = '团'.repeat(2999) + '👍';          // 正好 3000 个字，最后一个是 emoji
  const withText = (text) => base.map((a, i) => (i === 0
    ? { ...a, blocks: [{ id: 'len-test', kind: 'text', x: 5, y: 5, w: 50, h: 50, text }] } : a));

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: withText(long) } });
  const kept = (await j('/api/config')).body.activities[0].blocks.find((b) => b.id === 'len-test');
  check('3000 字的文字块原样保存（原来只收 400 字）', kept?.text === long,
    `实际 ${kept ? [...kept.text].length : '无'} 字`);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: withText(long + '多出来的') } });
  const cut = (await j('/api/config')).body.activities[0].blocks.find((b) => b.id === 'len-test');
  check('超过 3000 字截到 3000，结尾的 emoji 没被劈开', cut?.text === long,
    `实际 ${cut ? [...cut.text].length : '无'} 字，结尾 ${cut ? JSON.stringify([...cut.text].slice(-2).join('')) : ''}`);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 28. 同工专属的活动不计入排行榜（护照里本人照常算）
{
  const base = (await j('/api/config')).body.activities;
  const [ONLY, MIXED, NORMAL] = [base[0].id, base[1].id, base[2].id];
  await j('/api/admin/activities', {
    method: 'POST', headers: adminH,
    body: { activities: base.map((a) => {
      if (a.id === ONLY) return { ...a, audience: 'tags', audienceTags: ['staff'] };
      if (a.id === MIXED) return { ...a, audience: 'tags', audienceTags: ['staff', 'normal'] };
      return a;
    }) },
  });

  const staffReg = await j('/api/register', { method: 'POST', body: { name: '排行榜同工' } });
  const normalReg = await j('/api/register', { method: 'POST', body: { name: '排行榜普通' } });
  const sid = staffReg.body.player.id;
  const nid = normalReg.body.player.id;
  await j(`/api/admin/player/${sid}/role`, { method: 'POST', headers: adminH, body: { role: 'staff' } });

  const stamp = (opId, playerId, stationId) => ({ opId, type: 'score', playerId, stationId, points: 1, checkin: true });
  const sync = await j('/api/staff/sync', {
    method: 'POST', headers: staffH,
    body: { ops: [
      stamp('lb-s-only', sid, ONLY), stamp('lb-s-mixed', sid, MIXED), stamp('lb-s-normal', sid, NORMAL),
      stamp('lb-n-mixed', nid, MIXED), stamp('lb-n-normal', nid, NORMAL),
    ], since: 0 },
  });
  check('排行榜测试的五个章都盖上了', sync.body.results.every((r) => r.status === 'ok'),
    JSON.stringify(sync.body.results.map((r) => r.status)));

  const board = (await j('/api/leaderboard')).body.board;
  const sRow = board.find((r) => r.id === sid);
  const nRow = board.find((r) => r.id === nid);
  check('同工专属活动上的章不计入排行榜总数', sRow?.total === 2, `同工榜上 ${sRow?.total}（应为 2：混合 + 普通）`);
  check('也不计入排行榜的场次和分母', sRow?.stationsDone === 2 && sRow?.stationsTotal === base.length - 1,
    `场次 ${sRow?.stationsDone}/${sRow?.stationsTotal}，活动共 ${base.length}`);
  check('「同工 + 其他标签」的活动照常计入', nRow?.total === 2, `普通榜上 ${nRow?.total}`);
  check('去掉同工专属之后两人总数相同，名次并列', sRow?.rank === nRow?.rank, `${sRow?.rank} / ${nRow?.rank}`);

  const staffMe = await j('/api/me', { headers: { authorization: `Bearer ${staffReg.body.token}` } });
  check('护照里本人的总数照常算上同工专属活动', staffMe.body.player.total === 3, `护照总数 ${staffMe.body.player.total}`);
  check('「我的名次」和排行榜一致', staffMe.body.rank === sRow?.rank, `${staffMe.body.rank} / ${sRow?.rank}`);

  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 29. 通知推送：密钥、订阅、按可见范围算收件人（测试环境不真的发网络请求）
{
  const k1 = await j('/api/push/key');
  const k2 = await j('/api/push/key');
  check('能拿到推送公钥', k1.status === 200 && /^[A-Za-z0-9_-]{80,}$/.test(k1.body.publicKey || ''),
    JSON.stringify(k1.body).slice(0, 60));
  check('公钥是固定的，不会每次重新生成', k1.body.publicKey === k2.body.publicKey);
  const cfgText = JSON.stringify((await j('/api/config')).body);
  check('公开配置里不带推送私钥', !cfgText.includes('privateKey') && !cfgText.includes('_vapid'));

  const base = (await j('/api/config')).body.activities;
  const ACT = base[0].id;
  const pa = await j('/api/register', { method: 'POST', body: { name: '推送报名者' } });
  const pb = await j('/api/register', { method: 'POST', body: { name: '推送路人' } });
  const ha = { authorization: `Bearer ${pa.body.token}` };
  const hb = { authorization: `Bearer ${pb.body.token}` };
  const subOf = (tag) => ({ endpoint: `https://push.example.test/${tag}`, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } });

  const anon = await j('/api/push/subscribe', { method: 'POST', body: subOf('anon') });
  check('没登录不能订阅', anon.status === 401, `状态码 ${anon.status}`);
  const bad = await j('/api/push/subscribe', { method: 'POST', headers: ha, body: { endpoint: 'javascript:alert(1)', keys: {} } });
  check('不合法的订阅被拒', bad.status === 400, `状态码 ${bad.status}`);
  const sa = await j('/api/push/subscribe', { method: 'POST', headers: ha, body: subOf('a') });
  const sb = await j('/api/push/subscribe', { method: 'POST', headers: hb, body: subOf('b') });
  check('两个人都订阅成功', sa.status === 200 && sb.status === 200);

  await j('/api/admin/activities', { method: 'POST', headers: adminH,
    body: { activities: base.map((a) => (a.id === ACT ? { ...a, audience: 'all', audienceTags: [], state: 'upcoming' } : a)) } });
  await j(`/api/activity/${ACT}/signup`, { method: 'POST', headers: ha });

  // 推送路人设成同工，用来测「按标签」
  await j(`/api/admin/player/${pb.body.player.id}/role`, { method: 'POST', headers: adminH, body: { role: 'staff' } });

  const pv = await j(`/api/admin/activity/${ACT}/notify?tags=staff`, { headers: adminH });
  check('预览给出三种范围', pv.status === 200 && !!pv.body.all && !!pv.body.signed && !!pv.body.tags, JSON.stringify(pv.body));
  check('预览：全部人 = 两台设备', pv.body.all?.devices === 2, JSON.stringify(pv.body.all));
  check('预览：已报名的人 = 只有报名者那一台', pv.body.signed?.devices === 1 && pv.body.signed?.people === 1, JSON.stringify(pv.body.signed));
  check('预览：按「同工」标签 = 只有同工那一台', pv.body.tags?.devices === 1, JSON.stringify(pv.body.tags));
  const pvNoTags = await j(`/api/admin/activity/${ACT}/notify`, { headers: adminH });
  check('没选标签时预览不给按标签的数', pvNoTags.body.tags === null, JSON.stringify(pvNoTags.body.tags));

  const send = (extra) => j(`/api/admin/activity/${ACT}/notify`, { method: 'POST', headers: adminH, body: { title: '测试通知', ...extra } });
  const sAll = await send({ audience: 'all' });
  check('发给全部人：两台', sAll.status === 200 && sAll.body.devices === 2, JSON.stringify(sAll.body));
  const sSigned = await send({ audience: 'signed' });
  check('发给已报名的人：一台', sSigned.body.devices === 1, JSON.stringify(sSigned.body));
  const sTags = await send({ audience: 'tags', tags: ['staff'] });
  check('按标签发：只发给挂着「同工」的那一台', sTags.body.devices === 1, JSON.stringify(sTags.body));
  // 推送路人没报名，但在这一场盖了章 → 他属于「已参加的人」
  const stampB = await j('/api/staff/sync', { method: 'POST', headers: staffH,
    body: { ops: [{ opId: 'push-attend-b', type: 'score', playerId: pb.body.player.id, stationId: ACT, points: 1, checkin: true }], since: 0 } });
  check('推送路人在这一场盖上章', stampB.body.results?.[0]?.status === 'ok', JSON.stringify(stampB.body.results));
  const pvAttend = await j(`/api/admin/activity/${ACT}/notify`, { headers: adminH });
  // 前面的小节在同一场活动上给别人也盖过章，所以「已参加」的人数不止 1；
  // 但开了通知的只有推送路人这一台
  check('预览：已参加的人里，开了通知的只有盖过章的那一台（没报名也算）',
    pvAttend.body.attended?.devices === 1 && pvAttend.body.attended?.withDevice === 1
    && pvAttend.body.attended?.people >= 1, JSON.stringify(pvAttend.body.attended));
  check('预览：已报名的人不因为别人盖章而变多', pvAttend.body.signed?.devices === 1, JSON.stringify(pvAttend.body.signed));
  const sAttend = await send({ audience: 'attended' });
  check('发给已参加的人：只发盖过章的那一台', sAttend.status === 200 && sAttend.body.audience === 'attended'
    && sAttend.body.devices === 1, JSON.stringify(sAttend.body));
  const sNoTag = await send({ audience: 'tags', tags: [] });
  check('选了按标签却没选标签被拒', sNoTag.status === 400, `状态码 ${sNoTag.status}`);
  const sWeird = await send({ audience: 'everyone!!' });
  check('不认识的范围按已报名处理，不会误发给所有人', sWeird.body.audience === 'signed' && sWeird.body.devices === 1, JSON.stringify(sWeird.body));
  const sDefault = await send({});
  check('不指定范围默认只发已报名的人', sDefault.body.audience === 'signed' && sDefault.body.devices === 1, JSON.stringify(sDefault.body));

  const staffTry = await j(`/api/admin/activity/${ACT}/notify`, { method: 'POST', headers: staffH, body: { title: 'x', audience: 'all' } });
  check('普通同工令牌不能发通知', staffTry.status === 401 || staffTry.status === 403, `状态码 ${staffTry.status}`);
  const playerTry = await j(`/api/admin/activity/${ACT}/notify`, { method: 'POST', headers: ha, body: { title: 'x', audience: 'all' } });
  check('选手令牌不能发通知', playerTry.status === 401 || playerTry.status === 403, `状态码 ${playerTry.status}`);

  const cross = await j('/api/push/unsubscribe', { method: 'POST', headers: hb, body: { endpoint: subOf('a').endpoint } });
  const pv2 = await j(`/api/admin/activity/${ACT}/notify`, { headers: adminH });
  check('不能替别人取消订阅', cross.status === 200 && pv2.body.signed?.devices === 1, JSON.stringify(pv2.body.signed));
  await j('/api/push/unsubscribe', { method: 'POST', headers: ha, body: { endpoint: subOf('a').endpoint } });
  const pv3 = await j(`/api/admin/activity/${ACT}/notify`, { headers: adminH });
  check('报名者取消订阅后，已报名的人里就没有设备可发了', pv3.body.signed?.devices === 0 && pv3.body.all?.devices === 1,
    JSON.stringify(pv3.body));

  await j('/api/push/unsubscribe', { method: 'POST', headers: hb, body: { endpoint: subOf('b').endpoint } });
  await j('/api/push/unsubscribe', { method: 'POST', headers: ha, body: { endpoint: subOf('a').endpoint } });
  await j(`/api/activity/${ACT}/signup`, { method: 'DELETE', headers: ha });
  await j('/api/admin/activities', { method: 'POST', headers: adminH, body: { activities: base } });
}

// 30. 使用情况统计：白名单、按人/按设备去重、鉴权、单批上限、删人后不再指向这个人
{
  console.log('\n— 使用情况统计 —');
  const cfgU = await j('/api/config');
  const ACT = cfgU.body.activities[0].id;
  const stamp = Date.now().toString(36);
  const pu = await j('/api/register', {
    method: 'POST', body: { name: `统计测试${stamp}`, avatar: { skin: 1 }, pin: '1357', confirmNew: true },
  });
  const tokenU = pu.body.token;
  const devA = `devA-${stamp}`;
  const devB = `devB-${stamp}`;
  const beacon = async (body) => {
    const r = await fetch(BASE + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const report = (days = 7) => j(`/api/admin/usage?days=${days}`, { headers: adminH });

  const before = await report();
  check('管理员能看使用情况', before.status === 200 && before.body.series?.length === 7 && before.body.retentionDays === 180,
    JSON.stringify(before.body)?.slice(0, 200));

  const r1 = await beacon({ d: devA, t: tokenU, e: [
    { n: 'open', l: 'passport' }, { n: 'visa', a: ACT }, { n: 'visa', a: ACT }, { n: 'board' },
    { n: 'guide', ts: Date.now() + 10 * 86_400_000 }, { n: 'qr', ts: Date.now() - 30 * 86_400_000 },
    { n: 'hack_me' }, { n: 'join', a: '../etc/passwd' },
  ] });
  check('sendBeacon 的 text/plain 能收，名单外的事件丢掉', r1.status === 200 && r1.body.accepted === 7 && r1.body.dropped === 1,
    JSON.stringify(r1.body));
  const r2 = await beacon({ d: devB, e: [{ n: 'open', l: 'join' }, { n: 'join', a: ACT }] });
  const r3 = await j('/api/t', { method: 'POST', body: { d: devB, e: [{ n: 'join', a: ACT }] } });
  check('没登录的访客和 JSON 格式也能收', r2.body?.accepted === 2 && r3.body?.accepted === 1, `${JSON.stringify(r2.body)} ${JSON.stringify(r3.body)}`);
  const fake = await beacon({ d: devA, t: 'not-a-real-token', e: [{ n: 'board' }] });
  const badDev = await beacon({ d: 'x', e: [{ n: 'open' }] });
  check('设备号不合格整批不收，假令牌不认人但照收', badDev.body?.accepted === 0 && fake.body?.accepted === 1,
    `${JSON.stringify(badDev.body)} ${JSON.stringify(fake.body)}`);
  const junk = await beacon({ d: devB, e: 'nope' });
  const notJson = await fetch(BASE + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{oops' });
  check('格式不对不会报错崩掉', junk.status === 200 && junk.body.accepted === 0 && notJson.status === 400, `${junk.status} ${notJson.status}`);

  const after = await report();
  const t0 = before.body.series.at(-1);
  const t1 = after.body.series.at(-1);
  check('同一个人点了很多下，活跃用户只加 1', t1.users - t0.users === 1, `${t0.users} → ${t1.users}`);
  check('一直没登录的设备算访客，登录过的设备不重复算', t1.visitors - t0.visitors === 1, `${t0.visitors} → ${t1.visitors}`);
  check('操作次数不含单纯打开网页；时间离谱的记到今天', t1.actions - t0.actions === 9, `${t0.actions} → ${t1.actions}`);
  const actOf = (r) => r.body.activities.find((a) => a.id === ACT) || {};
  check('活动报名页按人数算（坏的活动 id 不算进任何活动）', actOf(after).joinPeople - (actOf(before).joinPeople || 0) === 1,
    JSON.stringify(actOf(after)));
  check('签证页按人数算', actOf(after).visaPeople - (actOf(before).visaPeople || 0) === 1, JSON.stringify(actOf(after)));
  const evOf = (r, name) => r.body.events.find((e) => e.event === name) || { n: 0, people: 0 };
  check('功能排行带中文名和次数', evOf(after, 'visa').n - evOf(before, 'visa').n === 2 && evOf(after, 'visa').label === '看活动签证页',
    JSON.stringify(evOf(after, 'visa')));
  check('不认识的范围按 30 天算', (await report(13)).body.days === 30);

  const noAuth = await j('/api/admin/usage');
  const staffTry = await j('/api/admin/usage', { headers: staffH });
  const playerTry = await j('/api/admin/usage', { headers: { authorization: `Bearer ${tokenU}` } });
  check('只有管理员能看使用情况', noAuth.status === 401 && staffTry.status === 403 && playerTry.status === 401,
    `${noAuth.status} ${staffTry.status} ${playerTry.status}`);

  const big = await beacon({ d: `devC-${stamp}`, e: Array.from({ length: 60 }, () => ({ n: 'board' })) });
  check('单批最多收 50 条', big.body.accepted === 50 && big.body.dropped === 10, JSON.stringify(big.body));

  const del = await j(`/api/admin/player/${pu.body.player.id}`, { method: 'DELETE', headers: adminH });
  const gone = await report();
  const t2 = gone.body.series.at(-1);
  check('删掉用户后统计还在，但不再指向这个人', del.status === 200 && t2.users === t0.users && t2.visitors - t0.visitors === 3,
    `${del.status} users ${t2.users} visitors ${t0.visitors} → ${t2.visitors}`);
}

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
