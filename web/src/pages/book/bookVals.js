/**
 * 把实时数据喂给护照册的视觉层。
 *
 * 这一层是**纯只读**的：设计稿里那些用来演示的交互（点盖章循环改分、
 * 选身份、按钮用掉 Token、改姓名）在这里全部被中和成展示或说明，
 * 真正的写入只发生在工作人员端。
 */

/** 翻页动画时长。两个方向共用同一段关键帧，向前翻是倒放。 */
export const FLIP_MS = 420;
export const FLIP_EASE = 'cubic-bezier(.42,0,.35,1)';

/* --------------------------- Code 39 条码 --------------------------- */

const C39 = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
  'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
  'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
  'Z':'nwwnwnnnn','-':'nwnnnnwnw','*':'nwnnwnwnn',
};

function code39(no, unit = 1.5, color = 'var(--pp-text)') {
  const out = [];
  const chars = ('*' + no + '*').split('');
  chars.forEach((ch, ci) => {
    const pat = C39[ch] || C39['0'];
    for (let i = 0; i < 9; i++) {
      out.push({ w: pat[i] === 'w' ? unit * 2.2 : unit, c: i % 2 === 0 ? color : 'transparent' });
    }
    if (ci < chars.length - 1) out.push({ w: unit, c: 'transparent' });
  });
  return out;
}

/* ------------------------------ 常量 ------------------------------ */

const TONES = { cream: '#f3ede0', ivory: '#f7f2e7', blue: '#eceff0' };

/* ---------------------------- 护照模版 ---------------------------- */

/**
 * 后台改不到、或者还没拉到配置时用的兜底。字段和 server/src/config.js
 * 的 THEME 一一对应 —— 那边是权威，这边只保证离线首帧不至于没颜色。
 */
const THEME_FALLBACK = {
  ink: '#5c1a22', gold: '#e6cd91', paper: '#f3ede0', text: '#2a2320',
  watermark: 0.13, stamp: '#2f6148',
  coverIssuer: 'GCGCM', coverSub: '人 生 国',
  coverTitle: '人生护照', coverEn: 'PASSPORT',
};

/**
 * 这本护照最终用的配色：默认 → 全局设置 → 本人自己改的，依次覆盖。
 *
 * 徽章图也要用它 —— 分享出去的那张图和护照长得不一样的话，
 * 收到的人不会把两者联系起来。
 */
export function passportTheme(config, me) {
  return { ...THEME_FALLBACK, ...(config?.theme || {}), ...(me?.theme || {}) };
}

