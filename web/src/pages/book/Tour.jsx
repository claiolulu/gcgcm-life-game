import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * 新手引导：把真实界面元素高亮出来，旁边浮一个说明框，点一下换下一条。
 *
 * 为什么不用一段静态说明文字：选手拿到手机就在现场了，读完文字还是不知道
 * 哪个按钮是哪个。直接把目标圈出来指给他看，一条一条走完最省事。
 *
 * 目标元素靠 data-tour 属性定位（锚点打在护照册的页眉按钮上）。
 * 某一步的目标当前不在屏幕上（比如那一页还没翻到），会先跳到对应页再高亮；
 * 实在找不到就跳过这一步，不会卡住。
 */

const PAD = 6;      // 高亮框比元素本身外扩多少
const GAP = 12;     // 说明框与高亮框的间距

export default function Tour({ open, steps, onClose, onGoPage }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const step = open ? steps[i] : null;

  // 换步时先跳到该步需要的页面
  useEffect(() => {
    if (!step) return;
    if (step.page != null) onGoPage?.(step.page);
  }, [step, onGoPage]);

  // 目标可能因翻页/旋转而移动，测量放在 layout 阶段并跟随窗口变化
  useLayoutEffect(() => {
    if (!step) { setRect(null); return; }
    let raf = 0;
    let tries = 0;

    const measure = () => {
      const el = step.selector ? document.querySelector(step.selector) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
          return;
        }
      }
      // 该步没有目标（纯说明），或者目标还没渲染出来
      if (!step.selector) { setRect(null); return; }
      if (tries++ < 30) raf = requestAnimationFrame(measure);
      else setRect(null);
    };

    raf = requestAnimationFrame(measure);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [step]);

  const next = useCallback(() => {
    if (i + 1 >= steps.length) { setI(0); onClose?.(); }
    else setI(i + 1);
  }, [i, steps.length, onClose]);

  const skip = useCallback(() => { setI(0); onClose?.(); }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, skip]);

  if (!open || !step) return null;

  // 说明框放在高亮框的下方；下方放不下就翻到上方
  const vh = window.innerHeight;
  const below = rect ? rect.y + rect.h + GAP : 0;
  const putAbove = rect ? below > vh * 0.62 : false;

  const cardStyle = rect
    ? putAbove
      ? { bottom: `${vh - rect.y + GAP}px`, left: 16, right: 16 }
      : { top: `${below}px`, left: 16, right: 16 }
    : { top: '50%', left: 16, right: 16, transform: 'translateY(-50%)' };

  return (
    <div
      onClick={next}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, cursor: 'pointer',
        fontFamily: "'Noto Serif SC','EB Garamond',serif",
        animation: 'fadeIn .18s ease both',
      }}
    >
      {/* 高亮：用一圈超大的投影把周围压暗，中间自然透出来 */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            left: rect.x - PAD, top: rect.y - PAD,
            width: rect.w + PAD * 2, height: rect.h + PAD * 2,
            borderRadius: 4,
            boxShadow: '0 0 0 9999px rgba(20,17,16,.78), 0 0 0 2px #e6cd91',
            pointerEvents: 'none',
            transition: 'left .22s ease, top .22s ease, width .22s ease, height .22s ease',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,17,16,.78)', pointerEvents: 'none' }} />
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', ...cardStyle,
          maxWidth: 420, margin: '0 auto',
          background: '#f3ede0', color: '#2a2320',
          border: '1px solid #b9913f', borderRadius: 2,
          padding: '16px 18px 14px',
          boxShadow: '0 16px 44px rgba(0,0,0,.5)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 10, marginBottom: 8,
        }}>
          <div style={{
            fontFamily: "'EB Garamond',serif", fontSize: 9.5, letterSpacing: '.2em',
            color: 'rgba(92,26,34,.6)',
          }}>
            {step.eyebrow}
          </div>
          <div style={{
            fontFamily: "'Courier Prime',monospace", fontSize: 10,
            color: 'rgba(42,35,32,.45)', flex: 'none',
          }}>
            {i + 1} / {steps.length}
          </div>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.85, color: 'rgba(42,35,32,.8)' }}>{step.body}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button
            onClick={next}
            style={{
              flex: 1, padding: '11px', cursor: 'pointer',
              background: '#5c1a22', border: '1px solid rgba(198,164,95,.6)', borderRadius: 2,
              color: '#e6cd91', fontFamily: "'EB Garamond',serif",
              fontSize: 11.5, letterSpacing: '.2em', textIndent: '.2em',
            }}
          >
            {i + 1 >= steps.length ? 'DONE 知道了' : 'NEXT 下一个'}
          </button>
          {i + 1 < steps.length && (
            <button
              onClick={skip}
              style={{
                padding: '11px 12px', cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(92,26,34,.3)', borderRadius: 2,
                color: 'rgba(92,26,34,.7)', fontSize: 11.5,
              }}
            >
              跳过
            </button>
          )}
        </div>

        {/* 进度点 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12 }}>
          {steps.map((_, k) => (
            <span
              key={k}
              style={{
                width: k === i ? 14 : 5, height: 5, borderRadius: 999,
                background: k === i ? '#5c1a22' : 'rgba(92,26,34,.25)',
                transition: 'width .2s ease',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
