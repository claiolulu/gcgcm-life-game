import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import ImeInput from '../components/ImeInput.jsx';
import { useToast, useConfirm } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';
import VisaPageFrame, { PAGE_ASPECT } from './book/VisaPageFrame.jsx';
import { BlockBody, PassportMrz } from './book/VisaBlocks.jsx';
import { resolveBlocks, blockData, bannerBrandOf } from './book/bookVals.js';

/**
 * 签证页的版式编辑器。
 *
 * 这一页上除了页眉、水印、二维码和那个章，每一样都是一个块 —— VISA 横框、
 * 签发站那片栏目、活动名、备注、配图、页面链接、机读区，加上同工自己摆的
 * 字和图。都能挪、能改大小、能转、能删。机读 footer 属于护照固定模板。
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
  { kind: 'banner',  name: 'VISA 横框', make: (t) => ({ x: 4, y: 12.5, w: 92, h: 11, word: t.banner, ...t.brand }) },
  { kind: 'fields',  name: '栏目',     make: (t) => ({ x: 4.5, y: 27, w: 52, h: 62, cols: 2, rows: t.rows }) },
  { kind: 'station', name: '活动名',   make: (t) => ({ x: 60, y: 27, w: 36, h: 16, label: t.stationLabel }) },
  { kind: 'note',    name: '备注',     make: (t) => ({ x: 60, y: 47, w: 36, h: 30, label: t.annotationLabel }) },
  { kind: 'photo',   name: '配图',     make: () => ({ x: 60, y: 27, w: 36, h: 21, fit: 'cover' }) },
  { kind: 'links',   name: '页面链接', make: () => ({ x: 4.5, y: 80, w: 52, h: 8 }) },
];

const KIND_NAME = Object.fromEntries(PALETTE.map((p) => [p.kind, p.name]));

/** 编辑器里用的示例数据。真页面上这些每个人都不一样。 */
function sampleData(activity, theme) {
  return blockData({
    station: activity, theme,
    me: { name: '林小满', code: '01', contact: 'wx: xiaoman' },
    passportNo: 'GCGCM000001',
    surname: '林', given: '小满',
    visaScore: null, isCheckin: false, stampTone: '',
    stampDate: '2026-09-13', doneCount: 3, signed: true,
  });
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const localId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function nearestSnap(raw, candidates, tolerance) {
  let best = null;
  for (const candidate of candidates) {
    const distance = Math.abs(raw - candidate.value);
    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { ...candidate, distance };
    }
  }
  return best;
}

function moveSnapCandidates(block, others, axis) {
  const pos = axis === 'x' ? 'x' : 'y';
  const sizeKey = axis === 'x' ? 'w' : 'h';
  const size = Number(block[sizeKey]) || 0;
  const candidates = [
    { value: 0, guide: 0 },
    { value: 4, guide: 4 },
    { value: 50 - size / 2, guide: 50 },
    { value: 96 - size, guide: 96 },
    { value: 100 - size, guide: 100 },
  ];
  for (const other of others) {
    const start = Number(other[pos]) || 0;
    const otherSize = Number(other[sizeKey]) || 0;
    const center = start + otherSize / 2;
    const end = start + otherSize;
    candidates.push(
      { value: start, guide: start },
      { value: center - size / 2, guide: center },
      { value: end - size, guide: end },
      { value: end, guide: end },
      { value: start - size, guide: start },
    );
  }
  return candidates;
}

function edgeSnapCandidates(others, axis) {
  const pos = axis === 'x' ? 'x' : 'y';
  const sizeKey = axis === 'x' ? 'w' : 'h';
  const candidates = [0, 4, 50, 96, 100].map((value) => ({ value, guide: value }));
  for (const other of others) {
    const start = Number(other[pos]) || 0;
    const size = Number(other[sizeKey]) || 0;
    candidates.push(
      { value: start, guide: start },
      { value: start + size / 2, guide: start + size / 2 },
      { value: start + size, guide: start + size },
    );
  }
  return candidates;
}

function newExtraPage(kind, index) {
  const stamp = localId('').slice(0, 20);
  const isPhoto = kind === 'photo';
  return {
    id: `p${stamp}`,
    kind,
    title: isPhoto ? `照片页 ${index}` : `活动总结 ${index}`,
    blocks: isPhoto ? [
      { id: `t${stamp}`, kind: 'text', x: 6, y: 15, w: 88, h: 9, rot: 0, opacity: 1,
        text: '活动照片', size: 5.2, color: '', font: 'serif', align: 'center', bold: true, lh: 1.2, href: '' },
      { id: `i${stamp}`, kind: 'image', x: 8, y: 27, w: 84, h: 58, rot: 0, opacity: 1,
        src: '', fit: 'contain', radius: 0, href: '' },
    ] : [
      { id: `t${stamp}`, kind: 'text', x: 7, y: 16, w: 86, h: 10, rot: 0, opacity: 1,
        text: '活动总结', size: 5.4, color: '', font: 'serif', align: 'center', bold: true, lh: 1.2, href: '' },
      { id: `b${stamp}`, kind: 'text', x: 10, y: 30, w: 80, h: 52, rot: 0, opacity: 1,
        text: '在这里写下活动回顾、参与者感想或下一步安排。', size: 3.6, color: '', font: 'sans', align: 'left', bold: false, lh: 1.75, href: '' },
    ],
  };
}

