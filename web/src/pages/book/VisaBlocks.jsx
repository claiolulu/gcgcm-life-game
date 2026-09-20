import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEXT_BLOCK_MAX } from '../../lib/config.js';
import ScrollBox from '../../components/ScrollRail.jsx';
import { useToast } from '../../components/ui.jsx';
import { activityQr } from '../../lib/activityQr.js';
import { copyText } from '../../lib/clipboard.js';
import { track } from '../../lib/track.js';

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
 *   页眉  是 App 的导航（排行榜、通知、使用说明），不是这一页的内容
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

/**
 * 活动报名二维码块。签证页上是一个小码 + 一句说明；点开是分享面板：
 * 大码（可长按保存）、直接打开报名页、系统分享（能带图就带图）、复制链接。
 *
 * 中间的图标：块上没选 = 跟这场活动的图标，'M' = 护照徽章，其余是自选的。
 * 和护照页脚那个「护照码」是两回事 —— 那个给同工扫了盖章，这个给朋友扫了报名，
 * 面板里写明白，免得现场有人拿报名码去给同工扫。
 */
function QrBody({ b, data, editing }) {
  const toast = useToast();
  const url = data?.joinUrl || '';
  const icon = b.icon || data?.icon || 'M';
  const [thumb, setThumb] = useState('');
  const [big, setBig] = useState('');
  const [open, setOpen] = useState(false);
  // 活动「已办完」之后护照上自动不显示报名码 —— 进行中还留着，
  // 开场后扫码进来的人照样能登记（服务端会标成补报名，章由管理员补）。
  // 画板里照样画出来（变淡 + 注明），同工才知道这个块还在
  const closed = (data?.activityState || 'upcoming') === 'done';
  // 码中间的徽章用这本护照的主色和金色：从块自己身上读 --pp-* 变量
  // （护照册和画板的签证页容器都挂着它们），读到了才开始画，免得先画一张默认色的再换
  const btnRef = useRef(null);
  const [colors, setColors] = useState(null);
  useLayoutEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const ink = cs.getPropertyValue('--pp-ink').trim();
    const gold = cs.getPropertyValue('--pp-gold').trim();
    setColors((c) => (c && c.ink === ink && c.gold === gold ? c : { ink, gold }));
  });

  useEffect(() => {
    if (!url || !colors || (closed && !editing)) return undefined;
    let alive = true;
    activityQr(url, { icon, size: 360, ...colors }).then((src) => { if (alive) setThumb(src); }).catch(() => {});
    return () => { alive = false; };
  }, [url, icon, closed, editing, colors]);

  useEffect(() => {
    if (!open || !url) return undefined;
    let alive = true;
    activityQr(url, { icon, size: 900, ...(colors || {}) }).then((src) => { if (alive) setBig(src); }).catch(() => {});
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [open, url, icon, colors]);

  if (!url) return editing ? <Ghost text="报名二维码" /> : null;
  if (closed && !editing) return null;

  const name = data?.name || '活动';
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  async function copy() {
    track('qr_share', { activityId: data?.activityId, label: 'copy' });
    const ok = await copyText(url);
    toast(ok ? '报名链接已复制，发给朋友就能报名' : '复制不了，可以长按二维码图片保存', ok ? 'ok' : 'err');
  }

  async function share() {
    track('qr_share', { activityId: data?.activityId, label: 'share' });
    const title = `${name} · 扫码报名`;
    try {
      // 带图分享：系统面板里能直接发到微信、WhatsApp 等；桌面浏览器多半不支持，退回分享链接
      if (big && navigator.canShare) {
        const blob = await (await fetch(big)).blob();
        const file = new File([blob], `${name}-报名二维码.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title, text: `${title}：${url}` });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title, text: title, url });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;   // 用户自己在系统面板里取消的
    }
    await copy();
  }

  const modal = open && !editing && typeof document !== 'undefined' ? createPortal(
    <div className="activity-qr-modal" role="dialog" aria-modal="true" aria-label={`${name} 报名二维码`}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="activity-qr-modal__card">
        <div className="activity-qr-modal__eyebrow">SCAN TO SIGN UP 扫码报名</div>
        <div className="activity-qr-modal__name">{name}</div>
        <div className="activity-qr-modal__img">
          {big ? <img src={big} alt={`${name} 报名二维码`} /> : null}
        </div>
        <div className="activity-qr-modal__tip">
          朋友用手机相机扫这个码，就能打开报名页、领护照并报名。可以长按图片保存，或直接分享。
          <br />这是报名码；现场盖章请出示护照页脚的护照码。
        </div>
        <div className="activity-qr-modal__actions">
          <a className="is-primary activity-qr-modal__open" href={url}>直接打开报名页</a>
          <button type="button" className="is-primary" onClick={share}>分享给朋友</button>
          <button type="button" onClick={copy}>复制链接</button>
        </div>
        <button type="button" className="activity-qr-modal__close" onClick={() => setOpen(false)}>关闭</button>
      </div>
    </div>, document.body,
  ) : null;

  return (
    <>
      <button type="button" className="visa-qr" ref={btnRef} tabIndex={editing ? -1 : 0}
        style={closed ? { opacity: 0.45 } : undefined}
        aria-label={`${name} 报名二维码，点开分享`}
        onClick={(e) => {
          stop(e);
          if (editing) return;
          setOpen(true);
          track('qr_open', { activityId: data?.activityId });
        }}>
        <span className="visa-qr__code">{thumb ? <img src={thumb} alt="" /> : null}</span>
        <span className="visa-qr__text">
          <span className="visa-qr__label" style={{ fontFamily: FONTS.sans }}>{b.label || '扫码报名'}</span>
          <span className="visa-qr__hint">{closed ? '活动结束后自动隐藏' : '点开分享给朋友'}</span>
        </span>
      </button>
      {modal}
    </>
  );
}

/**
 * 点开看大图。
 *
 * 签证页上的图最大也就巴掌大，活动合影挤在里面根本看不清谁是谁。
 * 复用图库那套弹层样式 —— 同一个页面上两种放大长得不一样才奇怪。
 */
function Zoomable({ src, alt, children, disabled = false }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 画板里点图是选中这个块，不是看大图
  if (disabled) return children;

  const modal = open && typeof document !== 'undefined' ? createPortal(
    <div className="photo-gallery-modal" role="dialog" aria-modal="true" aria-label="放大查看"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="photo-gallery-modal__bar">
        <div><b>{alt || '这一页的图'}</b></div>
        <button onClick={() => setOpen(false)} aria-label="关闭大图">×</button>
      </div>
      <div className="photo-gallery-modal__viewer">
        <img src={src} alt={alt || ''} />
      </div>
    </div>, document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        className="visa-zoom"
        aria-label="点开看大图"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      >
        {children}
      </button>
      {modal}
    </>
  );
}

/**
 * 活动短片。
 *
 * 不自动下载整段（preload=metadata）—— 签证页一翻过去就拉几十兆，
 * 手机流量和弱网都受不了。自动播放必须同时静音，否则浏览器直接拒绝。
 * 画板里不给播：编辑时点下去应该是选中这个块，不是开始放片。
 */
function VideoBody({ b, editing }) {
  if (!b.src) return editing ? <Ghost text="还没选视频" /> : null;

  const shape = {
    width: '100%', height: '100%', objectFit: b.fit === 'cover' ? 'cover' : 'contain',
    display: 'block', background: '#000', borderRadius: `${b.radius || 0}%`,
  };
  if (editing) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <video src={b.src} poster={b.poster || undefined} style={{ ...shape, pointerEvents: 'none' }}
          preload="metadata" muted playsInline />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '3cqh', textShadow: '0 1px 4px rgba(0,0,0,.8)', pointerEvents: 'none',
        }}>▶ 视频</div>
      </div>
    );
  }
  return (
    <video
      src={b.src}
      poster={b.poster || undefined}
      style={shape}
      controls
      playsInline
      preload="metadata"
      loop={!!b.loop}
      muted={!!b.muted || !!b.autoplay}
      autoPlay={!!b.autoplay}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function GalleryBody({ b, editing }) {
  const photos = Array.isArray(b.photos) ? b.photos.filter(Boolean) : [];
  const featured = Math.max(1, Math.min(8, Number(b.featured) || 6));
  const shown = photos.slice(0, featured);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); setActive(null); }
      if (active !== null && e.key === 'ArrowRight') setActive((active + 1) % photos.length);
      if (active !== null && e.key === 'ArrowLeft') setActive((active - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, active, photos.length]);

  if (!photos.length) return editing ? <Ghost text="图库还没有照片：打开参与者素材库，连续加入多张" /> : null;

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const openAll = (e) => { stop(e); if (!editing) setOpen(true); };
  const modal = open && !editing && typeof document !== 'undefined' ? createPortal(
    <div className="photo-gallery-modal" role="dialog" aria-modal="true" aria-label={`全部 ${photos.length} 张照片`}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) { setOpen(false); setActive(null); } }}>
      <div className="photo-gallery-modal__bar">
        <div><b>活动照片</b><span>{active === null ? `${photos.length} 张` : `${active + 1} / ${photos.length}`}</span></div>
        <button onClick={() => { setOpen(false); setActive(null); }} aria-label="关闭全部照片">×</button>
      </div>
      {active === null ? (
        <div className="photo-gallery-modal__grid">
          {photos.map((src, i) => (
            <button key={`${src}-${i}`} onClick={() => setActive(i)} aria-label={`查看第 ${i + 1} 张照片`}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <div className="photo-gallery-modal__viewer">
          <button className="photo-gallery-modal__nav photo-gallery-modal__nav--prev"
            onClick={() => setActive((active - 1 + photos.length) % photos.length)} aria-label="上一张">‹</button>
          <img src={photos[active]} alt={`第 ${active + 1} 张活动照片`} />
          <button className="photo-gallery-modal__nav photo-gallery-modal__nav--next"
            onClick={() => setActive((active + 1) % photos.length)} aria-label="下一张">›</button>
          <button className="photo-gallery-modal__back" onClick={() => setActive(null)}>查看全部缩略图</button>
        </div>
      )}
    </div>, document.body,
  ) : null;

  return (
    <>
      <div className="visa-gallery" style={{ '--gallery-cols': Math.min(4, Math.max(2, Number(b.cols) || 3)) }}>
        <div className="visa-gallery__grid">
          {shown.map((src, i) => (
            <button key={`${src}-${i}`} tabIndex={editing ? -1 : 0} onClick={(e) => { stop(e); if (!editing) { setOpen(true); setActive(i); } }}>
              <img src={src} alt="" loading="lazy" />
              {i === shown.length - 1 && photos.length > shown.length ? <span>+{photos.length - shown.length}</span> : null}
            </button>
          ))}
        </div>
        <button className="visa-gallery__all" tabIndex={editing ? -1 : 0} onClick={openAll}>
          查看全部 {photos.length} 张
        </button>
      </div>
      {modal}
    </>
  );
}

function InlineValue({ as: Tag = 'span', value, field, blockId, onTextChange, style, maxLength = 1000, placeholder = '', multiline = false }) {
  const ref = useRef(null);
  const composing = useRef(false);
  const initialValue = useRef(String(value || ''));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current || document.activeElement === el) return;
    const next = String(value || '');
    if (el.innerText !== next) el.innerText = next;
    initialValue.current = next;
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    // 按「字」数（码点），不按 UTF-16 数，免得把 emoji 劈成两半
    const chars = [...el.innerText];
    const truncated = chars.length > maxLength;
    const next = truncated ? chars.slice(0, maxLength).join('') : el.innerText;
    if (truncated) el.innerText = next;
    el.removeAttribute('data-over');
    // 截过就一定要通知，哪怕截完和原来一样（原来就满了、又粘贴了一段）——
    // 否则超出的那截就这么无声地没了，用户丢内容正是这么来的
    if (next !== initialValue.current || truncated) {
      initialValue.current = next;
      onTextChange?.(field, next, truncated ? { truncated: true, max: maxLength } : undefined);
    }
  };

  return (
    <Tag
      ref={ref}
      className="visa-inline-input"
      data-inline-editor={blockId}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline ? 'true' : 'false'}
      data-placeholder={placeholder}
      aria-label={placeholder || '直接编辑文字'}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }}
      // 打字、粘贴的当下就标红，不用等失去焦点才发现超了
      onInput={(e) => e.currentTarget.toggleAttribute('data-over', [...e.currentTarget.innerText].length > maxLength)}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onBlur={commit}
    >{String(value || '')}</Tag>
  );
}

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

/** 资料页和 VISA 页共用同一个机读区，避免两套 DOM 在手机上产生字形差异。 */
export function PassportMrz({ line1, line2, className = '' }) {
  return (
    <div className={`passport-mrz${className ? ` ${className}` : ''}`}>
      <div className="passport-mrz__line">{line1}</div>
      <div className="passport-mrz__line">{line2}</div>
    </div>
  );
}

/** 一个块的内容，不含定位 —— 定位在外层，编辑器要在同一个盒子上挂拖拽 */
/** 图的原始长宽比按 src 缓存：同一张图在画板和护照里会渲染很多次，不必每次重读。 */
const imageAspects = new Map();

function useImageAspect(src) {
  const [aspect, setAspect] = useState(() => (src && imageAspects.get(src)) || 0);
  useEffect(() => {
    if (!src) return undefined;
    const cached = imageAspects.get(src);
    if (cached) { setAspect(cached); return undefined; }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      imageAspects.set(src, ratio);
      if (alive) setAspect(ratio);
    };
    img.src = src;
    return () => { alive = false; };
  }, [src]);
  return aspect;
}

/**
 * 「配图」和「图片」共用的图面：posX/posY 选露出图的哪一部分，zoom 改图本身多大。
 *
 * zoom 必须落在 background-size 上，不能用 transform —— transform 缩的是「已经裁好的
 * 那张画面」，裁掉的边角再也回不来；用户要的是缩小之后原来被裁掉的上下重新露出来。
 * 所以这里得知道图的原始长宽比和框的实际像素，自己把 cover/contain 的基准算出来再乘 zoom。
 * 这两样还没拿到时先退回纯 CSS 的 cover/contain，和以前的行为一致，拿到后再精确化。
 */
function CroppedImage({ src, b }) {
  const ref = useRef(null);
  const aspect = useImageAspect(src);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((cur) => (cur.w === width && cur.h === height ? cur : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = b.fit || 'cover';
  const posX = b.posX ?? 50;
  const posY = b.posY ?? 50;
  const zoom = b.zoom ?? 1;

  let backgroundSize = fit;
  if (aspect && box.w && box.h) {
    // 铺满 = 两边都不小于框，完整显示 = 两边都不超过框；算出基准高度再乘 zoom
    const baseH = fit === 'contain'
      ? Math.min(box.w / aspect, box.h)
      : Math.max(box.w / aspect, box.h);
    const drawH = baseH * zoom;
    backgroundSize = `${drawH * aspect}px ${drawH}px`;
  }

  return (
    <div ref={ref} style={{
      width: '100%', height: '100%', backgroundImage: `url("${src}")`,
      backgroundSize, backgroundPosition: `${posX}% ${posY}%`, backgroundRepeat: 'no-repeat',
    }} />
  );
}

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
          }}>{inlineEditing ? (
            <InlineValue value={b.word} field="word" blockId={b.id} maxLength={16}
              placeholder="VISA" onTextChange={onTextChange} />
          ) : b.word}</div>
          <div style={{
            flex: 1, minWidth: 0, background: 'var(--pp-ink)', display: 'flex',
            flexDirection: 'column', alignItems: b.align === 'left' ? 'flex-start' : b.align === 'center' ? 'center' : 'flex-end', justifyContent: 'center',
            paddingRight: '3.5cqh', clipPath: 'polygon(14% 0,100% 0,100% 100%,0 100%)',
          }}>
            <div style={{
              width: '76%', fontFamily: FONTS[b.font] || FONTS.serif, fontSize: `${b.size || 2.9}cqh`, letterSpacing: '.2em',
              lineHeight: b.lh || 1.15, fontWeight: b.bold ? 700 : 400,
              textAlign: b.align || 'right', color: b.color || 'var(--pp-gold)', whiteSpace: 'nowrap',
            }}>{inlineEditing ? (
              <InlineValue value={b.brand} field="brand" blockId={b.id} maxLength={24}
                placeholder="活动标题" onTextChange={onTextChange} />
            ) : b.brand}</div>
            {b.brandCn || inlineEditing ? (
              <div style={{ marginTop: '0.4cqh', fontSize: '2.2cqh', letterSpacing: '.14em', color: 'rgba(var(--pp-gold-rgb),.78)', whiteSpace: 'nowrap' }}>
                {inlineEditing ? (
                  <InlineValue value={b.brandCn} field="brandCn" blockId={b.id} maxLength={16}
                    placeholder="中文副标题" onTextChange={onTextChange} />
                ) : b.brandCn}
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
          {(b.rows || []).map((r, rowIndex) => {
            const v = bindRow(r, data);
            const editableValueField = r.src === 'post' ? 'issuer' : r.src === 'text' ? `row:${rowIndex}:text` : '';
            return (
              <div key={r.key} style={{ borderBottom: '1px solid rgba(var(--pp-ink-rgb),.18)', paddingBottom: '0.7cqh' }}>
                {inlineEditing ? (
                  <InlineValue value={r.label} field={`row:${rowIndex}:label`} blockId={b.id}
                    maxLength={40} placeholder="栏目标题" onTextChange={onTextChange}
                    style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.9cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }} />
                ) : label(r.label)}
                <div style={{
                  marginTop: '0.6cqh', fontFamily: FONTS[b.font] || FONTS.mono,
                  fontWeight: (b.bold ?? true) ? 700 : 400,
                  fontSize: `${b.size || 2.6}cqh`, lineHeight: b.lh || 1.2, letterSpacing: '.03em',
                  textAlign: b.align || 'left', color: b.color || v.fg || (r.accent ? 'var(--pp-ink)' : 'var(--pp-text)'),
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{inlineEditing && editableValueField ? (
                  <InlineValue value={v.value} field={editableValueField} blockId={b.id}
                    maxLength={80} placeholder={r.src === 'post' ? '签发机构' : '固定文字'} onTextChange={onTextChange} />
                ) : v.value}</div>
              </div>
            );
          })}
        </div>
      );

    case 'station':
      return (
        <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          {inlineEditing ? (
            <InlineValue value={b.label} field="label" blockId={b.id} maxLength={30}
              placeholder="STATION 活动" onTextChange={onTextChange}
              style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.9cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }} />
          ) : b.label ? label(b.label) : null}
          <div style={{ marginTop: '0.7cqh', fontFamily: FONTS[b.font] || FONTS.sans,
            fontSize: `${b.size || 4.4}cqh`, fontWeight: (b.bold ?? true) ? 700 : 400,
            lineHeight: b.lh || 1.25, textAlign: b.align || 'left', color: b.color || 'var(--pp-ink)' }}>
            {inlineEditing ? (
              <InlineValue value={data.name} field="name" blockId={b.id} maxLength={20}
                placeholder="活动名称" onTextChange={onTextChange} />
            ) : data.name}
          </div>
          {data.en || inlineEditing ? (
            <div style={{ marginTop: '0.6cqh', fontFamily: "'EB Garamond',serif", fontSize: '2.2cqh', letterSpacing: '.16em', color: 'rgba(var(--pp-text-rgb),.6)' }}>
              {inlineEditing ? (
                <InlineValue value={data.en} field="en" blockId={b.id} maxLength={40}
                  placeholder="English title" onTextChange={onTextChange} />
              ) : data.en}
            </div>
          ) : null}
        </div>
      );

    case 'note':
      // 备注是同工自己写的，长度没有上限 —— 原来 overflow: hidden，写多了
      // 后面几行直接被裁掉，页面上一点痕迹都没有，写的人还以为印上了。
      // 现在装不下就能滚，右边那根滑杆负责说「下面还有」。
      return (
        <ScrollBox
          style={{ width: '100%', height: '100%' }}
          railClassName="list-rail--visa"
          deps={`${data.desc || ''}|${b.h}`}
          // 编辑器里没在改字时，手势留给外层去拖动这个块
          interactive={!editing || inlineEditing}
        >
          {inlineEditing ? (
            <InlineValue value={b.label} field="label" blockId={b.id} maxLength={30}
              placeholder="ANNOTATION 备注" onTextChange={onTextChange}
              style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.9cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }} />
          ) : b.label ? label(b.label) : null}
          <div style={{ marginTop: '0.8cqh', fontFamily: FONTS[b.font] || FONTS.sans,
            fontSize: `${b.size || 2.7}cqh`, fontWeight: b.bold === undefined ? 600 : b.bold ? 700 : 400,
            lineHeight: b.lh || 1.75, textAlign: b.align || 'left', color: b.color || 'var(--pp-text)', textWrap: 'pretty' }}>
            {inlineEditing ? (
              <InlineValue as="div" multiline value={data.desc} field="desc" maxLength={200} blockId={b.id}
                placeholder="直接输入备注" onTextChange={onTextChange} />
            ) : data.desc}
          </div>
        </ScrollBox>
      );

    case 'photo':
      if (!data.photo) {
        return editing ? <Ghost text="配图（这一场还没传图）" /> : null;
      }
      return (
        <Zoomable src={data.photo} alt="活动配图" disabled={editing}>
          <div style={{ width: '100%', height: '100%', padding: '0.7cqh', background: '#fff', border: '1px solid rgba(var(--pp-ink-rgb),.35)', boxSizing: 'border-box' }}>
            {/* 放大后要被这层白边框裁住，不然会糊出框外 */}
            <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
              <CroppedImage src={data.photo} b={b} />
            </div>
          </div>
        </Zoomable>
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
      return <PassportMrz line1={data.mrz1} line2={data.mrz2} />;

    case 'image':
      // 别在这个样式对象里写 `background: undefined`：React 把 undefined 当成
      // 「设成空串」，而 background 是简写，一设空就把上面的 backgroundImage
      // 一起清掉 —— 图整个不见，还不报错。踩过一次了。
      if (!b.src) return editing ? <Ghost text="还没选图" /> : null;
      return (
        <Zoomable src={b.src} alt="这一页的图" disabled={editing}>
          <div style={{
            width: '100%', height: '100%', overflow: 'hidden',
            borderRadius: `${b.radius || 0}%`,
          }}>
            <CroppedImage src={b.src} b={b} />
          </div>
        </Zoomable>
      );

    case 'video':
      return <VideoBody b={b} editing={editing} />;

    case 'gallery':
      return <GalleryBody b={b} editing={editing} />;

    case 'qr':
      return <QrBody b={b} data={data} editing={editing} />;

    case 'icon':
      // 字号跟着块高走，把手拖大图标就跟着变大。
      //
      // 关键是外面这层 containerType: 'size' —— cqh 是按**最近的容器**算的，
      // 不加的话最近的容器是整张签证页（见横版页那个 containerType），
      // 88cqh 就成了「页高的 88%」，一个图标糊满半张纸。
      // 留一点余量：emoji 的实际字形普遍比字号小一圈，撑满反而贴边。
      return (
        <div style={{
          width: '100%', height: '100%', containerType: 'size',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '82cqh', lineHeight: 1, userSelect: 'none' }}>
            {b.icon || '📍'}
          </span>
        </div>
      );

    case 'text':
    default:
      return (
        <ScrollBox
          railClassName="list-rail--visa"
          deps={`${b.text || ''}|${b.h}|${b.size}|${b.lh}`}
          // 编辑器里没在改字时，手势留给外层去拖动这个块
          interactive={!editing || inlineEditing}
          style={{
            width: '100%', height: '100%',
            fontFamily: FONTS[b.font] || FONTS.sans,
            fontSize: `${b.size || 4}cqh`,
            lineHeight: b.lh || 1.5,
            fontWeight: b.bold ? 700 : 400,
            textAlign: b.align || 'left',
            color: b.color || 'var(--pp-text)',
            outline: 'none', cursor: inlineEditing ? 'text' : undefined,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >{inlineEditing ? (
          <InlineValue as="div" multiline value={b.text} field="text" blockId={b.id} maxLength={TEXT_BLOCK_MAX}
            // 撑满整个块：点在字下面的空白处也是在改字，而不是落到块上变成拖动
            style={{ minHeight: '100%' }}
            placeholder="直接输入文字" onTextChange={onTextChange} />
        ) : b.text}</ScrollBox>
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
        if (b.href && !editing && b.kind !== 'gallery' && b.kind !== 'qr') {
          return (
            <a key={b.id} href={b.href} target="_blank" rel="noopener noreferrer"
              style={{ ...box, pointerEvents: 'auto', textDecoration: 'none', display: 'block' }}>
              {body}
            </a>
          );
        }
        // 链接、图库、报名码、视频和可放大的图需要接收点击；其它块继续穿透给翻页层。
        const interactive = !editing && ['links', 'gallery', 'qr', 'video', 'image', 'photo'].includes(b.kind);
        return <div key={b.id} style={{ ...box, pointerEvents: interactive ? 'auto' : 'none' }}>{body}</div>;
      })}
    </div>
  );
}
