import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';
import QRCard from '../components/QRCard.jsx';
import { NetBar, Score, Sheet, StampGrid, useToast, useConfirm, useLocalState, ago } from '../components/ui.jsx';
import { useConfig } from '../lib/config.js';
import { usePlayer, updateProfile, signOut } from '../lib/player.js';
import { splitName } from './book/bookVals.js';

export default function Passport() {
  const nav = useNavigate();
  const toast = useToast();
  const { config } = useConfig();
  const { me, rank, of, online, connected, lastSyncedAt, loading } = usePlayer();

  const [qrBig, setQrBig] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pinShown, setPinShown] = useState(false);
  const [seenIdentity, setSeenIdentity] = useLocalState('mlg.identitySeen', null);

  const stations = config?.stations || [];
  const identities = config?.identities || {};
  const colors = config?.groupColors || [];
  const lobby = (config?.settings?.gameState ?? 'lobby') === 'lobby';

  const identityMeta = me?.identity ? identities[me.identity] : null;
  const showReveal = !!me?.identity && seenIdentity !== me.identity;
  const startStation = stations.find((s) => s.id === me?.startStation);

  if (loading && !me) {
    return (
      <div className="page center" style={{ paddingTop: '30vh' }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>🛂</div>
        <div className="muted">正在打开你的护照…</div>
      </div>
    );
  }
  if (!me) {
    nav('/', { replace: true });
    return null;
  }

  const teamColor = colors.find((c) => c.key === me.teamColor);

  return (
    <div className="page">
      <NetBar online={online} connected={connected} lastSyncedAt={lastSyncedAt} />

      {/* ------------------------- 护照本体 ------------------------- */}
      <div className="passport stack" style={{ marginBottom: 14 }}>
        <div className="row-between">
          <div>
            <div className="eyebrow">Life Passport</div>
            <div className="small gold bold" style={{ letterSpacing: '0.05em' }}>人生护照</div>
          </div>
          <div className="tiny dim mono">{config?.game?.church}</div>
        </div>

        <div className="row" style={{ gap: 14 }}>
          <Avatar config={me.avatar} size={68} ring />
          <div className="grow">
            <div className="bold" style={{ fontSize: 19 }}>{me.name}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {identityMeta ? (
                <span className="chip" style={{ borderColor: identityMeta.color, color: identityMeta.color }}>
                  {identityMeta.icon} {identityMeta.name}
                </span>
              ) : (
                <span className="chip">⏳ 等待抽取身份</span>
              )}
              {me.teamSymbol && teamColor && (
                <span className="chip" style={{ color: teamColor.hex, borderColor: teamColor.hex }}>
                  {teamColor.name}队 {me.teamSymbol}
                </span>
              )}
            </div>
          </div>
          {lobby && (
            <button className="btn btn--sm btn--ghost" onClick={() => setEditOpen(true)}>编辑</button>
          )}
        </div>

        <div className="divider" />

        {/* 二维码：全场最重要的东西 */}
        <div className="center stack" style={{ gap: 10 }}>
          <button onClick={() => setQrBig(true)} style={{ display: 'inline-block' }} aria-label="放大二维码">
            <QRCard code={me.code} size={188} />
          </button>
          <div className="code-plate">{me.code}</div>
          <div className="tiny dim">
            给工作人员扫这个码 · 点一下可放大<br />
            扫不出来就报你的编号「{me.code} 号」
          </div>
        </div>
      </div>

      {/* ------------------------- 分数与排名 ------------------------- */}
      <div className="card row-between" style={{ marginBottom: 12 }}>
        <div>
          <div className="tiny dim">当前总分</div>
          <Score value={me.total} size={42} />
        </div>
        <div className="center">
          <div className="tiny dim">排名</div>
          <div className="bold" style={{ fontSize: 21 }}>
            {rank ? `${rank}` : '—'}
            <span className="dim small" style={{ fontWeight: 400 }}> / {of || '—'}</span>
          </div>
        </div>
        <div className="center">
          <div className="tiny dim">已闯关</div>
          <div className="bold" style={{ fontSize: 21 }}>
            {me.stationsDone}<span className="dim small" style={{ fontWeight: 400 }}> / {me.stationsTotal}</span>
          </div>
        </div>
      </div>

      <div className="stack">
        {/* 红线警告：必须去抽人生盲盒 */}
        {me.pendingLifeEvents > 0 && (
          <div className="alert-redline">
            <div style={{ fontSize: 30 }}>🎲</div>
            <div className="grow">
              <div className="bold">你跨过红线了，必须去抽人生盲盒</div>
              <div className="small" style={{ opacity: 0.85 }}>
                暂停挑战，前往场地正中央的「人生盲盒」站
                {me.pendingLifeEvents > 1 && `（欠 ${me.pendingLifeEvents} 次）`}
              </div>
            </div>
          </div>
        )}

        {/* 身上挂着的状态效果 */}
        {me.modifiers?.length > 0 && (
          <div className="card card--tight stack-sm">
            <div className="section-title">⚡ 当前状态</div>
            {me.modifiers.map((m) => (
              <div key={m.id} className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 17 }}>🌀</span>
                <div className="grow">
                  <div className="small bold">{m.label}</div>
                  <div className="tiny muted">{m.text}</div>
                </div>
              </div>
            ))}
            <div className="tiny dim">下一次过关时自动生效并消除</div>
          </div>
        )}

        {/* 身份指引 */}
        {identityMeta && (
          <div className="card stack-sm">
            <div className="section-title">🪪 你的身份</div>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ fontSize: 26 }}>{identityMeta.icon}</div>
              <div className="grow">
                <div className="bold">{identityMeta.name} · {identityMeta.cn}</div>
                <div className="tiny muted" style={{ marginTop: 3, lineHeight: 1.55 }}>{identityMeta.trait}</div>
              </div>
            </div>
            {me.identity !== 'solo' && me.teamSymbol && teamColor && (
              <div className="card card--flat card--tight" style={{ marginTop: 4 }}>
                <div className="small">
                  去场内找到同样是
                  <span className="bold" style={{ color: teamColor.hex }}> {teamColor.name}色 {me.teamSymbol} </span>
                  的人组队 —— {me.identity === 'duo' ? '还有 1 位' : '还有 2 位'}
                </div>
              </div>
            )}
            {me.identity === 'solo' && (
              <div className="tiny muted">你是独行侠，不用找队友。记忆站、套圈、寂静图书馆是你的优势关。</div>
            )}
            {startStation && (
              <div className="small muted" style={{ marginTop: 2 }}>
                建议从 <span className="gold bold">{startStation.icon} {startStation.name}</span> 开始，避免开局挤在一起
              </div>
            )}
          </div>
        )}

        {/* 关卡盖章 */}
        <div className="card stack-sm">
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>🗺 闯关进度</div>
            <span className="tiny dim">{me.stationsDone}/{me.stationsTotal}</span>
          </div>
          <StampGrid
            stations={stations}
            done={me.stations}
            onTap={(s, hit) =>
              toast(
                hit
                  ? `${s.name}：${hit.points} 分${hit.operator ? `（${hit.operator} 记录）` : ''}`
                  : `${s.name} · ${s.tag}｜${s.rule}`,
                hit ? 'ok' : 'warn',
                4500
              )
            }
          />
          <div className="tiny dim">点一下格子看关卡规则。每站只有一次挑战机会。</div>
        </div>

        {/* Help Token */}
        <div className="card row" style={{ gap: 12 }}>
          <div style={{ fontSize: 30, opacity: me.tokensLeft > 0 ? 1 : 0.3 }}>🪙</div>
          <div className="grow">
            <div className="bold small">Help Token · {me.tokensLeft > 0 ? '尚未使用' : '已经用掉'}</div>
            <div className="tiny muted" style={{ marginTop: 2, lineHeight: 1.5 }}>
              {me.tokensLeft > 0
                ? '卡关、失败、或者抽到大凶的时候，可以拿它去恩典站换一次帮助或重来的机会。'
                : '你已经在恩典站用掉了它。You don\'t have to do life alone.'}
            </div>
          </div>
          <span className={`chip ${me.tokensLeft > 0 ? 'chip--gold' : ''}`}>{me.tokensLeft}</span>
        </div>

        {/* 下一条红线 */}
        {me.nextThreshold != null && (
          <div className="card card--flat card--tight center">
            <span className="small muted">
              距离下一条人生红线（{me.nextThreshold} 分）还差
              <span className="gold bold"> {me.nextThreshold - me.total} </span>分
            </span>
          </div>
        )}

        {/* 换手机 / 清缓存时才用得上，平时收起来 */}
        <div className="card stack-sm">
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>🔑 我的登录信息</div>
            <button className="btn btn--sm btn--ghost" onClick={() => setPinShown((v) => !v)}>
              {pinShown ? '隐藏' : '显示密码'}
            </button>
          </div>
          <div className="row-between">
            <span className="small muted">编号</span>
            <span className="mono bold gold" style={{ fontSize: 19 }}>{me.code}</span>
          </div>
          <div className="row-between">
            <span className="small muted">4 位密码</span>
            <span className="mono bold" style={{ fontSize: 19, letterSpacing: '0.18em' }}>
              {pinShown ? (me.pin || '—') : '••••'}
            </span>
          </div>
          <div className="tiny dim">
            平时不用管它。只有换了手机、或者清了浏览器缓存打不开护照时，
            才需要用这两个把护照找回来。建议截个图存着。
          </div>
        </div>

        <button className="btn btn--ghost btn--full" onClick={() => setHistoryOpen(true)}>
          📜 查看我的人生轨迹（{me.history?.length || 0} 条）
        </button>

        <div className="center tiny dim" style={{ padding: '6px 0 2px' }}>
          数据更新于 {ago(lastSyncedAt)}
        </div>
      </div>

      {/* ------------------------------ 弹层 ------------------------------ */}

      <Sheet open={qrBig} onClose={() => setQrBig(false)} title="出示给工作人员">
        <div className="center stack">
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <QRCard code={me.code} size={280} />
          </div>
          <div className="code-plate" style={{ fontSize: 34 }}>{me.code}</div>
          <div className="small muted">把手机亮度调到最高会更容易扫上</div>
          <button className="btn btn--full" onClick={() => setQrBig(false)}>关闭</button>
        </div>
      </Sheet>

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={me.history}
        stations={stations}
        cardKinds={config?.cardKinds}
      />

      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} me={me} />

      <IdentityReveal
        open={showReveal}
        identity={identityMeta}
        teamColor={teamColor}
        teamSymbol={me.teamSymbol}
        isSolo={me.identity === 'solo'}
        startStation={startStation}
        onClose={() => setSeenIdentity(me.identity)}
      />
    </div>
  );
}

