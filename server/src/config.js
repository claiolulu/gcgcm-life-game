// 游戏静态配置 —— 前后端共享（前端通过 GET /api/config 拉取并缓存到本地，离线可用）

export const GAME = {
  title: 'Mini Life Game',
  subtitle: '人生护照 · Life Passport',
  church: 'GCGCM 迎新',
  verse: '我的恩典够你用的',
  verseEn: "You don't have to do life alone",
};

const DATE_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 把旧英文日期和纯数字日期统一成 YYYY-MM-DD；空串表示未定或不合法。 */
export function normalizeActivityDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(raw);
  if (!m) {
    const old = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(raw);
    if (!old) return '';
    const month = DATE_MONTHS.indexOf(old[2].slice(0, 3).toUpperCase()) + 1;
    if (!month) return '';
    m = [old[0], old[3], String(month).padStart(2, '0'), String(old[1]).padStart(2, '0')];
  }
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * ========================= 活动打卡 =========================
 *
 * 护照的签证页从「一场游戏里的 8 个关卡」改成「教会的每一场活动」。
 * 参加了就盖一个章，护照因此变成一本能一直用下去的打卡本 ——
 * 迎新、查经、圣诞晚会……每场一页，翻开就是这个人的参与记录。
 *
 * 加新活动就是在这里添一行，前端不用动。
 *
 * 存储上仍然沿用 events 表的 station_id 字段和那条「一站只能盖一次」的
 * 唯一索引 —— 语义正好一致（一场活动只盖一次章），没必要为了换个叫法
 * 去迁移历史数据。
 *
 *   date  这一场的日期，签发日期栏显示它；还没定就留空
 *   tag   签证类型栏，写活动的性质
 *   host  盖章负责人，签证页的 STAFF 栏
 *   issuer 签发机构，签证页的 ISSUING AUTHORITY 栏。留空就用护照模版上的那个
 *   desc  备注栏那段话，写这场活动是什么
 *   state 这一场的状态：upcoming 还没到 / live 正在进行 / done 已经办完
 *
 * state 是从原来那个全局「游戏状态」搬过来的 —— 打卡本里没有「一场游戏」
 * 这回事，只有一场接一场的活动，状态本来就该长在活动身上。
 * 同一时刻只允许一场 live（服务端强制），它决定同工扫码时默认盖哪一场，
 * 也决定护照信息锁不锁（活动期间锁住，两场之间可以改名）。
 */
export const ACTIVITIES = [
  {
    id: 'freshers', order: 1, icon: '🎓',
    name: '迎新之夜', en: 'Freshers Night',
    date: '2026-09-13', tag: '迎新', host: 'GCGCM 迎新组',
    desc: '新学年的第一场。六十分钟的浓缩人生，认识一屋子还不认识的人 —— 分数会归零，名次会被忘记，但今晚认识的人还在。',
    landmarkKey: 'city-chambers', state: 'upcoming',
  },
  {
    id: 'bible-study', order: 2, icon: '📖',
    name: '查经小组', en: 'Bible Study',
    date: '', tag: '每周聚会', host: '各小组组长',
    desc: '一起读一段，一起问几个问题。来过一次就盖一次章。',
    landmarkKey: 'university', state: 'upcoming',
  },
  {
    id: 'retreat', order: 3, icon: '⛰',
    name: '退修会', en: 'Retreat',
    date: '', tag: '年度', host: '教会同工',
    desc: '离开城市两天。走远一点，才看得清近处。',
    landmarkKey: 'kelvingrove', state: 'upcoming',
  },
  {
    id: 'christmas', order: 4, icon: '🕯',
    name: '圣诞晚会', en: 'Christmas Night',
    date: '', tag: '节期', host: '节期筹备组',
    desc: '一年里最热闹的一晚。带上还没来过教会的朋友。',
    landmarkKey: 'cathedral', state: 'upcoming',
  },
  {
    id: 'easter', order: 5, icon: '🌱',
    name: '复活节', en: 'Easter',
    date: '', tag: '节期', host: '节期筹备组',
    desc: '整本故事的转折点就在这一天。',
    landmarkKey: 'botanic', state: 'upcoming',
  },
  {
    id: 'serve', order: 6, icon: '🤲',
    name: '服事一次', en: 'Serve',
    date: '', tag: '参与', host: '各事工负责人',
    desc: '摆椅子、洗杯子、招呼新来的人 —— 哪一样都算。',
    landmarkKey: 'riverside', state: 'upcoming',
  },
];

