import React from 'react';

/**
 * 人生盲盒卡片的小插画。
 *
 * 一张卡一幅，64×64 的坐标系，扁平几何图形，不依赖任何外部资源 ——
 * 和头像一样，现场弱网下不能有任何需要下载的东西。
 *
 * 配色跟着卡片类别走（好运绿 / 厄运红 / 意外黄 / 极端灰），
 * 传进来的 hex 是主色，画面里再配一到两个中性色。
 */

const INK = '#2a2320';
const PAPER = '#f3ede0';

/** 折线图，涨跌共用 —— 投资暴雷和汇率暴跌都是它，方向相反 */
function Chart({ c, down = true, label }) {
  const pts = down ? '8,18 20,26 30,22 42,40 56,50' : '8,50 20,42 30,46 42,26 56,14';
  const tip = down ? [56, 50] : [56, 14];
  return (
    <g>
      <rect x="4" y="8" width="56" height="48" rx="4" fill={PAPER} stroke={INK} strokeWidth="2" />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={tip[0]} cy={tip[1]} r="4" fill={c} />
      {/* 箭头：往下是暴跌，往上是暴涨 */}
      <path
        d={down ? 'M50 44 L56 52 L62 44' : 'M50 20 L56 12 L62 20'}
        fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      />
      {label && <text x="12" y="52" fontSize="11" fill={INK} opacity=".55" fontFamily="serif">{label}</text>}
    </g>
  );
}

