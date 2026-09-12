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
  check('活动能标成仅同工可见', savedAudience.status === 200
    && savedAudience.body.activities[0].audience === 'staff');

  const anonHidden = await j(`/api/activity/${target.id}`);
  const normalHidden = await j(`/api/activity/${target.id}`, { headers: playerH });
  check('同工专属活动对普通用户和匿名访问都隐藏', anonHidden.status === 404 && normalHidden.status === 404);

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

console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