/**
 * ========================= 护照模版 =========================
 *
 * 护照页的样式。总控台可改（存在 settings 的 _theme 下），这里是出厂默认值。
 *
 * 颜色只有四个可调项，因为设计稿里真正成体系的就这四种：
 *   ink    主色。抬头、边框、按钮、签证横幅的左半边
 *   gold   烫金。封面的字和线，深色块上的字；两种更深的金是从它算出来的
 *   paper  纸色。所有内页的底
 *   text   正文黑
 *
 * 其余的颜色（盖章的绿、水印的灰）跟着这四个走，或者本来就不该由人调。
 *
 * 生成的 CSS 变量注入在护照册最外层，设计稿里那些写死的色值在转换时
 * 已经被机械替换成 var(--ink) 之类（见 design/convert.py 的调色板补丁）。
 */
export const THEME = {
  preset: 'classic',
  ink: '#5c1a22',
  gold: '#e6cd91',
  paper: '#f3ede0',
  text: '#2a2320',
  // 地标水印的浓度。太浓会压住正文，上限卡在 0.3
  watermark: 0.13,
  // 盖章的颜色。打卡本只有「参加了」一种章，所以只有一个色
  stamp: '#2f6148',
  // 封面
  coverIssuer: 'GCGCM',
  coverSub: '迷 你 人 生 国',
  coverTitle: '人生护照',
  coverEn: 'PASSPORT',
  // 签证页横幅右侧那两行
  visaBrand: 'MINI LIFE GAME',
  visaBrandCn: '迷你人生游戏',
};

/**
 * ========================= 签证页模版 =========================
 *
 * 下面这一份就是现在护照上那一页 —— 把它写出来，是为了让同工能改它。
 *
 * rows 是左边那片两列栏目。每一栏只有两件事：印什么标题（label），
 * 内容从哪来（src）。src 里除了 text 是「固定文字」，其余都是绑定值 ——
 * 绑定的东西每个人不一样（姓名、编号、出席与否），不该由同工填。
 *
 * 每场活动可以整份覆盖 rows（见活动的 page 字段）。覆盖是「有就全用自己的」，
 * 不做逐条合并 —— 逐条合并写起来简单，但同工改完模版之后，哪几场跟着变了
 * 哪几场没变，没人说得清。
 */
export const VISA_ROW_SOURCES = [
  { key: 'text',      group: '自己填', name: '固定文字',   hint: '这一栏所有人看到的都一样' },

  // 持照人 —— 每个人不一样，服务端按人算，同工填不出来
  { key: 'player',    group: '持照人', name: '名字',       hint: '护照上的名字（报名时填的那个）' },
  { key: 'surname',   group: '持照人', name: '姓',         hint: '资料页上的姓' },
  { key: 'given',     group: '持照人', name: '名',         hint: '资料页上的名' },
  { key: 'code',      group: '持照人', name: '编号',       hint: '找回护照用的那个号' },
  { key: 'passport',  group: '持照人', name: '护照号',     hint: 'GCGCM000001' },
  { key: 'contact',   group: '持照人', name: '联系方式',   hint: '报名时留的微信 / 邮箱，没留就空着' },
  { key: 'identity',  group: '持照人', name: '身份',       hint: 'SOLO / DUO / TRIO' },
  { key: 'team',      group: '持照人', name: '队伍',       hint: '颜色 + 符号，没编队就印「——」' },
  { key: 'visited',   group: '持照人', name: '参加过几场', hint: '整本护照上盖了几个章' },

  // 这一场活动 —— 全场一样，在活动详情页里改
  { key: 'name',      group: '这一场', name: '活动名',     hint: '' },
  { key: 'en',        group: '这一场', name: '活动英文名', hint: '' },
  { key: 'tag',       group: '这一场', name: '活动类型',   hint: '活动清单里的「类型」' },
  { key: 'host',      group: '这一场', name: '负责人',     hint: '活动清单里的「负责人」' },
  { key: 'date',      group: '这一场', name: '活动日期',   hint: '没填就印「TBC 待定」' },

  // 这一页 —— 跟这个人在这一场的关系
  { key: 'status',    group: '这一页', name: '出席状态',   hint: '盖过章印 ✓，没盖印 — —' },
  { key: 'stampDate', group: '这一页', name: '盖章日期',   hint: '还没盖就空着' },
  { key: 'signed',    group: '这一页', name: '报名状态',   hint: '报了印「已报名」，没报印「——」' },
  { key: 'post',      group: '这一场', name: '签发机构',   hint: '活动详情页里填，留空就用护照模版上的签发机构' },
  { key: 'control',   group: '这一场', name: '编号',       hint: '签发机构 + 数字年月日，例如 GCGCM20260913' },
];

