import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePush, pushSupport } from '../../lib/push.js';
import { installPlatform, canPromptInstall, promptInstall, onInstallChange, INSTALL_HOWTO } from '../../lib/install.js';
import { track } from '../../lib/track.js';
import { useToast, useConfirm } from '../../components/ui.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import Avatar from '../../components/Avatar.jsx';

import PassportBookView from './PassportBookView.jsx';
import { buildVals, buildPages } from './bookVals.js';
import { visaWatermarkKey } from '../../lib/visaWatermark.js';
import { FLIP_MS, FLIP_EASE } from './bookVals.js';
import { useConfig, activitiesForPlayer } from '../../lib/config.js';
import { usePlayer, refreshMe } from '../../lib/player.js';
import { api } from '../../lib/api.js';
import { kvGet, kvSet } from '../../lib/idb.js';
import { changesLeaderboard, onTick } from '../../lib/realtime.js';
import { useLocalState } from '../../components/ui.jsx';
import ThemeSheet from './ThemeSheet.jsx';
import Tour from './Tour.jsx';
import ActivityContributionSheet from './ActivityContributionSheet.jsx';

/**
 * 选手护照册 —— 唯一的选手端界面。
 *
 * 盖章发生在工作人员端，这里负责把活动和盖章结果呈现出来；
 * 自己能改的只有个人资料、配色、投稿和通知开关。
 */
