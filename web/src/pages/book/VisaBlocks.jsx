import React from 'react';

/**
 * 签证页的正文 —— 一张块的清单。
 *
 * 页面上除了「页眉那排按钮」「地标水印」「二维码」「盖的那个章」，
 * 其余每一样都是这里的一个块：VISA 横框、签发站那片栏目、活动名、备注、
 * 配图、页面链接、机读区，加上同工自己摆上去的字和图。
 *
 * 每个块都能挪、能改大小、能转、能删。删光就是一张白页 —— 那是有意的：
 * 有些活动就想放一张海报。
 *
 * 留在外面的那四样是有理由的：
 *   页眉  是 App 的导航（队伍、分数、恩典站），不是这一页的内容
 *   水印  跟着地标走，护照模版里统一调
 *   二维码 同工要扫它盖章，挪走了现场就乱
 *   章    活动当天盖上去的，任何块都不该盖住它
 *
 * 编辑器和真护照用的是同一个组件，只是编辑器多传一个 editing ——
 * 抄成两份，迟早在某个字号上分家。
 */

const FONTS = {
  serif: "'EB Garamond','Noto Serif SC',serif",
  mono: "'Courier Prime',monospace",
  sans: "'Noto Serif SC',system-ui,sans-serif",
};

/** 可以放进「栏目」块的数据来源。和 server/src/config.js 的 VISA_ROW_SOURCES 对应。 */
export function bindRow(row, data) {
  switch (row.src) {
    // 持照人
    case 'player':    return { value: data.player };
    case 'surname':   return { value: data.surname };
    case 'given':     return { value: data.given };
    case 'code':      return { value: data.code };
    case 'passport':  return { value: data.passport };
    case 'contact':   return { value: data.contact };
    case 'identity':  return { value: data.identity };
    case 'team':      return { value: data.team };
    case 'visited':   return { value: data.visited };
    // 这一场
    case 'name':      return { value: data.name };
    case 'en':        return { value: data.en };
    case 'tag':       return { value: data.tag };
    case 'host':      return { value: data.host };
    case 'date':      return { value: data.date };
    // 这一页
    case 'status':    return { value: data.status, fg: data.statusFg };
    case 'stampDate': return { value: data.stampDate };
    case 'signed':    return { value: data.signed };
    case 'post':      return { value: data.post };
    case 'control':   return { value: data.control };
    // 'text' 和任何不认识的来源都当固定文字 —— 同工填什么印什么
    default:          return { value: row.text || '' };
  }
}

const label = (t) => (
  <div style={{
    fontFamily: "'EB Garamond',serif", fontSize: '1.9cqh', letterSpacing: '.12em',
    color: 'rgba(var(--pp-text-rgb),.55)', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  }}>{t}</div>
);

