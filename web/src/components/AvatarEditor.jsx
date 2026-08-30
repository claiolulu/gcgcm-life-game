import React, { useState } from 'react';
import Avatar, { AVATAR_FIELDS, BACKGROUNDS, randomAvatar, DEFAULT_AVATAR } from './Avatar.jsx';

/** 头像编辑器：一个大预览 + 随机按钮 + 分项选择。选项全部铺开不裁切，全程离线。 */
export default function AvatarEditor({ value, onChange, size = 128 }) {
  const avatar = { ...DEFAULT_AVATAR, ...(value || {}) };
  const [tab, setTab] = useState(AVATAR_FIELDS[0].key);
  const field = AVATAR_FIELDS.find((f) => f.key === tab) || AVATAR_FIELDS[0];

  const set = (key, idx) => onChange({ ...avatar, [key]: idx });

  return (
    <div className="stack">
      <div className="center">
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <Avatar config={avatar} size={size} ring />
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => onChange(randomAvatar())}
            style={{ position: 'absolute', right: -8, bottom: -4, borderRadius: 999 }}
            aria-label="随机生成头像"
          >
            🎲 随机
          </button>
        </div>
      </div>

      <div className="opt-wrap" role="tablist">
        {AVATAR_FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={tab === f.key}
            className={`opt ${tab === f.key ? 'opt--on' : ''}`}
            onClick={() => setTab(f.key)}
            style={{ height: 38, minWidth: 0, fontSize: 13 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="row-between" style={{ padding: '0 2px' }}>
        <span className="tiny dim">{field.label}</span>
        <span className="tiny gold">
          {field.kind === 'swatch'
            ? `${((avatar[field.key] ?? 0) % field.values.length) + 1} / ${field.values.length}`
            : field.values[(avatar[field.key] ?? 0) % field.values.length]}
        </span>
      </div>

      <div className="opt-wrap">
        {field.values.map((v, i) => {
          const on = (avatar[field.key] ?? 0) % field.values.length === i;
          return (
            <button
              key={i}
              type="button"
              className={`opt ${on ? 'opt--on' : ''}`}
              onClick={() => set(field.key, i)}
              aria-label={`${field.label} ${i + 1}`}
            >
              {field.kind === 'swatch' ? (
                <span
                  className="swatch"
                  style={{
                    background:
                      field.key === 'bg'
                        ? `linear-gradient(160deg, ${BACKGROUNDS[i][0]}, ${BACKGROUNDS[i][1]})`
                        : v,
                  }}
                />
              ) : (
                v
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
