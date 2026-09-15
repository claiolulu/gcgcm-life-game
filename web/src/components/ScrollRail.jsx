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
 * 用的是 touch 事件而不是 pointer 事件，这一点是踩出来的：pointer 那条路要求
 * `touch-action: none` 在 touchstart **之前**就已经挂在元素上，否则浏览器在
 * touchstart 当场就把这一下判给自己平移，随后发 pointercancel 把 pointermove
 * 掐断。而首屏 sync() 有可能赶在旋转 transform 渲上去之前跑（此时判定为没转，
 * 不挂 touch-action），偏偏这个块的布局尺寸两种朝向下完全一样，ResizeObserver
 * 永远不触发，于是一直纠不回来 —— 在 pointerdown 里补 sync() 也来不及，仲裁
 * 早于它。非被动 touchmove 里 preventDefault() 不吃这一套：不管 touch-action
 * 有没有及时挂上，都能把浏览器的平移取消掉。touch-action 仍然照设，属于双保险。
 *
 * 没旋转时完全不插手：原生滚动有惯性和回弹，自己实现只会更差。旋转时原生的被
 * 我们关掉了，所以补一段简单的惯性 —— 否则手指一松就死住，很别扭。
 */
function useCrossAxisScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let rotated = false;
    let g = null;     // 当前手势
    let glide = 0;    // 惯性动画

    /**
     * 这个块自己的「向下」在屏幕上指向哪，外加整体缩放了多少 —— 从累计变换里取。
     * 返回单位方向和缩放系数：局部 1px 在屏幕上占 s px。
     */
    const downVec = () => {
      let n = el;
      let m = new DOMMatrix();
      while (n && n !== document.body) {
        const tr = getComputedStyle(n).transform;
        if (tr && tr !== 'none') m = new DOMMatrix(tr).multiply(m);
        n = n.parentElement;
      }
      // 本地 (0,1) 经过变换后落在 (c, d)
      const s = Math.hypot(m.c, m.d) || 1;
      return { c: m.c / s, d: m.d / s, s };
    };

    const sync = () => {
      // 用变换矩阵判，**不要比宽高**：护照整册可能被整体缩放以适配屏幕，
      // 那时布局宽高和屏幕宽高对不上，比绝对差会把旋转判成没旋转。
      // 局部的「向下」在屏幕上主要指向横向 —— 那就是转了 90°。
      const v = downVec();
      rotated = Math.abs(v.c) > Math.abs(v.d);
      // 只有接管的时候才拦手势。没转就还给浏览器，保住惯性滚动
      el.style.touchAction = rotated ? 'none' : '';
    };

    // 转屏之后要重算。注意**不能只靠 ResizeObserver**：这个块的布局尺寸
    // 在两种朝向下完全一样（页面恒为 1.9:1，变的只是 transform），RO 永远
    // 不会触发。而 resize 事件到达时 React 往往还没把新的 transform 渲上去，
    // 所以再补一帧和一次延时。
    // rAF 那一发在后台标签页里**根本不触发**，所以再挂一个 setTimeout 兜底；
    // 首屏也走同一条路 —— transform 可能比 effect 晚落定
    const syncSoon = () => { sync(); requestAnimationFrame(sync); setTimeout(sync, 250); };
    syncSoon();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', syncSoon);
    window.addEventListener('orientationchange', syncSoon);

    const start = (e) => {
      cancelAnimationFrame(glide);
      g = null;
      sync();                                     // 以按下这一刻为准，别信缓存
      if (!rotated) return;
      if (el.scrollHeight <= el.clientHeight + 2) return;
      if (e.touches.length !== 1) return;         // 双指留给缩放
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, top: el.scrollTop, moved: false,
            v: downVec(), ts: e.timeStamp, last: el.scrollTop, vel: 0 };
    };

    const move = (e) => {
      if (!g) return;
      if (e.touches.length !== 1) { g = null; return; }
      // 第一下就得拦。等过了抖动阈值再拦就晚了 —— 浏览器可能已经开始平移
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 4) return;   // 4px 内当抖动，别吃掉点击
      g.moved = true;
      // 沿文字方向划（浏览器原来支持的那条），和屏幕竖向划（竖着拿手机时的
      // 本能动作），哪个位移大听哪个。没转的话两者相等，公式自然退化
      // 除以缩放：手指走的是屏幕像素，滚动要的是内容像素，缩放过就不是 1:1
      const along = -(dx * g.v.c + dy * g.v.d) / g.v.s;
      const cross = -dy / g.v.s;
      const delta = Math.abs(along) >= Math.abs(cross) ? along : cross;
      const max = el.scrollHeight - el.clientHeight;
      const next = Math.max(0, Math.min(max, g.top + delta));
      const dt = e.timeStamp - g.ts;
      if (dt > 0) g.vel = (next - g.last) / dt;         // px/ms，给惯性用
      g.ts = e.timeStamp;
      g.last = next;
      el.scrollTop = next;
    };

    const end = () => {
      if (!g) return;
      const { moved, vel } = g;
      g = null;
      if (!moved) return;
      // 真滑动过就吞掉随后那次 click，否则翻页逻辑会把这一下当成点击
      const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      el.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 350);
      // 甩一下要接着滑一段。原生惯性被 preventDefault 关掉了，得自己补
      let v = vel;
      if (Math.abs(v) < 0.05) return;
      const max = el.scrollHeight - el.clientHeight;
      const step = () => {
        v *= 0.94;
        if (Math.abs(v) < 0.02) return;
        const next = Math.max(0, Math.min(max, el.scrollTop + v * 16));
        if (next === el.scrollTop) return;              // 到头了就停，不做回弹
        el.scrollTop = next;
        glide = requestAnimationFrame(step);
      };
      glide = requestAnimationFrame(step);
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      cancelAnimationFrame(glide);
      ro.disconnect();
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
      el.style.touchAction = '';
      window.removeEventListener('resize', syncSoon);
      window.removeEventListener('orientationchange', syncSoon);
    };
  }, [ref]);
}

/**
 * interactive = false 时整块不接手势：画布编辑器里没在改字的时候，手指按在块上
 * 是要拖动这个块的。不这么做的话，装不下的文字块自己是个滚动区，手指一按浏览器
 * 就开始滚它、顺手发 pointercancel 把拖动掐断 —— 用户看到的是「点中了就在滑，
 * 框挪不动」。进入改字模式后再打开，长文字照样能滚着看。
 */
export default function ScrollBox({ children, style, className = '', railClassName = '', deps, interactive = true }) {
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
      {/*
        签证页的块层整层是 pointerEvents: 'none'（见 VisaBlocks —— 否则一张铺满
        页面的背景图会把翻页吃掉），所以这个盒子默认**不是命中目标**：手指落下
        去，目标是上面那层翻页层，我们挂在这里的手势监听一次都不会被调用，浏览器
        自己的原生滚动也同样滚不动。`pointer-events` 是可继承属性，后代能改回
        `auto` 把命中要回来 —— 但只在真的装不下时要，否则这么大一块地方会把翻页
        的点击吞掉。装得下的块仍然整块穿透。
      */}
      <div ref={ref} className={`scroll-box__body${over ? ' scroll-box__body--over' : ''}`}
        style={{ pointerEvents: over && interactive ? 'auto' : 'none' }}>
        {children}
      </div>
      <ScrollRail targetRef={ref} className={railClassName} deps={deps} onOverflow={onOverflow} />
    </div>
  );
}