/** 一个块的内容，不含定位 —— 定位在外层，编辑器要在同一个盒子上挂拖拽 */
export function BlockBody({ b, data, editing, inlineEditing = false, onTextChange }) {
  switch (b.kind) {
    case 'banner':
      return (
        <div style={{
          display: 'flex', width: '100%', height: '100%', background: '#ece5d6',
          border: '1px solid rgba(var(--pp-ink-rgb),.35)', overflow: 'hidden',
        }}>
          <div style={{
            flex: '0 0 38%', display: 'flex', alignItems: 'center', paddingLeft: '3.5cqh',
            fontFamily: "'EB Garamond',serif", fontSize: '4.6cqh', letterSpacing: '.3em',
            color: 'var(--pp-ink)', whiteSpace: 'nowrap',
          }}>{b.word}</div>
          <div style={{
            flex: 1, minWidth: 0, background: 'var(--pp-ink)', display: 'flex',
            flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
            paddingRight: '3.5cqh', clipPath: 'polygon(14% 0,100% 0,100% 100%,0 100%)',
          }}>
            <div style={{
              fontFamily: "'EB Garamond',serif", fontSize: '2.9cqh', letterSpacing: '.2em',
              color: 'var(--pp-gold)', whiteSpace: 'nowrap',
            }}>{b.brand}</div>
            {b.brandCn ? (
              <div style={{ marginTop: '0.4cqh', fontSize: '2.2cqh', letterSpacing: '.14em', color: 'rgba(var(--pp-gold-rgb),.78)', whiteSpace: 'nowrap' }}>
                {b.brandCn}
              </div>
            ) : null}
          </div>
        </div>
      );

    case 'fields':
      return (
        <div style={{
          width: '100%', height: '100%', display: 'grid',
          gridTemplateColumns: `repeat(${b.cols || 2}, 1fr)`,
          gap: '1.8cqh 3.5cqh', alignContent: 'start', overflow: 'hidden',
        }}>
          {(b.rows || []).map((r) => {
            const v = bindRow(r, data);
            return (
              <div key={r.key} style={{ borderBottom: '1px solid rgba(var(--pp-ink-rgb),.18)', paddingBottom: '0.7cqh' }}>
                {label(r.label)}
                <div style={{
                  marginTop: '0.6cqh', fontFamily: "'Courier Prime',monospace", fontWeight: 700,
                  fontSize: '2.6cqh', letterSpacing: '.03em',
                  color: v.fg || (r.accent ? 'var(--pp-ink)' : 'var(--pp-text)'),
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{v.value}</div>
              </div>
            );
          })}
        </div>
      );

    case 'station':
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          {b.label ? label(b.label) : null}
          <div style={{ marginTop: '0.7cqh', fontSize: '4.4cqh', fontWeight: 700, lineHeight: 1.25, color: 'var(--pp-ink)' }}>
            {data.name}
          </div>
          {data.en ? (
            <div style={{ marginTop: '0.6cqh', fontFamily: "'EB Garamond',serif", fontSize: '2.2cqh', letterSpacing: '.16em', color: 'rgba(var(--pp-text-rgb),.6)' }}>
              {data.en}
            </div>
          ) : null}
        </div>
      );

    case 'note':
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          {b.label ? label(b.label) : null}
          <div style={{ marginTop: '0.8cqh', fontSize: '2.7cqh', fontWeight: 600, lineHeight: 1.75, color: 'var(--pp-text)', textWrap: 'pretty' }}>
            {data.desc}
          </div>
        </div>
      );

    case 'photo':
      if (!data.photo) {
        return editing ? <Ghost text="配图（这一场还没传图）" /> : null;
      }
      return (
        <div style={{ width: '100%', height: '100%', padding: '0.7cqh', background: '#fff', border: '1px solid rgba(var(--pp-ink-rgb),.35)', boxSizing: 'border-box' }}>
          <div style={{
            width: '100%', height: '100%', backgroundImage: `url("${data.photo}")`,
            backgroundSize: b.fit || 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          }} />
        </div>
      );

    case 'links':
      if (!(data.links || []).length) {
        return editing ? <Ghost text="页面链接（这一场还没加）" /> : null;
      }
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', gap: '1.4cqh', alignContent: 'flex-start', overflow: 'hidden' }}>
          {data.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.9cqh', padding: '0.7cqh 1.8cqh',
                border: '1px solid rgba(var(--pp-ink-rgb),.32)', background: 'rgba(var(--pp-ink-rgb),.05)',
                color: 'var(--pp-ink)', textDecoration: 'none', fontSize: '2.2cqh', whiteSpace: 'nowrap',
                pointerEvents: editing ? 'none' : 'auto',
              }}>
              <span>{l.icon}</span>
              {l.label ? <span style={{ fontFamily: "'EB Garamond',serif", letterSpacing: '.06em' }}>{l.label}</span> : null}
            </a>
          ))}
        </div>
      );

    case 'mrz':
      return (
        <div className="passport-mrz">
          {[data.mrz1, data.mrz2].map((t, i) => (
            <div className="passport-mrz__line" key={i}>{t}</div>
          ))}
        </div>
      );

    case 'image':
      // 别在这个样式对象里写 `background: undefined`：React 把 undefined 当成
      // 「设成空串」，而 background 是简写，一设空就把上面的 backgroundImage
      // 一起清掉 —— 图整个不见，还不报错。踩过一次了。
      if (!b.src) return editing ? <Ghost text="还没选图" /> : null;
      return (
        <div style={{
          width: '100%', height: '100%', backgroundImage: `url("${b.src}")`,
          backgroundSize: b.fit || 'cover', backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat', borderRadius: `${b.radius || 0}%`,
        }} />
      );

    case 'text':
    default:
      return (
        <div
          contentEditable={editing && inlineEditing}
          suppressContentEditableWarning
          data-inline-editor={inlineEditing ? b.id : undefined}
          onInput={inlineEditing && onTextChange
            ? (e) => onTextChange(e.currentTarget.textContent || '') : undefined}
          onPointerDown={inlineEditing ? (e) => e.stopPropagation() : undefined}
          style={{
          width: '100%', height: '100%',
          fontFamily: FONTS[b.font] || FONTS.sans,
          fontSize: `${b.size || 4}cqh`,
          lineHeight: b.lh || 1.5,
          fontWeight: b.bold ? 700 : 400,
          textAlign: b.align || 'left',
          color: b.color || 'var(--pp-text)',
          outline: inlineEditing ? '1px dashed currentColor' : 'none',
          cursor: inlineEditing ? 'text' : undefined,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden',
        }}>{b.text}</div>
      );
  }
}

/** 编辑器里给空块画个虚框，别人手机上什么都不画 */
function Ghost({ text }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px dashed rgba(var(--pp-ink-rgb),.4)', color: 'rgba(var(--pp-ink-rgb),.6)',
      fontSize: '2.2cqh', textAlign: 'center', padding: '1cqh', boxSizing: 'border-box',
    }}>{text}</div>
  );
}

export default function VisaBlocks({ blocks, data, editing = false }) {
  const list = Array.isArray(blocks) ? blocks : [];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 3,
      // 整层不吃点击：只有挂了链接的块自己把 pointerEvents 打开。
      // 否则一张铺满页面的背景图会把翻页整个吃掉
      pointerEvents: 'none', containerType: 'size',
    }}>
      {list.map((b) => {
        const box = {
          position: 'absolute',
          left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
          transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
          opacity: b.opacity ?? 1,
        };
        const body = <BlockBody b={b} data={data} editing={editing} />;
        if (b.href && !editing) {
          return (
            <a key={b.id} href={b.href} target="_blank" rel="noopener noreferrer"
              style={{ ...box, pointerEvents: 'auto', textDecoration: 'none', display: 'block' }}>
              {body}
            </a>
          );
        }
        // 链接块自己会开 pointerEvents（见上面的 links 分支）
        return <div key={b.id} style={{ ...box, pointerEvents: b.kind === 'links' && !editing ? 'auto' : 'none' }}>{body}</div>;
      })}
    </div>
  );
}
