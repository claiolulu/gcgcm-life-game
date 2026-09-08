import React from 'react';

/**
 * 参数化 SVG 头像。
 * 不用外部头像 API（要联网）、不用上传图片（弱网必挂），
 * 头像就是一小段 JSON，本地渲染、任意尺寸都清晰、结业徽章能直接复用同一份数据。
 */

export const SKINS = ['#f6d5bd', '#eec1a0', '#dda57e', '#c4855c', '#9c6440', '#71482c', '#ffe4d4', '#f0cbb4', '#d5ac91', '#bb8869', '#89583f', '#50372d'];

export const HAIR_COLORS = ['#1e1a17', '#3c2a1e', '#6b4423', '#a86b32', '#d9a441', '#8b8f9e', '#c94f4f', '#6c5ce7', '#101e36', '#643c35', '#b97954', '#eed4a1', '#d9dce4', '#df96b8', '#357b78', '#4464ad'];

export const OUTFITS = ['#4a9bff', '#3ec98a', '#e8c56a', '#ff6fae', '#b06cf0', '#ff8b4a', '#2bc4c4', '#8b8f9e', '#233954', '#7e344d', '#55764d', '#ede3d2', '#c27d56', '#6981ac', '#343745', '#d9adb4'];

export const BACKGROUNDS = [
  ['#1e3a5f', '#0f2038'],
  ['#3d2d5c', '#1e1533'],
  ['#1f4d3d', '#0d2a20'],
  ['#5c3a2d', '#2e1c14'],
  ['#4a3d1a', '#241d08'],
  ['#2d4a5c', '#132835'],
  ['#5c2d3d', '#33121d'],
  ['#333a4d', '#1a1e29'],
  ['#f4b8a4', '#b86573'], ['#abd8c6', '#458477'],
  ['#bed5f4', '#687cac'], ['#ead9b6', '#b79869'],
  ['#dcc5ef', '#8b70ab'], ['#f5d595', '#ce9755'],
  ['#b4dde2', '#497e99'], ['#e4c8cc', '#966d85'],
];

export const HAIR_STYLES = ['short', 'buzz', 'bob', 'long', 'ponytail', 'bun', 'curly', 'wavy', 'afro', 'bald', 'parted', 'side', 'spiky', 'pixie', 'twobuns', 'pigtails', 'braids', 'swept', 'mohawk', 'fringe'];
export const EYE_STYLES = ['dot', 'happy', 'big', 'wink', 'sleepy', 'sparkle', 'almond', 'lashes', 'curious', 'focused', 'closed', 'hearts'];
export const MOUTH_STYLES = ['smile', 'grin', 'neutral', 'oh', 'smirk', 'laugh', 'teeth', 'tongue', 'kiss', 'soft', 'frown', 'cat'];
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

export const HATS = ['none', 'beanie', 'cap', 'bucket', 'grad', 'hood', 'headband', 'flower', 'headphones', 'airpods', 'beret', 'straw', 'visor', 'ribbon', 'crown', 'party', 'sailor', 'bow', 'clips', 'leaf'];
export const FACES = ['none', 'glasses', 'round', 'sunglasses', 'mask', 'goldround', 'catglasses', 'rimless', 'sport', 'monocle'];
export const EXTRAS = ['none', 'earrings', 'cross', 'scarf', 'bowtie', 'hoops', 'pearls', 'pendant', 'tie', 'star'];

// 兼容早期只有一个 accessory 字段的头像
const LEGACY_ACCESSORY = [
  {}, { face: 1 }, { face: 3 }, { hat: 1 }, { hat: 8 }, { extra: 3 }, { extra: 1 },
];

/** 把任意版本的头像配置补全成当前的槽位结构 */
export function normalizeAvatar(config) {
  const a = { ...DEFAULT_AVATAR, ...(config || {}) };
  if (a.accessory != null && config?.hat == null && config?.face == null && config?.extra == null) {
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
    clothing: r(18), cheeks: Math.random() < 0.5 ? 0 : 1 + r(9),
    // 留两成的概率是纯底色 —— 总得有人素一点，全是风景反而没有对比
    bgp: Math.random() < 0.2 ? 0 : 1 + r(CITY_SCENES.length - 1),
  };
}

export const DEFAULT_AVATAR = {
  bg: 0, skin: 0, hair: 0, hairColor: 0, eyes: 0, mouth: 0, outfit: 0,
  hat: 0, face: 0, extra: 0, bgp: 0,
  clothing: 0, cheeks: 0,
};

