import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { AvatarContent } from '../components/Avatar.jsx';
import { useToast, Empty } from '../components/ui.jsx';
import { usePlayer } from '../lib/player.js';
import { useConfig } from '../lib/config.js';

/**
 * 结业徽章：可保存、可分享朋友圈。
 * 整张图是一段 SVG，序列化后画进 canvas 导出 PNG —— 全程本地，断网也能生成。
 */
export default function Badge() {
  const toast = useToast();
  const { me, rank, of } = usePlayer();
  const { config } = useConfig();
  const svgRef = useRef(null);
  const [png, setPng] = useState(null);
  const [busy, setBusy] = useState(false);
  // 转发出去的图默认带二维码 —— 转发的目的通常就是叫人也来一本。
  // 不想带的人可以关掉（比如只想发给已经有护照的朋友）
  const [withQr, setWithQr] = useState(true);
  const [qr, setQr] = useState(null);
  const stations = config?.activities || [];
  const game = config?.game || {};

  // ↓ 两个 effect 必须留在下面那句 early return 之前。
  //   放到 return 后面的话，没护照的人渲染的 hook 数量会比有护照的人少，
  //   React 立刻抛 #310（"Rendered fewer hooks than expected"）。
  // 二维码指向站点首页。没有护照的人打开就是领护照那一页，
  // 已经有的人会被直接送进自己的护照 —— 两种人扫同一个码都对。
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`${window.location.origin}/`, {
      errorCorrectionLevel: 'M', margin: 1, width: 320,
      color: { dark: '#0d1220', light: '#ffffff' },
    })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // 改了开关就把旧图作废，免得看着开关是关的、手里的图却带着码
  useEffect(() => { setPng(null); }, [withQr]);

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
  const L = qrOn
    ? { rule: 706, verse: 748, verseEn: 778, qrY: 800, qrSize: 96, foot: 928 }
    : { rule: 772, verse: 816, verseEn: 848, foot: 906 };

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
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL('image/png');
      setPng(dataUrl);
      toast('图生成好了，点「转发这张图」就能发出去', 'ok', 4000);
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
      const blob = await (await fetch(png)).blob();
      const file = new File([blob], `${me.name}-人生护照.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '我的人生护照' });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;   // 用户自己取消的
    }
    download();
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

  return (
    <div className="page">
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
              <stop offset="0%" stopColor="#1b2338" />
              <stop offset="55%" stopColor="#121a2c" />
              <stop offset="100%" stopColor="#0d1220" />
            </linearGradient>
            <linearGradient id="badge-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f5dd9a" />
              <stop offset="100%" stopColor="#b99a48" />
            </linearGradient>
          </defs>

          <rect width="640" height="940" fill="url(#badge-bg)" />
          <rect x="16" y="16" width="608" height="908" rx="30" fill="none" stroke="#b99a48" strokeWidth="1.5" opacity="0.55" />
          <rect x="26" y="26" width="588" height="888" rx="24" fill="none" stroke="#b99a48" strokeWidth="0.8" opacity="0.3" />

          {/* 抬头 */}
          <text x="320" y="80" textAnchor="middle" fill="#b99a48" fontSize="15" fontWeight="700" letterSpacing="5">
            {game.titleEn || 'LIFE PASSPORT'}
          </text>
          <text x="320" y="112" textAnchor="middle" fill="#eef1f8" fontSize="25" fontWeight="700">
            人生护照 · 参加记录
          </text>
          <line x1="220" y1="132" x2="420" y2="132" stroke="#b99a48" strokeWidth="1" opacity="0.5" />

          {/* 头像：用 transform 缩放内容层，避免嵌套 <svg> 导出时出问题 */}
          <g transform="translate(250, 156)">
            <circle cx="70" cy="70" r="74" fill="none" stroke="url(#badge-gold)" strokeWidth="3" />
            <g transform="scale(1.4)">
              <AvatarContent config={me.avatar} idSuffix="-badge" />
            </g>
          </g>

          <text x="320" y="336" textAnchor="middle" fill="#eef1f8" fontSize="30" fontWeight="800">
            {me.name}
          </text>
          <text x="320" y="366" textAnchor="middle" fill="#a8b2c9" fontSize="15" letterSpacing="3">
            参与者　|　{me.code}
          </text>

          {/* 主数字：盖了几个章。打卡本里它同时也是总分，两者永远相等 */}
          <text x="320" y="450" textAnchor="middle" fill="url(#badge-gold)" fontSize="82" fontWeight="800">
            {me.stationsDone}
          </text>
          <text x="320" y="480" textAnchor="middle" fill="#6d7791" fontSize="14" letterSpacing="4">
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
                <text x={s.x} y="536" textAnchor="middle" fill="#eef1f8" fontSize="24" fontWeight="700">{s.value}</text>
                <text x={s.x} y="558" textAnchor="middle" fill="#6d7791" fontSize="13">{s.label}</text>
              </g>
            ))}
          </g>

          {/* 活动点阵：去过的实心带勾，没去的虚线圈 */}
          <line x1="80" y1="590" x2="560" y2="590" stroke="#2a3450" strokeWidth="1" />
          {stations.map((st, i) => {
            const hit = me.stations?.[st.id];
            // 间距按场数自适应，几场都能均匀铺满 640 宽的画布
            const step = 460 / Math.max(1, stations.length - 1);
            const x = 90 + i * step;
            return (
              <g key={st.id}>
                <circle
                  cx={x} cy="632" r={stations.length > 7 ? 23 : 26}
                  fill={hit ? 'rgba(232,197,106,0.14)' : 'none'}
                  stroke={hit ? '#b99a48' : '#2a3450'}
                  strokeWidth="1.5"
                  strokeDasharray={hit ? '0' : '3 3'}
                />
                <text x={x} y="640" textAnchor="middle" fontSize="20" opacity={hit ? 1 : 0.3}>{st.icon}</text>
                <text x={x} y="676" textAnchor="middle" fill={hit ? '#b99a48' : '#6d7791'} fontSize="14" fontWeight="700">
                  {hit ? '✓' : '—'}
                </text>
              </g>
            );
          })}

          {/* 经文 */}
          <line x1="140" y1={L.rule} x2="500" y2={L.rule} stroke="#2a3450" strokeWidth="1" />
          <text x="320" y={L.verse} textAnchor="middle" fill="#e8c56a" fontSize="22" fontWeight="700">
            「{game.verse || '我的恩典够你用的'}」
          </text>
          <text x="320" y={L.verseEn} textAnchor="middle" fill="#a8b2c9" fontSize="15" fontStyle="italic">
            {game.verseEn || "You don't have to do life alone"}
          </text>

          {/* 二维码：白底是必须的，深底上的码扫不出来 */}
          {qrOn && (
            <g>
              <rect
                x={320 - L.qrSize / 2 - 7} y={L.qrY - 7}
                width={L.qrSize + 14} height={L.qrSize + 14}
                rx="8" fill="#ffffff"
              />
              <image href={qr} x={320 - L.qrSize / 2} y={L.qrY} width={L.qrSize} height={L.qrSize} />
            </g>
          )}

          <text x="320" y={L.foot} textAnchor="middle" fill="#6d7791" fontSize="12" letterSpacing="2">
            {qrOn ? `扫码领一本自己的护照 · ${game.church || 'GCGCM'}` : (game.church || 'GCGCM')}
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

        {!png ? (
          <button className="btn btn--primary btn--lg btn--full" onClick={render} disabled={busy}>
            {busy ? '生成中…' : '📸 生成图片'}
          </button>
        ) : (
          <>
            <div className="card center stack">
              <div className="small muted">下面这张就是要发出去的图</div>
              <img src={png} alt="我的护照徽章" style={{ width: '100%', borderRadius: 12 }} />
            </div>
            <button className="btn btn--primary btn--lg btn--full" onClick={shareImage}>📤 转发这张图</button>
            <div className="tiny dim center">
              系统会弹出分享面板；没弹出来就是这台设备不支持，图会直接下载，从相册里发一样的
            </div>
            <button className="btn btn--ghost btn--full" onClick={() => setPng(null)}>重新生成</button>
          </>
        )}
      </div>
    </div>
  );
}
