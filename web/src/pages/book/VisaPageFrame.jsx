import React from 'react';
import { themeVarsOf } from './bookVals.js';

/**
 * 编辑器里那张纸。
 *
 * 只画页面上「不属于块」的那几样：纸色、地标水印、页眉那排按钮、右下角
 * 的二维码。中间留给 children —— 编辑器把可拖的块塞进来，层叠位置和真
 * 页面一致（页眉压得住块，水印压不住）。
 *
 * 页面固定为 1.9:1。真护照在竖屏手机上把同一张横版纸转 90° 后等比缩放，
 * 横屏则直接等比缩放；编辑器也用这个比例，因此两边的坐标和字号一致。
 */
export const PAGE_ASPECT = 1.9;

export default function VisaPageFrame({ theme, activity, children }) {
  return (
    <div style={{
      ...themeVarsOf(theme),
      position: 'absolute', inset: 0,
      background: theme?.paper || '#f3ede0',
      overflow: 'hidden', containerType: 'size',
    }}>
      {/* 地标水印：在块之下 */}
      {activity?.landmarkKey && (
        <div style={{
          position: 'absolute', right: '3%', top: '12%', width: '40%', bottom: '14%',
          backgroundImage: `url("/wm/${activity.landmarkKey}.png")`,
          backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
          opacity: theme?.watermark ?? 0.13, pointerEvents: 'none',
        }} />
      )}

      {children}

      {/* 页眉：App 的导航，不是这一页的内容，所以不是块，也不给拖 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: '1.5cqh',
        padding: '2cqh 2.5cqh', borderBottom: '1px solid rgba(var(--pp-ink-rgb),.4)',
        fontSize: '2.6cqh', color: 'var(--pp-ink)', background: theme?.paper || '#f3ede0',
        pointerEvents: 'none',
      }}>
        <span style={{ opacity: 0.45 }}>🏆 🪪 LIVE</span>
        <span style={{ flex: 1, textAlign: 'center', letterSpacing: '.14em', opacity: 0.7 }}>
          {activity?.icon} {activity?.name || '活动名'}
        </span>
        <span style={{ opacity: 0.45 }}>00 PTS · G · ?</span>
      </div>

      {/* 二维码：同工要扫它盖章，位置不给动 */}
      <div style={{
        position: 'absolute', right: '1.5cqh', bottom: '1.5cqh', zIndex: 6,
        width: '7cqh', height: '7cqh', background: '#fff',
        border: '1px solid rgba(var(--pp-ink-rgb),.4)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '2cqh',
        color: 'rgba(var(--pp-ink-rgb),.6)', pointerEvents: 'none',
      }}>QR</div>
    </div>
  );
}
