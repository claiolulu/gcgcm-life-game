import React from 'react';
import Avatar from '../../components/Avatar.jsx';

/**
 * 「我的队友」面板。
 *
 * 场内找人靠两样东西，缺一不可：
 *   1. 大号的颜色 + 符号徽记 —— 举着手机互相对，隔着人群也能认出来
 *   2. 队友的头像和名字 —— 50 个陌生人里只按符号找太费劲，
 *      而且头像是他们自己捏的，比名字更好认
 *
 * Solo 没有队友，这里改成说明它的优势关，免得显得像出错了。
 */
export default function TeamPanel({ open, onClose, identity, badge, teammates, startStation }) {
  if (!open) return null;

  const isSolo = identity === 'solo';
  const cn = { solo: '独行侠', duo: '双人搭档', trio: '三股绳' }[identity] || '';
  const need = identity === 'duo' ? 1 : identity === 'trio' ? 2 : 0;
  const missing = Math.max(0, need - teammates.length);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(20,17,16,.72)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
        animation: 'fadeIn .2s ease both',
        fontFamily: "'Noto Serif SC','EB Garamond',serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, maxHeight: '86dvh', overflowY: 'auto',
          background: '#f3ede0', color: '#2a2320',
          border: '1px solid #b9913f', borderRadius: 2,
          padding: '22px 20px 18px',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
          animation: 'pageIn .25s ease both',
        }}
      >
        <div style={{
          fontFamily: "'EB Garamond',serif", fontSize: 10, letterSpacing: '.24em',
          textIndent: '.24em', color: 'rgba(92,26,34,.6)', textAlign: 'center',
        }}>
          MY TEAM 我的队伍
        </div>

        {!identity ? (
          <div style={{ textAlign: 'center', padding: '30px 6px 20px' }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>⏳</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>身份还没抽</div>
            <div style={{ fontSize: 12, color: 'rgba(42,35,32,.6)', marginTop: 6, lineHeight: 1.7 }}>
              等主持人宣布开始、总控台抽签之后，这里会告诉你要去找谁。
            </div>
          </div>
        ) : (
          <>
            {/* 颜色符号徽记：举着手机互相对 */}
            {badge && (
              <div style={{ textAlign: 'center', margin: '16px 0 6px' }}>
                <div style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, padding: '14px 26px',
                  border: `2px solid ${badge.hex}`, borderRadius: 2,
                  background: `${badge.hex}14`,
                }}>
                  <div style={{ fontSize: 46, lineHeight: 1, color: badge.hex }}>{badge.symbol}</div>
                  {/* 英文在上、中文在下：页眉徽章只放得下英文，
                      这里两个都给出来，免得对不上号 */}
                  <div style={{
                    fontSize: 15, fontWeight: 700, letterSpacing: '.16em',
                    fontFamily: "'EB Garamond',serif", color: badge.hex,
                  }}>
                    {badge.en}
                  </div>
                  <div style={{ fontSize: 14, letterSpacing: '.1em', color: badge.hex, opacity: .85 }}>
                    {badge.name}队
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(42,35,32,.55)', marginTop: 8, lineHeight: 1.6 }}>
                  {isSolo
                    ? '这是你的编组颜色，不用找人'
                    : '举着这个在场内互相对暗号'}
                </div>
              </div>
            )}

            <div style={{ height: 1, background: 'rgba(92,26,34,.18)', margin: '16px 0 14px' }} />

            {isSolo ? (
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                  🔴 SOLO · {cn}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.85, color: 'rgba(42,35,32,.8)' }}>
                  你这一局独自上路，没有队友。这不是惩罚 —— 记忆观察、摸黑套圈、寂静图书馆
                  这三关限制沟通，人越多越乱，独行侠反而快得多。
                  <br /><br />
                  但「定格瞬间」那一关你必须现场邀请一位路人合作。那是今晚专门留给你的一道题。
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'rgba(42,35,32,.65)', marginBottom: 12 }}>
                  {missing > 0
                    ? `你是 ${identity.toUpperCase()}，还差 ${missing} 位队友没有登记`
                    : `去把这 ${teammates.length} 位找出来，你们是一队的`}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {teammates.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 11px',
                        border: '1px solid rgba(92,26,34,.22)', borderRadius: 2,
                        background: 'rgba(255,255,255,.5)',
                      }}
                    >
                      <Avatar config={m.avatar} size={46} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                        <div style={{
                          fontFamily: "'Courier Prime',monospace", fontSize: 11,
                          letterSpacing: '.08em', color: 'rgba(42,35,32,.55)', marginTop: 2,
                        }}>
                          {m.code} 号
                        </div>
                      </div>
                    </div>
                  ))}

                  {missing > 0 && Array.from({ length: missing }).map((_, i) => (
                    <div
                      key={`ghost-${i}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 11px',
                        border: '1px dashed rgba(92,26,34,.3)', borderRadius: 2,
                        color: 'rgba(42,35,32,.45)', fontSize: 13,
                      }}
                    >
                      <div style={{
                        width: 46, height: 46, borderRadius: '50%',
                        border: '1px dashed rgba(92,26,34,.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>?</div>
                      还没有登记
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: 'rgba(42,35,32,.6)', marginTop: 14, lineHeight: 1.8 }}>
                  找到之后一起行动。每一关的评分要求会随人数变化 ——
                  {identity === 'duo' ? '两个人都必须开口、都必须答对。' : '三个人都必须参与，一个都不能划水。'}
                  <br />
                  <span style={{ color: 'rgba(92,26,34,.7)' }}>
                    积分仍然记在各自的护照上，帮了队友不会让你少分。
                  </span>
                </div>
              </div>
            )}

            {startStation && (
              <div style={{
                marginTop: 14, padding: '10px 12px',
                border: '1px solid rgba(198,164,95,.5)', borderRadius: 2,
                background: 'rgba(198,164,95,.1)', fontSize: 12.5, lineHeight: 1.6,
              }}>
                建议先去 <b>{startStation.icon} {startStation.name}</b>
                <div style={{ fontSize: 11, color: 'rgba(42,35,32,.55)', marginTop: 3 }}>
                  每组的首站都不一样，避免开局全挤在一个关卡
                </div>
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 18, padding: '13px',
            background: '#5c1a22', border: '1px solid rgba(198,164,95,.6)', borderRadius: 2,
            color: '#e6cd91', fontFamily: "'EB Garamond',serif",
            fontSize: 12, letterSpacing: '.24em', textIndent: '.24em', cursor: 'pointer',
          }}
        >
          CLOSE 收起
        </button>
      </div>
    </div>
  );
}
