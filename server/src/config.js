// 游戏静态配置 —— 前后端共享（前端通过 GET /api/config 拉取并缓存到本地，离线可用）

export const GAME = {
  title: 'Mini Life Game',
  subtitle: '人生护照 · Life Passport',
  church: 'GCGCM 迎新',
  verse: '我的恩典够你用的',
  verseEn: "You don't have to do life alone",
};

/**
 * 8 个主线签证站 —— 与 Claude Design 的护照册设计保持一致，满分 72。
 *
 * minutes 是每组预计占用的时间（含记分和复位），用来排关卡顺序 ——
 * 见 game.js 的 assignRoutes()。这些是估算值，彩排一遍之后按实际改。
 *
 * ⚠️ 按 50 人（约 30 组）、实际闯关 33 分钟算，八个关卡合计只能接待
 *    约 129 组次，也就是每组平均只跑得完 4 关多一点。满分 72 是按
 *    八关全通设计的，现场达不到。最堵的是定格瞬间（4 分钟一组，
 *    整场只接待得下 8 组）。要么给慢关加并行席位，要么把满分改成
 *    「任意 N 关」—— 这是活动设计的取舍，不是代码能解决的。
 */
export const STATIONS = [
  {
    id: 'music', order: 1, icon: '🎵', name: '音乐之声', en: 'Music Station',
    tag: '关键字 60 秒', tone: 'loud', staff: '梁潇 · 益嘉',
    rule: '现场抽取一个关键字，唱出 3 首符合条件的歌曲，每首两句即可。',
    scoring: 'Solo 独唱 3 首；Duo / Trio 需合唱 3 首，每个人必须开口。',
    props: '[平板] 随机抽取关键字界面及 60 秒倒计时。',
    landmark: 'CLYDE AUDITORIUM 克莱德音乐厅', landmarkKey: 'clyde-auditorium',
    // 单组预计耗时（分钟，含记分与复位）：抽词 60 秒唱 3 首，Duo/Trio 要合唱；加记分约 40 秒
    minutes: 1.7,
    solo: false,
  },
  {
    id: 'uk', order: 2, icon: '🇬🇧', name: '英伦百事通', en: 'Life in the UK',
    tag: '实物提问卡', tone: 'quiet', staff: '陈逸欣',
    rule: '抽取问题卡，回答英国常识与留学生生活冷知识。',
    scoring: 'Solo 答对 1 题；Duo 两人各答对 1 题；Trio 三人各答对 1 题，不可互相提示。',
    props: '[实物卡] 制作精美的提问卡片。',
    landmark: 'CLYDE ARC 克莱德拱桥', landmarkKey: 'clyde-arc',
    // 单组预计耗时（分钟，含记分与复位）：抽卡答 1–3 题，每题 30–45 秒
    minutes: 1.8,
    solo: false,
  },
  {
    id: 'interview', order: 3, icon: '🎤', name: '灵魂拷问', en: 'The Interview',
    tag: '现场飙戏', tone: 'loud', staff: 'Emy · 大伟',
    rule: '工作人员扮演严苛 Tutor，你抽取一道刁钻的情景题，当场应答。',
    scoring: 'Solo 独立对答；Duo / Trio 需分工扮演角色（学生 + Tutor + 愤怒室友）进行现场飙戏。',
    props: '[平板] 工作人员用平板记录评分及备选情景题库。',
    landmark: 'GEORGE SQUARE 乔治广场', landmarkKey: 'george-square',
    // 单组预计耗时（分钟，含记分与复位）：情景题现场飙戏，Duo/Trio 还要分角色，是表演不是问答
    minutes: 3.0,
    solo: false,
  },
  {
    id: 'photo', order: 4, icon: '📸', name: '定格瞬间', en: 'Photo Story',
    tag: '四格小故事', tone: 'loud', staff: '任飞 · 刘烁',
    rule: '抽取一个故事主题和必需道具，在指定背景拍出四格小故事。',
    scoring: 'Solo（劣势）必须在现场主动邀请至少 1 位路人配合出镜；Duo / Trio 直接分工出片。',
    props: '[实物] 拍立得相框、假书、空咖啡杯等轻便道具。',
    landmark: 'RIVERSIDE MUSEUM 河滨博物馆', landmarkKey: 'riverside',
    // 单组预计耗时（分钟，含记分与复位）：抽主题找道具摆拍四格；Solo 还得现场拉一位路人配合 —— 全场最慢
    minutes: 4.0,
    solo: false,
  },
  {
    id: 'memory', order: 5, icon: '🧠', name: '记忆观察', en: 'Memory & Observation',
    tag: '30 秒观察', tone: 'quiet', staff: '德浩',
    rule: '观察桌面上的一堆物品 30 秒，随后盖布，凭记忆回答工作人员的提问。',
    scoring: 'Solo 答对 3 题；Duo 答对 6 题；Trio 答对 9 题，每人必须至少回答 1 题。',
    props: '[实物 + 平板] 15–20 件日常杂物、盖布；工作人员持平板查看问题。',
    landmark: 'BOTANIC GARDENS 格拉斯哥植物园', landmarkKey: 'botanic',
    // 单组预计耗时（分钟，含记分与复位）：30 秒观察 + 答 3/6/9 题；每组之间要重新盖布、复位
    minutes: 3.0,
    solo: true,
  },
  {
    id: 'blindbox', order: 6, icon: '🕳', name: '摸黑套圈', en: 'Messy Flatmate',
    tag: '30 秒盲摸', tone: 'loud', staff: 'Sean',
    rule: '30 秒内在塞满杂物的不透明箱子里，纯靠手感摸出指定的 3 件东西。',
    scoring: 'Solo 可双臂自由摸索；Duo / Trio 规定每人只能伸入一只手，狭小空间内极易碰撞干扰。',
    props: '[实物] 开孔不透明收纳箱、各类杂物、3 件目标物。',
    landmark: 'FINNIESTON CRANE 芬尼斯顿起重机', landmarkKey: 'crane',
    // 单组预计耗时（分钟，含记分与复位）：30 秒盲摸，主要时间花在把东西塞回箱子
    minutes: 1.5,
    solo: true,
  },
  {
    id: 'library', order: 7, icon: '🤫', name: '寂静图书馆', en: 'The Silent Library',
    tag: '禁言拼图', tone: 'quiet', staff: '卫红 · Crystal',
    rule: '60 秒内拼完一张被剪碎的信件。全程禁言，出声会被扣分。',
    scoring: 'Solo 静音专注拼图，速度极快；Duo / Trio 多人手杂又不能沟通，手语乱舞极易憋笑失控。',
    props: '[实物] 过塑后剪碎的 A4 拼图两套、「SILENCE」警告牌。',
    landmark: 'KELVINGROVE PARK 凯尔文格罗夫公园', landmarkKey: 'kelvingrove',
    // 单组预计耗时（分钟，含记分与复位）：60 秒拼图；拼图有两套可以轮换，复位不占用下一组的时间
    minutes: 1.8,
    solo: true,
  },
  {
    id: 'decisions', order: 8, icon: '🔀', name: '人生选择', en: 'Life Decisions',
    tag: '二选一', tone: 'quiet', staff: '昊阳 · 静文 · Wallace',
    rule: '在几个人生岔路口上做出选择。每个选择都会带来不同的后续结果，选完即生效，不能反悔。',
    scoring: '⚠️ 评分标准待补：设计稿里这一栏是空的，请站点负责人确认。',
    props: '',
    landmark: 'CITY CHAMBERS 格拉斯哥市政厅', landmarkKey: 'city-chambers',
    // 单组预计耗时（分钟，含记分与复位）：几个岔路口二选一，没有道具和复位
    minutes: 1.5,
    solo: false,
  },
];

