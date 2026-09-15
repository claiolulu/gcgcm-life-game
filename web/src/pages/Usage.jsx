import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStaff } from '../lib/staff.js';

/**
 * 使用情况（管理员）。数据来自 /api/admin/usage；埋点见 lib/track.js，
 * 记什么、保留多久见 server/src/usage.js。
 *
 * 配色：登录用户蓝、访客橙。这两色在总控台面板底色上跑过调色板校验
 * （亮度带、色弱区分度、对比度都通过）。数字和文字一律用正文色，不用系列色。
 */
const RANGES = [7, 30, 90, 180];
const USERS = { key: 'users', label: '登录用户', color: '#3987e5' };
const VISITORS = { key: 'visitors', label: '未登录访客', color: '#d95926' };
const ACTIONS = { key: 'actions', label: '操作次数', color: '#3987e5' };

const WEEK = '日一二三四五六';
const fmtDay = (day) => { const [, m, d] = day.split('-'); return `${Number(m)}/${Number(d)}`; };
const weekday = (day) => WEEK[new Date(`${day}T12:00:00Z`).getUTCDay()];

/** y 轴取整：4 格，每格是 1/2/5×10ⁿ 的整数 */
function niceScale(max) {
  const raw = Math.max(1, max) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw && Number.isInteger(s)) || 1);
  return { step, top: step * 4 };
}

