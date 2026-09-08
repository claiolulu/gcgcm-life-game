import React, { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Empty, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { kvGet, kvSet } from '../lib/idb.js';
import { changesLeaderboard, onTick } from '../lib/realtime.js';
import { usePlayer } from '../lib/player.js';
import { useConfig } from '../lib/config.js';

export default function Leaderboard() {
  const { me } = usePlayer();
  const { config } = useConfig();
  const stationCount = (config?.activities || []).length;

  const [board, setBoard] = useState([]);
  const [state, setState] = useState({ online: navigator.onLine, at: 0, loading: true });
  const lastRequest = useRef(0);

  const load = useCallback(async () => {
    // 首次连接紧接着还会收到 hello；把一秒内的重复信号合成一次请求。
    const now = Date.now();
    if (now - lastRequest.current < 1200) return;
    lastRequest.current = now;
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
      if (changesLeaderboard(p.reason)) load();
    });

    // 不再每 20 秒轮询。WebSocket 有变化就推一个极小信号；用户从后台
    // 回来时再补拉一次，覆盖手机休眠期间错过事件的情况。
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return (
    <div className="page">
      <NetBar online={state.online} lastSyncedAt={state.at} />

      <div className="center" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Leaderboard</div>
        <h1 style={{ marginTop: 4 }}>参加排行</h1>
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
        <Empty icon="🏁" title="还没有人上榜" hint="等第一个章盖下去，这里就会热闹起来" />
      )}

      {board.length > 0 && (
        <div className="stack-sm">
          {board.map((r) => (
            <Row key={r.id} row={r} isMe={r.id === me?.id} stationCount={stationCount} />
          ))}
        </div>
      )}

      <div className="center tiny dim" style={{ padding: '18px 0 0' }}>
        参加场次相同时，先领护照的排前面
      </div>
    </div>
  );
}

function Row({ row, isMe, stationCount }) {
  return (
    <div className={`lb-row ${isMe ? 'lb-row--me' : ''}`}>
      <div className={`lb-rank lb-rank--${row.rank}`}>{row.rank}</div>
      <Avatar config={row.avatar} size={38} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.name}{isMe && <span className="gold"> · 我</span>}
        </div>
        <div className="tiny dim">参加过 {row.stationsDone}/{stationCount} 场</div>
      </div>
      <div className="lb-score">{row.total}</div>
    </div>
  );
}
