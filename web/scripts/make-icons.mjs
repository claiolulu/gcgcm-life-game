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
    rect(x, y, w, h, color, alpha = 1) {
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(size, Math.ceil(y + h)); py++) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(size, Math.ceil(x + w)); px++) {
          put(px, py, color, alpha);
        }
      }
    },
    roundedRect(x, y, w, h, r, color, alpha = 1) {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      this.rect(x + rr, y, w - rr * 2, h, color, alpha);
      this.rect(x, y + rr, w, h - rr * 2, color, alpha);
      this.disc(x + rr, y + rr, rr, color, alpha);
      this.disc(x + w - rr, y + rr, rr, color, alpha);
      this.disc(x + rr, y + h - rr, rr, color, alpha);
      this.disc(x + w - rr, y + h - rr, rr, color, alpha);
    },
    line(x1, y1, x2, y2, width, color, alpha = 1) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.4));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        this.disc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color, alpha);
      }
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

const PAPER = [239, 230, 213];
const COVER = [92, 26, 34];
const COVER_DARK = [57, 14, 22];
const GOLD = [230, 205, 145];
const GOLD_DIM = [179, 146, 77];

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
};

function bitmapText(c, text, cx, y, pixel, color, alpha = 1) {
  const gap = pixel;
  const glyphW = 5 * pixel;
  const total = text.length * glyphW + (text.length - 1) * gap;
  let x = cx - total / 2;
  for (const ch of text) {
    const rows = FONT[ch];
    if (rows) rows.forEach((row, ry) => [...row].forEach((on, rx) => {
      if (on === '1') c.rect(x + rx * pixel, y + ry * pixel, pixel, pixel, color, alpha);
    }));
    x += glyphW + gap;
  }
}

function drawIcon(size) {
  const c = canvas(size);
  const u = size / 512; // 以 512 为设计基准等比缩放

  c.fill(PAPER);

  // 一本略带厚度的酒红色护照，完整落在 maskable icon 的安全区域内。
  c.roundedRect(91 * u, 55 * u, 340 * u, 410 * u, 34 * u, COVER_DARK, 0.22);
  c.roundedRect(78 * u, 46 * u, 340 * u, 410 * u, 34 * u, COVER, 1);
  c.roundedRect(101 * u, 70 * u, 294 * u, 362 * u, 20 * u, GOLD_DIM, 0.9);
  c.roundedRect(108 * u, 77 * u, 280 * u, 348 * u, 16 * u, COVER, 1);

  // 书脊与压印线，缩到浏览器标签大小时仍能一眼看出是一本册子。
  c.rect(78 * u, 80 * u, 25 * u, 342 * u, COVER_DARK, 0.35);
  c.line(112 * u, 80 * u, 112 * u, 422 * u, 3 * u, GOLD_DIM, 0.65);

  bitmapText(c, 'GCGCM', 254 * u, 102 * u, 5 * u, GOLD_DIM, 0.9);
  bitmapText(c, 'PASSPORT', 254 * u, 151 * u, 6 * u, GOLD, 1);

  // 护照封面常见的地球压印：经纬线 + 中轴，避免使用具体国家标志。
  const cx = 254 * u;
  const cy = 292 * u;
  c.ring(cx, cy, 72 * u, 6 * u, GOLD, 1);
  c.line((254 - 69) * u, cy, (254 + 69) * u, cy, 4 * u, GOLD, 0.95);
  c.line(cx, (292 - 69) * u, cx, (292 + 69) * u, 4 * u, GOLD, 0.95);
  for (const off of [-35, 35]) {
    const half = Math.sqrt(72 * 72 - off * off);
    c.line((254 - half) * u, (292 + off) * u, (254 + half) * u, (292 + off) * u, 3 * u, GOLD_DIM, 0.9);
  }
  // 两条弧形经线用逐段线模拟，低分辨率也保持顺滑。
  for (const side of [-1, 1]) {
    let prev = null;
    for (let i = 0; i <= 36; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 36;
      const p = [cx + side * 34 * u * Math.cos(a), cy + 69 * u * Math.sin(a)];
      if (prev) c.line(prev[0], prev[1], p[0], p[1], 3 * u, GOLD_DIM, 0.9);
      prev = p;
    }
  }

  c.line(181 * u, 391 * u, 327 * u, 391 * u, 4 * u, GOLD_DIM, 0.75);

  return encodePNG(size, size, c.buf);
}

for (const size of [192, 512]) {
  const file = path.join(OUT, `passport-icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log('✓', path.relative(process.cwd(), file));
}

// apple-touch-icon 用 192 那张
fs.copyFileSync(path.join(OUT, 'passport-icon-192.png'), path.join(OUT, 'passport-apple-touch-icon.png'));
console.log('✓ public/passport-apple-touch-icon.png');

// favicon 用 SVG，浏览器标签页更清晰
fs.writeFileSync(
  path.join(OUT, 'passport-icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="#efe6d5"/>
  <rect x="91" y="55" width="340" height="410" rx="34" fill="#391016" opacity=".22"/>
  <rect x="78" y="46" width="340" height="410" rx="34" fill="#5c1a22"/>
  <rect x="101" y="70" width="294" height="362" rx="20" fill="none" stroke="#b3924d" stroke-width="7"/>
  <path d="M103 80v342M112 80v342" stroke="#b3924d" stroke-width="3" opacity=".7"/>
  <text x="254" y="134" text-anchor="middle" fill="#b3924d" font-family="Arial,sans-serif" font-size="29" font-weight="700" letter-spacing="5">GCGCM</text>
  <text x="254" y="195" text-anchor="middle" fill="#e6cd91" font-family="Arial,sans-serif" font-size="39" font-weight="700" letter-spacing="4">PASSPORT</text>
  <g fill="none" stroke="#e6cd91" stroke-width="6">
    <circle cx="254" cy="292" r="72"/><path d="M185 292h138M254 223v138M195 257h118M195 327h118M254 223c-45 34-45 104 0 138M254 223c45 34 45 104 0 138"/>
  </g>
  <path d="M181 391h146" stroke="#b3924d" stroke-width="4"/>
</svg>`
);
console.log('✓ public/passport-icon.svg');