/**
 * 默认版式里没有「出席状态」那一栏 —— 来没来过，那个章已经说得很清楚了，
 * 再用一行字写一遍 ✓ 是重复。需要的话在画布编辑器里加回来，来源还在。
 */
export const VISA_TEMPLATE = {
  banner: 'VISA',
  stationLabel: 'STATION 关卡',
  annotationLabel: 'ANNOTATION 备注',
  showPhoto: true,
  showAnnotation: true,
  showLinks: true,
  rows: [
    { key: 'post',    label: 'ISSUING AUTHORITY 签发机构', src: 'post' },
    { key: 'control', label: 'NUMBER 编号',             src: 'control' },
    { key: 'surname', label: 'SURNAME 姓',              src: 'surname' },
    { key: 'given',   label: 'GIVEN NAMES 名',          src: 'given' },
    { key: 'type',    label: 'VISA TYPE 类型',          src: 'tag' },
    { key: 'class',   label: 'CLASS 身份',              src: 'identity' },
    { key: 'staff',   label: 'STAFF 工作人员',          src: 'host' },
    { key: 'entries', label: 'ENTRIES 入境次数',        src: 'text', text: 'ONE 一次' },
    { key: 'issued',  label: 'ISSUING DATE 签发日期',   src: 'date' },
    { key: 'expiry',  label: 'EXPIRATION DATE 有效期',  src: 'text', text: 'ETERNAL 无尽无穷', accent: true },
  ],
};

/** 四套预设。总控台点一下就把上面那几个色值整套换掉。 */
export const THEME_PRESETS = [
  { key: 'classic',  name: '经典酒红', ink: '#5c1a22', gold: '#e6cd91', paper: '#f3ede0', text: '#2a2320', stamp: '#2f6148' },
  { key: 'midnight', name: '午夜深蓝', ink: '#1f3a5c', gold: '#d9c48a', paper: '#eef1f4', text: '#1e2833', stamp: '#2a5f6b' },
  { key: 'forest',   name: '林地墨绿', ink: '#26452f', gold: '#dcc98d', paper: '#f1f0e4', text: '#232a22', stamp: '#7a3b2a' },
  { key: 'kraft',    name: '牛皮纸',   ink: '#4a3524', gold: '#e0c48f', paper: '#efe4d2', text: '#2f2519', stamp: '#5a4a2c' },
];









/** 默认可调参数（存进 settings 表，Admin 后台可改） */
export const DEFAULT_SETTINGS = {
  gameState: 'lobby',              // lobby | running | ended
  leaderboardPublic: true,
  showFullNames: true,
};

/**
 * 管理员重置密码时统一设成这个值。
 * 用固定值而不是随机数：Reception 当场只要说一句「你的密码是 3927」就完了，
 * 不用念一串随机数字，也不会念错。
 */
export const RESET_PIN = '3927';
