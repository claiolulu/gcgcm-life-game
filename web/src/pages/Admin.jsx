import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { copyText } from '../lib/clipboard.js';
import { useConfig, loadConfig, activityVisibleTo } from '../lib/config.js';
import { onTick } from '../lib/realtime.js';
import { useStaff, flush, logout, allPlayers, leaderboardLocal, applyRoster, queueOp, issueFor } from '../lib/staff.js';

const ACT_STATE = {
  upcoming: { icon: '🗓', label: '还没到' },
  live:     { icon: '🎯', label: '进行中' },
  done:     { icon: '✅', label: '已办完' },
};

const ACT_AUDIENCE = {
  all: { label: '所有人', className: '' },
  normal: { label: '普通专属', className: 'admin-activity__audience--normal' },
  staff: { label: '同工专属', className: 'admin-activity__audience--staff' },
};

/**
 * 列表右边那根滑杆。
 *
 * 只负责「告诉你还能滑」和「滑到哪了」，不接受拖拽 —— 滚动仍然靠手指和
 * 滚轮。原生滚动条在手机上根本不显示（iOS、微信 WebView 都是滚动时才
 * 短暂出现），而这个列表是封了高的，不给个东西指着，没人知道下面还有人。
 *
 * 内容没超出时整根隐藏：一根永远填满的滑杆等于没说。
 */
function ScrollRail({ targetRef, deps }) {
  const [rail, setRail] = useState(null);   // null = 不用显示

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return undefined;

    const measure = () => {
      const { scrollHeight, clientHeight, scrollTop } = el;
      // 高度为 0 说明这会儿量不准（标签页在后台、父容器还没排版完），
      // 这时候算出来的比例是错的，宁可先不显示，等下一次再量
      if (!clientHeight) return;
      const over = scrollHeight - clientHeight;
      if (over <= 2) { setRail(null); return; }
      // 滑块长度按「看得见的比例」算，和真滚动条一个道理
      const ratio = clientHeight / scrollHeight;
      setRail({
        size: Math.max(ratio * 100, 12),          // 百分比，太短了不好看
        // 剩下的轨道长度按已滚比例分配，滚到底时滑块正好贴底
        pos: (scrollTop / over) * (100 - Math.max(ratio * 100, 12)),
        end: scrollTop >= over - 2,
      });
    };

    measure();
    // 首帧常常还没排好版（尤其是刚从后台切回来），再补量一次
    const raf = requestAnimationFrame(measure);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // 列表本身高度固定，内容变高不会触发它的 resize，所以连内容一起观察
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [targetRef, deps]);

  return (
    <div className={`list-rail ${rail ? 'list-rail--on' : ''} ${rail?.end ? 'list-rail--end' : ''}`} aria-hidden="true">
      {rail && <div className="list-rail__thumb" style={{ height: `${rail.size}%`, top: `${rail.pos}%` }} />}
    </div>
  );
}

