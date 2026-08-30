import React from 'react';

/**
 * 参数化 SVG 头像。
 * 不用外部头像 API（要联网）、不用上传图片（弱网必挂），
 * 头像就是一小段 JSON，本地渲染、任意尺寸都清晰、结业徽章能直接复用同一份数据。
 */

export const SKINS = ['#f6d5bd', '#eec1a0', '#dda57e', '#c4855c', '#9c6440', '#71482c'];

export const HAIR_COLORS = ['#1e1a17', '#3c2a1e', '#6b4423', '#a86b32', '#d9a441', '#8b8f9e', '#c94f4f', '#6c5ce7'];

export const OUTFITS = ['#4a9bff', '#3ec98a', '#e8c56a', '#ff6fae', '#b06cf0', '#ff8b4a', '#2bc4c4', '#8b8f9e'];

export const BACKGROUNDS = [
  ['#1e3a5f', '#0f2038'],
  ['#3d2d5c', '#1e1533'],
  ['#1f4d3d', '#0d2a20'],
  ['#5c3a2d', '#2e1c14'],
  ['#4a3d1a', '#241d08'],
  ['#2d4a5c', '#132835'],
  ['#5c2d3d', '#33121d'],
  ['#333a4d', '#1a1e29'],
];

export const HAIR_STYLES = ['short', 'buzz', 'bob', 'long', 'ponytail', 'bun', 'curly', 'wavy', 'afro', 'bald'];
export const EYE_STYLES = ['dot', 'happy', 'big', 'wink', 'sleepy', 'sparkle'];
export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'oh', 'smirk', 'laugh'];
/**
 * 配饰分成三个互相独立的槽位，可以同时戴 —— 比如学士帽 + 圆框眼镜 + 十字架项链。
 * 旧数据里的单一 accessory 字段仍然认，见 normalizeAvatar()。
 */
/**
 * 背景装饰。画在底色渐变之上、人物之下，一律用半透明白，
 * 这样八种底色渐变配哪一个都不会脏。
 * 坐标全部写死 —— 头像必须是纯函数，同一份 JSON 在任何设备上都要长得一样。
 */
export const BG_PATTERNS = ['none', 'stars', 'rays', 'dots', 'stripes', 'halo', 'skyline', 'bubbles', 'grid', 'confetti'];

export const HATS = ['none', 'beanie', 'cap', 'bucket', 'grad', 'hood', 'headband', 'flower', 'headphones', 'airpods'];
export const FACES = ['none', 'glasses', 'round', 'sunglasses', 'mask'];
export const EXTRAS = ['none', 'earrings', 'cross', 'scarf', 'bowtie'];

// 兼容早期只有一个 accessory 字段的头像
const LEGACY_ACCESSORY = [
  {}, { face: 1 }, { face: 3 }, { hat: 1 }, { hat: 8 }, { extra: 3 }, { extra: 1 },
];

/** 把任意版本的头像配置补全成当前的槽位结构 */
export function normalizeAvatar(config) {
  const a = { ...DEFAULT_AVATAR, ...(config || {}) };
  if (a.accessory != null && a.hat == null && a.face == null && a.extra == null) {
    Object.assign(a, LEGACY_ACCESSORY[a.accessory % LEGACY_ACCESSORY.length] || {});
  }
  return { hat: 0, face: 0, extra: 0, bgp: 0, ...a };
}

const pick = (arr, i) => arr[((i ?? 0) % arr.length + arr.length) % arr.length];

export function randomAvatar() {
  const r = (n) => Math.floor(Math.random() * n);
  return {
    bg: r(BACKGROUNDS.length),
    skin: r(SKINS.length),
    hair: r(HAIR_STYLES.length),
    hairColor: r(HAIR_COLORS.length),
    eyes: r(EYE_STYLES.length),
    mouth: r(MOUTH_STYLES.length),
    // 每个槽位有较大概率是「无」，否则人人满头挂件反而不好看
    hat: Math.random() < 0.45 ? 0 : 1 + r(HATS.length - 1),
    face: Math.random() < 0.6 ? 0 : 1 + r(FACES.length - 1),
    extra: Math.random() < 0.65 ? 0 : 1 + r(EXTRAS.length - 1),
    outfit: r(OUTFITS.length),
    // 背景留三成的概率是纯底色，否则每个人都花花绿绿，反而没有对比
    bgp: Math.random() < 0.3 ? 0 : 1 + r(BG_PATTERNS.length - 1),
  };
}

