import { useEffect } from 'react';
import { passportTheme, themeVarsOf } from '../pages/book/bookVals.js';

/**
 * 参与者端整屏跟着「这本护照的配色」走（含本人在自定义里改过的）。
 *
 * 原来只有护照册内部和徽章页用了主题色：报名页、领护照页、确认弹窗、提示条，
 * 以及挂在 <body> 上的弹层（报名码分享面板、图库大图）拿不到护照册里的变量，
 * 于是永远是默认配色。现在由 App 的 PassportScreenTheme 在所有非同工路由上
 * 统一把变量挂到 <html>：
 *
 *   --ink / --gold / --text …  全站基础色换成纸色底、护照主色（.card / .btn / .sheet 都读它们）
 *   --pp-*                     护照册同一套变量，挂在 body 上的弹层直接读
 *
 * 挂在 <html> 而不是页面容器上：body 的 `color: var(--text)` 在 body 这一层就解析了，
 * 底栏和弹层也不在页面容器里（原来徽章页单独这么做，现在全局统一）。
 */
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) || 0);

/** 把一个 hex 往黑里压一点（k<1）。用来从纸色推出卡片和边框那几档 */
export function shadeHex(hex, k) {
  const ch = hexRgb(hex).map((c) => Math.max(0, Math.min(255, Math.round(c * k))));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function passportScreenVars(T) {
  const soft = (a) => `rgba(${hexRgb(T.text).join(',')},${a})`;
  const inkSoft = (a) => `rgba(${hexRgb(T.ink).join(',')},${a})`;
  return {
    ...themeVarsOf(T),
    '--ink': T.paper,
    '--ink-2': T.paper,
    '--ink-3': shadeHex(T.paper, 0.97),
    '--ink-4': shadeHex(T.paper, 0.92),
    '--line': inkSoft(0.22),
    '--line-soft': inkSoft(0.12),
    '--gold': T.ink,
    '--gold-dim': shadeHex(T.ink, 0.85),
    '--gold-glow': inkSoft(0.16),
    '--text': T.text,
    '--text-2': soft(0.68),
    '--text-3': soft(0.5),
    '--shadow': `0 8px 30px ${inkSoft(0.14)}`,
    '--shadow-sm': `0 2px 10px ${inkSoft(0.1)}`,
  };
}

/** enabled=false（同工端路由）时什么都不挂，离开时原样还回去 */
export function usePassportScreen(config, me, enabled = true) {
  const key = enabled ? JSON.stringify(passportScreenVars(passportTheme(config, me))) : '';
  useEffect(() => {
    if (!key) return undefined;
    const root = document.documentElement;
    const vars = JSON.parse(key);
    const prev = {};
    for (const [k, v] of Object.entries(vars)) {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    }
    // body::before 那两团冷光是给深色底画的，压在纸上是脏的（见 styles.css 的 paper-screen）
    root.classList.add('paper-screen', 'pp-themed');
    return () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);
      }
      root.classList.remove('paper-screen', 'pp-themed');
    };
  }, [key]);
}