/* ------------------------------- 发型 ------------------------------- */

function Hair({ style, color }) {
  switch (style) {
    case 'parted':
      return <path fill={color} d="M27 41 Q23 17 49 18 Q77 14 73 42 L65 32 Q56 31 51 23 Q44 34 34 33Z" />;
    case 'side':
      return <path fill={color} d="M27 43 Q23 14 53 17 Q77 17 73 40 L66 32 L63 25 Q49 41 29 38Z" />;
    case 'spiky':
      return <path fill={color} d="M27 39 L24 22 L34 25 L35 12 L45 22 L52 8 L57 22 L70 15 L68 28 L78 25 L73 41 L64 31 L36 32Z" />;
    case 'pixie':
      return <path fill={color} d="M28 47 Q21 20 42 19 Q60 10 71 25 L73 44 L66 32 L57 27 L51 35 L44 29 L34 35Z" />;
    case 'twobuns':
    case 'pigtails':
    case 'braids':
      return <g fill={color}><Hair style="parted" color={color} />{[23,77].map(x => style === 'braids' ? <g key={x}>{[45,53,61,69].map(y => <ellipse key={y} cx={x} cy={y} rx="5" ry="6" />)}<path d={`M${x-4} 74 h8`} stroke="#e8c56a" strokeWidth="3" /></g> : <ellipse key={x} cx={x} cy={style === 'twobuns' ? 23 : 51} rx="9" ry={style === 'twobuns' ? 9 : 16} />)}</g>;
    case 'swept':
      return <path fill={color} d="M27 41 Q20 26 30 18 Q40 6 66 15 L76 23 Q61 20 60 28 Q69 26 73 39 L66 33 Q43 39 35 31Z" />;
    case 'mohawk':
      return <path fill={color} d="M41 33 L42 16 L47 21 L51 8 L55 20 L59 15 L62 33Z" />;
    case 'fringe':
      return <g fill={color}><Hair style="bob" color={color} /><path d="M29 30 H71 V37 L62 36 L59 32 L56 37 H30Z" /></g>;
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
          <ellipse cx="50" cy="24" rx="27" ry="16" />
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
    case 'almond':
    case 'lashes':
      return <g>{[41,59].map(x => <g key={x}><path d={`M${x-6} 44 Q${x} 36 ${x+6} 44 Q${x} 50 ${x-6} 44`} fill="white" stroke={ink} strokeWidth="1.3" /><circle cx={x} cy="43.5" r="2.6" fill={ink} /><circle cx={x-0.8} cy="42.5" r="0.8" fill="white" />{style === 'lashes' && <path d={`M${x-5} 41 l-2 -3 M${x} 39 v-3 M${x+5} 41 l2 -3`} stroke={ink} strokeWidth="1.4" />}</g>)}</g>;
    case 'curious':
    case 'focused':
      return <g><Eyes style="dot" /><path d={style === 'curious' ? 'M36 35 Q41 31 46 35 M54 37 H64' : 'M35 36 L46 39 M54 39 L65 36'} fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" /></g>;
    case 'closed':
      return <g fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round"><path d="M35 42 Q41 49 47 42 M53 42 Q59 49 65 42" /></g>;
    case 'hearts':
      return <g fill="#a92e51">{[41,59].map(x => <path key={x} d={`M${x} 49 l-5 -5 C${x-10} 37 ${x-2} 36 ${x} 40 C${x+2} 36 ${x+10} 37 ${x+5} 44Z`} />)}</g>;
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
          <path d="M39 53 Q50 55 61 53 C60 66 40 66 39 53Z" fill="#fffdf5" stroke="#66363d" strokeWidth="1.6" />
          <path d="M40 58 Q50 60 60 58 M46 55 V61 M54 55 V61" stroke="#d4b9ad" strokeWidth="0.7" fill="none" />
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
          <path d="M39 52 Q50 54 61 52 C61 69 39 69 39 52Z" fill="#49232e" />
          <path d="M41 53 Q50 55 59 53 L58 57 H42Z" fill="#fffdf5" />
          <path d="M44 62 Q50 58 56 62 Q50 67 44 62Z" fill="#ed8e9d" />
        </g>
      );
    case 'teeth':
      return <g><path d="M39 54 Q50 51 61 54 Q58 65 50 65 Q42 65 39 54Z" fill="#49232e" /><path d="M41 54 Q50 53 59 54 L57 59 H43Z" fill="#fffdf5" /></g>;
    case 'tongue':
      return <g><path d="M40 54 Q50 63 60 54" stroke={ink} strokeWidth="2" fill="none" /><path d="M49 58 H57 V62 Q53 68 49 62Z" fill="#e97b90" stroke="#8f3e57" strokeWidth="1" /><path d="M53 59 V62" stroke="#8f3e57" /></g>;
    case 'kiss':
      return <path d="M46 53 L54 56 L48 58 L54 60 L46 63" fill="none" stroke="#963f56" strokeWidth="2.4" strokeLinejoin="round" />;
    case 'soft':
      return <path d="M44 57 Q50 60 56 57" fill="none" stroke="#9b4e55" strokeWidth="3" strokeLinecap="round" />;
    case 'frown':
      return <path d="M43 60 Q50 52 57 60" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />;
    case 'cat':
      return <path d="M40 56 Q45 63 50 56 Q55 63 60 56" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />;
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
    case 'beret':
      return <g fill={outfit}><ellipse cx="48" cy="24" rx="26" ry="12" transform="rotate(-12 48 24)" /><path d="M47 14 l3 -5" stroke={outfit} strokeWidth="4" /><path d="M28 33 H70" stroke={shade(outfit)} strokeWidth="4" /></g>;
    case 'straw':
      return <g fill="#e4c78c" stroke="#ad864b" strokeWidth="1"><path d="M33 29 L36 15 H64 L68 29Z" /><ellipse cx="50" cy="31" rx="34" ry="6" /><path d="M33 26 H68" stroke="#865144" strokeWidth="4" /></g>;
    case 'visor':
      return <g fill={outfit}><path d="M27 28 Q50 23 73 28 V34 H27Z" /><path d="M32 33 Q60 30 82 38 Q58 42 32 35Z" fill={shade(outfit)} /></g>;
    case 'ribbon':
    case 'bow':
      return <g fill={outfit} stroke={shade(outfit)} strokeWidth="1" transform={style === 'bow' ? 'translate(18 -3)' : ''}><path d="M50 24 L35 15 Q29 25 35 31Z M50 24 L65 15 Q71 25 65 31Z" /><circle cx="50" cy="24" r="4" /></g>;
    case 'crown':
      return <g fill="#edc458" stroke="#977036" strokeWidth="1"><path d="M30 33 L27 17 L40 25 L50 12 L60 25 L73 17 L70 33Z" /><circle cx="50" cy="27" r="3" fill="#b94661" /></g>;
    case 'party':
      return <g><path d="M36 29 L50 3 L64 29Z" fill={outfit} /><path d="M42 17 L59 22 M38 25 L54 29" stroke="#fff1bc" strokeWidth="3" /><circle cx="50" cy="5" r="3" fill="#edc458" /></g>;
    case 'sailor':
      return <g><path d="M27 25 Q50 5 73 25 L69 33 H31Z" fill="#fcf7e9" /><path d="M30 30 H70" stroke="#29466b" strokeWidth="5" /></g>;
    case 'clips':
      return <g stroke="#f2cc6d" strokeWidth="3" strokeLinecap="round"><path d="M28 31 L39 26 M30 36 L41 31" /></g>;
    case 'leaf':
      return <g fill="#6da77c"><path d="M27 31 Q20 13 35 23 Q35 10 43 18 Q34 31 27 31 M73 31 Q80 13 65 23 Q65 10 57 18 Q66 31 73 31" /></g>;
    case 'beanie':
      return (
        <g>
          <path d="M27 38 Q27 15 50 15 Q73 15 73 38 Z" fill={outfit} />
          <rect x="25" y="32" width="50" height="6" rx="3" fill="#fff" opacity="0.9" />
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
        <g>
          {/* 单体轮廓：耳塞嵌在耳窝，短柄轻微向外倾，不覆盖整只耳朵。 */}
          {[false, true].map((right) => (
            <g key={String(right)} transform={right ? 'translate(100 0) scale(-1 1)' : undefined}>
              <path d="M28.8 46.4 C28 45.4 25.5 45.8 25.2 47.5 C25 48.6 25.8 49.2 26.1 49.7 L25.4 54.4 Q25.2 55.8 26.5 56 Q27.7 56.2 27.9 54.8 L28.5 49.5 C30 48.8 30 47.5 28.8 46.4Z"
                fill="#f8fafc" stroke="#9aa7b5" strokeWidth="0.55" />
              <ellipse cx="27.1" cy="47.7" rx="0.65" ry="1" fill="#43505e" transform="rotate(18 27.1 47.7)" />
              <path d="M26.2 54.7 l0.8 0.1" stroke="#a8b2be" strokeWidth="0.6" strokeLinecap="round" />
            </g>
          ))}
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
    case 'goldround':
    case 'rimless':
    case 'catglasses':
    case 'sport':
    case 'monocle':
      return <g stroke={style === 'goldround' || style === 'monocle' ? '#b18836' : '#34465b'} strokeWidth={style === 'rimless' ? 0.8 : 1.8} fill={style === 'sport' ? '#304964' : 'none'}>
        {style === 'monocle' ? <><circle cx="59" cy="44" r="8" /><path d="M66 48 Q78 66 69 75" fill="none" /></> : <>{[41,59].map(x => style === 'catglasses' ? <path key={x} d={`M${x-9} 37 L${x+8} 40 Q${x+8} 53 ${x-5} 49Z`} /> : style === 'goldround' ? <circle key={x} cx={x} cy="44" r="7.5" /> : <rect key={x} x={x-7} y="39" width="14" height="10" rx="2" />)}<path d="M48 43 H52 M27 42 L33 43 M67 43 L73 42" /></>}
      </g>;
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
  if (style === 'hoops') return <g fill="none" stroke="#e7c567" strokeWidth="1.8"><ellipse cx="26" cy="56" rx="3.5" ry="5" /><ellipse cx="74" cy="56" rx="3.5" ry="5" /></g>;
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
    case 'pearls':
      return <g fill="#fff8e7" stroke="#bba888" strokeWidth="0.5">{[0,1,2,3,4,5,6].map(i => <circle key={i} cx={36+i*4.6} cy={76+Math.sin(i/6*Math.PI)*7} r="2.3" />)}</g>;
    case 'pendant':
    case 'star':
      return <g stroke="#f2cf73" fill={accent}><path d="M37 72 L50 87 L63 72" fill="none" strokeWidth="1.5" />{style === 'star' ? <path d="M50 80 L52 85 L58 85 L54 89 L55 95 L50 92 L45 95 L46 89 L42 85 L48 85Z" fill="#f2cf73" /> : <circle cx="50" cy="87" r="4" strokeWidth="2" />}</g>;
    case 'tie':
      return <g fill={accent} stroke={shade(accent)} strokeWidth="1"><path d="M46 73 H54 L53 78 H47Z M47 79 H53 L56 94 L50 99 L44 94Z" /></g>;
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
function Windows({ x, y, width: w, height: h, cols, rows, fill, op = 0.5 }) {
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

function Clothing({ value, color }) {
  const k = value % 18;
  // 经典角色服饰用固定配色，保留头像自己的脸、发型与配饰。
  const body = 'M16 100 Q16 72 50 72 Q84 72 84 100Z';
  if (k === 10) return <g><path d={body} fill="#ed782d" /><path d="M35 75 L50 87 L65 75 L59 73 L50 80 L41 73Z" fill="#233e86" /><path d="M31 96 H69 V100 H31Z" fill="#233e86" /><circle cx="65" cy="88" r="5.5" fill="#fff3d7" stroke="#293349" strokeWidth="1" /><path d="M63 85 h4 M65 84 v7 M62 88 h6" stroke="#293349" strokeWidth="1.2" /></g>;
  if (k === 11) return <g><path d={body} fill="#ee842e" /><path d="M25 79 Q50 66 75 79 L73 86 H27Z" fill="#283546" /><path d="M50 75 V100" stroke="#d9dce2" strokeWidth="2" /><path d="M43 74 H57 V80 H43Z" fill="#283546" /><circle cx="64" cy="88" r="4" fill="none" stroke="#b63736" strokeWidth="1.5" /></g>;
  if (k === 12) return <g><path d={body} fill="#ca4141" /><path d="M42 73 L50 78 L58 73 L55 100 H45Z" fill="#f4c2a0" /><path d="M42 74 L44 100 M58 74 L56 100" stroke="#f5d081" strokeWidth="1.5" />{[83,91].map(y=><circle key={y} cx="40" cy={y} r="1.5" fill="#f6d775" />)}</g>;
  if (k === 13) return <g><path d={body} fill="#223c37" />{[0,1,2,3,4,5].map(i=>[0,1,2].map(j=>(i+j)%2===0?<rect key={`${i}-${j}`} x={26+i*8} y={79+j*8} width="8" height="8" fill="#55a378" />:null))}<path d="M43 73 H57 L55 100 H45Z" fill="#263035" /><path d="M45 75 L50 80 L55 75" fill="none" stroke="#eee8d8" strokeWidth="2" /></g>;
  if (k === 14) return <g><path d={body} fill="#faf5e8" /><path d="M32 76 L50 91 L68 76 L60 73 L50 82 L40 73Z" fill="#294b89" /><path d="M35 77 L50 88 L65 77" fill="none" stroke="#fff" strokeWidth="1" /><path d="M50 89 L39 83 V95Z M50 89 L61 83 V95Z" fill="#d8435c" /><circle cx="50" cy="89" r="2.5" fill="#eac86b" /></g>;
  if (k === 15) return <g><path d={body} fill="#ce3c3e" /><path d="M31 77 H38 V88 H62 V77 H69 V100 H31Z" fill="#326fc1" /><path d="M37 87 H63 V100 H37Z" fill="#326fc1" /><circle cx="35" cy="87" r="2.4" fill="#ffda68" /><circle cx="65" cy="87" r="2.4" fill="#ffda68" /><path d="M44 94 H56 V100 H44Z" fill="none" stroke="#214f93" /></g>;
  if (k === 16) return <g><path d={body} fill="#3aa0c3" /><path d="M38 74 L50 84 L62 74" fill="none" stroke="#f9eed0" strokeWidth="3" /><path d="M64 75 L36 100" stroke="#795640" strokeWidth="5" /><path d="M58 80 L42 95" stroke="#c7a47a" strokeWidth="1" /><path d="M48 87 L52 92 H44Z M44 93 L48 98 H40Z M52 93 L56 98 H48Z" fill="#e5e7d6" /></g>;
  if (k === 17) return <g><path d={body} fill="#ffd458" /><path d="M34 78 L43 86 H57 L66 78" fill="none" stroke="#815035" strokeWidth="3" /><path d="M50 78 V100" stroke="#c39732" strokeWidth="1.5" /><path d="M26 91 L37 96 M74 91 L63 96" stroke="#815035" strokeWidth="4" /><path d="M43 84 L45 76 M57 84 L55 76" stroke="#fff4be" strokeWidth="1.5" /></g>;
  if (!k) return null;
  if (k === 1 || k === 2) return <g fill="none" stroke={k === 1 ? '#fff7e5' : shade(color)} strokeWidth={k === 1 ? 2 : 4}>{[83,91,99].map(y => <path key={y} d={`M25 ${y} H75`} />)}</g>;
  if (k === 3) return <g fill="#fff7e5">{[32,44,56,68].map(x => [85,95].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />))}</g>;
  if (k === 4 || k === 5) return <g><path d="M37 74 L50 84 L63 74 L57 72 L50 77 L43 72Z" fill={k === 4 ? '#fff7e5' : shade(color)} /><path d="M50 84 V100" stroke={shade(color)} strokeWidth="1.4" />{[88,94].map(y => <circle key={y} cx="50" cy={y} r="1" fill="#fff7e5" />)}</g>;
  if (k === 6) return <g fill="none" stroke="#fdf3dd" strokeWidth="2.5"><path d="M40 75 L50 84 L60 75 M40 77 V89 M60 77 V89" /></g>;
  if (k === 7) return <g fill={shade(color)}><path d="M34 76 L44 100 H23Z M66 76 L56 100 H77Z" /><path d="M42 74 L50 84 L58 74 L55 100 H45Z" fill="#fff7e5" /></g>;
  if (k === 8) return <g fill="#d4e3ef"><path d="M31 77 H38 V100 H31Z M62 77 H69 V100 H62Z M36 86 H64 V100 H36Z" /><circle cx="35" cy="89" r="2" fill="#d3aa59" /><circle cx="65" cy="89" r="2" fill="#d3aa59" /></g>;
  return <path d="M50 83 L53 88 L59 89 L55 93 L56 99 L50 96 L44 99 L45 93 L41 89 L47 88Z" fill="#ffe0a0" />;
}

function Cheeks({ value }) {
  const k = value % 10;
  if (!k) return null;
  if (k <= 3) return <g fill={['', '#e87985', '#c96a63', '#c85c7e'][k]} opacity="0.48"><ellipse cx="34" cy="53" rx={k === 3 ? 5 : 4} ry="2.7" /><ellipse cx="66" cy="53" rx={k === 3 ? 5 : 4} ry="2.7" /></g>;
  if (k === 4 || k === 5) return <g fill={k === 4 ? '#935e43' : '#e4ba75'}>{[33,38,62,67].map((x,i) => <circle key={x} cx={x} cy={52+i%2*2} r="0.9" />)}</g>;
  if (k === 6) return <circle cx="62" cy="56" r="1" fill="#654437" />;
  if (k === 7) return <g fill="none" stroke="#b76f6d" strokeWidth="1.2"><path d="M34 54 l2 2 M66 54 l-2 2" /></g>;
  if (k === 8) return <path d="M65 50 L66 53 L69 54 L66 55 L65 58 L64 55 L61 54 L64 53Z" fill="#fff1bc" />;
  return <path d="M65 57 C55 50 62 48 65 52 C68 48 75 50 65 57Z" fill="#be526e" />;
}

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
        <Clothing value={a.clothing} color={outfit} />
        <path d="M43 60 h14 v14 h-14 Z" fill={skin} opacity="0.85" />
        <ExtraNeck style={extra} accent={accent} />

        {/* 头 */}
        <ellipse cx="50" cy="45" rx="22" ry="24.5" fill={skin} />
        <ellipse cx="27.5" cy="49" rx="3.6" ry="4.6" fill={skin} />
        <ellipse cx="72.5" cy="49" rx="3.6" ry="4.6" fill={skin} />
        <ExtraEar style={extra} />

        <Hair style={hairStyle} color={hairColor} />
        <Eyes style={pick(EYE_STYLES, a.eyes)} />
        <Cheeks value={a.cheeks} />
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
  { key: 'hair', label: '发型', kind: 'text', values: ['短发', '寸头', '波波', '长发', '马尾', '丸子', '卷发', '波浪', '爆炸', '光头', '中分', '侧分', '刺猬头', '精灵短发', '双丸子', '双马尾', '双辫子', '蓬松背头', '莫霍克', '齐刘海'] },
  { key: 'hairColor', label: '发色', kind: 'swatch', values: HAIR_COLORS },
  { key: 'eyes', label: '眼睛', kind: 'text', values: ['圆点', '微笑', '大眼', '眨眼', '困倦', '闪亮', '杏眼', '睫毛', '好奇', '专注', '闭眼', '爱心眼'] },
  { key: 'mouth', label: '嘴巴', kind: 'text', values: ['微笑', '露齿笑', '平静', '惊讶', '坏笑', '开怀大笑', '咧嘴笑', '吐舌', '飞吻', '浅笑', '委屈', '猫咪嘴'] },
  { key: 'hat', label: '头饰', kind: 'text', values: ['无', '毛线帽', '棒球帽', '渔夫帽', '学士帽', '连帽衫', '发带', '花朵', '头戴耳机', '无线耳机', '贝雷帽', '草帽', '空顶帽', '蝴蝶发带', '小皇冠', '派对帽', '水手帽', '侧边蝴蝶结', '发夹', '叶冠'] },
  { key: 'face', label: '面饰', kind: 'text', values: ['无', '方框镜', '圆框镜', '墨镜', '口罩', '金丝圆框', '猫眼镜', '无框镜', '运动墨镜', '单片眼镜'] },
  { key: 'extra', label: '饰品', kind: 'text', values: ['无', '耳环', '十字架', '围巾', '领结', '圆环耳饰', '珍珠项链', '圆吊坠', '领带', '星星项链'] },
  { key: 'outfit', label: '衣服颜色', kind: 'swatch', values: OUTFITS },
  { key: 'clothing', label: '衣服款式', kind: 'text', values: ['纯色', '细条纹', '宽条纹', '波点', '衬衫', 'Polo 衫', '抽绳卫衣', '西装', '背带装', '星星上衣', '悟空风道服', '鸣人风外套', '路飞风背心', '炭治郎风羽织', '水手月亮风制服', '马里奥风背带裤', '林克风英杰服', '皮卡丘风卫衣'] },
  { key: 'cheeks', label: '脸颊', kind: 'text', values: ['无', '粉色腮红', '暖色腮红', '浓腮红', '雀斑', '金色雀斑', '美人痣', '酒窝', '星光贴纸', '爱心贴纸'] },
  { key: 'bg', label: '底色', kind: 'swatch', values: BACKGROUNDS.map((b) => b[0]) },
  { key: 'bgp', label: '背景', kind: 'text', values: ['无', '格拉斯哥', '爱丁堡', '伦敦', '巴黎', '纽约', '东京', '悉尼', '上海', '罗马', '旧金山'] },
];
