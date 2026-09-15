/**
 * 「添加到手机桌面」。
 *
 * iPhone 没有任何网页能调用的安装接口，只能教用户点分享按钮 →「添加到主屏幕」；
 * 而且 iPhone 上**只有从桌面图标打开**才能收通知。
 * 安卓 Chrome 会发 beforeinstallprompt：先截下来，用户点我们的按钮时再弹系统安装框。
 * 这个事件在页面加载早期就会触发，所以监听放在模块顶层（bookVals 静态引入了本文件）。
 */
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return !!(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator?.standalone === true);
}

/** 'installed' 已经从桌面图标打开 | 'ios' | 'android' | 'other'（电脑等，不教） */
export function installPlatform() {
  if (typeof window === 'undefined') return 'other';
  if (isStandalone()) return 'installed';
  const ua = navigator.userAgent || '';
  // 先认安卓：iPad 的判断靠「自称 Mac 又有触点」，模拟器、部分安卓平板也会同时满足后半句
  if (/Android/i.test(ua)) return 'android';
  // iPadOS 13+ 的 Safari 自称 Mac，靠触点数认出来
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

export const canPromptInstall = () => !!deferred;

/** 弹安卓的系统安装框。返回 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred;
  deferred = null;
  emit();
  e.prompt();
  try {
    const { outcome } = await e.userChoice;
    return outcome;
  } catch {
    return 'dismissed';
  }
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const INSTALL_HOWTO = {
  ios: '用 Safari 打开这个网页，点底部的「分享」按钮（方框加向上箭头），往下滑找到「添加到主屏幕」，再点右上角「添加」。以后从桌面图标打开，护照会像 App 一样全屏，也只有这样才能收到活动通知。',
  android: '用 Chrome 打开这个网页，点右上角「⋮」菜单，选「添加到主屏幕」或「安装应用」，再点「安装」。以后从桌面图标打开，护照会像 App 一样全屏。',
};
