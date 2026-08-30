/**
 * 会话令牌存 localStorage（同步读取，首屏不闪）。
 * 选手令牌决定了"刷新之后还是同一本护照、同一个二维码"。
 */

const PLAYER_KEY = 'mlg.player';
const STAFF_KEY = 'mlg.staff';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  return value;
}

export const getPlayerSession = () => read(PLAYER_KEY);
export const setPlayerSession = (s) => write(PLAYER_KEY, s);
export const clearPlayerSession = () => write(PLAYER_KEY, null);

export const getStaffSession = () => read(STAFF_KEY);
export const setStaffSession = (s) => write(STAFF_KEY, s);
export const clearStaffSession = () => write(STAFF_KEY, null);
