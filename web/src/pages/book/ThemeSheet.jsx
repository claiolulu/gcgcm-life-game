import React, { useEffect, useState } from 'react';
import { Sheet, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { refreshMe } from '../../lib/player.js';
import { themeVarsOf, coverBgOf } from './bookVals.js';

/**
 * 「自定义」—— 每个人自己调这本护照的配色。
 *
 * 原来这是总控台上的一个全局设置，全场一个样子。搬到本人身上之后，
 * 它就是「我的护照长什么样」：一本用一年的册子，本来就该各人不同。
 *
 * 只调颜色和水印浓度。封面上印的字、签证页的版式那些是同工排的，
 * 不归个人改 —— 那关系到这本册子还认不认得出是同一本。
 */
export default function ThemeSheet({ open, onClose, token, theme, presets }) {
  const toast = useToast();
  const [draft, setDraft] = useState(theme);
  const [busy, setBusy] = useState(false);

  // 每次打开都从当前值重新起步，免得上次改了没存的残留飘回来
  useEffect(() => { if (open) setDraft(theme); }, [open, theme]);

  const edit = (patch) => setDraft((c) => ({ ...c, ...patch }));

  async function save(next = draft) {
    setBusy(true);
    try {
      await api('/api/me/theme', { method: 'POST', body: { theme: next }, token });
      await refreshMe();
      toast(next === null ? '换回默认配色了' : '配色已保存', 'ok');
      onClose?.();
    } catch (err) {
      toast(err.message || '存不上，再试一次', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (!draft) return null;

  return (
    <Sheet open={open} onClose={onClose} title="✎ 自定义我的护照">
      <div className="stack">
        {/* 预览用的是护照自己那套算法，所见即所得 */}
        <div style={{
          ...themeVarsOf(draft), display: 'flex', gap: 8, padding: 10,
          borderRadius: 6, background: '#141110',
        }}>
          <div style={{
            flex: '0 0 88px', height: 126, background: coverBgOf(draft), position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(var(--pp-gold-2-rgb),.45)' }} />
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1px solid rgba(var(--pp-gold-2-rgb),.6)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: 'var(--pp-gold)', fontFamily: "'EB Garamond',serif",
            }}>M</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--pp-gold)' }}>
              人生护照
            </div>
          </div>

          <div style={{
            flex: 1, minWidth: 0, height: 126, background: draft.paper,
            position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              flex: 'none', display: 'flex', height: 16, alignItems: 'center', padding: '0 6px',
              borderBottom: '1px solid rgba(var(--pp-ink-rgb),.4)',
              fontSize: 7, letterSpacing: '.14em', color: 'var(--pp-ink)',
            }}>🎓 迎新之夜</div>
            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', height: 15, background: '#ece5d6', border: '1px solid rgba(var(--pp-ink-rgb),.35)' }}>
                <div style={{ flex: '0 0 38%', display: 'flex', alignItems: 'center', paddingLeft: 5, fontSize: 8, letterSpacing: '.2em', color: 'var(--pp-ink)' }}>
                  VISA
                </div>
                <div style={{ flex: 1, background: 'var(--pp-ink)' }} />
              </div>
              <div style={{ fontSize: 6, letterSpacing: '.1em', color: 'rgba(var(--pp-text-rgb),.55)' }}>ANNOTATION 备注</div>
              <div style={{ fontSize: 8, lineHeight: 1.6, color: 'var(--pp-text)' }}>新学年的第一场。</div>
            </div>
            <div style={{
              position: 'absolute', right: '4%', top: '20%', width: '36%', bottom: '12%',
              backgroundImage: 'url("/wm/city-chambers.png")', backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
              opacity: draft.watermark, pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', right: 6, bottom: 5, width: 34, height: 34, borderRadius: '50%',
              border: `2px solid ${draft.stamp}`, color: draft.stamp, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              opacity: 0.9, transform: 'rotate(-12deg)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</div>
              <div style={{ fontSize: 5, fontWeight: 700 }}>已参加</div>
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {presets.map((pre) => {
            const { key, name, ...colors } = pre;
            return (
              <button key={key} className={`btn btn--sm ${draft.preset === key ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => edit({ ...colors, preset: key })}>
                <span style={{
                  display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                  background: pre.ink, border: `1px solid ${pre.gold}`, marginRight: 5, verticalAlign: 'middle',
                }} />
                {name}
              </button>
            );
          })}
        </div>

        <div className="row" style={{ gap: 12 }}>
          {[['ink', '主色'], ['gold', '烫金'], ['paper', '纸色'], ['text', '正文'], ['stamp', '盖章']].map(([k, label]) => (
            <label key={k} className="center" style={{ flex: 1 }}>
              <input type="color" value={draft[k] || '#000000'}
                onChange={(e) => edit({ [k]: e.target.value, preset: 'custom' })}
                style={{ width: '100%', height: 30, padding: 0, border: '1px solid var(--line)', background: 'none', cursor: 'pointer', display: 'block' }} />
              <div className="tiny dim" style={{ marginTop: 2 }}>{label}</div>
            </label>
          ))}
        </div>

        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="tiny dim" style={{ flex: '0 0 auto' }}>
            水印 <b>{Number(draft.watermark).toFixed(2)}</b>
          </span>
          <input type="range" min="0" max="0.3" step="0.01" value={draft.watermark}
            onChange={(e) => edit({ watermark: Number(e.target.value) })} style={{ flex: 1 }} />
        </label>

        <button className="btn btn--primary btn--full" disabled={busy} onClick={() => save()}>
          {busy ? '存…' : '就这样'}
        </button>
        <button className="btn btn--ghost btn--full" disabled={busy} onClick={() => save(null)}>
          换回默认配色
        </button>
      </div>
    </Sheet>
  );
}
