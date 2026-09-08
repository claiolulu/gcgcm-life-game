import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, Score, useToast, ago } from '../components/ui.jsx';
import { useConfig, drawCardLocally } from '../lib/config.js';
import { useStaff, getPlayer, queueOp, leaderboardLocal } from '../lib/staff.js';
import { describeModifier } from '../lib/modifiers.js';

export default function StaffPlayer() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { config } = useConfig();
  const staff = useStaff();

  const player = useMemo(() => getPlayer(id), [id, staff.players, staff.outbox]); // eslint-disable-line
  const rankInfo = useMemo(() => {
    const board = leaderboardLocal();
    const row = board.find((r) => r.id === id);
    return { rank: row?.rank, of: board.length };
  }, [id, staff.players, staff.outbox]); // eslint-disable-line

  // 打卡本里同工盖的是「活动」，不是游戏关卡。
  // 两边共用同一张 events 表，所以后面的记分/盖章逻辑完全不用改
  const stations = config?.activities || [];
  const settings = config?.settings || {};

  const myStationId = staff.session?.station;
  const [stationId, setStationId] = useState(
    stations.some((s) => s.id === myStationId) ? myStationId : ''
  );
  const [note, setNote] = useState('');

  if (!player) {
    return (
      <div className="page page--wide">
        <div className="card center" style={{ padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🤔</div>
          <div className="bold">花名册里找不到这个人</div>
          <div className="small muted" style={{ margin: '8px 0 16px' }}>可能还没同步下来</div>
          <button className="btn btn--full" onClick={() => nav('/staff/scan')}>返回扫码</button>
        </div>
      </div>
    );
  }

  const station = stations.find((s) => s.id === stationId);
  const alreadyDone = stationId ? player.stations[stationId] : null;

  /**
   * 打卡：到了就盖章，不评分。
   *
   * 给 1 分是为了让总分等于「参加过几场」，不是打了个低分 ——
   * 印章上写「已参加」，不写分数档位（见 bookVals 的 isCheckin）。
   */
  async function submitCheckin() {
    if (!stationId) return;
    await queueOp({
      type: 'score',
      playerId: player.id,
      stationId,
      points: 1,
      checkin: true,
      note: note.trim(),
    });
    navigator.vibrate?.(60);
    toast(`${station?.name} 已盖章 · ${player.name}`, 'ok');
    setNote('');
  }

  return (
    <div className="page page--wide">
      <NetBar
        online={staff.online}
        connected={staff.connected}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      <button className="btn btn--sm btn--ghost" onClick={() => nav('/staff/scan')} style={{ marginBottom: 12 }}>
        ← 返回扫码
      </button>

      {/* ---------------------------- 选手信息 ---------------------------- */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <Avatar config={player.avatar} size={58} ring />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 18 }}>{player.name}</div>
            <div className="tiny dim mono">{player.code} 号{player.pin ? ` · 密码 ${player.pin}` : ''}</div>
            <div className="row wrap" style={{ gap: 5, marginTop: 5 }}>
              {rankInfo.rank && <span className="chip chip--gold">第 {rankInfo.rank} 名</span>}
            </div>
          </div>
          <div className="center">
            <Score value={player.total} size={32} />
            <div className="tiny dim">盖了几章</div>
          </div>
        </div>
      </div>

      {/* ---------------------------- 必读提醒 ---------------------------- */}
      <div className="stack" style={{ marginBottom: 12 }}>
        {/* 状态分两类：要你核实的和系统自动处理的。
            长得一样的话，同工扫一眼分不出哪条需要他动作 ——
            「下一关要带个新朋友」不核实就等于这张卡白抽了。 */}
        {player.modifiers?.map(describeModifier).map((m) => (
          m.kind === 'check' ? (
            <div key={m.id} className="alert-redline">
              <div style={{ fontSize: 26 }}>{m.icon}</div>
              <div className="grow">
                <div className="bold small">要你核实 · {m.label}</div>
                <div className="tiny" style={{ opacity: 0.9 }}>{m.text}</div>
                {m.action && (
                  <div className="tiny bold" style={{ marginTop: 4 }}>{m.action}</div>
                )}
              </div>
            </div>
          ) : (
            <div key={m.id} className="card card--tight row" style={{ gap: 9, borderColor: 'rgba(247,201,72,0.45)' }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div className="grow">
                <div className="small bold" style={{ color: 'var(--yellow)' }}>{m.label}</div>
                <div className="tiny muted">{m.text}</div>
                {m.action && <div className="tiny dim" style={{ marginTop: 2 }}>{m.action}</div>}
              </div>
            </div>
          )
        ))}

        {player.hasPending && (
          <div className="card card--tight small" style={{ color: 'var(--yellow)' }}>
            ⏳ 这位选手有 {player.pending.length} 条记分还没上传，分数是本地预估值
          </div>
        )}
      </div>

      {/* ---------------------------- 主线记分 ---------------------------- */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📍 活动盖章</div>

        <div className="opt-row" style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
          {stations.map((s) => {
            const done = !!player.stations[s.id];
            return (
              <button
                key={s.id}
                className={`opt ${stationId === s.id ? 'opt--on' : ''}`}
                onClick={() => setStationId(s.id)}
                style={{ height: 40, opacity: done ? 0.5 : 1 }}
              >
                {s.icon} {s.name}{done && ' ✓'}
              </button>
            );
          })}
        </div>

        {!stationId && <div className="small muted center" style={{ padding: '10px 0' }}>先选一场活动</div>}

        {stationId && alreadyDone && (
          <div className="card card--flat card--tight">
            <div className="small bold">这一关已经记过分了</div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {alreadyDone.points} 分
              {alreadyDone.operator && ` · ${alreadyDone.operator} 记录`}
              {alreadyDone.at && ` · ${ago(alreadyDone.at)}`}
              {alreadyDone.pending && ' · 待同步'}
            </div>
            <div className="tiny dim" style={{ marginTop: 5 }}>
              每站只有一次挑战机会。确实需要改分请找管理员。
            </div>
          </div>
        )}

        {stationId && !alreadyDone && (
          <>
            {station && (
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                <span className="bold">{station.tag}</span> · {station.desc || station.scoring}
              </div>
            )}
            {/* 打卡本的主操作就一下：到了就盖章。不评分 —— 来了就是来了 */}
            <button
              className="btn btn--primary btn--lg btn--full"
              onClick={submitCheckin}
              style={{ fontSize: 17 }}
            >
              ✓ 到了 · 盖章
            </button>
            <input
              className="input" value={note} maxLength={80}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（选填）：代签、迟到…"
            />
            <div className="tiny dim center">离线也能盖，会存在本地稍后自动上传</div>
          </>
        )}
      </div>

      {/* 已完成关卡一览 */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">已完成 {player.stationsDone}/{player.stationsTotal ?? stations.length}</div>
        <div className="stack-sm">
          {stations.filter((s) => player.stations[s.id]).map((s) => {
            const hit = player.stations[s.id];
            return (
              <div key={s.id} className="row-between small">
                <span>{s.icon} {s.name}</span>
                <span className="mono gold bold">
                  {hit.points}{hit.pending && <span className="dim"> ⏳</span>}
                </span>
              </div>
            );
          })}
          {player.stationsDone === 0 && <div className="small dim center">还没闯过任何一关</div>}
        </div>
      </div>

    </div>
  );
}

/* ---------------------------- 人生盲盒抽卡 ---------------------------- */
