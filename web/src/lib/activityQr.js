import QRCode from 'qrcode';

/**
 * 活动报名二维码：扫码进入这场活动的报名页，中间压一个图标。
 *
 * 用最高纠错等级 H（能容 30% 缺损），中间的徽章只占宽度的 24%，面积不到 6%，
 * 各家相机都扫得出来。点阵用近黑色、白底，不跟护照主题变色 —— 彩色点阵在
 * 暗光下扫不出来。徽章才用护照的酒红和金色。
 *
 * 链接带 ?from=share，报名页据此统计「通过分享码打开」（见 Join.jsx）。
 */
export function joinUrlFor(activityId, shareOrigin) {
  if (!activityId) return '';
  const origin = String(shareOrigin || '').replace(/\/+$/, '')
    || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/join/${encodeURIComponent(activityId)}?from=share`;
}

const cache = new Map();

/**
 * 画好的 PNG data URL。同一个链接 + 图标 + 尺寸只画一次。
 * icon：'' 或 'M' 画护照徽章里的 M；其它按 emoji / 文字画在圆心。
 */
export function activityQr(url, { icon = '', size = 600 } = {}) {
  const key = `${url}|${icon}|${size}`;
  if (!cache.has(key)) {
    cache.set(key, draw(url, icon, size).catch((err) => { cache.delete(key); throw err; }));
  }
  return cache.get(key);
}

async function draw(url, icon, size) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: 'H', margin: 2, width: size,
    color: { dark: '#141110ff', light: '#ffffffff' },
  });
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const c = w / 2;
  const badge = w * 0.24;
  const r = badge / 2;

  // 白色圆角底，把徽章和点阵隔开
  const pad = w * 0.018;
  const s = badge + pad * 2;
  const x = c - s / 2;
  const rr = s * 0.24;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x + rr, x);
  ctx.arcTo(x + s, x, x + s, x + s, rr);
  ctx.arcTo(x + s, x + s, x, x + s, rr);
  ctx.arcTo(x, x + s, x, x, rr);
  ctx.arcTo(x, x, x + s, x, rr);
  ctx.closePath();
  ctx.fill();

  // 酒红圆 + 金色内圈，和护照封面的徽章同一套
  ctx.fillStyle = '#5b1f26';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8c56a';
  ctx.lineWidth = Math.max(2, w * 0.006);
  ctx.beginPath();
  ctx.arc(c, c, r * 0.82, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyph = String(icon || '').trim();
  if (!glyph || glyph === 'M') {
    ctx.fillStyle = '#e8c56a';
    ctx.font = `${Math.round(r * 1.02)}px "EB Garamond", Georgia, "Times New Roman", serif`;
    ctx.fillText('M', c, c + r * 0.05);
  } else {
    ctx.font = `${Math.round(r * 0.95)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(glyph, c, c + r * 0.06);
  }
  return canvas.toDataURL('image/png');
}
