import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 一根自己画的滑杆，贴在可滚动区域的右边。
 *
 * 只负责「告诉你还能滑」和「滑到哪了」，不接受拖拽 —— 滚动仍然靠手指和滚轮。
 * 原生滚动条在手机上根本不显示（iOS、微信 WebView 都是滚动时才短暂出现），
 * macOS 上默认也是悬浮自动隐藏，而被封了高的区域不给个东西指着，
 * 没人知道下面还有内容。
 *
 * 内容没超出时整根隐藏：一根永远填满的滑杆等于没说。
 */
export function ScrollRail({ targetRef, deps, className = '', onOverflow }) {
  const [rail, setRail] = useState(null);   // null = 不用显示

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return undefined;

    const measure = () => {
      const { scrollHeight, clientHeight, scrollTop } = el;
      // 高度为 0 说明这会儿量不准（标签页在后台、父容器还没排版完），
      // 这时候算出来的比例是错的，宁可先不显示，等下一次再量
      if (!clientHeight) return;
      const over = scrollHeight - clientHeight;
      if (over <= 2) { setRail(null); onOverflow?.(false); return; }
      onOverflow?.(true);
      // 滑块长度按「看得见的比例」算，和真滚动条一个道理
      const ratio = clientHeight / scrollHeight;
      const size = Math.max(ratio * 100, 12);   // 百分比，太短了不好看
      setRail({
        size,
        // 剩下的轨道长度按已滚比例分配，滚到底时滑块正好贴底
        pos: (scrollTop / over) * (100 - size),
        end: scrollTop >= over - 2,
      });
    };

    measure();
    // 首帧常常还没排好版（尤其是刚从后台切回来），再补量一次
    const raf = requestAnimationFrame(measure);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // 区域本身高度固定，内容变高不会触发它的 resize，所以连内容一起观察
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [targetRef, deps, onOverflow]);

  return (
    <div
      className={`list-rail ${className} ${rail ? 'list-rail--on' : ''} ${rail?.end ? 'list-rail--end' : ''}`.trim()}
      aria-hidden="true"
    >
      {rail && <div className="list-rail__thumb" style={{ height: `${rail.size}%`, top: `${rail.pos}%` }} />}
    </div>
  );
}

/**
 * 一个「装不下就自己滚，右边带滑杆」的盒子。
 *
 * 把 ref、相对定位和滑杆打包好，调用方只管往里塞内容 —— 尤其是那些在
 * switch 里生成内容的地方（比如签证页的块），没法在分支里挂 hook。
 */
/**
 * 竖屏看签证页时，整页是 rotate(90deg) 的（签证页本来就是横版）。
 * 浏览器会把手势映射回元素自己的坐标系 —— 于是块内的「往下读」在屏幕上变成
 * 横向，手指竖着划一点反应都没有。文字本来就是侧躺的，谁也猜不到要横划。
 *
 * 这里在**旋转时**把手势整个接管过来，两个方向都当成滚动。
 *
 * 关键是那句 touch-action: none：不写的话，浏览器在 touchstart 时就自己决定
 * 这一下归它平移，然后发一个 pointercancel 把 pointermove 掐断 —— 处理器看着
 * 是挂上了，真手指下永远走不到。合成事件测不出这一层，因为它绕过了手势仲裁。
 *
 * 没旋转时完全不插手：原生滚动有惯性和回弹，自己实现只会更差。
 */
function useCrossAxisScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let rotated = false;
    let active = null;

    /** 这个块自己的「向下」，在屏幕上指向哪 —— 从累计变换里取 */
    const downVec = () => {
      let n = el;
      let m = new DOMMatrix();
      while (n && n !== document.body) {
        const tr = getComputedStyle(n).transform;
        if (tr && tr !== 'none') m = new DOMMatrix(tr).multiply(m);
        n = n.parentElement;
      }
      // 本地 (0,1) 经过变换后落在 (c, d)
      return { c: m.c, d: m.d };
    };

    const sync = () => {
      const r = el.getBoundingClientRect();
      // 布局的宽高和屏幕上的宽高对调了，就是转了 90°
      rotated = Math.abs(r.width - el.offsetHeight) < 3 && Math.abs(r.height - el.offsetWidth) < 3
        && el.offsetWidth !== el.offsetHeight;
      // 只有接管的时候才拦手势。没转就还给浏览器，保住惯性滚动
      el.style.touchAction = rotated ? 'none' : '';
    };

    // 转屏之后要重算。注意**不能只靠 ResizeObserver**：这个块的布局尺寸
    // 在两种朝向下完全一样（页面恒为 1.9:1，变的只是 transform），RO 永远
    // 不会触发。而 resize 事件到达时 React 往往还没把新的 transform 渲上去，
    // 所以再补一帧和一次延时。
    const syncSoon = () => { sync(); requestAnimationFrame(sync); setTimeout(sync, 250); };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', syncSoon);
    window.addEventListener('orientationchange', syncSoon);

    const down = (e) => {
      if (e.pointerType === 'mouse') return;          // 鼠标有滚轮，不抢
      sync();                                          // 以按下这一刻为准，别信缓存
      if (!rotated) return;
      if (el.scrollHeight <= el.clientHeight + 2) return;
      const v = downVec();
      active = { x: e.clientX, y: e.clientY, top: el.scrollTop, moved: false, v };
      try { el.setPointerCapture(e.pointerId); } catch { /* 捕获不到就靠冒泡 */ }
    };

    const move = (e) => {
      if (!active) return;
      const dx = e.clientX - active.x;
      const dy = e.clientY - active.y;
      if (!active.moved && Math.hypot(dx, dy) < 4) return;   // 4px 内当抖动，别吃掉点击
      active.moved = true;
      e.preventDefault();
      // 沿文字方向划（浏览器原来支持的那条），和屏幕竖向划（竖着拿手机时的
      // 本能动作），哪个位移大听哪个。没转的话两者相等，公式自然退化
      const along = -(dx * active.v.c + dy * active.v.d);
      const cross = -dy;
      const delta = Math.abs(along) >= Math.abs(cross) ? along : cross;
      el.scrollTop = active.top + delta;
    };

    const up = (e) => {
      if (active?.moved) {
        // 真滑动过就吞掉随后那次 click，否则翻页逻辑会把这一下当成点击
        const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        el.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 350);
      }
      try { el.releasePointerCapture(e.pointerId); } catch { /* 已自动释放 */ }
      active = null;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.style.touchAction = '';
      window.removeEventListener('resize', syncSoon);
      window.removeEventListener('orientationchange', syncSoon);
    };
  }, [ref]);
}

export default function ScrollBox({ children, style, className = '', railClassName = '', deps }) {
  const ref = useRef(null);
  useCrossAxisScroll(ref);
  // 只有真的装不下时才给滑杆让出那几个像素。
  //
  // 全局是 border-box，常驻的 padding-right 会把**每一个**文字块都收窄，
  // 连根本不需要滚的也跟着重新折行 —— 那等于悄悄改了所有现成护照页的排版。
  const [over, setOver] = useState(false);
  const onOverflow = useCallback((v) => setOver((prev) => (prev === v ? prev : v)), []);
  return (
    <div className={`scroll-box ${className}`.trim()} style={{ position: 'relative', ...style }}>
      <div ref={ref} className={`scroll-box__body${over ? ' scroll-box__body--over' : ''}`}>
        {children}
      </div>
      <ScrollRail targetRef={ref} className={railClassName} deps={deps} onOverflow={onOverflow} />
    </div>
  );
}
