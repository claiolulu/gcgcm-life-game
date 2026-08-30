/**
 * 极简 IndexedDB 封装（无依赖）。
 * 两个 store：kv 放缓存快照，outbox 放还没同步上去的记分操作。
 * 隐私模式下 IndexedDB 可能不可用，自动降级到 localStorage —— 宁可退化也不能白屏。
 */

const DB_NAME = 'mlg';
const VERSION = 1;

let dbPromise = null;
let broken = false;

function open() {
  if (broken) return Promise.reject(new Error('idb unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (err) {
      broken = true;
      return reject(err);
    }

    // indexedDB.open 可能永远不回调（有未完成的 deleteDatabase、隐私模式、
    // 存储被浏览器锁住等）。没有这个超时，整个 app 会永远卡在启动画面。
    // 超时后标记为不可用，全部读写自动降级到 localStorage。
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      broken = true;
      console.warn('[idb] 打开超时，降级到 localStorage');
      reject(new Error('idb open timeout'));
    }, 2500);

    const done = (fn) => (...args) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(...args);
    };

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'opId' });
      }
    };
    req.onsuccess = done(() => resolve(req.result));
    req.onerror = done(() => { broken = true; reject(req.error); });
    req.onblocked = done(() => { broken = true; reject(new Error('idb blocked')); });
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn2) => (...args) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn2(...args);
        };
        // 事务也可能悬着不回调，一样要有兜底
        const timer = setTimeout(
          finish(() => reject(new Error('idb tx timeout'))),
          2500
        );

        let t, s;
        try {
          t = db.transaction(store, mode);
          s = t.objectStore(store);
        } catch (err) {
          clearTimeout(timer);
          return reject(err);
        }
        let out;
        try { out = fn(s); } catch (err) { clearTimeout(timer); return reject(err); }
        t.oncomplete = finish(() => resolve(out?.result !== undefined ? out.result : out));
        t.onerror = finish(() => reject(t.error));
        t.onabort = finish(() => reject(t.error));
      })
  );
}

/* ------------------------- localStorage 降级 ------------------------- */

const lsKey = (store, key) => `mlg:${store}:${key}`;

function lsGet(store, key) {
  try { return JSON.parse(localStorage.getItem(lsKey(store, key)) ?? 'null'); }
  catch { return null; }
}
function lsSet(store, key, val) {
  try { localStorage.setItem(lsKey(store, key), JSON.stringify(val)); } catch {}
}
function lsDel(store, key) {
  try { localStorage.removeItem(lsKey(store, key)); } catch {}
}
function lsAll(store) {
  const out = [];
  try {
    const prefix = `mlg:${store}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        const v = JSON.parse(localStorage.getItem(k) ?? 'null');
        if (v) out.push(v);
      }
    }
  } catch {}
  return out;
}

/* ------------------------------- kv ------------------------------- */

export async function kvGet(key, fallback = null) {
  try {
    const v = await tx('kv', 'readonly', (s) => s.get(key));
    return v ?? fallback;
  } catch {
    return lsGet('kv', key) ?? fallback;
  }
}

export async function kvSet(key, value) {
  try {
    await tx('kv', 'readwrite', (s) => s.put(value, key));
  } catch {
    lsSet('kv', key, value);
  }
  return value;
}

export async function kvDel(key) {
  try { await tx('kv', 'readwrite', (s) => s.delete(key)); }
  catch { lsDel('kv', key); }
}

/* ------------------------------ outbox ------------------------------ */
/* 还没成功推到服务器的记分操作。断网时它就是唯一的真相来源。 */

export async function outboxAdd(op) {
  try { await tx('outbox', 'readwrite', (s) => s.put(op)); }
  catch { lsSet('outbox', op.opId, op); }
  return op;
}

export async function outboxAll() {
  try {
    const list = await tx('outbox', 'readonly', (s) => s.getAll());
    return (list || []).sort((a, b) => (a.clientTs || 0) - (b.clientTs || 0));
  } catch {
    return lsAll('outbox').sort((a, b) => (a.clientTs || 0) - (b.clientTs || 0));
  }
}

export async function outboxRemove(opId) {
  try { await tx('outbox', 'readwrite', (s) => s.delete(opId)); }
  catch { lsDel('outbox', opId); }
}

export async function outboxClear() {
  try { await tx('outbox', 'readwrite', (s) => s.clear()); }
  catch { for (const o of lsAll('outbox')) lsDel('outbox', o.opId); }
}
