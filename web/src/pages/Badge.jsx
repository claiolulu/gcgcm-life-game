import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useLocation, useNavigate } from 'react-router-dom';
import { AvatarContent } from '../components/Avatar.jsx';
import { useToast, Empty } from '../components/ui.jsx';
import { usePlayer } from '../lib/player.js';
import { useConfig, activitiesForRole } from '../lib/config.js';
import { passportTheme } from './book/bookVals.js';

/**
 * 结业徽章：可保存、可分享朋友圈。
 * 整张图是一段 SVG，序列化后画进 canvas 导出 PNG —— 全程本地，断网也能生成。
 */
/** 把一个 hex 往黑里压一点（k<1）。用来从纸色推出卡片和边框那几档 */
function shadeHex(hex, k) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => Math.max(0, Math.min(255, Math.round(c * k))));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export default function Badge() {
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const { me, rank, of } = usePlayer();
  const { config } = useConfig();
  const svgRef = useRef(null);
  const [png, setPng] = useState(null);
  const [busy, setBusy] = useState(false);
  // 转发出去的图默认带二维码 —— 转发的目的通常就是叫人也来一本。
  // 不想带的人可以关掉（比如只想发给已经有护照的朋友）
  const [withQr, setWithQr] = useState(true);
  const [qr, setQr] = useState(null);
  const stations = activitiesForRole(config, me?.role);
  const game = config?.game || {};
  // 徽章用这本护照自己的配色（含这个人改过的）。分享出去的图和护照
  // 长得不一样的话，收到的人不会把两者联系起来
  const T = passportTheme(config, me);
  const soft = (a) => `rgba(${[1, 3, 5].map((i) => parseInt(T.text.slice(i, i + 2), 16)).join(',')},${a})`;
  const inkSoft = (a) => `rgba(${[1, 3, 5].map((i) => parseInt(T.ink.slice(i, i + 2), 16)).join(',')},${a})`;

  /**
   * 整屏跟着护照走，不只是那张图。
   *
   * 变量挂在 <html> 上而不是页面容器上，有两个原因：
   *   一是 body 那条 `color: var(--text)` 在 body 这一层就解析完了，
   *      在里面覆盖已经晚了，标题会留着深色底用的浅字；
   *   二是底栏是页面容器的兄弟节点，挂在里面够不着它，
   *      底下会留一条深蓝的条。
   * 覆盖变量而不是给每个元素写行内样式：.card / .btn / .eyebrow 全读
   * 这几个变量，改一处全跟上，以后加新元素也自动是对的。
   */
  const pageVars = {
    '--ink': T.paper,
    '--ink-2': T.paper,
    '--ink-3': shadeHex(T.paper, 0.97),
    '--ink-4': shadeHex(T.paper, 0.92),
    '--line': inkSoft(0.22),
    '--line-soft': inkSoft(0.12),
    '--gold': T.ink,
    '--gold-dim': shadeHex(T.ink, 0.85),
    '--gold-glow': inkSoft(0.16),
    '--text': T.text,
    '--text-2': soft(0.68),
    '--text-3': soft(0.5),
    '--shadow': `0 8px 30px ${inkSoft(0.14)}`,
    '--shadow-sm': `0 2px 10px ${inkSoft(0.1)}`,
  };
  const varsKey = JSON.stringify(pageVars);

  // ↓ 两个 effect 必须留在下面那句 early return 之前。
  //   放到 return 后面的话，没护照的人渲染的 hook 数量会比有护照的人少，
  //   React 立刻抛 #310（"Rendered fewer hooks than expected"）。
  // 二维码指向站点首页。没有护照的人打开就是领护照那一页，
  // 已经有的人会被直接送进自己的护照 —— 两种人扫同一个码都对。
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`${window.location.origin}/`, {
      errorCorrectionLevel: 'M', margin: 1, width: 320,
      // 深色模块用护照的主色、底色用纸色 —— 对比够高，扫得出来，
      // 又不用在图上贴一块突兀的白方块
      color: { dark: T.ink, light: T.paper },
    })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [T.ink, T.paper]);

  // 改了开关就把旧图作废，免得看着开关是关的、手里的图却带着码
  useEffect(() => { setPng(null); }, [withQr]);

  // 离开这一页要原样还回去 —— 这是全局副作用，不还的话整个 app 都变纸色
  useEffect(() => {
    const root = document.documentElement;
    const vars = JSON.parse(varsKey);
    const prev = {};
    for (const [k, v] of Object.entries(vars)) {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    }
    // body::before 那两团冷光（金 + 蓝）是给深色底画的，压在纸上是脏的
    root.classList.add('paper-screen');
    return () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);
      }
      root.classList.remove('paper-screen');
    };
  }, [varsKey]);

  if (!me) return <div className="page"><Empty icon="🛂" title="还没有护照" hint="先去报名领一本护照吧" /></div>;

  // 入册日期：徽章上第三栏原来是「人生意外」（盲盒抽了几张），那个字段没了
  // 手写而不用 toLocaleDateString：zh-CN 在 Chrome 上给的是「9/9」，
  // 而它旁边两栏是「1/1 排名」和「2/6 参加场次」—— 三个斜杠并排，
  // 日期会被读成比例
  const joinedOn = me.createdAt
    ? `${new Date(me.createdAt).getMonth() + 1}月${new Date(me.createdAt).getDate()}日`
    : '—';

  // 底部两套排版。带二维码时整块经文往上挪，给码腾出位置。
  // 集中写成一个对象，而不是把 y 值散成一堆三元表达式 —— 上一版就是
  // 那么写的（每个 y 都问一遍「有没有奖项」），改一次要对齐七八处。
  const qrOn = withQr && !!qr;
  // 二维码蹲在右下角，经文和落款留在中间 —— 码是给别人扫的，
  // 不该占住画面正中间把这张图变成一张广告
  const L = qrOn
    // qrY + qrSize + 26 就是那行说明的基线，必须留在 940 以内 ——
    // 排到 950 会被画布裁掉，而且预览上看不出来（SVG 溢出照样显示）
    ? { rule: 748, verse: 790, verseEn: 818, foot: 900, footX: 60, footAnchor: 'start',
        qrX: 494, qrY: 792, qrSize: 96 }
    : { rule: 772, verse: 816, verseEn: 848, foot: 906, footX: 320, footAnchor: 'middle' };

  async function render() {
    setBusy(true);
    try {
      const svg = svgRef.current;
      if (!svg) return;
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      const scale = 2; // 2 倍图，朋友圈里不糊
      const canvas = document.createElement('canvas');
      canvas.width = 640 * scale;
      canvas.height = 940 * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = T.paper;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL('image/png');
      setPng(dataUrl);
      toast('分享图已生成，可以保存或转发', 'ok', 4000);
    } catch (err) {
      toast('生成失败：' + (err.message || '未知错误'), 'err');
    } finally {
      setBusy(false);
    }
  }

  /**
   * 转发的是**图片本身**，不是一句文字。
   *
   * navigator.share 带 files 需要 HTTPS + 用户手势，桌面浏览器常常不支持，
   * 所以 canShare 先问一句，问不过就退回下载 —— 下载下来照样能发出去。
   * 用户在系统面板里点了取消会 reject，那不是错误，不要弹提示。
   */
  async function shareImage() {
    if (!png) return;
    try {
      const file = await pngFile();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '我的人生护照',
          text: '我的人生护照参加记录',
        });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;   // 用户自己取消的
    }
    download();
  }

  async function pngFile() {
    const blob = await (await fetch(png)).blob();
    return new File([blob], `${me.name}-人生护照.png`, { type: 'image/png' });
  }

  /**
   * 网页不能静默写进 iPhone 相册。iOS 上调用系统图片分享面板，用户点
   * “存储图像”即可进照片；其它平台直接下载 PNG。
   */
  async function saveImage() {
    if (!png) return;
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isiOS) {
      try {
        const file = await pngFile();
        if (navigator.canShare?.({ files: [file] })) {
          toast('请在系统面板里选择“存储图像”', 'ok', 3500);
          await navigator.share({ files: [file], title: '保存人生护照图片' });
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    download();
    toast('图片已开始保存', 'ok');
  }

  function download() {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = `人生护照-${me.name}-${me.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** 回到上一页 */
  const goBack = () => {
    const back = loc.state?.back;
    // 带着页码回去，护照就落回点进来时那一页（见 PassportBook 的 backTo）。
    // replace 是为了别让「护照 → 徽章 → 护照」在历史里堆成三条。
    if (typeof back === 'number') { nav('/passport', { state: { page: back }, replace: true }); return; }
    // 直接开这个地址进来的（扫码、书签、刷新）没有上一页，nav(-1) 会把人
    // 退出整个站。v6 里首个历史条目的 key 就是 'default'。
    if (loc.key === 'default') { nav('/passport'); return; }
    nav(-1);
  };

  return (
    <div className="page page--nonav page--badge">
      <div className="badge-scroll">
        <button
          className="btn btn--sm btn--ghost"
          onClick={goBack}
          style={{ marginBottom: 10 }}
        >
          ← 返回
        </button>

        <div className="center" style={{ marginBottom: 14 }}>
          <div className="eyebrow">Badge</div>
          <h1 style={{ marginTop: 4 }}>我的护照徽章</h1>
          <div className="small muted" style={{ marginTop: 6 }}>
            生成一张图，发给朋友或者发朋友圈
          </div>
        </div>

        {/* 生成之后就把这份实时预览收起来 —— 它和下面那张 PNG 一模一样，
            两张叠在一起只会让人以为要发两张图。SVG 必须留在 DOM 里，
            导出走的是它（序列化不需要它可见）。 */}
        <div className="card" style={{ padding: 10, overflow: 'hidden', display: png ? 'none' : 'block' }}>
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 640 940"
            width="100%"
            style={{ display: 'block', borderRadius: 14 }}
          >
          <defs>
            <linearGradient id="badge-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.paper} />
              <stop offset="100%" stopColor={T.paper} />
            </linearGradient>
            <linearGradient id="badge-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f5dd9a" />
              <stop offset="100%" stopColor="#b99a48" />
            </linearGradient>
          </defs>

          <rect width="640" height="940" fill="url(#badge-bg)" />
          <rect x="16" y="16" width="608" height="908" rx="30" fill="none" stroke={T.ink} strokeWidth="1.5" opacity="0.5" />
          <rect x="26" y="26" width="588" height="888" rx="24" fill="none" stroke={T.ink} strokeWidth="0.8" opacity="0.25" />

          {/* 抬头 */}
          <text x="320" y="80" textAnchor="middle" fill={T.ink} fontSize="15" fontWeight="700" letterSpacing="5">
            {game.titleEn || 'LIFE PASSPORT'}
          </text>
          <text x="320" y="112" textAnchor="middle" fill={T.ink} fontSize="25" fontWeight="700">
            人生护照 · 参加记录
          </text>
          <line x1="220" y1="132" x2="420" y2="132" stroke={T.ink} strokeWidth="1" opacity="0.4" />

          {/* 头像：用 transform 缩放内容层，避免嵌套 <svg> 导出时出问题 */}
          <g transform="translate(250, 156)">
            <circle cx="70" cy="70" r="74" fill="none" stroke={T.ink} strokeWidth="2.5" opacity="0.75" />
            <g transform="scale(1.4)">
              <AvatarContent config={me.avatar} idSuffix="-badge" />
            </g>
          </g>

          <text x="320" y="336" textAnchor="middle" fill={T.text} fontSize="30" fontWeight="800">
            {me.name}
          </text>
          <text x="320" y="366" textAnchor="middle" fill={soft(0.6)} fontSize="15" letterSpacing="3">
            参与者　|　{me.code}
          </text>

          {/* 主数字：盖了几个章。打卡本里它同时也是总分，两者永远相等 */}
          <text x="320" y="450" textAnchor="middle" fill={T.ink} fontSize="82" fontWeight="800">
            {me.stationsDone}
          </text>
          <text x="320" y="480" textAnchor="middle" fill={soft(0.5)} fontSize="14" letterSpacing="4">
            VISAS COLLECTED
          </text>

          {/* 三个数据。原来第三栏是「人生意外」（盲盒抽了几张），
              服务端早就不发那个字段了，印出来是 undefined */}
          <g>
            {[
              { x: 160, label: '排名', value: rank ? `${rank}/${of}` : '—' },
              { x: 320, label: '参加场次', value: `${me.stationsDone}/${me.stationsTotal}` },
              { x: 480, label: '入册', value: joinedOn },
            ].map((s) => (
              <g key={s.label}>
                <text x={s.x} y="536" textAnchor="middle" fill={T.text} fontSize="24" fontWeight="700">{s.value}</text>
                <text x={s.x} y="558" textAnchor="middle" fill={soft(0.5)} fontSize="13">{s.label}</text>
              </g>
            ))}
          </g>

          {/* 活动点阵：去过的实心带勾，没去的虚线圈 */}
          <line x1="80" y1="590" x2="560" y2="590" stroke={inkSoft(0.25)} strokeWidth="1" />
          {stations.map((st, i) => {
            const hit = me.stations?.[st.id];
            // 间距按场数自适应，几场都能均匀铺满 640 宽的画布
            const step = 460 / Math.max(1, stations.length - 1);
            const x = 90 + i * step;
            return (
              <g key={st.id}>
                <circle
                  cx={x} cy="632" r={stations.length > 7 ? 23 : 26}
                  fill={hit ? inkSoft(0.1) : 'none'}
                  stroke={hit ? T.ink : inkSoft(0.28)}
                  strokeWidth="1.5"
                  strokeDasharray={hit ? '0' : '3 3'}
                />
                <text x={x} y="640" textAnchor="middle" fontSize="20" opacity={hit ? 1 : 0.3}>{st.icon}</text>
                <text x={x} y="676" textAnchor="middle" fill={hit ? T.ink : soft(0.4)} fontSize="14" fontWeight="700">
                  {hit ? '✓' : '—'}
                </text>
              </g>
            );
          })}

          {/* 经文 */}
          <line x1="140" y1={L.rule} x2="500" y2={L.rule} stroke={inkSoft(0.25)} strokeWidth="1" />
          <text x="320" y={L.verse} textAnchor="middle" fill={T.ink} fontSize="22" fontWeight="700">
            「{game.verse || '我的恩典够你用的'}」
          </text>
          <text x="320" y={L.verseEn} textAnchor="middle" fill={soft(0.55)} fontSize="15" fontStyle="italic">
            {game.verseEn || "You don't have to do life alone"}
          </text>

          {/* 二维码：右下角。码本身就是护照的主色印在纸色上，
              对比够高扫得出来，不用再垫一块白方块 */}
          {qrOn && (
            <g>
              <rect
                x={L.qrX - 6} y={L.qrY - 6}
                width={L.qrSize + 12} height={L.qrSize + 12}
                rx="6" fill="none" stroke={inkSoft(0.3)} strokeWidth="1"
              />
              <image href={qr} x={L.qrX} y={L.qrY} width={L.qrSize} height={L.qrSize} />
              <text x={L.qrX + L.qrSize / 2} y={L.qrY + L.qrSize + 26} textAnchor="middle"
                    fill={soft(0.5)} fontSize="12" letterSpacing="1">
                扫码领一本
              </text>
            </g>
          )}

          <text x={L.footX} y={L.foot} textAnchor={L.footAnchor} fill={soft(0.45)} fontSize="12" letterSpacing="2">
            {game.church || 'GCGCM'}
          </text>
          </svg>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <label className="card row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
            <input
              type="checkbox" checked={withQr}
              onChange={(e) => setWithQr(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, flex: 'none' }}
            />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small bold">图里加一个二维码</div>
              <div className="tiny dim" style={{ marginTop: 2 }}>
                别人扫了就能领一本自己的护照。只发给已经有护照的朋友就可以关掉。
              </div>
            </div>
          </label>

          {png ? (
            <>
              <div className="card center stack">
                <div className="small muted">下面这张就是要发出去的图</div>
                <img src={png} alt="我的护照徽章" style={{ width: '100%', borderRadius: 12 }} />
              </div>
              <button className="btn btn--ghost btn--full" onClick={() => setPng(null)}>重新生成</button>
            </>
          ) : null}
        </div>
      </div>

      {/* 操作栏占据自己的布局空间，不悬浮覆盖上方的预览内容。 */}
      <div className="badge-action-dock" style={{ '--badge-action': T.ink, '--badge-action-text': T.paper }}>
        {!png ? (
          <button className="btn btn--lg badge-action-main" onClick={render} disabled={busy}>
            {busy ? '生成中…' : '📸 生成分享图'}
          </button>
        ) : (
          <>
            <div className="badge-action-row">
              <button className="btn btn--lg badge-action-save" onClick={saveImage}>↓ 保存图片</button>
              <button className="btn btn--lg badge-action-main" onClick={shareImage}>↗ 转发图片</button>
            </div>
            <div className="badge-share-apps">系统分享支持 微信 · 小红书 · Instagram · Facebook</div>
          </>
        )}
      </div>
    </div>
  );
}
