import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------- Toast ------------------------------- */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((message, type = 'ok', ms = 3200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message, type }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), ms);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {items.length > 0 &&
        createPortal(
          <div className="toast-wrap">
            {items.map((i) => (
              <div key={i.id} className={`toast toast--${i.type}`}>{i.message}</div>
            ))}
          </div>,
          document.body
        )}
    </ToastCtx.Provider>
  );
}

/* ------------------------------ 确认弹层 ------------------------------ */

const ConfirmCtx = createContext(async () => false);

/**
 * 应用内确认框，替代 window.confirm / prompt。
 *
 * 为什么不用原生对话框：微信内置浏览器、部分 WebView 和加到主屏的 PWA 会
 * 抑制原生 confirm，此时它直接返回 false —— 调用方就静默 return 了，
 * 表现为「按钮点了完全没反应」，而且没有任何报错可查。
 * 这个活动全程在微信里打开，必须避开这个坑。
 *
 * 用法：const ask = useConfirm();  if (!(await ask({ title: '…' }))) return;
 * 需要打字确认时传 requireText，返回值就是「打对了才为 true」。
 */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const [typed, setTyped] = useState('');

  const ask = useCallback((opts) => {
    return new Promise((resolve) => {
      setTyped('');
      setReq({ ...(typeof opts === 'string' ? { title: opts } : opts), resolve });
    });
  }, []);

  const close = (value) => {
    req?.resolve(value);
    setReq(null);
    setTyped('');
  };

  const okDisabled = !!req?.requireText && typed.trim() !== req.requireText;

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Sheet open={!!req} onClose={() => close(false)} title={req?.title}>
        <div className="stack">
          {req?.body && (
            <div className="small muted" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {req.body}
            </div>
          )}

          {req?.requireText && (
            <div className="field">
              <label className="label">输入 {req.requireText} 确认</label>
              <input
                className="input input--code"
                value={typed}
                onChange={(e) => setTyped(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          )}

          {req?.choices ? (
            <div className="stack-sm">
              {req.choices.map((c) => (
                <button
                  key={String(c.value)}
                  className={`btn btn--full ${c.danger ? 'btn--danger' : c.primary ? 'btn--primary' : ''}`}
                  onClick={() => close(c.value)}
                >
                  {c.label}
                </button>
              ))}
              <button className="btn btn--ghost btn--full" onClick={() => close(false)}>
                {req.cancelText || '取消'}
              </button>
            </div>
          ) : (
            <>
              <button
                className={`btn btn--full ${req?.danger ? 'btn--danger' : 'btn--primary'}`}
                disabled={okDisabled}
                onClick={() => close(true)}
              >
                {req?.confirmText || '确定'}
              </button>
              <button className="btn btn--ghost btn--full" onClick={() => close(false)}>
                {req?.cancelText || '取消'}
              </button>
            </>
          )}
        </div>
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

/* ------------------------------ 网络状态条 ------------------------------ */

function ago(ts) {
  if (!ts) return '从未';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  return `${Math.floor(s / 3600)} 小时前`;
}

/**
 * 永远诚实地告诉用户数据有多新。
 * 宁可让人知道数据旧了，也不能让人以为是实时的然后当场吵起来。
 */
export function NetBar({ online, connected, syncing, pending = 0, lastSyncedAt }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (pending > 0) {
    return (
      <div className="netbar netbar--pending">
        <span className="pulse" />
        {online ? `正在上传 ${pending} 条记分…` : `已离线记录 ${pending} 条，联网后自动上传`}
      </div>
    );
  }
  if (!online) {
    return (
      <div className="netbar netbar--offline">
        📴 离线模式 · 数据停留在 {ago(lastSyncedAt)}，记分照常可用
      </div>
    );
  }
  if (syncing) {
    return <div className="netbar netbar--syncing"><span className="pulse" />同步中…</div>;
  }
  if (connected) {
    return <div className="netbar netbar--live"><span className="pulse" />实时同步中</div>;
  }
  return <div className="netbar netbar--offline">⚠️ 实时通道断开 · 数据更新于 {ago(lastSyncedAt)}</div>;
}

export { ago };

/* ------------------------------- 底部弹层 ------------------------------- */

export function Sheet({ open, onClose, children, title }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  // 必须 portal 到 body：页面容器上的入场动画会让它成为 fixed 定位的包含块，
  // 弹层就会被关在页面里、被底部导航盖住。
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        {title && <h2 style={{ marginBottom: 12 }}>{title}</h2>}
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------- 关卡格 ------------------------------- */

export function StampGrid({ stations, done, onTap }) {
  return (
    <div className="stamp-grid">
      {stations.map((s) => {
        const hit = done?.[s.id];
        return (
          <button
            key={s.id}
            className={`stamp ${hit ? 'stamp--done' : ''}`}
            onClick={() => onTap?.(s, hit)}
            type="button"
          >
            <span className="stamp__icon">{s.icon}</span>
            <span className="stamp__name">{s.name}</span>
            {hit && (
              <span className="stamp__pts" style={hit.pending ? { background: '#8b8f9e' } : undefined}>
                {hit.points}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- 加载态 ------------------------------- */

export function Loading({ label = '加载中…' }) {
  return (
    <div className="page center" style={{ paddingTop: '30vh' }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🎲</div>
      <div className="muted">{label}</div>
    </div>
  );
}

export function Empty({ icon = '🗒', title, hint, children }) {
  return (
    <div className="card center" style={{ padding: '30px 18px' }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>
      <div className="bold" style={{ marginBottom: 6 }}>{title}</div>
      {hint && <div className="small muted" style={{ marginBottom: 14 }}>{hint}</div>}
      {children}
    </div>
  );
}

/* ------------------------------ 身份卡徽标 ------------------------------ */

export function IdentityChip({ identity, identities, teamColor, teamSymbol, colors }) {
  if (!identity) return <span className="chip">身份未抽取</span>;
  const meta = identities?.[identity];
  const color = colors?.find((c) => c.key === teamColor);
  return (
    <span className="chip" style={{ borderColor: meta?.color, color: meta?.color }}>
      {meta?.icon} {meta?.name}
      {teamSymbol && color && (
        <span style={{ color: color.hex, fontWeight: 800 }}>{teamSymbol}</span>
      )}
    </span>
  );
}

/* --------------------------- 数字滚动（分数） --------------------------- */

export function Score({ value, size = 44 }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (display === value) return;
    const from = display;
    const diff = value - from;
    const start = performance.now();
    const dur = 480;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + diff * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      className="mono"
      style={{ fontSize: size, fontWeight: 800, color: 'var(--gold)', lineHeight: 1, letterSpacing: '-0.02em' }}
    >
      {display}
    </span>
  );
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function useLocalState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch { return initial; }
  });
  const set = useCallback((next) => {
    setV((prev) => {
      const val = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
      return val;
    });
  }, [key]);
  return [v, set];
}
