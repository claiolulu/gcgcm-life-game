/* 通知推送的 Service Worker 部分。
 *
 * workbox 生成的那个 SW（离线缓存）通过 importScripts 把这个文件引进来 ——
 * 见 vite.config.js 的 workbox.importScripts。离线缓存那套一行都不用改。
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || '人生护照', {
    body: data.body || '',
    icon: '/passport-icon-192.png',
    badge: '/passport-icon-192.png',
    // 同一场活动的通知用同一个 tag：新的一条替换旧的，不会在通知栏里堆一串
    tag: data.tag || undefined,
    renotify: !!data.tag,
    lang: 'zh-CN',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 已经开着护照就切过去并打开那一页，没开着就新开一个
    for (const win of wins) {
      if ('focus' in win) {
        try { if ('navigate' in win) await win.navigate(url); } catch { /* 跨域或未受控，直接聚焦 */ }
        return win.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