function Art({ id, c }) {
  switch (id) {
    /* ---------------- 好运 ---------------- */
    case 'first_class':   // Essay 拿了 First Class
      return (
        <g>
          <rect x="14" y="6" width="34" height="46" rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M20 18h16M20 25h22M20 32h14" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity=".45" />
          <circle cx="42" cy="42" r="13" fill={c} />
          <path d="M36 42l4 4 8-9" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'found_tenner':  // 路上捡到 £10
      return (
        <g>
          <rect x="6" y="18" width="52" height="28" rx="4" fill={c} />
          <rect x="11" y="23" width="42" height="18" rx="2" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".7" />
          <text x="32" y="38" fontSize="17" fill="#fff" textAnchor="middle" fontFamily="serif" fontWeight="bold">£10</text>
        </g>
      );
    case 'flatmate_meal': // 室友帮你带了饭
      return (
        <g>
          <path d="M12 30h40l-4 22H16z" fill={c} />
          <rect x="10" y="25" width="44" height="7" rx="2.5" fill={INK} opacity=".8" />
          <path d="M24 18c0-4 4-4 4-8M34 18c0-4 4-4 4-8" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".45" />
        </g>
      );
    case 'cheap_flight':  // 抢到 £9 机票
      return (
        <g>
          <path d="M6 36l50-18-8 18 8 18z" fill={c} />
          <path d="M28 30l10-14M28 42l10 14" stroke={PAPER} strokeWidth="2" opacity=".55" />
          <circle cx="50" cy="14" r="3" fill={INK} opacity=".3" />
        </g>
      );
    case 'yellow_sticker': // Tesco 黄标之神
      return (
        <g>
          <path d="M34 6l24 24-28 28L6 34z" fill={PAPER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="24" cy="24" r="4.5" fill={INK} opacity=".6" />
          <circle cx="40" cy="40" r="13" fill={c} />
          <text x="40" y="45" fontSize="13" fill={INK} textAnchor="middle" fontFamily="serif" fontWeight="bold">½</text>
        </g>
      );

    /* ---------------- 厄运 ---------------- */
    case 'locked_out':    // 被锁在 Flat 门外
      return (
        <g>
          <rect x="14" y="8" width="36" height="48" rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
          <circle cx="42" cy="34" r="2.6" fill={INK} opacity=".6" />
          <rect x="24" y="28" width="17" height="14" rx="2.5" fill={c} />
          <path d="M27 28v-4a5.5 5.5 0 0111 0v4" fill="none" stroke={c} strokeWidth="3" />
          <path d="M8 12l-2 8M58 14l2 8M6 34l-2 8" stroke={c} strokeWidth="2.4" strokeLinecap="round" opacity=".5" />
        </g>
      );
    case 'flu':           // 重感冒卧床
      return (
        <g>
          <rect x="27" y="6" width="10" height="36" rx="5" fill={PAPER} stroke={INK} strokeWidth="2" />
          <rect x="29.5" y="16" width="5" height="24" fill={c} />
          <circle cx="32" cy="48" r="9" fill={c} />
          <path d="M14 16c-3 3-3 7 0 10M50 16c3 3 3 7 0 10" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".35" />
        </g>
      );
    case 'deadline_clash': // Deadline 撞车
      return (
        <g>
          <rect x="8" y="12" width="48" height="44" rx="4" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M8 24h48" stroke={INK} strokeWidth="2" />
          <path d="M20 6v10M44 6v10" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <circle cx="22" cy="36" r="5" fill={c} />
          <circle cx="34" cy="36" r="5" fill={c} />
          <circle cx="46" cy="36" r="5" fill={c} />
          <path d="M18 47h28" stroke={c} strokeWidth="2.6" strokeLinecap="round" opacity=".5" />
        </g>
      );
    case 'phone_rain':    // 手机掉进苏格兰的雨里
      return (
        <g>
          <rect x="20" y="8" width="24" height="42" rx="4" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M24 18l8 8-6 6 10 8" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 14l-3 9M54 12l3 9M8 34l-3 9M56 32l3 9" stroke={c} strokeWidth="2.6" strokeLinecap="round" opacity=".6" />
        </g>
      );

    /* ---------------- 意外 ---------------- */
    case 'got_married':   // Got Married!
      return (
        <g fill="none" strokeWidth="3.5">
          <circle cx="25" cy="36" r="14" stroke={c} />
          <circle cx="41" cy="36" r="14" stroke={INK} opacity=".55" />
          <path d="M33 12l3 6 3-6" stroke={c} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'fire_alarm':    // 凌晨三点 Fire Alarm
      return (
        <g>
          <path d="M32 10a14 14 0 0114 14v12l4 7H14l4-7V24a14 14 0 0114-14z" fill={c} />
          <path d="M27 50a5 5 0 0010 0" fill={INK} opacity=".65" />
          <path d="M8 20c2-4 5-6 8-7M56 20c-2-4-5-6-8-7" stroke={c} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".55" />
        </g>
      );
    case 'tutor_meeting': // 被 Tutor 紧急约谈
      return (
        <g>
          <rect x="6" y="16" width="52" height="34" rx="3" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M6 18l26 18 26-18" fill="none" stroke={INK} strokeWidth="2" opacity=".5" />
          <circle cx="50" cy="16" r="11" fill={c} />
          <path d="M50 10v7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="21.5" r="1.8" fill="#fff" />
        </g>
      );

    /* ---------------- 极端 ---------------- */
    case 'crypto_crash':  return <Chart c={c} down label="₿" />;
    case 'fx_crash':      return <Chart c={c} down label="£" />;
    case 'scholarship':   // 突然拿到全额奖学金
      return (
        <g>
          <path d="M32 10L58 22 32 34 6 22z" fill={c} />
          <path d="M16 27v12c0 5 7 9 16 9s16-4 16-9V27" fill="none" stroke={INK} strokeWidth="2.6" opacity=".7" />
          <path d="M54 24v12" stroke={INK} strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
          <circle cx="54" cy="39" r="3" fill={INK} opacity=".7" />
        </g>
      );

    default:
      return <circle cx="32" cy="32" r="20" fill={c} opacity=".5" />;
  }
}

/** 卡片插画。id 是卡片 id，color 是这一类的主色。 */
export default function CardArt({ id, color = '#8b8f9e', size = 84 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-hidden="true"
         style={{ display: 'block', flexShrink: 0 }}>
      <Art id={id} c={color} />
    </svg>
  );
}
