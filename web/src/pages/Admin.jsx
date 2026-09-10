import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { onTick } from '../lib/realtime.js';
import { useStaff, flush, logout, allPlayers, leaderboardLocal, applyRoster, queueOp } from '../lib/staff.js';

const ACT_STATE = {
  upcoming: { icon: '🗓', label: '还没到' },
  live:     { icon: '🎯', label: '进行中' },
  done:     { icon: '✅', label: '已办完' },
};

export default function Admin() {
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;
  const [busy, setBusy] = useState(null);
  const [picked, setPicked] = useState([]);        // 花名册里勾选的人
  const [manualOpen, setManualOpen] = useState(false);

  const settings = config?.settings || {};
  const resetPin = config?.resetPin || '3927';
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line
  const board = useMemo(() => leaderboardLocal(), [staff.players, staff.outbox]); // eslint-disable-line

  /* -------------------------- 活动清单 -------------------------- */
  //
  // 总控台只留一份索引，点进去才是这一场的全部（见 ActivityDetail）。
  // 所以这里只需要两件事：每场盖了多少章，以及新建一场。

  const activities = config?.activities || [];

  // 报名数不在 /api/config 里 —— 那份是缓存住的静态配置，而报名随时在变
  const [signupCount, setSignupCount] = useState({});
  useEffect(() => {
    if (!token) return;
    const pull = () => api('/api/admin/signups', { token })
      .then((r) => setSignupCount(r.counts || {})).catch(() => {});
    pull();
    const off = onTick((p) => { if (p.reason === 'signup') pull(); });
    const timer = setInterval(pull, 30_000);
    return () => { off(); clearInterval(timer); };
  }, [token]);

  const stampCount = useMemo(() => {
    const n = {};
    for (const p of players) {
      for (const id of Object.keys(p.stations || {})) n[id] = (n[id] || 0) + 1;
    }
    return n;
  }, [players]);

  /**
   * 新建一场，存好之后直接进详情页。
   *
   * 不在清单里留一张待填的空卡片 —— 那样同工得先填完再想起来点保存，
   * 而这一步真正想做的事（填它）在详情页里。
   *
   * id 一旦建立就不再改：盖过的章靠它认领归属。用时间戳生成，避免撞上。
   */
  async function addAct() {
    const id = `act-${Date.now().toString(36)}`;
    setBusy('acts');
    try {
      const res = await api('/api/admin/activities', {
        method: 'POST',
        body: {
          activities: [...activities, {
            id, icon: '📍', name: '新活动', en: '', date: '', tag: '', host: '',
            desc: '', landmarkKey: '', photo: '', links: [], state: 'upcoming',
          }],
        },
        token,
      });
      await loadConfig();
      const made = res.activities.find((a) => a.id === id);
      // 新建完先进基本信息页：名字、日期、负责人这些是这一场的底子，
      // 版式是在这些填完之后才谈得上的事。详情页上有「设计这一页」的入口
      nav(`/staff/admin/a/${made ? made.id : id}`);
    } catch (err) {
      toast(err.message || '加不上', 'err');
    } finally {
      setBusy(null);
    }
  }

  // 「签证页模版」这个全局选项去掉了：每一场的版式在它自己的画布编辑器里排
  // （/staff/admin/a/<id>/design），默认版式是代码里的常量，不再是一个要人维护
  // 的设置。多一个「模版」只会让人先去改模版、发现某一场没跟着变、再回来找原因。

  // 「护照模版」搬到选手自己的资料页去了（护照页右上角的「✎ 自定义」）——
  // 一本用一年的册子，配色本来就该各人不同，不该全场一个样子。

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  async function patchSettings(patch, label) {
    setBusy(label);
    try {
      await api('/api/admin/settings', { method: 'POST', body: patch, token });
      await loadConfig();
      toast('设置已更新', 'ok');
    } catch (err) {
      toast(err.message || '更新失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  // 同名的多半是「忘了密码又报了一次」。报名时已经拦过一道，
  // 但选手可能点了「不是我」，所以这里再列出来让同工核对。
  const duplicates = useMemo(() => {
    const byName = {};
    players.forEach((p) => { (byName[p.name] = byName[p.name] || []).push(p); });
    return Object.entries(byName)
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => ({ name, list: list.sort((a, b) => a.code.localeCompare(b.code)) }));
  }, [players]);


  /** 把勾选的人的密码统一重置成 3927 */
  async function resetPinPicked() {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    const names = picked.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    const ok = await ask({
      title: `重置 ${picked.length} 人的密码？`,
      confirmText: `重置为 ${resetPin}`,
      body: `${names.join('、')}\n\n密码会统一变成 ${resetPin}，原密码立即失效。` +
            '\n告诉他们用原来的编号 + 这个密码找回护照，不要重新报名。',
    });
    if (!ok) return;
    setBusy('pin');
    try {
      const res = await api('/api/admin/reset-pin', { method: 'POST', body: { playerIds: picked }, token });
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`${res.players.map((p) => p.code + ' 号').join('、')} 的密码已重置为 ${res.pin}`, 'ok', 6000);
      setPicked([]);
    } catch (err) {
      toast(err.message || '重置失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* ---------------------- 选手详情 ---------------------- */

  const [detail, setDetail] = useState(null);      // 点开的那个人的 id
  const [signupMap, setSignupMap] = useState({});  // 活动 id → 报了名的人 id 集合
  const detailPlayer = detail ? players.find((x) => x.id === detail) : null;

  // 报名名单要按人看，而接口是按活动给的，所以整份拉回来自己倒排一次。
  // 活动就几场，比给每个人单独发一次请求省事
  useEffect(() => {
    if (!token || !detail) return;
    let dead = false;
    (async () => {
      const out = {};
      for (const a of activities) {
        try {
          const r = await api(`/api/admin/activity/${a.id}/signups`, { token });
          out[a.id] = new Set((r.signups || []).map((x) => x.id));
        } catch { out[a.id] = new Set(); }
      }
      if (!dead) setSignupMap(out);
    })();
    return () => { dead = true; };
  }, [token, detail, activities]);

  /**
   * 替某人把一场活动标成已参加。
   *
   * 走的是同工端那条盖章通道（queueOp），所以离线也排得住、重复点也只算
   * 一次（服务端那条「一场只盖一次」的唯一索引挡着）。
   * 给 1 分是为了让总分等于「参加过几场」，章上写的是「已参加」。
   */
  async function markDone(playerId, stationId, name) {
    setBusy(`done-${stationId}`);
    try {
      await queueOp({ type: 'score', playerId, stationId, points: 1, checkin: true, note: '总控台补录' });
      toast(`${name} 已标记为参加`, 'ok');
    } catch (err) {
      toast(err.message || '标记失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const togglePick = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));


  function download(path, filename) {
    // 带鉴权头的下载没法直接用 <a href>，先取回 blob 再存
    setBusy(filename);
    fetch(path, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('下载失败'); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('已下载 ' + filename, 'ok');
      })
      .catch((err) => toast(err.message, 'err'))
      .finally(() => setBusy(null));
  }

  // stateMeta 没人用了：游戏状态那块搬到每场活动自己身上了
  return (
    <div className="page page--wide staff-page admin-page">
      <NetBar
        online={staff.online}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      <div className="row-between admin-header">
        <div className="admin-header__title">
          <div className="eyebrow">MINI LIFE · CONTROL ROOM</div>
          <h1>活动总控台</h1>
          <div className="small muted">在这里管理活动、选手与现场数据</div>
        </div>
        <button className="btn btn--sm btn--ghost admin-logout" onClick={() => { logout(); nav('/staff'); }}>退出登录</button>
      </div>

      <div className="cols-2 cols-pair">
      {/* 概览 */}
      <div className="admin-stats col-full">
        {[
          { icon: '👥', label: '已领护照', value: players.length, tone: 'blue' },
          { icon: '📅', label: '活动总数', value: activities.length, tone: 'purple' },
          { icon: '🏅', label: '已盖印章', value: players.reduce((s, p) => s + p.stationsDone, 0), tone: 'gold' },
          { icon: staff.outbox.length ? '⏳' : '✓', label: '待同步', value: staff.outbox.length, tone: staff.outbox.length ? 'orange' : 'green' },
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

      {/* 活动清单 —— 只是一份索引，点进去才是这一场的全部 */}
      <div className="cell-stack">
      <div className="card stack admin-panel admin-panel--activities" style={{ marginBottom: 12 }}>
        <div className="row-between">
          <div>
            <div className="admin-panel__title">🗓 活动清单</div>
            <div className="tiny dim">创建活动并管理报名、盖章与页面设计</div>
          </div>
          <button className="btn btn--sm btn--primary" disabled={busy === 'acts'} onClick={addAct}>
            {busy === 'acts' ? '新建中…' : '＋ 新增活动'}
          </button>
        </div>
        <div className="tiny dim admin-panel__hint">
          护照里一场活动一页签证，参加了就盖章。点进去填这一场的信息、
          配图、链接、报名码，再从那儿进画布排版式。改完立刻生效，
          同工端和所有人的护照都会跟着变，不用重启。
        </div>

        <div className="stack-sm">
          {activities.map((a) => {
            const st = ACT_STATE[a.state] || ACT_STATE.upcoming;
            return (
              <button
                key={a.id}
                className="card card--tight row admin-activity"
                style={{ textAlign: 'left', width: '100%', gap: 10, alignItems: 'center' }}
                onClick={() => nav(`/staff/admin/a/${a.id}`)}
              >
                {/* 有配图就用配图，没有就用那个图标 —— 一眼看出哪几场还没配图 */}
                <div style={{
                  flex: '0 0 44px', height: 34, borderRadius: 3, overflow: 'hidden',
                  background: 'var(--ink-3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18,
                  backgroundImage: a.photo ? `url("${a.photo}")` : 'none',
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}>
                  {!a.photo && a.icon}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold row" style={{ gap: 6, alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name || '（还没起名字）'}
                    </span>
                    {a.state === 'live' && (
                      <span className="tiny" style={{ color: 'var(--gold)', flex: '0 0 auto' }}>
                        {st.icon} {st.label}
                      </span>
                    )}
                  </div>
                  <div className="tiny dim">
                    {a.date || '日期待定'} · 报名 {signupCount[a.id] || 0} · 盖章 {stampCount[a.id] || 0}
                    {(a.blocks || []).length ? ` · 版式 ${a.blocks.length} 块` : ''}
                  </div>
                </div>
                <span className="dim">›</span>
              </button>
            );
          })}
          {activities.length === 0 && (
            <div className="admin-empty">
              <span>📅</span>
              <strong>还没有活动</strong>
              <small>点击右上角「新增活动」开始创建</small>
            </div>
          )}
        </div>

      </div>
      </div>

      {/* 右边一摞：这批人。疑似重复的号也归它管 —— 那是花名册上的问题 */}
      <div className="cell-stack">
      {/* 疑似重复报名 */}
      {duplicates.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12, borderColor: 'rgba(247,201,72,.45)' }}>
          <div className="section-title">⚠️ 疑似重复报名</div>
          <div className="small muted" style={{ lineHeight: 1.65 }}>
            下面这些名字出现了不止一次，多半是有人忘了密码又报了一遍。
            核对之后：把要保留的那个号的密码重置成 {resetPin} 交还给本人，多余的空号可以不管（不影响排行榜，只是多几个 0 分）。
          </div>
          {duplicates.map((d) => (
            <div key={d.name} className="card card--flat card--tight">
              <div className="small bold" style={{ marginBottom: 6 }}>{d.name} · {d.list.length} 个号</div>
              <div className="stack-sm">
                {d.list.map((p) => (
                  <button
                    key={p.id}
                    className="lb-row"
                    onClick={() => nav(`/staff/p/${p.id}`)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <Avatar config={p.avatar} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="tiny mono">{p.code} 号 · 密码 {p.pin || '—'}</div>
                      <div className="tiny dim">
                        {p.stationsDone}/{p.stationsTotal} 关 · {p.total} 分
                        {p.total === 0 && p.stationsDone === 0 ? ' · 空号' : ''}
                      </div>
                    </div>
                    <span className="dim">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 花名册 */}
      <div className="card stack admin-panel admin-panel--players">
        <div className="row-between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div className="admin-panel__title">👥 全部选手</div>
            <div className="tiny dim">查看成绩、管理数据与选手资料</div>
          </div>
          {/* 排行榜开关和导出备份都收在这儿：它们讲的都是「这批人」的事，
              各自单开一张卡不值当 */}
          <div className="row admin-actions" style={{ gap: 6, flex: '0 0 auto' }}>
            <button
              className={`btn btn--sm ${settings.leaderboardPublic ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy === 'lb'}
              onClick={() => patchSettings({ leaderboardPublic: !settings.leaderboardPublic }, 'lb')}
              title="关掉后选手端看不到「谁盖的章最多」"
            >
              🏆 排行榜{settings.leaderboardPublic ? '公开' : '已关'}
            </button>
            <button className="btn btn--sm btn--ghost" disabled={!!busy} title="导出成绩 CSV，Excel 可直接打开"
              onClick={() => download('/api/admin/export.csv', 'mini-life-game.csv')}>📊 导出</button>
            <button className="btn btn--sm btn--ghost" disabled={!!busy} title="下载完整备份 JSON，出事了拿它恢复"
              onClick={() => download('/api/admin/backup.json', 'mlg-backup.json')}>🗄 备份</button>
            <button className="btn btn--sm btn--ghost" onClick={() => flush({ full: true })} title="重新拉取花名册">↻</button>
          </div>
        </div>
        {/* 宽屏上排成几列：一千多像素宽里一行一个人，十八个人要滚半天，
            而每一行右边空着两尺 */}
        <div className="stack-sm grid-cards list-cap">
          {board.map((p) => (
            <button key={p.id} className="lb-row admin-player" onClick={() => setDetail(p.id)} style={{ width: '100%', textAlign: 'left' }}>
              <div className="lb-rank">{p.rank}</div>
              <Avatar config={p.avatar} size={34} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">{p.name}</div>
                <div className="tiny dim mono">
                  {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? activities.length}
                </div>
              </div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
          {board.length === 0 && <div className="center small dim" style={{ padding: 20 }}>还没有人报名</div>}
        </div>
      </div>
      </div>

      </div>

      {/* 点花名册里的人弹出来：他报了哪几场、来了哪几场，
          还能替他补一个「已参加」—— 有人当场忘了给同工扫，事后就在这儿补 */}
      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detailPlayer ? `${detailPlayer.name} · ${detailPlayer.code} 号` : ''}
      >
        {detailPlayer && (
          <div className="stack">
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Avatar config={detailPlayer.avatar} size={44} />
              <div className="grow">
                <div className="small bold">{detailPlayer.name}</div>
                <div className="tiny dim mono">
                  {detailPlayer.code} 号 · 参加过 {detailPlayer.stationsDone} 场
                  {detailPlayer.contact ? ` · ${detailPlayer.contact}` : ''}
                </div>
              </div>
            </div>

            <div className="stack-sm">
              {activities.map((a) => {
                const done = !!detailPlayer.stations?.[a.id];
                const signed = signupMap[a.id]?.has(detailPlayer.id);
                return (
                  <div key={a.id} className="card card--tight row" style={{ gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 18, flex: '0 0 auto' }}>{a.icon}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.name}
                      </div>
                      <div className="tiny dim">
                        {signed ? '已报名' : '没报名'}
                        {done ? ` · ${ago(detailPlayer.stations[a.id].at)}盖的章` : ''}
                      </div>
                    </div>
                    {done ? (
                      <span className="tiny" style={{ flex: '0 0 auto', color: 'var(--green)' }}>已参加 ✓</span>
                    ) : (
                      <button
                        className="btn btn--sm btn--ghost" style={{ flex: '0 0 auto' }}
                        disabled={busy === `done-${a.id}`}
                        onClick={() => markDone(detailPlayer.id, a.id, detailPlayer.name)}
                      >
                        {busy === `done-${a.id}` ? '…' : '标为已参加'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="tiny dim">
              盖过的章撤不掉 —— 那是一条写进记录的事实，不是一个可以来回拨的开关。
              标错了人只能去数据库改。
            </div>
            <button className="btn btn--full" onClick={() => setDetail(null)}>关掉</button>
          </div>
        )}
      </Sheet>

      <PlayerSheet
        open={manualOpen}
        onClose={() => { setManualOpen(false); setPicked([]); }}
        players={players}
        picked={picked}
        togglePick={togglePick}
        onResetPin={resetPinPicked}
        busy={busy === 'pin'}
        resetPin={resetPin}
      />
    </div>
  );
}

/**
 * 花名册弹层：勾人，然后重置密码。
 *
 * 原来这里还管「按身份编队」，那是迎新游戏的东西，打卡本用不上，
 * 已经拿掉了。留下的这一件事仍然是现场最常用的 —— 有人忘了密码，
 * 别让他重新报名（会多出一个空号，章也对不上）。
 */
function PlayerSheet({ open, onClose, players, picked, togglePick, onResetPin, busy, resetPin }) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return players
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.code.includes(kw))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [players, q]);

  return (
    <Sheet open={open} onClose={onClose} title="🔑 找回密码">
      <div className="stack">
        <div className="small muted">
          勾选忘了密码的人，把他们的密码统一重置成 {resetPin}，再让他用原来的编号找回护照。
        </div>

        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字或编号…" />

        <div className="stack-sm" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
          {list.length === 0 && (
            <div className="center small dim" style={{ padding: 18 }}>
              {players.length === 0
                ? '本机花名册是空的，先回上一层点「重新拉取花名册」'
                : '没有符合的人'}
            </div>
          )}
          {list.map((p) => {
            const on = picked.includes(p.id);
            return (
              <button
                key={p.id}
                className="lb-row"
                onClick={() => togglePick(p.id)}
                style={{ width: '100%', textAlign: 'left', borderColor: on ? 'var(--gold)' : undefined,
                         background: on ? 'rgba(232,197,106,.12)' : undefined }}
              >
                <span style={{ width: 20, fontSize: 15 }}>{on ? '☑️' : '⬜️'}</span>
                <Avatar config={p.avatar} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{p.name}</div>
                  <div className="tiny dim mono">{p.code} 号 · 盖过 {p.stationsDone} 个章</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 只在请求进行中禁用。没勾人时也 disabled 的话，点了完全没反馈 ——
            处理函数里那句「先勾选选手」的提示永远走不到 */}
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onResetPin}>
          🔑 重置密码为 {resetPin}{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        <div className="tiny dim" style={{ marginTop: -4 }}>
          重置会让原密码立刻失效，并顺带解除他之前试错造成的锁定。
        </div>
        <button className="btn btn--full" onClick={onClose}>完成</button>
      </div>
    </Sheet>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <div className="row-between">
      <div className="grow">
        <div className="small bold">{label}</div>
        <div className="tiny dim">{hint}</div>
      </div>
      <button
        className={`btn btn--sm ${value ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => onChange(!value)}
        style={{ minWidth: 62 }}
      >
        {value ? '开' : '关'}
      </button>
    </div>
  );
}
