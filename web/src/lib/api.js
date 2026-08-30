/** 带超时的 fetch —— 弱网下最怕的是请求挂着不返回，界面就一直转圈 */

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.offline = status === 0;
  }
}

export async function api(path, { method = 'GET', body, token, timeout = 8000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

  try {
    const res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!res.ok) {
      throw new ApiError(data?.error || `请求失败 (${res.status})`, res.status, data);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // 网络不通 / 超时 / 被中止：统一当作离线，交给上层走缓存或进队列
    throw new ApiError(
      err.name === 'AbortError' ? '网络超时' : '网络连接不上',
      0,
      null
    );
  } finally {
    clearTimeout(timer);
  }
}

export const uid = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
