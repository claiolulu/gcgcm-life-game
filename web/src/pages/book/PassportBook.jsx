import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import Avatar from '../../components/Avatar.jsx';

import PassportBookView from './PassportBookView.jsx';
import { buildVals, buildPages } from './bookVals.js';
import { FLIP_MS, FLIP_EASE } from './bookVals.js';
import { useConfig } from '../../lib/config.js';
import { usePlayer, refreshMe } from '../../lib/player.js';
import { api } from '../../lib/api.js';
import { kvGet, kvSet } from '../../lib/idb.js';
import { changesLeaderboard, onTick } from '../../lib/realtime.js';
import { useLocalState } from '../../components/ui.jsx';
import ThemeSheet from './ThemeSheet.jsx';
import Tour from './Tour.jsx';

/**
 * 选手护照册 —— 唯一的选手端界面。
 *
 * 纯展示：只从服务端拉数据，不做任何写入。记分、盖章、抽盲盒、收 Token
 * 全部发生在工作人员端，这里只负责把结果漂亮地呈现出来。
 */
export default function PassportBook() {
  const nav = useNavigate();
  const { config } = useConfig();
  const { me, rank, of, loading, session } = usePlayer();

  const [page, setPage] = useState(0);
  const [overlay, setOverlay] = useState(null);   // null | 'board' | 'guide'
  const [modal, setModal] = useState(null);       // null | 'token' | 'qr'
  const [shared, setShared] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastCheckRef = useRef(0);
  const lastBoardRequestRef = useRef(0);
  const [themeOpen, setThemeOpen] = useState(false);
  // 抽到身份后自动弹一次队友面板 —— 这是选手最需要立刻知道的事
  const [tourOpen, setTourOpen] = useState(false);
  // 自动引导要等人先把封面翻开。否则新用户一进来就被拽到导航页，
  // 连封面都没看见，还以为程序坏了。
  const [opened, setOpened] = useState(false);
  // v2 是打卡护照的新说明。换一个键，让看过旧游戏引导的人也会自动看到一次。
  const [tourDone, setTourDone] = useLocalState('mlg.tourDone.v2', false);
  const [board, setBoard] = useState([]);
  const [qr, setQr] = useState({ thumb: null, big: null });
  const [vpLandscape, setVpLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(orientation: landscape)').matches : false
  );

  const stations = config?.activities || [];
  // 签证页的内容来源：一场活动一页
  const activities = useMemo(() => config?.activities || [], [config]);
  // 签证页按活动装订，顺序就是配置里的先后（大致按时间）。
  // 游戏版那套「按各关忙闲排班」在这里用不上 —— 活动分散在几个月里，
  // 不存在开局全挤在一个门口的问题。
  const pages = useMemo(() => buildPages(activities), [activities]);
  const pageCount = pages.length;

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

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(orientation: landscape)');
    const on = (e) => setVpLandscape(e.matches);
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
   * 折中：开场之后趁空闲把它们全拉一遍，运行时的 CacheFirst 规则会存下来。
   * 一共十来张、约 260KB，等真翻到那一页时已经在缓存里了。
   * 失败无所谓，水印只是底纹。
   */
  useEffect(() => {
    // 签证页现在按活动装订，水印要跟着活动的 landmarkKey 取 ——
    // 原来读的是 stations（游戏版的八个关卡），预取的是一批翻不到的图
    const acts = config?.activities || [];
    const urls = acts.map((a) => (a.landmarkKey ? `/wm/${a.landmarkKey}.png` : null))
      .concat(['cathedral', 'university', 'wellington'].map((k) => `/wm/${k}.png`))
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
  }, [config]);

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

  const share = useCallback(() => {
    if (!me) return;
    // 分享的是打卡进度，不是分数 —— 分数没有上限，「30/72」那种写法不成立
    const doneCount = Object.keys(me.stations || {}).length;
    const txt = `GCGCM 活动护照 · ${me.name} · 已参加 ${doneCount}/${activities.length} 场活动，累计 ${me.total} 分。`;
    const done = () => { setShared(true); setTimeout(() => setShared(false), 2000); };
    if (navigator.share) { navigator.share({ title: 'GCGCM 活动护照', text: txt }).then(done).catch(() => {}); return; }
    if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(done).catch(done); return; }
    done();
  }, [me, stations.length, config]);

  /* ------------------------------ 组装 ------------------------------ */

  const v = useMemo(() => {
    if (!me || !config) return null;
    return buildVals({
      me, rank, of, config, board,
      ui: {
        page, overlay, modal, vpLandscape, shared, flip,
        qrThumb: qr.thumb, qrBigImg: qr.big, checking,
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
        move, goto, setOverlay, setModal, share, checkStamp,
        // 资料页右上角那个「✎ 自定义」：改这本护照的配色，只影响自己
        openTheme: () => setThemeOpen(true),
        startTour: () => setTourOpen(true),
      },
    });
  }, [me, rank, of, config, board, page, overlay, modal, vpLandscape, shared, flip, qr, checking,
      move, goto, share, checkStamp]);

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
  const tourSteps = [
    { eyebrow: 'YOUR PASSPORT 你的护照', page: notesPage,
      title: '这是一本会一直陪着你的活动护照',
      body: `它不属于某一晚或某一场游戏。资料页、${config?.activities?.length || 0} 张活动签证页和结语装订在一起；以后增加活动，也会自动多一页。点左右边缘即可翻页。` },
    { eyebrow: 'VISA PAGES 签证页', page: firstVisa,
      title: '每场活动都有自己的一页',
      body: '活动名称、日期、负责人和你的报名状态都在签证页上。参加活动后，同工会在对应页面盖一枚「已参加」的章；每场只盖一次。' },
    { eyebrow: 'IDENTIFICATION 资料页', page: pages.findIndex((p) => p.kind === 'data'),
      title: '现场出示的是“护照二维码”',
      body: '活动海报上的二维码用来报名；这本护照里的二维码用来让同工认出你并盖章。扫不出来时，直接报资料页上的个人编号即可。' },
    { eyebrow: 'PERSONALISE 个性化', page: pages.findIndex((p) => p.kind === 'data'), selector: '[data-tour="theme"]',
      title: '这本护照可以有自己的颜色',
      body: '点“自定义”可以更换护照配色，只影响你自己的这一本。姓名、头像或联系方式也可以随时回到个人资料里修改。' },
    { eyebrow: 'ATTENDANCE 参与记录', page: notesPage, selector: '[data-tour="board"]',
      title: '看看大家一起走了多远',
      body: '这里按参加活动的记录汇总。它不是一次游戏的输赢，只是一本共同生活的足迹册。' },
    { eyebrow: 'HOW TO USE 使用说明', page: notesPage, selector: '[data-tour="guide"]',
      title: '想再看一遍就点这里',
      body: '问号里随时可以重看完整说明。记住个人编号和四位密码；换手机或清除浏览器数据后，可以用它们找回同一本护照。' },
  ];


  return (
    <div style={{ position: 'relative' }}>
      <PassportBookView v={v} />

      <Tour
        open={tourOpen || (!tourDone && opened)}
        steps={tourSteps}
        onGoPage={jump}
        onClose={() => { setTourOpen(false); setTourDone(true); }}
      />

      <ThemeSheet
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        token={session?.token}
        theme={v.themeNow}
        presets={config?.themePresets || []}
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
        迷 你 人 生 国
      </div>
      <div style={{ fontSize: 15, letterSpacing: '.18em', opacity: 0.6 }}>{text}</div>
    </div>
  );
}

/**
 * 抽完盲盒之后，把结果给本人看一遍。
 *
 * 之前只有同工那边看得到抽了什么，选手只知道分数变了 ——
 * 加了几分、为什么加、下一关有没有附带限制，全靠同工口头转述，
 * 现场吵起来根本听不清。
 *
 * 卡片数据在 /api/config 里本来就有，选手的 history 带 cardId，
 * 对一下就能还原完整的卡面，不用加接口。
 */
