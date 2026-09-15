import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import IconPicker from '../components/IconPicker.jsx';
import DateField from '../components/DateField.jsx';
import { NetBar, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { copyText, copyImageBlob } from '../lib/clipboard.js';
import { useConfig, loadConfig, allTags, activityVisibleTo, playerTags, tagChipStyle } from '../lib/config.js';
import { useStaff, allPlayers, queueOp, settleOps, issueFor } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';
import { onTick } from '../lib/realtime.js';
import QRCode from 'qrcode';

/**
 * 一场活动的详情页。
 *
 * 打卡本里「一场活动」就是一切的中心 —— 护照上的一页、同工要盖的那个章、
 * 现在开不开放报名，全都长在它身上。所以总控台只留一份活动清单，
 * 点进来才是这一场的全部。
 *
 * 活动清单在服务端是整份存的（settings 的 _activities），所以这里改一场
 * 也是把整份提交回去 —— 少一个「只改一场」的接口，也就少一处能和清单
 * 顺序打架的地方。
 */

const STATE_META = {
  upcoming: { icon: '🗓', label: '报名中', hint: '活动还没开始，活动二维码接受报名；任何人也都可以随时领取护照。' },
  live:     { icon: '🎯', label: '进行中', hint: '线上报名自动截止，同工扫码时默认盖这一场。迟到的人请直接找现场同工。' },
  done:     { icon: '✅', label: '已结束', hint: '不再接受报名，已有报名与护照印章会继续保留。' },
};

export default function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();

  async function copyContact(v) {
    const ok = await copyText(v);
    toast(ok ? '联系方式已复制' : '复制不了，长按自己选', ok ? 'ok' : 'warn');
  }

  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;

  const [busy, setBusy] = useState(null);
  const tagChoices = allTags(config);
  const [draft, setDraft] = useState(null);      // 这一场的本地改动，null = 还没载入
  const [dirty, setDirty] = useState(false);
  // 每次本地编辑都递增。保存返回时只清理它真正保存过的那一版，
  // 不能拿网络响应覆盖请求发出后用户继续输入的新内容。
  const editVersion = useRef(0);
  const failedAutoVersion = useRef(null);

  const activities = config?.activities || [];
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line

  useEffect(() => {
    if (dirty) return;
    const hit = activities.find((a) => a.id === id);
    if (hit) setDraft(JSON.parse(JSON.stringify(hit)));
    // dirty 从 true 变 false 时不要立刻用旧 config 回填；等 loadConfig
    // 真正带回刚保存的数据后，activities 改变再同步。
  }, [activities, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  /* --------------------------- 报名 --------------------------- */

  const [signups, setSignups] = useState([]);
  const qrRef = React.useRef(null);   // 复制二维码要拿到 canvas

  /* ---- 通知推送 ----
   * 发给谁由同工每次自己选：全部人 / 已报名的人 / 按标签。
   * 新活动刚建好时往往还没人报名，所以没人报名时默认「全部人」，有人报名后默认「已报名的人」。
   * 手动点「发送」才发，不跟着自动保存发 —— 详情页边改边存，自动发的话改一个字就推一条。
   */
  const [pushTitle, setPushTitle] = useState(null);   // null = 用默认
  const [pushBody, setPushBody] = useState(null);
  const [pushAudiencePicked, setPushAudience] = useState(null);   // null = 按有没有人报名自动选
  const [pushTags, setPushTags] = useState([]);
  const [pushPreview, setPushPreview] = useState(null);
  const pushAudience = pushAudiencePicked ?? (signups.length ? 'signed' : 'all');
  const pushTagKey = pushTags.join(',');

  // 手动点「保存」成功后问一句要不要发通知（自动保存不问，否则改一个字问一次）。
  // 从画板保存后跳过来的带 #notify，推送卡片一挂上就滚过去。
  const pushCardRef = React.useRef(null);
  const wantPushCard = React.useRef(typeof window !== 'undefined' && window.location.hash === '#notify');
  const openPushCard = React.useCallback(() => {
    const el = pushCardRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.querySelector('input')?.focus({ preventScroll: true }), 450);
  }, []);
  const attachPushCard = React.useCallback((el) => {
    pushCardRef.current = el;
    if (el && wantPushCard.current) {
      wantPushCard.current = false;
      setTimeout(openPushCard, 150);
    }
  }, [openPushCard]);
  async function saveAndAsk() {
    if (!(await save())) return;
    const go = await ask({
      title: '要推送通知告诉大家吗？',
      body: '活动信息已经保存。要不要发一条通知提醒大家？下一步可以选发给谁、改标题和内容，发送前还会再确认一次。',
      confirmText: '去写通知',
    });
    if (go) openPushCard();
  }
  const loadPushPreview = React.useCallback(() => {
    if (!token) return;
    const q = pushTagKey ? `?tags=${encodeURIComponent(pushTagKey)}` : '';
    api(`/api/admin/activity/${id}/notify${q}`, { token }).then(setPushPreview).catch(() => {});
  }, [id, token, pushTagKey]);
  useEffect(() => { loadPushPreview(); }, [loadPushPreview]);

  const PUSH_AUDIENCE = { all: '全部人', signed: '已报名的人', attended: '已参加的人', tags: '按标签' };
  const pushWhoLabel = () => (pushAudience === 'tags'
    ? `挂着「${pushTags.map((x) => tagChoices.find((tg) => tg.id === x)?.name || x).join('、')}」的人`
    : PUSH_AUDIENCE[pushAudience]);

  async function sendPush(defaults) {
    const title = (pushTitle ?? defaults.title).trim();
    const body = (pushBody ?? defaults.body).trim();
    const who = pushPreview?.[pushAudience];
    const ok = await ask({
      title: `发给${pushWhoLabel()}里开了通知的 ${who?.withDevice ?? 0} 人（${who?.devices ?? 0} 台设备）？`,
      body: `「${title}」${body ? `\n${body}` : ''}\n\n通知发出去就收不回来了。`,
    });
    if (!ok) return;
    setBusy('push');
    try {
      const r = await api(`/api/admin/activity/${id}/notify`, {
        method: 'POST', token,
        body: { title, body, audience: pushAudience, tags: pushAudience === 'tags' ? pushTags : [] },
      });
      toast(r.failed ? `发出 ${r.sent} 条，${r.failed} 条没发出去` : `已发出 ${r.sent} 条通知`, r.failed ? 'warn' : 'ok');
      loadPushPreview();
    } catch (err) {
      toast(err.message || '发送失败', 'err');
    } finally {
      setBusy(null);
    }
  }
  const [checking, setChecking] = useState(null);   // 正在签到的人 id，或 'all'

  /**
   * 签到 = 盖章。
   *
   * 走的是同工端那条盖章通道（queueOp），所以离线也排得住、重复点也只算一次
   * （服务端那条「一场只盖一次」的唯一索引挡着）。给 1 分是为了让总分等于
   * 参加过几场，章上写的是「已参加」。
   *
   * queueOp 只保证「进了队列」，服务端认不认要等这一趟同步回来 —— 必须
   * flush 之后用 issueFor 查，否则被拒的操作（比如这一场的可见范围不含他的
   * 标签）界面上照样显示成功，而那一行永远不会变。
   */
  async function checkIn(p) {
    setChecking(p.id);
    try {
      const op = await queueOp({
        type: 'score', playerId: p.id, stationId: id, points: 1, checkin: true, note: '活动页签到',
      });
      // 等这一笔真的有结论（不能只 await 一次 flush，见 settleOps 的说明）
      if ((await settleOps([op.opId])).length) {
        toast('网络不通，已记下，联网后自动上传', 'warn');
        return;
      }
      const bad = issueFor(op.opId);
      if (bad) { toast(bad.message || '服务端没有接受这次签到', 'err'); return; }
      toast(`${p.name} 已参加`, 'ok');
    } catch (err) {
      toast(err.message || '签到失败', 'err');
    } finally {
      setChecking(null);
    }
  }

  /* ---- 签到名单：「已报名」框 ----
   *
   * 只列报名了这一场的人。没报名就来的人不在这里 —— 扫他的码，或者去
   * 「👥 用户」里标记。
   */
  const [ciQuery, setCiQuery] = useState('');
  // 可见范围用已经保存到服务端的那份判 —— 草稿里还没保存的改动服务端不认
  const savedActivity = useMemo(
    () => (config?.activities || []).find((a) => a.id === id), [config, id]);
  const checkInRoster = useMemo(() => {
    const kw = ciQuery.trim().toLowerCase();
    const tags = allTags(config);
    const signedIds = new Set(signups.map((s) => s.id));
    // 没报名但已经盖了章的人也要列出来 —— 实际用法是不报名直接来盖章
    // （第一次团契 0 报名 / 8 个章），只列报名者的话这一框是空的、已签到是 0。
    // 按盖章时间排在报名者后面
    const walkIns = players
      .filter((p) => p.stations?.[id] && !signedIds.has(p.id))
      .sort((a, b) => a.stations[id].at - b.stations[id].at);
    return [
      // 报名接口只给基本资料；章、标签、角色在同工端花名册里，合起来用
      ...signups.map((s) => ({ ...s, ...(players.find((x) => x.id === s.id) || {}), signed: true })),
      ...walkIns.map((p) => ({ ...p, signed: false })),
    ]
      .filter((p) => !kw || [p.name, p.code, p.contact,
        ...(p.tags || []).map((x) => tags.find((tg) => tg.id === x)?.name || '')]
        .some((v) => String(v || '').toLowerCase().includes(kw)))
      .map((p) => ({
        ...p,
        done: !!p.stations?.[id],
        // 报名之后活动才被限定了标签，就会出现「报了名但盖不上章」的人
        eligible: !savedActivity || activityVisibleTo(savedActivity, playerTags(p), p.signups || [id]),
      }));
    // 保持报名顺序，**不按签到状态排** —— 点一行它就跳走的话，门口往下点会点错人
  }, [signups, players, ciQuery, config, savedActivity, id]);
  const pendingCheckIn = useMemo(
    () => checkInRoster.filter((p) => !p.done && p.eligible), [checkInRoster]);

  /* ---- 未报名：其他用户 ----
   *
   * 既没报名、也还没在这一场盖章的人。没报名直接来的人在这里找，点「签到」
   * 就是盖章 —— 盖完他就满足「已盖章」，自动挪到上面「已报名」那一框（标「未报名」）。
   * 不在可见范围里的人不列出：服务端不会收他的章，列出来只会给一个点了没用的按钮。
   * 这一框**不做一键全签到** —— 那会给所有没来的人都盖上章，而且撤不掉。
   */
  const [wiQuery, setWiQuery] = useState('');
  const walkIn = useMemo(() => {
    const signedIds = new Set(signups.map((s) => s.id));
    const pool = players.filter((p) => !signedIds.has(p.id) && !p.stations?.[id]);
    const eligible = pool.filter((p) => !savedActivity
      || activityVisibleTo(savedActivity, playerTags(p), p.signups || []));
    const kw = wiQuery.trim().toLowerCase();
    const tags = allTags(config);
    const shown = eligible
      .filter((p) => !kw || [p.name, p.code, p.contact,
        ...(p.tags || []).map((x) => tags.find((tg) => tg.id === x)?.name || '')]
        .some((v) => String(v || '').toLowerCase().includes(kw)))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return { shown, total: eligible.length, hidden: pool.length - eligible.length };
  }, [players, signups, id, savedActivity, wiQuery, config]);


  /**
   * 一键全签到。
   *
   * 逐个排队再一次 flush，而不是一个个等 —— 门口二三十人，一个个来太慢。
   * 结果要逐条查：可能只有一部分被拒（标签不符），笼统报一句「已全部签到」
   * 是在撒谎。
   */
  async function checkInAll() {
    if (!pendingCheckIn.length) return;
    const ok = await ask({
      title: `给${ciQuery.trim() ? `搜到的「${ciQuery.trim()}」里` : '列表里'}还没参加的 ${pendingCheckIn.length} 人全部签到？`,
      body: '章盖下去就撤不掉了 —— 那是一条写进记录的事实，不是可以来回拨的开关。'
        + '只会给还没签到的人盖，已经签到的不动。',
    });
    if (!ok) return;
    setChecking('all');
    try {
      const ops = [];
      for (const p of pendingCheckIn) {
        ops.push({ p, op: await queueOp({
          type: 'score', playerId: p.id, stationId: id, points: 1, checkin: true, note: '活动页一键签到',
        }) });
      }
      const unsettled = await settleOps(ops.map(({ op }) => op.opId));
      if (unsettled.length) {
        toast(`网络不通，${unsettled.length} 个章还没上传，联网后自动补上`, 'warn');
        return;
      }
      const failed = ops.map(({ p, op }) => ({ p, bad: issueFor(op.opId) })).filter((x) => x.bad);
      const done = ops.length - failed.length;
      if (!failed.length) { toast(`${done} 人都已标为已参加`, 'ok'); return; }
      // 说清楚是谁、为什么 —— 只报个数字的话，同工不知道该去补谁
      toast(`${done} 人已标为已参加，${failed.length} 人没成：`
        + failed.slice(0, 3).map((x) => x.p.name).join('、')
        + (failed.length > 3 ? ' 等' : '')
        + `（${failed[0].bad.message || '服务端拒绝'}）`, 'err');
    } catch (err) {
      toast(err.message || '批量签到失败', 'err');
    } finally {
      setChecking(null);
    }
  }
  // 二维码要给参与者扫，所以用服务端下发的分享域名（同工端在 staff. 子域上，
  // 印着那个域名的码会把人领到同工端入口）。本地开发时服务端给空串，退回自己的 origin
  const joinUrl = `${config?.shareOrigin || window.location.origin}/join/${id}`;

  useEffect(() => {
    if (!token) return;
    const pull = () => api(`/api/admin/activity/${id}/signups`, { token })
      .then((r) => setSignups(r.signups || [])).catch(() => {});
    pull();
    const off = onTick((p) => { if (p.reason === 'signup') pull(); });
    const timer = setInterval(pull, 20_000);
    return () => { off(); clearInterval(timer); };
  }, [id, token]);

  /** 这一场谁盖过章 —— 顺便就是「谁来了」 */
  const attended = useMemo(() => players
    .filter((p) => p.stations?.[id])
    .map((p) => ({ ...p, stamp: p.stations[id] }))
    .sort((a, b) => b.stamp.at - a.stamp.at), [players, id]);

  /**
   * 自动保存。
   *
   * 停手两秒多就存一次 —— 这一页全是零碎的输入框（名字、日期、链接、
   * 配图），每改一处都要人记得去按保存，迟早有人改完直接关掉。
   *
   * 只在 dirty 时排，存完 dirty 清掉、定时器自然不再排，不会来回打转。
   * 每次改动都重置定时器，所以打字中途不会插进来存一半。
   * 保存按钮留着：想立刻落盘、或者自动保存失败过一次，还得有个手动的。
   *
   * 位置必须在所有早退（!config / !draft）之前 —— hook 写在条件返回
   * 后面的话，走早退那一支时 hook 数量对不上，整页直接白掉（React #310）。
   * save 是函数声明，会提升，在这儿引用没问题。
   */
  useEffect(() => {
    if (!dirty || busy || failedAutoVersion.current === editVersion.current) return;
    const t = setTimeout(() => { save({}, { quiet: true }); }, 2400);
    return () => clearTimeout(t);
  }, [draft, dirty, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) return <div className="page staff-page"><NetBar /><div className="dim">正在载入…</div></div>;
  if (!draft) {
    return (
      <div className="page staff-page">
        <NetBar />
        <div className="card stack">
          <div className="section-title">找不到这一场活动</div>
          <div className="tiny dim">它可能刚被别人删掉了。</div>
          <Link className="btn btn--sm" to="/staff/admin">← 回总控台</Link>
        </div>
      </div>
    );
  }

  const edit = (patch) => {
    editVersion.current += 1;
    failedAutoVersion.current = null;
    setDraft((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  // 栏目和版式都在画布编辑器里改了（/staff/admin/a/<id>/design），
  // 这一页只管这一场本身的信息、配图、链接和报名。

  const links = draft.links || [];
  const linkOps = {
    edit: (k, patch) => edit({ links: links.map((l, j) => (j === k ? { ...l, ...patch } : l)) }),
    remove: (k) => edit({ links: links.filter((_, j) => j !== k) }),
    add: () => edit({ links: [...links, { icon: '🔗', label: '', url: '' }] }),
  };

  /** 把这一场的改动写回整份清单 */
  async function save(patch = {}, { quiet = false } = {}) {
    const next = { ...draft, ...patch };
    const savingVersion = editVersion.current;
    setBusy(quiet ? 'autosave' : 'save');
    try {
      // 设成「进行中」的时候顺手把别人降下来 —— 服务端只允许一场，
      // 与其让同工先去别的页面关掉再回来，不如在这里替他做了
      const list = activities.map((a) => {
        if (a.id === id) return next;
        if (next.state === 'live' && a.state === 'live') return { ...a, state: 'done' };
        return a;
      });
      await api('/api/admin/activities', { method: 'POST', body: { activities: list }, token });
      // 请求期间没有新输入，才算全部保存完。若用户还在打字，保留当前 draft
      // 和 dirty；本次结束后定时器会为最新一版再静默保存一次。
      if (editVersion.current === savingVersion) setDirty(false);
      await loadConfig();
      // 自动保存不吐提示：每停手一次弹一个「已保存」，一页填下来能弹十几次。
      // 存没存成看右上角那个按钮就够了（灰掉 = 没有未保存的改动）
      if (!quiet) toast('已保存', 'ok');
      return true;
    } catch (err) {
      // 失败一定要说，自动保存也一样 —— 不吭声的话人以为存上了
      // 同一版失败后不无限自动重试、反复弹错；继续编辑或手动保存会再试。
      failedAutoVersion.current = savingVersion;
      toast(err.message || '保存失败', 'err');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function setState(state) {
    const demoted = state === 'live' ? activities.filter((a) => a.id !== id && a.state === 'live') : [];
    if (demoted.length) {
      const ok = await ask({
        title: `把「${draft.name}」设成进行中？`,
        body: `同时只能有一场进行中，所以「${demoted.map((a) => a.name).join('、')}」会被标成「已办完」。`,
        confirmText: '就这么办',
      });
      if (!ok) return;
    }
    edit({ state });
    await save({ state });
  }

  async function pickPhoto(file) {
    if (!file) return;
    setBusy('photo');
    try {
      const res = await uploadPhoto(file, token);
      edit({ photo: res.url });
      toast(`配图已上传（${Math.round(res.bytes / 1024)}KB），记得保存`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const n = attended.length;
    const ok = await ask({
      title: `删掉「${draft.name}」？`,
      danger: true,
      confirmText: '删掉',
      body: n > 0
        ? `已经有 ${n} 个人在这一场盖过章。删掉之后护照里不再有这一页，那些记录还在数据库里但不会显示。确定要删吗？`
        : '还没有人在这一场盖过章，删掉没有影响。',
    });
    if (!ok) return;
    setBusy('save');
    try {
      await api('/api/admin/activities', {
        method: 'POST', body: { activities: activities.filter((a) => a.id !== id) }, token,
      });
      await loadConfig();
      nav('/staff/admin', { replace: true });
    } catch (err) {
      toast(err.message || '删不掉', 'err');
      setBusy(null);
    }
  }

  const meta = STATE_META[draft.state] || STATE_META.upcoming;

  return (
    <div className="page page--wide staff-page staff-workspace">
      <NetBar />

      {/* 宽屏：标题在左、按钮在右。窄屏（手机）：第一行「返回 + 活动名」，
          第二行三个按钮铺满整行、和下面的卡片左右对齐 —— 原来按钮换行后
          靠右挂着、宽窄不一，看起来像没排好。样式见 styles.css 的 .detail-head */}
      <div className="detail-head">
        <div className="detail-head__title">
          {/* 返回是这一页最常按的东西之一（看完一场回去看下一场），
              原来是标题上面一行 tiny dim 的小字，又小又难点 */}
          <Link className="btn btn--sm btn--ghost detail-head__back" to="/staff/admin">
            ← 总控台
          </Link>
          <h1>
            <span style={{ marginRight: 8 }}>{draft.icon}</span>
            {draft.name || '（还没起名字）'}
          </h1>
        </div>
        {/* 设计和删掉各自只有一个动作，不值得各占一张卡 */}
        <div className="detail-head__actions">
          <Link className="btn btn--sm btn--ghost" to={`/staff/admin/a/${id}/design`}>🎨 设计这一页</Link>
          {/* 自动保存已经在管了，这个按钮是给「想立刻落盘」和
              「自动保存失败过一次」留的 */}
          <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty}
            onClick={saveAndAsk} title={dirty ? '立刻保存' : '没有未保存的改动'}>
            💾 保存
          </button>
          <button className="btn btn--sm btn--danger" onClick={remove} disabled={busy === 'save'}
            title={`删掉「${draft.name}」`}>🗑 删除</button>
        </div>
      </div>

      <div className="cols-2">

      {/* 宽屏下分三摞：现在怎么样 / 怎么让人来 / 这一页长什么样。
          不分的话每张卡各占一格，那一行会被最高的报名码撑到五百多，
          矮的两张底下白掉一大片（网格的行高按最高那张算，填不回去） */}
      {/* 宽屏下分三摞。报名单独占最右边一摞 —— 它最高（二维码 + 名单），
          和别的卡挤在一行的话，那一行按它的高度算，旁边就白掉一大片。
          版式和删掉不在这里：各自只有一个动作，做成了右上角的按钮 */}
      {/* 宽屏下分三摞：
            左   这一场是什么（基本信息、链接、配图）
            中   现在怎么样、怎么让人来（状态、报名码）
            右   谁来了 —— 单独一摞，人多了也有地方看（列表自己滚）
          版式和删掉不在这里：各自只有一个动作，做成了右上角的按钮 */}
      <div className="cell-stack">
      {/* 基本信息 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📝 基本信息</div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ flex: '0 0 52px', textAlign: 'center' }}
            value={draft.icon} maxLength={4} aria-label="图标"
            onChange={(e) => edit({ icon: e.target.value })} />
          <input className="input grow" value={draft.name} maxLength={20} placeholder="活动名"
            onChange={(e) => edit({ name: e.target.value })} />
        </div>
        {/* 日期独占一行：它旁边还挂着日历按钮，再和「类型」挤一行的话，
            368px 宽的一栏里日期只剩「13 SEP 20」 */}
        <DateField
          value={draft.date}
          placeholder="日期 YYYY-MM-DD（可留空）"
          onChange={(date) => edit({ date })}
        />
        <div className="field">
          <label className="label" htmlFor="activity-audience">可见范围</label>
          <select id="activity-audience" className="input" value={draft.audience || 'all'}
            onChange={(e) => edit({ audience: e.target.value })}>
            <option value="all">所有人</option>
            <option value="tags">仅指定标签</option>
            <option value="signed">仅报名的人</option>
          </select>
          {draft.audience === 'tags' && (
            <div className="stack-sm">
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {tagChoices.length === 0 && (
                  <div className="tiny dim">还没有标签。先去「👥 用户」那边新增几个。</div>
                )}
                {tagChoices.map((tg) => {
                  const on = (draft.audienceTags || []).includes(tg.id);
                  return (
                    <button
                      key={tg.id}
                      type="button"
                      className={`admin-tag-pick ${on ? 'admin-tag-pick--on' : ''}`}
                      style={tagChipStyle(tg.color, on)}
                      aria-pressed={on}
                      onClick={() => edit({
                        audienceTags: on
                          ? (draft.audienceTags || []).filter((x) => x !== tg.id)
                          : [...(draft.audienceTags || []), tg.id],
                      })}
                    >
                      {on ? '✓ ' : ''}{tg.name}
                    </button>
                  );
                })}
              </div>
              <div className="tiny dim">
                勾中的标签<b>命中任一</b>就看得见 —— 一个人可以同时挂多个标签。
                一个都不勾等于不限制（会自动退回「所有人」，否则这场活动谁都看不见）。
                同工端总控台始终能看到全部活动，这里限制的是参与者的护照和计分。
              </div>
            </div>
          )}
          <div className="tiny dim">
            设为特定角色后，其他角色的护照不会显示这场活动，也不能通过链接报名。
          </div>
          {draft.audience === 'signed' && (
            <div className="tiny dim">
              「仅报名的人」不看角色，看有没有报名：报名后这一页才出现在他的护照里，
              也才计入他的场次；没报名的人看不到，但<b>扫码落地页和报名按钮照常可用</b>
              （否则谁都报不进来）。同工一律可见。
              盖章也跟着这条走 —— 没报名的人在总控台<b>标不了「已参加」</b>，
              先让他报名，或把可见范围改回所有人。
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" value={draft.tag} maxLength={12} placeholder="类型"
            onChange={(e) => edit({ tag: e.target.value })} />
          <input className="input grow" value={draft.host} maxLength={20} placeholder="负责人"
            onChange={(e) => edit({ host: e.target.value })} />
        </div>
        <input className="input" value={draft.en} maxLength={40} placeholder="英文名（选填）"
          onChange={(e) => edit({ en: e.target.value })} />
        {/* 每一栏该填什么就写在灰字提示里，不再在框下面另起一行解释 ——
            解释常年占着地方，而真正要看它的只有第一次填的那一下 */}
        <input className="input" value={draft.issuer || ''} maxLength={24}
          placeholder="签发机构（留空用护照模版上的；控制号那栏印「机构 + 日期」）"
          onChange={(e) => edit({ issuer: e.target.value })} />
        <textarea className="input" rows={4} value={draft.desc} maxLength={200}
          placeholder="这场活动是什么。印在签证页的备注栏里，翻到这一页就看到这段。"
          onChange={(e) => edit({ desc: e.target.value })}
          // 浏览器的 maxLength 会把超出的粘贴内容悄悄吞掉，得在粘贴那一下说出来
          onPaste={(e) => {
            const el = e.currentTarget;
            const pasted = e.clipboardData?.getData('text') || '';
            const after = el.value.length - (el.selectionEnd - el.selectionStart) + pasted.length;
            if (after > 200) toast(`描述最多 200 字，这次粘贴超出了 ${after - 200} 字，超出的部分没有进来。长内容请放到画布的文字块里（最多 3000 字）`, 'warn');
          }}
          style={{ resize: 'vertical', minHeight: 92, lineHeight: 1.7 }} />
        <div className="tiny dim" style={{ textAlign: 'right', marginTop: -6 }}>{(draft.desc || '').length} / 200</div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />
        <div className="section-title">🔗 页面链接（{links.length}）</div>
        <div className="tiny dim">
          印成签证页底下一排可点的小图标 —— 相册、报名表、场地地图、群。
          地址要以 http:// 或 https:// 开头。
        </div>
        <div className="stack-sm">
          {links.map((l, k) => (
            <div key={k} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <IconPicker
                value={l.icon} label={l.label}
                onChange={(patch) => linkOps.edit(k, patch)}
              />
              <input className="input" style={{ flex: '1 1 90px' }}
                value={l.label} maxLength={12} placeholder="名字"
                onChange={(e) => linkOps.edit(k, { label: e.target.value })} />
              <input className="input" style={{ flex: '3 1 160px' }} value={l.url} maxLength={300}
                placeholder="https://…" inputMode="url"
                onChange={(e) => linkOps.edit(k, { url: e.target.value })} />
              <button className="btn btn--sm btn--ghost" onClick={() => linkOps.remove(k)} title="删掉">✕</button>
            </div>
          ))}
          {links.length < 6 && (
            <button className="btn btn--sm btn--ghost" onClick={linkOps.add}>+ 加一个链接</button>
          )}
        </div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />
        <div className="section-title">🖼 配图</div>
        <div className="tiny dim">贴在签证页右上角，横构图最好看。上传完还要点保存才算数。</div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div style={{
            flex: '0 0 120px', height: 76, border: '1px solid var(--line)', borderRadius: 3,
            overflow: 'hidden', background: 'var(--ink-3)',
            backgroundImage: draft.photo ? `url("${draft.photo}")` : 'none',
            // contain 而不是 cover：这一块是给人确认「我传上去的是什么」的，
            // 裁着显示会让人以为图就是那样
            backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!draft.photo && <span className="tiny dim">无图</span>}
          </div>
          <div className="stack-sm grow">
            <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
              {busy === 'photo' ? '上传中…' : draft.photo ? '换一张' : '＋ 选一张图'}
              <input type="file" accept="image/*" hidden disabled={busy === 'photo'}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickPhoto(f); }} />
            </label>
            {draft.photo && (
              <button className="btn btn--sm btn--ghost" onClick={() => edit({ photo: '' })}>去掉</button>
            )}
          </div>
        </div>
      </div>
      </div>

      <div className="cell-stack">
      {/* 这一场的状态 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🎯 这一场</div>
        <div className="row" style={{ gap: 8 }}>
          {Object.entries(STATE_META).map(([k, m]) => (
            <button
              key={k}
              className={`btn btn--sm grow ${draft.state === k ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy === 'save'}
              onClick={() => setState(k)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="tiny dim">{meta.hint}</div>

        <div className="card card--tight">
          <div className="small bold">报名规则跟随这一场的状态</div>
          <div className="tiny dim">
            报名中可以扫码报名；切到进行中会自动截止报名；已结束只保留记录。
            领取人生护照始终开放，不受这里影响。
          </div>
        </div>
      </div>
      {/* 通知推送 */}
      {(() => {
        const defaults = {
          title: `「${draft.name || '活动'}」有新消息`.slice(0, 60),
          body: `${draft.date ? `${draft.date} · ` : ''}${(draft.desc || '点开看看这场活动').slice(0, 80)}`,
        };
        const needTags = pushAudience === 'tags' && pushTags.length === 0;
        const who = needTags ? null : pushPreview?.[pushAudience];
        const hint = {
          all: '所有领了护照的人 —— 不管报没报名、看不看得到这场活动。适合新活动刚发布、还没人报名的时候。',
          signed: '只发给报了名这一场的人。适合时间、地点有变动的时候。',
              attended: '在这一场盖过章的人 —— 不管有没有报名。适合活动后发照片、总结的时候。',
          tags: '挂着所选任一标签的人（一个人可以挂多个标签，挂中一个就会收到）。',
        }[pushAudience];
        return (
          <div className="card stack" style={{ marginBottom: 12 }} id="notify" ref={attachPushCard}>
            <div className="section-title">📣 通知推送</div>
            <input className="input" maxLength={60} aria-label="通知标题" placeholder="通知标题"
              value={pushTitle ?? defaults.title} onChange={(e) => setPushTitle(e.target.value)} />
            <textarea className="input" rows={3} maxLength={200} aria-label="通知内容" placeholder="通知内容（选填）"
              style={{ resize: 'vertical', lineHeight: 1.6 }}
              value={pushBody ?? defaults.body} onChange={(e) => setPushBody(e.target.value)} />
            <div className="tiny dim">发给谁</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(PUSH_AUDIENCE).map(([k, label]) => (
                <button key={k} type="button"
                  className={`btn btn--sm grow ${pushAudience === k ? 'btn--primary' : 'btn--ghost'}`}
                  aria-pressed={pushAudience === k}
                  onClick={() => setPushAudience(k)}>{label}</button>
              ))}
            </div>
            {pushAudience === 'tags' && (
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {tagChoices.map((tg) => {
                  const on = pushTags.includes(tg.id);
                  return (
                    <button key={tg.id} type="button"
                      className={`admin-tag-pick ${on ? 'admin-tag-pick--on' : ''}`}
                      aria-pressed={on}
                      style={tagChipStyle(tg.color, on)}
                      onClick={() => setPushTags(on ? pushTags.filter((x) => x !== tg.id) : [...pushTags, tg.id])}>
                      {on ? '✓ ' : ''}{tg.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="tiny dim">{hint}</div>
            <div className="tiny dim">
              {needTags ? '先选至少一个标签。'
                : !who ? '正在统计会发给谁…'
                : who.people === 0 ? '这个范围里没有人，暂时发不出去。'
                : who.devices === 0 ? `这 ${who.people} 人里还没有人开启通知，暂时发不出去。`
                : `会发给这 ${who.people} 人里开了通知的 ${who.withDevice} 人（${who.devices} 台设备）。`}
            </div>
            <button type="button" className="btn btn--primary"
              disabled={busy === 'push' || !(pushTitle ?? defaults.title).trim() || needTags || !who || who.devices === 0}
              onClick={() => sendPush(defaults)}>
              {busy === 'push' ? '发送中…' : '📣 发送通知'}
            </button>
            <div className="tiny dim">
              大家要先在护照顶部点 🔔 开启通知才收得到。安卓 Chrome 直接开；iPhone 要先把网页「添加到主屏幕」、从主屏幕图标打开。
              点通知会打开这场活动的页面。
            </div>
          </div>
        );
      })()}
      {/* 报名 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📣 报名（{signups.length}）</div>
        <div className="tiny dim">
          把这个码贴出去 / 投到屏幕上，大家扫了就能报名。没有护照的人会先领一本，
          领完自动报上 —— 所以活动当天同工扫码盖章时，人是对得上的。
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto', background: '#fff', padding: 8, borderRadius: 4 }}>
            <JoinQR url={joinUrl} canvasRef={qrRef} />
          </div>
          <div className="stack-sm grow" style={{ minWidth: 180 }}>
            <div className="tiny dim">扫不了就发这个链接：</div>
            <input className="input" readOnly value={joinUrl} onFocus={(e) => e.target.select()} />
            <button
              className="btn btn--sm btn--ghost"
              onClick={async () => {
                // 原来直接 navigator.clipboard?.writeText(...).then(...)：
                // 没有 clipboard 时 ?. 返回 undefined，再 .then 就抛 TypeError
                const ok = await copyText(joinUrl);
                toast(ok ? '链接已复制' : '复制不了，长按上面那行自己选', ok ? 'ok' : 'warn');
              }}
            >
              复制链接
            </button>
            <button
              className="btn btn--sm btn--ghost"
              onClick={async () => {
                const canvas = qrRef.current;
                if (!canvas) return;
                // **不要先 await**：Safari 要求 clipboard.write 在手势那一刻同步
                // 发起，等一个 toBlob 回来就晚了。把 Promise 直接交给 ClipboardItem
                const blob = new Promise((r) => canvas.toBlob(r, 'image/png'));
                if (await copyImageBlob(blob)) { toast('二维码已复制，可直接粘到微信', 'ok'); return; }
                // 复制图片要安全上下文（https 或 localhost）。局域网 http:// 打开时
                // 整个 API 不存在 —— 退一步复制链接，总比什么都没发生好
                const ok = await copyText(joinUrl);
                toast(ok ? '这个浏览器复制不了图片，已改为复制链接' : '复制不了，长按二维码自己保存', 'warn');
              }}
            >
              复制二维码
            </button>
            <a className="btn btn--sm btn--ghost" href={joinUrl} target="_blank" rel="noopener noreferrer">
              看看别人扫到什么 →
            </a>
          </div>
        </div>

      </div>
      </div>

      <div className="cell-stack">
      {/* 已报名 + 签到：报了名的人都在这里，点一下就是盖章 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">
          📋 已报名（{signups.length}）· 已参加 {attended.length}
        </div>
        {signups.length === 0 && attended.length === 0 ? (
          <div className="tiny dim">还没有人报名，也还没有人盖章。把报名码发出去，报了名或盖了章的人会出现在这里。</div>
        ) : (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input
                className="input grow"
                type="search"
                value={ciQuery}
                onChange={(e) => setCiQuery(e.target.value)}
                placeholder="搜名字、编号或标签"
                aria-label="搜索要签到的人"
              />
              <button
                type="button"
                className="btn btn--sm btn--primary"
                style={{ flex: '0 0 auto' }}
                disabled={!!checking || pendingCheckIn.length === 0}
                onClick={checkInAll}
              >
                {checking === 'all' ? '签到中…'
                  : pendingCheckIn.length ? `一键全签到（${pendingCheckIn.length}）` : '都已参加'}
              </button>
            </div>
            <div className="tiny dim">
              签到就是盖章 —— 和同工扫码盖的是同一个章，一场只盖一次，盖下去撤不掉。
              {ciQuery.trim() ? '一键全签到只作用于当前搜到的人。' : ''}
              没报名的人盖了章也会列在这里；还没盖章的，扫他的码或去「👥 用户」里标记。
            </div>
            {checkInRoster.length === 0 ? (
              <div className="tiny dim">没有匹配「{ciQuery.trim()}」的人</div>
            ) : (
              /* 单独占一摞，所以给得起高度；再多就自己滚，不会把整页拉长 */
              <div className="stack-sm attend-list">
                {checkInRoster.map((p) => (
                  <div key={p.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <Avatar config={p.avatar} size={28} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                        {!p.signed && <span className="tiny dim" style={{ fontWeight: 400 }}> · 未报名</span>}
                      </div>
                      <div className="tiny dim">
                        {p.code}
                        {p.done ? ` · ${ago(p.stations[id].at)}` : ''}
                        {p.done && p.stations[id].operator ? ` · ${p.stations[id].operator} 盖的` : ''}
                      </div>
                      {p.contact && (
                        <button type="button" className="tiny signup-contact copy-text"
                          title="点一下复制" onClick={() => copyContact(p.contact)}>
                          {p.contact}
                        </button>
                      )}
                    </div>
                    {p.done ? (
                      <span className="tiny" style={{ flex: '0 0 auto', color: 'var(--green)' }}>已参加 ✓</span>
                    ) : !p.eligible ? (
                      /* 报名后活动才限定了标签：服务端不会收这一章，别给个点了没反应的按钮 */
                      <span className="tiny dim" style={{ flex: '0 0 auto' }} title="这场活动的可见范围不包含他的标签">
                        标签不符
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm"
                        style={{ flex: '0 0 auto' }}
                        disabled={!!checking}
                        onClick={() => checkIn(p)}
                      >
                        {checking === p.id ? '…' : '签到'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {/* 未报名：其他用户。点签到就是盖章，签完他会挪到上面「已报名」那一框 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🙋 未报名（{walkIn.total}）</div>
        <input
          className="input"
          type="search"
          value={wiQuery}
          onChange={(e) => setWiQuery(e.target.value)}
          placeholder="搜名字、编号或标签"
          aria-label="搜索未报名的人"
        />
        <div className="tiny dim">
          没报名直接来的人在这里找，点「签到」就是盖章，签完会挪到上面「已报名」那一框。
          {walkIn.hidden > 0 ? ` 另有 ${walkIn.hidden} 人不在这场的可见范围里，没有列出。` : ''}
        </div>
        {walkIn.shown.length === 0 ? (
          <div className="tiny dim">
            {wiQuery.trim() ? `没有匹配「${wiQuery.trim()}」的人` : '其他人都已经在上面那一框了。'}
          </div>
        ) : (
          <div className="stack-sm attend-list">
            {walkIn.shown.map((p) => (
              <div key={p.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
                <Avatar config={p.avatar} size={28} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div className="tiny dim">{p.code}</div>
                  {p.contact && (
                    <button type="button" className="tiny signup-contact copy-text"
                      title="点一下复制" onClick={() => copyContact(p.contact)}>
                      {p.contact}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn--sm"
                  style={{ flex: '0 0 auto' }}
                  disabled={!!checking}
                  onClick={() => checkIn(p)}
                >
                  {checking === p.id ? '…' : '签到'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>



      </div>
    </div>
  );
}

/**
 * 报名码。
 *
 * 单独一个组件，是因为详情页在活动数据到位之前会提前 return —— 画二维码的
 * effect 那时跑过一遍，canvas 还没挂上，之后 url 没变就不会再跑，
 * 结果是一块白板。挂成自己的组件，effect 就跟着 canvas 一起上场。
 *
 * 载荷是完整网址而不是护照码那种短串：扫的人多半还没有护照，手机相机得能
 * 直接跳过去。所以点阵会密一些，投影或打印的时候别印太小。
 */
function JoinQR({ url, canvasRef }) {
  const own = React.useRef(null);
  const ref = canvasRef || own;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !url) return;
    QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M', margin: 1, width: 440,
      color: { dark: '#000000ff', light: '#ffffffff' },
    }, (err) => {
      if (err) return console.error('[qr]', err);
      // qrcode 会把行内 style 覆盖成位图尺寸（这里是 2 倍），画完得改回显示尺寸
      canvas.style.width = '220px';
      canvas.style.height = '220px';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref 恒定
  }, [url]);
  return <canvas ref={ref} style={{ width: 220, height: 220, display: 'block' }} />;
}