/** 2 个功能 Station */
export const FUNCTIONAL = [
  {
    id: 'life_event', icon: '🎲', name: '人生盲盒', en: 'Life Event',
    staff: '昊阳 / 静文 / Wallace',
    rule: '总分第一次达到或跨过红线时，必须暂停挑战前往抽取人生盲盒。分高者可优先排队。',
  },
  {
    id: 'jesus', icon: '✝️', name: '恩典站', en: 'Jesus Station',
    staff: 'Yihan / 佳琪',
    rule: '递出 Help Token 换取一次帮助：关卡提示 / NPC 协助，或一次免费重新挑战机会，并换得一张 Grace Card。',
  },
];

/** 身份卡 */
export const IDENTITIES = {
  solo: {
    id: 'solo', icon: '🔴', name: 'SOLO', cn: '独行侠', color: '#ff5a5f',
    trait: '极佳的独立专注力，在记忆、套圈、拼图关卡具备绝对速度优势。',
    verse: '一人独睡不得暖，二人同睡就都暖和。',
  },
  duo: {
    id: 'duo', icon: '🔵', name: 'DUO', cn: '双人搭档', color: '#4a9bff',
    trait: '兼顾灵活性与协作度，中规中矩，处处不吃亏也不占大便宜。',
    verse: '两个人总比一个人好，因为二人劳碌同得美好的果效。',
  },
  trio: {
    id: 'trio', icon: '🟢', name: 'TRIO', cn: '三股合成的绳子', color: '#3ec98a',
    trait: '在拍照、唱歌等人数密集关卡优势明显，但在限制沟通的关卡容易手忙脚乱。',
    verse: '三股合成的绳子不容易折断。',
  },
};

