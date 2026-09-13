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
export default function ScrollBox({ children, style, className = '', railClassName = '', deps }) {
  const ref = useRef(null);
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
