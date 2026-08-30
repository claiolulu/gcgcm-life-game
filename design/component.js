
const STATIONS = [
  {no:1, cn:'音乐之声', en:'Music Station', tag:'关键字 60 秒',
   rule:'现场抽取一个关键字，唱出 3 首符合条件的歌曲，每首两句即可。',
   scoring:'Solo 独唱 3 首；Duo / Trio 需合唱 3 首，每个人必须开口。',
   props:'[平板] 随机抽取关键字界面及 60 秒倒计时。'},
  {no:2, cn:'英伦百事通', en:'Life in the UK', tag:'实物提问卡',
   rule:'抽取问题卡，回答英国常识与留学生生活冷知识。',
   scoring:'Solo 答对 1 题；Duo 两人各答对 1 题；Trio 三人各答对 1 题，不可互相提示。',
   props:'[实物卡] 制作精美的提问卡片。'},
  {no:3, cn:'灵魂拷问', en:'The Interview', tag:'现场飙戏',
   rule:'工作人员扮演严苛 Tutor，你抽取一道刁钻的情景题，当场应答。',
   scoring:'Solo 独立对答；Duo / Trio 需分工扮演角色（学生 + Tutor + 愤怒室友）进行现场飙戏。',
   props:'[平板] 工作人员用平板记录评分及备选情景题库。'},
  {no:4, cn:'定格瞬间', en:'Photo Story', tag:'四格小故事',
   rule:'抽取一个故事主题和必需道具，在指定背景拍出四格小故事。',
   scoring:'Solo（劣势）必须在现场主动邀请至少 1 位路人配合出镜；Duo / Trio 直接分工出片。',
   props:'[实物] 拍立得相框、假书、空咖啡杯等轻便道具。'},
  {no:5, cn:'记忆观察', en:'Memory & Observation', tag:'30 秒观察',
   rule:'观察桌面上的一堆物品 30 秒，随后盖布，凭记忆回答工作人员的提问。',
   scoring:'Solo 答对 3 题；Duo 答对 6 题；Trio 答对 9 题，每人必须至少回答 1 题。',
   props:'[实物 + 平板] 15–20 件日常杂物、盖布；工作人员持平板查看问题。'},
  {no:6, cn:'摸黑套圈', en:'Messy Flatmate', tag:'30 秒盲摸',
   rule:'30 秒内在塞满杂物的不透明箱子里，纯靠手感摸出指定的 3 件东西。',
   scoring:'Solo 可双臂自由摸索；Duo / Trio 规定每人只能伸入一只手，狭小空间内极易碰撞干扰。',
   props:'[实物] 开孔不透明收纳箱、各类杂物、3 件目标物。'},
  {no:7, cn:'寂静图书馆', en:'The Silent Library', tag:'禁言拼图',
   rule:'60 秒内拼完一张被剪碎的信件。全程禁言，出声会被扣分。',
   scoring:'Solo 静音专注拼图，速度极快；Duo / Trio 多人手杂又不能沟通，手语乱舞极易憋笑失控。',
   props:'[实物] 过塑后剪碎的 A4 拼图两套、「SILENCE」警告牌。'},
  {no:8, cn:'人生选择', en:'Life Decisions', tag:'二选一',
   rule:'在几个人生岔路口上做出选择。每个选择都会带来不同的后续结果，选完即生效，不能反悔。',
   scoring:'', props:''}
];

const IDENTITIES = [
  {key:'SOLO', en:'SOLO', cn:'独行侠', color:'#5c1a22'},
  {key:'DUO', en:'DUO', cn:'双人搭档', color:'#2c4a5a'},
  {key:'TRIO', en:'TRIO', cn:'三股绳', color:'#37543c'}
];

