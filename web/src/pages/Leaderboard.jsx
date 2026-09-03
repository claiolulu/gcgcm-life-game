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

  const [teams, setTeams] = useState([]);
  const [state, setState] = useState({ online: navigator.onLine, connected: false, at: 0, loading: true });

  const load = useCallback(async () => {
    try {
      const res = await api('/api/leaderboard', { timeout: 7000 });
      setBoard(res.board || []);
      setTeams(res.teams || []);
      await kvSet('leaderboard', { board: res.board, teams: res.teams, at: Date.now() });
      setState((s) => ({ ...s, online: true, at: Date.now(), loading: false }));
    } catch {
      const cached = await kvGet('leaderboard');
      if (cached?.board) {
        setBoard(cached.board);
        setTeams(cached.teams || []);
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

  const colors = config?.groupColors || [];
  const myTeam = teams.find((t) => t.members.some((m) => m.id === me?.id));

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

      {/* 前三名：靠头像堆和字号区分高低，不用奖牌 emoji ——
          一行要放三个人的头像，再加个奖牌就没地方了 */}
      {teams.length > 0 && (
        <div className="row" style={{ alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
          {[teams[1], teams[0], teams[2]].map((t, i) => {
            if (!t) return <div key={i} className="grow" />;
            const isFirst = t === teams[0];
            const mine = t.members.some((m) => m.id === me?.id);
            return (
              <div
                key={t.key}
                className={`card grow center ${isFirst ? 'card--gold' : ''}`}
                style={{ padding: isFirst ? '15px 7px' : '11px 7px' }}
              >
                <div className="team-faces" style={{ justifyContent: 'center', marginBottom: 7 }}>
                  {t.members.slice(0, 3).map((m) => (
                    <Avatar key={m.id} config={m.avatar} size={isFirst ? 42 : 33} />
                  ))}
                </div>
                <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.symbol} {teamLabel(t, colorName(t, colors))}
                </div>
                <div className="tiny dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.members.map((m) => m.name).join(' · ')}
                </div>
                <div className="mono bold gold" style={{ fontSize: isFirst ? 22 : 18, marginTop: 4 }}>{t.avg}</div>
                <div className="tiny dim">人均{mine ? ' · 我们' : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {myTeam && myTeam.rank > 3 && (
        <>
          <div className="section-title">我的队伍</div>
          <TeamRow t={myTeam} meId={me?.id} colors={colors} />
          <div style={{ height: 12 }} />
        </>
      )}

      {teams.length > 3 && (
        <>
          <div className="section-title">全部队伍</div>
          <div className="stack-sm">
            {teams.slice(3).map((t) => (
              <TeamRow key={t.key} t={t} meId={me?.id} colors={colors} />
            ))}
          </div>
        </>
      )}

      {/* 个人分单列一处：最高积分奖判的是个人总分，组队榜取代不了 */}
      {board.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary className="small dim" style={{ cursor: 'pointer' }}>
            按个人总分看（最高积分奖用这个）
          </summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {board.map((r) => (
              <div key={r.id} className={`lb-row ${r.id === me?.id ? 'lb-row--me' : ''}`}>
                <div className={`lb-rank lb-rank--${r.rank}`}>{r.rank}</div>
                <Avatar config={r.avatar} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                  </div>
                </div>
                <div className="lb-score">{r.total}</div>
              </div>
            ))}
          </div>
        </details>
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

/** 队伍色的中文名，比如「赤」。改过队名的队伍不需要它 */
function colorName(t, colors) {
  return (colors || []).find((c) => c.key === t.color)?.name || '';
}

/**
 * 显示用的队名：队员自己改过就用他们的，没改过就按颜色生成一个默认的。
 * 一个人的队（Solo 或还没编队）直接用本人名字 —— 「赤队」只有一个人很怪。
 */
function teamLabel(t, cname) {
  if (t.name) return t.name;
  if (t.size === 1) return t.members[0].name;
  return cname ? `${cname}队` : '未命名队';
}

/**
 * 一队一行。信息分两层，避免挤成一排省略号：
 *   上层  符号 + 队名 + 人数标签        —— 扫一眼找自己
 *   下层  头像叠排 + 队员名字            —— 看清是哪几个人
 * 下层放不下就自己横向滚，不挤压上层。
 */
function TeamRow({ t, meId, colors }) {
  const mine = t.members.some((m) => m.id === meId);
  const hex = (colors || []).find((c) => c.key === t.color)?.hex;
  return (
    <div className={`team-row ${mine ? 'team-row--me' : ''}`}>
      <div className={`team-rank team-rank--${t.rank}`}>{t.rank}</div>

      <div className="team-main">
        <div className="team-title">
          {t.symbol && <span className="team-symbol" style={{ color: hex }}>{t.symbol}</span>}
          <span className="team-name" style={mine ? { color: 'var(--gold)' } : undefined}>
            {teamLabel(t, colorName(t, colors))}
          </span>
          {t.size > 1 && <span className="team-size">{t.size} 人</span>}
        </div>

        <div className="team-members">
          <div className="team-faces">
            {t.members.map((m) => <Avatar key={m.id} config={m.avatar} size={26} />)}
          </div>
          <div className="team-names">
            {t.members.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ' · '}
                {m.id === meId ? <b>{m.name}</b> : m.name}
                <span style={{ opacity: 0.6 }}> {m.total}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="team-score">
        <div>{t.avg}</div>
        <div>{t.size > 1 ? '人均' : '总分'}</div>
      </div>
    </div>
  );
}
