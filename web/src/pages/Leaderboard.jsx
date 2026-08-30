import React, { useCallback, useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Empty, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { kvGet, kvSet } from '../lib/idb.js';
import { onTick } from '../lib/realtime.js';
import { usePlayer } from '../lib/player.js';
import { useConfig } from '../lib/config.js';

export default function Leaderboard() {
  const { me } = usePlayer();
  const { config } = useConfig();
  const identities = config?.identities || {};
  const stationCount = config?.stations?.length ?? 8;

  const [board, setBoard] = useState([]);
  const [state, setState] = useState({ online: navigator.onLine, connected: false, at: 0, loading: true });

  const load = useCallback(async () => {
    try {
      const res = await api('/api/leaderboard', { timeout: 7000 });
      setBoard(res.board || []);
      await kvSet('leaderboard', { board: res.board, at: Date.now() });
      setState((s) => ({ ...s, online: true, at: Date.now(), loading: false }));
    } catch {
      const cached = await kvGet('leaderboard');
      if (cached?.board) {
        setBoard(cached.board);
        setState((s) => ({ ...s, at: cached.at, loading: false }));
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
      setState((s) => ({ ...s, online: false }));
    }
  }, []);

  useEffect(() => {
    load();
    const off = onTick((p) => {
      setState((s) => ({ ...s, connected: !!p.connected }));
      if (p.reason !== 'disconnect') load();
    });

    // 兜底轮询：漏掉一次推送就再也不更新，对现场来说是致命的；
    // 同时也让顶部的「更新于」保持有意义，不会一直显示很久以前。
    const timer = setInterval(() => { if (navigator.onLine) load(); }, 20_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      off();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const top3 = board.slice(0, 3);
  const rest = board.slice(3);
  const myRow = board.find((r) => r.id === me?.id);

  return (
    <div className="page">
      <NetBar online={state.online} connected={state.connected} lastSyncedAt={state.at} />

      <div className="center" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Leaderboard</div>
        <h1 style={{ marginTop: 4 }}>实时排行榜</h1>
        <div className="tiny dim" style={{ marginTop: 4 }}>
          共 {board.length} 位参与者 · 更新于 {ago(state.at)}
        </div>
      </div>

      {state.loading && board.length === 0 && (
        <div className="stack">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 58 }} />)}
        </div>
      )}

      {!state.loading && board.length === 0 && (
        <Empty icon="🏁" title="还没有人上榜" hint="等第一位选手过了第一关，这里就会热闹起来" />
      )}

      {/* 前三名领奖台 */}
      {top3.length > 0 && (
        <div className="row" style={{ alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
          {[top3[1], top3[0], top3[2]].map((r, i) => {
            if (!r) return <div key={i} className="grow" />;
            const isFirst = r.rank === 1;
            const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉';
            return (
              <div
                key={r.id}
                className={`card grow center ${isFirst ? 'card--gold' : ''}`}
                style={{ padding: '14px 6px', paddingTop: isFirst ? 18 : 14 }}
              >
                <div style={{ fontSize: isFirst ? 24 : 19, marginBottom: 4 }}>{medal}</div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                  <Avatar config={r.avatar} size={isFirst ? 52 : 42} ring={isFirst} />
                </div>
                <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </div>
                <div className="mono bold gold" style={{ fontSize: isFirst ? 22 : 18 }}>{r.total}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* 我的位置固定在顶部，不用滚动去找 */}
      {myRow && myRow.rank > 3 && (
        <>
          <div className="section-title">我的位置</div>
          <Row row={myRow} isMe identities={identities} stationCount={stationCount} />
          <div style={{ height: 12 }} />
        </>
      )}

      {rest.length > 0 && (
        <>
          <div className="section-title">全部排名</div>
          <div className="stack-sm">
            {rest.map((r) => <Row key={r.id} row={r} isMe={r.id === me?.id} identities={identities} stationCount={stationCount} />)}
          </div>
        </>
      )}

      <div className="center tiny dim" style={{ padding: '18px 0 0' }}>
        排名并列时按完成关卡数排序
      </div>
    </div>
  );
}

function Row({ row, isMe, identities, stationCount }) {
  const meta = identities?.[row.identity];
  return (
    <div className={`lb-row ${isMe ? 'lb-row--me' : ''}`}>
      <div className={`lb-rank lb-rank--${row.rank}`}>{row.rank}</div>
      <Avatar config={row.avatar} size={38} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.name}{isMe && <span className="gold"> · 我</span>}
        </div>
        <div className="tiny dim">
          {meta ? `${meta.icon} ${meta.name}` : '未抽身份'} · {row.stationsDone}/{stationCount} 关
          {row.lifeEventsTaken > 0 && ` · 🎲${row.lifeEventsTaken}`}
          {row.tokensLeft === 0 && ' · 🪙已用'}
        </div>
      </div>
      <div className="lb-score">{row.total}</div>
    </div>
  );
}