/** 分组颜色 × 符号：同色同符号者需在场内互相寻找组队 */
export const GROUP_COLORS = [
  { key: 'red', name: '赤', hex: '#ff5a5f' },
  { key: 'orange', name: '橙', hex: '#ff9f43' },
  { key: 'yellow', name: '金', hex: '#f7c948' },
  { key: 'green', name: '翠', hex: '#3ec98a' },
  { key: 'teal', name: '青', hex: '#2bc4c4' },
  { key: 'blue', name: '蓝', hex: '#4a9bff' },
  { key: 'indigo', name: '靛', hex: '#7c6cf0' },
  { key: 'purple', name: '紫', hex: '#b06cf0' },
  { key: 'pink', name: '桃', hex: '#ff6fae' },
  { key: 'brown', name: '棕', hex: '#c08457' },
];
export const GROUP_SYMBOLS = ['★', '●', '▲', '■', '◆', '♥', '♠', '♣', '✚', '✦', '❋', '⬢'];

/** 人生盲盒卡牌 —— 前端离线时本地抽取，把 cardId 上报给服务端结算 */
export const LIFE_EVENT_CARDS = [
  // 🟢 Good Fortune
  { id: 'first_class', kind: 'good', weight: 3, title: 'Essay 拿了 First Class!', desc: '导师在评语里写下 "outstanding"，你当场截图发了家族群。', effect: { type: 'multiply', factor: 2 }, effectText: '当前积分 ×2' },
  { id: 'found_tenner', kind: 'good', weight: 5, title: '路上捡到 £10', desc: '在 Byres Road 的风里，一张十镑纸币正好贴在你的鞋面上。', effect: { type: 'add', points: 3 }, effectText: '+3 分' },
  { id: 'flatmate_meal', kind: 'good', weight: 5, title: '室友帮你带了饭', desc: '你熬夜写 Essay，室友默默放了一盒还热的炒饭在门口。', effect: { type: 'add', points: 3 }, effectText: '+3 分' },
  { id: 'cheap_flight', kind: 'good', weight: 4, title: '抢到 £9 机票', desc: '手速惊人。虽然行李费 £45，但那不重要。', effect: { type: 'add', points: 4 }, effectText: '+4 分' },
  { id: 'yellow_sticker', kind: 'good', weight: 5, title: 'Tesco 黄标之神', desc: '晚上八点，你拿到了最后一份打三折的三文鱼。', effect: { type: 'add', points: 2 }, effectText: '+2 分' },

  // 🔴 Bad Luck
  { id: 'locked_out', kind: 'bad', weight: 5, title: '被锁在 Flat 门外', desc: '钥匙在屋里，手机 3% 电，外面在下雨。当然是在下雨。', effect: { type: 'add', points: -5 }, effectText: '-5 分' },
  { id: 'flu', kind: 'bad', weight: 4, title: '重感冒卧床', desc: 'NHS 让你多喝水休息。你喝了很多水。', effect: { type: 'modifier', modifier: 'cap_next', value: 1 }, effectText: '下一关最多只能拿 1 分' },
  { id: 'deadline_clash', kind: 'bad', weight: 5, title: 'Deadline 撞车', desc: '三门课的 Essay 同一天交，你通宵了两晚。', effect: { type: 'add', points: -3 }, effectText: '-3 分' },
  { id: 'phone_rain', kind: 'bad', weight: 4, title: '手机掉进苏格兰的雨里', desc: '屏幕还亮着，但触控变得很有想法。', effect: { type: 'add', points: -4 }, effectText: '-4 分' },

  // 🟡 Unexpected
  { id: 'got_married', kind: 'unexpected', weight: 3, title: 'Got Married!', desc: '人生大事说来就来，你需要一位见证人。', effect: { type: 'modifier', modifier: 'must_invite_stranger' }, effectText: '下一关必须邀请一位还不认识的人一起完成' },
  { id: 'fire_alarm', kind: 'unexpected', weight: 4, title: '凌晨三点 Fire Alarm', desc: '全楼的人都穿着睡衣站在楼下，你认识了隔壁栋的一群人。', effect: { type: 'modifier', modifier: 'must_invite_stranger' }, effectText: '下一关必须和一位新朋友组队完成' },
  { id: 'tutor_meeting', kind: 'unexpected', weight: 3, title: '被 Tutor 紧急约谈', desc: '邮件标题只有两个字：Please come.', effect: { type: 'swap_queue' }, effectText: '下一关必须排到队伍最后' },

  // ⚫ Extreme
  { id: 'crypto_crash', kind: 'extreme', weight: 2, title: '投资暴雷', desc: '室友推荐的那个币，昨晚归零了。', effect: { type: 'multiply', factor: 0.5 }, effectText: '当前积分直接减半' },
  { id: 'fx_crash', kind: 'extreme', weight: 2, title: '汇率暴跌', desc: '你的生活费在一夜之间少了一大截。', effect: { type: 'multiply', factor: 0.5 }, effectText: '当前积分直接减半' },
  { id: 'scholarship', kind: 'extreme', weight: 2, title: '突然拿到全额奖学金', desc: '你反复读了三遍那封邮件，确认它不是钓鱼邮件。', effect: { type: 'multiply', factor: 2 }, effectText: '当前积分 ×2' },
];

