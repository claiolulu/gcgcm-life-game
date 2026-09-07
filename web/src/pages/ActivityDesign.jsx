import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import RowEditor from '../components/RowEditor.jsx';
import { NetBar, useToast, useConfirm } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';
import VisaPageFrame, { PAGE_ASPECT } from './book/VisaPageFrame.jsx';
import { BlockBody } from './book/VisaBlocks.jsx';
import { resolveBlocks, blockData } from './book/bookVals.js';

/**
 * 签证页的版式编辑器。
 *
 * 这一页上除了页眉、水印、二维码和那个章，每一样都是一个块 —— VISA 横框、
 * 签发站那片栏目、活动名、备注、配图、页面链接、机读区，加上同工自己摆的
 * 字和图。都能挪、能改大小、能转、能删。删光就是一张白页。
 *
 * 所见即所得靠的是：块在这里和在真护照上是同一个组件（BlockBody）、同一套
 * 单位（位置百分比，字号 cqh），层叠位置也一样（塞在 VisaPageFrame 里）。
 * 编辑器另画一套的话，迟早在某个字号上分家。
 */

const round = (n) => Math.round(n * 10) / 10;

/** 能往页面上加什么。删掉的内置块也能从这里加回来。 */
const PALETTE = [
  { kind: 'text',    name: '文字',     make: () => ({ x: 8, y: 30, w: 40, h: 14, text: '写点什么', size: 4, color: '', font: 'sans', align: 'left', bold: false, lh: 1.5 }) },
  { kind: 'image',   name: '图片',     make: () => ({ x: 10, y: 25, w: 30, h: 34, src: '', fit: 'cover', radius: 0 }) },
  { kind: 'banner',  name: 'VISA 横框', make: (t) => ({ x: 4, y: 12.5, w: 92, h: 11, word: t.banner, brand: 'MINI LIFE GAME', brandCn: '迷你人生游戏' }) },
  { kind: 'fields',  name: '栏目',     make: (t) => ({ x: 4.5, y: 27, w: 52, h: 62, cols: 2, rows: t.rows }) },
  { kind: 'station', name: '活动名',   make: (t) => ({ x: 60, y: 27, w: 36, h: 16, label: t.stationLabel }) },
  { kind: 'note',    name: '备注',     make: (t) => ({ x: 60, y: 47, w: 36, h: 30, label: t.annotationLabel }) },
  { kind: 'photo',   name: '配图',     make: () => ({ x: 60, y: 27, w: 36, h: 21, fit: 'cover' }) },
  { kind: 'links',   name: '页面链接', make: () => ({ x: 4.5, y: 80, w: 52, h: 8 }) },
  { kind: 'mrz',     name: '机读区',   make: () => ({ x: 0, y: 88.5, w: 100, h: 11.5 }) },
];

const KIND_NAME = Object.fromEntries(PALETTE.map((p) => [p.kind, p.name]));

/** 编辑器里用的示例数据。真页面上这些每个人都不一样。 */
function sampleData(activity) {
  return blockData({
    station: activity, passportNo: 'GCGCM000001', pageNo: '01',
    surname: '林', given: '小满', identityLabel: 'SOLO',
    visaScore: null, isCheckin: false, stampTone: '',
    mrz1: 'P<GCGCMPLAYER<<ONE<<<<<<<<<<<<<<<<<<',
    mrz2: 'GCGCM000001<GCGCM——<00PTS<<<<<<<<<<',
  });
}