function editorPages(config, activity) {
  return [
    { id: 'info', kind: 'info', title: '活动信息',
      blocks: resolveBlocks(config?.visaTemplate, activity, config?.theme).map(clone) },
    ...(activity?.extraPages || []).map((p) => ({ ...clone(p), blocks: (p.blocks || []).map(clone) })),
  ];
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
  const [designPages, setDesignPages] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [name, setName] = useState('');
  const [activityFields, setActivityFields] = useState({ en: '', issuer: '', desc: '' });
  const [sel, setSel] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inlineText, setInlineText] = useState(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null });
  const [canvasView, setCanvasView] = useState({ scale: 1, x: 0, y: 0 });
  const blocksRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const canvasViewRef = useRef(canvasView);
  const gestureRef = useRef({ points: new Map(), start: null, pinching: false, suppressUntil: 0 });
  const pagesRef = useRef(null);
  const pageIndexRef = useRef(0);
  const nameRef = useRef('');
  const activityFieldsRef = useRef(activityFields);
  const historyRef = useRef({ past: [], future: [] });
  const [, refreshHistory] = useState(0);
  const blocks = designPages?.[pageIndex]?.blocks ?? null;
  blocksRef.current = blocks;
  pagesRef.current = designPages;
  pageIndexRef.current = pageIndex;
  nameRef.current = name;
  activityFieldsRef.current = activityFields;
  canvasViewRef.current = canvasView;

  const setBlocks = (value) => {
    setDesignPages((cur) => {
      if (!cur?.[pageIndexRef.current]) return cur;
      const old = cur[pageIndexRef.current].blocks || [];
      const nextBlocks = typeof value === 'function' ? value(old) : value;
      const next = cur.map((p, i) => (i === pageIndexRef.current ? { ...p, blocks: nextBlocks } : p));
      pagesRef.current = next;
      blocksRef.current = nextBlocks;
      return next;
    });
  };

  const activities = config?.activities || [];
  const activity = activities.find((a) => a.id === id);
  const tpl = config?.visaTemplate || {};
  const sources = config?.visaSources || [];

  useEffect(() => {
    if (dirty || !activity) return;
    const next = editorPages(config, activity);
    const activeId = pagesRef.current?.[pageIndexRef.current]?.id;
    const keepIndex = activeId ? next.findIndex((p) => p.id === activeId) : 0;
    const nextIndex = keepIndex >= 0 ? keepIndex : 0;
    setDesignPages(next);
    pagesRef.current = next;
    setPageIndex(nextIndex);
    pageIndexRef.current = nextIndex;
    blocksRef.current = next[nextIndex]?.blocks || [];
    setName(activity.name || '');
    nameRef.current = activity.name || '';
    const nextFields = {
      en: activity.en || '',
      issuer: activity.issuer || '',
      desc: activity.desc || activity.rule || '',
    };
    setActivityFields(nextFields);
    activityFieldsRef.current = nextFields;
  }, [activity, config, dirty]);

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  useEffect(() => {
    historyRef.current = { past: [], future: [] };
    refreshHistory((n) => n + 1);
  }, [id]);

  useEffect(() => {
    if (!inlineText) return;
    const editor = document.querySelector(`[data-inline-editor="${inlineText}"]`);
    editor?.focus({ preventScroll: true });
  }, [inlineText]);

  useEffect(() => {
    document.documentElement.classList.toggle('design-fullscreen', canvasFullscreen);
    const syncNativeFullscreen = () => {
      if (!document.fullscreenElement && canvasFullscreen) setCanvasFullscreen(false);
    };
    document.addEventListener('fullscreenchange', syncNativeFullscreen);
    return () => {
      document.documentElement.classList.remove('design-fullscreen');
      document.removeEventListener('fullscreenchange', syncNativeFullscreen);
    };
  }, [canvasFullscreen]);

  useEffect(() => {
    setCanvasView({ scale: 1, x: 0, y: 0 });
    gestureRef.current = { points: new Map(), start: null, pinching: false, suppressUntil: 0 };
  }, [pageIndex, canvasFullscreen]);

  const workingActivity = useMemo(() => activity ? {
    ...activity,
    ...activityFields,
    name,
  } : activity, [activity, activityFields, name]);
  const data = useMemo(() => sampleData(workingActivity, config?.theme), [workingActivity, config]);
  const selected = useMemo(() => (blocks || []).find((b) => b.id === sel) || null, [blocks, sel]);

  /* --------------------------- 增删改 --------------------------- */

  const snapshot = () => ({
    pages: clone(pagesRef.current || []),
    pageIndex: pageIndexRef.current,
    name: nameRef.current,
    activityFields: clone(activityFieldsRef.current),
  });

  const checkpoint = () => {
    const h = historyRef.current;
    h.past.push(snapshot());
    if (h.past.length > 80) h.past.shift();
    h.future = [];
    refreshHistory((n) => n + 1);
  };

  const restoreSnapshot = (s) => {
    const nextPages = clone(s.pages);
    const nextIndex = Math.min(s.pageIndex || 0, Math.max(0, nextPages.length - 1));
    pagesRef.current = nextPages;
    pageIndexRef.current = nextIndex;
    blocksRef.current = nextPages[nextIndex]?.blocks || [];
    nameRef.current = s.name;
    activityFieldsRef.current = clone(s.activityFields || { en: '', issuer: '', desc: '' });
    setDesignPages(nextPages);
    setPageIndex(nextIndex);
    setName(s.name);
    setActivityFields(activityFieldsRef.current);
    setSel(null);
    setInlineText(null);
    setInspectorOpen(false);
    setDirty(true);
  };

  function undo() {
    const h = historyRef.current;
    if (!h.past.length) return;
    h.future.push(snapshot());
    restoreSnapshot(h.past.pop());
    refreshHistory((n) => n + 1);
  }

  function redo() {
    const h = historyRef.current;
    if (!h.future.length) return;
    h.past.push(snapshot());
    restoreSnapshot(h.future.pop());
    refreshHistory((n) => n + 1);
  }

  const patch = (bid, p, { record = true } = {}) => {
    if (record) checkpoint();
    setBlocks((cur) => {
      const next = cur.map((b) => (b.id === bid ? { ...b, ...p } : b));
      blocksRef.current = next;
      return next;
    });
    setDirty(true);
  };

  const patchActivity = (values) => {
    checkpoint();
    setActivityFields((cur) => {
      const next = { ...cur, ...values };
      activityFieldsRef.current = next;
      return next;
    });
    if (Object.prototype.hasOwnProperty.call(values, 'name')) {
      const nextName = values.name;
      nameRef.current = nextName;
      setName(nextName);
    }
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
    checkpoint();
    setBlocks((cur) => {
      const next = cur.map((b) => (b.id === bid ? { ...b, ...fn(b) } : b));
      blocksRef.current = next;
      return next;
    });
    setDirty(true);
  };

  function add(kind) {
    checkpoint();
    const def = PALETTE.find((p) => p.kind === kind);
    const made = {
      id: `b${Date.now().toString(36)}`, kind, rot: 0, opacity: 1, href: '',
      ...def.make({ banner: tpl.banner || 'VISA', rows: tpl.rows || [],
                    brand: bannerBrandOf(workingActivity),
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

  function selectPage(index) {
    if (!designPages?.[index]) return;
    pageIndexRef.current = index;
    blocksRef.current = designPages[index].blocks || [];
    setPageIndex(index);
    setSel(null);
    setInlineText(null);
    setInspectorOpen(false);
  }

  function addPage(kind) {
    checkpoint();
    const made = newExtraPage(kind, (designPages?.length || 1));
    setDesignPages((cur) => {
      const next = [...cur, made];
      pagesRef.current = next;
      return next;
    });
    const nextIndex = designPages.length;
    pageIndexRef.current = nextIndex;
    blocksRef.current = made.blocks;
    setPageIndex(nextIndex);
    setSel(null);
    setDirty(true);
  }

  async function deletePage() {
    if (pageIndex === 0) return;
    const page = designPages[pageIndex];
    if (!(await ask({
      title: `删除「${page.title}」？`, danger: true, confirmText: '删除这一页',
      body: '这一页上的所有文字和图片块都会移除。参与者素材库中的原始投稿不会删除。',
    }))) return;
    checkpoint();
    const next = designPages.filter((_, i) => i !== pageIndex);
    const nextIndex = Math.max(0, pageIndex - 1);
    pagesRef.current = next;
    pageIndexRef.current = nextIndex;
    blocksRef.current = next[nextIndex]?.blocks || [];
    setDesignPages(next);
    setPageIndex(nextIndex);
    setSel(null);
    setDirty(true);
  }

  function movePage(dir) {
    const to = pageIndex + dir;
    if (pageIndex === 0 || to < 1 || to >= designPages.length) return;
    checkpoint();
    const next = [...designPages];
    [next[pageIndex], next[to]] = [next[to], next[pageIndex]];
    pagesRef.current = next;
    pageIndexRef.current = to;
    blocksRef.current = next[to].blocks || [];
    setDesignPages(next);
    setPageIndex(to);
    setDirty(true);
  }

  function renamePage(title) {
    if (pageIndex === 0) return;
    setDesignPages((cur) => {
      const next = cur.map((p, i) => (i === pageIndex ? { ...p, title } : p));
      pagesRef.current = next;
      return next;
    });
    setDirty(true);
  }

  async function openMaterials() {
    setMaterialsOpen(true);
    setMaterialsLoading(true);
    try {
      const res = await api(`/api/admin/activity/${id}/materials`, { token });
      setMaterials(res.materials || []);
    } catch (err) {
      toast(err.message || '参与者素材读取失败', 'err');
    } finally {
      setMaterialsLoading(false);
    }
  }

  function addMaterial(material, at = null) {
    checkpoint();
    const isImage = material.kind === 'image';
    let made = {
      id: `m${Date.now().toString(36)}`, kind: isImage ? 'image' : 'text',
      x: round(at?.x ?? (isImage ? 12 : 10)), y: round(at?.y ?? (isImage ? 27 : 30)),
      w: isImage ? 42 : 55, h: isImage ? 48 : 24,
      rot: 0, opacity: 1, href: '',
      ...(isImage
        ? { src: material.content, fit: 'cover', radius: 0 }
        : { text: material.content, size: 3.5, color: '', font: 'sans', align: 'left', bold: false, lh: 1.6 }),
    };
    // 新建照片页/总结页自带一个占位块。第一次放参与者素材时直接替换它，
    // 不然两段文字（或空图片框）会精确叠在一起，看上去像坏掉了。
    const page = pagesRef.current?.[pageIndexRef.current];
    const placeholder = !at && page?.kind === 'photo' && isImage
      ? (page.blocks || []).find((b) => b.kind === 'image' && !b.src)
      : !at && page?.kind === 'summary' && !isImage
        ? (page.blocks || []).find((b) => b.kind === 'text'
          && String(b.text || '').startsWith('在这里写下活动回顾'))
        : null;
    if (placeholder) {
      made = { ...made, x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h };
      setBlocks((cur) => cur.map((b) => (b.id === placeholder.id ? made : b)));
    } else {
      setBlocks((cur) => [...cur, made]);
    }
    setSel(made.id);
    setDirty(true);
    setMaterialsOpen(false);
    toast(`已把 ${material.player?.name || '参与者'} 的${isImage ? '照片' : '文字'}放到当前页`, 'ok');
  }

  function dropMaterial(e) {
    e.preventDefault();
    let material;
    try { material = JSON.parse(e.dataTransfer.getData('application/x-activity-material')); }
    catch { return; }
    if (!material?.kind) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return addMaterial(material);
    addMaterial(material, {
      x: Math.max(0, Math.min(92, ((e.clientX - box.left) / box.width) * 100 - 10)),
      y: Math.max(12, Math.min(82, ((e.clientY - box.top) / box.height) * 100 - 8)),
    });
  }

  const remove = (bid) => {
    checkpoint();
    setBlocks((cur) => cur.filter((b) => b.id !== bid));
    setSel(null);
    setDirty(true);
  };

  function duplicate(b) {
    checkpoint();
    const made = { ...JSON.parse(JSON.stringify(b)), id: `b${Date.now().toString(36)}`,
                   x: round(b.x + 3), y: round(b.y + 3) };
    setBlocks((cur) => [...cur, made]);
    setSel(made.id);
    setDirty(true);
  }

  /** 图层顺序就是数组顺序：后面的画在上面 */
  const layer = (bid, dir) => {
    checkpoint();
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
      title: `把「${designPages[pageIndex]?.title || '这一页'}」清空？`, danger: true, confirmText: '清空',
      body: '所有块都删掉，剩一张白纸 —— 想做成整页海报就该这样。之后还能一样样加回来。',
    }))) return;
    checkpoint();
    setBlocks([]);
    setSel(null);
    setDirty(true);
  }

  async function resetDefault() {
    if (!(await ask({
      title: '恢复默认版式？', danger: true, confirmText: '恢复',
      body: '这一页会变回初始版式，你摆的东西全丢掉。',
    }))) return;
    checkpoint();
    const nextBlocks = pageIndex === 0
      ? resolveBlocks(config?.visaTemplate, { ...workingActivity, blocks: undefined }, config?.theme).map(clone)
      : newExtraPage(designPages[pageIndex].kind, pageIndex).blocks;
    setBlocks(nextBlocks);
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
    setInspectorOpen(false);
    if (mode !== 'text') setInlineText(null);
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const s = { px: e.clientX, py: e.clientY, x: b.x, y: b.y, w: b.w, h: b.h };
    const others = (blocksRef.current || []).filter((item) => item.id !== b.id);
    const toleranceX = ((e.pointerType === 'touch' ? 11 : 7) / box.width) * 100;
    const toleranceY = ((e.pointerType === 'touch' ? 11 : 7) / box.height) * 100;
    let changed = false;

    const move = (ev) => {
      if (!changed) { checkpoint(); changed = true; }
      const dx = ((ev.clientX - s.px) / box.width) * 100;
      const dy = ((ev.clientY - s.py) / box.height) * 100;
      if (mode === 'move') {
        let x = s.x + dx;
        let y = s.y + dy;
        const sx = snapEnabled ? nearestSnap(x, moveSnapCandidates(b, others, 'x'), toleranceX) : null;
        const sy = snapEnabled ? nearestSnap(y, moveSnapCandidates(b, others, 'y'), toleranceY) : null;
        if (sx) x = sx.value;
        if (sy) y = sy.value;
        setSnapGuides({ x: sx?.guide ?? null, y: sy?.guide ?? null });
        patch(b.id, { x: round(x), y: round(y) }, { record: false });
      } else {
        let w = Math.max(2, s.w + dx);
        let h = Math.max(2, s.h + dy);
        const sx = snapEnabled ? nearestSnap(s.x + w, edgeSnapCandidates(others, 'x'), toleranceX) : null;
        const sy = snapEnabled ? nearestSnap(s.y + h, edgeSnapCandidates(others, 'y'), toleranceY) : null;
        if (sx && sx.value - s.x >= 2) w = sx.value - s.x;
        if (sy && sy.value - s.y >= 2) h = sy.value - s.y;
        setSnapGuides({ x: sx?.guide ?? null, y: sy?.guide ?? null });
        patch(b.id, { w: round(w), h: round(h) }, { record: false });
      }
    };
    const up = () => {
      setSnapGuides({ x: null, y: null });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /**
   * 所有块都支持「轻点编辑、拖动移动」。等指针真的走过几像素才判定
   * 为拖动，避免用户想编辑正文时区块先跳一下。
   */
  function blockTouch(e, b) {
    e.preventDefault();
    e.stopPropagation();
    const gesture = gestureRef.current;
    if (e.pointerType === 'touch' && gesture.points.size > 1) return;
    if (e.pointerType !== 'touch') setSel(b.id);
    setInspectorOpen(false);
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const s = { px: e.clientX, py: e.clientY, x: b.x, y: b.y };
    const others = (blocksRef.current || []).filter((item) => item.id !== b.id);
    const toleranceX = ((e.pointerType === 'touch' ? 11 : 7) / box.width) * 100;
    const toleranceY = ((e.pointerType === 'touch' ? 11 : 7) / box.height) * 100;
    const moveThreshold = e.pointerType === 'touch' ? 12 : 5;
    let moved = false;
    let cancelled = false;

    const move = (ev) => {
      if (gestureRef.current.pinching || gestureRef.current.points.size > 1) {
        cancelled = true;
        setSnapGuides({ x: null, y: null });
        return;
      }
      const px = ev.clientX - s.px;
      const py = ev.clientY - s.py;
      if (!moved && Math.hypot(px, py) < moveThreshold) return;
      if (!moved) checkpoint();
      moved = true;
      setInlineText(null);
      let x = s.x + (px / box.width) * 100;
      let y = s.y + (py / box.height) * 100;
      const sx = snapEnabled ? nearestSnap(x, moveSnapCandidates(b, others, 'x'), toleranceX) : null;
      const sy = snapEnabled ? nearestSnap(y, moveSnapCandidates(b, others, 'y'), toleranceY) : null;
      if (sx) x = sx.value;
      if (sy) y = sy.value;
      setSnapGuides({ x: sx?.guide ?? null, y: sy?.guide ?? null });
      patch(b.id, { x: round(x), y: round(y) }, { record: false });
    };
    const up = () => {
      setSnapGuides({ x: null, y: null });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved && !cancelled && Date.now() >= gestureRef.current.suppressUntil) {
        setSel(b.id);
        setInlineText(b.id);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** 右上角旋转手柄：以区块中心为圆心，手指转多少，区块就转多少。 */
  function rotateDrag(e, b) {
    e.preventDefault();
    e.stopPropagation();
    setSel(b.id);
    setInlineText(null);
    setInspectorOpen(false);
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + ((b.x + b.w / 2) / 100) * box.width;
    const cy = box.top + ((b.y + b.h / 2) / 100) * box.height;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRot = b.rot || 0;
    let changed = false;

    const move = (ev) => {
      if (!changed) { checkpoint(); changed = true; }
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let delta = ((angle - startAngle) * 180) / Math.PI;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      patch(b.id, { rot: round(startRot + delta) }, { record: false });
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

  function openInspector(bid = sel) {
    if (bid) setSel(bid);
    setInlineText(null);
    setInspectorOpen(true);
  }

  async function toggleCanvasFullscreen() {
    const next = !canvasFullscreen;
    setCanvasFullscreen(next);
    setInspectorOpen(false);
    setAdding(false);
    if (next) {
      try { await document.documentElement.requestFullscreen?.(); } catch { /* CSS 全屏仍然生效 */ }
    } else if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* CSS 状态已经退出 */ }
    }
  }

  function canvasGestureDown(e) {
    if (e.pointerType !== 'touch') return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 部分 iOS 版本不支持 */ }
    const gesture = gestureRef.current;
    gesture.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.points.size < 2) return;
    const [a, b] = [...gesture.points.values()];
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const view = canvasViewRef.current;
    gesture.pinching = true;
    gesture.suppressUntil = Date.now() + 350;
    gesture.start = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: view.scale, x: view.x, y: view.y,
      focalX: (midX - (rect.left + rect.width / 2) - view.x) / view.scale,
      focalY: (midY - (rect.top + rect.height / 2) - view.y) / view.scale,
    };
    setSel(null);
    setInlineText(null);
    setInspectorOpen(false);
  }

  function canvasGestureMove(e) {
    if (e.pointerType !== 'touch') return;
    const gesture = gestureRef.current;
    if (!gesture.points.has(e.pointerId)) return;
    gesture.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture.pinching || !gesture.start || gesture.points.size < 2) return;
    e.preventDefault();
    const [a, b] = [...gesture.points.values()];
    const rect = canvasViewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const scale = Math.min(3.5, Math.max(1, gesture.start.scale
      * Math.hypot(a.x - b.x, a.y - b.y) / gesture.start.distance));
    const maxX = rect.width * (scale - 1) / 2;
    const maxY = rect.height * (scale - 1) / 2;
    const x = scale === 1 ? 0 : Math.max(-maxX, Math.min(maxX,
      midX - (rect.left + rect.width / 2) - gesture.start.focalX * scale));
    const y = scale === 1 ? 0 : Math.max(-maxY, Math.min(maxY,
      midY - (rect.top + rect.height / 2) - gesture.start.focalY * scale));
    const next = { scale: Math.round(scale * 100) / 100, x: Math.round(x), y: Math.round(y) };
    canvasViewRef.current = next;
    setCanvasView(next);
  }

  function canvasGestureEnd(e) {
    if (e.pointerType !== 'touch') return;
    const gesture = gestureRef.current;
    const wasPinching = gesture.pinching;
    gesture.points.delete(e.pointerId);
    if (gesture.points.size < 2) {
      gesture.pinching = false;
      gesture.start = null;
      if (wasPinching) gesture.suppressUntil = Date.now() + 300;
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 已自动释放 */ }
  }

  function resetCanvasView() {
    const next = { scale: 1, x: 0, y: 0 };
    canvasViewRef.current = next;
    setCanvasView(next);
  }

  function inlineChange(b, field, value) {
    if (field === 'name' || field === 'en' || field === 'issuer' || field === 'desc') {
      patchActivity({ [field]: value });
      return;
    }
    if (field.startsWith('row:')) {
      const [, rawIndex, key] = field.split(':');
      const index = Number(rawIndex);
      patch(b.id, {
        rows: (b.rows || []).map((row, i) => (i === index ? { ...row, [key]: value } : row)),
      });
      return;
    }
    patch(b.id, { [field]: value });
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
    if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (typing) {
      if (e.key === 'Escape') t.blur();
      return;
    }
    if (e.key === 'Escape') {
      if (canvasFullscreen) {
        setCanvasFullscreen(false);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
      setSel(null);
      return;
    }
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
      const pages = pagesRef.current || [];
      const list = activities.map((a) => (a.id === id ? {
        ...a,
        ...activityFieldsRef.current,
        blocks: pages[0]?.blocks || [],
        extraPages: pages.slice(1).map((p) => ({
          id: p.id, kind: p.kind, title: p.title, blocks: p.blocks || [],
        })),
        name: nameRef.current.trim() || a.name,
      } : a));
      const res = await api('/api/admin/activities', { method: 'POST', body: { activities: list }, token });
      const made = res.activities.find((a) => a.id === id);
      if (made) {
        const next = editorPages(config, made);
        pagesRef.current = next;
        const nextIndex = Math.min(pageIndexRef.current, next.length - 1);
        pageIndexRef.current = nextIndex;
        blocksRef.current = next[nextIndex]?.blocks || [];
        setDesignPages(next);
        setPageIndex(nextIndex);
        const nextFields = {
          en: made.en || '', issuer: made.issuer || '', desc: made.desc || made.rule || '',
        };
        setActivityFields(nextFields);
        activityFieldsRef.current = nextFields;
        setName(made.name || '');
        nameRef.current = made.name || '';
      }
      await loadConfig();
      setDirty(false);
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

  if (!config || !designPages || !blocks) {
    return (
      <div className="page staff-page">
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
    <div className={`page page--design staff-page staff-design ${canvasFullscreen ? 'staff-design--fullscreen' : ''} ${inspectorOpen ? 'staff-design--inspector-open' : ''}`}>
      <div className="design__bar row" style={{ gap: 8, alignItems: 'center' }}>
        <button className="btn btn--ghost" onClick={leave} style={{ flex: '0 0 auto' }}>返回</button>
        <ImeInput className="input grow" value={name} maxLength={20} placeholder="活动名"
          onValue={(value) => {
            checkpoint();
            nameRef.current = value;
            setName(value);
            setDirty(true);
          }} />
        <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty} onClick={save}>
          {busy === 'save' ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </div>
      <div className="design__pages card">
        <div className="design__page-tabs" role="tablist" aria-label="活动页面">
          {designPages.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={pageIndex === i}
              className={`design__page-tab ${pageIndex === i ? 'design__page-tab--on' : ''}`}
              onClick={() => selectPage(i)}>
              <span>{i + 1}</span>
              <b>{p.title}</b>
            </button>
          ))}
        </div>
        <div className="design__page-actions">
          <button className="btn btn--sm btn--ghost" onClick={() => addPage('photo')}>＋ 照片页</button>
          <button className="btn btn--sm btn--ghost" onClick={() => addPage('summary')}>＋ 总结页</button>
          {pageIndex > 0 ? (
            <>
              <button className="btn btn--sm btn--ghost" disabled={pageIndex <= 1}
                onClick={() => movePage(-1)} title="上一页">←</button>
              <button className="btn btn--sm btn--ghost" disabled={pageIndex >= designPages.length - 1}
                onClick={() => movePage(1)} title="下一页">→</button>
              <button className="btn btn--sm btn--danger" onClick={deletePage}>删除本页</button>
            </>
          ) : null}
          {pageIndex > 0 ? (
            <input className="input design__page-title" value={designPages[pageIndex].title}
              maxLength={24} aria-label="页面名称" placeholder="页面名称"
              onFocus={checkpoint}
              onChange={(e) => renamePage(e.target.value)} />
          ) : null}
        </div>
        {pageIndex === 0 ? (
          <div className="tiny dim">第 1 页是活动信息页，始终保留；后续页面可以新增、排序或删除。</div>
        ) : null}
      </div>

      <div className="design__body">

      {/* 纸 */}
      <div className="design__stage">
      <div className="design__canvas-toolbar row" role="toolbar" aria-label="画板工具"
        style={{ alignItems: 'center' }}>
        <div className="design__history row" style={{ flex: '0 0 auto' }}>
          <button className="btn btn--sm btn--ghost" onClick={undo}
            disabled={!historyRef.current.past.length} title="撤销（⌘Z）" aria-label="撤销">↶</button>
          <button className="btn btn--sm btn--ghost" onClick={redo}
            disabled={!historyRef.current.future.length} title="重做（⇧⌘Z）" aria-label="重做">↷</button>
        </div>
        <button className={`btn btn--sm btn--ghost design__mode-button ${snapEnabled ? 'design__mode-button--on' : ''}`}
          aria-pressed={snapEnabled} title={snapEnabled ? '关闭自动吸附' : '开启自动吸附'}
          onClick={() => { setSnapEnabled((v) => !v); setSnapGuides({ x: null, y: null }); }}>
          <span aria-hidden="true">🧲</span><b>{snapEnabled ? '吸附开' : '吸附关'}</b>
        </button>
        <button className="btn btn--sm btn--ghost design__mode-button"
          aria-pressed={canvasFullscreen} onClick={toggleCanvasFullscreen}
          title={canvasFullscreen ? '退出全屏编辑' : '全屏编辑'}>
          <span aria-hidden="true">{canvasFullscreen ? '⊡' : '⛶'}</span><b>{canvasFullscreen ? '退出' : '全屏'}</b>
        </button>
        {canvasView.scale > 1.01 ? (
          <button className="btn btn--sm btn--ghost design__zoom-reset" onClick={resetCanvasView}
            title="恢复画板大小" aria-label="恢复画板大小">
            {Math.round(canvasView.scale * 100)}%
          </button>
        ) : null}
        <button className="btn btn--sm btn--primary design__fullscreen-save"
          disabled={busy === 'save' || !dirty} onClick={save}
          title={dirty ? '保存修改' : '已经保存'} aria-label={dirty ? '保存修改' : '已经保存'}>
          {busy === 'save' ? '…' : '✓'}
        </button>
      </div>
      <div
        className="design__canvas-viewport"
        ref={canvasViewportRef}
        onPointerDownCapture={canvasGestureDown}
        onPointerMoveCapture={canvasGestureMove}
        onPointerUpCapture={canvasGestureEnd}
        onPointerCancelCapture={canvasGestureEnd}
        onDragOver={(e) => e.preventDefault()}
        onDrop={dropMaterial}
        style={{
          position: 'relative', aspectRatio: String(PAGE_ASPECT),
          border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden',
          marginBottom: 10, touchAction: 'none', background: '#000',
        }}
      >
      <div
        className="design__canvas"
        ref={boxRef}
        onPointerDown={() => { setSel(null); setInspectorOpen(false); setInlineText(null); }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          overflow: 'hidden', touchAction: 'none', background: '#000',
          transform: `translate3d(${canvasView.x}px, ${canvasView.y}px, 0) scale(${canvasView.scale})`,
          transformOrigin: 'center center',
        }}
      >
        <VisaPageFrame theme={config.theme} activity={workingActivity}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, containerType: 'size' }}>
            {blocks.map((b) => {
              const on = b.id === sel;
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => blockTouch(e, b)}
                  style={{
                    position: 'absolute',
                    left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
                    transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
                    opacity: b.opacity ?? 1,
                    zIndex: on ? 20 : undefined,
                    outline: on ? 'none' : '1px dashed rgba(120,120,120,.45)',
                    outlineOffset: 1, cursor: 'move', touchAction: 'none',
                  }}
                >
                  <BlockBody
                    b={b}
                    data={data}
                    editing
                    inlineEditing={inlineText === b.id}
                    onTextChange={(field, value) => inlineChange(b, field, value)}
                  />
                </div>
              );
            })}
          </div>
          {snapGuides.x !== null ? (
            <div className="design__snap-guide design__snap-guide--x" style={{ left: `${snapGuides.x}%` }} />
          ) : null}
          {snapGuides.y !== null ? (
            <div className="design__snap-guide design__snap-guide--y" style={{ top: `${snapGuides.y}%` }} />
          ) : null}
          <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, height: '12%', pointerEvents: 'none'}}>
            <PassportMrz line1={data.mrz1} line2={data.mrz2} />
          </div>
        </VisaPageFrame>
        {selected ? (
          <div className="design__selection-overlay" style={{
            position: 'absolute',
            left: `${selected.x}%`, top: `${selected.y}%`, width: `${selected.w}%`, height: `${selected.h}%`,
            transform: selected.rot ? `rotate(${selected.rot}deg)` : undefined,
            zIndex: 70, outline: '2px solid var(--gold)', outlineOffset: 1,
            pointerEvents: 'none',
          }}>
            <div className="design__selection-tools"
              style={{ top: selected.y < 11 ? 3 : -32 }}
              onPointerDown={(e) => e.stopPropagation()}>
              <button title="文字样式" aria-label="文字样式"
                onClick={() => openInspector(selected.id)}>⚙</button>
              <button title="删除" aria-label="删除区块" onClick={() => remove(selected.id)}>🗑</button>
            </div>
            <button className="design__rotate-handle" title="拖动旋转" aria-label="拖动旋转区块"
              style={{
                top: selected.y < 7 ? 3 : -17,
                right: selected.x + selected.w > 97 ? 3 : -17,
              }}
              onPointerDown={(e) => rotateDrag(e, selected)}>↻</button>
            <div className="design__resize-handle"
              onPointerDown={(e) => drag(e, selected, 'size')}
              title="拖这里改大小" />
          </div>
        ) : null}
      </div>
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
      <div className="card stack design__tools" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm btn--ghost grow" onClick={() => setAdding((v) => !v)}>
            {adding ? '收起' : '＋ 新增'}
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
        <div className="tiny dim design__tools-help">
          页眉、水印、二维码、盖章和底部机读区是固定模板，其余内容都能挪能删 ——
          删光就是一张白页，想做成整页海报就该这样。
          栏目里填的是示例值（真页面上每个人不一样）；页面固定为 1.9:1。
        </div>
        <button className="btn btn--sm btn--primary btn--full" onClick={openMaterials}>
          参与者素材库 {materials.length ? `(${materials.length})` : ''}
        </button>
      </div>

      {materialsOpen ? (
        <div className="card stack design__materials" style={{ marginBottom: 12 }}>
          <div className="row-between">
            <div>
              <div className="section-title" style={{ margin: 0 }}>参与者素材库</div>
              <div className="tiny dim" style={{ marginTop: 4 }}>拖进左侧画布；手机上点“放入当前页”</div>
            </div>
            <button className="btn btn--sm btn--ghost" onClick={() => setMaterialsOpen(false)}>关闭</button>
          </div>
          {materialsLoading ? <div className="small dim">正在读取…</div> : null}
          {!materialsLoading && materials.length === 0
            ? <div className="small dim">这场活动还没有参与者上传素材。</div> : null}
          <div className="design__material-grid">
            {materials.map((m) => (
              <div className="design__material" key={m.id} draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('application/x-activity-material', JSON.stringify(m));
                }}>
                <div className="design__material-owner">
                  {m.player?.code} · {m.player?.name}
                </div>
                {m.kind === 'image'
                  ? <img src={m.content} alt={`${m.player?.name || '参与者'}上传的素材`} />
                  : <div className="design__material-text">{m.content}</div>}
                <button className="btn btn--sm btn--ghost btn--full" onClick={() => addMaterial(m)}>
                  放入当前页
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 选中块的属性 */}
      {selected ? (
        <>
        {inspectorOpen ? (
          <div className="design__inspector-backdrop" aria-hidden="true"
            onPointerDown={() => setInspectorOpen(false)} />
        ) : null}
        <div className={`card stack design__inspector ${inspectorOpen ? 'design__inspector--open' : ''}`}
          role="dialog" aria-modal={inspectorOpen ? 'true' : undefined}
          aria-label={`编辑${KIND_NAME[selected.kind] || '区块'}`}
          onPointerDown={(e) => e.stopPropagation()}>
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>
              {KIND_NAME[selected.kind] || '块'}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, -1)} title="往下一层">⤓</button>
              <button className="btn btn--sm btn--ghost" onClick={() => layer(selected.id, 1)} title="往上一层">⤒</button>
              <button className="btn btn--sm btn--ghost" onClick={() => duplicate(selected)} title="复制一个">⧉</button>
              <button className="btn btn--sm btn--ghost" aria-label="删除区块"
                onClick={() => remove(selected.id)} title="删除区块">🗑</button>
              <button className="btn btn--sm btn--primary design__inspector-close"
                onClick={() => setInspectorOpen(false)}>完成</button>
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
        </>
      ) : (
        <div className="card stack design__empty" style={{ marginBottom: 12 }}>
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
        <div className="tiny dim">文字内容请直接在画布中点击修改；这里调整右侧标题的样式。</div>
        <TextStyleControls b={b} patch={patch} defaults={{ size: 2.9, lh: 1.15, font: 'serif', align: 'right', bold: false }} />
      </>
    );
  }

  if (b.kind === 'fields') {
    return (
      <>
        <div className="tiny dim">栏目标题、固定文字和签发机构请直接在画布中点击修改。</div>
        <TextStyleControls b={b} patch={patch} defaults={{ size: 2.6, lh: 1.2, font: 'mono', align: 'left', bold: true }} />
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div className="tiny dim grow">栏目结构</div>
          <label className="stack-sm" style={{ gap: 3, flex: '0 0 auto' }}>
            <div className="tiny dim">列数</div>
            <input className="input" type="number" min="1" max="4" style={{ width: 60 }}
              value={b.cols || 2} onChange={(e) => patch({ cols: Math.min(4, Math.max(1, Number(e.target.value) || 1)) })} />
          </label>
        </div>
        {(b.rows || []).map((row, i) => (
          <div className="row" key={row.key || i} style={{ gap: 6 }}>
            <select className="input grow" value={row.src}
              onChange={(e) => patch({ rows: b.rows.map((r, k) => (k === i ? { ...r, src: e.target.value } : r)) })}>
              {[...new Set(sources.map((s) => s.group || ''))].map((group) => {
                const items = sources.filter((s) => (s.group || '') === group);
                return group
                  ? <optgroup key={group} label={group}>{items.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup>
                  : items.map((s) => <option key={s.key} value={s.key}>{s.name}</option>);
              })}
            </select>
            <button className="btn btn--sm btn--ghost" disabled={i === 0} title="上移"
              onClick={() => { const n = [...b.rows]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; patch({ rows: n }); }}>↑</button>
            <button className="btn btn--sm btn--ghost" disabled={i === b.rows.length - 1} title="下移"
              onClick={() => { const n = [...b.rows]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; patch({ rows: n }); }}>↓</button>
            <button className="btn btn--sm btn--ghost" title="删除栏目"
              onClick={() => patch({ rows: b.rows.filter((_, k) => k !== i) })}>🗑</button>
          </div>
        ))}
        <button className="btn btn--sm btn--ghost" onClick={() => patch({
          rows: [...(b.rows || []), { key: `r${Date.now().toString(36)}`, label: '新栏目', src: 'text', text: '内容', accent: false }],
        })}>＋ 加一栏</button>
      </>
    );
  }

  if (b.kind === 'station') {
    return (
      <>
        <div className="tiny dim">活动名称、英文名和小标题请直接在画布中点击修改。</div>
        <TextStyleControls b={b} patch={patch} defaults={{ size: 4.4, lh: 1.25, font: 'sans', align: 'left', bold: true }} />
      </>
    );
  }

  if (b.kind === 'note') {
    return (
      <>
        <div className="tiny dim">备注和小标题请直接在画布中点击修改。</div>
        <TextStyleControls b={b} patch={patch} defaults={{ size: 2.7, lh: 1.75, font: 'sans', align: 'left', bold: true }} />
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
      <div className="tiny dim">文字内容请直接在画布中点击修改。</div>
      <TextStyleControls b={b} patch={patch} defaults={{ size: 4, lh: 1.5, font: 'sans', align: 'left', bold: false }} />
    </>
  );
}

function TextStyleControls({ b, patch, defaults }) {
  const font = b.font || defaults.font;
  const align = b.align || defaults.align;
  const size = b.size ?? defaults.size;
  const lh = b.lh ?? defaults.lh;
  const bold = b.bold ?? defaults.bold;
  return (
    <>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" aria-label="字体" style={{ flex: '1 1 90px' }} value={font}
          onChange={(e) => patch({ font: e.target.value })}>
          <option value="sans">黑体</option>
          <option value="serif">衬线</option>
          <option value="mono">等宽</option>
        </select>
        <select className="input" aria-label="对齐方式" style={{ flex: '1 1 80px' }} value={align}
          onChange={(e) => patch({ align: e.target.value })}>
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
        <label className="tiny row" style={{ gap: 5, alignItems: 'center', flex: '0 0 auto' }}>
          <input type="checkbox" checked={!!bold} onChange={(e) => patch({ bold: e.target.checked })} />
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
      <Slider label="字号" value={size} min={1} max={16} step={0.2}
        onChange={(v) => patch({ size: v })} suffix="% 页高" />
      <Slider label="行距" value={lh} min={0.9} max={3} step={0.1}
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