export const DEFAULT_AVATAR = {
  bg: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, mouth: 0, outfit: 0,
  hat: 0, face: 0, extra: 0, bgp: 0,
};

/* ------------------------------- 发型 ------------------------------- */

function Hair({ style, color }) {
  switch (style) {
    case 'buzz':
      return <path d="M29 42 Q29 20 50 20 Q71 20 71 42 Q66 30 50 30 Q34 30 29 42Z" fill={color} />;
    case 'bob':
      return (
        <g fill={color}>
          <path d="M26 46 Q26 17 50 17 Q74 17 74 46 L74 56 Q71 42 66 39 Q50 46 34 39 Q29 42 26 56Z" />
          <path d="M24 44 Q22 60 26 68 L31 68 Q28 56 29 44Z" />
          <path d="M76 44 Q78 60 74 68 L69 68 Q72 56 71 44Z" />
        </g>
      );
    case 'long':
      return (
        <g fill={color}>
          <path d="M26 46 Q26 17 50 17 Q74 17 74 46 L74 54 Q70 41 65 38 Q50 45 35 38 Q30 41 26 54Z" />
          <path d="M23 42 Q19 66 24 84 L33 84 Q27 64 28 42Z" />
          <path d="M77 42 Q81 66 76 84 L67 84 Q73 64 72 42Z" />
        </g>
      );
    case 'ponytail':
      return (
        <g fill={color}>
          <path d="M28 42 Q28 18 50 18 Q72 18 72 42 Q68 29 50 29 Q32 29 28 42Z" />
          <ellipse cx="78" cy="48" rx="8" ry="13" transform="rotate(16 78 48)" />
          <circle cx="72" cy="34" r="5" />
        </g>
      );
    case 'bun':
      return (
        <g fill={color}>
          <path d="M28 42 Q28 19 50 19 Q72 19 72 42 Q68 30 50 30 Q32 30 28 42Z" />
          <circle cx="50" cy="14" r="9" />
        </g>
      );
    case 'curly':
      return (
        <g fill={color}>
          <circle cx="34" cy="28" r="10" />
          <circle cx="50" cy="21" r="11" />
          <circle cx="66" cy="28" r="10" />
          <circle cx="28" cy="40" r="8" />
          <circle cx="72" cy="40" r="8" />
        </g>
      );
    case 'wavy':
      return (
        <path
          fill={color}
          d="M27 44 Q25 18 50 18 Q75 18 73 44 Q69 36 64 40 Q58 33 50 38 Q42 33 36 40 Q31 36 27 44Z"
        />
      );
    case 'afro':
      return (
        <g fill={color}>
          <circle cx="50" cy="32" r="28" />
          <circle cx="30" cy="42" r="12" />
          <circle cx="70" cy="42" r="12" />
        </g>
      );
    case 'bald':
      return null;
    case 'short':
    default:
      return (
        <path
          fill={color}
          d="M28 42 Q28 18 50 18 Q72 18 72 42 Q72 31 62 28 Q50 35 38 28 Q28 31 28 42Z"
        />
      );
  }
}

/* ------------------------------- 眼睛 ------------------------------- */

