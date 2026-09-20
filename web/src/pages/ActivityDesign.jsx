import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import ImeInput from '../components/ImeInput.jsx';
import { useToast, useConfirm } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import IconPicker from '../components/IconPicker.jsx';
import { TEXT_BLOCK_MAX, useConfig, loadConfig } from '../lib/config.js';
import { useStaff } from '../lib/staff.js';
import { uploadPhoto, uploadVideo } from '../lib/photo.js';
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

/** 选中框上的八个缩放把手：四角 + 四条边的中点 */
const RESIZE_HANDLES = [
  { dir: 'nw', title: '拖这里改大小（左上角）' },
  { dir: 'n', title: '拖这里改高度（上边）' },
  { dir: 'ne', title: '拖这里改大小（右上角）' },
  { dir: 'e', title: '拖这里改宽度（右边）' },
  { dir: 'se', title: '拖这里改大小（右下角）' },
  { dir: 's', title: '拖这里改高度（下边）' },
  { dir: 'sw', title: '拖这里改大小（左下角）' },
  { dir: 'w', title: '拖这里改宽度（左边）' },
];

/** 能往页面上加什么。删掉的内置块也能从这里加回来。 */
const PALETTE = [
  { kind: 'text',    name: '文字',     make: () => ({ x: 8, y: 30, w: 40, h: 14, text: '写点什么', size: 4, color: '', font: 'sans', align: 'left', bold: false, lh: 1.5 }) },
  { kind: 'image',   name: '图片',     make: () => ({ x: 10, y: 25, w: 30, h: 34, src: '', fit: 'cover', radius: 0 }) },
  { kind: 'gallery', name: '照片图库', make: () => ({ x: 7, y: 26, w: 86, h: 58, photos: [], featured: 6, cols: 3 }) },
  // 活动短片：默认给一个 16:9 的框，摆在页面中间
  { kind: 'video',   name: '视频',     make: () => ({ x: 8, y: 30, w: 52, h: 36, src: '', poster: '', fit: 'contain', radius: 0, loop: false, muted: false, autoplay: false }) },
  { kind: 'banner',  name: 'VISA 横框', make: (t) => ({ x: 4, y: 12.5, w: 92, h: 11, word: t.banner, ...t.brand }) },
  { kind: 'fields',  name: '栏目',     make: (t) => ({ x: 4.5, y: 27, w: 52, h: 62, cols: 2, rows: t.rows }) },
  { kind: 'station', name: '活动名',   make: (t) => ({ x: 60, y: 27, w: 36, h: 16, label: t.stationLabel }) },
  { kind: 'note',    name: '备注',     make: (t) => ({ x: 60, y: 47, w: 36, h: 30, label: t.annotationLabel }) },
  { kind: 'photo',   name: '配图',     make: () => ({ x: 60, y: 27, w: 36, h: 21, fit: 'cover' }) },
  { kind: 'links',   name: '页面链接', make: () => ({ x: 4.5, y: 80, w: 52, h: 8 }) },
  // 单独一个图标，想放哪放哪。和别的块一样能配链接、能拖大小 ——
  // 「页面链接」那个块是一排固定在一起的，这个是散装的
  { kind: 'icon',    name: '图标',     make: () => ({ x: 46, y: 45, w: 10, h: 10, icon: '📍', href: '' }) },
  // 这场活动的报名二维码：参与者在自己的签证页上点开就能分享给朋友报名
  { kind: 'qr',      name: '报名二维码', make: () => ({ x: 4.5, y: 63, w: 34, h: 16, icon: '', label: '扫码报名' }) },
];

const KIND_NAME = Object.fromEntries(PALETTE.map((p) => [p.kind, p.name]));

