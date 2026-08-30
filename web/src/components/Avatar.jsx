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
 * 头像背景：十座城市的彩色风景。
 *
 * 每一景自带天空渐变和配色，选了城市就由它整个接管背景，`bg`（底色）
 * 只在选「无」时生效。
 *
 * 构图上有个硬约束：脑袋占住 x28-72 / y20-70，肩膀占住 y72 以下，
 * 所以地标一律画在左右两侧，中间只留天空。头像最小只有 30px，
 * 细节给不到，靠轮廓和配色认城市。
 *
 * 用插画而不是照片：头像必须是纯函数，一段 JSON 本地渲染、不联网、
 * 任意尺寸都清晰；结业徽章走 SVG→canvas 导出，外链位图会污染画布。
 */
export const CITY_SCENES = [
  'none', 'glasgow', 'edinburgh', 'london', 'paris',
  'newyork', 'tokyo', 'sydney', 'shanghai', 'rome', 'sanfrancisco',
];

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
    // 留两成的概率是纯底色 —— 总得有人素一点，全是风景反而没有对比
    bgp: Math.random() < 0.2 ? 0 : 1 + r(CITY_SCENES.length - 1),
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

/* ------------------------------ 城市风景 ------------------------------ */

/** 排窗户：给摩天楼铺一层小方格灯光 */
function Windows({ x, y, w, h, cols, rows, fill, op = 0.5 }) {
  const cells = [];
  const cw = w / (cols * 2 - 1);
  const ch = h / (rows * 2 - 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 隔一个亮一个，看起来像有人在家
      if ((r + c) % 3 === 2) continue;
      cells.push(<rect key={`${r}-${c}`} x={x + c * cw * 2} y={y + r * ch * 2} width={cw} height={ch} />);
    }
  }
  return <g fill={fill} opacity={op}>{cells}</g>;
}

/**
 * 一座城市。gid 用来隔离天空渐变的 id —— 同一页可能同时出现很多头像。
 * 每个 case 里的顺序都是：天空 → 远景 → 地标 → 地面。
 */
