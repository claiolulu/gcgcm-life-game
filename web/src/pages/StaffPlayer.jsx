import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, Score, useToast, ago } from '../components/ui.jsx';
import { useConfig, drawCardLocally } from '../lib/config.js';
import { useStaff, getPlayer, queueOp, leaderboardLocal } from '../lib/staff.js';

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

  const stations = config?.stations || [];
  const settings = config?.settings || {};
  const tiers = settings.scoreTiers || [3, 6, 9];
  const tierLabels = config?.tierLabels || ['勉强完成', '正常完成', '出色完成'];
  const identities = config?.identities || {};

  const myStationId = staff.session?.station;
  const isFunctional = myStationId === 'life_event' || myStationId === 'jesus';
  const [stationId, setStationId] = useState(
    stations.some((s) => s.id === myStationId) ? myStationId : ''
  );
  const [tier, setTier] = useState(null);
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState(null); // life_event | grace | adjust
  const [drawn, setDrawn] = useState(null);

  useEffect(() => {
    if (isFunctional) setSheet(myStationId);
  }, [isFunctional, myStationId]);

  if (!player) {
    return (
      <div className="page">
        <div className="card center" style={{ padding: 30 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🤔</div>
          <div className="bold">花名册里找不到这个人</div>
          <div className="small muted" style={{ margin: '8px 0 16px' }}>可能还没同步下来</div>
          <button className="btn btn--full" onClick={() => nav('/staff/scan')}>返回扫码</button>
        </div>
      </div>
    );
  }

  const identity = identities[player.identity];
  const station = stations.find((s) => s.id === stationId);
  const alreadyDone = stationId ? player.stations[stationId] : null;

  async function submitScore() {
    if (!stationId || tier == null) return;
    await queueOp({
      type: 'score',
      playerId: player.id,
      stationId,
      points: tier,
      note: note.trim(),
    });
    navigator.vibrate?.([40, 40, 40]);
    toast(`${station?.name} 记 ${tier} 分 · ${player.name}`, 'ok');
    setTier(null);
    setNote('');
    nav('/staff/scan');
  }

  return (
    <div className="page">
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
              {identity && (
                <span className="chip" style={{ borderColor: identity.color, color: identity.color }}>
                  {identity.icon} {identity.name}
                </span>
              )}
              {rankInfo.rank && <span className="chip chip--gold">第 {rankInfo.rank} 名</span>}
            </div>
          </div>
          <div className="center">
            <Score value={player.total} size={32} />
            <div className="tiny dim">总分</div>
          </div>
        </div>

        {/* 「分数高者优先排队」需要工作人员一眼看到名次 */}
        {rankInfo.rank && rankInfo.rank <= 5 && (
          <div className="small" style={{ color: 'var(--gold)' }}>
            🏃 高分选手（第 {rankInfo.rank} 名），可优先排队
          </div>
        )}
      </div>

      {/* ---------------------------- 必读提醒 ---------------------------- */}
      <div className="stack" style={{ marginBottom: 12 }}>
        {player.pendingLifeEvents > 0 && (
          <div className="alert-redline">
            <div style={{ fontSize: 26 }}>🎲</div>
            <div className="grow">
              <div className="bold small">这位选手欠 {player.pendingLifeEvents} 次人生盲盒</div>
              <div className="tiny" style={{ opacity: 0.85 }}>请先让他去场地中央抽盲盒，再继续闯关</div>
            </div>
          </div>
        )}

        {player.modifiers?.map((m) => (
          <div key={m.id} className="card card--tight row" style={{ gap: 9, borderColor: 'rgba(247,201,72,0.45)' }}>
            <span style={{ fontSize: 20 }}>🌀</span>
            <div className="grow">
              <div className="small bold" style={{ color: 'var(--yellow)' }}>{m.label}</div>
              <div className="tiny muted">{m.text}</div>
            </div>
          </div>
        ))}

        {player.hasPending && (
          <div className="card card--tight small" style={{ color: 'var(--yellow)' }}>
            ⏳ 这位选手有 {player.pending.length} 条记分还没上传，分数是本地预估值
          </div>
        )}
      </div>

      {/* ---------------------------- 主线记分 ---------------------------- */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📍 主线关卡记分</div>

        <div className="opt-row" style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
          {stations.map((s) => {
            const done = !!player.stations[s.id];
            return (
              <button
                key={s.id}
                className={`opt ${stationId === s.id ? 'opt--on' : ''}`}
                onClick={() => { setStationId(s.id); setTier(null); }}
                style={{ height: 40, opacity: done ? 0.5 : 1 }}
              >
                {s.icon} {s.name}{done && ' ✓'}
              </button>
            );
          })}
        </div>

        {!stationId && <div className="small muted center" style={{ padding: '10px 0' }}>先选一个关卡</div>}

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
                <span className="bold">{station.tag}</span> · {station.scoring}
              </div>
            )}
            <div className="tier-grid">
              {tiers.map((t, i) => (
                <button
                  key={t}
                  className={`tier tier--${i + 1} ${tier === t ? 'tier--on' : ''}`}
                  onClick={() => setTier(t)}
                >
                  <span className="tier__n">{t}</span>
                  <span className="tier__l">{tierLabels[i] || ''}</span>
                </button>
              ))}
            </div>

            <div className="row" style={{ gap: 8 }}>
              {[0, 1].map((v) => (
                <button
                  key={v}
                  className={`btn btn--sm grow ${tier === v ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setTier(v)}
                >
                  {v === 0 ? '0 分 · 挑战失败' : '1 分 · 安慰分'}
                </button>
              ))}
            </div>

            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（选填）：表现亮点、扣分原因…"
              maxLength={80}
            />

            <button
              className="btn btn--primary btn--lg btn--full"
              disabled={tier == null}
              onClick={submitScore}
            >
              {tier == null ? '请先选择分数' : `确认给 ${player.name} 记 ${tier} 分`}
            </button>
            <div className="tiny dim center">离线也能记，会存在本地稍后自动上传</div>
          </>
        )}
      </div>

      {/* ---------------------------- 功能站 ---------------------------- */}
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className="btn grow" onClick={() => { setDrawn(null); setSheet('life_event'); }}>
          🎲 人生盲盒
        </button>
        <button className="btn grow" onClick={() => setSheet('jesus')} disabled={player.tokensLeft <= 0}>
          ✝️ 恩典站 {player.tokensLeft > 0 ? `(${player.tokensLeft})` : '(已用)'}
        </button>
      </div>

      {staff.session?.role === 'admin' && (
        <button className="btn btn--ghost btn--full" onClick={() => setSheet('adjust')}>
          ✏️ 管理员手动调分
        </button>
      )}

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

      <LifeEventSheet
        open={sheet === 'life_event'}
        onClose={() => { setSheet(null); setDrawn(null); }}
        player={player}
        config={config}
        drawn={drawn}
        setDrawn={setDrawn}
        onDone={() => { setSheet(null); setDrawn(null); nav('/staff/scan'); }}
      />

      <GraceSheet
        open={sheet === 'jesus'}
        onClose={() => setSheet(null)}
        player={player}
        config={config}
        onDone={() => { setSheet(null); nav('/staff/scan'); }}
      />

      <AdjustSheet
        open={sheet === 'adjust'}
        onClose={() => setSheet(null)}
        player={player}
        onDone={() => setSheet(null)}
      />
    </div>
  );
}

/* ---------------------------- 人生盲盒抽卡 ---------------------------- */

function LifeEventSheet({ open, onClose, player, config, drawn, setDrawn, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const kinds = config?.cardKinds || {};

  function draw() {
    const card = drawCardLocally(config?.cards);
    if (!card) return toast('卡牌配置没加载出来', 'err');
    navigator.vibrate?.([30, 60, 30]);
    setDrawn(card);
  }

  /** 界面上先给个预估值；倍率的最终结果由服务端用权威总分重算 */
  function provisional(card) {
    if (!card) return 0;
    if (card.effect.type === 'add') return card.effect.points;
    if (card.effect.type === 'multiply') {
      const base = player.total;
      if (base <= 0) return 0;
      const f = card.effect.factor;
      return (f < 1 ? Math.floor(base * f) : Math.round(base * f)) - base;
    }
    return 0;
  }

  async function apply() {
    if (!drawn) return;
    setBusy(true);
    try {
      await queueOp({
        type: 'life_event',
        playerId: player.id,
        cardId: drawn.id,
        provisionalPoints: provisional(drawn),
      });
      toast(`${player.name} 抽到「${drawn.title}」`, 'ok');
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  const tone = drawn ? kinds[drawn.kind] : null;
  const delta = provisional(drawn);

  return (
    <Sheet open={open} onClose={onClose} title={drawn ? null : '🎲 人生盲盒'}>
      {!drawn ? (
        <div className="stack center">
          <div className="small muted">
            {player.name} 当前 {player.total} 分
            {player.pendingLifeEvents > 0 && ` · 欠 ${player.pendingLifeEvents} 次盲盒`}
          </div>
          <div style={{ fontSize: 64, padding: '14px 0' }}>🎁</div>
          <div className="small muted">让选手自己点这个按钮，仪式感更强</div>
          <button className="btn btn--primary btn--lg btn--full" onClick={draw}>抽一张人生卡牌</button>
          <button className="btn btn--ghost btn--full" onClick={onClose}>取消</button>
        </div>
      ) : (
        <div className="stack center card-reveal">
          <div className="chip" style={{ borderColor: tone?.color, color: tone?.color }}>
            {tone?.icon} {tone?.cn} · {tone?.label}
          </div>
          <h1 style={{ color: tone?.color, marginTop: 6 }}>{drawn.title}</h1>
          <div className="small muted" style={{ lineHeight: 1.7, padding: '0 8px' }}>{drawn.desc}</div>

          <div className="card card--gold" style={{ width: '100%' }}>
            <div className="tiny dim">卡牌效果</div>
            <div className="bold" style={{ fontSize: 17, margin: '4px 0' }}>{drawn.effectText}</div>
            {drawn.effect.type !== 'modifier' && drawn.effect.type !== 'swap_queue' && (
              <div className="mono" style={{ fontSize: 22, color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {player.total} → {player.total + delta}
                <span className="small"> （{delta >= 0 ? '+' : ''}{delta}）</span>
              </div>
            )}
          </div>

          <button className="btn btn--primary btn--lg btn--full" disabled={busy} onClick={apply}>
            {busy ? '记录中…' : '确认应用这张卡'}
          </button>
          <button className="btn btn--ghost btn--full" onClick={() => setDrawn(null)} disabled={busy}>
            重新抽（慎用）
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------ 恩典站 ------------------------------ */

function GraceSheet({ open, onClose, player, config, onDone }) {
  const toast = useToast();
  const [option, setOption] = useState(null);
  const [busy, setBusy] = useState(false);
  const options = config?.graceOptions || [];

  async function apply() {
    if (!option) return;
    setBusy(true);
    try {
      await queueOp({ type: 'grace', playerId: player.id, option, points: 0 });
      toast(`${player.name} 使用了 Help Token`, 'ok');
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="✝️ 恩典站">
      <div className="stack">
        <div className="small muted">
          收下 {player.name} 的 Help Token，二选一提供帮助，并给他一张 Grace Card。
        </div>

        {options.map((o) => (
          <button
            key={o.id}
            className={`card card--tight ${option === o.id ? 'card--gold' : ''}`}
            onClick={() => setOption(o.id)}
            style={{ textAlign: 'left', width: '100%' }}
          >
            <div className="row" style={{ gap: 10 }}>
              <span style={{ fontSize: 24 }}>{o.icon}</span>
              <div className="grow">
                <div className="bold small">{o.name}</div>
                <div className="tiny muted">{o.desc}</div>
              </div>
              {option === o.id && <span className="gold">✓</span>}
            </div>
          </button>
        ))}

        <div className="card card--flat card--tight center">
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            记得念给他听：<br />
            <span className="gold">「我的恩典够你用的」</span><br />
            You don't have to do life alone.
          </div>
        </div>

        <button className="btn btn--primary btn--full" disabled={!option || busy} onClick={apply}>
          {busy ? '记录中…' : '确认收下 Token'}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------------------- 管理员调分 ---------------------------- */

function AdjustSheet({ open, onClose, player, onDone }) {
  const toast = useToast();
  const [points, setPoints] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!points) return;
    setBusy(true);
    try {
      await queueOp({
        type: 'adjust',
        playerId: player.id,
        points: Number(points),
        label: '手动调整',
        note: reason.trim(),
      });
      toast(`已为 ${player.name} 调整 ${points > 0 ? '+' : ''}${points} 分`, 'ok');
      setPoints(0); setReason('');
      onDone?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="✏️ 手动调分">
      <div className="stack">
        <div className="small muted">
          调分会作为一条新记录追加进人生轨迹，不会覆盖原有记录，赛后可追溯。
        </div>
        <div className="row" style={{ gap: 8 }}>
          {[-9, -5, -3, -1, 1, 3, 5, 9].map((v) => (
            <button
              key={v}
              className={`btn btn--sm grow ${points === v ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setPoints(v)}
              style={{ padding: 0 }}
            >
              {v > 0 ? `+${v}` : v}
            </button>
          ))}
        </div>
        <input
          className="input"
          type="number"
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          placeholder="或直接输入分数"
        />
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="调整原因（建议填写）"
          maxLength={80}
        />
        <button className="btn btn--primary btn--full" disabled={!points || busy} onClick={apply}>
          确认调整 {points > 0 ? `+${points}` : points} 分
        </button>
      </div>
    </Sheet>
  );
}
