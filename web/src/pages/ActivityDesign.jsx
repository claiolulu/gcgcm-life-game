import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { NetBar, useToast, useConfirm } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';
import VisaPageMock, { MOCK_ASPECT } from './book/VisaPageMock.jsx';
import { CanvasItem } from './book/VisaCanvas.jsx';

/**
 * 签证页的画布编辑器。
 *
 * 底稿是这一页本来的样子（签证页模版渲染出来的），上面这一层是自由画布 ——
 * 拖一段字、贴一张图，都可以挂链接。所见即所得靠的是：画布元素在这里和在
 * 真护照上是同一个组件（CanvasItem）、同一套单位（百分比 + cqh）。
 *
 * 底稿是「像」，画布是「一模一样」。所以底稿里的栏目填的是示例值，
 * 而同工摆上去的东西，位置和大小是精确的。
 */

const round = (n) => Math.round(n * 10) / 10;

export default function ActivityDesign() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;

  const boxRef = useRef(null);
  const [items, setItems] = useState(null);      // null = 还没载入
  const [name, setName] = useState('');
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);

  const activities = config?.activities || [];
  const activity = activities.find((a) => a.id === id);

  useEffect(() => {
    if (dirty || !activity) return;
    setItems((activity.canvas || []).map((el) => ({ ...el })));
    setName(activity.name || '');
  }, [activity, dirty]);

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  const selected = useMemo(() => (items || []).find((el) => el.id === sel) || null, [items, sel]);

  /* --------------------------- 增删改 --------------------------- */

  const patch = (elId, p) => {
    setItems((cur) => cur.map((el) => (el.id === elId ? { ...el, ...p } : el)));
    setDirty(true);
  };

  function add(el) {
    const made = { id: `el${Date.now().toString(36)}`, rot: 0, href: '', opacity: 1, ...el };
    setItems((cur) => [...cur, made]);
    setSel(made.id);
    setDirty(true);
    return made;
  }

  const addText = () => add({
    type: 'text', x: 8, y: 30, w: 40, h: 14,
    text: '写点什么', size: 4, color: '', font: 'sans', align: 'left', bold: false, lh: 1.5,
  });

  async function addImage(file) {
    if (!file) return;
    setBusy('img');
    try {
      const res = await uploadPhoto(file, token);
      add({ type: 'image', x: 10, y: 25, w: 30, h: 34, src: res.url, fit: 'cover', radius: 0 });
      toast(`图已上传（${Math.round(res.bytes / 1024)}KB）`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function replaceImage(file) {
    if (!file || !selected) return;
    setBusy('img');
    try {
      const res = await uploadPhoto(file, token);
      patch(selected.id, { src: res.url });
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const remove = (elId) => {
    setItems((cur) => cur.filter((el) => el.id !== elId));
    setSel(null);
    setDirty(true);
  };

  const duplicate = (el) => add({ ...el, id: undefined, x: round(el.x + 3), y: round(el.y + 3) });

  /** 图层顺序就是数组顺序：后面的画在上面 */
  const layer = (elId, dir) => {
    setItems((cur) => {
      const i = cur.findIndex((el) => el.id === elId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  /* --------------------------- 拖动 --------------------------- */

  /**
   * 移动和缩放共用一套：按下时记住起点，之后把像素位移换算成百分比。
   *
   * 监听挂在 window 上而不是元素上 —— 手指快速滑动时指针经常跑到元素外面，
   * 挂在元素上会中途断掉，拖着拖着就停住了。
   */
  function drag(e, el, mode) {
    e.preventDefault();
    e.stopPropagation();
    setSel(el.id);
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const s = { px: e.clientX, py: e.clientY, x: el.x, y: el.y, w: el.w, h: el.h };

    const move = (ev) => {
      const dx = ((ev.clientX - s.px) / box.width) * 100;
      const dy = ((ev.clientY - s.py) / box.height) * 100;
      if (mode === 'move') patch(el.id, { x: round(s.x + dx), y: round(s.y + dy) });
      else patch(el.id, { w: Math.max(2, round(s.w + dx)), h: Math.max(2, round(s.h + dy)) });
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

  /* --------------------------- 保存 --------------------------- */

  async function save() {
    setBusy('save');
    try {
      const list = activities.map((a) => (
        a.id === id ? { ...a, canvas: items, name: name.trim() || a.name } : a
      ));
      const res = await api('/api/admin/activities', { method: 'POST', body: { activities: list }, token });
      setDirty(false);
      const made = res.activities.find((a) => a.id === id);
      if (made) setItems((made.canvas || []).map((el) => ({ ...el })));
      await loadConfig();
      toast('已保存，所有人的护照上都能看到了', 'ok');
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

  if (!config || !items) {
    return (
      <div className="page">
        <NetBar />
        {config && !activity
          ? (
            <div className="card stack">
              <div className="section-title">找不到这一场活动</div>
              <Link className="btn btn--sm" to="/staff/admin">← 回总控台</Link>
            </div>
          )
          : <div className="dim">正在载入…</div>}
      </div>
    );
  }

  return (
    <div className="page">
      <NetBar />

      <div className="row" style={{ gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <button className="btn btn--sm btn--ghost" onClick={leave}>←</button>
        <input
          className="input grow" value={name} maxLength={20} placeholder="活动名"
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
        />
        <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty} onClick={save}>
          {busy === 'save' ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </div>

      {/* 画布 */}
      <div
        ref={boxRef}
        onPointerDown={() => setSel(null)}
        style={{
          position: 'relative', width: '100%', aspectRatio: String(MOCK_ASPECT),
          border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden',
          marginBottom: 10, touchAction: 'none', background: '#000',
        }}
      >
        <VisaPageMock theme={config.theme} template={config.visaTemplate} activity={activity}>
        {/* 画布层：和真护照上是同一个组件、同一套单位，连层叠位置也一样 ——
            塞在底稿的插槽里，所以水印压得住、正文和章压不住 */}
        <div style={{ position: 'absolute', inset: 0, containerType: 'size' }}>
          {items.map((el) => {
            const on = el.id === sel;
            return (
              <div
                key={el.id}
                onPointerDown={(e) => drag(e, el, 'move')}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
                  transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
                  outline: on ? '2px solid var(--gold)' : '1px dashed rgba(255,255,255,.35)',
                  outlineOffset: 1, cursor: 'move', touchAction: 'none',
                }}
              >
                {/* 空图框在真页面上什么都不画，编辑器里得看得见才好摆 */}
                {el.type === 'image' && !el.src ? (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: 'rgba(255,255,255,.12)',
                    color: '#fff', fontSize: 11,
                  }}>还没选图</div>
                ) : (
                  <CanvasItem el={el} />
                )}

                {on && (
                  <div
                    onPointerDown={(e) => drag(e, el, 'size')}
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
        </VisaPageMock>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className="btn btn--sm btn--ghost grow" onClick={addText}>＋ 文字</button>
        <label className="btn btn--sm btn--ghost grow" style={{ cursor: 'pointer' }}>
          {busy === 'img' ? '上传中…' : '＋ 图片'}
          <input type="file" accept="image/*" hidden disabled={busy === 'img'}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; addImage(f); }} />
        </label>
      </div>

      <div className="tiny dim" style={{ marginBottom: 12 }}>
        底稿是这一页本来的样子，栏目里填的是示例值（真页面上每个人不一样）。
        你摆上去的字和图，位置大小是精确的。页面比例按常见竖屏手机取 1.9:1，
        特别长或特别方的屏幕上会有些出入。
      </div>

      {/* 选中元素的属性 */}
      {selected ? (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>
              {selected.type === 'image' ? '🖼 图片' : '🅣 文字'}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, -1)} title="往下一层">⤓</button>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, 1)} title="往上一层">⤒</button>
              <button className="btn btn--sm btn--ghost" onClick={() => duplicate(selected)} title="复制一个">⧉</button>
              <button className="btn btn--sm btn--ghost" onClick={() => remove(selected.id)} title="删掉">✕</button>
            </div>
          </div>

          {selected.type === 'text' ? (
            <>
              <textarea
                className="input" rows={3} value={selected.text} maxLength={400}
                placeholder="写点什么"
                onChange={(e) => patch(selected.id, { text: e.target.value })}
              />
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="input" style={{ flex: '1 1 90px' }} value={selected.font}
                  onChange={(e) => patch(selected.id, { font: e.target.value })}>
                  <option value="sans">黑体</option>
                  <option value="serif">衬线</option>
                  <option value="mono">等宽</option>
                </select>
                <select className="input" style={{ flex: '1 1 80px' }} value={selected.align}
                  onChange={(e) => patch(selected.id, { align: e.target.value })}>
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                </select>
                <label className="tiny row" style={{ gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                  <input type="checkbox" checked={!!selected.bold}
                    onChange={(e) => patch(selected.id, { bold: e.target.checked })} />
                  加粗
                </label>
                <label className="tiny row" style={{ gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
                  颜色
                  <input type="color" value={selected.color || '#2a2320'}
                    onChange={(e) => patch(selected.id, { color: e.target.value })}
                    style={{ width: 30, height: 24, padding: 0, border: '1px solid var(--line)', background: 'none' }} />
                </label>
                {selected.color && (
                  <button className="btn btn--sm btn--ghost" onClick={() => patch(selected.id, { color: '' })}>
                    跟随模版
                  </button>
                )}
              </div>
              <Slider label="字号" value={selected.size} min={1} max={16} step={0.2}
                onChange={(v) => patch(selected.id, { size: v })} suffix="% 页高" />
              <Slider label="行距" value={selected.lh} min={0.9} max={3} step={0.1}
                onChange={(v) => patch(selected.id, { lh: v })} />
            </>
          ) : (
            <>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
                  {busy === 'img' ? '上传中…' : '换一张'}
                  <input type="file" accept="image/*" hidden disabled={busy === 'img'}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; replaceImage(f); }} />
                </label>
                <select className="input grow" value={selected.fit}
                  onChange={(e) => patch(selected.id, { fit: e.target.value })}>
                  <option value="cover">铺满（会裁掉边）</option>
                  <option value="contain">完整显示（会留白）</option>
                </select>
              </div>
              <Slider label="圆角" value={selected.radius} min={0} max={50} step={1}
                onChange={(v) => patch(selected.id, { radius: v })} suffix="%" />
            </>
          )}

          <Slider label="透明度" value={selected.opacity ?? 1} min={0.05} max={1} step={0.05}
            onChange={(v) => patch(selected.id, { opacity: v })} />
          <Slider label="旋转" value={selected.rot || 0} min={-180} max={180} step={1}
            onChange={(v) => patch(selected.id, { rot: v })} suffix="°" />

          <label className="stack-sm" style={{ gap: 3 }}>
            <div className="tiny dim">
              点它跳到哪 —— 相册、报名表、地图。留空就是不可点。
            </div>
            <input className="input" value={selected.href || ''} maxLength={300}
              placeholder="https://…" inputMode="url"
              onChange={(e) => patch(selected.id, { href: e.target.value })} />
          </label>

          <div className="row" style={{ gap: 6 }}>
            {[['x', '左'], ['y', '上'], ['w', '宽'], ['h', '高']].map(([k, label]) => (
              <label key={k} className="stack-sm grow" style={{ gap: 3 }}>
                <div className="tiny dim">{label} %</div>
                <input className="input" type="number" step="0.5" value={selected[k]}
                  onChange={(e) => patch(selected.id, { [k]: round(Number(e.target.value)) })} />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="tiny dim">
            {items.length === 0
              ? '这一页还是空的。点上面的「＋ 文字」或「＋ 图片」往上摆东西 —— 拖着移动，右下角的小方块改大小。'
              : '点画布上的元素选中它，就能改内容、颜色、链接。'}
          </div>
          <Link className="btn btn--sm btn--ghost" to={`/staff/admin/a/${id}`}>
            这一场的其它设置（报名、配图、栏目）→
          </Link>
        </div>
      )}
    </div>
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
