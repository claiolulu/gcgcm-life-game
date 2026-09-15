import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { getPlayerSession } from './session.js';
import { track } from './track.js';

/**
 * 通知推送（参与者端）。
 *
 * 能不能用取决于手机和浏览器：
 *   安卓 + Chrome        直接在网页里开，关掉浏览器也收得到
 *   iPhone（任何浏览器） 必须先「添加到主屏幕」、从主屏幕图标打开（iOS 16.4+）
 * 权限必须由用户自己点按钮触发，浏览器不允许网页自动弹权限询问。
 */
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return ios ? 'ios-needs-home' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

function base64UrlToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  // SW 由 main.jsx 注册；开发模式下可能根本没有，别让它一直挂着
  return withTimeout(navigator.serviceWorker.ready, 8000);
}

export async function enablePush() {
  const token = getPlayerSession()?.token;
  if (!token) throw new Error('先领取护照，再开启通知');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied'
      ? '通知被拒绝了。要到浏览器的网站设置里，把这个网站的「通知」改成允许'
      : '没有允许通知');
  }
  const { publicKey } = await api('/api/push/key');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  try {
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
    }
  } catch (err) {
    // 旧订阅用的是别的公钥时会冲突：退掉重订一次
    if (sub) await sub.unsubscribe().catch(() => {});
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  }
  await api('/api/push/subscribe', { method: 'POST', token, body: sub.toJSON() });
}

export async function disablePush() {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const token = getPlayerSession()?.token;
  if (token) await api('/api/push/unsubscribe', { method: 'POST', token, body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * 护照顶部 🔔 用的开关。state：loading / on / off / denied / unsupported / ios-needs-home
 * notify(text, kind) 用来弹提示（传 useToast 返回的函数）。
 */
export function usePush(notify) {
  const [state, setState] = useState('loading');

  const refresh = useCallback(async () => {
    const support = pushSupport();
    if (support !== 'ok') { setState(support); return; }
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
      // 已订阅的设备每次打开顺手再报一次：换了人登录、服务端数据恢复过，都能对上
      const token = getPlayerSession()?.token;
      if (sub && token) api('/api/push/subscribe', { method: 'POST', token, body: sub.toJSON() }).catch(() => {});
    } catch {
      setState('off');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async () => {
    const support = pushSupport();
    if (support === 'ios-needs-home') {
      notify?.('iPhone 要先把这个网页「添加到主屏幕」，再从主屏幕的图标打开，才能开启通知', 'warn');
      return;
    }
    if (support === 'unsupported') { notify?.('这个浏览器不支持通知推送，换 Chrome 试试', 'warn'); return; }
    if (support === 'denied') {
      notify?.('通知被浏览器关掉了：到浏览器的网站设置里，把这个网站的「通知」改成允许', 'warn');
      return;
    }
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
        track('push_off');
        notify?.('已关闭通知', 'ok');
      } else {
        setState('loading');
        await enablePush();
        setState('on');
        track('push_on');
        notify?.('已开启通知，活动有新消息会提醒你', 'ok');
      }
    } catch (err) {
      await refresh();
      notify?.(err.message === 'timeout' ? '开启通知超时了，刷新页面再试一次' : (err.message || '开启通知失败'), 'err');
    }
  }, [state, notify, refresh]);

  return { state, toggle };
}