/* ------------------------------ 人生轨迹 ------------------------------ */

function HistorySheet({ open, onClose, history = [], stations = [], cardKinds = {} }) {
  const stationName = (id) => stations.find((s) => s.id === id)?.name || id;
  const rows = [...history].reverse();

  return (
    <Sheet open={open} onClose={onClose} title="我的人生轨迹">
      <div className="stack-sm">
        {rows.length === 0 && <div className="center muted small" style={{ padding: 24 }}>还没有记录，去闯第一关吧</div>}
        {rows.map((e) => {
          const kind = e.meta?.kind;
          const tone = cardKinds?.[kind];
          return (
            <div key={e.id} className="card card--flat card--tight row" style={{ gap: 10 }}>
              <div style={{ fontSize: 19 }}>
                {e.kind === 'station' ? '📍' : e.kind === 'life_event' ? (tone?.icon || '🎲') : e.kind === 'grace' ? '✝️' : '✏️'}
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">
                  {e.kind === 'station' ? stationName(e.stationId) : e.label}
                </div>
                <div className="tiny dim">
                  {e.meta?.effectText || e.note || e.operator || ''}
                  {e.operator && e.kind === 'station' ? ` · ${e.operator}` : ''}
                </div>
              </div>
              <div
                className="mono bold"
                style={{
                  fontSize: 15,
                  color: e.points > 0 ? 'var(--green)' : e.points < 0 ? 'var(--red)' : 'var(--text-3)',
                }}
              >
                {e.points > 0 ? '+' : ''}{e.points || '—'}
              </div>
            </div>
          );
        })}
        <button className="btn btn--full" onClick={onClose} style={{ marginTop: 6 }}>关闭</button>
      </div>
    </Sheet>
  );
}

