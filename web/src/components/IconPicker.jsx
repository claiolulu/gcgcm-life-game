import React, { useState } from 'react';

/**
 * 页面链接的图标选择器。
 *
 * 原来那一栏是个纯文本框，让人自己打 emoji —— 电脑上要按 ⌃⌘空格 翻半天，
 * 手机上要切输入法，而实际用到的翻来覆去就那十几个。
 *
 * 挑一个的同时，名字还空着的话顺手填上（选 📷 多半就是要写「相册」），
 * 已经写了的不动 —— 那是人特意写的。
 *
 * 自定义没有被拿掉：调色板下面留了输入框，任何 emoji 照样能填。
 */
const ICONS = [
  ['📷', '相册'], ['📝', '报名表'], ['📍', '地图'], ['💬', '微信群'],
  ['📅', '日程'], ['🎵', '诗歌'], ['📖', '经文'], ['🎬', '视频'],
  ['🍽', '吃什么'], ['🚌', '怎么去'], ['💰', '费用'], ['🎫', '票'],
  ['📄', '文件'], ['ℹ️', '说明'], ['❓', '常见问题'], ['🔗', '链接'],
];

export default function IconPicker({ value, label, onChange }) {
  const [open, setOpen] = useState(false);

  /**
   * 图标和代填的名字一次改完。
   *
   * 分成两次调用的话，第二次读到的还是上一帧的链接数组，会把第一次写进去的
   * 图标覆盖掉 —— 选了图标、名字填上了，图标却没了。
   */
  const choose = (icon, suggested) => {
    // 名字空着才代填。人特意写过的不动
    const fill = !String(label || '').trim() && suggested ? { label: suggested } : null;
    onChange({ icon, ...fill });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="input"
        title="挑一个图标"
        onClick={() => setOpen((v) => !v)}
        style={{
          flex: '0 0 52px', textAlign: 'center', fontSize: 16, lineHeight: 1,
          cursor: 'pointer', padding: '0 4px',
        }}
      >
        {value || '＋'}
      </button>

      {open && (
        <div
          className="card card--tight stack-sm"
          style={{ flex: '1 0 100%', marginTop: 4 }}
        >
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 4,
          }}>
            {ICONS.map(([icon, suggested]) => (
              <button
                key={icon}
                type="button"
                title={suggested}
                onClick={() => choose(icon, suggested)}
                style={{
                  height: 36, fontSize: 17, lineHeight: 1, cursor: 'pointer',
                  border: `1px solid ${value === icon ? 'var(--gold)' : 'var(--line)'}`,
                  borderRadius: 4,
                  background: value === icon ? 'var(--gold-glow)' : 'var(--ink-3)',
                }}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input grow" value={value || ''} maxLength={4}
              placeholder="或者自己填一个 emoji"
              onChange={(e) => onChange({ icon: e.target.value })}
            />
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(false)}>
              好了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
