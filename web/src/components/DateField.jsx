import React from 'react';

/**
 * 活动日期：一个能自己打字的框 + 一个日历按钮。
 *
 * 为什么不直接用 <input type="date">：这一栏印在签证页的「签发日期」上，
 * 而有些活动本来就没有一个具体日子 —— 查经是「每周三」，退修会是
 * 「待定」。换成纯日历控件，这些就填不进去了。
 *
 * 所以文字框是主的，日历只是个快捷方式：挑完写成 2026-09-13 塞回文字框，
 * 之后照样能手改。文字认得出日子就把日历预选到那一天，认不出（「每周三」）
 * 就不预选，也不清空。
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 「2026-09-13」或旧格式「13 SEP 2026」→「2026-09-13」；认不出来返回空串 */
export function toISO(text) {
  const t = String(text || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(t);
  if (!m) return '';
  const mi = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase());
  if (mi < 0) return '';
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** 日期在界面和数据库里都保持 YYYY-MM-DD，不再转成英文月份。 */
export function fromISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

export default function DateField({ value, onChange, placeholder }) {
  return (
    <div className="row grow" style={{ gap: 6, minWidth: 0 }}>
      <input
        className="input grow" value={value || ''} maxLength={10} placeholder={placeholder}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
      />
      {/* 让透明的原生日历控件直接接住手指。iOS Safari / 微信 WebView
          不一定允许按钮再用 JS 去点一个隐藏 input，但直接点 input 一定认。 */}
      <label
        className="btn btn--ghost" title="从日历里挑一天"
        style={{ position: 'relative', flex: '0 0 auto', minHeight: 50, width: 48, padding: 0, fontSize: 17, overflow: 'hidden' }}
      >
        <span aria-hidden="true">📅</span>
        <input
          type="date" aria-label="从日历里挑一天"
          value={toISO(value)}
          onChange={(e) => { const t = fromISO(e.target.value); if (t) onChange(t); }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0,
            cursor: 'pointer', border: 0, padding: 0,
          }}
        />
      </label>
    </div>
  );
}