export default function PassportBook() {
  const nav = useNavigate();
  const loc = useLocation();
  const { config } = useConfig();
  const { me, rank, of, loading, session } = usePlayer();

  const [page, setPage] = useState(0);
  const [overlay, setOverlay] = useState(null);   // null | 'board' | 'guide'
  const [modal, setModal] = useState(null);       // null | 'token' | 'qr'
  const [checking, setChecking] = useState(false);
  const lastCheckRef = useRef(0);
  const lastBoardRequestRef = useRef(0);
  const [themeOpen, setThemeOpen] = useState(false);
  const [contributionActivity, setContributionActivity] = useState(null);
  // 新手引导（第一次翻开护照时自动弹一次，问号按钮可以重看）
  const [tourOpen, setTourOpen] = useState(false);
  // 自动引导要等人先把封面翻开。否则新用户一进来就被拽到导航页，
  // 连封面都没看见，还以为程序坏了。
  const [opened, setOpened] = useState(false);
  // v2 是打卡护照的新说明。换一个键，让看过旧游戏引导的人也会自动看到一次。
  const [tourDone, setTourDone] = useLocalState('mlg.tourDone.v2', false);
  // 全书同一个开关：默认只翻每场的 Visa 信息页，按需展开照片与总结。
  const [showReviews, setShowReviews] = useLocalState('mlg.reviewPagesOpen.v1', false);
  const [reviewNotice, setReviewNotice] = useState(null);
  useEffect(() => {
    if (!reviewNotice) return undefined;
    const timer = setTimeout(() => setReviewNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [reviewNotice]);
  const [board, setBoard] = useState([]);
  const [qr, setQr] = useState({ thumb: null, big: null });
  const [vpLandscape, setVpLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(orientation: landscape)').matches : false
  );
  const standalone = typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true
  );
  // iOS 主屏幕 PWA 的 CSS 视口有时只覆盖物理屏幕的左上部分：
  // 竖屏少掉的区域落在底部，横屏少掉的区域落在右侧。CSS 内部居中
  // 仍会在最终截图里显得偏上/偏左，所以量出缺口并在相反一侧留出同宽黑边。
  const [screenGap, setScreenGap] = useState({ x: 0, y: 0 });
  // 真正看得见的高度。iOS 横屏的 Safari 工具栏压在 100dvh 里面 ——
  // 按 100dvh 铺满的话，护照下沿被工具栏盖住，人得往下拽一把才看得全。
  // visualViewport 给的是「此刻没被工具栏/键盘遮住」的那块，按它来排
  const [viewportH, setViewportH] = useState(0);

  // 自动引导在“第一次实际打开”时就记为已展示，而不是等用户点完或关闭。
  // 这样用户直接退出网站，下次进来也不会被重复弹出；问号仍可手动重看。
  // 这一次是不是自动弹出来的「第一次引导」：看完之后要顺手问一句开不开通知
  const firstTourRef = useRef(false);
  // 从活动通知点进来（/passport?activity=<id>&from=push）。先记进 sessionStorage：刚打开时
  // 护照资料可能还没载入，这一页会先跳去首页、首页再送回 /passport，地址上的参数在这一来一回里
  // 就丢了（2026-09-15 实测第一次打开停在封面）。重新挂载时从这里读回来，定位完再清掉。
  // 这一次也不自动弹引导：引导第一步会翻去导航页，把刚定位到的签证页换走
  const deepLinkRef = useRef(null);
  if (deepLinkRef.current === null) {
    const q = new URLSearchParams(loc.search);
    let deep = null;
    if (q.get('activity')) {
      deep = { id: q.get('activity'), from: q.get('from') || '' };
      try { sessionStorage.setItem('mlg.deepActivity', JSON.stringify(deep)); } catch { /* 存不了就只靠地址 */ }
    } else {
      try { deep = JSON.parse(sessionStorage.getItem('mlg.deepActivity') || 'null'); } catch { deep = null; }
    }
    deepLinkRef.current = deep && deep.id ? deep : false;
  }
  useEffect(() => {
    if (!opened || tourDone || deepLinkRef.current) return;
    firstTourRef.current = true;
    setTourOpen(true);
    setTourDone(true);
  }, [opened, tourDone, setTourDone]);

  // 通知推送开关（护照顶部的 🔔）
  const pushToast = useToast();
  const push = usePush(pushToast);
  const askConfirm = useConfirm();

  // 安卓 Chrome 截下来的安装事件到了没有（到了，引导里才给「一键添加到桌面」按钮）
  const [installReady, setInstallReady] = useState(canPromptInstall);
  useEffect(() => onInstallChange(() => setInstallReady(canPromptInstall())), []);

  /**
   * 关掉引导。第一次自动弹出的那次看完（或跳过）后，主动问一句要不要开通知。
   * 浏览器只允许在用户点击里弹权限框，所以先用自己的确认框问，
   * 用户点「开启通知」的那一下才去请求权限。每台设备只问一次；
   * 已经开了、浏览器不支持、iPhone 还没添加到桌面的都不问。
   */
  const closeTour = useCallback(async () => {
    setTourOpen(false);
    setTourDone(true);
    if (!firstTourRef.current) return;
    firstTourRef.current = false;
    let asked = false;
    try {
      asked = localStorage.getItem('mlg.notifyAsked.v1') === '1';
      localStorage.setItem('mlg.notifyAsked.v1', '1');
    } catch { /* 存不了就当没问过，最多多问一次 */ }
    if (asked || push.state === 'on' || pushSupport() !== 'ok') return;
    const yes = await askConfirm({
      title: '要打开活动通知吗？',
      body: '开启后，新活动发布、报名的活动改了时间地点、活动后发照片，同工都能直接提醒到你的手机。以后随时可以点护照顶部的铃铛关掉。',
      confirmText: '🔔 开启通知',
    });
    if (yes) push.toggle();
  }, [setTourDone, push, askConfirm]);

  // 签证页的内容来源：每场活动一张信息页，可再加照片/总结页
  //
  // me.signups / me.tags 都是数组，每轮同步都是新的引用，直接当依赖会让整本书
  // 的版式每次同步重算一遍。拼成字符串当键，内容真变了才重算
  const signedKey = (me?.signups || []).join(',');
  const tagKey = (me?.tags || []).join(',');
  const activities = useMemo(
    () => activitiesForPlayer(config, me),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signedKey / tagKey 代表那两个数组
    [config, me?.role, signedKey, tagKey],
  );
  // 签证页按活动装订，顺序就是配置里的先后（大致按时间）。
  // 游戏版那套「按各关忙闲排班」在这里用不上 —— 活动分散在几个月里，
  // 不存在开局全挤在一个门口的问题。
  const pages = useMemo(() => buildPages(activities, showReviews), [activities, showReviews]);
  const pageCount = pages.length;

  // 使用统计：翻到了哪页、打开了哪些浮层。只记类别和活动 id（见 lib/track.js）
  useEffect(() => {
    const p = pages[page];
    if (!p) return;
    if (p.kind === 'visa') track('visa', { activityId: activities[p.i]?.id, once: true });
    else track('page', { label: p.kind, once: true });
  }, [page, pages, activities]);
  useEffect(() => { if (overlay) track(overlay); }, [overlay]);
  useEffect(() => { if (modal) track(modal); }, [modal]);
  useEffect(() => { if (themeOpen) track('theme'); }, [themeOpen]);
  useEffect(() => { if (tourOpen) track('tour'); }, [tourOpen]);
  useEffect(() => {
    if (contributionActivity) track('contribution', { activityId: contributionActivity.id });
  }, [contributionActivity]);

  /* ------------------------------ 翻页 ------------------------------ */

  // 翻页动画状态：{ dir: 1|-1, phase: 'out'|'in' }，不翻的时候是 null
  const [flip, setFlip] = useState(null);
  const flipping = useRef(false);
  const flipTimers = useRef([]);
  const pending = useRef(null);   // 翻页途中最多排队一次

  // 有人开了「减少动态效果」就直接换页，不做 3D 翻转
  const reduceMotion = useRef(
    typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => () => {
    flipTimers.current.forEach(clearTimeout);
    document.querySelectorAll('.book-ghost').forEach((g) => g.remove());
  }, []);

  /**
   * 记「正在前往哪一页」，而不是「现在在哪一页」。
   *
   * 翻页要 420ms，期间 page 已经是新值但动画还没走完。按 page 算下一站
   * 在单层实现里会错位；存 target 最稳妥。
   * 用 ref 不用 state：move/goto 只是读它算方向，没必要因此每翻一页
   * 就换掉函数标识，那会让下游的 useMemo 全部重算。
   */
  const targetRef = useRef(0);
  useEffect(() => { if (!flipping.current) targetRef.current = page; }, [page]);
  useEffect(() => { if (page > 0) setOpened(true); }, [page]);

  /**
   * 把当前这一页克隆成一张静止的纸。
   *
   * 视图里没有 <canvas>（二维码是 toDataURL 出来的 <img>），所以
   * cloneNode 拿到的就是像素一致的副本。要清掉的只有两样：
   * data-tour 锚点（新手引导用 querySelector 找，会摸到副本上），
   * 以及 id（同页出现重复 id）。
   */
  const makeGhost = (live) => {
    const g = live.cloneNode(true);
    g.classList.add('book-ghost');
    g.querySelectorAll('[data-tour]').forEach((el) => el.removeAttribute('data-tour'));
    g.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    g.setAttribute('aria-hidden', 'true');
    return g;
  };

  /**
   * 翻到某一页。
   *
   * 两层：一层是 React 渲染的实时页，一层是克隆出来的旧页。
   *   向后翻 —— 旧页盖在上面转走，露出底下已经换好的新页
   *   向前翻 —— 旧页留在底下不动，实时页倒放着盖回去
   * 两个方向共用 bookPeel 这一段关键帧。
   */
  const flipTo = useCallback((dest, dir) => {
    const to = Math.max(0, Math.min(pageCount - 1, dest));
    setOverlay(null);
    if (to === targetRef.current) return;

    if (reduceMotion.current) { targetRef.current = to; setPage(to); return; }

    // 翻页途中再点：每一下都累加到目标页，但只排一次动画 ——
    // 手指停下时正好落在你点到的那一页，中间不补动画。
    //
    // 另外两种做法都不行：直接忽略的话，习惯性双击会丢一次；
    // 每次点击都排一段动画的话，连点几下就排出好几秒的队列，
    // 手指早停了页还在自己翻。
    targetRef.current = to;
    if (flipping.current) { pending.current = { dest: to, dir }; return; }

    const live = document.querySelector('.book-flip:not(.book-ghost)');
    const stage = live?.parentElement;
    // 结构对不上就老实换页，宁可没动画也不能卡住
    if (!live || !stage) { setPage(to); return; }

    stage.querySelectorAll('.book-ghost').forEach((g) => g.remove());
    const ghost = makeGhost(live);

    if (dir > 0) {
      // 后面的兄弟节点盖在前面的上面，不用动 z-index ——
      // 舞台里那两个弹层没设层级，改了反而会被压到页面底下
      stage.appendChild(ghost);
      ghost.style.animation = `bookPeel ${FLIP_MS}ms ${FLIP_EASE} both`;
    } else {
      stage.insertBefore(ghost, live);
    }

    flipping.current = true;
    setPage(to);
    setFlip({ dir });

    flipTimers.current.push(setTimeout(() => {
      ghost.remove();
      setFlip(null);
      flipping.current = false;
      const q = pending.current;
      pending.current = null;
      if (q) { targetRef.current = to; flipTo(q.dest, q.dir); }
    }, FLIP_MS));
  }, [pageCount]);

  const move = useCallback((d) => {
    flipTo(targetRef.current + d, d > 0 ? 1 : -1);
  }, [flipTo]);

  const goto = useCallback((i) => {
    if (i < 0) return;
    flipTo(i, i >= targetRef.current ? 1 : -1);
  }, [flipTo]);

  /**
   * 直接跳页，不走翻页动画。
   * 新手引导用 —— 它要测量高亮框在屏幕上的位置，页面要是正在 3D 旋转，
   * 量到的是转到一半的坐标，光圈就会满屏乱窜。
   */
  const jump = useCallback((i) => {
    if (i < 0) return;
    const to = Math.max(0, Math.min(pageCount - 1, i));
    setOverlay(null);
    if (to === targetRef.current) return;
    targetRef.current = to;
    setPage(to);
  }, [pageCount]);

  const toggleReviews = useCallback(() => {
    const current = pages[page] || pages[0];
    const nextOpen = !showReviews;
    const nextPages = buildPages(activities, nextOpen);
    // 收起时若正停在附页，退到该活动的信息页；其他页按身份重找索引，
    // 否则前面活动少了附页之后，当前页会错位到另一场活动。
    const target = current?.kind === 'visa' && !nextOpen && current.subPage
      ? { kind: 'visa', i: current.i, pageId: 'info' } : current;
    const nextIndex = nextPages.findIndex((p) => p.kind === target?.kind
      && (p.kind !== 'visa' || (p.i === target.i && p.pageId === target.pageId)));
    flipTimers.current.forEach(clearTimeout);
    flipTimers.current = [];
    document.querySelectorAll('.book-ghost').forEach((g) => g.remove());
    flipping.current = false;
    pending.current = null;
    setFlip(null);
    targetRef.current = Math.max(0, nextIndex);
    setPage(targetRef.current);
    setShowReviews(nextOpen);
    setReviewNotice({ open: nextOpen, id: Date.now() });
  }, [pages, page, showReviews, activities, setShowReviews]);

  const openReview = useCallback(() => {
    const current = pages[page];
    if (showReviews || current?.kind !== 'visa' || current.subPage) return;
    const firstExtra = buildPages(activities, true).findIndex((p) =>
      p.kind === 'visa' && p.i === current.i && p.subPage === 1);
    if (firstExtra < 0) return;
    toggleReviews();
    targetRef.current = firstExtra;
    setPage(firstExtra);
  }, [pages, page, showReviews, activities, toggleReviews]);

  /**
   * 从徽章页返回时，回到点进去时的那一页。
   *
   * 页码是组件状态、不在地址里，所以离开再回来会归零 —— 在最后一页点
   * 「我的徽章」，返回却落在封面，还得再翻十页。用 jump 而不是 goto：
   * 不放翻页动画，直接就在那一页，像从没离开过。
   */
  const backTo = loc.state?.page;
  useEffect(() => {
    if (typeof backTo !== 'number' || !pageCount) return;
    jump(backTo);
  }, [backTo, pageCount, jump]);

  /**
   * 从活动通知点进来：/passport?activity=<id>&from=push，直接翻到这场活动的第一张签证页。
   *
   * 这场活动在自己的护照里看不到（比如按标签发给了全部人、他没挂那个标签），就退回
   * 报名页 —— 至少看得到活动信息。处理完把参数从地址里去掉，免得刷新又跳一次、又记一次。
   */
  const deepHandled = useRef(false);
  useEffect(() => {
    const deep = deepLinkRef.current;
    if (!deep || deepHandled.current || !me || !pageCount) return;
    // 活动配置还没到（清过缓存后第一次打开时，护照资料可能比配置先到）就先别下结论：
    // 封面、欢迎这几页总在，pageCount 不为 0，但活动一张都没装订进来，会被误判成「看不到」
    if (!(config?.activities || []).length) return;
    deepHandled.current = true;
    try { sessionStorage.removeItem('mlg.deepActivity'); } catch { /* 忽略 */ }
    const fromPush = deep.from === 'push';
    const idx = pages.findIndex((p) => p.kind === 'visa' && !p.subPage && activities[p.i]?.id === deep.id);
    if (idx < 0) {
      nav(`/join/${encodeURIComponent(deep.id)}${fromPush ? '?from=push' : ''}`, { replace: true });
      return;
    }
    if (fromPush) track('notif_open', { activityId: deep.id, once: true });
    jump(idx);
    if (loc.search) nav('/passport', { replace: true });
  }, [me, config, pageCount, pages, activities, jump, nav, loc.search]);

  useEffect(() => {
    const onKey = (e) => {
      if (modal) { if (e.key === 'Escape') setModal(null); return; }
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
      if (e.key === 'Escape' && overlay) setOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, modal, overlay]);

  // 护照册是整屏翻页界面，自己不滚动。只在它挂载期间锁住页面，
  // 离开时必须解锁，否则其它页面会跟着滚不动。
  useEffect(() => {
    document.documentElement.classList.add('book-locked');
    return () => document.documentElement.classList.remove('book-locked');
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      // 普通 Safari/Chrome 的地址栏和底栏本来就不属于网页视口，不能拿
      // 物理屏幕高度补偿，否则会把内容挤偏并产生截图里那块巨大黑区。
      if (!standalone) {
        setScreenGap({ x: 0, y: 0 });
        return;
      }
      const sw = Number(window.screen?.width) || window.innerWidth;
      const sh = Number(window.screen?.height) || window.innerHeight;
      const fullW = vpLandscape ? Math.max(sw, sh) : Math.min(sw, sh);
      const fullH = vpLandscape ? Math.min(sw, sh) : Math.max(sw, sh);
      setScreenGap({
        x: Math.max(0, Math.min(160, fullW - window.innerWidth)),
        y: Math.max(0, Math.min(160, fullH - window.innerHeight)),
      });
    };
    const measureHeight = () => {
      const vv = window.visualViewport;
      // 键盘弹出时 visualViewport 会骤降，那属于输入状态，不要跟着缩护照
      const h = vv && vv.height > 0 ? Math.round(vv.height) : 0;
      setViewportH(h && Math.abs(h - window.innerHeight) < 220 ? h : 0);
    };
    measure();
    measureHeight();
    const onResize = () => { measure(); measureHeight(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [vpLandscape, standalone]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const on = () => setVpLandscape(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    setVpLandscape(mq.matches);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on);
    };
  }, []);

  /* ---------------------------- 二维码 ---------------------------- */
  // 载荷仍是 MLG:<编号>，和工作人员端扫码保持一致；本地生成，离线可用
  useEffect(() => {
    let alive = true;
    if (!me?.code) return;
    const payload = `MLG:${me.code}`;
    const opts = { errorCorrectionLevel: 'H', margin: 0, color: { dark: '#2a2320ff', light: '#00000000' } };
    Promise.all([
      QRCode.toDataURL(payload, { ...opts, width: 240 }),
      QRCode.toDataURL(payload, { ...opts, width: 720 }),
    ])
      .then(([thumb, big]) => {
        if (!alive) return;
        const img = (src, alt) => (
          <img src={src} alt={alt} style={{ width: '100%', height: '100%', display: 'block' }} />
        );
        setQr({ thumb: img(thumb, '护照二维码'), big: img(big, '护照二维码') });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [me?.code]);

  /* --------------------------- 实时排行榜 --------------------------- */

  const loadBoard = useCallback(async () => {
    // connect 和 hello 往往紧挨着到；合并掉重复请求。
    const now = Date.now();
    if (now - lastBoardRequestRef.current < 1200) return;
    lastBoardRequestRef.current = now;
    try {
      const res = await api('/api/leaderboard', { timeout: 7000 });
      setBoard(res.board || []);
      await kvSet('leaderboard', { board: res.board, at: Date.now() });
    } catch {
      const cached = await kvGet('leaderboard');
      if (cached?.board) setBoard(cached.board);
    }
  }, []);

  useEffect(() => {
    loadBoard();
    const off = onTick((p) => { if (changesLeaderboard(p.reason)) loadBoard(); });
    // 平时完全不轮询；从后台回到护照时补一次，避免手机休眠错过推送。
    const onVisible = () => { if (document.visibilityState === 'visible') loadBoard(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadBoard]);

  /* --------------------------- 水印预取 --------------------------- */
  /**
   * 地标水印没有放进 Service Worker 的预缓存（见 vite.config.js 里的
   * globIgnores）—— 那样会让安装包大一截，弱网下装不完就整个离线能力都没有。
   * 代价是每翻到一页才现去下载，手机上肉眼可见地慢半拍。
   *
   * 折中：开场后趁空闲只拉这本护照实际会出现的水印，运行时 CacheFirst
   * 会存下来；不把所有地标塞进预缓存或一口气下载。
   * 失败无所谓，水印只是底纹。
   */
  useEffect(() => {
    const acts = activities;
    const visaKeys = buildPages(acts, true)
      .filter((p) => p.kind === 'visa')
      .map((p) => visaWatermarkKey(acts[p.i]?.id, p.pageId))
      .filter(Boolean);
    const urls = [...new Set(['cathedral', 'university', 'wellington', ...visaKeys])]
      .map((k) => `/wm/${k}.png`)
      // 活动配图也一起预取：它比水印更值得提前拿，那是页面上唯一的实照
      .concat(acts.map((a) => a.photo || null))
      .filter(Boolean);
    if (urls.length === 0) return;

    let cancelled = false;
    const run = async () => {
      for (const u of [...new Set(urls)]) {
        if (cancelled) return;
        try { await fetch(u, { cache: 'force-cache' }); } catch { /* 装饰性资源，失败就算了 */ }
      }
    };
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(run, { timeout: 4000 })
      : setTimeout(run, 1500);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(id); else clearTimeout(id);
    };
  }, [activities]);

  const checkStamp = useCallback(async () => {
    if (checking) return;
    const now = Date.now();
    if (now - lastCheckRef.current < 3000) return;
    lastCheckRef.current = now;
    setChecking(true);
    try {
      await refreshMe();
    } finally {
      // 留一点时间让「查询中」可见，否则闪一下根本看不出点了
      setTimeout(() => setChecking(false), 350);
    }
  }, [checking]);

  /* ------------------------------ 分享 ------------------------------ */

  /* ------------------------------ 组装 ------------------------------ */

  const v = useMemo(() => {
    if (!me || !config) return null;
    return buildVals({
      me, rank, of, config, activities, board,
      ui: {
        page, overlay, modal, vpLandscape, flip, showReviews, reviewNotice,
        push: push.state,
        qrThumb: qr.thumb, qrBigImg: qr.big, checking, screenGap, viewportH,
        // 资料页的证件照就是选手自己捏的头像。
        // 照片框是 0.78 的竖长方形而头像是 1:1，所以用 fill + 方形裁切
        // 让它铺满整个框（左右各裁掉一点，人物居中，不会切到脸）。
        photo: (
          <div style={{ position: 'absolute', inset: 0 }}>
            <Avatar config={me.avatar} fill shape="square" />
          </div>
        ),
      },
      actions: {
        togglePush: push.toggle,
        move, goto, setOverlay, setModal, checkStamp, toggleReviews, openReview,
        // 资料页右上角那个「✎ 自定义」：改这本护照的配色，只影响自己
        openTheme: () => setThemeOpen(true),
        openContribution: (activity) => setContributionActivity(activity),
        startTour: () => setTourOpen(true),
        // 徽章页在底部导航里，而底部导航在护照页上是不显示的（这一页
        // 是整屏翻页界面）—— 登录后又直接落在护照页，于是那一页原本
        // 谁也到不了。结语页是书里放「分享 / 查看排名」的地方，加在这儿
        goBadge: () => nav('/badge', { state: { back: page } }),
      },
    });
  }, [me, rank, of, config, activities, board, page, overlay, modal, vpLandscape, flip, qr, checking, screenGap, push,
      showReviews, reviewNotice, move, goto, checkStamp, toggleReviews, openReview]);

  if (loading && !me) {
    return <BookSplash text="正在打开你的护照…" />;
  }
  if (!me) {
    nav('/', { replace: true });
    return null;
  }
  if (!v) return <BookSplash text="正在载入…" />;

  // 引导步骤。selector 指向护照册页眉上的 data-tour 锚点；
  // page 表示这一步需要先翻到第几页（页码见 buildPages）。
  const notesPage = pages.findIndex((p) => p.kind === 'notes');
  const firstVisa = pages.findIndex((p) => p.kind === 'visa');
  const pushOk = pushSupport();
  // 手机上还没从桌面图标打开的，引导第二步教「添加到桌面」（按 iPhone / 安卓分别说）
  const platform = installPlatform();
  const installStep = platform === 'ios' || platform === 'android' ? [{
    eyebrow: 'ADD TO HOME SCREEN 添加到桌面', page: notesPage,
    title: platform === 'ios' ? '先把护照放到 iPhone 桌面' : '把护照放到手机桌面',
    body: INSTALL_HOWTO[platform],
    action: platform === 'android' && installReady ? {
      label: '📲 一键添加到桌面',
      onClick: async () => { track('install', { label: await promptInstall() }); },
    } : null,
  }] : [];
  const tourSteps = [
    { eyebrow: 'YOUR PASSPORT 你的护照', page: notesPage,
      title: '这是一本会一直陪着你的活动护照',
      body: `它不属于某一晚或某一场游戏。主线先装订每场活动的 Visa 信息页，目前共 ${activities.length} 场；点左右边缘翻页，照片和总结可按需展开。` },
    { eyebrow: 'VISA PAGES 签证页', page: firstVisa,
      title: '每场活动都有自己的页面',
      body: 'Visa 首页放活动信息，照片和总结默认收起；文字多的地方可以用手指滑着看。页顶“上传”能把素材交给同工。有些活动只对报了名的人、或者某个小组的人显示。' },
    { eyebrow: 'ACTIVITY RECAP 活动回顾', page: firstVisa, selector: '[data-tour="reviews-toggle"]',
      title: '想看照片和总结，打开附页',
      body: '“详情页”浅色表示收起，此时有附页的 Visa 右下角会显示“活动回顾”，点它直接打开这场的照片或总结；点页眉“详情页”则全局展开，按钮变深色，附页进入正常翻页，“活动回顾”入口会隐藏。再点可收起。' },
    { eyebrow: 'IDENTIFICATION 资料页', page: pages.findIndex((p) => p.kind === 'data'),
      title: '现场出示的是“护照二维码”',
      body: '活动海报上的二维码用来报名；这本护照里的二维码用来让同工认出你并盖章，盖完这一场就记为「已参加」。扫不出来时，直接报资料页上的个人编号即可。' },
    // 这一步直接带「开启通知」按钮：点它就是用户手势，浏览器才肯弹权限框
    { eyebrow: 'NOTIFICATIONS 活动通知', page: notesPage, selector: '[data-tour="notify"]',
      title: push.state === 'on' ? '活动通知已经开启' : '要打开活动通知吗？',
      body: pushOk === 'ios-needs-home'
        ? '开启后，新活动发布、报名的活动有变动、活动后发照片，同工都能提醒到你。iPhone 要先按前面说的把护照添加到桌面，再从桌面图标打开，点这个铃铛开启。'
        : '开启后，新活动发布、报名的活动改了时间地点、活动后发照片，同工都可以直接推送到你的手机上。以后也可以点这个铃铛开关。',
      action: push.state === 'on'
        ? { label: '✓ 通知已开启', disabled: true }
        : pushOk === 'ok'
          ? { label: push.state === 'loading' ? '正在开启…' : '🔔 开启通知', disabled: push.state === 'loading', onClick: () => push.toggle() }
          : null,
      nextLabel: pushOk === 'ok' && push.state !== 'on' ? '以后再说' : undefined },
    { eyebrow: 'PERSONALISE 个性化', page: pages.findIndex((p) => p.kind === 'data'), selector: '[data-tour="theme"]',
      title: '这本护照可以有自己的颜色',
      body: '点“自定义”可以更换护照配色，只影响你自己的这一本，连这份说明也会跟着换颜色。姓名、头像或联系方式也可以随时回到个人资料里修改。' },
    { eyebrow: 'ATTENDANCE 参与记录', page: notesPage, selector: '[data-tour="board"]',
      title: '看看大家一起走了多远',
      body: '这里按参加活动的场次汇总，前三名会有奖杯。它不是一次游戏的输赢，只是一本共同生活的足迹册。' },
    { eyebrow: 'HOW TO USE 使用说明', page: notesPage, selector: '[data-tour="guide"]',
      title: '想再看一遍就点这里',
      body: '问号里随时可以重看这份说明。记住个人编号和四位密码；换手机或清除浏览器数据后，可以用它们找回同一本护照。' },
  ];
  tourSteps.splice(1, 0, ...installStep);


  return (
    <div style={{ position: 'relative' }}>
      <PassportBookView v={v} />

      <Tour
        open={tourOpen}
        // 引导挂在护照册外面，拿不到册子最外层注入的主题变量，得单独传进去
        themeVars={v.themeVars}
        steps={tourSteps}
        onGoPage={jump}
        onClose={closeTour}
      />

      <ThemeSheet
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        token={session?.token}
        me={me}
        theme={v.themeNow}
        presets={config?.themePresets || []}
      />

      <ActivityContributionSheet
        activity={contributionActivity}
        token={session?.token}
        onClose={() => setContributionActivity(null)}
      />


      {/* 我们自己的一条底栏：页码跳转 + 同步状态。
          必须放在底部而不是顶部 —— 横版页是整页旋转的，顶部浮层会盖住
          页面最左侧一列文字的开头。 */}

    </div>
  );
}

/* ------------------------------ 辅助件 ------------------------------ */

function BookSplash({ text }) {
  return (
    <div style={{
      height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 14, background: '#5c1a22',
      fontFamily: "'Noto Serif SC','EB Garamond',serif", color: '#e6cd91',
    }}>
      <div style={{ fontSize: 13, letterSpacing: '.5em', textIndent: '.5em', opacity: 0.75 }}>
        人 生 国
      </div>
      <div style={{ fontSize: 15, letterSpacing: '.18em', opacity: 0.6 }}>{text}</div>
    </div>
  );
}