const hex2rgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbStr = (h) => hex2rgb(h).join(',');
const shade = (h, k) => {
  // k < 1 变暗，k > 1 变亮。设计稿里有三档金，后台只让人调最亮的那档，
  // 另外两档按固定比例跟着走 —— 让人分别调三个金色，调出来的只会更难看
  const [r, g, b] = hex2rgb(h);
  const f = (x) => Math.max(0, Math.min(255, Math.round(k <= 1 ? x * k : x + (255 - x) * (k - 1))));
  return `#${[f(r), f(g), f(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * 把模版摊成 CSS 变量，注入在护照册最外层。
 *
 * 设计稿里那些写死的色值在转换时已经被机械替换成 var(--pp-ink) 之类
 * （见 design/convert.py 的调色板补丁），所以这里给出的变量名和数量
 * 必须和那份补丁对得上，改名要两边一起改。
 */
export function themeVarsOf(theme) {
  const t = { ...THEME_FALLBACK, ...(theme || {}) };
  const gold2 = shade(t.gold, 0.86);   // 设计稿里的 #c6a45f：封面的细线和圆环
  const gold3 = shade(t.gold, 0.68);   // 设计稿里的 #9c7c3c：恩典代币的深边
  return {
    '--pp-ink': t.ink, '--pp-ink-rgb': rgbStr(t.ink),
    '--pp-gold': t.gold, '--pp-gold-rgb': rgbStr(t.gold),
    '--pp-gold-2': gold2, '--pp-gold-2-rgb': rgbStr(gold2),
    '--pp-gold-3': gold3, '--pp-gold-3-rgb': rgbStr(gold3),
    '--pp-text': t.text, '--pp-text-rgb': rgbStr(t.text),
    '--pp-paper': t.paper,
  };
}

/* -------------------------- 签证页模版 -------------------------- */

/**
 * 拉不到配置时的兜底，字段和 server/src/config.js 的 VISA_TEMPLATE 对应。
 * 这份只保证首帧不至于是一张白页，权威在服务端。
 */
const VISA_TPL_FALLBACK = {
  banner: 'VISA',
  stationLabel: 'STATION 活动',
  annotationLabel: 'ANNOTATION 备注',
  showPhoto: true, showAnnotation: true, showLinks: true,
  rows: [
    { key: 'post',    label: 'ISSUING AUTHORITY 签发机构', src: 'post' },
    { key: 'control', label: 'NUMBER 编号',             src: 'control' },
    { key: 'surname', label: 'SURNAME 姓',              src: 'surname' },
    { key: 'given',   label: 'GIVEN NAMES 名',          src: 'given' },
    { key: 'type',    label: 'VISA TYPE 类型',          src: 'tag' },
    { key: 'staff',   label: 'STAFF 工作人员',          src: 'host' },
    { key: 'entries', label: 'ENTRIES 入境次数',        src: 'text', text: 'ONE 一次' },
    { key: 'issued',  label: 'ISSUING DATE 签发日期',   src: 'date' },
    { key: 'expiry',  label: 'EXPIRATION DATE 有效期',  src: 'text', text: 'ETERNAL 无尽无穷', accent: true },
  ],
};

/**
 * 默认版式：把今天这一页翻译成一组块的坐标。
 *
 * 这些数字是照着原来那份 flex 排版量出来的，所以「还没设计过」的活动
 * 看起来和以前一模一样。同工一旦在编辑器里动过，就存自己那份 blocks，
 * 从此和这里无关。
 *
 * 单位是页面框的百分比。横版页的宽高比不是定值（它等于手机屏的高宽比），
 * 所以这里只能取一个常见比例来定坐标 —— 特别长或特别方的屏上会有出入。
 */
/**
 * 横幅右边那两行字：印这一场活动的名字。
 *
 * 原来印的是全书统一的「MINI LIFE GAME / 迷你人生游戏」—— 一本护照里
 * 每一页都一样，等于没说。签证页本来就是「哪一场」的那一页，这两行
 * 是页面上最显眼的位置，给活动名最合适。
 *
 * 没填英文名的活动，中文名直接占主行 —— 否则大字那行空着，只剩一行小字。
 */
export function bannerBrandOf(station) {
  const en = String(station?.en || '').trim();
  const cn = String(station?.name || '').trim();
  if (en) return { brand: en.toUpperCase(), brandCn: cn };
  return { brand: cn || 'GCGCM', brandCn: '' };
}

function defaultBlocks(tpl, station) {
  const out = [];
  const push = (b) => out.push({ rot: 0, opacity: 1, href: '', ...b });

  push({ id: 'banner', kind: 'banner', x: 4, y: 12.5, w: 92, h: 11,
         word: tpl.banner, ...bannerBrandOf(station) });

  push({ id: 'fields', kind: 'fields', x: 4.5, y: 27, w: 52, h: 62,
         cols: 2, rows: tpl.rows });

  let y = 27;
  if (tpl.showPhoto !== false && station?.photo) {
    push({ id: 'photo', kind: 'photo', x: 60, y, w: 36, h: 21, fit: 'cover' });
    y += 24;
  }
  push({ id: 'station', kind: 'station', x: 60, y, w: 36, h: 16, label: tpl.stationLabel });
  y += 18;
  if (tpl.showAnnotation !== false) {
    push({ id: 'note', kind: 'note', x: 60, y, w: 36, h: 100 - y - 14, label: tpl.annotationLabel });
  }

  if (tpl.showLinks !== false && (station?.links || []).length) {
    push({ id: 'links', kind: 'links', x: 4.5, y: 80, w: 52, h: 8 });
  }

  return out;
}

/**
 * 这一页最终画哪些块。
 *
 *   activity.blocks  同工在编辑器里排过的，整份用它
 *   否则             按默认版式生成那几个块，
 *                    再把老的自由画布元素接在后面
 *
 * 只有这一个入口，编辑器和真页面都走它 —— 两边各算各的，迟早对不上。
 */
export function resolveBlocks(template, station, theme) {
  // 只看「有没有这个字段」，不看长度：空数组是同工把块删光了，
  // 那就是他要的白页，不该被当成「没设计过」又把默认版式塞回去
  // 机读 footer 属于护照固定模板，不再接受活动画板保存的位置或字号。
  if (Array.isArray(station?.blocks)) return station.blocks.filter((b) => b?.kind !== 'mrz');
  // 横幅右边那两行字原来存在护照模版里（那时它是全书统一的）。
  // 现在按活动名生成，同工照样能在编辑器里一场一场改
  return defaultBlocks(resolveVisaTemplate(template), station);
}

/**
 * 块要用到的那些「每个人不一样」的值，在这里一次算好。
 *
 * 键名和 server/src/config.js 的 VISA_ROW_SOURCES 一一对应 —— 加一个来源，
 * 那边加一行、这里加一个键、VisaBlocks 的 bindRow 加一个 case，三处齐了才生效。
 */
export function blockData({
  station, me, theme, passportNo, surname, given,
  visaScore, isCheckin, stampTone, stampDate, doneCount, signed,
}) {
  // 签发机构：这一场自己填的优先，没填就用护照模版上的那个（整本护照的签发方）
  const issuer = String(station?.issuer || '').trim() || theme?.coverIssuer || 'GCGCM';
  const visaNo = visaNoOf(station, issuer);
  return {
    // 持照人
    player: me?.name || '',
    code: me?.code || '',
    passport: passportNo,
    contact: me?.contact || '',
    visited: String(doneCount ?? 0),
    // 这一页
    stampDate: stampDate || '',
    signed: signed ? '已报名' : '——',
    post: issuer,
    // 编号和机读码共用一套：签发机构 + YYYYMMDD。
    control: visaNo,
    surname, given,
    tag: station?.tag || '',
    host: station?.host || station?.staff || '',
    // 活动自己的日期；还没定的写「待定」，比印一个假日期诚实
    date: station?.date || 'TBC 待定',
    name: station?.name || '',
    en: String(station?.en || '').toUpperCase(),
    status: visaScore == null ? '— —' : isCheckin ? '✓' : (visaScore > 0 ? '+' : '') + visaScore,
    statusFg: visaScore == null ? 'rgba(var(--pp-text-rgb),.45)' : stampTone,
    desc: station?.desc || station?.rule || '',
    photo: station?.photo || '',
    links: station?.links || [],
    mrz1: visaMrzLine(1, { surname, given, visaNo, passportNo, code: me?.code }),
    mrz2: visaMrzLine(2, { surname, given, visaNo, passportNo, code: me?.code }),
  };
}

/**
 * 默认版式用的那份常量（服务端下发，见 config.js 的 VISA_TEMPLATE）。
 *
 * 以前活动可以用 page 字段覆盖它的某几项，那是画布编辑器出现之前的做法；
 * 现在版式整份在画布里排，覆盖某几项这回事没有了。
 */
export function resolveVisaTemplate(template) {
  const tpl = { ...VISA_TPL_FALLBACK, ...(template || {}) };
  if (!Array.isArray(tpl.rows) || !tpl.rows.length) tpl.rows = VISA_TPL_FALLBACK.rows;
  return tpl;
}

/** 封面那块烫金压纹的底：从主色上下各推一档，比单色平涂有厚度 */
export function coverBgOf(theme) {
  const ink = (theme || {}).ink || THEME_FALLBACK.ink;
  return `linear-gradient(155deg,${shade(ink, 1.14)} 0%,${ink} 45%,${shade(ink, 0.82)} 100%)`;
}

// 盖章颜色对应分档：3 勉强 / 6 正常 / 9 出色
const STAMP_TONE = { 3: '#4a5b6a', 6: '#2f6148', 9: '#a63a2a' };
const STAMP_WORD = { 3: '勉强完成', 6: '正常完成', 9: '出色完成' };
// 每一关盖章的位置和角度都不同，避免八页看起来像复制粘贴
const STAMP_SPOT = [
  { t: '50%', l: '52%', r: '-14deg' }, { t: '48%', l: '9%',  r: '11deg' },
  { t: '20%', l: '30%', r: '-7deg' },  { t: '54%', l: '58%', r: '17deg' },
  { t: '14%', l: '22%', r: '8deg' },   { t: '50%', l: '38%', r: '-19deg' },
  { t: '56%', l: '60%', r: '13deg' },  { t: '46%', l: '24%', r: '-11deg' },
];

/** 玩法页（点页眉的 ? 打开）。原来讲的是迎新那一晚的闯关规则，改成讲打卡本 */
const GUIDE = [
  { n: 1, cn: '领取并保管', en: 'GET YOUR PASSPORT',
    body: '人生护照随时都可以领取，不受任何活动是否开始影响。记住个人编号和四位密码，换手机后可以找回同一本。' },
  { n: 2, cn: '扫描活动海报', en: 'SIGN UP',
    body: '海报二维码打开的是那一场活动：显示“报名中”时可以报名；活动开始后会显示报名截止；办完后会显示活动已结束。' },
  { n: 3, cn: '翻到活动签证', en: 'YOUR VISA PAGES',
    body: '每场活动至少有一张信息页，也可以继续装订照片页和总结页。页顶的“上传”可以把文字或照片交给活动同工。' },
  { n: 4, cn: '到场出示护照码', en: 'GET STAMPED',
    body: '现场打开护照二维码给同工扫描，同工会在对应活动页盖“已参加”章。每场只盖一次，盖完手机上立即更新。' },
  { n: 5, cn: '随时回来翻阅', en: 'KEEP THE JOURNEY',
    body: '你可以继续修改姓名、头像、联系方式和护照配色。这里记录的不是输赢，而是你来过、参与过、和大家一起走过。' },
];


/** 页码表：每场活动至少一张信息页，后面可继续装订照片页和总结页。 */
export function buildPages(stations) {
  const visas = stations.flatMap((st, i) => {
    const extras = Array.isArray(st?.extraPages) ? st.extraPages : [];
    return [
      {
        kind: 'visa', i, subPage: 0, pageId: 'info', pageTitle: '活动信息',
        label: `签证 ${String(i + 1).padStart(2, '0')} ${st.name} · 活动信息`,
      },
      ...extras.map((p, j) => ({
        kind: 'visa', i, subPage: j + 1, pageId: p.id, pageTitle: p.title || `第 ${j + 2} 页`,
        label: `签证 ${String(i + 1).padStart(2, '0')}.${j + 2} ${st.name} · ${p.title || '附加页'}`,
      })),
    ];
  });
  return [
    { kind: 'cover',   label: 'COVER 封面' },
    { kind: 'inside',  label: '欢迎 WELCOME' },
    { kind: 'notes',   label: '导航 INDEX' },
    { kind: 'data',    label: '资料页 DATA PAGE' },
    ...visas,
    { kind: 'closing', label: '结语 CLOSING' },
  ];
}

/* ------------------------------ 工具 ------------------------------ */

const clean = (s, fb) => (String(s || '') || fb).toUpperCase().replace(/[^A-Z0-9]/g, '') || fb;

/**
 * 报名时没填姓 / 名的话，按护照惯例从整个名字猜：
 * 中文取首字为姓，西文按空格拆，最后一段当姓。
 * 猜错很正常（复姓、双名、中间名），所以报名页允许自己填，填了就以填的为准。
 */
export function splitName(full) {
  const name = String(full || '').trim();
  if (!name) return { surname: '', given: '' };
  if (/\s/.test(name)) {
    const parts = name.split(/\s+/);
    return { surname: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
  }
  if (/[一-龥]/.test(name) && name.length >= 2) {
    return { surname: name.slice(0, 1), given: name.slice(1) };
  }
  return { surname: name, given: '' };
}

/** 护照号：从选手编号稳定推导，永远不变 */
export function passportNoOf(code) {
  return 'GCGCM' + String(code || '0').replace(/\D/g, '').padStart(6, '0');
}

/** 活动日期 → YYYYMMDD；兼容数据库里迁移前的「19 SEP 2026」。 */
export function dateCodeOf(value) {
  const raw = String(value || '').trim();
  let m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(raw);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(raw);
  if (!m) return '';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
  return month ? `${m[3]}${String(month).padStart(2, '0')}${String(m[1]).padStart(2, '0')}` : '';
}

/** 一场活动的签证编号：签发机构 + 数字年月日。 */
export function visaNoOf(station, issuer = 'GCGCM') {
  const authority = clean(issuer, 'GCGCM').slice(0, 8);
  return authority + (dateCodeOf(station?.date) || 'TBC');
}

function mrzLine(n, { surname, given, passportNo, code, total }) {
  const pad = (s, len) => (s + '<'.repeat(Math.max(0, len - s.length))).slice(0, len);
  if (n === 1) return pad('P<GCGCM' + clean(surname, 'PLAYER') + '<<' + clean(given, 'ONE'), 38);
  // 尾巴上那个数字是参加过几场，不是分数 —— 页眉那两处早就从 PTS 改成
  // VISAS 了，机读码这一行是最后一处还写着 PTS 的地方
  return pad(passportNo + '<GCGCM<' + clean(code, '00') + '<' + String(total).padStart(2, '0') + 'VISAS', 38);
}

function visaMrzLine(n, { surname, given, visaNo, passportNo, code }) {
  const pad = (s, len) => (s + '<'.repeat(Math.max(0, len - s.length))).slice(0, len);
  if (n === 1) return pad('V<GCGCM' + clean(surname, 'PLAYER') + '<<' + clean(given, 'ONE'), 38);
  return pad(clean(visaNo, 'GCGCMTBC') + '<' + passportNo + '<' + clean(code, '00'), 38);
}

/* ---------------------------- 主构建函数 ---------------------------- */

/**
 * @param {object} args
 *  me         选手状态（来自 /api/me，只读）
 *  rank, of   排名
 *  config     游戏配置
 *  board      实时排行榜
 *  ui         { page, overlay, modal, vpLandscape, qrThumb, qrBigImg }
 *  actions    { move, goto, setOverlay, setModal, share }
 */
export function buildVals({ me, rank, of, config, board = [], ui, actions }) {
  /**
   * 签证页现在每场至少一张信息页，还可以继续装订照片和总结页。
   * 护照因此变成一本能一直用下去的打卡本，而不只是一晚上的游戏记录。
   *
   * 活动是按时间顺序装订的，不走关卡那套按忙闲排班的路线 ——
   * 那是为了把人从同一个门口摊开，活动分散在几个月里，没这个问题。
   */
  /**
   * 这本护照的配色。
   *
   * 三层叠：兜底 → 服务端下发的默认 → 这个人自己调过的。
   * 最后一层是他在资料页点「自定义」改的，只影响他自己那一本。
   */
  const theme = passportTheme(config, me);
  const stations = config?.activities || [];
  const pages = buildPages(stations);
  const cur = pages[ui.page] || pages[0];
  const kind = ui.overlay || cur.kind;

  const done = me?.stations || {};
  const total = me?.total ?? 0;
  const doneCount = Object.keys(done).length;

  // 打卡本的汇总看的是「什么时候来的」，不是分数结算
  const stampDates = Object.values(done)
    .map((d) => d?.at).filter(Boolean).sort((a, b) => a - b);
  const fmtDay = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const firstStamp = stampDates.length ? fmtDay(stampDates[0]) : '';
  const lastStamp = stampDates.length ? fmtDay(stampDates[stampDates.length - 1]) : '';
  const joinedOn = me?.createdAt ? fmtDay(me.createdAt) : '——';
  /**
   * 打卡本不设分数上限 —— 活动会一直加下去，「满分」这个概念不成立，
   * 印一个「30 / 72」反而暗示这本护照只有 72 分那么长。
   *
   * 进度改成看「参加过几场」：那才是这本册子真正在记的东西，
   * 而且分母是活动总数，加了新活动会自己跟着变。
   */
  const visaTotal = stations.length;

  const passportNo = passportNoOf(me?.code);

  // 自己填的优先；只填了一个也认，另一个仍然用猜的补上
  const guessed = splitName(me?.name);
  const surname = (me?.surname || '').trim() || guessed.surname;
  const given = (me?.given || '').trim() || guessed.given;

  // 赛前签证页留白：关卡顺序还没排，写上具体关卡等于给了错的信息，
  // 而且会让人提前扎堆去自己看到的第一关。
  const rawStation = kind === 'visa' ? stations[cur.i] : null;
  // 打卡本里签证页一直看得见 —— 那是「接下来有哪些活动」的清单，
  // 藏起来就没法让人期待下一场了。游戏版那套「开赛前留白」不适用。
  const visaBlank = false;
  const station = rawStation;
  const visaSubPage = kind === 'visa' ? (cur.subPage || 0) : 0;
  const visaExtraPage = station && visaSubPage > 0
    ? (station.extraPages || [])[visaSubPage - 1] : null;
  const visaPageCount = station ? 1 + (station.extraPages || []).length : 1;
  const visaScore = station ? done[station.id]?.points ?? null : null;
  const isCheckin = station ? done[station.id]?.meta?.checkin === true : false;
  const landscape = kind === 'data' || kind === 'visa';

  const kickers = {
    inside: 'WELCOME 欢迎', notes: 'INDEX 导航', data: 'IDENTIFICATION 身份资料',
    // 签证页的页眉写活动名 —— 每页都写「VISA 签证」等于什么都没说，
    // 而翻到哪一场才是这一页唯一会变的信息
    visa: station
      ? `${station.icon || ''} ${station.name}${visaSubPage ? ` · ${cur.pageTitle}` : ''}`.trim()
      : 'VISA 签证',
    guide: 'HOW TO USE 使用说明',
    board: 'ATTENDANCE 参与记录', closing: 'CLOSING 结语',
  };
  const corners = {
    inside: 'ROM 15:7', notes: passportNo, data: 'TYPE P / GCGCM',
    // 盖过章就直接写「已参加」，比一个序号有意义
    visa: station
      ? (visaSubPage
        ? `PAGE ${visaSubPage + 1}/${visaPageCount}`
        : (visaScore != null ? '已参加 ✓' : `NO.${String(cur.i + 1).padStart(2, '0')} 待参加`))
      : '',
    guide: 'GUIDE · 点问号返回', board: 'RECORDS · 点奖杯返回',
    closing: 'JOHN 15:12',
  };

  // 每页配一处格拉斯哥地标做水印。图在 web/public/wm/ 下。
  //
  // 封面和结语页不放：封面本身就是整版设计，结语是全书收尾，
  // 留白比再压一层地标更像一本护照的最后一页。
  //
  // 8 个关卡各自带 landmarkKey，剩下 3 张（大教堂、大学、威灵顿）
  // 分给非关卡页。页数比图多，重复使用是有意的 —— guide 和 board
  // 是浮层，不会和正文页同屏出现。
  const landmarkKey = station
    ? station.landmarkKey
    : { inside: 'cathedral', notes: 'wellington', data: 'university',
        guide: 'wellington', board: 'university',
        closing: null }[kind] || null;

  /* ---- 签证页的版式：默认版式打底，活动可以整份换成自己排的 ---- */
  const visaTpl = resolveVisaTemplate(config?.visaTemplate);

  // 「一栏的数据来源怎么翻成值」搬到 VisaBlocks 里了（那儿要用同一份逻辑
  // 渲染栏目块），这里只负责把算好的值打包给它 —— 见 blockData()。

  const noop = () => {};

  /**
   * 屏幕左右两侧翻页 —— 整页和签证页正文上那层透明点击层共用这一份。
   *
   * getBoundingClientRect 已经把 transform 算进去了，所以这个盒子就是
   * 这一页在屏幕上的实际位置：横版页在竖屏被旋转 90° 显示，它给的仍然是
   * 旋转之后的屏幕坐标。于是不用分「转没转」两种情况 —— 左边永远是上一页、
   * 右边永远是下一页，横屏竖屏、正页转页都一样。
   *
   * 以前这里按旋转与否切到纵轴判断，于是竖屏看签证页时翻页要点屏幕的上下边，
   * 和其它页正好差 90°，没人猜得到。
   *
   * 上下各留一条边不翻页：页眉那几个按钮（排行榜、导览）和页脚的二维码就贴在
   * 这两条边上，旋转之后它们正好落在屏幕的左右两侧、也就是翻页带里。点在按钮
   * 上有 closest() 挡着，但按钮只有 30px 见方，点偏一点就翻页了。
   *
   * 返回 true 表示「这一下已经当翻页处理了」，调用方就该收手。
   */
  const EDGE_BAND = 0.12;
  // 方向切换时只重排这层屏幕坐标热区，不依赖横版纸张当前是否已经完成旋转。
  // 用捕获阶段可以先识别真实按钮并放行，避免透明热区盖住排行榜、二维码等控件。
  const screenEdgeTap = (e) => {
    if (ui.overlay || ui.modal || e.target.closest('button, input, a, textarea, select')) return;
    const box = e.currentTarget.getBoundingClientRect();
    const fy = (e.clientY - box.top) / box.height;
    const fx = (e.clientX - box.left) / box.width;
    if (fy <= EDGE_BAND || fy >= 1 - EDGE_BAND) return;
    if (fx <= 0.25) { e.__flip = true; actions.move(-1); }
    else if (fx >= 0.75) { e.__flip = true; actions.move(1); }
  };

  // 向后翻时动的是克隆出来的旧页（PassportBook 直接改它的 style），
  // React 这一层静止不动、当作被揭开后露出的下一页。
  // 向前翻反过来：旧页留在底下不动，这一层倒放着盖回去。
  const backFlip = ui.flip && ui.flip.dir < 0;

  return {
    /* ---- 版式 ---- */
    // 横版资料/签证页在手机竖屏时会旋转显示：舞台也必须占满屏宽，
    // 否则 430px 的旧上限会在大屏手机/平板两侧留下不对称黑边。
    stageMax: landscape ? '100%' : '430px',
    // 设备视口缺口补偿：竖屏把底部系统区镜像到顶部，横屏把右侧系统区
    // 镜像到左侧。舞台靠另一端放置，最终物理屏幕上的黑边才真正等宽。
    stageWidth: ui.vpLandscape && ui.screenGap?.x
      ? `calc(100% - ${ui.screenGap.x}px)` : '100%',
    stageHeight: !ui.vpLandscape && ui.screenGap?.y
      ? `calc(100% - ${ui.screenGap.y}px)` : '100%',
    stageTransform: 'none',
    screenAlign: ui.vpLandscape ? 'center' : (ui.screenGap?.y ? 'flex-end' : 'center'),
    screenJustify: ui.vpLandscape && ui.screenGap?.x ? 'flex-end' : 'center',
    // 横版纸没有铺到的区域属于屏幕留边，不属于护照封皮；统一用黑色，
    // 避免横屏露出主题的酒红色而竖屏却是黑色。
    stageBg: landscape ? '#000' : 'var(--pp-ink)',
    // 横竖屏都按同一张 1.9:1 的横版纸来放大到可用空间；不再直接拿
    // 视口宽高当页面宽高，否则旋转手机后整张签证的比例和字号都会变。
    // 不再用 min() 二次缩小：竖屏明确以屏宽为准，横屏明确以屏高为准。
    // 这样竖屏左右必贴满、横屏上下必贴满；多出来的黑边只会出现在
    // 另一条轴上，并由 left/top 50% 保证严格对称。
    lsW: '190cqw',
    lsH: '100cqw',
    lsTransform: 'translate(-50%,-50%) rotate(90deg)',
    isPortrait: !landscape,
    isLandscape: landscape,
    isCover: kind === 'cover',
    isPaper: !landscape && kind !== 'cover',
    isInside: kind === 'inside',
    isNotes: kind === 'notes',
    isData: kind === 'data',
    isVisa: kind === 'visa',
    isGuide: kind === 'guide',
    isBoard: kind === 'board',
    isClosing: kind === 'closing',
    pageAnim: backFlip ? `bookPeel ${FLIP_MS}ms ${FLIP_EASE} reverse both` : 'none',


    /* ---- 模版 ---- */
    // 变量挂在最外层，护照册整棵树（包括翻页时克隆出去的那份影子页）都继承
    themeVars: themeVarsOf(theme),
    // 「自定义」弹层要拿它当起点：三层叠完之后的实际配色
    themeNow: theme,
    coverBg: coverBgOf(theme),
    coverIssuer: theme.coverIssuer,
    coverSub: theme.coverSub,
    coverTitle: theme.coverTitle,
    coverEn: theme.coverEn,
    wmOpacity: String(theme.watermark),

    paper: theme.paper || TONES.cream,
    // 关掉设计稿那层放射状底纹，只留地标水印，页面更干净
    guilloche: 0,
    watermark: landmarkKey ? `url("/wm/${landmarkKey}.png")` : 'none',
    // 页脚不再印地标名称，水印本身已经足够表达
    watermarkName: '',

    // 留空的签证页连页眉中间的抬头也不写 —— 那是这一页的标题，
    // 页面既然空着就不该有标题；页眉其余部分（队伍、状态、分数）是
    // 全书通用的导航，留着
    kicker: visaBlank ? '' : (kickers[kind] || ''),
    corner: visaBlank ? '' : (corners[kind] || ''),
    visaBlank,
    pageNo: ui.overlay ? '——' : String(ui.page).padStart(2, '0'),
    label: ui.overlay === 'board' ? '排行 LEADERBOARD'
         : ui.overlay === 'guide' ? '使用说明 HOW TO USE' : cur.label,

    /* ---- 翻页（唯一保留的交互） ---- */
    next: () => actions.move(1),
    screenEdgeTap,
    pageTap: (e) => {
      if (e.__flip) return;
      if (e.target.closest('button, input, a, textarea, select')) return;
      // 封面整页可点，不用去够某个按钮
      if (kind === 'cover') { e.__flip = true; actions.move(1); return; }
      // 点在中间：如果这一场还没盖章，就主动查一次。
      // 页面上不放任何常驻标识，只在请求进行中给一个很轻的反馈。
      // 已经盖章的页面不发请求，防止反复戳。
      if (station && visaSubPage === 0 && visaScore == null) actions.checkStamp();
    },
    stop: (e) => e.stopPropagation(),

    goBoard: () => actions.setOverlay(ui.overlay === 'board' ? null : 'board'),
    goBadge: () => actions.goBadge(),
    openContribution: () => station && actions.openContribution(station),
    // ? 按钮直接启动新手引导：静态说明读完还是不知道哪个按钮是哪个，
    // 不如把界面元素圈出来一条条指给他看
    goGuide: () => actions.startTour(),
    startTour: () => actions.startTour(),
    closeAside: () => {
      if (ui.overlay) return actions.setOverlay(null);
      actions.goto(pages.findIndex((p) => p.kind === 'notes'));
    },

    /* ---- 身份资料 ---- */
    passportNo,
    name: me?.name || '',
    surname,
    given,
    // 只读：设计稿里这三个是输入框，这里已被设为 readOnly，处理器留空
    setName: noop, setSurname: noop, setGiven: noop,

    // 身份（SOLO/DUO/TRIO）是迎新游戏那套的，打卡本没有这回事。
    // 设计稿里那三个按钮的位置由视图层按空数组收起
    identities: [],

    fields: [
      { label: 'NATIONALITY 国籍', value: 'GCGCM' },
      { label: 'PASSPORT NO 护照号', value: passportNo },
      { label: 'PLAYER NO 编号', value: String(me?.code || '——') },
      { label: 'PLACE OF ISSUE 签发地', value: 'GLASGOW, UK' },
      { label: 'DATE OF ISSUE 签发日期', value: joinedOn },
      { label: 'DATE OF EXPIRY 有效期至', value: 'ETERNAL 无尽无穷', fg: 'var(--pp-ink)' },
      { label: 'AUTHORITY 签发机关', value: 'GCGCM' },
      // 累计积分这一栏去掉了：页眉左上角一直显示着，同一个数印两遍
    ].map((f) => ({ ...f, fg: f.fg || 'var(--pp-text)' })),

    mrzOn: true,
    mrz1: mrzLine(1, { surname, given, passportNo, code: me?.code, total }),
    mrz2: mrzLine(2, { surname, given, passportNo, code: me?.code, total }),
    bars: code39(passportNo),

    /* ---- 二维码（由容器异步生成后传入） ---- */
    qrReady: !!ui.qrThumb,
    qrLoading: !ui.qrThumb,
    qrThumb: ui.qrThumb || null,
    qrBigImg: ui.qrBigImg || null,
    qrBig: ui.modal === 'qr',
    // 资料页右上角那个「✎ 自定义」：改这本护照的配色，只影响自己
    openTheme: () => actions.openTheme(),
    photo: ui.photo || null,
    openQr: () => actions.setModal('qr'),
    closeModal: () => actions.setModal(null),

    /* ---- 导航页 ---- */
    navCards: [
      { cn: '参与记录', en: 'ATTENDANCE', glyph: 'T', chip: 'rgba(var(--pp-ink-rgb),.06)',
        desc: '看看自己和大家参加过多少场活动。', go: () => actions.setOverlay('board') },
      { cn: '使用说明', en: 'HOW TO USE', glyph: '?', chip: 'rgba(44,74,90,.08)',
        desc: '报名活动、现场盖章和找回护照的完整说明。', go: () => actions.setOverlay('guide') },
    ],
    summaryRows: [
      { label: 'VISAS 参加过', value: `${doneCount} / ${stations.length}` },
      { label: 'FIRST STAMP 第一个章', value: firstStamp || '—— ' },
      { label: 'LATEST 最近一次', value: lastStamp || '—— ' },
      { label: 'MEMBER SINCE 入册', value: joinedOn },
    ],
    doneCount,
    totalPad: String(total).padStart(2, '0'),
    // 进度条走「参加过几场」，不是分数百分比
    pct: visaTotal ? Math.min(100, Math.round((doneCount / visaTotal) * 100)) : 0,
    visaTotal,
    /**
     * 结语用一句经文收尾。
     *
     * 游戏版那段是「今晚八关走完、最终排名、分数会归零」——打卡本没有
     * 「今晚」，它是一本要用一年的册子，收尾也就不该是结算的口吻。
     */
    closingText:
      '这本护照上的章，记的不是你完成了多少，是你来过、被看见过。\n'
      + '有一天翻开它，愿你想起的不是名次，是那些一起坐下的人。\n\n'
      + '「你出你入，耶和华要保护你，从今时直到永远。」\n'
      + '——诗篇 121:8',

    share: actions.share,

    /* ---- 签证页 ---- */
    /**
     * 这一页画哪些块。
     *
     * 页面正文整个由它决定 —— VISA 横框、签发站那片栏目、活动名、备注、
     * 配图、页面链接、机读区，加上同工自己摆的字和图，全是块。删光就是白页。
     *
     * 原来这里还有一堆 visaFields / visaCn / visaLinks / visaPhoto……，
     * 那是给写死的那份排版用的，已经没有人读，删掉了 —— 留着看起来像
     * 还在生效，下一个人会照着改。
     */
    visaBlocks: station
      ? (visaSubPage === 0
        ? resolveBlocks(config?.visaTemplate, station, theme)
        : (Array.isArray(visaExtraPage?.blocks) ? visaExtraPage.blocks : []))
      : [],
    visaBlockData: station ? blockData({
      station, me, theme, passportNo, surname, given,
      visaScore, isCheckin, doneCount,
      signed: (me?.signups || []).includes(station.id),
      stampDate: done[station.id]?.at ? fmtDay(done[station.id].at) : '',
      stampTone: isCheckin ? (theme.stamp || '#2f6148') : (STAMP_TONE[visaScore] || 'var(--pp-text)'),
    }) : {},

    visaStamped: station != null && visaScore != null && visaSubPage === 0,
    visaScore,
    // 章中间那个大字。打卡本盖的是「来过」，不是分数 —— 印一个「+0」
    // 反而像这场活动被判了零分
    stampBig: isCheckin ? '✓' : `${visaScore > 0 ? '+' : ''}${visaScore ?? ''}`,
    // 打卡盖的章写「已参加」，不写分数档位 —— 那一笔本来就不是评分
    stampColor: isCheckin ? (theme.stamp || '#2f6148') : (STAMP_TONE[visaScore] || '#4a5b6a'),
    stampLabel: isCheckin
      ? '已参加'
      : (STAMP_WORD[visaScore] || (visaScore != null ? `${visaScore} 分` : '')),
    stampDate: station && done[station.id]?.at
      ? new Date(done[station.id].at).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
      : '2026-08-28',
    stampNo: station ? String(cur.i + 1).padStart(2, '0') : '',
    stampTop: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].t : '20%',
    stampLeft: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].l : '40%',
    stampRot: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].r : '0deg',
    // 盖章由工作人员记分产生，选手自己点不出章来。
    // 但没盖章时点一下可以「查一次」—— 刚在关卡被记完分的人想立刻看到章。
    // 已经有章的页面直接返回，不发请求，避免站在那儿反复戳。
    checking: !!ui.checking,
    canCheck: station != null && visaSubPage === 0 && visaScore == null,
    // 提示框直接调这个：不做边缘翻页判断，只负责查一次
    checkStamp: () => {
      if (!station || visaSubPage !== 0 || visaScore != null) return;
      actions.checkStamp();
    },
    // 签证页正文上盖着一层透明的点击层。它和整页用同一份边缘判断 ——
    // 各写各的话，同一个位置在正文上和在页边上会有两种反应
    stampTap: (e) => {
      if (e && e.__flip) return;
      if (!station || visaSubPage !== 0) return;
      if (visaScore != null) return;      // 已盖章，不发请求
      actions.checkStamp();
    },

    guide: GUIDE,

    /**
     * 导航页：讲清楚这本护照是什么、怎么盖章、活动在哪儿看。
     *
     * 这里**不列**活动清单。清单就在后面的签证页上，翻过去就是，
     * 翻过去就是；在导航页再抄一份，等于同一件事说两遍，而且那一份
     * 还会随着活动增删和后面对不上。这几张卡只讲不会变的东西。
     */
    intro: [
      { h: 'WHAT IS THIS 这是什么',
        t: '这是一本活动打卡护照。GCGCM 的每一场活动都有自己的签证页 —— ' +
           '你去了，就在信息页盖一个章。' +
           '一年下来翻开它，就是你在这里走过的路。' },
      { h: 'HOW TO GET STAMPED 怎么盖章',
        t: '到现场把二维码给同工扫一下就行。每一页右下角都有，点一下会放大。' +
           '章当场就盖上，你的手机上立刻看得到。一场活动只盖一次。' },
      { h: 'THE ACTIVITIES 活动在后面',
        t: '往后翻，每场活动至少有一张信息页，也可以继续装订照片和总结。' +
           '日期、类型、当天找哪位同工，都写在信息页上。' },
      { h: 'ONE MORE THING 还有一件事',
        t: '章盖满了会有惊喜，但那不是重点。' +
           '这本护照记的不是你参加了几场，是你在这里认识了谁、被谁记得。' },
    ],

    /* ---- 实时排行榜 ---- */
    boardRows: board.map((r, i) => ({
      rank: String(r.rank ?? i + 1).padStart(2, '0'),
      name: r.name,
      // 这一列原来印身份（SOLO/DUO/TRIO）。打卡本没有身份，改印参加过几场
      identity: `${r.stationsDone ?? 0} 场`,
      score: String(r.total).padStart(2, '0'),
      bg: r.id === me?.id ? 'rgba(198,164,95,.22)' : 'transparent',
      fg: r.id === me?.id ? 'var(--pp-ink)' : 'var(--pp-text)',
      hasTag: i < 3,
      tag: ['THE CHAMPION 冠军', 'THE CONNECTOR 联结者', 'THE CREATIVE 创意奖'][i] || '',
      tagFg: ['#a63a2a', '#2f6148', '#4a5b6a'][i] || 'var(--pp-text)',
      tagBd: ['rgba(166,58,42,.5)', 'rgba(47,97,72,.5)', 'rgba(74,91,106,.5)'][i] || 'rgba(var(--pp-ink-rgb),.3)',
    })),
  };
}

export { STAMP_TONE, STAMP_WORD };
