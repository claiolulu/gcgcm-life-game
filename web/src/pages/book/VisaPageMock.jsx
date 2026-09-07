import React from 'react';
import { themeVarsOf, resolveVisaTemplate } from './bookVals.js';

/**
 * 编辑器里那张「底稿」—— 签证页去掉数据之后的样子。
 *
 * 它只是给同工摆东西时当参照的：栏目里填的是示例值（真页面上每个人不一样），
 * 章和二维码也只是画个位置。真正会一模一样呈现的是上面那层画布，
 * 它和真页面用的是同一个组件（VisaCanvas）。
 *
 * children 是画布插槽：编辑器把可拖的那层塞进来，位置和真页面上一致。
 *
 * 页面比例不是固定的 —— 横版页在竖屏手机上是整个舞台转 90°，所以页的宽高比
 * 等于手机屏的高宽比。这里按常见的竖屏手机取 1.9:1，屏幕特别长或特别方的
 * 设备上会有些出入。
 */
export const MOCK_ASPECT = 1.9;

const SAMPLE = {
  post: 'GCGCM 01', control: 'GCGCM000001/01',
  surname: '林', given: '小满', identity: 'SOLO',
  status: '✓',
};

export default function VisaPageMock({ theme, template, activity, children }) {
  const tpl = resolveVisaTemplate(template, activity);
  const rows = tpl.rows || [];

  const val = (r) => {
    if (r.src === 'text') return r.text || '';
    if (r.src === 'tag') return activity?.tag || '类型';
    if (r.src === 'host') return activity?.host || '负责人';
    if (r.src === 'date') return activity?.date || 'TBC 待定';
    if (r.src === 'name') return activity?.name || '活动名';
    if (r.src === 'en') return String(activity?.en || 'EVENT').toUpperCase();
    return SAMPLE[r.src] || '——';
  };

  return (
    <div
      style={{
        ...themeVarsOf(theme),
        position: 'absolute', inset: 0,
        background: theme?.paper || '#f3ede0',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', containerType: 'size',
      }}
    >
      {/* 地标水印 */}
      {activity?.landmarkKey && (
        <div style={{
          position: 'absolute', right: '3%', top: '12%', width: '40%', bottom: '14%',
          backgroundImage: `url("/wm/${activity.landmarkKey}.png")`,
          backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
          opacity: theme?.watermark ?? 0.13, pointerEvents: 'none',
        }} />
      )}

      {/* 画布插槽。放在水印之后、正文之前 —— 和真页面一样，
          贴上去的东西压得住水印，压不住正文和那个章。
          编辑器把可拖动的那一层塞在这儿，所见即所得靠的就是这个位置 */}
      {children}

      {/* 页眉 */}
      <div style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: '1.5cqh',
        padding: '2cqh 2.5cqh', borderBottom: '1px solid rgba(var(--pp-ink-rgb),.4)',
        fontSize: '2.6cqh', color: 'var(--pp-ink)',
      }}>
        <span style={{ opacity: 0.5 }}>🏆 🪪 LIVE</span>
        <span style={{ flex: 1, textAlign: 'center', letterSpacing: '.14em' }}>
          {activity?.icon} {activity?.name || '活动名'}
        </span>
        <span style={{ fontWeight: 700 }}>00</span>
      </div>

      {/* VISA 横幅 */}
      <div style={{ flex: 'none', padding: '2.6cqh 4cqh 0' }}>
        <div style={{
          display: 'flex', height: '10.5cqh', background: '#ece5d6',
          border: '1px solid rgba(var(--pp-ink-rgb),.35)',
        }}>
          <div style={{
            flex: '0 0 38%', display: 'flex', alignItems: 'center', paddingLeft: '3.5cqh',
            fontFamily: "'EB Garamond',serif", fontSize: '4.6cqh', letterSpacing: '.3em',
            color: 'var(--pp-ink)',
          }}>{tpl.banner}</div>
          <div style={{
            flex: 1, background: 'var(--pp-ink)', display: 'flex', flexDirection: 'column',
            alignItems: 'flex-end', justifyContent: 'center', paddingRight: '3.5cqh',
          }}>
            <div style={{ fontFamily: "'EB Garamond',serif", fontSize: '2.9cqh', letterSpacing: '.2em', color: 'var(--pp-gold)' }}>
              {theme?.visaBrand || 'MINI LIFE GAME'}
            </div>
            <div style={{ fontSize: '2.2cqh', color: 'rgba(var(--pp-gold-rgb),.78)' }}>
              {theme?.visaBrandCn || '迷你人生游戏'}
            </div>
          </div>
        </div>
      </div>

      {/* 正文 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '3.5cqh', padding: '2.6cqh 4cqh 0', overflow: 'hidden' }}>
        <div style={{
          flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '1.8cqh 3.5cqh', alignContent: 'start',
        }}>
          {rows.map((r) => (
            <div key={r.key} style={{ borderBottom: '1px solid rgba(var(--pp-ink-rgb),.18)', paddingBottom: '0.7cqh' }}>
              <div style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.8cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }}>
                {r.label}
              </div>
              <div style={{
                marginTop: '0.6cqh', fontFamily: "'Courier Prime',monospace", fontWeight: 700,
                fontSize: '2.6cqh', color: r.accent ? 'var(--pp-ink)' : 'var(--pp-text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{val(r)}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', gap: '2cqh' }}>
          {tpl.showPhoto !== false && activity?.photo && (
            <div style={{ flex: 'none', padding: '0.7cqh', background: '#fff', border: '1px solid rgba(var(--pp-ink-rgb),.35)' }}>
              <div style={{
                width: '100%', height: '18cqh', backgroundImage: `url("${activity.photo}")`,
                backgroundSize: 'cover', backgroundPosition: 'center',
              }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.8cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }}>
              {tpl.stationLabel}
            </div>
            <div style={{ marginTop: '0.7cqh', fontSize: '4.4cqh', fontWeight: 700, color: 'var(--pp-ink)' }}>
              {activity?.name || '活动名'}
            </div>
          </div>
          {tpl.showAnnotation !== false && (
            <div>
              <div style={{ fontFamily: "'EB Garamond',serif", fontSize: '1.8cqh', letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }}>
                {tpl.annotationLabel}
              </div>
              <div style={{ marginTop: '0.8cqh', fontSize: '2.7cqh', fontWeight: 600, lineHeight: 1.75, color: 'var(--pp-text)' }}>
                {activity?.desc || '这场活动是什么，写在活动详情页的「说明」里。'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 页面链接 */}
      {tpl.showLinks !== false && (activity?.links || []).length > 0 && (
        <div style={{ flex: 'none', display: 'flex', gap: '1.4cqh', padding: '0 4cqh 1.6cqh' }}>
          {activity.links.map((l, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.9cqh', padding: '0.7cqh 1.8cqh',
              border: '1px solid rgba(var(--pp-ink-rgb),.32)', background: 'rgba(var(--pp-ink-rgb),.05)',
              color: 'var(--pp-ink)', fontSize: '2.2cqh', whiteSpace: 'nowrap',
            }}>{l.icon} {l.label}</span>
          ))}
        </div>
      )}

      {/* 机读区 */}
      <div style={{
        flex: 'none', padding: '1.4cqh 4cqh 2cqh', background: '#eae3d2',
        borderTop: '1px solid rgba(var(--pp-ink-rgb),.4)', overflow: 'hidden',
      }}>
        {['P<GCGCMPLAYER<<ONE<<<<<<<<<<<<<<<<<<', 'GCGCM000001<GCGCM——<00PTS<<<<<<<<<<'].map((t, i) => (
          <div key={i} style={{
            fontFamily: "'Courier Prime',monospace", fontWeight: 700, fontSize: '2.5cqh',
            letterSpacing: '.1em', color: 'var(--pp-text)', whiteSpace: 'nowrap',
          }}>{t}</div>
        ))}
      </div>
    </div>
  );
}