const GUIDE = [
  {n:1, cn:'抽取身份', en:'IDENTITY', body:'开局抽签决定 Solo / Duo / Trio。人生起点不由自己选择，能力起点不同，关卡难度也不同。'},
  {n:2, cn:'挑战八关', en:'EIGHT VISAS', body:'八张签证页自由顺序前往。每关由工作人员当场评分：3 分勉强完成、6 分正常完成、9 分出色完成，只在个人护照上盖章。'},
  {n:3, cn:'遇到意外', en:'LIFE EVENT', body:'总分首次跨过 15 / 30 / 50 分时，必须前往场地中央抽人生盲盒，可能加分也可能扣分。'},
  {n:4, cn:'寻求恩典', en:'GRACE', body:'卡关、遇到难关或抽到「大凶」被扣分时，随时可到恩典站递出 Help Token 求助。全场只有一枚。'},
  {n:5, cn:'结业颁奖', en:'AWARDS', body:'除最高积分奖外，另颁 The Connector、The Creative 等迎新向奖项，最后进入福音反思环节。'}
];

const HELP_OPTS = [
  {n:'I', en:'HINT / HELPER', cn:'提供关卡关键提示，或安排一位 NPC 协助你完成。'},
  {n:'II', en:'SECOND CHANCE', cn:'给予一次免费重新挑战该关卡的机会。'},
  {n:'III', en:'GRACE CARD', cn:'换得一张精美的恩典卡，可带走留念。'}
];

const C39 = {'0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn','U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','*':'nwnnwnwnn'};

const TONES = {cream: '#f3ede0', ivory: '#f7f2e7', blue: '#eceff0'};

const PAGES = [
  {kind:'cover', label:'COVER 封面'},
  {kind:'inside', label:'欢迎 WELCOME'},
  {kind:'notes', label:'导航 INDEX'},
  {kind:'data', label:'资料页 DATA PAGE'},
  {kind:'visa', i:0, label:'签证 01 音乐之声'},
  {kind:'visa', i:1, label:'签证 02 英伦百事通'},
  {kind:'visa', i:2, label:'签证 03 灵魂拷问'},
  {kind:'visa', i:3, label:'签证 04 定格瞬间'},
  {kind:'visa', i:4, label:'签证 05 记忆观察'},
  {kind:'visa', i:5, label:'签证 06 摸黑套圈'},
  {kind:'visa', i:6, label:'签证 07 寂静图书馆'},
  {kind:'visa', i:7, label:'签证 08 人生选择'},
  {kind:'grace', label:'恩典站 GRACE'},
  {kind:'closing', label:'结语 CLOSING'}
];

const ROMAN = ['I','II','III','IV','V','VI','VII'];
const STAFF = ['梁潇 · 益嘉','陈逸欣','Emy · 大伟','任飞 · 刘烁','德浩','Sean','卫红 · Crystal','昊阳 · 静文 · Wallace'];

// stamp: colour = score, varied tilt / position per station
const STAMP_TONE = {3: '#4a5b6a', 6: '#2f6148', 9: '#a63a2a'};
const STAMP_WORD = {3: '勉强完成', 6: '正常完成', 9: '出色完成'};
const STAMP_SPOT = [
  {t: '50%', l: '52%', r: '-14deg'},
  {t: '48%', l: '9%', r: '11deg'},
  {t: '20%', l: '30%', r: '-7deg'},
  {t: '54%', l: '58%', r: '17deg'},
  {t: '14%', l: '22%', r: '8deg'},
  {t: '50%', l: '38%', r: '-19deg'},
  {t: '56%', l: '60%', r: '13deg'},
  {t: '46%', l: '24%', r: '-11deg'}
];

function wm(key) {
  return key ? 'url("./assets/wm/' + key + '.png")' : 'none';
}

