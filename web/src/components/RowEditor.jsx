import React from 'react';

/**
 * 签证页栏目表的编辑器。
 *
 * 模版和「某场活动自己那套」共用它 —— 两边的数据结构本来就是同一个。
 * 定义在模块作用域而不是 Admin 里面：写在组件里的话每次渲染都是一个
 * 新的组件类型，React 会整棵重建，打一个字就丢一次焦点。
 */
export default function RowEditor({ rows, ops, sources, dense = false }) {
  return (
    <div className="stack-sm">
      {rows.map((r, i) => (
        <div key={r.key || i} className="card card--tight stack-sm" style={{ padding: dense ? 8 : undefined }}>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input grow" value={r.label} maxLength={40} placeholder="栏目标题，例如 VISA TYPE 类型"
              onChange={(e) => ops.edit(i, { label: e.target.value })}
            />
            <button className="btn btn--sm btn--ghost" disabled={i === 0}
              onClick={() => ops.move(i, -1)} title="上移">↑</button>
            <button className="btn btn--sm btn--ghost" disabled={i === rows.length - 1}
              onClick={() => ops.move(i, 1)} title="下移">↓</button>
            <button className="btn btn--sm btn--ghost" onClick={() => ops.remove(i)} title="删掉这一栏">✕</button>
          </div>
          {/* 来源和「加重」排一行，内容单独一行 —— 三样挤一行在 400px 的
              手机上会把右边两样压成一条竖缝 */}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            {/* 按组分开：来源有近二十个，平铺成一列谁也找不到自己要的 */}
            <select
              className="input grow" style={{ minWidth: 0 }} value={r.src}
              onChange={(e) => ops.edit(i, { src: e.target.value })}
            >
              {[...new Set(sources.map((s) => s.group || ''))].map((g) => {
                const items = sources.filter((s) => (s.group || '') === g);
                return g
                  ? <optgroup key={g} label={g}>{items.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup>
                  : items.map((s) => <option key={s.key} value={s.key}>{s.name}</option>);
              })}
            </select>
            <label
              className="tiny dim row"
              style={{ gap: 4, flex: '0 0 auto', alignItems: 'center', whiteSpace: 'nowrap' }}
              title="用主色印，比其它栏目重"
            >
              <input type="checkbox" checked={!!r.accent}
                onChange={(e) => ops.edit(i, { accent: e.target.checked })} />
              加重
            </label>
          </div>
          {r.src === 'text' ? (
            <input
              className="input" value={r.text || ''} maxLength={40} placeholder="印在这一栏的字"
              onChange={(e) => ops.edit(i, { text: e.target.value })}
            />
          ) : (
            <div className="tiny dim">
              {sources.find((s) => s.key === r.src)?.hint || '这一栏的内容按人算，不用填'}
            </div>
          )}
        </div>
      ))}
      <button className="btn btn--sm btn--ghost" onClick={ops.add}>+ 加一栏</button>
    </div>
  );
}