export default function ActivityDesign() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;

  const boxRef = useRef(null);
  const [blocks, setBlocks] = useState(null);
  const [name, setName] = useState('');
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);

  const activities = config?.activities || [];
  const activity = activities.find((a) => a.id === id);
  const tpl = config?.visaTemplate || {};
  const sources = config?.visaSources || [];

  useEffect(() => {
    if (dirty || !activity) return;
    setBlocks(resolveBlocks(config?.visaTemplate, activity, config?.theme)
      .map((b) => JSON.parse(JSON.stringify(b))));
    setName(activity.name || '');
  }, [activity, config, dirty]);

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  const data = useMemo(() => sampleData(activity), [activity]);
  const selected = useMemo(() => (blocks || []).find((b) => b.id === sel) || null, [blocks, sel]);

  /* --------------------------- 增删改 --------------------------- */

  const patch = (bid, p) => {
    setBlocks((cur) => cur.map((b) => (b.id === bid ? { ...b, ...p } : b)));
    setDirty(true);
  };

  /**
   * 按当前值改（而不是按某个捕获到的值）。
   *
   * 方向键微调必须走这个：连按两下时两次事件在同一帧里，patch 那种
   * 「算好了再塞进去」的写法两次都从同一个起点算，按两下只动一格。
   * 按住方向键不放正是最常见的用法。
   */
  const bump = (bid, fn) => {
    setBlocks((cur) => cur.map((b) => (b.id === bid ? { ...b, ...fn(b) } : b)));
    setDirty(true);
  };

  function add(kind) {
    const def = PALETTE.find((p) => p.kind === kind);
    const made = {
      id: `b${Date.now().toString(36)}`, kind, rot: 0, opacity: 1, href: '',
      ...def.make({ banner: tpl.banner || 'VISA', rows: tpl.rows || [],
                    stationLabel: tpl.stationLabel || '', annotationLabel: tpl.annotationLabel || '' }),
    };
    setBlocks((cur) => [...cur, made]);
    setSel(made.id);
    setDirty(true);
    setAdding(false);
  }

  async function pickImage(file, bid) {
    if (!file) return;
    setBusy('img');
    try {
      const res = await uploadPhoto(file, token);
      patch(bid, { src: res.url });
      toast(`图已上传（${Math.round(res.bytes / 1024)}KB）`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const remove = (bid) => {
    setBlocks((cur) => cur.filter((b) => b.id !== bid));
    setSel(null);
    setDirty(true);
  };

  function duplicate(b) {
    const made = { ...JSON.parse(JSON.stringify(b)), id: `b${Date.now().toString(36)}`,
                   x: round(b.x + 3), y: round(b.y + 3) };
    setBlocks((cur) => [...cur, made]);
    setSel(made.id);
    setDirty(true);
  }

  /** 图层顺序就是数组顺序：后面的画在上面 */
  const layer = (bid, dir) => {
    setBlocks((cur) => {
      const i = cur.findIndex((b) => b.id === bid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  async function clearAll() {
    if (!(await ask({
      title: '把这一页清空？', danger: true, confirmText: '清空',
      body: '所有块都删掉，剩一张白纸 —— 想做成整页海报就该这样。之后还能一样样加回来。',
    }))) return;
    setBlocks([]);
    setSel(null);
    setDirty(true);
  }

  async function resetDefault() {
    if (!(await ask({
      title: '恢复默认版式？', danger: true, confirmText: '恢复',
      body: '这一页会变回签证页模版的样子，你摆的东西全丢掉。',
    }))) return;
    setBlocks(resolveBlocks(config?.visaTemplate, { ...activity, blocks: undefined }, config?.theme)
      .map((b) => JSON.parse(JSON.stringify(b))));
    setSel(null);
    setDirty(true);
  }

  /* --------------------------- 拖动 --------------------------- */

  /**
   * 移动和缩放共用一套：按下时记住起点，之后把像素位移换算成百分比。
   *
   * 监听挂在 window 上而不是元素上 —— 手指快速滑动时指针经常跑到元素外面，
   * 挂在元素上会中途断掉，拖着拖着就停住了。
   */
  function drag(e, b, mode) {
    e.preventDefault();
    e.stopPropagation();
    setSel(b.id);
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const s = { px: e.clientX, py: e.clientY, x: b.x, y: b.y, w: b.w, h: b.h };

    const move = (ev) => {
      const dx = ((ev.clientX - s.px) / box.width) * 100;
      const dy = ((ev.clientY - s.py) / box.height) * 100;
      if (mode === 'move') patch(b.id, { x: round(s.x + dx), y: round(s.y + dy) });
      else patch(b.id, { w: Math.max(2, round(s.w + dx)), h: Math.max(2, round(s.h + dy)) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* --------------------------- 键盘 --------------------------- */

  /**
   * 摆版式的时候手是离不开键盘的：删一个块、微调两个像素、存一下。
   *
   * 处理函数放在 ref 里、监听只挂一次 —— 直接把 selected / blocks 写进
   * 依赖数组的话，每次拖动都要摘挂一遍监听；不写又会读到上一帧的状态。
   *
   * 在输入框里打字时只留 Esc（失焦）和 ⌘S，其余一律放行 ——
   * 不然写活动介绍打个 Delete 就把选中的块删了。
   */
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const t = e.target;
    const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (dirty && busy !== 'save') save();
      return;
    }
    if (typing) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (e.key === 'Escape') { setSel(null); return; }
    if (!selected) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); remove(selected.id); return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault(); duplicate(selected); return;
    }
    if (e.key === '[' || e.key === ']') {
      e.preventDefault(); layer(selected.id, e.key === ']' ? 1 : -1); return;
    }

    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (nudge) {
      e.preventDefault();
      // 按住 Shift 走一大步：对齐到别的块时先粗调再细调，比一路点快得多
      const step = e.shiftKey ? 5 : 0.5;
      // Alt 改成改大小，不用去够右下角那个小方块
      if (e.altKey) {
        bump(selected.id, (b) => ({
          w: Math.max(2, round(b.w + nudge[0] * step)),
          h: Math.max(2, round(b.h + nudge[1] * step)),
        }));
      } else {
        bump(selected.id, (b) => ({
          x: round(b.x + nudge[0] * step),
          y: round(b.y + nudge[1] * step),
        }));
      }
    }
  };

  useEffect(() => {
    const fn = (e) => keyRef.current?.(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  /* --------------------------- 保存 --------------------------- */

  async function save() {
    setBusy('save');
    try {
      const list = activities.map((a) => (
        a.id === id ? { ...a, blocks, name: name.trim() || a.name } : a
      ));
      const res = await api('/api/admin/activities', { method: 'POST', body: { activities: list }, token });
      setDirty(false);
      const made = res.activities.find((a) => a.id === id);
      if (made) setBlocks((made.blocks || []).map((b) => JSON.parse(JSON.stringify(b))));
      await loadConfig();
      toast('已保存，所有人的护照上都换了', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (dirty && !(await ask({
      title: '还没保存，就这么走？', danger: true, confirmText: '不保存了',
      body: '刚摆的东西会丢掉。',
    }))) return;
    nav(`/staff/admin/a/${id}`);
  }

  /* --------------------------- 渲染 --------------------------- */

  if (!config || !blocks) {
    return (
      <div className="page">
        <NetBar />
        {config && !activity ? (
          <div className="card stack">
            <div className="section-title">找不到这一场活动</div>
            <Link className="btn btn--sm" to="/staff/admin">← 回总控台</Link>
          </div>
        ) : <div className="dim">正在载入…</div>}
      </div>
    );
  }

  return (
    <div className="page page--design">
      <NetBar />

      <div className="design__bar row" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn btn--sm btn--ghost" onClick={leave}>←</button>
        <input className="input grow" value={name} maxLength={20} placeholder="活动名"
          onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <span className="tiny dim" style={{ flex: '0 0 auto' }}>{blocks.length} 个块</span>
        <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty} onClick={save}>
          {busy === 'save' ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </div>

      <div className="design__body">

      {/* 纸 */}
      <div className="design__stage">
      <div
        ref={boxRef}
        onPointerDown={() => setSel(null)}
        style={{
          position: 'relative', width: '100%', aspectRatio: String(PAGE_ASPECT),
          border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden',
          marginBottom: 10, touchAction: 'none', background: '#000',
        }}
      >
        <VisaPageFrame theme={config.theme} activity={activity}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, containerType: 'size' }}>
            {blocks.map((b) => {
              const on = b.id === sel;
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => drag(e, b, 'move')}
                  style={{
                    position: 'absolute',
                    left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
                    transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
                    opacity: b.opacity ?? 1,
                    outline: on ? '2px solid var(--gold)' : '1px dashed rgba(120,120,120,.45)',
                    outlineOffset: 1, cursor: 'move', touchAction: 'none',
                  }}
                >
                  <BlockBody b={b} data={data} editing />
                  {on && (
                    <div
                      onPointerDown={(e) => drag(e, b, 'size')}
                      title="拖这里改大小"
                      style={{
                        position: 'absolute', right: -7, bottom: -7, width: 15, height: 15,
                        background: 'var(--gold)', border: '2px solid #000', borderRadius: 3,
                        cursor: 'nwse-resize', touchAction: 'none',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </VisaPageFrame>
      </div>

      {/* 快捷键：摆版式的时候手不离键盘 */}
      <div className="design__keys tiny dim" style={{ marginBottom: 10, lineHeight: 1.9 }}>
        <kbd>Del</kbd> 删掉 · <kbd>←↑→↓</kbd> 挪一点（<kbd>Shift</kbd> 挪一大步、
        <kbd>Alt</kbd> 改大小）· <kbd>[</kbd> <kbd>]</kbd> 调图层 ·
        <kbd>⌘D</kbd> 复制 · <kbd>⌘S</kbd> 保存 · <kbd>Esc</kbd> 取消选中
      </div>
      </div>

      <div className="design__side">

      {/* 加东西 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm btn--ghost grow" onClick={() => setAdding((v) => !v)}>
            {adding ? '收起' : '＋ 加一个块'}
          </button>
          <button className="btn btn--sm btn--ghost" onClick={clearAll} title="删光，剩一张白纸">清空</button>
          <button className="btn btn--sm btn--ghost" onClick={resetDefault} title="变回模版的样子">恢复默认</button>
        </div>
        {adding && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {PALETTE.map((pl) => (
              <button key={pl.kind} className="btn btn--sm btn--ghost" onClick={() => add(pl.kind)}>
                {pl.name}
              </button>
            ))}
          </div>
        )}
        <div className="tiny dim">
          这一页上除了页眉、水印、二维码和那个章，每一样都是一个块，都能挪能删 ——
          删光就是一张白页，想做成整页海报就该这样。
          栏目里填的是示例值（真页面上每个人不一样）；页面比例按常见竖屏手机取 1.9:1。
        </div>
      </div>

      {/* 选中块的属性 */}
      {selected ? (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>
              {KIND_NAME[selected.kind] || '块'}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, -1)} title="往下一层">⤓</button>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, 1)} title="往上一层">⤒</button>
              <button className="btn btn--sm btn--ghost" onClick={() => duplicate(selected)} title="复制一个">⧉</button>
              <button className="btn btn--sm btn--ghost" onClick={() => remove(selected.id)} title="删掉">✕</button>
            </div>
          </div>

          <Inspector
            b={selected} patch={(p) => patch(selected.id, p)} sources={sources}
            busy={busy} onPickImage={(f) => pickImage(f, selected.id)}
          />

          <Slider label="透明度" value={selected.opacity ?? 1} min={0.05} max={1} step={0.05}
            onChange={(v) => patch(selected.id, { opacity: v })} />
          <Slider label="旋转" value={selected.rot || 0} min={-180} max={180} step={1}
            onChange={(v) => patch(selected.id, { rot: v })} suffix="°" />

          {selected.kind !== 'links' && (
            <label className="stack-sm" style={{ gap: 3 }}>
              <div className="tiny dim">点它跳到哪 —— 相册、报名表、地图。留空就是不可点。</div>
              <input className="input" value={selected.href || ''} maxLength={300}
                placeholder="https://…" inputMode="url"
                onChange={(e) => patch(selected.id, { href: e.target.value })} />
            </label>
          )}

          <div className="row" style={{ gap: 6 }}>
            {[['x', '左'], ['y', '上'], ['w', '宽'], ['h', '高']].map(([k, lb]) => (
              <label key={k} className="stack-sm grow" style={{ gap: 3 }}>
                <div className="tiny dim">{lb} %</div>
                <input className="input" type="number" step="0.5" value={selected[k]}
                  onChange={(e) => patch(selected.id, { [k]: round(Number(e.target.value)) })} />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="tiny dim">
            {blocks.length === 0
              ? '这一页现在是空的。点「＋ 加一个块」往上摆东西。'
              : '点页面上的块选中它 —— 拖着移动，右下角的小方块改大小。'}
          </div>
          <Link className="btn btn--sm btn--ghost" to={`/staff/admin/a/${id}`}>
            这一场的其它设置（报名、配图、链接）→
          </Link>
        </div>
      )}

      </div>
      </div>
    </div>
  );
}

/** 每种块自己那几项 */
function Inspector({ b, patch, sources, busy, onPickImage }) {
  if (b.kind === 'banner') {
    return (
      <>
        <div className="tiny dim">横框左边那个词，和右边深色块上那两行字。</div>
        <input className="input" value={b.word} maxLength={16} placeholder="VISA"
          onChange={(e) => patch({ word: e.target.value })} />
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" value={b.brand} maxLength={24} placeholder="MINI LIFE GAME"
            onChange={(e) => patch({ brand: e.target.value })} />
          <input className="input grow" value={b.brandCn} maxLength={16} placeholder="中文副题（可留空）"
            onChange={(e) => patch({ brandCn: e.target.value })} />
        </div>
      </>
    );
  }

  if (b.kind === 'fields') {
    return (
      <>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div className="tiny dim grow">
            这一片栏目。「固定文字」是同工填的死字，其余按人算 ——
            姓名、编号、来没来过每个人不一样。
          </div>
          <label className="stack-sm" style={{ gap: 3, flex: '0 0 auto' }}>
            <div className="tiny dim">列数</div>
            <input className="input" type="number" min="1" max="4" style={{ width: 60 }}
              value={b.cols || 2} onChange={(e) => patch({ cols: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
        </div>
        <RowEditor
          dense rows={b.rows || []} sources={sources}
          ops={{
            edit: (i, p) => patch({ rows: b.rows.map((r, k) => (k === i ? { ...r, ...p } : r)) }),
            move: (i, d) => { const n = [...b.rows]; [n[i], n[i + d]] = [n[i + d], n[i]]; patch({ rows: n }); },
            remove: (i) => patch({ rows: b.rows.filter((_, k) => k !== i) }),
            add: () => patch({ rows: [...(b.rows || []), { key: `r${Date.now().toString(36)}`, label: '', src: 'text', text: '', accent: false }] }),
          }}
        />
      </>
    );
  }

  if (b.kind === 'station' || b.kind === 'note') {
    return (
      <>
        <div className="tiny dim">
          小标题（留空就不印）。下面的内容来自活动的
          {b.kind === 'station' ? '名字' : '说明'}，在活动详情页里改。
        </div>
        <input className="input" value={b.label || ''} maxLength={30}
          placeholder={b.kind === 'station' ? 'STATION 关卡' : 'ANNOTATION 备注'}
          onChange={(e) => patch({ label: e.target.value })} />
      </>
    );
  }

  if (b.kind === 'photo') {
    return (
      <>
        <div className="tiny dim">这一场的配图，在活动详情页里换。</div>
        <select className="input" value={b.fit} onChange={(e) => patch({ fit: e.target.value })}>
          <option value="cover">铺满（会裁掉边）</option>
          <option value="contain">完整显示（会留白）</option>
        </select>
      </>
    );
  }

  if (b.kind === 'links') {
    return <div className="tiny dim">这一场的页面链接，在活动详情页里加。这里只管它摆在哪。</div>;
  }

  if (b.kind === 'mrz') {
    return <div className="tiny dim">护照底下那两行机读区，内容按人算，不用填。</div>;
  }

  if (b.kind === 'image') {
    return (
      <>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
            {busy === 'img' ? '上传中…' : b.src ? '换一张' : '选一张图'}
            <input type="file" accept="image/*" hidden disabled={busy === 'img'}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPickImage(f); }} />
          </label>
          <select className="input grow" value={b.fit} onChange={(e) => patch({ fit: e.target.value })}>
            <option value="cover">铺满（会裁掉边）</option>
            <option value="contain">完整显示（会留白）</option>
          </select>
        </div>
        <Slider label="圆角" value={b.radius || 0} min={0} max={50} step={1}
          onChange={(v) => patch({ radius: v })} suffix="%" />
      </>
    );
  }

  return (
    <>
      <textarea className="input" rows={3} value={b.text} maxLength={400} placeholder="写点什么"
        onChange={(e) => patch({ text: e.target.value })} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" style={{ flex: '1 1 90px' }} value={b.font}
          onChange={(e) => patch({ font: e.target.value })}>
          <option value="sans">黑体</option>
          <option value="serif">衬线</option>
          <option value="mono">等宽</option>
        </select>
        <select className="input" style={{ flex: '1 1 80px' }} value={b.align}
          onChange={(e) => patch({ align: e.target.value })}>
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
        <label className="tiny row" style={{ gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
          <input type="checkbox" checked={!!b.bold} onChange={(e) => patch({ bold: e.target.checked })} />
          加粗
        </label>
        <label className="tiny row" style={{ gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
          颜色
          <input type="color" value={b.color || '#2a2320'}
            onChange={(e) => patch({ color: e.target.value })}
            style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--line)', background: 'none' }} />
        </label>
        {b.color && <button className="btn btn--sm btn--ghost" onClick={() => patch({ color: '' })}>跟随模版</button>}
      </div>
      <Slider label="字号" value={b.size} min={1} max={16} step={0.2}
        onChange={(v) => patch({ size: v })} suffix="% 页高" />
      <Slider label="行距" value={b.lh} min={0.9} max={3} step={0.1}
        onChange={(v) => patch({ lh: v })} />
    </>
  );
}

function Slider({ label, value, min, max, step, onChange, suffix = '' }) {
  return (
    <label className="stack-sm" style={{ gap: 3 }}>
      <div className="tiny dim">{label} <b>{value}</b>{suffix}</div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
}