function Eyes({ style }) {
  const ink = '#20242e';
  switch (style) {
    case 'happy':
      return (
        <g stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M36 44 Q41 39 46 44" />
          <path d="M54 44 Q59 39 64 44" />
        </g>
      );
    case 'big':
      return (
        <g>
          <ellipse cx="41" cy="44" rx="5" ry="5.6" fill="#fff" />
          <ellipse cx="59" cy="44" rx="5" ry="5.6" fill="#fff" />
          <circle cx="41.8" cy="44.6" r="2.9" fill={ink} />
          <circle cx="59.8" cy="44.6" r="2.9" fill={ink} />
          <circle cx="40.3" cy="42.8" r="1.1" fill="#fff" />
          <circle cx="58.3" cy="42.8" r="1.1" fill="#fff" />
        </g>
      );
    case 'wink':
      return (
        <g>
          <circle cx="41" cy="44" r="2.9" fill={ink} />
          <path d="M54 44.5 Q59 39.5 64 44.5" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        </g>
      );
    case 'sleepy':
      return (
        <g stroke={ink} strokeWidth="2.6" strokeLinecap="round">
          <path d="M36 44.5 L46 44.5" />
          <path d="M54 44.5 L64 44.5" />
        </g>
      );
    case 'sparkle':
      return (
        <g fill={ink}>
          <circle cx="41" cy="44" r="3.4" />
          <circle cx="59" cy="44" r="3.4" />
          <circle cx="39.7" cy="42.7" r="1.3" fill="#fff" />
          <circle cx="57.7" cy="42.7" r="1.3" fill="#fff" />
        </g>
      );
    case 'dot':
    default:
      return (
        <g fill={ink}>
          <circle cx="41" cy="44" r="3" />
          <circle cx="59" cy="44" r="3" />
        </g>
      );
  }
}

/* ------------------------------- 嘴巴 ------------------------------- */