/** 顶端 4px 圆角、底边方角的柱子 */
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function ColumnChart({ rows, series, height = 190, label }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const M = { t: 12, r: 10, b: 26, l: 36 };
  const plotW = width - M.l - M.r;
  const plotH = height - M.t - M.b;
  const n = rows.length;
  const totals = rows.map((r) => series.reduce((s, k) => s + (r[k.key] || 0), 0));
  const { step, top } = niceScale(Math.max(0, ...totals));
  const band = plotW / Math.max(1, n);
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v) => M.t + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  function pick(clientX) {
    const rect = wrapRef.current.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - M.l) / band);
    setHover(i >= 0 && i < n ? i : null);
  }
  function onKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
  }

  const hv = hover != null ? rows[hover] : null;
  // 提示框放在所指那一天的旁边（左半边放右侧，右半边放左侧），不盖住那根柱子
  const center = hover != null ? M.l + band * (hover + 0.5) : 0;
  const tipStyle = center < width / 2 ? { left: center + band / 2 + 8 } : { right: width - center + band / 2 + 8 };

  return (
    <div className="usage-chart" ref={wrapRef} style={{ height }}>
      <svg
        width={width} height={height} role="img" aria-label={label} tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {[0, 1, 2, 3, 4].map((k) => {
          const yy = Math.round(y(step * k)) + 0.5;
          return (
            <g key={k}>
              <line x1={M.l} x2={width - M.r} y1={yy} y2={yy} className={k === 0 ? 'usage-axis' : 'usage-grid'} />
              <text x={M.l - 7} y={yy} className="usage-tick" textAnchor="end" dominantBaseline="middle">{step * k}</text>
            </g>
          );
        })}
        {hover != null && (
          <rect x={M.l + band * hover} y={M.t} width={band} height={plotH} className="usage-hoverband" />
        )}
        {rows.map((r, i) => {
          const x = M.l + band * i + (band - barW) / 2;
          const nonzero = series.filter((s) => (r[s.key] || 0) > 0);
          let base = 0;
          return (
            <g key={r.day}>
              {nonzero.map((s, j) => {
                const y0 = y(base);
                base += r[s.key];
                const y1 = y(base);
                // 叠在上面的段往上让出 2px，靠底色缝把两段分开，不画描边
                const h = y0 - y1 - (j > 0 ? 2 : 0);
                if (h <= 0) return null;
                return j === nonzero.length - 1
                  ? <path key={s.key} d={barPath(x, y1, barW, h, 4)} fill={s.color} />
                  : <rect key={s.key} x={x} y={y1} width={barW} height={h} fill={s.color} />;
              })}
            </g>
          );
        })}
        {rows.map((r, i) => {
          if ((n - 1 - i) % labelEvery !== 0) return null;
          const last = i === n - 1 && band < 40;
          return (
            <text
              key={r.day} className="usage-tick" y={height - 8}
              x={last ? M.l + band * n : M.l + band * (i + 0.5)}
              textAnchor={last ? 'end' : 'middle'}
            >
              {fmtDay(r.day)}
            </text>
          );
        })}
      </svg>
      {hv && (
        <div className="usage-tip" style={tipStyle}>
          <div className="usage-tip__day">{fmtDay(hv.day)} 周{weekday(hv.day)}</div>
          {series.map((s) => (
            <div key={s.key} className="usage-tip__row">
              <span className="usage-tip__key" style={{ background: s.color }} />
              <b>{hv[s.key] || 0}</b><span>{s.label}</span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="usage-tip__row">
              <span className="usage-tip__key usage-tip__key--none" />
              <b>{series.reduce((sum, s) => sum + (hv[s.key] || 0), 0)}</b><span>合计</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DailyTable({ rows }) {
  return (
    <div className="usage-table-wrap">
      <table className="usage-table">
        <thead>
          <tr><th>日期</th><th>登录用户</th><th>未登录访客</th><th>操作次数</th></tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.day}>
              <td>{fmtDay(r.day)} 周{weekday(r.day)}</td>
              <td>{r.users}</td><td>{r.visitors}</td><td>{r.actions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Usage() {
  const nav = useNavigate();
  const staff = useStaff();
  const token = staff.session?.token;
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [asTable, setAsTable] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    api(`/api/admin/usage?days=${days}`, { token })
      .then((d) => { if (!dead) { setData(d); setErr(''); } })
      .catch((e) => { if (!dead) setErr(e.message || '读取失败'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [days, token, reload]);

  const k = data?.kpi;
  const empty = data && !k.usersRange && !k.visitorsRange;
  const maxEvent = Math.max(1, ...(data?.events || []).map((e) => e.n));

  return (
    <div className="page page--wide staff-page admin-page usage-page">
      <div className="row-between admin-header">
        <div className="admin-header__title">
          <div className="eyebrow">MINI LIFE · USAGE</div>
          <h1>使用情况</h1>
          <div className="small muted">每天多少人在用、用了哪些功能、每场活动从扫码到参加</div>
        </div>
        <button className="btn btn--sm btn--ghost admin-logout" onClick={() => nav('/staff/admin')}>← 返回总控台</button>
      </div>

      <div className="usage-filter">
        <div className="usage-ranges" role="group" aria-label="时间范围">
          {RANGES.map((d) => (
            <button
              key={d} type="button" aria-pressed={days === d}
              className={`usage-range${days === d ? ' usage-range--on' : ''}`}
              onClick={() => setDays(d)}
            >
              近 {d} 天
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setReload((x) => x + 1)} disabled={loading}>
          {loading ? '读取中…' : '刷新'}
        </button>
      </div>

      {err && <div className="card usage-note usage-note--err">读取失败：{err}</div>}
      {!data && !err && <div className="card usage-note">正在读取…</div>}

      {data && (
        <div className="usage-body" style={{ opacity: loading ? 0.55 : 1 }}>
          <div className="admin-stats">
            {[
              { icon: '📱', label: `今天活跃 · 访客 ${k.todayVisitors}`, value: k.todayUsers, tone: 'blue' },
              { icon: '📅', label: '近 7 天活跃', value: k.users7, tone: 'purple' },
              { icon: '👥', label: `近 ${data.days} 天活跃 · 访客 ${k.visitorsRange}`, value: k.usersRange, tone: 'gold' },
              { icon: '👆', label: `近 ${data.days} 天操作次数`, value: k.actionsRange, tone: 'green' },
            ].map((s) => (
              <div key={s.label} className={`admin-stat admin-stat--${s.tone}`}>
                <div className="admin-stat__icon">{s.icon}</div>
                <div>
                  <div className="admin-stat__value">{s.value}</div>
                  <div className="admin-stat__label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {empty && (
            <div className="card usage-note">
              这段时间还没有记录。新版上线以后，大家打开护照、报名、翻签证页，就会开始出现在这里。
            </div>
          )}

          <div className="card admin-panel usage-card">
            <div className="row-between usage-card__head">
              <div>
                <h3>每天有多少人在用</h3>
                <div className="tiny dim">登录用户按护照算，未登录访客按设备算（扫码进来还没领护照的人）</div>
              </div>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAsTable((x) => !x)}>
                {asTable ? '看图表' : '看表格'}
              </button>
            </div>
            {asTable ? <DailyTable rows={data.series} /> : (
              <>
                <div className="usage-legend">
                  {[USERS, VISITORS].map((s) => (
                    <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
                  ))}
                </div>
                <ColumnChart rows={data.series} series={[USERS, VISITORS]} label="每天活跃人数，按登录用户和访客叠加" />
              </>
            )}
          </div>

          {!asTable && (
            <div className="card admin-panel usage-card">
              <div className="usage-card__head">
                <h3>每天操作次数</h3>
                <div className="tiny dim">翻签证页、打开排名榜、报名、开通知等所有点击（不含单纯打开网页）</div>
              </div>
              <ColumnChart rows={data.series} series={[ACTIONS]} height={150} label="每天操作次数" />
            </div>
          )}

          <div className="cols-2 cols-pair">
            <div className="card admin-panel usage-card">
              <div className="usage-card__head">
                <h3>功能使用</h3>
                <div className="tiny dim">近 {data.days} 天 · 次数和用过的人数</div>
              </div>
              {data.events.length ? (
                <div className="usage-bars">
                  {data.events.map((e) => (
                    <div className="usage-bar" key={e.event}>
                      <div className="usage-bar__label">{e.label}</div>
                      <div className="usage-bar__track">
                        <div className="usage-bar__fill" style={{ width: `${(e.n / maxEvent) * 100}%` }} />
                      </div>
                      <div className="usage-bar__value"><b>{e.n}</b> 次 · {e.people} 人</div>
                    </div>
                  ))}
                </div>
              ) : <div className="small dim">暂无</div>}
            </div>

            <div className="card admin-panel usage-card">
              <div className="usage-card__head">
                <h3>活动转化</h3>
                <div className="tiny dim">报名页和签证页是近 {data.days} 天看过的人数；报名、已参加是这场活动的累计</div>
              </div>
              <div className="usage-table-wrap">
                <table className="usage-table usage-table--acts">
                  <thead>
                    <tr><th>活动</th><th>报名页</th><th>报名</th><th>已参加</th><th>签证页</th><th>通知 发出/点开</th></tr>
                  </thead>
                  <tbody>
                    {data.activities.map((a) => (
                      <tr key={a.id}>
                        <td className="usage-table__name">{a.name}</td>
                        <td>{a.joinPeople}</td>
                        <td>{a.signups}</td>
                        <td>{a.attended}</td>
                        <td>{a.visaPeople}</td>
                        <td>{a.notifSent || a.notifOpens ? `${a.notifSent} / ${a.notifOpens}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="tiny dim usage-foot">
            {data.oldestDay ? `最早一条记录：${data.oldestDay}。` : ''}
            原始记录保留 {data.retentionDays} 天，到期自动删除；不记录 IP、位置和任何填写的内容。按英国时间分天。
          </div>
        </div>
      )}
    </div>
  );
}