export const CARD_KINDS = {
  good: { label: 'Good Fortune', cn: '好运', color: '#3ec98a', icon: '🟢' },
  bad: { label: 'Bad Luck', cn: '厄运', color: '#ff5a5f', icon: '🔴' },
  unexpected: { label: 'Unexpected', cn: '意外', color: '#f7c948', icon: '🟡' },
  extreme: { label: 'Extreme', cn: '极端', color: '#8b8f9e', icon: '⚫' },
};

/** 恩典站可提供的帮助 */
export const GRACE_OPTIONS = [
  { id: 'hint', icon: '💡', name: 'Hint / Helper', desc: '提供关卡关键提示，或安排一位 NPC 陪你一起闯关。' },
  { id: 'second_chance', icon: '🔄', name: 'Second Chance', desc: '给予一次免费的重新挑战机会。' },
];

/** 结业奖项 */
export const AWARDS = [
  { id: 'top_score', icon: '👑', name: '最高积分奖', desc: '全场总分第一' },
  { id: 'connector', icon: '🤝', name: 'The Connector', desc: '认识最多新朋友的人／组' },
  { id: 'creative', icon: '✨', name: 'The Creative', desc: '最佳创意奖' },
  { id: 'grace', icon: '✝️', name: 'The Grace Receiver', desc: '最懂得在难处中寻求帮助的人' },
  { id: 'survivor', icon: '🎲', name: 'The Survivor', desc: '扛过最多人生意外的人' },
];

/** 默认可调参数（存进 settings 表，Admin 后台可改） */
export const DEFAULT_SETTINGS = {
  gameState: 'lobby',              // lobby | running | ended
  scoreTiers: [3, 6, 9],           // 勉强完成 / 正常完成 / 出色完成
  maxStationScore: 9,
  lifeEventThresholds: [15, 30, 50],
  helpTokens: 1,
  registrationOpen: true,
  leaderboardPublic: true,
  showFullNames: true,
};

/**
 * 管理员重置密码时统一设成这个值。
 * 用固定值而不是随机数：Reception 当场只要说一句「你的密码是 3927」就完了，
 * 不用念一串随机数字，也不会念错。
 */
export const RESET_PIN = '3927';

export const TIER_LABELS = ['勉强完成', '正常完成', '出色完成'];

export const ALL_STATION_IDS = STATIONS.map((s) => s.id);