const LANDMARK = {
  inside: {key: 'cathedral', name: 'GLASGOW CATHEDRAL 格拉斯哥大教堂'},
  notes: {key: 'city-chambers', name: 'CITY CHAMBERS 格拉斯哥市政厅'},
  data: {key: 'university', name: 'UNIVERSITY OF GLASGOW 格拉斯哥大学'},
  grace: {key: 'cathedral', name: 'GLASGOW CATHEDRAL 格拉斯哥大教堂'},
  guide: {key: 'city-chambers', name: 'CITY CHAMBERS 格拉斯哥市政厅'},
  board: {key: 'george-square', name: 'GEORGE SQUARE 乔治广场'},
  closing: {key: 'cathedral', name: 'GLASGOW CATHEDRAL 格拉斯哥大教堂'}
};

const VISA_LANDMARK = [
  {key: 'clyde-auditorium', name: 'CLYDE AUDITORIUM 克莱德音乐厅'},
  {key: 'clyde-arc', name: 'CLYDE ARC 克莱德拱桥'},
  {key: 'george-square', name: 'GEORGE SQUARE 乔治广场'},
  {key: 'riverside', name: 'RIVERSIDE MUSEUM 河滨博物馆'},
  {key: 'botanic', name: 'BOTANIC GARDENS 格拉斯哥植物园'},
  {key: 'crane', name: 'FINNIESTON CRANE 芬尼斯顿起重机'},
  {key: 'kelvingrove', name: 'KELVINGROVE PARK 凯尔文格罗夫公园'},
  {key: 'city-chambers', name: 'CITY CHAMBERS 格拉斯哥市政厅'}
];

class Component extends DCLogic {
  state = {
    page: 0,
    seed: Math.floor(Math.random() * 100000),
    name: '', surname: '', given: '',
    identity: 'SOLO',
    done: {},
    tokenUsed: false, usedAt: '',
    modal: null,
    qrReady: false,
    shared: false,
    overlay: null,
    returnTo: null,
    vpLandscape: typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(orientation: landscape)').matches : false
  };

