import React, { useEffect, useRef, useState } from 'react';
import { AvatarContent } from '../components/Avatar.jsx';
import { useToast, Empty } from '../components/ui.jsx';
import { usePlayer } from '../lib/player.js';
import { useConfig } from '../lib/config.js';
import { api } from '../lib/api.js';
import { kvGet, kvSet } from '../lib/idb.js';

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
  const [myAwards, setMyAwards] = useState([]);

  const stations = config?.stations || [];
  const identities = config?.identities || {};
  const game = config?.game || {};
  const awardDefs = config?.awards || [];

  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        const res = await api('/api/awards', { timeout: 6000 });
        await kvSet('awards', res.awards);
        setMyAwards((res.awards || []).filter((a) => a.player?.id === me.id));
      } catch {
        const cached = await kvGet('awards');
        setMyAwards((cached || []).filter((a) => a.player?.id === me.id));
      }
    })();
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <div className="page"><Empty icon="🛂" title="还没有护照" hint="先去报名领一本护照吧" /></div>;

  const identity = identities[me.identity];
  const awardName = myAwards
    .map((a) => awardDefs.find((d) => d.id === a.awardId))
    .filter(Boolean)[0];

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
      toast('徽章已生成，长按图片即可保存', 'ok', 4000);
    } catch (err) {
      toast('生成失败：' + (err.message || '未知错误'), 'err');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = `MiniLifeGame-${me.name}-${me.code}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="page">
      <div className="center" style={{ marginBottom: 14 }}>
        <div className="eyebrow">Finisher Badge</div>
        <h1 style={{ marginTop: 4 }}>我的人生成绩单</h1>
      </div>

      <div className="card" style={{ padding: 10, overflow: 'hidden' }}>
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
            MINI LIFE GAME
          </text>
          <text x="320" y="112" textAnchor="middle" fill="#eef1f8" fontSize="25" fontWeight="700">
            人生护照 · 结业徽章
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
            {identity ? `${identity.name} · ${identity.cn}` : '参与者'}　|　{me.code}
          </text>

          {/* 主分数 */}
          <text x="320" y="450" textAnchor="middle" fill="url(#badge-gold)" fontSize="82" fontWeight="800">
            {me.total}
          </text>
          <text x="320" y="480" textAnchor="middle" fill="#6d7791" fontSize="14" letterSpacing="4">
            FINAL SCORE
          </text>

          {/* 三个数据 */}
          <g>
            {[
              { x: 160, label: '排名', value: rank ? `${rank}/${of}` : '—' },
              { x: 320, label: '完成关卡', value: `${me.stationsDone}/${me.stationsTotal}` },
              { x: 480, label: '人生意外', value: `${me.lifeEventsTaken}` },
            ].map((s) => (
              <g key={s.label}>
                <text x={s.x} y="536" textAnchor="middle" fill="#eef1f8" fontSize="24" fontWeight="700">{s.value}</text>
                <text x={s.x} y="558" textAnchor="middle" fill="#6d7791" fontSize="13">{s.label}</text>
              </g>
            ))}
          </g>

          {/* 七关点阵 */}
          <line x1="80" y1="590" x2="560" y2="590" stroke="#2a3450" strokeWidth="1" />
          {stations.map((st, i) => {
            const hit = me.stations?.[st.id];
            // 间距按关卡数自适应，7 关或 8 关都能均匀铺满 640 宽的画布
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
                  {hit ? hit.points : '—'}
                </text>
              </g>
            );
          })}

          {/* 奖项 */}
          {awardName && (
            <g>
              <rect x="180" y="700" width="280" height="42" rx="21" fill="rgba(232,197,106,0.14)" stroke="#b99a48" />
              <text x="320" y="727" textAnchor="middle" fill="#e8c56a" fontSize="17" fontWeight="700">
                {awardName.icon} {awardName.name}
              </text>
            </g>
          )}

          {/* Token */}
          <text x="320" y={awardName ? 776 : 740} textAnchor="middle" fill="#a8b2c9" fontSize="14">
            {me.tokensLeft > 0
              ? '🪙 我一个人扛完了全程 —— 但其实不必如此'
              : '🪙 我在恩典站伸手求助过一次'}
          </text>

          {/* 经文 */}
          <line x1="140" y1={awardName ? 806 : 772} x2="500" y2={awardName ? 806 : 772} stroke="#2a3450" strokeWidth="1" />
          <text x="320" y={awardName ? 848 : 816} textAnchor="middle" fill="#e8c56a" fontSize="22" fontWeight="700">
            「{game.verse || '我的恩典够你用的'}」
          </text>
          <text x="320" y={awardName ? 878 : 848} textAnchor="middle" fill="#a8b2c9" fontSize="15" fontStyle="italic">
            {game.verseEn || "You don't have to do life alone"}
          </text>
          <text x="320" y="906" textAnchor="middle" fill="#4a5470" fontSize="12" letterSpacing="2">
            {game.church || 'GCGCM 迎新'}
          </text>
        </svg>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {!png ? (
          <button className="btn btn--primary btn--lg btn--full" onClick={render} disabled={busy}>
            {busy ? '生成中…' : '📸 生成分享图'}
          </button>
        ) : (
          <>
            <div className="card center stack">
              <div className="small muted">长按下面的图片即可保存到相册</div>
              <img src={png} alt="我的结业徽章" style={{ width: '100%', borderRadius: 12 }} />
            </div>
            <button className="btn btn--primary btn--full" onClick={download}>⬇️ 下载图片</button>
            <button className="btn btn--ghost btn--full" onClick={() => setPng(null)}>重新生成</button>
          </>
        )}
      </div>
    </div>
  );
}
