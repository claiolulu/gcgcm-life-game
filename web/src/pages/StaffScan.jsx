import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import Scanner from '../components/Scanner.jsx';
import { NetBar, Sheet, useToast, useConfirm, Empty, ago } from '../components/ui.jsx';
import { useConfig } from '../lib/config.js';
import { useStaff, findByCode, allPlayers, flush, retryAll, dismissIssue, logout, setStation } from '../lib/staff.js';

export default function StaffScan() {
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();

  const [mode, setMode] = useState('scan'); // scan | manual | list
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const mainStations = config?.stations || [];
  const stations = [...mainStations, ...(config?.functional || [])];
  const myStation = stations.find((s) => s.id === staff.session?.station);

  const open = useCallback(
    (player) => {
      if (!player) return;
      navigator.vibrate?.(40);
      nav(`/staff/p/${player.id}`);
    },
    [nav]
  );

  const onScan = useCallback(
    (raw) => {
      const player = findByCode(raw.replace(/^MLG:/i, ''));
      if (player) open(player);
      else toast(`扫到了 ${raw}，但花名册里没有这个人。可能是还没同步，下拉刷新试试`, 'err', 4500);
    },
    [open, toast]
  );

  function manualGo() {
    const player = findByCode(code);
    if (player) { open(player); setCode(''); }
    else toast(`没有找到 ${code} 号选手，请核对一下`, 'err');
  }

  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...players].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return base.slice(0, 60);
    return base.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [players, query]);

  return (
    <div className="page">
      <NetBar
        online={staff.online}
        connected={staff.connected}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      {/* 冲突和失败必须让人看见，不能默默吞掉 */}
      {staff.issues.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255,90,95,0.5)', marginBottom: 12 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="bold small" style={{ color: '#ff8a8e' }}>⚠️ {staff.issues.length} 条操作没有生效</div>
            <button className="btn btn--sm btn--ghost" onClick={retryAll}>清除</button>
          </div>
          <div className="stack-sm">
            {staff.issues.slice(0, 4).map((i) => (
              <div key={i.opId} className="small muted">
                · {i.message}
                <button className="btn btn--sm" style={{ minHeight: 26, marginLeft: 6, padding: '0 8px' }}
                  onClick={() => dismissIssue(i.opId)}>知道了</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">{staff.session?.role === 'admin' ? 'Admin' : 'Staff'}</div>
          <h2>{myStation ? `${myStation.icon} ${myStation.name}` : '扫码记分'}</h2>
          <div className="tiny dim">
            {staff.session?.name || '未署名'} · 花名册 {staff.players.length} 人 · {ago(staff.lastSyncedAt)}同步
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          <button className="btn btn--sm btn--ghost" onClick={() => flush({ full: true })} disabled={staff.syncing}>
            {staff.syncing ? '同步中' : '↻'}
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setMenuOpen(true)}>⋯</button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {[
          { id: 'scan', label: '📷 扫码' },
          { id: 'manual', label: '⌨️ 输码' },
          { id: 'list', label: '📋 花名册' },
        ].map((t) => (
          <button
            key={t.id}
            className={`btn btn--sm grow ${mode === t.id ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setMode(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'scan' && (
        <div className="stack">
          <Scanner onResult={onScan} active={mode === 'scan'} />
          <div className="center small muted">把选手手机上的二维码对准取景框</div>
          <button className="btn btn--ghost btn--full" onClick={() => setMode('manual')}>
            扫不出来？点这里手动输入编号
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="card stack">
          <div className="field">
            <label className="label">选手编号</label>
            <input
              className="input input--code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="07"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="go"
              onKeyDown={(e) => e.key === 'Enter' && manualGo()}
            />
            <div className="tiny dim">就是选手二维码下面那个号码。输 7 或 07 都行。</div>
          </div>
          <button className="btn btn--primary btn--full" disabled={!code.trim()} onClick={manualGo}>
            查找选手
          </button>
        </div>
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="⋯ 更多">
        <div className="stack">
          <div className="card card--flat card--tight">
            <div className="small bold">{staff.session?.name || '未署名'}</div>
            <div className="tiny dim">
              {staff.session?.role === 'admin' ? '管理员' : '工作人员'}
              {myStation ? ` · ${myStation.name}` : ' · 未选站点'}
            </div>
          </div>

          <div className="field">
            <label className="label">换一个站点</label>
            <div className="opt-wrap">
              {stations.map((st) => (
                <button
                  key={st.id}
                  className={`opt ${staff.session?.station === st.id ? 'opt--on' : ''}`}
                  onClick={() => {
                    setStation(staff.session?.station === st.id ? '' : st.id);
                    toast(staff.session?.station === st.id ? '已取消站点' : `已切到 ${st.name}`, 'ok');
                  }}
                  style={{ height: 40 }}
                >
                  {st.icon} {st.name}
                </button>
              ))}
            </div>
            <div className="tiny dim">选中之后扫码会直接跳到这个站的记分界面。</div>
          </div>

          {staff.outbox.length > 0 && (
            <div className="card card--tight small" style={{ color: 'var(--yellow)' }}>
              ⚠️ 还有 {staff.outbox.length} 条记分没上传，现在退出会丢掉。请先等它传完。
            </div>
          )}

          <button
            className="btn btn--danger btn--full"
            onClick={async () => {
              const ok = await ask({
                title: '退出工作人员端？',
                danger: true,
                confirmText: '退出登录',
                body: staff.outbox.length > 0
                  ? `⚠️ 还有 ${staff.outbox.length} 条记分没有上传，现在退出会丢掉这些记录。\n建议等顶部状态条变绿再退。`
                  : '下次需要重新输入 PIN。',
              });
              if (!ok) return;
              logout();
              nav('/staff', { replace: true });
            }}
          >
            🚪 退出登录
          </button>
          <button className="btn btn--full" onClick={() => setMenuOpen(false)}>关闭</button>
        </div>
      </Sheet>

      {mode === 'list' && (
        <div className="stack">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜名字或编号…"
          />
          {filtered.length === 0 ? (
            <Empty
              icon="👥"
              title={staff.players.length === 0 ? '花名册还是空的' : '没有匹配的人'}
              hint={staff.players.length === 0 ? '点右上角刷新拉取，或者等选手先报名' : '换个关键词试试'}
            />
          ) : (
            <div className="stack-sm">
              {filtered.map((p) => (
                <button key={p.id} className="lb-row" onClick={() => open(p)} style={{ textAlign: 'left', width: '100%' }}>
                  <Avatar config={p.avatar} size={38} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small bold">{p.name}</div>
                    <div className="tiny dim mono">
                      {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? mainStations.length} 关
                      {p.hasPending && <span style={{ color: 'var(--yellow)' }}> · 待同步</span>}
                      {p.pendingLifeEvents > 0 && <span style={{ color: 'var(--red)' }}> · 欠盲盒</span>}
                    </div>
                  </div>
                  <div className="lb-score">{p.total}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
