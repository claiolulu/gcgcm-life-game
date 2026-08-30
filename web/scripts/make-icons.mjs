/**
 * 生成 PWA 图标。手写 PNG 编码，不依赖任何图形库 ——
 * 现场重新构建时不会因为缺少 native 依赖而挂掉。
 * 用法：node scripts/make-icons.mjs
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------ PNG 编码 ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ 绘图 ------------------------------ */

function canvas(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    const sa = Math.min(1, a);
    const da = buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  };

  return {
    buf,
    fill(color) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, color, 1);
    },
    /** 抗锯齿实心圆 */
    disc(cx, cy, r, color, alpha = 1) {
      const x0 = Math.max(0, Math.floor(cx - r - 2));
      const x1 = Math.min(size - 1, Math.ceil(cx + r + 2));
      const y0 = Math.max(0, Math.floor(cy - r - 2));
      const y1 = Math.min(size - 1, Math.ceil(cy + r + 2));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const cov = Math.min(1, Math.max(0, r + 0.5 - d));
          if (cov > 0) put(x, y, color, cov * alpha);
        }
      }
    },
    /** 抗锯齿圆环 */
    ring(cx, cy, r, w, color, alpha = 1) {
      const outer = r + w / 2;
      const inner = r - w / 2;
      const x0 = Math.max(0, Math.floor(cx - outer - 2));
      const x1 = Math.min(size - 1, Math.ceil(cx + outer + 2));
      const y0 = Math.max(0, Math.floor(cy - outer - 2));
      const y1 = Math.min(size - 1, Math.ceil(cy + outer + 2));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const cov = Math.min(1, Math.max(0, outer + 0.5 - d)) * Math.min(1, Math.max(0, d - inner + 0.5));
          if (cov > 0) put(x, y, color, cov * alpha);
        }
      }
    },
    /** 垂直渐变背景 */
    vgrad(top, bottom) {
      for (let y = 0; y < size; y++) {
        const t = y / (size - 1);
        const c = [
          Math.round(top[0] + (bottom[0] - top[0]) * t),
          Math.round(top[1] + (bottom[1] - top[1]) * t),
          Math.round(top[2] + (bottom[2] - top[2]) * t),
        ];
        for (let x = 0; x < size; x++) put(x, y, c, 1);
      }
    },
  };
}

const INK_TOP = [26, 35, 56];
const INK_BOTTOM = [13, 18, 32];
const GOLD = [232, 197, 106];
const GOLD_DIM = [185, 154, 72];

function drawIcon(size) {
  const c = canvas(size);
  const u = size / 512; // 以 512 为设计基准等比缩放

  c.vgrad(INK_TOP, INK_BOTTOM);

  // 外圈烫金压印
  c.ring(256 * u, 256 * u, 196 * u, 7 * u, GOLD_DIM, 0.55);
  c.ring(256 * u, 256 * u, 176 * u, 3 * u, GOLD_DIM, 0.3);

  // 骰子：五点
  const dot = 26 * u;
  const off = 66 * u;
  const cx = 256 * u;
  const cy = 256 * u;
  c.disc(cx, cy, dot, GOLD);
  c.disc(cx - off, cy - off, dot, GOLD);
  c.disc(cx + off, cy + off, dot, GOLD);
  c.disc(cx + off, cy - off, dot, GOLD_DIM);
  c.disc(cx - off, cy + off, dot, GOLD_DIM);

  return encodePNG(size, size, c.buf);
}

for (const size of [192, 512]) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log('✓', path.relative(process.cwd(), file));
}

// apple-touch-icon 用 192 那张
fs.copyFileSync(path.join(OUT, 'icon-192.png'), path.join(OUT, 'apple-touch-icon.png'));
console.log('✓ public/apple-touch-icon.png');

// favicon 用 SVG，浏览器标签页更清晰
fs.writeFileSync(
  path.join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a2338"/><stop offset="1" stop-color="#0d1220"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="110" fill="url(#b)"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#b99a48" stroke-width="7" opacity=".55"/>
  <circle cx="256" cy="256" r="176" fill="none" stroke="#b99a48" stroke-width="3" opacity=".3"/>
  <g fill="#e8c56a">
    <circle cx="256" cy="256" r="26"/><circle cx="190" cy="190" r="26"/><circle cx="322" cy="322" r="26"/>
  </g>
  <g fill="#b99a48">
    <circle cx="322" cy="190" r="26"/><circle cx="190" cy="322" r="26"/>
  </g>
</svg>`
);
console.log('✓ public/favicon.svg');