/* ------------------------------ 编辑资料 ------------------------------ */

function EditSheet({ open, onClose, me }) {
  const toast = useToast();
  const ask = useConfirm();
  const [name, setName] = useState(me.name);
  const [surname, setSurname] = useState(me.surname || '');
  const [given, setGiven] = useState(me.given || '');
  const [avatar, setAvatar] = useState(me.avatar);
  // 两个输入框的占位提示：不填的话护照上会印成什么
  const guess = useMemo(() => splitName(name), [name]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(me.name); setAvatar(me.avatar); }
  }, [open, me.name, me.avatar]);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), surname: surname.trim(), given: given.trim(), avatar });
      toast('已保存', 'ok');
      onClose();
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="编辑我的护照">
      <div className="stack">
        <AvatarEditor value={avatar} onChange={setAvatar} size={110} />
        <div className="field">
          <label className="label">名字</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        </div>
        <div className="field">
          <label className="label">护照上的姓 / 名（选填）</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input grow" value={surname} maxLength={24} aria-label="护照上的姓"
              onChange={(e) => setSurname(e.target.value)} placeholder={guess.surname || '姓'}
            />
            <input
              className="input grow" value={given} maxLength={24} aria-label="护照上的名"
              onChange={(e) => setGiven(e.target.value)} placeholder={guess.given || '名'}
            />
          </div>
          <div className="tiny dim">留空就按上面的名字猜，复姓、双名容易猜错</div>
        </div>
        <div className="tiny dim">游戏一旦开始，护照信息就会锁定，不能再改。</div>
        <button className="btn btn--primary btn--full" disabled={busy} onClick={save}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          className="btn btn--ghost btn--full"
          onClick={async () => {
            const ok = await ask({
              title: '退出这本护照？',
              danger: true, confirmText: '退出护照',
              body: '之后需要用编号 + 4 位密码才能找回。建议先截个图存下来。',
            });
            if (ok) signOut();
          }}
        >
          退出这本护照
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------ 身份揭晓 ------------------------------ */

