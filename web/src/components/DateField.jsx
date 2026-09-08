import React, { useRef } from 'react';

/**
 * 活动日期：一个能自己打字的框 + 一个日历按钮。
 *
 * 为什么不直接用 <input type="date">：这一栏印在签证页的「签发日期」上，
 * 而有些活动本来就没有一个具体日子 —— 查经是「每周三」，退修会是
 * 「待定」。换成纯日历控件，这些就填不进去了。
 *
 * 所以文字框是主的，日历只是个快捷方式：挑完写成 13 SEP 2026 塞回文字框，
 * 之后照样能手改。文字认得出日子就把日历预选到那一天，认不出（「每周三」）
 * 就不预选，也不清空。
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 「13 SEP 2026」→「2026-09-13」；认不出来返回空串 */
export function toISO(text) {
  const t = String(text || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(t);
  if (!m) return '';
  const mi = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase());
  if (mi < 0) return '';
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** 「2026-09-13」→「13 SEP 2026」 */
export function fromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  // 一路用字符串拼，不碰 Date —— new Date('2026-09-13') 是 UTC 零点，
  // 在西边的时区上格式化出来会退成 12 号
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

export default function DateField({ value, onChange, placeholder }) {
  const ref = useRef(null);

  function openCalendar() {
    const el = ref.current;
    if (!el) return;
    // showPicker 是现在的正路；老 Safari 没有，退回聚焦（点一下也会弹）
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* 用户手势之外调用会抛，往下走 */ }
    }
    el.focus();
    el.click();
  }

  return (
    <div className="row grow" style={{ gap: 6, minWidth: 0 }}>
      <input
        className="input grow" value={value || ''} maxLength={20} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button" className="btn btn--ghost" title="从日历里挑一天"
        onClick={openCalendar}
        style={{ flex: '0 0 auto', minHeight: 50, padding: '0 12px', fontSize: 17 }}
      >
        📅
      </button>
      {/* 真正的日历控件藏起来，只借它弹出的那个面板 */}
      <input
        ref={ref} type="date" tabIndex={-1} aria-hidden="true"
        value={toISO(value)}
        onChange={(e) => { const t = fromISO(e.target.value); if (t) onChange(t); }}
        style={{
          position: 'absolute', width: 1, height: 1, opacity: 0,
          pointerEvents: 'none', border: 0, padding: 0,
        }}
      />
    </div>
  );
}
