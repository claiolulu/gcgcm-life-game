import React from 'react';

/**
 * 排行榜前三名的奖杯。
 *
 * 表情符号里只有一个 🏆，三个名次会长得一模一样；🥇🥈🥉 又是奖牌不是奖杯 ——
 * 所以自己画，金 / 银 / 铜三种金属色。按名次值给，不按列表位置给：并列第一的
 * 两个人拿的都是金杯。
 *
 * tone：'dark' 用在深色底（排行榜页）；'paper' 用在护照的纸色底，
 * 那里浅金浅银几乎看不见，颜色要压深一点。
 */
const COLORS = {
  dark: ['#ffd76e', '#d6dcea', '#d9a273'],
  paper: ['#b8860b', '#7d8898', '#9c5a26'],
};
const LABEL = ['第一名', '第二名', '第三名'];

export default function Trophy({ rank, size = 22, tone = 'dark' }) {
  const n = Number(rank);
  const c = COLORS[tone]?.[n - 1];
  if (!c) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={LABEL[n - 1]}
      style={{ display: 'block', margin: '0 auto', flex: 'none' }}>
      <path d="M7 3h10v5a5 5 0 0 1-10 0V3z" fill={c} />
      <path d="M7 5H4.2v1.4A3.6 3.6 0 0 0 7.8 10M17 5h2.8v1.4A3.6 3.6 0 0 1 16.2 10"
        fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10.9 12.8h2.2v4.2h-2.2z" fill={c} />
      <path d="M8 19.4A2 2 0 0 1 10 17.4h4a2 2 0 0 1 2 2V21H8z" fill={c} />
    </svg>
  );
}
