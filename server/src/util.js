import crypto from 'node:crypto';

/**
 * 选手凭据。
 *
 * ID 是顺序编号（01、02…），公开：二维码里就是它，工作人员扫的、喊的、手输的都是它。
 * PIN 是 4 位数字，私密：只用于换设备时找回护照。
 *
 * 两者都是纯数字 —— 手机上直接弹数字键盘，没有 0/O、1/I/L 认错的问题，
 * 嘈杂场地里也能靠喊的传递，二维码点阵还更稀疏、更好扫。
 */

/** 顺序编号，至少两位，超过 99 人自然变三位 */
export function formatPlayerId(n) {
  return String(n).padStart(2, '0');
}

/** 只留数字：兼容扫到的 MLG:07、/j/07，以及人工输入的 "07"、"7"、"# 07" */
export function extractCode(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/(?:MLG:|\/J\/|\/P\/)\s*(\d{1,6})/);
  return (m ? m[1] : s).replace(/\D/g, '');
}

/** 编号归一：去掉前导零，让 "7"、"07"、"007" 都能找到同一个人 */
export function canonCode(raw) {
  const digits = extractCode(raw);
  return digits ? String(parseInt(digits, 10)) : '';
}

export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin ?? ''));
}

export function randomPin() {
  // 排除 0000/1234/1111 这类一眼假的，其余随机
  const banned = new Set(['0000', '1111', '2222', '3333', '4444', '5555',
    '6666', '7777', '8888', '9999', '1234', '4321', '1212', '6969']);
  for (let i = 0; i < 50; i++) {
    const pin = String(crypto.randomInt(10000)).padStart(4, '0');
    if (!banned.has(pin)) return pin;
  }
  return String(crypto.randomInt(1000, 10000));
}

export function uid() {
  return crypto.randomUUID();
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** 无状态签名令牌：base64url(payload).hmac —— 服务器重启后工作人员不用重新登录 */
export function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/** Fisher–Yates，加密级随机源 */
export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickWeighted(items) {
  const total = items.reduce((sum, it) => sum + (it.weight || 1), 0);
  if (total <= 0) return items[0];
  let roll = crypto.randomInt(total);
  for (const it of items) {
    roll -= it.weight || 1;
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function safeJSON(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