function CityScene({ scene, gid }) {
  const sky = `sky-${gid}`;
  const Sky = ({ from, to }) => (
    <>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${sky})`} />
    </>
  );

  switch (scene) {
    /* 格拉斯哥：市政厅钟塔 + 芬尼斯顿起重机，阴天 */
    case 'glasgow': {
      const st = '#5d6b7a';
      return (
        <g>
          <Sky from="#8fa6bd" to="#dfe6ec" />
          <g fill={st}>
            <rect x={2} y={50} width={9} height={26} />
            <rect x={12} y={36} width={9} height={40} />
            <path d="M16.5 22 L21.5 36 H11.5 Z" />
            <rect x={22} y={54} width={6} height={22} />
            <rect x={72} y={58} width={7} height={18} />
            <rect x={88} y={48} width={10} height={28} />
            {/* 起重机：立柱 + 悬臂 + 斜撑 */}
            <rect x={81} y={30} width={3} height={46} />
            <path d="M70 31 L96 28 L96 32 L70 34 Z" />
            <path d="M82 40 L92 31 L93 33 L83 42 Z" />
          </g>
          <Windows x={13} y={40} width={7} height={30} cols={2} rows={5} fill="#f2e6c8" />
          <rect y={74} width="100" height="26" fill="#46525e" />
        </g>
      );
    }

    /* 爱丁堡：岩山上的城堡，暮色 */
    case 'edinburgh':
      return (
        <g>
          <Sky from="#4a3f6b" to="#f0a06a" />
          <circle cx={20} cy={26} r={7} fill="#ffd9a0" opacity={0.85} />
          <g fill="#3a3348">
            {/* 城堡岩 */}
            <path d="M62 76 L68 58 L74 50 L86 46 L96 52 L100 62 L100 76 Z" />
            <rect x={76} y={34} width={8} height={14} />
            <rect x={86} y={38} width={6} height={10} />
            <rect x={70} y={40} width={5} height={9} />
            <path d="M76 34 h2 v-3 h2 v3 h2 v-3 h2 v3" fill="none" stroke="#3a3348" strokeWidth={1.6} />
            {/* 前景老城屋顶 */}
            <path d="M0 76 V62 L8 54 L16 62 V76 Z" />
            <rect x={18} y={60} width={8} height={16} />
          </g>
          <Windows x={77} y={37} width={6} height={9} cols={2} rows={2} fill="#ffcf8a" op={0.9} />
          <rect y={74} width="100" height="26" fill="#2b2638" />
        </g>
      );

    /* 伦敦：大本钟 + 伦敦眼，黄昏 */
    case 'london':
      return (
        <g>
          <Sky from="#f6c987" to="#7d8fc0" />
          <g fill="#4a4560">
            <rect x={9} y={30} width={11} height={46} />
            <path d="M14.5 18 L21 30 H8 Z" />
            <rect x={7} y={27} width={15} height={4} />
            <rect x={0} y={58} width={7} height={18} />
            <rect x={22} y={60} width={7} height={16} />
          </g>
          <circle cx={14.5} cy={36} r={4.2} fill="#ffe9b8" />
          {/* 伦敦眼 */}
          <g stroke="#4a4560" fill="none" strokeWidth={1.5}>
            <circle cx={84} cy={44} r={14} />
            <circle cx={84} cy={44} r={9} strokeWidth={1} opacity={0.7} />
            <path d="M70 44 H98 M84 30 V58 M74 34 L94 54 M94 34 L74 54" strokeWidth={0.9} opacity={0.75} />
          </g>
          <rect x={83} y={58} width={2.5} height={18} fill="#4a4560" />
          <rect y={74} width="100" height="26" fill="#3b3a52" />
        </g>
      );

    /* 巴黎：埃菲尔铁塔，粉紫日落 */
    case 'paris':
      return (
        <g>
          <Sky from="#f7b9cd" to="#9a86c4" />
          <circle cx={22} cy={24} r={8} fill="#fff0c4" opacity={0.9} />
          <g fill="#5b4a6e">
            {/* 铁塔 */}
            <path d="M74 76 L82 30 L84 30 L92 76 L87 76 L83 44 L79 76 Z" />
            <rect x={78} y={52} width={10} height={2.4} />
            <rect x={80.4} y={40} width={5.2} height={2} />
            <path d="M83 30 v-6 h1 v6 Z" />
            {/* 奥斯曼式屋顶 */}
            <path d="M0 76 V60 L7 53 L14 60 V76 Z" />
            <path d="M16 76 V63 L23 57 L30 63 V76 Z" />
          </g>
          <Windows x={2} y={62} width={10} height={12} cols={3} rows={2} fill="#ffe3b0" op={0.75} />
          <rect y={74} width="100" height="26" fill="#493a5c" />
        </g>
      );

    /* 纽约：摩天楼群 + 自由女神，蓝调时刻 */
    case 'newyork':
      return (
        <g>
          <Sky from="#16234a" to="#4f74ab" />
          <circle cx={78} cy={20} r={5} fill="#ffeec2" opacity={0.9} />
          <g fill="#151d38">
            <rect x={0} y={46} width={9} height={30} />
            <rect x={10} y={34} width={8} height={42} />
            <path d="M14 34 v-8 h0.8 v8 Z" />
            <rect x={19} y={52} width={7} height={24} />
            <rect x={72} y={40} width={9} height={36} />
            <rect x={82} y={30} width={9} height={46} />
            <path d="M86.5 30 L91 22 L82 22 Z" />
            <rect x={92} y={50} width={8} height={26} />
          </g>
          <Windows x={11} y={38} width={6} height={34} cols={2} rows={7} fill="#ffe9a8" op={0.75} />
          <Windows x={83} y={34} width={7} height={38} cols={2} rows={8} fill="#ffe9a8" op={0.75} />
          <Windows x={73} y={44} width={7} height={28} cols={2} rows={6} fill="#ffe9a8" op={0.6} />
          <rect y={74} width="100" height="26" fill="#0e1428" />
        </g>
      );

    /* 东京：富士山 + 东京塔，樱粉天 */
    case 'tokyo':
      return (
        <g>
          <Sky from="#ffd3de" to="#a9d4ef" />
          <g>
            {/* 富士山 */}
            <path d="M0 72 L16 40 L32 72 Z" fill="#7d8fb5" />
            <path d="M11 50 L16 40 L21 50 L18 48 L16 51 L14 48 Z" fill="#f4f7fb" />
          </g>
          {/* 东京塔 */}
          <g fill="#e2572f">
            <path d="M74 76 L82 32 L84 32 L92 76 L87.5 76 L83 46 L78.5 76 Z" />
            <rect x={78} y={54} width={10} height={2.6} />
            <rect x={80.2} y={42} width={5.6} height={2.2} />
            <path d="M83 32 v-7 h1 v7 Z" />
          </g>
          <g fill="#8b95ad">
            <rect x={62} y={58} width={7} height={18} />
            <rect x={94} y={54} width={6} height={22} />
          </g>
          <rect y={74} width="100" height="26" fill="#6a7793" />
        </g>
      );

    /* 悉尼：歌剧院 + 海港大桥，晴天 */
    case 'sydney':
      return (
        <g>
          <Sky from="#5cb8ea" to="#d6efff" />
          <circle cx={50} cy={12} r={6} fill="#fff6cf" opacity={0.85} />
          {/* 歌剧院：三片壳 */}
          <g fill="#f6f4ee" stroke="#c3cdd6" strokeWidth={0.7}>
            <path d="M2 70 Q4 48 20 70 Z" />
            <path d="M10 70 Q13 42 28 70 Z" />
            <path d="M19 70 Q23 50 33 70 Z" />
          </g>
          {/* 海港大桥 */}
          <g fill="#7d8b98">
            <path d="M64 70 Q82 40 100 70 L100 74 Q82 46 64 74 Z" />
            <rect x={64} y={62} width={36} height={3} />
            <rect x={67} y={48} width={4} height={22} />
            <rect x={93} y={48} width={4} height={22} />
          </g>
          <rect y={70} width="100" height="30" fill="#3f93c6" />
        </g>
      );

    /* 上海：东方明珠 + 陆家嘴，霓虹夜 */
    case 'shanghai':
      return (
        <g>
          <Sky from="#1b1f42" to="#7a4585" />
          <g fill="#151735">
            {/* 东方明珠 */}
            <rect x={14} y={34} width={3} height={42} />
            <circle cx={15.5} cy={40} r={6.5} />
            <circle cx={15.5} cy={57} r={4.4} />
            <path d="M12 76 L15.5 62 L19 76 Z" />
            <path d="M15.5 34 v-8 h0.8 v8 Z" />
            {/* 上海中心 + 金茂 */}
            <path d="M78 76 L79.5 34 Q84 30 88.5 34 L90 76 Z" />
            <rect x={92} y={46} width={7} height={30} />
            <path d="M95.5 46 v-6 h0.8 v6 Z" />
            <rect x={68} y={56} width={7} height={20} />
          </g>
          <g fill="#57e0ff" opacity={0.85}>
            <circle cx={15.5} cy={40} r={4.4} opacity={0.35} />
            <circle cx={15.5} cy={57} r={2.8} opacity={0.35} />
          </g>
          <Windows x={80} y={40} width={8} height={32} cols={2} rows={7} fill="#ffd98a" op={0.8} />
          <Windows x={93} y={49} width={5} height={24} cols={2} rows={5} fill="#ffd98a" op={0.7} />
          <rect y={74} width="100" height="26" fill="#0d0f24" />
        </g>
      );

    /* 罗马：斗兽场 + 圣彼得大教堂圆顶，暖金 */
    case 'rome':
      return (
        <g>
          <Sky from="#ffd79a" to="#d98f5c" />
          <circle cx={50} cy={14} r={7} fill="#fff3d0" opacity={0.8} />
          {/* 斗兽场 */}
          <g fill="#8a6242">
            <path d="M0 76 V52 Q14 46 28 52 V76 Z" />
          </g>
          <g fill="#ffd79a" opacity={0.55}>
            <rect x={3} y={56} width={3.4} height={7} rx={1.7} />
            <rect x={9} y={54} width={3.4} height={7} rx={1.7} />
            <rect x={15} y={53} width={3.4} height={7} rx={1.7} />
            <rect x={21} y={55} width={3.4} height={7} rx={1.7} />
            <rect x={3} y={66} width={3.4} height={6} rx={1.7} />
            <rect x={9} y={65} width={3.4} height={6} rx={1.7} />
            <rect x={15} y={64} width={3.4} height={6} rx={1.7} />
            <rect x={21} y={66} width={3.4} height={6} rx={1.7} />
          </g>
          {/* 圆顶 */}
          <g fill="#8a6242">
            <rect x={72} y={58} width={26} height={18} />
            <path d="M78 58 Q85 38 92 58 Z" />
            <rect x={84} y={32} width={2} height={6} />
            <circle cx={85} cy={31} r={2} />
            <rect x={70} y={64} width={4} height={12} />
            <rect x={96} y={62} width={4} height={14} />
          </g>
          <rect y={74} width="100" height="26" fill="#6f4c33" />
        </g>
      );

    /* 旧金山：金门大桥，晨雾橙 */
    case 'sanfrancisco':
      return (
        <g>
          <Sky from="#ffcfa8" to="#ff9b73" />
          <circle cx={50} cy={18} r={8} fill="#fff2d6" opacity={0.7} />
          <g fill="#c8452f">
            {/* 双塔 */}
            <rect x={11} y={26} width={4} height={50} />
            <rect x={20} y={26} width={4} height={50} />
            <rect x={9} y={34} width={17} height={3} />
            <rect x={9} y={46} width={17} height={3} />
            <rect x={78} y={26} width={4} height={50} />
            <rect x={87} y={26} width={4} height={50} />
            <rect x={76} y={34} width={17} height={3} />
            <rect x={76} y={46} width={17} height={3} />
            {/* 主缆与桥面 */}
            <path d="M0 40 Q13 30 26 42 L26 45 Q13 34 0 44 Z" />
            <path d="M74 42 Q87 30 100 40 L100 44 Q87 34 74 45 Z" />
            <rect y={60} width="100" height="3.4" />
          </g>
          <rect y={72} width="100" height="28" fill="#8f6a86" opacity={0.9} />
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
  const scene = pick(CITY_SCENES, a.bgp);
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
        {scene === 'none'
          ? <rect width="100" height="100" fill={`url(#${gid})`} />
          : <CityScene scene={scene} gid={gid} />}

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
  { key: 'bgp', label: '背景', kind: 'text', values: ['无', '格拉斯哥', '爱丁堡', '伦敦', '巴黎', '纽约', '东京', '悉尼', '上海', '罗马', '旧金山'] },
];