function IdentityReveal({ open, identity, teamColor, teamSymbol, isSolo, startStation, onClose }) {
  if (!identity) return null;
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="center stack card-reveal">
        <div className="eyebrow">你的人生起点</div>
        <div style={{ fontSize: 60 }}>{identity.icon}</div>
        <h1 style={{ color: identity.color }}>{identity.name}</h1>
        <div className="bold">{identity.cn}</div>
        <div className="small muted" style={{ lineHeight: 1.7, padding: '0 6px' }}>{identity.trait}</div>

        {!isSolo && teamColor && teamSymbol && (
          <div className="card card--gold" style={{ width: '100%' }}>
            <div className="small">现在去场内找到同样是</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: teamColor.hex, margin: '6px 0' }}>
              {teamColor.name}色 {teamSymbol}
            </div>
            <div className="small">的人，你们就是一队</div>
          </div>
        )}
        {isSolo && (
          <div className="card card--flat" style={{ width: '100%' }}>
            <div className="small">你独自上路。记忆站、套圈、寂静图书馆是你的主场。</div>
          </div>
        )}

        {startStation && (
          <div className="small muted">建议先去 {startStation.icon} {startStation.name}</div>
        )}

        <div className="tiny dim" style={{ fontStyle: 'italic', padding: '4px 10px' }}>「{identity.verse}」</div>
        <button className="btn btn--primary btn--full" onClick={onClose}>开始我的人生 →</button>
      </div>
    </Sheet>
  );
}
