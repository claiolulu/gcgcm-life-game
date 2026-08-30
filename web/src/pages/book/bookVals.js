/**
 * 把实时数据喂给护照册的视觉层。
 *
 * 这一层是**纯只读**的：设计稿里那些用来演示的交互（点盖章循环改分、
 * 选身份、按钮用掉 Token、改姓名）在这里全部被中和成展示或说明，
 * 真正的写入只发生在工作人员端。
 */

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

function code39(no, unit = 1.5, color = '#2a2320') {
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

const IDENTITY_META = {
  solo: { key: 'SOLO', en: 'SOLO', cn: '独行侠', color: '#5c1a22' },
  duo:  { key: 'DUO',  en: 'DUO',  cn: '双人搭档', color: '#2c4a5a' },
  trio: { key: 'TRIO', en: 'TRIO', cn: '三股绳', color: '#37543c' },
};
const IDENTITY_ORDER = ['solo', 'duo', 'trio'];

const HELP_OPTS = [
  { n: 'I',   en: 'HINT / HELPER',  cn: '提供关卡关键提示，或安排一位 NPC 协助你完成。' },
  { n: 'II',  en: 'SECOND CHANCE',  cn: '给予一次免费重新挑战该关卡的机会。' },
  { n: 'III', en: 'GRACE CARD',     cn: '换得一张精美的恩典卡，可带走留念。' },
];

const GUIDE = [
  { n: 1, cn: '抽取身份', en: 'IDENTITY',   body: '开局抽签决定 Solo / Duo / Trio。人生起点不由自己选择，能力起点不同，关卡难度也不同。' },
  { n: 2, cn: '挑战八关', en: 'EIGHT VISAS', body: '八张签证页自由顺序前往。每关由工作人员当场评分：3 分勉强完成、6 分正常完成、9 分出色完成，只在个人护照上盖章。' },
  { n: 3, cn: '遇到意外', en: 'LIFE EVENT',  body: '总分首次跨过红线时，必须前往场地中央抽人生盲盒，可能加分也可能扣分。' },
  { n: 4, cn: '寻求恩典', en: 'GRACE',       body: '卡关、遇到难关或抽到「大凶」被扣分时，随时可到恩典站递出 Help Token 求助。全场只有一枚。' },
  { n: 5, cn: '结业颁奖', en: 'AWARDS',      body: '除最高积分奖外，另颁 The Connector、The Creative 等迎新向奖项，最后进入福音反思环节。' },
];

/** 页码表：封面 → 欢迎 → 导航 → 资料页 → 八张签证 → 恩典站 → 结语 */
export function buildPages(stations) {
  return [
    { kind: 'cover',   label: 'COVER 封面' },
    { kind: 'inside',  label: '欢迎 WELCOME' },
    { kind: 'notes',   label: '导航 INDEX' },
    { kind: 'data',    label: '资料页 DATA PAGE' },
    ...stations.map((st, i) => ({
      kind: 'visa', i,
      label: `签证 ${String(i + 1).padStart(2, '0')} ${st.name}`,
    })),
    { kind: 'grace',   label: '恩典站 GRACE' },
    { kind: 'closing', label: '结语 CLOSING' },
  ];
}

/* ------------------------------ 工具 ------------------------------ */

const clean = (s, fb) => (String(s || '') || fb).toUpperCase().replace(/[^A-Z0-9]/g, '') || fb;

/** 我们只收一个名字，按护照惯例拆成姓 / 名：中文取首字为姓，西文按空格拆 */
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

function mrzLine(n, { surname, given, passportNo, identity, total }) {
  const pad = (s, len) => (s + '<'.repeat(Math.max(0, len - s.length))).slice(0, len);
  if (n === 1) return pad('P<GCGCM' + clean(surname, 'PLAYER') + '<<' + clean(given, 'ONE'), 38);
  return pad(passportNo + '<GCGCM' + identity + '<' + String(total).padStart(2, '0') + 'PTS', 38);
}

/* ---------------------------- 主构建函数 ---------------------------- */

/**
 * @param {object} args
 *  me         选手状态（来自 /api/me，只读）
 *  rank, of   排名
 *  config     游戏配置
 *  board      实时排行榜
 *  ui         { page, overlay, modal, vpLandscape, shared, qrThumb, qrBigImg }
 *  actions    { move, goto, setOverlay, setModal, share }
 */
export function buildVals({ me, rank, of, config, board = [], ui, actions }) {
  const stations = config?.stations || [];
  const pages = buildPages(stations);
  const cur = pages[ui.page] || pages[0];
  const kind = ui.overlay || cur.kind;

  const done = me?.stations || {};
  const total = me?.total ?? 0;
  const doneCount = Object.keys(done).length;
  const maxTotal = stations.length * (config?.settings?.maxStationScore ?? 9);

  const identityKey = me?.identity || null;
  const idt = IDENTITY_META[identityKey] || IDENTITY_META.solo;
  const identityLabel = identityKey ? idt.en : '——';

  const passportNo = passportNoOf(me?.code);

  // 队伍：颜色 + 符号是场内互相辨认的凭据，队友名单是真正好用的那一半
  const colorMeta = (config?.groupColors || []).find((c) => c.key === me?.teamColor) || null;
  const teamBadge = colorMeta && me?.teamSymbol
    ? { name: colorMeta.name, hex: colorMeta.hex, symbol: me.teamSymbol, teamId: me.teamId }
    : null;
  const teammates = me?.teammates || [];
  const { surname, given } = splitName(me?.name);

  const station = kind === 'visa' ? stations[cur.i] : null;
  const visaScore = station ? done[station.id]?.points ?? null : null;
  const landscape = kind === 'data' || kind === 'visa';

  const kickers = {
    inside: 'WELCOME 欢迎', notes: 'INDEX 导航', data: 'IDENTIFICATION 身份资料',
    visa: 'VISA 签证 · GCGCM', grace: 'GRACE STATION 恩典站', guide: 'HOW TO PLAY 玩法',
    board: 'LEADERBOARD 实时排行', closing: 'CLOSING 结语',
  };
  const corners = {
    inside: 'ROM 15:7', notes: passportNo, data: 'TYPE P / GCGCM',
    visa: station ? 'STATION ' + String(cur.i + 1).padStart(2, '0') : '',
    grace: 'YIHAN · 佳琪', guide: 'RULES · 点问号返回', board: 'LIVE · 点奖杯返回',
    closing: 'JOHN 15:12',
  };

  // 每页配一处格拉斯哥地标做水印。图在 web/public/wm/ 下，是手绘的 SVG 剪影。
  const landmarkKey = station
    ? station.landmarkKey
    : { inside: 'cathedral', notes: 'city-chambers', data: 'university',
        grace: 'cathedral', guide: 'city-chambers', board: 'george-square',
        closing: 'cathedral' }[kind] || null;

  const noop = () => {};

  return {
    /* ---- 版式 ---- */
    stageMax: landscape && ui.vpLandscape ? '100%' : '430px',
    lsW: ui.vpLandscape ? '100%' : '100cqh',
    lsH: ui.vpLandscape ? '100%' : '100cqw',
    lsTransform: ui.vpLandscape ? 'translate(-50%,-50%)' : 'translate(-50%,-50%) rotate(90deg)',
    isPortrait: !landscape,
    isLandscape: landscape,
    isCover: kind === 'cover',
    isPaper: !landscape && kind !== 'cover',
    isInside: kind === 'inside',
    isNotes: kind === 'notes',
    isData: kind === 'data',
    isVisa: kind === 'visa',
    isGrace: kind === 'grace',
    isGuide: kind === 'guide',
    isBoard: kind === 'board',
    isClosing: kind === 'closing',
    paper: TONES.cream,
    // 关掉设计稿那层放射状底纹，只留地标水印，页面更干净
    guilloche: 0,
    watermark: landmarkKey ? `url("/wm/${landmarkKey}.svg")` : 'none',
    // 页脚不再印地标名称，水印本身已经足够表达
    watermarkName: '',

    kicker: kickers[kind] || '',
    corner: corners[kind] || '',
    pageNo: ui.overlay ? '——' : String(ui.page).padStart(2, '0'),
    label: ui.overlay === 'board' ? '排行 LEADERBOARD'
         : ui.overlay === 'guide' ? '玩法 HOW TO PLAY' : cur.label,

    /* ---- 翻页（唯一保留的交互） ---- */
    next: () => actions.move(1),
    pageTap: (e) => {
      if (e.__flip) return;
      if (e.target.closest('button, input, a, textarea, select')) return;
      // 封面整页可点，不用去够某个按钮
      if (kind === 'cover') { e.__flip = true; actions.move(1); return; }
      const box = e.currentTarget.getBoundingClientRect();
      // 横版页在竖屏上是旋转 90° 显示的，左右方向落在屏幕的纵轴上
      const rot = landscape && !ui.vpLandscape;
      const frac = rot ? (e.clientY - box.top) / box.height
                       : (e.clientX - box.left) / box.width;
      if (frac <= 0.25) { e.__flip = true; actions.move(-1); return; }
      if (frac >= 0.75) { e.__flip = true; actions.move(1); return; }
      // 点在中间：如果这一关还没盖章，就主动查一次。
      // 页面上不放任何常驻标识，只在请求进行中给一个很轻的反馈。
      // 已经盖章的页面不发请求，防止反复戳。
      if (station && visaScore == null) actions.checkStamp();
    },
    stop: (e) => e.stopPropagation(),

    goBoard: () => actions.setOverlay(ui.overlay === 'board' ? null : 'board'),
    // ? 按钮直接启动新手引导：静态说明读完还是不知道哪个按钮是哪个，
    // 不如把界面元素圈出来一条条指给他看
    goGuide: () => actions.startTour(),
    startTour: () => actions.startTour(),
    goGrace: () => actions.goto(pages.findIndex((p) => p.kind === 'grace')),
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

    identities: IDENTITY_ORDER.map((k) => {
      const m = IDENTITY_META[k];
      const on = k === identityKey;
      return {
        en: m.en,
        bg: on ? m.color : 'transparent',
        fg: on ? '#f3ede0' : 'rgba(42,35,32,.7)',
        bd: on ? m.color : 'rgba(92,26,34,.3)',
        pick: noop, // 身份由总控台抽签决定，这里只是显示
      };
    }),

    fields: [
      { label: 'NATIONALITY 国籍', value: 'GCGCM' },
      { label: 'PASSPORT NO 护照号', value: passportNo },
      { label: 'PLAYER NO 编号', value: String(me?.code || '——') },
      { label: 'TEAM 队伍', value: teamBadge ? `${teamBadge.name}${teamBadge.symbol} · ${teamBadge.teamId}` : '——',
        fg: teamBadge ? teamBadge.hex : undefined },
      { label: 'PLACE OF ISSUE 签发地', value: 'GLASGOW, UK' },
      { label: 'DATE OF ISSUE 签发日期', value: '28 AUG 2026' },
      { label: 'DATE OF EXPIRY 有效期至', value: 'ETERNAL 无尽无穷', fg: '#5c1a22' },
      { label: 'AUTHORITY 签发机关', value: 'GCGCM' },
      { label: 'SCORE 累计积分', value: String(total).padStart(2, '0') + ' / ' + maxTotal },
    ].map((f) => ({ ...f, fg: f.fg || '#2a2320' })),

    mrzOn: true,
    mrz1: mrzLine(1, { surname, given, passportNo, identity: identityLabel, total }),
    mrz2: mrzLine(2, { surname, given, passportNo, identity: identityLabel, total }),
    bars: code39(passportNo),

    /* ---- 二维码（由容器异步生成后传入） ---- */
    qrReady: !!ui.qrThumb,
    qrLoading: !ui.qrThumb,
    qrThumb: ui.qrThumb || null,
    qrBigImg: ui.qrBigImg || null,
    qrBig: ui.modal === 'qr',
    teamBadge,
    teammates,
    goTeam: () => actions.openTeam(),
    photo: ui.photo || null,
    photoGhost: ui.photoGhost || null,
    openQr: () => actions.setModal('qr'),
    closeModal: () => actions.setModal(null),

    /* ---- 导航页 ---- */
    navCards: [
      { cn: '实时排行', en: 'LEADERBOARD', glyph: 'T', chip: 'rgba(92,26,34,.06)',
        desc: '查看当前积分与全场排名。', go: () => actions.setOverlay('board') },
      { cn: '恩典站', en: 'GRACE STATION', glyph: 'G',
        chip: 'radial-gradient(circle at 36% 30%,#e6cd91,#b9913f)',
        desc: '全场只有一枚代币，卡关时可以递出求助。',
        go: () => actions.goto(pages.findIndex((p) => p.kind === 'grace')) },
      { cn: '玩法说明', en: 'HOW TO PLAY', glyph: '?', chip: 'rgba(44,74,90,.08)',
        desc: '身份、关卡、评分与颁奖的完整规则。', go: () => actions.setOverlay('guide') },
    ],
    summaryRows: [
      { label: 'VISAS 完成关卡', value: `${doneCount} / ${stations.length}` },
      { label: 'TOTAL SCORE 总积分', value: String(total).padStart(2, '0') + ' / ' + maxTotal },
      { label: 'CLASS 身份', value: identityLabel },
      { label: 'HELP TOKEN 代币', value: me?.tokensLeft > 0 ? 'UNUSED 未使用' : 'USED 已递出' },
    ],
    doneCount,
    totalPad: String(total).padStart(2, '0'),
    pct: maxTotal ? Math.min(100, Math.round((total / maxTotal) * 100)) : 0,
    shareLabel: ui.shared ? 'COPIED 已复制' : 'SHARE 分享我的护照',
    share: actions.share,

    /* ---- 签证页 ---- */
    visaCn: station ? station.name : '',
    visaEn: station ? String(station.en || '').toUpperCase() : '',
    visaAnnotation: station ? station.rule : '',
    visaFields: station ? [
      { label: 'ISSUING POST 签发站', value: 'GCGCM ' + String(cur.i + 1).padStart(2, '0') },
      { label: 'CONTROL NUMBER 控制号', value: passportNo + '/' + String(cur.i + 1).padStart(2, '0') },
      // 这里显示真名（中文照常显示）；只有下方 MRZ 机读区才做 ASCII 化，
      // 因为真实护照的机读区本来就只允许 A-Z0-9
      { label: 'SURNAME 姓', value: surname || clean(surname, 'PLAYER') },
      { label: 'GIVEN NAMES 名', value: given || clean(given, 'ONE') },
      { label: 'VISA TYPE 类型', value: station.tag || '' },
      { label: 'CLASS 身份', value: identityLabel },
      { label: 'STAFF 工作人员', value: station.staff || '' },
      { label: 'ENTRIES 入境次数', value: 'ONE 一次' },
      { label: 'ISSUING DATE 签发日期', value: '28 AUG 2026' },
      { label: 'EXPIRATION DATE 有效期', value: 'ETERNAL 无尽无穷', fg: '#5c1a22' },
      { label: 'SCORE 得分', value: visaScore == null ? '— —' : (visaScore > 0 ? '+' : '') + visaScore,
        fg: visaScore == null ? 'rgba(42,35,32,.45)' : (STAMP_TONE[visaScore] || '#2a2320') },
    ].map((f) => ({ ...f, fg: f.fg || '#2a2320' })) : [],

    visaStamped: station != null && visaScore != null,
    visaScore,
    stampColor: STAMP_TONE[visaScore] || '#4a5b6a',
    stampLabel: STAMP_WORD[visaScore] || (visaScore != null ? `${visaScore} 分` : ''),
    stampDate: station && done[station.id]?.at
      ? new Date(done[station.id].at).toLocaleDateString('en-GB',
          { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
      : '28 AUG 2026',
    stampNo: station ? String(cur.i + 1).padStart(2, '0') : '',
    stampTop: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].t : '20%',
    stampLeft: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].l : '40%',
    stampRot: station ? STAMP_SPOT[cur.i % STAMP_SPOT.length].r : '0deg',
    // 盖章由工作人员记分产生，选手自己点不出章来。
    // 但没盖章时点一下可以「查一次」—— 刚在关卡被记完分的人想立刻看到章。
    // 已经有章的页面直接返回，不发请求，避免站在那儿反复戳。
    checking: !!ui.checking,
    canCheck: station != null && visaScore == null,
    // 提示框直接调这个：不做边缘翻页判断，只负责查一次
    checkStamp: () => {
      if (!station || visaScore != null) return;
      actions.checkStamp();
    },
    stampTap: (e) => {
      if (e && e.__flip) return;
      const box = e.currentTarget?.getBoundingClientRect?.();
      if (box) {
        // 左右边缘依旧是翻页
        const rot = !ui.vpLandscape;
        const frac = rot ? (e.clientY - box.top) / box.height : (e.clientX - box.left) / box.width;
        if (frac <= 0.25) { e.__flip = true; actions.move(-1); return; }
        if (frac >= 0.75) { e.__flip = true; actions.move(1); return; }
      }
      if (!station) return;
      if (visaScore != null) return;      // 已盖章，不发请求
      actions.checkStamp();
    },

    /* ---- 恩典站 ---- */
    coinFilter: me?.tokensLeft > 0 ? 'none' : 'grayscale(1) opacity(.5)',
    tokenAvailable: (me?.tokensLeft ?? 0) > 0,
    tokenUsed: (me?.tokensLeft ?? 0) <= 0,
    usedAt: '',
    tokenTitle: me?.tokensLeft > 0 ? '你有一枚 Help Token' : '代币已递出',
    tokenBody: me?.tokensLeft > 0
      ? '卡关、遇到难关，或抽到「大凶」被扣分时，随时可前往场地中央的恩典站，把这枚代币交给同工。'
      : '恩典站已经为你提供了帮助，并换给你一张恩典卡。代币不可再次使用。',
    tokenTitleFg: me?.tokensLeft > 0 ? '#5c1a22' : 'rgba(42,35,32,.45)',
    tokenBodyFg: me?.tokensLeft > 0 ? 'rgba(42,35,32,.75)' : 'rgba(42,35,32,.45)',
    helpOpts: HELP_OPTS,
    // 只读：代币由恩典站同工当面收下并在工作人员端记录，这里只弹一个说明
    askToken: () => actions.setModal('token'),
    askingToken: ui.modal === 'token',
    useToken: () => actions.setModal(null),

    guide: GUIDE,

    // 导航页的活动简介（原来那三张功能卡片换成了这个）
    intro: [
      { h: 'WHAT IS THIS 这是什么',
        t: `这是一场 ${Math.round((config?.settings?.gameDurationMin ?? 60))} 分钟的浓缩人生。开局抽签决定你是独行、双人还是三人，` +
           `然后自由顺序去闯 ${stations.length} 个关卡，每过一关由现场同工当场评分并在你的护照上盖章。` },
      { h: 'THE CATCH 有意思的地方',
        t: '起点不是你选的。同样一关，一个人做和三个人做难度完全不同 —— ' +
           '有的关卡人多才转得动，有的关卡人多反而互相拖累。' },
      { h: 'LIFE HAPPENS 途中会发生什么',
        t: '总分每跨过一条红线，就必须去场地中央抽一次人生盲盒。可能天降横财，也可能一夜归零。' +
           '卡住的时候，你手上那枚 Help Token 可以随时递到恩典站换一次帮助。' },
      { h: 'AT THE END 最后',
        t: '除了最高积分，还会颁 The Connector、The Creative 等奖项。' +
           '分数会归零，名次会被忘记，但今晚认识的人还在。' },
    ],

    /* ---- 实时排行榜 ---- */
    boardRows: board.map((r, i) => ({
      rank: String(r.rank ?? i + 1).padStart(2, '0'),
      name: r.name,
      identity: r.identity ? (IDENTITY_META[r.identity]?.en || '') : '——',
      score: String(r.total).padStart(2, '0'),
      bg: r.id === me?.id ? 'rgba(198,164,95,.22)' : 'transparent',
      fg: r.id === me?.id ? '#5c1a22' : '#2a2320',
      hasTag: i < 3,
      tag: ['THE CHAMPION 冠军', 'THE CONNECTOR 联结者', 'THE CREATIVE 创意奖'][i] || '',
      tagFg: ['#a63a2a', '#2f6148', '#4a5b6a'][i] || '#2a2320',
      tagBd: ['rgba(166,58,42,.5)', 'rgba(47,97,72,.5)', 'rgba(74,91,106,.5)'][i] || 'rgba(92,26,34,.3)',
    })),
  };
}

export { STAMP_TONE, STAMP_WORD, IDENTITY_META };