/** 编辑器里用的示例数据。真页面上这些每个人都不一样。 */
function sampleData(activity, theme, shareOrigin) {
  return blockData({
    station: activity, theme, shareOrigin,
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

/** 旋转吸附的角度：每 15° 一格，0 / ±90 / ±180 都在里面 —— 徒手很难正好转回 0。 */
const ROTATE_SNAPS = Array.from({ length: 25 }, (_, i) => ({ value: -180 + i * 15 }));
const ROTATE_SNAP_TOLERANCE = 6;

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

function newExtraPage(kind) {
  const stamp = localId('').slice(0, 20);
  const isPhoto = kind === 'photo';
  // 空白页只给一张白纸，块自己加；页名不编号 —— 同工要的是「照片页」
  // 这种叫法，不是「照片页 2」，序号页签上本来就有
  if (kind === 'blank') {
    return { id: `p${stamp}`, kind: 'blank', requireCheckin: false, title: '空白页', blocks: [] };
  }
  return {
    id: `p${stamp}`,
    kind,
    requireCheckin: false,
    title: isPhoto ? '照片页' : '活动总结',
    blocks: isPhoto ? [
      { id: `t${stamp}`, kind: 'text', x: 6, y: 15, w: 88, h: 9, rot: 0, opacity: 1,
        text: '活动照片', size: 5.2, color: '', font: 'serif', align: 'center', bold: true, lh: 1.2, href: '' },
      { id: `g${stamp}`, kind: 'gallery', x: 8, y: 27, w: 84, h: 58, rot: 0, opacity: 1,
        photos: [], featured: 6, cols: 3, href: '' },
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
  // 页签拖动排序：按下时量一次版面，之后只算「拖了多远 → 落到第几格」
  const tabDragRef = useRef(null);
  const [dragTab, setDragTab] = useState(null);
  // 每一次本地改动都 +1；savedVersion 是「已经确认存到服务端」的那一版。
  // 两者相等才允许拿服务端数据回填 —— 否则请求飞在路上时打的字会被抹掉。
  // 用 ref 不用 state：这个判断发生在 effect 和网络回调里，state 有一拍延迟
  const editVersion = useRef(0);
  const savedVersion = useRef(0);
  // 打开（或上次同步到）这一版时服务端的版本号。保存时带上去，服务端拿它
  // 判断「这期间有没有别人存过」——两个人同时开着画板，后存的那个原本会
  // 把先存的整个盖掉，而且自己毫不知情
  const baseRev = useRef(null);
  const markDirty = () => { editVersion.current += 1; setDirty(true); };
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

  /**
   * 改当前页的块。
   *
   * **算好再 setState，不在 updater 里改 ref。** updater 是 React 渲染时才跑的，
   * 而 save() 读的是 pagesRef —— 在画布上打完字立刻点「保存」，blur 提交的这一版
   * 还没进 ref，存上去的就是上一版，服务端再把旧文字painted 回来，看着就是「改了又弹回去」。
   * 以 ref 为准同步算出下一版，两边永远是同一份。
   */
  const setBlocks = (value, atIndex) => {
    const cur = pagesRef.current;
    const index = atIndex ?? pageIndexRef.current;
    if (!cur?.[index]) return;
    const old = cur[index].blocks || [];
    const nextBlocks = typeof value === 'function' ? value(old) : value;
    const next = cur.map((p, i) => (i === index ? { ...p, blocks: nextBlocks } : p));
    pagesRef.current = next;
    if (index === pageIndexRef.current) blocksRef.current = nextBlocks;
    setDesignPages(next);
  };

  /**
   * 这个块在第几页。
   *
   * 改字是在失焦/卸载时才提交的，而「切到别的页」本身就会把输入框卸载 ——
   * 那一刻 pageIndexRef 已经指向新页了，按当前页去打补丁会落在错的一页上，
   * 刚打的字就这么没了。按 id 找回它自己那一页。
   */
  const pageIndexOfBlock = (bid) => {
    const pages = pagesRef.current || [];
    const hit = pages.findIndex((p) => (p.blocks || []).some((b) => b.id === bid));
    return hit < 0 ? pageIndexRef.current : hit;
  };

  const activities = config?.activities || [];
  const activity = activities.find((a) => a.id === id);
  const tpl = config?.visaTemplate || {};
  const sources = config?.visaSources || [];

  useEffect(() => {
    if (!activity) return;
    // 有还没存上的本地改动就不要回填（原来看的是 dirty 这个 state，
    // 它比按键慢一拍：保存刚回来那一瞬间打的字会被服务端那份盖掉）
    if (designPages && editVersion.current !== savedVersion.current) return;
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
    savedVersion.current = editVersion.current;
    baseRev.current = config?.activitiesRev ?? null;
  }, [activity, config, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!editor) return;
    editor.focus({ preventScroll: true });

    // 光标收到文末。
    //
    // contentEditable 被**程序**聚焦时，光标默认停在最前面 —— 于是选中一块
    // 文字开始打字，字全插到开头去了。用手指点进去的那种不会走这里
    // （那是浏览器自己的聚焦，点哪儿光标就在哪儿），所以不影响改中间。
    const sel = window.getSelection?.();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);   // false = 收到末尾
    sel.removeAllRanges();
    sel.addRange(range);
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
  const data = useMemo(() => sampleData(workingActivity, config?.theme, config?.shareOrigin), [workingActivity, config]);
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
    markDirty();
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
    setBlocks((cur) => cur.map((b) => (b.id === bid ? { ...b, ...p } : b)), pageIndexOfBlock(bid));
    markDirty();
  };

  const patchActivity = (values) => {
    checkpoint();
    // 同 setBlocks：先算好、同步写进 ref，再 setState
    const next = { ...(activityFieldsRef.current || {}), ...values };
    activityFieldsRef.current = next;
    setActivityFields(next);
    if (Object.prototype.hasOwnProperty.call(values, 'name')) {
      const nextName = values.name;
      nameRef.current = nextName;
      setName(nextName);
    }
    markDirty();
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
    setBlocks((cur) => cur.map((b) => (b.id === bid ? { ...b, ...fn(b) } : b)), pageIndexOfBlock(bid));
    markDirty();
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
    markDirty();
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

  async function pickVideo(file, bid) {
    if (!file) return;
    setBusy('video');
    try {
      const res = await uploadVideo(file, token);
      patch(bid, { src: res.url });
      toast(`视频已上传（${Math.round(res.bytes / 1048576 * 10) / 10}MB）`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /** 视频的海报图：走图片那条压缩上传，存进块的 poster */
  async function pickVideoPoster(file, bid) {
    if (!file) return;
    setBusy('poster');
    try {
      const res = await uploadPhoto(file, token);
      patch(bid, { poster: res.url });
      toast('封面图已上传', 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function pickGalleryImages(files, bid) {
    const list = [...(files || [])].slice(0, 40);
    if (!list.length) return;
    setBusy('gallery');
    const urls = [];
    let failed = 0;
    // 失败原因要留一条：原来只数个数，一张都没成功时只说「照片上传失败」，
    // 人看不出是格式不认、太大还是没网，只能反复点同一个按钮
    let firstError = '';
    for (const file of list) {
      try {
        const res = await uploadPhoto(file, token);
        urls.push(res.url);
      } catch (err) {
        failed += 1;
        if (!firstError) firstError = `${file.name || '这张'}：${err.message || '上传失败'}`;
      }
    }
    try {
      if (!urls.length) throw new Error(firstError || '照片上传失败');
      const current = (blocksRef.current || []).find((b) => b.id === bid);
      const photos = [...(current?.photos || []), ...urls].slice(0, 100);
      patch(bid, { photos });
      toast(failed ? `已加入 ${urls.length} 张，${failed} 张没成功 —— ${firstError}` : `已加入 ${urls.length} 张照片`, failed ? 'warn' : 'ok');
    } catch (err) {
      toast(err.message || '照片上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /**
   * 把正在改的那段字立刻提交掉。
   *
   * 输入框是在失焦/卸载时才提交的，卸载那一路走的是 useEffect 清理 ——
   * React 会等到这一帧画完才跑。切页、点保存这种「马上要读数据」的动作
   * 先手动 blur 一下，提交就发生在当下，不用赌那一拍。
   */
  function flushInlineEdit() {
    const el = document.querySelector('[data-inline-editor]');
    if (el && document.activeElement === el) el.blur();
  }

  function selectPage(index) {
    flushInlineEdit();
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
    const made = newExtraPage(kind);
    const next = [...(pagesRef.current || []), made];
    pagesRef.current = next;
    setDesignPages(next);
    const nextIndex = designPages.length;
    pageIndexRef.current = nextIndex;
    blocksRef.current = made.blocks;
    setPageIndex(nextIndex);
    setSel(null);
    markDirty();
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
    markDirty();
  }

  /** 把第 from 页挪到第 to 页（都是附加页，信息页永远第 1）*/
  function reorderPages(from, to) {
    if (from === to || from < 1 || to < 1) return;
    if (!designPages?.[from] || !designPages?.[to]) return;
    checkpoint();
    const next = [...designPages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    pagesRef.current = next;
    pageIndexRef.current = to;
    blocksRef.current = next[to].blocks || [];
    setDesignPages(next);
    setPageIndex(to);
    setSel(null);
    markDirty();
  }

  /**
   * 页签拖动排序。
   *
   * 和总控台活动清单那套一个思路：按下时量好每个页签的位置，拖动时只改
   * transform（不 setState，一秒几十帧不重绘），松手才真正重排一次。
   * 没拖动就是普通点击 —— 切到那一页。
   */
  function startTabDrag(e, i) {
    if (i === 0 || busy === 'save') return;     // 活动信息页钉在第一格
    const slots = [...document.querySelectorAll('[data-page-tab]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { index: Number(el.dataset.pageTab), el, left: r.left, w: r.width };
    });
    const from = slots.findIndex((sl) => sl.index === i);
    if (from < 1) return;
    const touch = e.pointerType === 'touch';
    tabDragRef.current = {
      from, to: from, startX: e.clientX, slots, moved: false,
      // 手指按下先不接管：页签这一条本身要能左右滑着看。
      // 按住不动半秒才进入排序，这之前一滑就交给浏览器滚动 ——
      // 两个手势都是横向的，只能靠「按住」把它们分开
      armed: !touch,
      el: e.currentTarget,
      pointerId: e.pointerId,
      timer: touch ? setTimeout(() => {
        const d = tabDragRef.current;
        if (!d) return;
        d.armed = true;
        d.moved = true;
        setDragTab(d.slots[d.from].index);
        navigator.vibrate?.(12);
        try { d.el.setPointerCapture(d.pointerId); } catch { /* 浏览器会自己继续派发 */ }
      }, 320) : null,
    };
    if (!touch) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 同上 */ }
    }
  }

  function moveTabDrag(e) {
    const d = tabDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    // 还没「按住」就动了：这是在滑页签条，放手让浏览器滚，别抢
    if (!d.armed) {
      if (Math.abs(dx) > 8) { clearTimeout(d.timer); tabDragRef.current = null; }
      return;
    }
    if (!d.moved && Math.abs(dx) < 6) return;   // 手抖不算拖动
    if (!d.moved) { d.moved = true; setDragTab(d.slots[d.from].index); }
    e.preventDefault();
    const { slots, from } = d;
    const center = slots[from].left + slots[from].w / 2 + dx;
    // 落到哪一格：拿起拖时的版面算，同一个 dx 永远得到同一个结果，不会来回跳。
    // 第 0 格是信息页，附加页最前只能到第 1 格
    let to = 1;
    for (let i = 1; i < slots.length; i += 1) {
      if (center >= slots[i].left) to = i;
    }
    d.to = to;
    slots.forEach((sl, i) => {
      if (i === from) {
        sl.el.style.transition = 'none';
        sl.el.style.transform = `translateX(${dx}px)`;
        sl.el.style.zIndex = '2';
        return;
      }
      let shift = 0;
      if (to > from && i > from && i <= to) shift = slots[i - 1].left - slots[i].left;
      if (to < from && i >= to && i < from) shift = slots[i + 1].left - slots[i].left;
      sl.el.style.transition = '';
      sl.el.style.transform = shift ? `translateX(${shift}px)` : '';
    });
  }

  function endTabDrag(e, i) {
    const d = tabDragRef.current;
    if (!d) return;
    clearTimeout(d.timer);
    tabDragRef.current = null;
    setDragTab(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* 已自动释放 */ }
    d.slots.forEach((sl) => {
      sl.el.style.transition = 'none';
      sl.el.style.transform = '';
      sl.el.style.zIndex = '';
      // 下一帧再把过渡放回来，否则归位时会自己滑一下
      requestAnimationFrame(() => { sl.el.style.transition = ''; });
    });
    if (!d.moved) { selectPage(i); return; }
    reorderPages(d.from, d.to);
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
    markDirty();
  }

  function renamePage(title) {
    if (pageIndex === 0) return;
    const next = (pagesRef.current || []).map((p, i) => (i === pageIndex ? { ...p, title } : p));
    pagesRef.current = next;
    setDesignPages(next);
    markDirty();
  }

  function setPageCheckin(required) {
    if (pageIndex === 0) return;
    checkpoint();
    const next = (pagesRef.current || []).map((p, i) => (i === pageIndex ? { ...p, requireCheckin: required } : p));
    pagesRef.current = next;
    setDesignPages(next);
    markDirty();
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
    const page = pagesRef.current?.[pageIndexRef.current];
    const gallery = !at && isImage ? (page?.blocks || []).find((b) => b.kind === 'gallery') : null;
    if (gallery) {
      const photos = gallery.photos || [];
      if (photos.includes(material.content)) return toast('这张照片已经在图库里了', 'warn');
      setBlocks((cur) => cur.map((b) => (b.id === gallery.id
        ? { ...b, photos: [...photos, material.content].slice(0, 100) }
        : b)));
      markDirty();
      setSel(gallery.id);
      toast(`已把 ${material.player?.name || '参与者'} 的照片加入图库`, 'ok');
      return;
    }
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
    markDirty();
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
    markDirty();
  };

  function duplicate(b) {
    checkpoint();
    const made = { ...JSON.parse(JSON.stringify(b)), id: `b${Date.now().toString(36)}`,
                   x: round(b.x + 3), y: round(b.y + 3) };
    setBlocks((cur) => [...cur, made]);
    setSel(made.id);
    markDirty();
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
    markDirty();
  };

  async function clearAll() {
    if (!(await ask({
      title: `把「${designPages[pageIndex]?.title || '这一页'}」清空？`, danger: true, confirmText: '清空',
      body: '所有块都删掉，剩一张白纸 —— 想做成整页海报就该这样。之后还能一样样加回来。',
    }))) return;
    checkpoint();
    setBlocks([]);
    setSel(null);
    markDirty();
  }

  async function resetDefault() {
    if (!(await ask({
      title: '恢复默认版式？', danger: true, confirmText: '恢复',
      body: '这一页会变回初始版式，你摆的东西全丢掉。',
    }))) return;
    checkpoint();
    const nextBlocks = pageIndex === 0
      ? resolveBlocks(config?.visaTemplate, { ...workingActivity, blocks: undefined }, config?.theme).map(clone)
      : newExtraPage(designPages[pageIndex].kind).blocks;
    setBlocks(nextBlocks);
    setSel(null);
    markDirty();
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
        // mode 形如 'size:se' / 'size:n'：字母是抓着哪条边或哪个角。
        // 抓北边和西边时，改的是 x/y 和 w/h 两头 —— 对边要钉住不动
        const dir = mode.includes(':') ? mode.split(':')[1] : 'se';
        const east = dir.includes('e');
        const west = dir.includes('w');
        const south = dir.includes('s');
        const north = dir.includes('n');
        let { x, y, w, h } = s;
        if (east) w = Math.max(2, s.w + dx);
        if (west) {
          w = Math.max(2, s.w - dx);
          x = s.x + (s.w - w);          // 右边保持不动
        }
        if (south) h = Math.max(2, s.h + dy);
        if (north) {
          h = Math.max(2, s.h - dy);
          y = s.y + (s.h - h);          // 下边保持不动
        }
        // 吸附：对齐正在动的那条边
        const snapX = snapEnabled && (east || west)
          ? nearestSnap(east ? x + w : x, edgeSnapCandidates(others, 'x'), toleranceX) : null;
        const snapY = snapEnabled && (south || north)
          ? nearestSnap(south ? y + h : y, edgeSnapCandidates(others, 'y'), toleranceY) : null;
        if (snapX) {
          if (east && snapX.value - x >= 2) w = snapX.value - x;
          if (west && (x + w) - snapX.value >= 2) { w = (x + w) - snapX.value; x = snapX.value; }
        }
        if (snapY) {
          if (south && snapY.value - y >= 2) h = snapY.value - y;
          if (north && (y + h) - snapY.value >= 2) { h = (y + h) - snapY.value; y = snapY.value; }
        }
        setSnapGuides({ x: snapX?.guide ?? null, y: snapY?.guide ?? null });
        patch(b.id, { x: round(x), y: round(y), w: round(w), h: round(h) }, { record: false });
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

  /**
   * 已选中的图片块（铺满模式）上直接拖，改的是 posX/posY —— 挪图片在框里露出哪部分，
   * 不是挪这个块本身（挪块交给上面那个 ✥ 手柄）。跟手方向：手指往哪边拖，图片就跟着
   * 往哪边走（等价于 posX/posY 往反方向变），和常见修图工具的裁剪拖动手感一致。
   */
  function imagePan(e, b) {
    e.preventDefault();
    e.stopPropagation();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const blockW = (b.w / 100) * box.width;
    const blockH = (b.h / 100) * box.height;
    if (blockW <= 0 || blockH <= 0) return;
    const rad = ((b.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // 放大之后同样的 posX 变化在屏幕上走得更远，除掉倍数才保持一样的跟手速度；
    // 缩小时图比框还小、能走的距离本来就短，再放大灵敏度会很跳，所以只往上补
    const zoom = Math.max(1, b.zoom ?? 1);
    const s = { px: e.clientX, py: e.clientY, posX: b.posX ?? 50, posY: b.posY ?? 50 };
    let changed = false;

    const move = (ev) => {
      if (!changed) { checkpoint(); changed = true; }
      const dx = ev.clientX - s.px;
      const dy = ev.clientY - s.py;
      // 把屏幕位移转回区块自己没旋转时的坐标系
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      const posX = Math.min(100, Math.max(0, s.posX - (localDx / blockW / zoom) * 100));
      const posY = Math.min(100, Math.max(0, s.posY - (localDy / blockH / zoom) * 100));
      patch(b.id, { posX: round(posX), posY: round(posY) }, { record: false });
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
      // 转过头要绕回 -180..180：服务端那一段是夹住不是绕回，不绕会卡在 180 上
      let next = startRot + delta;
      if (next > 180) next -= 360;
      if (next < -180) next += 360;
      const snap = snapEnabled ? nearestSnap(next, ROTATE_SNAPS, ROTATE_SNAP_TOLERANCE) : null;
      patch(b.id, { rot: snap ? snap.value : round(next) }, { record: false });
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

  /**
   * 别人在你编辑期间存过这一场：让人自己选，不要替他决定。
   *
   * 「载入最新」会丢掉本地这一版 —— 所以先确认；「用我的覆盖」则带上
   * 服务端当前版本号再存一次，覆盖是明确的动作，不是不小心。
   */
  async function resolveConflict(body) {
    const pick = await ask({
      title: '别人刚改过这场活动',
      body: '你打开画板之后，有人保存过这一场。现在保存会把他的改动整个盖掉。',
      choices: [
        { value: 'reload', label: '载入最新（丢掉我这一版）' },
        { value: 'force', label: '用我的覆盖', danger: true },
      ],
      cancelText: '先不动，我自己看看',
    });
    if (pick === 'force') {
      // 覆盖的是「这一场」，不是整份清单：以服务端最新那份为底，
      // 只把这一场换成我的 —— 否则别人新建的活动会被我手里的旧清单抹掉
      baseRev.current = body?.activitiesRev ?? null;
      await save({ baseList: body?.activities });
      return;
    }
    if (pick === 'reload') {
      const fresh = await loadConfig().catch(() => null);
      const made = (fresh?.activities || body?.activities || []).find((a) => a.id === id);
      if (made) {
        const next = editorPages(fresh || config, made);
        pagesRef.current = next;
        const nextIndex = Math.min(pageIndexRef.current, next.length - 1);
        pageIndexRef.current = nextIndex;
        blocksRef.current = next[nextIndex]?.blocks || [];
        setDesignPages(next);
        setPageIndex(nextIndex);
        setSel(null);
        const nextFields = { en: made.en || '', issuer: made.issuer || '', desc: made.desc || made.rule || '' };
        setActivityFields(nextFields);
        activityFieldsRef.current = nextFields;
        setName(made.name || '');
        nameRef.current = made.name || '';
      }
      baseRev.current = fresh?.activitiesRev ?? body?.activitiesRev ?? null;
      savedVersion.current = editVersion.current;
      setDirty(false);
      toast('已载入别人保存的最新版本', 'ok');
    }
  }

  async function save({ baseList = null } = {}) {
    flushInlineEdit();
    setBusy('save');
    let saved = false;
    try {
      const savingVersion = editVersion.current;
      const pages = pagesRef.current || [];
      const list = (baseList || activities).map((a) => (a.id === id ? {
        ...a,
        ...activityFieldsRef.current,
        blocks: pages[0]?.blocks || [],
        extraPages: pages.slice(1).map((p) => ({
          id: p.id, kind: p.kind, title: p.title, requireCheckin: p.requireCheckin === true,
          blocks: p.blocks || [],
        })),
        name: nameRef.current.trim() || a.name,
      } : a));
      const res = await api('/api/admin/activities', {
        method: 'POST', token,
        body: { activities: list, ...(baseRev.current === null ? {} : { rev: baseRev.current }) },
      });
      const made = res.activities.find((a) => a.id === id);
      // 请求期间又打了字：这一版已经存上了，但界面上要留着人正在写的东西，
      // 不能拿服务端返回的那份重画（页名、活动名、文字块都会被打回去）
      const stillMine = editVersion.current === savingVersion;
      if (made && stillMine) {
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
      savedVersion.current = savingVersion;
      baseRev.current = res?.activitiesRev ?? baseRev.current;
      await loadConfig();
      setDirty(!stillMine);
      toast(stillMine ? '已保存，所有人的护照上都换了' : '已保存；你刚打的字还留着，记得再存一次', 'ok');
      saved = true;
    } catch (err) {
      if (err?.status === 409 && err.body?.conflict) {
        setBusy(null);
        await resolveConflict(err.body);
        return;
      }
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
    // 保存完主动问要不要发通知。选「去写通知」就跳到这场活动的推送卡片
    if (saved && await ask({
      title: '要推送通知告诉大家吗？',
      body: '页面已经保存，大家的护照上都换了。要不要发一条通知提醒大家？会跳到这场活动的推送卡片，选发给谁、改内容，发送前还会再确认一次。',
      confirmText: '去写通知',
    })) {
      nav(`/staff/admin/a/${id}#notify`);
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
            markDirty();
          }} />
        <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty} onClick={save}>
          {busy === 'save' ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </div>
      {/* 别人在你编辑期间存过这一场：先说一声，别等保存冲突了才知道 */}
      {dirty && baseRev.current !== null && config?.activitiesRev !== undefined
        && config.activitiesRev !== baseRev.current ? (
          <div className="card card--tight row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span className="small" style={{ color: 'var(--yellow)' }}>
              ⚠ 别人刚保存过这一场，你手上这版是基于旧的。
            </span>
            <button type="button" className="btn btn--sm btn--ghost"
              onClick={() => resolveConflict({ activitiesRev: config.activitiesRev })}>
              处理一下
            </button>
          </div>
        ) : null}
      <div className="design__pages card">
        <div className="design__page-tabs" role="tablist" aria-label="活动页面">
          {designPages.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={pageIndex === i}
              data-page-tab={i}
              className={`design__page-tab ${pageIndex === i ? 'design__page-tab--on' : ''}`
                + `${dragTab === i ? ' design__page-tab--dragging' : ''}`}
              title={i === 0 ? '活动信息页固定在第一页' : '拖动可以调整装订顺序'}
              // pan-x：手指横滑照样能滚这条页签条，按住 0.3 秒才进入排序
              style={{ touchAction: 'pan-x', cursor: i === 0 ? undefined : 'grab' }}
              onPointerDown={(e) => startTabDrag(e, i)}
              onPointerMove={moveTabDrag}
              onPointerUp={(e) => endTabDrag(e, i)}
              onPointerCancel={(e) => endTabDrag(e, i)}
              // 信息页没有拖动，点击照常切页；其余页的切换在 endTabDrag 里做
              onClick={i === 0 ? () => selectPage(0) : undefined}>
              <span>{i + 1}</span>
              <b>{p.title}</b>
            </button>
          ))}
        </div>
        <div className="design__page-actions">
          <button className="btn btn--sm btn--ghost" onClick={() => addPage('photo')}>＋ 照片<span className="design__narrow-hide">页</span></button>
          <button className="btn btn--sm btn--ghost" onClick={() => addPage('summary')}>＋ 总结<span className="design__narrow-hide">页</span></button>
          <button className="btn btn--sm btn--ghost" onClick={() => addPage('blank')}>＋ 空白<span className="design__narrow-hide">页</span></button>
          {pageIndex > 0 ? (
            <>
              {/* 手机上这两个按钮藏起来：页签本来就能拖着排序，横排挤不下 */}
              <button className="btn btn--sm btn--ghost design__page-move" disabled={pageIndex <= 1}
                onClick={() => movePage(-1)} title="往前挪一页">←</button>
              <button className="btn btn--sm btn--ghost design__page-move" disabled={pageIndex >= designPages.length - 1}
                onClick={() => movePage(1)} title="往后挪一页">→</button>
              <button className="btn btn--sm btn--danger" onClick={deletePage}>
                删除<span className="design__narrow-hide">本页</span>
              </button>
            </>
          ) : null}
          {/* 页名用 ImeInput：普通受控 input 在拼音选字期间会被 React 重写，
              打一半的字直接没了 —— 页名几乎都是中文，最容易撞上 */}
          {pageIndex > 0 ? (
            <ImeInput className="input design__page-title" value={designPages[pageIndex].title}
              maxLength={24} aria-label="页面名称" placeholder="页面名称"
              onFocus={checkpoint}
              onValue={(value) => renamePage(value)} />
          ) : null}
        </div>
        {pageIndex === 0 ? (
          <div className="tiny dim">第 1 页是活动信息页，始终保留；后续页面可以新增、排序或删除。</div>
        ) : (
          <label className="row design__page-gate" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input type="checkbox" checked={designPages[pageIndex].requireCheckin === true}
              onChange={(e) => setPageCheckin(e.target.checked)} />
            <span>仅已签到的人可看这一页的内容和照片</span>
          </label>
        )}
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
          <span aria-hidden="true">🧲</span><b>{snapEnabled ? '吸附已开' : '吸附已关'}</b>
        </button>
        <button className="btn btn--sm btn--ghost design__mode-button"
          aria-pressed={canvasFullscreen} onClick={toggleCanvasFullscreen}
          title={canvasFullscreen ? '退出全屏编辑' : '全屏编辑'}>
          <span aria-hidden="true">{canvasFullscreen ? '⊡' : '⛶'}</span><b>{canvasFullscreen ? '退出全屏' : '全屏编辑'}</b>
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
        onPointerDown={() => { flushInlineEdit(); setSel(null); setInspectorOpen(false); setInlineText(null); }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          overflow: 'hidden', touchAction: 'none', background: '#000',
          transform: `translate3d(${canvasView.x}px, ${canvasView.y}px, 0) scale(${canvasView.scale})`,
          transformOrigin: 'center center',
        }}
      >
        <VisaPageFrame theme={config.theme} activity={workingActivity} pageId={designPages?.[pageIndex]?.id}
          showReviewEntry={pageIndex === 0 && (designPages?.length || 0) > 1}>
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, containerType: 'size' }}>
            {blocks.map((b) => {
              const on = b.id === sel;
              // 已选中的图片块（铺满/裁剪模式）身上直接拖是在挪图片露出哪部分，
              // 不是挪这个块 —— 挪块请用选中框上方的 ✥ 手柄。
              // 「配图」的图来自活动数据（data.photo），不是块自己的 src。
              const hasPhoto = b.kind === 'image' ? !!b.src : b.kind === 'photo' && !!data.photo;
              const panImage = on && hasPhoto;
              return (
                <div
                  key={b.id}
                  onPointerDown={(e) => (panImage ? imagePan(e, b) : blockTouch(e, b))}
                  style={{
                    position: 'absolute',
                    left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`,
                    transform: b.rot ? `rotate(${b.rot}deg)` : undefined,
                    opacity: b.opacity ?? 1,
                    zIndex: on ? 20 : undefined,
                    outline: on ? 'none' : '1px dashed rgba(120,120,120,.45)',
                    outlineOffset: 1, cursor: panImage ? 'grab' : 'move', touchAction: 'none',
                  }}
                >
                  <BlockBody
                    b={b}
                    data={data}
                    editing
                    inlineEditing={inlineText === b.id}
                    onTextChange={(field, value, meta) => {
                      inlineChange(b, field, value);
                      if (meta?.truncated) {
                        toast(`这一块最多 ${meta.max} 字，超出的部分已经去掉了。剩下的内容请放到另一个文字块里`, 'warn');
                      }
                    }}
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
              {/* 移动把手。点一下文字块就进了改字模式，这时在字上拖是选字 / 滚动，
                  块挪不动 —— 按住这个拖，任何时候都能移动（顺带退出改字） */}
              <button title="按住拖动来移动" aria-label="拖动移动区块"
                style={{ cursor: 'move' }}
                onPointerDown={(e) => drag(e, selected, 'move')}>✥</button>
              <button title="文字样式" aria-label="文字样式"
                onClick={() => openInspector(selected.id)}>⚙</button>
              <button title="删除" aria-label="删除区块" onClick={() => remove(selected.id)}>🗑</button>
            </div>
            <button className="design__rotate-handle" title="拖动旋转（吸附开时每 15° 一档）" aria-label="拖动旋转区块"
              style={{
                top: selected.y < 7 ? 3 : -17,
                right: selected.x + selected.w > 97 ? 3 : -17,
              }}
              onPointerDown={(e) => rotateDrag(e, selected)}>↻</button>
            {/* 八个把手：四角改两边，四边中点只改一条边。
                旋转过的块也照常用 —— 位移已经在块自己的坐标系里算过了 */}
            {RESIZE_HANDLES.map((h) => (
              <div
                key={h.dir}
                className={`design__resize-handle design__resize-handle--${h.dir}`}
                onPointerDown={(e) => drag(e, selected, `size:${h.dir}`)}
                title={h.title}
                aria-label={h.title}
              />
            ))}
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
            onPickGalleryImages={(files) => pickGalleryImages(files, selected.id)}
            onPickVideo={(f) => pickVideo(f, selected.id)}
            onPickVideoPoster={(f) => pickVideoPoster(f, selected.id)}
          />

          {selected.kind === 'text' && (() => {
            const n = [...(selected.text || '')].length;
            const full = n >= TEXT_BLOCK_MAX;
            return (
              <div className="tiny dim" style={full ? { color: '#ff9b8a' } : undefined}>
                字数 {n} / {TEXT_BLOCK_MAX}{full ? ' · 已经满了，再多的内容放到另一个文字块里' : ''}
              </div>
            );
          })()}

          <Slider label="透明度" value={selected.opacity ?? 1} min={0.05} max={1} step={0.05}
            onChange={(v) => patch(selected.id, { opacity: v })} />
          <Slider label="旋转" value={selected.rot || 0} min={-180} max={180} step={1}
            onChange={(v) => patch(selected.id, { rot: v })} suffix="°" />

          {selected.kind !== 'links' && selected.kind !== 'gallery' && (
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
function Inspector({ b, patch, sources, busy, onPickImage, onPickGalleryImages, onPickVideo, onPickVideoPoster }) {
  const toast = useToast();
  if (b.kind === 'icon') {
    return (
      <>
        <div className="tiny dim">挑一个图标，拖角上的把手调大小；链接在下面填。</div>
        {/* IconPicker 选中时会顺手回一个建议名字（那是给「页面链接」用的），
            这里只取 icon，多出来的字段丢掉就行 */}
        <IconPicker value={b.icon || '📍'} onChange={(v) => patch({ icon: v.icon })} />
      </>
    );
  }

  if (b.kind === 'qr') {
    // icon 存法：空 = 跟这场活动的图标，'M' = 护照徽章，其它 = 自选的 emoji
    const mode = !b.icon ? 'activity' : b.icon === 'M' ? 'badge' : 'custom';
    return (
      <>
        <div className="tiny dim">这场活动的报名二维码。参与者在自己的签证页上点开，能放大、分享给朋友；朋友扫码进入报名页。中间的图标可以换。活动改成「已办完」之后，护照上会自动隐藏这个码，改回「还没到」或「进行中」又会出现；开场后扫码进来的人照样能登记，总控台会标成「补报名」。</div>
        <div className="tiny dim">中间的图标</div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {[['activity', '跟活动图标'], ['badge', '护照徽章 M'], ['custom', '自选图标']].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={mode === k}
              className={`btn btn--sm grow ${mode === k ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => patch({ icon: k === 'activity' ? '' : k === 'badge' ? 'M' : (mode === 'custom' ? b.icon : '⭐') })}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'custom' && <IconPicker value={b.icon} onChange={(v) => patch({ icon: v.icon })} />}
        <label className="stack-sm" style={{ gap: 3 }}>
          <div className="tiny dim">旁边的说明（最多 16 字，留空显示「扫码报名」）</div>
          <ImeInput className="input" maxLength={16} value={b.label ?? ''} placeholder="扫码报名"
            onValue={(v) => patch({ label: v })} />
        </label>
      </>
    );
  }

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
        <select className="input" value={b.fit || 'cover'} onChange={(e) => patch({ fit: e.target.value })}>
          <option value="cover">铺满（会裁掉边）</option>
          <option value="contain">完整显示（会留白）</option>
        </select>
        <div className="tiny dim">关掉这个面板后可以直接在画布上的图上拖动，选显示图片的哪一部分。缩放调小会把原来裁掉的部分重新显示出来，空出的地方留白。</div>
        <Slider label="左右" value={b.posX ?? 50} min={0} max={100} step={1}
          onChange={(v) => patch({ posX: v })} suffix="%" />
        <Slider label="上下" value={b.posY ?? 50} min={0} max={100} step={1}
          onChange={(v) => patch({ posY: v })} suffix="%" />
        <Slider label="缩放" value={Math.round((b.zoom ?? 1) * 100)} min={25} max={400} step={5}
          onChange={(v) => patch({ zoom: v / 100 })} suffix="%" />
      </>
    );
  }

  if (b.kind === 'links') {
    return <div className="tiny dim">这一场的页面链接，在活动详情页里加。这里只管它摆在哪。</div>;
  }

  if (b.kind === 'video') {
    return (
      <>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
            {busy === 'video' ? '上传中…' : b.src ? '换一段' : '选一段视频'}
            <input type="file" accept="video/*" hidden disabled={busy === 'video'}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPickVideo(f); }} />
          </label>
          <select className="input grow" value={b.fit || 'contain'} onChange={(e) => patch({ fit: e.target.value })}>
            <option value="contain">完整显示（会留黑边）</option>
            <option value="cover">铺满（会裁掉边）</option>
          </select>
        </div>
        <div className="tiny dim">
          上限 100MB，mp4（H.264）各家浏览器都认，iPhone 直出的 mov 和 webm 也收。
          更长的片子传到 YouTube / 网盘，再用「页面链接」挂过去。
          翻到这一页不会自动下载整段，参与者点了才开始加载。
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
            {busy === 'poster' ? '上传中…' : b.poster ? '换封面图' : '选封面图（选填）'}
            <input type="file" accept="image/*" hidden disabled={busy === 'poster'}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onPickVideoPoster(f); }} />
          </label>
          {b.poster && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => patch({ poster: '' })}>清掉封面</button>
          )}
        </div>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={!!b.loop} onChange={(e) => patch({ loop: e.target.checked })} />
          <span className="small">循环播放</span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={!!b.autoplay}
            onChange={(e) => patch({ autoplay: e.target.checked, muted: e.target.checked ? true : b.muted })} />
          <span className="small">翻到就自动播放（浏览器只允许静音自动播放）</span>
        </label>
        {!b.autoplay && (
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!b.muted} onChange={(e) => patch({ muted: e.target.checked })} />
            <span className="small">默认静音</span>
          </label>
        )}
        <Slider label="圆角" value={b.radius || 0} min={0} max={50} step={1}
          onChange={(v) => patch({ radius: v })} suffix="%" />
      </>
    );
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
          <select className="input grow" value={b.fit || 'cover'} onChange={(e) => patch({ fit: e.target.value })}>
            <option value="cover">铺满（会裁掉边）</option>
            <option value="contain">完整显示（会留白）</option>
          </select>
        </div>
        <div className="tiny dim">关掉这个面板后可以直接在画布上的图片上拖动，选显示图片的哪一部分。缩放调小会把原来裁掉的部分重新显示出来，空出的地方留白。</div>
        <Slider label="左右" value={b.posX ?? 50} min={0} max={100} step={1}
          onChange={(v) => patch({ posX: v })} suffix="%" />
        <Slider label="上下" value={b.posY ?? 50} min={0} max={100} step={1}
          onChange={(v) => patch({ posY: v })} suffix="%" />
        <Slider label="缩放" value={Math.round((b.zoom ?? 1) * 100)} min={25} max={400} step={5}
          onChange={(v) => patch({ zoom: v / 100 })} suffix="%" />
        <Slider label="圆角" value={b.radius || 0} min={0} max={50} step={1}
          onChange={(v) => patch({ radius: v })} suffix="%" />
      </>
    );
  }

  if (b.kind === 'gallery') {
    const photos = b.photos || [];
    const move = (i, d) => {
      const to = i + d;
      if (to < 0 || to >= photos.length) return;
      const next = [...photos];
      [next[i], next[to]] = [next[to], next[i]];
      patch({ photos: next });
    };
    return (
      <>
        <div className="tiny dim">首屏显示精选缩略图；参与者点“查看全部”后浏览完整图库。照片顺序就是展示顺序。</div>
        <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer', alignSelf: 'flex-start' }}>
          {busy === 'gallery' ? '上传中…' : '＋ 从设备选择多张'}
          <input type="file" accept="image/*" multiple hidden disabled={busy === 'gallery'}
            onChange={(e) => {
              // 先把 FileList 拷成数组再清空这个 input —— value='' 会把 files 一起清掉，
              // 直接把 FileList 传下去的话，拿到的是一个已经空掉的列表：点了没反应
              const files = [...(e.target.files || [])];
              e.target.value = '';
              onPickGalleryImages(files);
            }} />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <label className="stack-sm grow" style={{ gap: 3 }}>
            <span className="tiny dim">首屏张数</span>
            <select className="input" value={b.featured || 6} onChange={(e) => patch({ featured: Number(e.target.value) })}>
              {[3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} 张</option>)}
            </select>
          </label>
          <label className="stack-sm grow" style={{ gap: 3 }}>
            <span className="tiny dim">每行</span>
            <select className="input" value={b.cols || 3} onChange={(e) => patch({ cols: Number(e.target.value) })}>
              {[2, 3, 4].map((n) => <option key={n} value={n}>{n} 张</option>)}
            </select>
          </label>
        </div>
        {!photos.length ? <div className="small dim">还没有照片。可以从设备选择，或在参与者素材库连续点“加入图库”。</div> : null}
        <div className="design__gallery-list">
          {photos.map((src, i) => (
            <div key={`${src}-${i}`} className="design__gallery-item">
              <img src={src} alt={`图库第 ${i + 1} 张`} />
              <b>{i + 1}</b>
              <button className="btn btn--sm btn--ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn btn--sm btn--ghost" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn btn--sm btn--ghost" onClick={() => patch({ photos: photos.filter((_, k) => k !== i) })}>移除</button>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {b.kind === 'text' ? (
        <>
          <div className="tiny dim">
            可以直接在画布里点字修改。手机上在画布里粘贴不顺手的话，就在下面这个框里改 ——
            长按就有粘贴、复制、全选。
          </div>
          {/* 普通的多行输入框：系统长按菜单（粘贴 / 复制 / 全选）在它上面一定可用，
              画布里的 contentEditable 在手机浏览器上没这么可靠 */}
          <ImeInput
            as="textarea"
            className="input"
            rows={6}
            value={b.text || ''}
            maxLength={TEXT_BLOCK_MAX}
            aria-label="文字内容"
            placeholder="在这里输入或粘贴文字"
            style={{ resize: 'vertical', lineHeight: 1.6 }}
            // 浏览器的 maxLength 会把超出的粘贴内容悄悄吞掉，得在粘贴那一下说出来
            onPaste={(e) => {
              const el = e.currentTarget;
              const pasted = e.clipboardData?.getData('text') || '';
              const after = el.value.length - (el.selectionEnd - el.selectionStart) + pasted.length;
              if (after > TEXT_BLOCK_MAX) {
                toast(`这一块最多 ${TEXT_BLOCK_MAX} 字，这次粘贴超出了 ${after - TEXT_BLOCK_MAX} 字，超出的部分没有进来。剩下的内容请放到另一个文字块里`, 'warn');
              }
            }}
            onValue={(v) => patch({ text: v })}
          />
        </>
      ) : (
        <div className="tiny dim">文字内容请直接在画布中点击修改。</div>
      )}
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
