import React from 'react';

/**
 * 签证页上那层自由画布。
 *
 * 同工在编辑器里摆的东西 —— 一段字、一张图，都可以挂链接 —— 就渲染在这里。
 * 编辑器和真页面用的是同一个组件（编辑器多传一个 editing），所以「编辑器里
 * 看到的」和「别人手机上看到的」不会长着长着就分家了。
 *
 * 坐标全是百分比，字号是页高的百分比（cqh）。所以同一份画布在横屏、竖屏、
 * 大屏小屏上都是同一个样子 —— 关键就是这一层自己开了 container-type: size，
 * cqh 才有得可依。
 */

const FONTS = {
  serif: "'EB Garamond','Noto Serif SC',serif",
  mono: "'Courier Prime',monospace",
  sans: "'Noto Serif SC',system-ui,sans-serif",
};

/** 一个元素的内容，不含定位 —— 定位在外层，编辑器要在同一个盒子上挂拖拽 */
export function CanvasItem({ el }) {
  if (el.type === 'image') {
    // 没设图的框在真页面上什么都不画 —— 编辑器另外画一个占位框，
    // 但那是编辑器的事，别人手机上不该看到一个空格子。
    //
    // 注意别在这个对象里写 `background: undefined`：React 对 undefined 的
    // 处理是把那条属性设成空串，而 background 是简写，一设空就把上面刚写好的
    // backgroundImage 一起清掉 —— 图会整个不见，而且不报任何错。
    if (!el.src) return null;
    return (
      <div
        style={{
          width: '100%', height: '100%',
          backgroundImage: `url("${el.src}")`,
          backgroundSize: el.fit || 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          borderRadius: `${el.radius || 0}%`,
          opacity: el.opacity ?? 1,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: '100%', height: '100%',
        fontFamily: FONTS[el.font] || FONTS.sans,
        fontSize: `${el.size || 4}cqh`,
        lineHeight: el.lh || 1.5,
        fontWeight: el.bold ? 700 : 400,
        textAlign: el.align || 'left',
        color: el.color || 'var(--pp-text)',
        opacity: el.opacity ?? 1,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'hidden',
      }}
    >
      {el.text}
    </div>
  );
}

export default function VisaCanvas({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;

  return (
    <div
      style={{
        // 3 = 在纸和水印之上、正文（4）之下。章在正文里面 ——
        // 它是后来盖上去的，贴上去的图不该盖住它
        position: 'absolute', inset: 0, zIndex: 3,
        // 整层不吃点击，只有挂了链接的那几个元素自己把 pointerEvents 打开 ——
        // 否则一张铺满页面的背景图会把翻页整个吃掉
        pointerEvents: 'none',
        containerType: 'size',
      }}
    >
      {list.map((el) => {
        const box = {
          position: 'absolute',
          left: `${el.x}%`, top: `${el.y}%`,
          width: `${el.w}%`, height: `${el.h}%`,
          transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
        };
        if (el.href) {
          return (
            <a
              key={el.id}
              href={el.href}
              target="_blank"
              rel="noopener noreferrer"
              // 翻页判断靠 closest('a') 认出「这一下不是翻页」，
              // 所以这里必须是真的 <a>
              style={{ ...box, pointerEvents: 'auto', textDecoration: 'none', display: 'block' }}
            >
              <CanvasItem el={el} />
            </a>
          );
        }
        return (
          <div key={el.id} style={box}>
            <CanvasItem el={el} />
          </div>
        );
      })}
    </div>
  );
}
