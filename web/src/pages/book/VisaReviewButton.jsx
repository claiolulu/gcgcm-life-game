import React from 'react';

// 固定在 Visa 画板上的附页入口；编辑预览和实际护照共用位置与样式。
export default function VisaReviewButton({ onClick, preview = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={preview ? -1 : undefined}
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : '查看活动回顾'}
      style={{
        position: 'absolute', right: '2.5cqh', bottom: '14cqh', zIndex: 7,
        padding: '1.3cqh 2cqh', border: '1px solid rgba(var(--pp-ink-rgb),.5)',
        background: 'var(--pp-ink)', color: 'var(--pp-gold)',
        fontFamily: "'Noto Serif SC',serif", fontSize: '2.7cqh', fontWeight: 700,
        letterSpacing: '.08em', whiteSpace: 'nowrap',
        boxShadow: '0 2px 7px rgba(40,25,20,.2)',
        pointerEvents: preview ? 'none' : 'auto',
      }}
    >活动回顾 →</button>
  );
}