function Mouth({ style }) {
  const ink = '#20242e';
  switch (style) {
    case 'grin':
      return (
        <g>
          <path d="M40 55 Q50 64 60 55 Z" fill="#3a2028" />
          <path d="M41.5 55.6 L58.5 55.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
    case 'neutral':
      return <path d="M44 57 L56 57" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />;
    case 'oh':
      return <ellipse cx="50" cy="57" rx="4" ry="5" fill="#3a2028" />;
    case 'smirk':
      return <path d="M44 56 Q52 61 58 55" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    case 'laugh':
      return (
        <g>
          <path d="M38 53 Q50 67 62 53 Z" fill="#3a2028" />
          <path d="M43 62 Q50 66 57 62 Z" fill="#e8737f" />
        </g>
      );
    case 'smile':
    default:
      return <path d="M43 55 Q50 62 57 55" stroke={ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  }
}

/* ------------------------------- 配饰 ------------------------------- */
/* 三个槽位各自独立渲染，图层顺序在主组件里安排：
   兜帽后片 → 身体 → 脖饰 → 头 → 耳环 → 头发 → 五官 → 眼镜/口罩 → 帽子 */

const shade = (hex, k = 0.72) => {
  const n = parseInt(String(hex).slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
};

/** 兜帽的后片，必须画在头之前 */
function HoodBack({ on, outfit }) {
  if (!on) return null;
  return <path d="M18 84 Q16 13 50 13 Q84 13 82 84 Z" fill={shade(outfit, 0.66)} />;
}

/** 头饰 / 帽子：画在头发之上 */
function Hat({ style, outfit }) {
  switch (style) {
    case 'beanie':
      return (
        <g>
          <path d="M27 38 Q27 15 50 15 Q73 15 73 38 Z" fill={outfit} />
          <rect x="25" y="36" width="50" height="8" rx="4" fill="#fff" opacity="0.9" />
          <circle cx="50" cy="12" r="5" fill="#fff" opacity="0.9" />
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d="M28 34 Q28 13 50 13 Q72 13 72 34 Z" fill={outfit} />
          <path d="M70 29 Q89 31 91 37 Q88 40 70 36 Z" fill={shade(outfit, 0.7)} />
          <circle cx="50" cy="13.5" r="2.6" fill={shade(outfit, 0.6)} />
        </g>
      );
    case 'bucket':
      return (
        <g>
          <path d="M31 33 Q31 14 50 14 Q69 14 69 33 Z" fill={outfit} />
          <path d="M21 32 H79 Q82 39 74 41 H26 Q18 39 21 32 Z" fill={shade(outfit, 0.82)} />
        </g>
      );
    case 'grad':
      return (
        <g>
          <path d="M34 25 Q34 15 50 15 Q66 15 66 25 L66 29 L34 29 Z" fill="#20242e" />
          <path d="M21 24 L50 13 L79 24 L50 35 Z" fill="#272c38" />
          <path d="M78 24 L78 35" stroke="#e8c56a" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="78" cy="37" r="3" fill="#e8c56a" />
        </g>
      );
    case 'hood':
      // 只补一道内缘阴影做出帽沿的厚度；帽子主体是 HoodBack 画在头之后的
      return (
        <path d="M25 84 Q23 20 50 20 Q77 20 75 84" fill="none"
              stroke="rgba(0,0,0,0.22)" strokeWidth="2.6" strokeLinecap="round" />
      );
    case 'headband':
      return <path d="M28 32 Q50 25 72 32 L72 38 Q50 31 28 38 Z" fill={outfit} />;
    case 'flower':
      return (
        <g transform="translate(69,25)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-4.6" rx="3.1" ry="4.6" fill="#ff8fb1" transform={`rotate(${a})`} />
          ))}
          <circle r="2.7" fill="#f7c948" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M26 44 Q26 16 50 16 Q74 16 74 44" stroke="#2a2f3a" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <rect x="20" y="40" width="11" height="17" rx="5.5" fill={outfit} />
          <rect x="69" y="40" width="11" height="17" rx="5.5" fill={outfit} />
        </g>
      );
    case 'airpods':
      return (
        <g fill="#f7f9fc" stroke="#aab4c4" strokeWidth="0.7">
          <circle cx="27" cy="46.5" r="4.1" />
          <circle cx="73" cy="46.5" r="4.1" />
          <rect x="25.1" y="48" width="4" height="11" rx="2" />
          <rect x="70.9" y="48" width="4" height="11" rx="2" />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

/** 眼镜 / 口罩：画在五官之上 */
function FaceGear({ style }) {
  switch (style) {
    case 'glasses':
      return (
        <g stroke="#2a2f3a" strokeWidth="2" fill="rgba(255,255,255,0.16)">
          <rect x="32" y="38" width="16" height="12.5" rx="5" />
          <rect x="52" y="38" width="16" height="12.5" rx="5" />
          <path d="M48 44 L52 44" />
        </g>
      );
    case 'round':
      return (
        <g stroke="#2a2f3a" strokeWidth="1.8" fill="rgba(255,255,255,0.16)">
          <circle cx="40" cy="44" r="7.4" />
          <circle cx="60" cy="44" r="7.4" />
          <path d="M47.4 44 L52.6 44" />
          <path d="M32.6 42.5 L27.5 45" />
          <path d="M67.4 42.5 L72.5 45" />
        </g>
      );
    case 'sunglasses':
      return (
        <g>
          <rect x="31" y="37.5" width="17" height="13" rx="5" fill="#1a1d26" />
          <rect x="52" y="37.5" width="17" height="13" rx="5" fill="#1a1d26" />
          <path d="M48 43 L52 43" stroke="#1a1d26" strokeWidth="2.4" />
          <path d="M34 40.5 L39 40.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'mask':
      return (
        <g>
          <path d="M33 47 Q50 43 67 47 L67 57 Q50 68 33 57 Z" fill="#eaf2f8" stroke="#c3d3e0" strokeWidth="0.8" />
          <path d="M33 49 L26.5 46.5" stroke="#c3d3e0" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M67 49 L73.5 46.5" stroke="#c3d3e0" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M36 52.5 Q50 55.5 64 52.5" stroke="#d6e2ec" strokeWidth="1" fill="none" />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

/** 耳环画在耳朵位置，其余脖饰画在身体之上 */
function ExtraEar({ style }) {
  if (style !== 'earrings') return null;
  return (
    <g fill="#e8c56a">
      <circle cx="26.5" cy="53" r="2.8" />
      <circle cx="73.5" cy="53" r="2.8" />
    </g>
  );
}

function ExtraNeck({ style, accent }) {
  switch (style) {
    case 'cross':
      return (
        <g>
          <path d="M38 71 Q50 82 62 71" stroke="#e8c56a" strokeWidth="1.6" fill="none" />
          <path d="M48.1 79 h3.8 v4 h3.2 v3 h-3.2 v5.6 h-3.8 v-5.6 h-3.2 v-3 h3.2 Z" fill="#e8c56a" />
        </g>
      );
    case 'scarf':
      return (
        <g fill={accent}>
          <path d="M33 71 Q50 80 67 71 L67 79 Q50 87 33 79 Z" />
          <path d="M60 77 L67 95 L59 95 L55 79 Z" />
        </g>
      );
    case 'bowtie':
      return (
        <g fill="#8b1e2d">
          <path d="M50 77 L40 72 L40 82 Z" />
          <path d="M50 77 L60 72 L60 82 Z" />
          <circle cx="50" cy="77" r="2.7" />
        </g>
      );
    case 'none':
    case 'earrings':
    default:
      return null;
  }
}

/* ------------------------------ 背景装饰 ------------------------------ */

// 两档亮度：主体一档、点缀一档。都是白色半透明，叠在任意底色上都干净。
const B1 = 'rgba(255,255,255,.17)';
const B2 = 'rgba(255,255,255,.095)';

/** 四角星，用在 stars / confetti 里 */
function Spark({ x, y, r, fill }) {
  return <path d={`M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`} fill={fill} />;
}

function BgPattern({ style }) {
  switch (style) {
    case 'stars':
      return (
        <g>
          <g fill={B1}>
            <Spark x={16} y={17} r={5} fill={B1} />
            <Spark x={83} y={26} r={4} fill={B1} />
            <Spark x={72} y={9} r={2.6} fill={B1} />
          </g>
          <g fill={B2}>
            <circle cx={30} cy={8} r={1.7} />
            <circle cx={91} cy={12} r={1.4} />
            <circle cx={9} cy={38} r={1.9} />
            <circle cx={93} cy={45} r={1.6} />
            <circle cx={24} cy={31} r={1.3} />
            <circle cx={64} cy={20} r={1.2} />
          </g>
        </g>
      );

    case 'rays': {
      // 从头顶后方散开，只有人物轮廓之外的部分看得见
      const rays = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI * 2) / 16;
        const w = 0.055;
        const R = 95;
        rays.push(
          <path
            key={i}
            d={`M50 40 L${50 + Math.cos(a - w) * R} ${40 + Math.sin(a - w) * R} L${50 + Math.cos(a + w) * R} ${40 + Math.sin(a + w) * R} Z`}
            fill={i % 2 ? B2 : B1}
          />,
        );
      }
      return <g>{rays}</g>;
    }

    case 'dots': {
      const dots = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          dots.push(<circle key={`${r}-${c}`} cx={6 + c * 11.5 + (r % 2 ? 5.75 : 0)} cy={6 + r * 11.5} r={2} />);
        }
      }
      return <g fill={B2}>{dots}</g>;
    }

    case 'stripes': {
      const bars = [];
      for (let i = -4; i < 12; i++) bars.push(<rect key={i} x={i * 13} y={-40} width={6} height={180} />);
      return <g fill={B2} transform="rotate(24 50 50)">{bars}</g>;
    }

    case 'halo':
      return (
        <g fill="none" stroke={B1} strokeWidth={1.6}>
          <circle cx={50} cy={44} r={27} />
          <circle cx={50} cy={44} r={36} stroke={B2} />
          <circle cx={50} cy={44} r={45} stroke={B2} />
        </g>
      );

    case 'skyline':
      // 格拉斯哥的天际线意思一下：塔楼、起重机、几栋方楼。
      // 只画在头两侧（x<28 和 x>72）——中间会被脑袋挡住，
      // 底下会被肩膀挡住，画了也白画。
      return (
        <g fill={B2}>
          {/* 左侧：市政厅式的尖塔 + 方楼 */}
          <rect x={1} y={46} width={12} height={30} />
          <rect x={15} y={34} width={8} height={42} />
          <path d="M19 24 L23.5 34 H14.5 Z" />
          <rect x={24} y={52} width={5} height={24} />
          {/* 右侧：芬尼斯顿起重机的悬臂 + 方楼 */}
          <rect x={78} y={30} width={2.6} height={46} />
          <path d="M74 32 h20 v3 h-20 Z" />
          <rect x={84} y={44} width={11} height={32} />
          <rect x={72} y={56} width={5} height={20} />
          <rect x={96} y={52} width={4} height={24} />
        </g>
      );

    case 'bubbles':
      return (
        <g>
          <g fill={B2}>
            <circle cx={20} cy={26} r={14} />
            <circle cx={80} cy={40} r={15} />
            <circle cx={66} cy={13} r={8} />
          </g>
          <g fill="none" stroke={B1} strokeWidth={1.6}>
            <circle cx={22} cy={50} r={10} />
            <circle cx={82} cy={16} r={7} />
            <circle cx={14} cy={62} r={7.5} />
            <circle cx={78} cy={62} r={6} />
          </g>
        </g>
      );

    case 'grid': {
      const lines = [];
      for (let i = 1; i < 8; i++) {
        lines.push(<rect key={`h${i}`} x={0} y={i * 12.5} width={100} height={0.9} />);
        lines.push(<rect key={`v${i}`} x={i * 12.5} y={0} width={0.9} height={100} />);
      }
      return <g fill={B2}>{lines}</g>;
    }

    case 'confetti':
      return (
        <g>
          <g fill={B1}>
            <rect x={13} y={20} width={9} height={3.2} transform="rotate(-24 17.5 21.6)" />
            <rect x={76} y={24} width={9} height={3.2} transform="rotate(38 80.5 25.6)" />
            <rect x={58} y={11} width={8} height={3} transform="rotate(-12 62 12.5)" />
            <rect x={30} y={9} width={7} height={2.8} transform="rotate(28 33.5 10.4)" />
          </g>
          <g fill={B2}>
            <rect x={18} y={38} width={8} height={2.8} transform="rotate(52 22 39.4)" />
            <rect x={80} y={48} width={8} height={2.8} transform="rotate(-40 84 49.4)" />
            <rect x={8} y={48} width={7} height={2.6} transform="rotate(16 11.5 49.3)" />
            <Spark x={86} y={34} r={3.6} fill={B2} />
            <Spark x={13} y={31} r={3.2} fill={B2} />
            <Spark x={68} y={17} r={2.6} fill={B2} />
          </g>
        </g>
      );

    case 'none':
    default:
      return null;
  }
}

/* ------------------------------- 主组件 ------------------------------- */

/**
 * 只画内容、不带外层 <svg> 的版本。
 * 结业徽章需要把头像嵌进一张大 SVG 里再导出 PNG，
 * 嵌套 <svg> 在部分浏览器序列化到 canvas 时会出问题，所以那里用这个 + transform 缩放。
 * 坐标系固定为 100×100。
 */
export function AvatarContent({ config, idSuffix = '', shape = 'circle' }) {
  const a = normalizeAvatar(config);
  const skin = pick(SKINS, a.skin);
  const hairColor = pick(HAIR_COLORS, a.hairColor);
  const outfit = pick(OUTFITS, a.outfit);
  const [bg1, bg2] = pick(BACKGROUNDS, a.bg);
  const hairStyle = pick(HAIR_STYLES, a.hair);
  const hat = pick(HATS, a.hat);
  const face = pick(FACES, a.face);
  const extra = pick(EXTRAS, a.extra);
  // 围巾若和衣服同色就完全看不出来，取色板上隔开的一个颜色做对比
  const accent = pick(OUTFITS, (a.outfit ?? 0) + 3);
  // shape 也要进 id：同一份配置可能在同一页里既以圆形出现（排行榜）
  // 又以方形出现（资料页证件照），两个 clipPath 不能重名
  const gid = `av${a.bg}-${a.skin}-${a.hair}-${a.outfit}-${a.hat}-${a.bgp ?? 0}-${shape}${idSuffix}`;

  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bg1} />
          <stop offset="100%" stopColor={bg2} />
        </linearGradient>
        <clipPath id={`clip-${gid}`}>
          {shape === 'square'
            ? <rect width="100" height="100" />
            : <circle cx="50" cy="50" r="50" />}
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${gid})`}>
        <rect width="100" height="100" fill={`url(#${gid})`} />
        <BgPattern style={pick(BG_PATTERNS, a.bgp)} />

        {/* 兜帽后片要在头之前，才能把头框住 */}
        <HoodBack on={hat === 'hood'} outfit={outfit} />

        {/* 身体 */}
        <path d="M16 100 Q16 72 50 72 Q84 72 84 100 Z" fill={outfit} />
        <path d="M43 60 h14 v14 h-14 Z" fill={skin} opacity="0.85" />
        <ExtraNeck style={extra} accent={accent} />

        {/* 头 */}
        <ellipse cx="50" cy="45" rx="22" ry="24.5" fill={skin} />
        <ellipse cx="27.5" cy="49" rx="3.6" ry="4.6" fill={skin} />
        <ellipse cx="72.5" cy="49" rx="3.6" ry="4.6" fill={skin} />
        <ExtraEar style={extra} />

        <Hair style={hairStyle} color={hairColor} />
        <Eyes style={pick(EYE_STYLES, a.eyes)} />
        <Mouth style={pick(MOUTH_STYLES, a.mouth)} />
        <FaceGear style={face} />
        <Hat style={hat} outfit={outfit} />
      </g>
    </>
  );
}

/**
 * fill：撑满父容器而不是画成 size×size 的方块。
 * 头像本身是 1:1，护照资料页的证件照框是 0.78 的竖长方形，
 * 用 slice 让它按短边铺满、长边裁掉（等同 CSS 的 background-size: cover），
 * 再配 shape="square" 去掉圆形裁切，才能真的填满整个框。
 */
export default function Avatar({
  config, size = 64, ring = false, className = '', style,
  shape = 'circle', fill = false,
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio={fill ? 'xMidYMid slice' : 'xMidYMid meet'}
      width={fill ? '100%' : size}
      height={fill ? '100%' : size}
      className={className}
      style={{
        borderRadius: shape === 'square' ? 0 : '50%',
        display: 'block',
        flexShrink: 0,
        boxShadow: ring ? '0 0 0 2px var(--gold)' : undefined,
        ...style,
      }}
      role="img"
      aria-label="头像"
    >
      <AvatarContent config={config} shape={shape} />
    </svg>
  );
}

/** 供头像编辑器使用的可选项清单 */
export const AVATAR_FIELDS = [
  { key: 'skin', label: '肤色', kind: 'swatch', values: SKINS },
  { key: 'hair', label: '发型', kind: 'text', values: ['短发', '寸头', '波波', '长发', '马尾', '丸子', '卷发', '波浪', '爆炸', '光头'] },
  { key: 'hairColor', label: '发色', kind: 'swatch', values: HAIR_COLORS },
  { key: 'eyes', label: '眼睛', kind: 'text', values: ['圆点', '微笑', '大眼', '眨眼', '困倦', '闪亮'] },
  { key: 'mouth', label: '嘴巴', kind: 'text', values: ['微笑', '露齿', '平静', '惊讶', '坏笑', '大笑'] },
  { key: 'hat', label: '帽子', kind: 'text', values: ['无', '毛线帽', '棒球帽', '渔夫帽', '学士帽', '连帽衫', '发带', '花朵', '头戴耳机', '无线耳机'] },
  { key: 'face', label: '眼镜', kind: 'text', values: ['无', '方框镜', '圆框镜', '墨镜', '口罩'] },
  { key: 'extra', label: '饰品', kind: 'text', values: ['无', '耳环', '十字架', '围巾', '领结'] },
  { key: 'outfit', label: '衣服', kind: 'swatch', values: OUTFITS },
  { key: 'bg', label: '底色', kind: 'swatch', values: BACKGROUNDS.map((b) => b[0]) },
  { key: 'bgp', label: '背景', kind: 'text', values: ['无', '星星', '光芒', '圆点', '斜纹', '光环', '天际线', '气泡', '网格', '彩纸'] },
];
