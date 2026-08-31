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
import { onTick } from '../../lib/realtime.js';
import { ago, useLocalState } from '../../components/ui.jsx';
import TeamPanel from './TeamPanel.jsx';
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
  const { me, rank, of, online, connected, lastSyncedAt, loading } = usePlayer();

  const [page, setPage] = useState(0);
  const [overlay, setOverlay] = useState(null);   // null | 'board' | 'guide'
  const [modal, setModal] = useState(null);       // null | 'token' | 'qr'
  const [shared, setShared] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastCheckRef = useRef(0);
  const [teamOpen, setTeamOpen] = useState(false);
  // 抽到身份后自动弹一次队友面板 —— 这是选手最需要立刻知道的事
  const [seenTeam, setSeenTeam] = useLocalState('mlg.teamSeen', null);
  const [tourOpen, setTourOpen] = useState(false);
  // 自动引导要等人先把封面翻开。否则新用户一进来就被拽到导航页，
  // 连封面都没看见，还以为程序坏了。
  const [opened, setOpened] = useState(false);
  // 第一次打开护照自动走一遍引导，之后只在点 ? 时再看
  const [tourDone, setTourDone] = useLocalState('mlg.tourDone', false);
  const [board, setBoard] = useState([]);
  const [qr, setQr] = useState({ thumb: null, big: null });
  const [vpLandscape, setVpLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(orientation: landscape)').matches : false
  );

  const stations = config?.stations || [];
  const pages = useMemo(() => buildPages(stations), [stations]);
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
    const off = onTick((p) => { if (p.reason !== 'disconnect') loadBoard(); });
    const timer = setInterval(() => { if (navigator.onLine) loadBoard(); }, 20_000);
    return () => { off(); clearInterval(timer); };
  }, [loadBoard]);

  /* --------------------------- 主动查盖章 --------------------------- */
  /**
   * 在还没盖章的签证页上点一下 = 主动查一次是不是已经被记分。
   * 三重保护，防止选手站在关卡前反复戳把请求打爆：
   *   1. 已经有章的页面根本不会调到这里（见 bookVals 里的 stampTap）
   *   2. 两次请求之间至少隔 3 秒
   *   3. 同一时刻只允许一个请求在飞
   */
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
    const maxTotal = stations.length * (config?.settings?.maxStationScore ?? 9);
    const doneCount = Object.keys(me.stations || {}).length;
    const txt = `GCGCM 迷你人生游戏 · ${me.name} · ${me.total}/${maxTotal} 分，完成 ${doneCount}/${stations.length} 关。`;
    const done = () => { setShared(true); setTimeout(() => setShared(false), 2000); };
    if (navigator.share) { navigator.share({ title: 'GCGCM 迷你人生游戏', text: txt }).then(done).catch(() => {}); return; }
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
        openTeam: () => setTeamOpen(true),
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
      title: '这本护照就是你今晚的身份',
      body: '一共十四页：资料页、八张签证页、恩典站和结语。点页面的左右边缘可以前后翻页，也可以用方向键。' },
    { eyebrow: 'VISA PAGES 签证页', page: firstVisa,
      title: '每过一关，这里会盖一个章',
      body: '八张签证页对应八个关卡。同工当场评分：3 分勉强、6 分正常、9 分出色，颜色不一样。每关只有一次机会。' },
    { eyebrow: 'IDENTIFICATION 资料页', page: pages.findIndex((p) => p.kind === 'data'),
      title: '这一页有你的二维码',
      body: '到了关卡，把这个二维码给同工扫。扫不出来就报你的编号，页脚和右下角都有。' },
    { eyebrow: 'LEADERBOARD 排行', page: notesPage, selector: '[data-tour="board"]',
      title: '随时看实时排名',
      body: '全场积分实时更新。分数高的人在部分关卡可以优先排队 —— 人生本来就不太公平。' },
    { eyebrow: 'MY TEAM 队伍', page: notesPage, selector: '[data-tour="team"]',
      title: '这里是你的队伍和队友',
      body: '抽完签之后，这里会显示你的队伍颜色符号，以及队友的头像和名字。举着它在场内互相对暗号。' },
    { eyebrow: 'GRACE 恩典站', page: notesPage, selector: '[data-tour="grace"]',
      title: '卡住了就用这枚代币',
      body: '全场只有一枚 Help Token。卡关、失败、或者抽到大凶被扣分时，随时可以去恩典站递出它换一次帮助。' },
    { eyebrow: 'HOW TO PLAY 玩法', page: notesPage, selector: '[data-tour="guide"]',
      title: '想再看一遍就点这里',
      body: '以上这些随时可以重看。现在，翻开你的护照，去认识几个新朋友吧。' },
  ];

  const shouldReveal = !!me.identity && seenTeam !== me.identity + (me.teamId || '');
  const startStation = stations.find((st) => st.id === me.startStation);

  return (
    <div style={{ position: 'relative' }}>
      <PassportBookView v={v} />

      <Tour
        open={tourOpen || (!tourDone && opened)}
        steps={tourSteps}
        onGoPage={jump}
        onClose={() => { setTourOpen(false); setTourDone(true); }}
      />

      <TeamPanel
        open={teamOpen || shouldReveal}
        onClose={() => {
          setTeamOpen(false);
          setSeenTeam(me.identity + (me.teamId || ''));
        }}
        identity={me.identity}
        badge={v.teamBadge}
        teammates={v.teammates}
        startStation={startStation}
      />

      {/* 我们自己的一条底栏：页码跳转 + 同步状态。
          必须放在底部而不是顶部 —— 横版页是整页旋转的，顶部浮层会盖住
          页面最左侧一列文字的开头。 */}
      <BookBar online={online} connected={connected} at={lastSyncedAt} />
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

function BookBar({ online, connected, at }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const live = online && connected;
  const status = live ? 'LIVE 实时同步' : online ? `更新于 ${ago(at)}` : `离线 · ${ago(at)}的数据`;

  // 只剩一条同步状态。页码点撤掉了 —— 护照本来就是一页页翻的，
  // 点左右边缘或用方向键即可；排行榜、恩典站、玩法、队友都在页眉有入口。
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0,
      bottom: 'calc(env(safe-area-inset-bottom,0px) + 6px)',
      zIndex: 20, display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '2px 9px', borderRadius: 999,
        background: 'rgba(20,17,16,.5)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        fontFamily: "'EB Garamond',serif", fontSize: 9, letterSpacing: '.14em',
        color: live ? 'rgba(230,205,145,.8)' : 'rgba(230,205,145,.62)',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: '50%',
          background: live ? '#7fd8a8' : online ? '#e6cd91' : '#d98a8a',
        }} />
        {status}
      </div>
    </div>
  );
}