export default function Admin() {
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;
  const [busy, setBusy] = useState(null);
  const [picked, setPicked] = useState([]);        // 花名册里勾选的人
  const [manualOpen, setManualOpen] = useState(false);

  const settings = config?.settings || {};
  const resetPin = config?.resetPin || '3927';
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line
  const board = useMemo(() => leaderboardLocal(), [staff.players, staff.outbox]); // eslint-disable-line

  /* -------------------------- 活动清单 -------------------------- */
  //
  // 总控台只留一份索引，点进去才是这一场的全部（见 ActivityDetail）。
  // 所以这里只需要两件事：每场盖了多少章，以及新建一场。

  const configActivities = config?.activities || [];
  const [activities, setActivities] = useState(configActivities);
  const activitiesRef = useRef(activities);
  // 拖拽过程中的全部状态。放 ref 不放 state：指针每动一下都 setState
  // 会把整张卡片重渲一遍，那正是卡顿的来源（详见下面的 paintDrag）
  const dragRef = useRef(null);   // { id, from, to, pointerStart, slots }
  const [dragActivity, setDragActivity] = useState(null);
  activitiesRef.current = activities;

  useEffect(() => {
    // 正拖着的时候别让服务端那份把本地顺序盖回去
    if (dragRef.current) return;
    setActivities(configActivities);
    activitiesRef.current = configActivities;
  }, [configActivities]);

  // 报名数不在 /api/config 里 —— 那份是缓存住的静态配置，而报名随时在变
  const [signupCount, setSignupCount] = useState({});
  useEffect(() => {
    if (!token) return;
    const pull = () => api('/api/admin/signups', { token })
      .then((r) => setSignupCount(r.counts || {})).catch(() => {});
    pull();
    const off = onTick((p) => { if (p.reason === 'signup') pull(); });
    const timer = setInterval(pull, 30_000);
    return () => { off(); clearInterval(timer); };
  }, [token]);

  const stampCount = useMemo(() => {
    const n = {};
    for (const p of players) {
      for (const id of Object.keys(p.stations || {})) n[id] = (n[id] || 0) + 1;
    }
    return n;
  }, [players]);

  /**
   * 新建一场，存好之后直接进详情页。
   *
   * 不在清单里留一张待填的空卡片 —— 那样同工得先填完再想起来点保存，
   * 而这一步真正想做的事（填它）在详情页里。
   *
   * id 一旦建立就不再改：盖过的章靠它认领归属。用时间戳生成，避免撞上。
   */
  async function addAct() {
    const id = `act-${Date.now().toString(36)}`;
    setBusy('acts');
    try {
      const res = await api('/api/admin/activities', {
        method: 'POST',
        body: {
          activities: [...activities, {
            id, icon: '📍', name: '新活动', en: '', date: '', tag: '', host: '',
            desc: '', landmarkKey: '', photo: '', links: [], state: 'upcoming', audience: 'all',
          }],
        },
        token,
      });
      await loadConfig();
      const made = res.activities.find((a) => a.id === id);
      // 新建完先进基本信息页：名字、日期、负责人这些是这一场的底子，
      // 版式是在这些填完之后才谈得上的事。详情页上有「设计这一页」的入口
      nav(`/staff/admin/a/${made ? made.id : id}`);
    } catch (err) {
      toast(err.message || '加不上', 'err');
    } finally {
      setBusy(null);
    }
  }

  /**
   * 换位动画（FLIP）。
   *
   * 重排就是把数组里的元素挪个位置，React 一渲染，行就直接出现在新地方 ——
   * 中间没有过程，看着像画面闪了一下。这里在改数组**之前**把每一行当前的
   * 屏幕坐标记下来，渲染之后算出位移，先用 transform 把它们摁回旧位置，
   * 再下一帧放开，于是眼睛看到的是滑过去的。
   *
   * 只记 top：这个列表是竖着排的，横向不会动。
   */
  const flipRef = useRef(null);
  const flipGenRef = useRef(0);

  function captureRowTops() {
    const map = new Map();
    document.querySelectorAll('[data-activity-row]').forEach((el) => {
      map.set(el.dataset.activityRow, el.getBoundingClientRect().top);
    });
    flipRef.current = map;
  }

  useLayoutEffect(() => {
    const prev = flipRef.current;
    flipRef.current = null;
    if (!prev || !prev.size) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;

    const moved = [];
    document.querySelectorAll('[data-activity-row]').forEach((el) => {
      const before = prev.get(el.dataset.activityRow);
      if (before == null) return;
      const dy = before - el.getBoundingClientRect().top;
      if (!dy) return;
      // 先摁回旧位置，这一步不能有过渡，否则它会从新位置慢慢滑到旧位置
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      moved.push(el);
    });
    if (!moved.length) return;

    // 隔一帧再放开：同一帧里改回去，浏览器会把两次赋值合并成一次，没有动画。
    //
    // 这里**不能**在 cleanup 里 cancelAnimationFrame：换完顺序马上要存盘，
    // saveActivityOrder 一改 busy 就又渲染一次，cleanup 跟着跑，那一帧被取消，
    // 位移就永远留在行上了（行会一直歪着）。改成用代次号作废旧的那一帧 ——
    // 拖得飞快、连着换好几次时，只有最后一次说了算。
    const gen = ++flipGenRef.current;
    const release = () => {
      if (flipGenRef.current !== gen) return;
      flipGenRef.current++;      // 让另一条路径不再重复执行
      moved.forEach((el) => {
        // 清成空串而不是写死过渡，让它回到 CSS 里那条（见 .admin-activity-sort-row）
        el.style.transition = '';
        el.style.transform = '';
      });
    };
    requestAnimationFrame(release);
    // rAF 在后台标签页里根本不跑（document.hidden 时浏览器直接不调）。
    // 光靠它的话，拖到一半切走 app 再回来，那几行就一直歪着。加个超时兜底，
    // 谁先到算谁的 —— 正常情况下永远是 rAF 先。
    // 不在 cleanup 里清掉它：换完顺序马上要存盘，saveActivityOrder 一改 busy
    // 就又渲染一次，cleanup 跟着跑 —— 真清了的话位移就永远留在行上。
    // 代次号已经保证它不会重复执行，多留一个待触发的定时器无害。
    setTimeout(release, 80);
  }, [activities]);

  /* ---------------------- 活动排序：拖拽 ---------------------- */
  //
  // 整个拖拽过程**不动数组**，只改 transform，松手才提交一次。
  //
  // 上一版是「指针一碰到下一行就 setState 换位」，有两个毛病：
  //   换完位，那一行跑到了指针底下，于是可能立刻又换回去 —— 手停着不动，
  //   两行来回抖；而且被拖的行不跟手，移动半格什么都没有，过了界猛地跳一格。
  // 现在改成：被拖的行跟着手指走，其余行按需要让开，越过邻居的**中线**才
  // 算换位（中线是个天然的滞回，不会在边界上反复横跳）。

  /**
   * 把当前这一帧画出来。
   *
   * 直接写 DOM 而不是走 state：指针移动一秒能来几十次，每次都 setState
   * 重渲染整张卡片，卡顿就是这么来的。这里只碰几个 transform。
   */
  function paintDrag(dy) {
    const d = dragRef.current;
    if (!d) return;
    const { slots, from, to } = d;
    slots.forEach((s, i) => {
      if (i === from) {
        // 跟手的那一行不要过渡，否则永远慢半拍
        s.el.style.transition = 'none';
        s.el.style.transform = `translateY(${dy}px)`;
        return;
      }
      // 让开一格。用相邻两格的实际间距，而不是「行高 + gap」——
      // 行高不一定相等（活动名换行的时候就不等）
      let shift = 0;
      if (to > from && i > from && i <= to) shift = slots[i - 1].top - slots[i].top;
      if (to < from && i >= to && i < from) shift = slots[i + 1].top - slots[i].top;
      s.el.style.transition = '';   // 用 CSS 里那条，滑过去
      s.el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function startActivityDrag(e, id) {
    if (busy) return;
    e.preventDefault();
    const slots = [...document.querySelectorAll('[data-activity-row]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.dataset.activityRow, el, top: r.top, h: r.height };
    });
    const from = slots.findIndex((s) => s.id === id);
    if (from < 0) return;
    dragRef.current = { id, from, to: from, pointerStart: e.clientY, slots };
    setDragActivity(id);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 浏览器会自行继续派发 */ }
  }

  function moveActivityDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const dy = e.clientY - d.pointerStart;
    const { slots, from } = d;
    // 被拖那一行现在的中线（按起拖时的版面算，不读实时 rect —— 那上面
    // 已经带着我们自己写的 transform，会自己喂自己）
    const center = slots[from].top + slots[from].h / 2 + dy;
    // 中线落进哪一格，就归哪一格 —— 大约拖过半行就换位，跟手。
    //
    // 试过「越过邻居中线才换」，那要整整拖满一行才动，半路上什么反应都没有，
    // 和原来那版一样迟钝。也不能用「碰到就换」：换完那一行跑到指针底下，
    // 立刻又满足条件换回去，手停着不动两行都在抖。
    //
    // 这里的门槛全部按**起拖时**的版面算，所以 dy → to 是个单调阶梯函数，
    // 同一个 dy 永远得到同一个结果，不存在来回横跳。
    let to = 0;
    for (let i = 0; i < slots.length; i += 1) {
      if (center >= slots[i].top) to = i;
    }
    d.to = to;
    paintDrag(dy);
  }

  function endActivityDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDragActivity(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 已自动释放 */ }

    const { slots, from, to } = d;

    const commit = () => {
      // 先记下此刻眼睛看到的位置（getBoundingClientRect 含 transform），
      // 再清 transform + 换数组。两者画面一致，FLIP 量出来的位移是 0，
      // 于是没有任何跳动；万一差了一点，它会自己补一段动画圆回来。
      captureRowTops();
      slots.forEach((s) => { s.el.style.transition = 'none'; s.el.style.transform = ''; });
      if (to !== from) {
        const next = [...activitiesRef.current];
        const [moving] = next.splice(from, 1);
        next.splice(to, 0, moving);
        activitiesRef.current = next;
        setActivities(next);
        saveActivityOrder(next);
      }
      // 下一帧把过渡还回去，否则后面的动画会被 none 挡住
      setTimeout(() => slots.forEach((s) => { s.el.style.transition = ''; }), 0);
    };

    if (to === from) { commit(); return; }

    // 松手之后让它滑进格子，而不是啪一下归位
    const settle = slots[to].top - slots[from].top;
    slots[from].el.style.transition = '';
    slots[from].el.style.transform = `translateY(${settle}px)`;
    setTimeout(commit, 190);   // 比 CSS 里那条 .24s 略短，视觉上刚好接上
  }

  async function saveActivityOrder(next) {
    setBusy('order');
    try {
      await api('/api/admin/activities', { method: 'POST', body: { activities: next }, token });
      await loadConfig();
      toast('活动顺序已更新，护照页面已同步排序', 'ok');
    } catch (err) {
      toast(err.message || '排序保存失败', 'err');
      await loadConfig();
    } finally {
      setBusy(null);
    }
  }

  function moveActivityByKeyboard(id, direction) {
    const current = activitiesRef.current;
    const from = current.findIndex((a) => a.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= current.length || busy) return;
    const next = [...current];
    [next[from], next[to]] = [next[to], next[from]];
    captureRowTops();
    activitiesRef.current = next;
    setActivities(next);
    saveActivityOrder(next);
  }

  // 「签证页模版」这个全局选项去掉了：每一场的版式在它自己的画布编辑器里排
  // （/staff/admin/a/<id>/design），默认版式是代码里的常量，不再是一个要人维护
  // 的设置。多一个「模版」只会让人先去改模版、发现某一场没跟着变、再回来找原因。

  // 「护照模版」搬到选手自己的资料页去了（护照页右上角的「✎ 自定义」）——
  // 一本用一年的册子，配色本来就该各人不同，不该全场一个样子。

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  async function patchSettings(patch, label) {
    setBusy(label);
    try {
      await api('/api/admin/settings', { method: 'POST', body: patch, token });
      await loadConfig();
      toast('设置已更新', 'ok');
    } catch (err) {
      toast(err.message || '更新失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  // 同名的多半是「忘了密码又报了一次」。报名时已经拦过一道，
  // 但选手可能点了「不是我」，所以这里再列出来让同工核对。
  const duplicates = useMemo(() => {
    const byName = {};
    players.forEach((p) => { (byName[p.name] = byName[p.name] || []).push(p); });
    return Object.entries(byName)
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => ({ name, list: list.sort((a, b) => a.code.localeCompare(b.code)) }));
  }, [players]);


  /** 把勾选的人的密码统一重置成 3927 */
  async function resetPinPicked() {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    const names = picked.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    const ok = await ask({
      title: `重置 ${picked.length} 人的密码？`,
      confirmText: `重置为 ${resetPin}`,
      body: `${names.join('、')}\n\n密码会统一变成 ${resetPin}，原密码立即失效。` +
            '\n告诉他们用原来的编号 + 这个密码找回护照，不要重新报名。',
    });
    if (!ok) return;
    setBusy('pin');
    try {
      const res = await api('/api/admin/reset-pin', { method: 'POST', body: { playerIds: picked }, token });
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`${res.players.map((p) => p.code + ' 号').join('、')} 的密码已重置为 ${res.pin}`, 'ok', 6000);
      setPicked([]);
    } catch (err) {
      toast(err.message || '重置失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function changePlayerRole(player, role) {
    if (!player || player.role === role) return;
    setBusy(`role-${player.id}`);
    try {
      await api(`/api/admin/player/${player.id}/role`, { method: 'POST', body: { role }, token });
      await flush({ full: true });
      toast(`${player.name} 已设为${role === 'staff' ? '同工' : '普通用户'}`, 'ok');
    } catch (err) {
      toast(err.message || '角色更新失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function deletePlayer(player) {
    if (!player) return;
    const ok = await ask({
      title: `删除「${player.name}」？`,
      danger: true,
      confirmText: '确认删除',
      body: `编号 ${player.code} 的护照、报名、印章和上传素材都会删除。系统会先自动备份，但本人之后无法再用原编号登录。`,
    });
    if (!ok) return;
    setBusy(`delete-${player.id}`);
    try {
      await api(`/api/admin/player/${player.id}`, { method: 'DELETE', token });
      setDetail(null);
      setPicked((cur) => cur.filter((id) => id !== player.id));
      await flush({ full: true });
      toast(`${player.name} 已删除`, 'ok');
    } catch (err) {
      toast(err.message || '删除失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* ---------------------- 选手详情 ---------------------- */

  const [detail, setDetail] = useState(null);      // 点开的那个人的 id
  const [signupMap, setSignupMap] = useState({});  // 活动 id → 报了名的人 id 集合
  const detailPlayer = detail ? players.find((x) => x.id === detail) : null;

  /* ---------------------- 人员搜索 ---------------------- */

  const [q, setQ] = useState('');
  const listRef = useRef(null);
  /**
   * 名字、编号、联系方式都能搜。
   *
   * 编号那一栏用 includes 而不是等值：库里存的是补零的「01」，同工在现场
   * 多半直接敲「1」。名字大小写无关，英文名不用管首字母有没有大写。
   */
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return board;
    return board.filter((p) => [p.name, p.code, p.contact]
      .some((v) => String(v || '').toLowerCase().includes(kw)));
  }, [board, q]);

  // 报名名单要按人看，而接口是按活动给的，所以整份拉回来自己倒排一次。
  // 活动就几场，比给每个人单独发一次请求省事
  useEffect(() => {
    if (!token || !detail) return;
    let dead = false;
    (async () => {
      const out = {};
      for (const a of activities) {
        try {
          const r = await api(`/api/admin/activity/${a.id}/signups`, { token });
          out[a.id] = new Set((r.signups || []).map((x) => x.id));
        } catch { out[a.id] = new Set(); }
      }
      if (!dead) setSignupMap(out);
    })();
    return () => { dead = true; };
  }, [token, detail, activities]);

  /**
   * 替某人把一场活动标成已参加。
   *
   * 走的是同工端那条盖章通道（queueOp），所以离线也排得住、重复点也只算
   * 一次（服务端那条「一场只盖一次」的唯一索引挡着）。
   * 给 1 分是为了让总分等于「参加过几场」，章上写的是「已参加」。
   */
  async function markDone(playerId, stationId, name) {
    setBusy(`done-${stationId}`);
    try {
      const op = await queueOp({
        type: 'score', playerId, stationId, points: 1, checkin: true, note: '总控台补录',
      });
      // queueOp 只保证「进了队列」。服务端认不认要等这一趟同步回来 ——
      // 原来这儿直接弹「已标记为参加」，于是被拒的操作（比如这一场对该
      // 用户角色不可见）界面上照样显示成功，而那一行永远不会变。
      try {
        await flush();
      } catch {
        toast('网络不通，已记下，联网后自动上传', 'warn');
        return;
      }
      const bad = issueFor(op.opId);
      if (bad) { toast(bad.message || '服务端没有接受这次标记', 'err'); return; }
      toast(`${name} 已标记为参加`, 'ok');
    } catch (err) {
      toast(err.message || '标记失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function copyContact(v) {
    const ok = await copyText(v);
    toast(ok ? '联系方式已复制' : '复制不了，长按自己选', ok ? 'ok' : 'warn');
  }

  const togglePick = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));


  function download(path, filename) {
    // 带鉴权头的下载没法直接用 <a href>，先取回 blob 再存
    setBusy(filename);
    fetch(path, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('下载失败'); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('已下载 ' + filename, 'ok');
      })
      .catch((err) => toast(err.message, 'err'))
      .finally(() => setBusy(null));
  }

  // stateMeta 没人用了：游戏状态那块搬到每场活动自己身上了
  return (
    <div className="page page--wide staff-page admin-page">
      <NetBar
        online={staff.online}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      <div className="row-between admin-header">
        <div className="admin-header__title">
          <div className="eyebrow">MINI LIFE · CONTROL ROOM</div>
          <h1>活动总控台</h1>
          <div className="small muted">在这里管理活动、选手与现场数据</div>
        </div>
        <button className="btn btn--sm btn--ghost admin-logout" onClick={() => { logout(); nav('/staff'); }}>退出登录</button>
      </div>

      <div className="cols-2 cols-pair">
      {/* 概览 */}
      <div className="admin-stats col-full">
        {[
          { icon: '👥', label: '已领护照', value: players.length, tone: 'blue' },
          { icon: '📅', label: '活动总数', value: activities.length, tone: 'purple' },
          { icon: '🏅', label: '已盖印章', value: players.reduce((s, p) => s + p.stationsDone, 0), tone: 'gold' },
          { icon: staff.outbox.length ? '⏳' : '✓', label: '待同步', value: staff.outbox.length, tone: staff.outbox.length ? 'orange' : 'green' },
        ].map((s) => (
          <div key={s.label} className={`admin-stat admin-stat--${s.tone}`}>
            <div className="admin-stat__icon">{s.icon}</div>
            <div>
              <div className="admin-stat__value">{s.value}</div>
              <div className="admin-stat__label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 活动清单 —— 只是一份索引，点进去才是这一场的全部 */}
      <div className="cell-stack">
      <div className="card stack admin-panel admin-panel--activities" style={{ marginBottom: 12 }}>
        <div className="row-between">
          <div>
            <div className="admin-panel__title">🗓 活动清单</div>
            <div className="tiny dim">创建活动并管理报名、盖章与页面设计</div>
          </div>
          <button className="btn btn--sm btn--primary" disabled={busy === 'acts'} onClick={addAct}>
            {busy === 'acts' ? '新建中…' : '＋ 新增活动'}
          </button>
        </div>
        <div className="tiny dim admin-panel__hint">
          护照里每场活动至少有一张信息页，还能增加照片页和总结页。点进去填这一场的信息、
          配图、链接、报名码，再从那儿进画布排版式。改完立刻生效，
          同工端和对应角色的护照都会跟着变。按住左侧拖动柄可以调整顺序。
        </div>

        <div className="stack-sm">
          {activities.map((a) => {
            const st = ACT_STATE[a.state] || ACT_STATE.upcoming;
            const audience = ACT_AUDIENCE[a.audience] || ACT_AUDIENCE.all;
            return (
              <div key={a.id} data-activity-row={a.id}
                className={`admin-activity-sort-row ${dragActivity === a.id ? 'admin-activity-sort-row--dragging' : ''}`}>
                <button className="admin-activity__drag" type="button"
                  aria-label={`拖动调整${a.name}的顺序`} title="按住拖动排序"
                  disabled={busy === 'order'}
                  onPointerDown={(e) => startActivityDrag(e, a.id)}
                  onPointerMove={moveActivityDrag}
                  onPointerUp={endActivityDrag}
                  onPointerCancel={endActivityDrag}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      moveActivityByKeyboard(a.id, e.key === 'ArrowUp' ? -1 : 1);
                    }
                  }}>
                  <span aria-hidden="true">⠿</span>
                </button>
                <button
                  className="card card--tight row admin-activity"
                  style={{ textAlign: 'left', width: '100%', gap: 10, alignItems: 'center' }}
                  onClick={() => nav(`/staff/admin/a/${a.id}`)}
                >
                {/* 有配图就用配图，没有就用那个图标 —— 一眼看出哪几场还没配图 */}
                <div style={{
                  flex: '0 0 44px', height: 34, borderRadius: 3, overflow: 'hidden',
                  background: 'var(--ink-3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18,
                  backgroundImage: a.photo ? `url("${a.photo}")` : 'none',
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}>
                  {!a.photo && a.icon}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold row" style={{ gap: 6, alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name || '（还没起名字）'}
                    </span>
                    {a.state === 'live' && (
                      <span className="tiny" style={{ color: 'var(--gold)', flex: '0 0 auto' }}>
                        {st.icon} {st.label}
                      </span>
                    )}
                    {a.audience && a.audience !== 'all' && (
                      <span className={`admin-activity__audience ${audience.className}`}>{audience.label}</span>
                    )}
                  </div>
                  <div className="tiny dim">
                    {a.date || '日期待定'} · 报名 {signupCount[a.id] || 0} · 盖章 {stampCount[a.id] || 0}
                    {(a.blocks || []).length ? ` · 版式 ${a.blocks.length} 块` : ''}
                  </div>
                </div>
                <span className="dim">›</span>
                </button>
              </div>
            );
          })}
          {activities.length === 0 && (
            <div className="admin-empty">
              <span>📅</span>
              <strong>还没有活动</strong>
              <small>点击右上角「新增活动」开始创建</small>
            </div>
          )}
        </div>

      </div>
      </div>

      {/* 右边一摞：这批人。疑似重复的号也归它管 —— 那是花名册上的问题 */}
      <div className="cell-stack">
      {/* 疑似重复报名 */}
      {duplicates.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12, borderColor: 'rgba(247,201,72,.45)' }}>
          <div className="section-title">⚠️ 疑似重复报名</div>
          <div className="small muted" style={{ lineHeight: 1.65 }}>
            下面这些名字出现了不止一次，多半是有人忘了密码又报了一遍。
            核对之后：把要保留的那个号的密码重置成 {resetPin} 交还给本人，多余的空号可以不管（不影响排行榜，只是多几个 0 分）。
          </div>
          {duplicates.map((d) => (
            <div key={d.name} className="card card--flat card--tight">
              <div className="small bold" style={{ marginBottom: 6 }}>{d.name} · {d.list.length} 个号</div>
              <div className="stack-sm">
                {d.list.map((p) => (
                  <button
                    key={p.id}
                    className="lb-row"
                    onClick={() => nav(`/staff/p/${p.id}`)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <Avatar config={p.avatar} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="tiny mono">{p.code} 号 · 密码 {p.pin || '—'}</div>
                      <div className="tiny dim">
                        {p.stationsDone}/{p.stationsTotal} 关 · {p.total} 分
                        {p.total === 0 && p.stationsDone === 0 ? ' · 空号' : ''}
                      </div>
                    </div>
                    <span className="dim">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 花名册 */}
      <div className="card stack admin-panel admin-panel--players">
        <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="admin-panel__title">👥 用户</div>
            <div className="tiny dim">查看成绩、管理数据与用户资料</div>
          </div>
          {/* 排行榜开关和导出备份都收在这儿：它们讲的都是「这批人」的事，
              各自单开一张卡不值当 */}
          <div className="row admin-actions" style={{ gap: 6, flex: '0 0 auto' }}>
            <button
              className={`btn btn--sm ${settings.leaderboardPublic ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy === 'lb'}
              onClick={() => patchSettings({ leaderboardPublic: !settings.leaderboardPublic }, 'lb')}
              title="关掉后选手端看不到「谁盖的章最多」"
            >
              🏆 排行榜{settings.leaderboardPublic ? '公开' : '已关'}
            </button>
            <button className="btn btn--sm btn--ghost" disabled={!!busy} title="导出成绩 CSV，Excel 可直接打开"
              onClick={() => download('/api/admin/export.csv', 'mini-life-game.csv')}>📊 导出</button>
            <button className="btn btn--sm btn--ghost" disabled={!!busy} title="下载完整备份 JSON，出事了拿它恢复"
              onClick={() => download('/api/admin/backup.json', 'mlg-backup.json')}>🗄 备份</button>
            <button className="btn btn--sm btn--ghost" onClick={() => flush({ full: true })} title="重新拉取花名册">↻</button>
          </div>
        </div>
        <div className="admin-search">
          <span className="admin-search__icon" aria-hidden="true">🔎</span>
          <input
            className="input admin-search__input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜名字、编号或联系方式"
            aria-label="搜索用户"
          />
          {q && (
            <button className="admin-search__clear" onClick={() => setQ('')} aria-label="清空搜索">✕</button>
          )}
        </div>
        {q && (
          <div className="tiny dim">
            {shown.length ? `找到 ${shown.length} 人` : '没有匹配的用户'}
          </div>
        )}

        {/* 宽屏上排成几列：一千多像素宽里一行一个人，十八个人要滚半天，
            而每一行右边空着两尺 */}
        <div className="list-scroll">
        <ScrollRail targetRef={listRef} deps={shown.length} />
        <div className="stack-sm grid-cards list-cap" ref={listRef}>
          {shown.map((p) => (
            <button key={p.id} className="lb-row admin-player" onClick={() => setDetail(p.id)} style={{ width: '100%', textAlign: 'left' }}>
              <div className="lb-rank">{p.rank}</div>
              <Avatar config={p.avatar} size={34} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">
                  {p.name}
                  {p.role === 'staff' && <span className="admin-player__role">同工</span>}
                </div>
                <div className="tiny dim mono">
                  {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? activities.length}
                </div>
              </div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
          {board.length === 0 && <div className="center small dim" style={{ padding: 20 }}>还没有人报名</div>}
          {board.length > 0 && shown.length === 0 && (
            <div className="center small dim" style={{ padding: 20 }}>没有匹配「{q}」的用户</div>
          )}
        </div>
        </div>
      </div>
      </div>

      </div>

      {/* 点花名册里的人弹出来：他报了哪几场、来了哪几场，
          还能替他补一个「已参加」—— 有人当场忘了给同工扫，事后就在这儿补 */}
      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detailPlayer ? `${detailPlayer.name} · ${detailPlayer.code} 号` : ''}
        backLabel="返回"
      >
        {detailPlayer && (
          <div className="stack">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Avatar config={detailPlayer.avatar} size={44} />
              <div className="grow">
                <div className="small bold">{detailPlayer.name}</div>
                <div className="tiny dim mono">
                  {detailPlayer.code} 号 · 参加过 {detailPlayer.stationsDone} 场
                </div>
              </div>
            </div>

            {/* 姓名和联系方式都是报名时选填的，填了才显示。
                联系方式原来挤在上面那行小字的末尾，和编号、场次混成一串，
                真要找人的时候反而看不见 */}
            {(detailPlayer.surname || detailPlayer.given || detailPlayer.contact || detailPlayer.notes) && (
              <div className="card card--tight stack-sm">
                {(detailPlayer.surname || detailPlayer.given) && (
                  <div>
                    <div className="label">护照上的姓名</div>
                    <div className="small">
                      {[detailPlayer.surname, detailPlayer.given].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                )}
                {detailPlayer.contact && (
                  <div>
                    <div className="label">联系方式</div>
                    {/* 点一下就复制 —— 这一行存在的意义就是被抄到微信里去找人，
                        手抄一串 gmail 地址太容易错一个字母 */}
                    <button type="button" className="small mono admin-contact copy-text"
                      title="点一下复制" onClick={() => copyContact(detailPlayer.contact)}>
                      {detailPlayer.contact}
                    </button>
                  </div>
                )}
                {detailPlayer.notes && (
                  <div>
                    <div className="label">备注</div>
                    <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{detailPlayer.notes}</div>
                  </div>
                )}
              </div>
            )}

            <div className="card card--tight stack-sm admin-player-role">
              <label className="label" htmlFor="admin-player-role">用户角色</label>
              <select id="admin-player-role" className="input"
                value={detailPlayer.role || 'normal'}
                disabled={busy === `role-${detailPlayer.id}` || busy === `delete-${detailPlayer.id}`}
                onChange={(e) => changePlayerRole(detailPlayer, e.target.value)}>
                <option value="normal">普通</option>
                <option value="staff">同工</option>
              </select>
              <div className="tiny dim">
                角色只决定护照里能看到哪些活动；工作人员端登录权限仍由工作人员 PIN 控制。
              </div>
            </div>

            <div className="stack-sm">
              {activities.map((a) => {
                const done = !!detailPlayer.stations?.[a.id];
                const signed = signupMap[a.id]?.has(detailPlayer.id);
                return (
                  <div key={a.id} className="card card--tight row" style={{ gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 18, flex: '0 0 auto' }}>{a.icon}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name}
                      </div>
                      <div className="tiny dim">
                        {signed ? '已报名' : '没报名'}
                        {done ? ` · ${ago(detailPlayer.stations[a.id].at)}盖的章` : ''}
                      </div>
                    </div>
                    {done ? (
                      <span className="tiny" style={{ flex: '0 0 auto', color: 'var(--green)' }}>已参加 ✓</span>
                    ) : !activityVisibleTo(a, detailPlayer.role || 'normal') ? (
                      /* 这一场对这个人的角色不可见，服务端不会收这一章。
                         与其让人点了没反应，不如把按钮收起来说明白 */
                      <span className="tiny dim" style={{ flex: '0 0 auto' }}>
                        {a.audience === 'staff' ? '同工专属' : '普通专属'}
                      </span>
                    ) : (
                      <button
                        className="btn btn--sm btn--ghost" style={{ flex: '0 0 auto' }}
                        disabled={busy === `done-${a.id}`}
                        onClick={() => markDone(detailPlayer.id, a.id, detailPlayer.name)}
                      >
                        {busy === `done-${a.id}` ? '…' : '标为已参加'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="tiny dim">
              盖过的章撤不掉 —— 那是一条写进记录的事实，不是一个可以来回拨的开关。
              标错了人只能去数据库改。
            </div>
            <button className="btn btn--danger btn--full"
              disabled={busy === `delete-${detailPlayer.id}`}
              onClick={() => deletePlayer(detailPlayer)}>
              {busy === `delete-${detailPlayer.id}` ? '删除中…' : '🗑 删除这个用户'}
            </button>
          </div>
        )}
      </Sheet>

      <PlayerSheet
        open={manualOpen}
        onClose={() => { setManualOpen(false); setPicked([]); }}
        players={players}
        picked={picked}
        togglePick={togglePick}
        onResetPin={resetPinPicked}
        busy={busy === 'pin'}
        resetPin={resetPin}
      />
    </div>
  );
}

/**
 * 花名册弹层：勾人，然后重置密码。
 *
 * 原来这里还管「按身份编队」，那是迎新游戏的东西，打卡本用不上，
 * 已经拿掉了。留下的这一件事仍然是现场最常用的 —— 有人忘了密码，
 * 别让他重新报名（会多出一个空号，章也对不上）。
 */
function PlayerSheet({ open, onClose, players, picked, togglePick, onResetPin, busy, resetPin }) {
  const [q, setQ] = useState('');
  const listRef = useRef(null);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return players
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.code.includes(kw))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [players, q]);

  return (
    <Sheet open={open} onClose={onClose} title="🔑 找回密码">
      <div className="stack">
        <div className="small muted">
          勾选忘了密码的人，把他们的密码统一重置成 {resetPin}，再让他用原来的编号找回护照。
        </div>

        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字或编号…" />

        <div className="stack-sm" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
          {list.length === 0 && (
            <div className="center small dim" style={{ padding: 18 }}>
              {players.length === 0
                ? '本机花名册是空的，先回上一层点「重新拉取花名册」'
                : '没有符合的人'}
            </div>
          )}
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                className="lb-row"
                onClick={() => togglePick(p.id)}
                style={{ width: '100%', textAlign: 'left', borderColor: on ? 'var(--gold)' : undefined,
                         background: on ? 'rgba(232,197,106,.12)' : undefined }}
              >
                <span style={{ width: 20, fontSize: 15 }}>{on ? '☑️' : '⬜️'}</span>
                <Avatar config={p.avatar} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{p.name}</div>
                  <div className="tiny dim mono">{p.code} 号 · 盖过 {p.stationsDone} 个章</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 只在请求进行中禁用。没勾人时也 disabled 的话，点了完全没反馈 ——
            处理函数里那句「先勾选选手」的提示永远走不到 */}
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onResetPin}>
          🔑 重置密码为 {resetPin}{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        <div className="tiny dim" style={{ marginTop: -4 }}>
          重置会让原密码立刻失效，并顺带解除他之前试错造成的锁定。
        </div>
        <button className="btn btn--full" onClick={onClose}>完成</button>
      </div>
    </Sheet>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <div className="row-between">
      <div className="grow">
        <div className="small bold">{label}</div>
        <div className="tiny dim">{hint}</div>
      </div>
      <button
        className={`btn btn--sm ${value ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => onChange(!value)}
        style={{ minWidth: 62 }}
      >
        {value ? '开' : '关'}
      </button>
    </div>
  );
}