  componentDidMount() {
    if (window.matchMedia) {
      this.mq = window.matchMedia('(orientation: landscape)');
      this.onOrient = e => this.setState({vpLandscape: e.matches});
      if (this.mq.addEventListener) this.mq.addEventListener('change', this.onOrient);
      else this.mq.addListener(this.onOrient);
      this.setState({vpLandscape: this.mq.matches});
    }
    this.onKey = e => {
      if (this.state.modal) return;
      if (e.key === 'ArrowRight') this.move(1);
      if (e.key === 'ArrowLeft') this.move(-1);
    };
    window.addEventListener('keydown', this.onKey);
    if (window.qrcode) { this.setState({qrReady: true}); return; }
    this.t = setInterval(() => {
      if (window.qrcode) { clearInterval(this.t); this.setState({qrReady: true}); }
    }, 120);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.onKey);
    if (this.mq && this.onOrient) {
      if (this.mq.removeEventListener) this.mq.removeEventListener('change', this.onOrient);
      else this.mq.removeListener(this.onOrient);
    }
    if (this.t) clearInterval(this.t);
  }

  move(d) { this.setState(s => ({overlay: null, returnTo: null, page: Math.max(0, Math.min(PAGES.length - 1, s.page + d))})); }

  rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  passportNo() { return 'GCGCM' + String(100000 + (this.state.seed % 900000)); }

  code39(no, unit, color) {
    const out = [];
    ('*' + no + '*').split('').forEach((ch, ci, arr) => {
      const pat = C39[ch] || C39['0'];
      for (let i = 0; i < 9; i++) out.push({w: pat[i] === 'w' ? unit * 2.2 : unit, c: i % 2 === 0 ? color : 'transparent'});
      if (ci < arr.length - 1) out.push({w: unit, c: 'transparent'});
    });
    return out;
  }

  qrEl(size) {
    if (!this.state.qrReady || !window.qrcode) return null;
    try {
      const q = window.qrcode(0, 'M');
      q.addData('GCGCM|' + this.passportNo() + '|' + this.state.identity);
      q.make();
      return React.createElement('img', {src: q.createDataURL(size, 0), alt: 'QR',
        style: {width: '100%', height: '100%', display: 'block'}});
    } catch (e) { return null; }
  }

  total() { return Object.values(this.state.done).reduce((a, b) => a + b, 0); }
  clean(s, fb) { return (s || fb).toUpperCase().replace(/[^A-Z0-9]/g, '') || fb; }

  dob() {
    const r = this.rng(this.state.seed + 3);
    const y = 1998 + Math.floor(r() * 10);
    const m = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][Math.floor(r() * 12)];
    const d = 1 + Math.floor(r() * 28);
    return String(d).padStart(2, '0') + ' ' + m + ' ' + y;
  }

  mrzLine(n) {
    const sn = this.clean(this.state.surname, 'PLAYER');
    const gn = this.clean(this.state.given, this.clean(this.state.name, 'ONE'));
    const pad = (s, len) => (s + '<'.repeat(Math.max(0, len - s.length))).slice(0, len);
    if (n === 1) return pad('P<GCGCM' + sn + '<<' + gn, 38);
    return pad(this.passportNo() + '<GCGCM' + this.state.identity + '<' + String(this.total()).padStart(2, '0') + 'PTS', 38);
  }

  renderVals() {
    const st = this.state;
    const total = this.total();
    const doneCount = Object.keys(st.done).length;
    const no = this.passportNo();
    const idt = IDENTITIES.find(x => x.key === st.identity) || IDENTITIES[0];
    const cur = PAGES[st.page];
    const kind = st.overlay || cur.kind;
    const landscape = kind === 'data' || kind === 'visa';
    const station = kind === 'visa' ? STATIONS[cur.i] : null;
    const visaScore = station ? st.done[cur.i] : null;

    const kickers = {
      inside: 'WELCOME 欢迎',
      notes: 'INDEX 导航',
      data: 'IDENTIFICATION 身份资料',
      visa: 'VISA 签证 · GCGCM',
      grace: 'GRACE STATION 恩典站',
      guide: 'HOW TO PLAY 玩法',
      board: 'LEADERBOARD 实时排行',
      closing: 'CLOSING 结语'
    };
    const corners = {
      inside: 'ROM 15:7',
      notes: no,
      data: 'TYPE P / GCGCM',
      visa: station ? 'STATION 0' + (cur.i + 1) : '',
      grace: 'YIHAN · 佳琪',
      guide: 'RULES · 点问号返回',
      board: 'LIVE · 点奖杯返回',
      closing: 'JOHN 15:12'
    };

    const mark = kind === 'visa' ? VISA_LANDMARK[cur.i] : LANDMARK[kind];

    return {
      watermark: mark ? wm(mark.key) : 'none',
      watermarkName: mark ? mark.name : '',
      isPortrait: !landscape,
      isLandscape: landscape,
      stageMax: landscape && st.vpLandscape ? '100%' : '430px',
      lsW: st.vpLandscape ? '100%' : '100cqh',
      lsH: st.vpLandscape ? '100%' : '100cqw',
      lsTransform: st.vpLandscape ? 'translate(-50%,-50%)' : 'translate(-50%,-50%) rotate(90deg)',
      isCover: kind === 'cover',
      isPaper: !landscape && kind !== 'cover',
      isInside: kind === 'inside',
      isNotes: kind === 'notes',
      isGrace: kind === 'grace',
      isGuide: kind === 'guide',
      isBoard: kind === 'board',
      isClosing: kind === 'closing',
      isData: kind === 'data',
      isVisa: kind === 'visa',
      kicker: kickers[kind] || '',
      corner: corners[kind] || '',
      pageNo: st.overlay ? '——' : String(st.page).padStart(2, '0'),
      navLabel: st.overlay === 'board' ? '排行 LEADERBOARD' : st.overlay === 'guide' ? '玩法 HOW TO PLAY' : cur.label,
      paper: TONES[this.props.pageTone] || TONES.cream,
      guilloche: this.props.guilloche === false ? 0 : 1,

      goGrace: () => this.setState(s => ({overlay: null, returnTo: PAGES[s.page].kind === 'grace' ? s.returnTo : s.page, page: PAGES.findIndex(p => p.kind === 'grace')})),
      goBoard: () => this.setState(s => ({overlay: s.overlay === 'board' ? null : 'board'})),
      goGuide: () => this.setState(s => ({overlay: s.overlay === 'guide' ? null : 'guide'})),
      summaryRows: [
        {label: 'VISAS 完成关卡', value: doneCount + ' / 8'},
        {label: 'TOTAL SCORE 总积分', value: String(total).padStart(2, '0') + ' / 72'},
        {label: 'CLASS 身份', value: st.identity},
        {label: 'HELP TOKEN 代币', value: st.tokenUsed ? 'USED 已递出' : 'UNUSED 未使用'}
      ],
      shareLabel: st.shared ? 'COPIED 已复制' : 'SHARE 分享我的护照',
      share: () => {
        const txt = 'GCGCM 迷你人生游戏 · ' + no + ' · ' + st.identity + ' · ' + total + '/72 分，完成 ' + doneCount + '/8 关。';
        const done = () => { this.setState({shared: true}); setTimeout(() => this.setState({shared: false}), 2000); };
        if (navigator.share) { navigator.share({title: 'GCGCM 迷你人生游戏', text: txt}).then(done).catch(() => {}); return; }
        if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(done).catch(done); return; }
        done();
      },
      navCards: [
        {cn: '实时排行', en: 'LEADERBOARD', glyph: 'T', chip: 'rgba(92,26,34,.06)', desc: '查看当前积分与全场排名。', overlay: 'board'},
        {cn: '恩典站', en: 'GRACE STATION', glyph: 'G', chip: 'radial-gradient(circle at 36% 30%,#e6cd91,#b9913f)', desc: '全场只有一枚代币，卡关时可以递出求助。', overlay: null},
        {cn: '玩法说明', en: 'HOW TO PLAY', glyph: '?', chip: 'rgba(44,74,90,.08)', desc: '身份、关卡、评分与颁奖的完整规则。', overlay: 'guide'}
      ].map(c => ({cn: c.cn, en: c.en, glyph: c.glyph, chip: c.chip, desc: c.desc,
        go: () => c.overlay
          ? this.setState({overlay: c.overlay})
          : this.setState(s => ({overlay: null, returnTo: s.page, page: PAGES.findIndex(p => p.kind === 'grace')}))})),
      closeAside: () => this.setState(s => {
        if (s.overlay) return {overlay: null};
        const idx = PAGES.findIndex(p => p.kind === 'notes');
        const target = s.returnTo != null && s.returnTo !== s.page ? s.returnTo : idx;
        return {page: target, returnTo: null};
      }),
      pageTap: e => {
        if (e.__omFlip) return;
        if (e.target.closest('button, input, a, textarea, select')) return;
        const box = e.currentTarget.getBoundingClientRect();
        // when a landscape page is shown rotated on a portrait screen,
        // the page's left/right runs along the screen's vertical axis
        const rot = landscape && !st.vpLandscape;
        const frac = rot
          ? (e.clientY - box.top) / box.height
          : (e.clientX - box.left) / box.width;
        if (frac <= 0.25) { e.__omFlip = true; this.move(-1); }
        else if (frac >= 0.75) { e.__omFlip = true; this.move(1); }
      },
      prev: () => this.move(-1),
      next: () => this.move(1),
      dots: PAGES.map((p, i) => ({
        go: () => this.setState({overlay: null, returnTo: null, page: i}),
        w: i === st.page && !st.overlay ? 18 : 6,
        bg: i === st.page && !st.overlay ? '#c6a45f' : 'rgba(240,226,196,.24)'
      })),
      stop: e => e.stopPropagation(),

      passportNo: no,
      totalPad: String(total).padStart(2, '0'),
      doneCount,
      pct: Math.min(100, Math.round((total / 72) * 100)),

      visaCn: station ? station.cn : '',
      visaEn: station ? station.en.toUpperCase() : '',
      visaFields: station ? [
        {label: 'ISSUING POST 签发站', value: 'GCGCM 0' + (cur.i + 1)},
        {label: 'CONTROL NUMBER 控制号', value: no + '/0' + (cur.i + 1)},
        {label: 'SURNAME 姓', value: this.clean(st.surname, 'PLAYER')},
        {label: 'GIVEN NAMES 名', value: this.clean(st.given, this.clean(st.name, 'ONE'))},
        {label: 'VISA TYPE 类型', value: station.tag},
        {label: 'CLASS 身份', value: st.identity},
        {label: 'STAFF 工作人员', value: STAFF[cur.i]},
        {label: 'ENTRIES 入境次数', value: 'ONE 一次'},
        {label: 'ISSUING DATE 签发日期', value: '28 AUG 2026'},
        {label: 'EXPIRATION DATE 有效期', value: 'ETERNAL 无尽无穷', fg: '#5c1a22'},
        {label: 'SCORE 得分', value: visaScore == null ? '— —' : '+' + visaScore, fg: visaScore == null ? 'rgba(42,35,32,.45)' : STAMP_TONE[visaScore]}
      ].map(v => ({label: v.label, value: v.value, fg: v.fg || '#2a2320'})) : [],
      visaAnnotation: station ? station.rule : '',
      visaStamped: station != null && visaScore != null,
      visaScore: visaScore,
      stampColor: visaScore ? STAMP_TONE[visaScore] : '#4a5b6a',
      stampLabel: visaScore ? STAMP_WORD[visaScore] : '',
      stampDate: '28 AUG 2026',
      stampNo: station ? '0' + (cur.i + 1) : '',
      stampTop: station ? STAMP_SPOT[cur.i].t : '20%',
      stampLeft: station ? STAMP_SPOT[cur.i].l : '40%',
      stampRot: station ? STAMP_SPOT[cur.i].r : '0deg',
      stampTap: e => {
        if (!station) return;
        if (e && e.__omFlip) return;
        if (e && e.clientX != null) {
          const rot = !st.vpLandscape;
          const frac = rot
            ? e.clientY / window.innerHeight
            : e.clientX / window.innerWidth;
          if (frac <= 0.25 || frac >= 0.75) return;
        }
        const cyc = {null: 3, 3: 6, 6: 9, 9: null};
        const nextVal = visaScore == null ? 3 : cyc[visaScore];
        this.setState(s2 => {
          const d = Object.assign({}, s2.done);
          if (nextVal == null) delete d[cur.i]; else d[cur.i] = nextVal;
          return {done: d};
        });
      },

      name: st.name, surname: st.surname, given: st.given,
      setName: e => this.setState({name: e.target.value}),
      setSurname: e => this.setState({surname: e.target.value}),
      setGiven: e => this.setState({given: e.target.value}),
      identities: IDENTITIES.map(x => ({
        en: x.en,
        bg: x.key === st.identity ? x.color : 'transparent',
        fg: x.key === st.identity ? '#f3ede0' : 'rgba(42,35,32,.7)',
        bd: x.key === st.identity ? x.color : 'rgba(92,26,34,.3)',
        pick: () => this.setState({identity: x.key})
      })),
      fields: [
        {label: 'NATIONALITY 国籍', value: 'GCGCM'},
        {label: 'DATE OF BIRTH 出生日期', value: this.dob()},
        {label: 'PLACE OF BIRTH 出生地', value: 'EARTH 地球'},
        {label: 'PLACE OF ISSUE 签发地', value: 'GLASGOW, UK'},
        {label: 'DATE OF ISSUE 签发日期', value: '28 AUG 2026'},
        {label: 'DATE OF EXPIRY 有效期至', value: 'ETERNAL 无尽无穷', fg: '#5c1a22'},
        {label: 'AUTHORITY 签发机关', value: 'GCGCM'},
        {label: 'SCORE 累计积分', value: String(total).padStart(2, '0') + ' / 72'}
      ].map(f => ({label: f.label, value: f.value, fg: f.fg || '#2a2320'})),
      mrzOn: this.props.mrzVisible !== false,
      mrz1: this.mrzLine(1),
      mrz2: this.mrzLine(2),

      issueRows: [
        {label: 'AUTHORITY 签发机关', value: 'GCGCM'},
        {label: 'PLACE OF ISSUE 签发地', value: 'GLASGOW, UK'},
        {label: 'DATE OF ISSUE 签发日期', value: '28 AUG 2026'},
        {label: 'VALID UNTIL 有效期至', value: 'ETERNAL 无尽无穷'}
      ],

      qrReady: st.qrReady,
      qrLoading: !st.qrReady,
      qrThumb: this.qrEl(3),
      qrBigImg: this.qrEl(6),
      bars: this.code39(no, 1.5, '#2a2320'),

      coinFilter: st.tokenUsed ? 'grayscale(1) opacity(.5)' : 'none',
      tokenAvailable: !st.tokenUsed,
      tokenUsed: st.tokenUsed,
      usedAt: st.usedAt,
      tokenTitle: st.tokenUsed ? '代币已递出' : '你有一枚 Help Token',
      tokenBody: st.tokenUsed
        ? '恩典站已为你提供帮助，并换取了一张恩典卡。代币不可再次使用。'
        : '卡关、遇到难关，或抽到「大凶」被扣分时，随时可前往场地中央的恩典站，递出这枚代币寻求帮助。',
      tokenTitleFg: st.tokenUsed ? 'rgba(42,35,32,.45)' : '#5c1a22',
      tokenBodyFg: st.tokenUsed ? 'rgba(42,35,32,.45)' : 'rgba(42,35,32,.75)',
      helpOpts: HELP_OPTS,
      guide: GUIDE,
      askToken: () => this.setState({modal: 'token'}),
      useToken: () => this.setState({tokenUsed: true, modal: null,
        usedAt: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}),

      askingToken: st.modal === 'token',
      qrBig: st.modal === 'qr',
      openQr: () => this.setState({modal: 'qr'}),
      closeModal: () => this.setState({modal: null}),

      boardRows: [
        {name: '德浩', identity: 'SOLO', score: 54},
        {name: '逸欣 · 佳琪', identity: 'DUO', score: 48},
        {name: st.name || '你 YOU', identity: idt.en, score: total, me: true},
        {name: '梁潇 · 益嘉 · 大伟', identity: 'TRIO', score: 33},
        {name: 'Emy', identity: 'SOLO', score: 27},
        {name: 'Sean · Wallace', identity: 'DUO', score: 21}
      ].sort((a, b) => b.score - a.score).map((r, i) => ({
        rank: String(i + 1).padStart(2, '0'),
        name: r.name, identity: r.identity, score: String(r.score).padStart(2, '0'),
        bg: r.me ? 'rgba(198,164,95,.22)' : 'transparent',
        fg: r.me ? '#5c1a22' : '#2a2320',
        hasTag: i < 3,
        tag: ['THE CHAMPION 冠军','THE CONNECTOR 联结者','THE CREATIVE 创意奖'][i] || '',
        tagFg: ['#a63a2a','#2f6148','#4a5b6a'][i] || '#2a2320',
        tagBd: ['rgba(166,58,42,.5)','rgba(47,97,72,.5)','rgba(74,91,106,.5)'][i] || 'rgba(92,26,34,.3)'
      }))
    };
  }
}

