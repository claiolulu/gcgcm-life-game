import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, useToast, useConfirm, useLocalState, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff, flush, logout, allPlayers, leaderboardLocal, applyRoster } from '../lib/staff.js';

export default function Admin() {
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;
  // 距离活动结束还有多少分钟。没法自动知道，给个可调的估值
  const [minutesLeft, setMinutesLeft] = useLocalState('mlg.minutesLeft', 33);

  /**
   * 容量体检：按「组数 × 8 关」的需求对上「各关每分钟能过几组」的供给。
   *
   * 全在客户端算 —— 关卡耗时在 /api/config 里本来就有，组数从花名册数，
   * 不用为这个多发一次请求。
   */
  const capacity = useMemo(() => {
    const sts = (config?.stations || []).filter((st) => st.minutes);
    if (sts.length === 0 || players.length === 0) return null;

    const teams = new Set();
    let loners = 0;
    for (const p of players) { if (p.teamId) teams.add(p.teamId); else loners++; }
    const groups = teams.size + loners;

    const per = sts.map((st) => ({
      name: st.name, cap: Math.floor(minutesLeft / st.minutes),
    }));
    const total = per.reduce((a, x) => a + x.cap, 0);
    return {
      groups, minutes: minutesLeft, total,
      avg: groups > 0 ? Math.round((total / groups) * 10) / 10 : 0,
      // 接待不下一半队伍的就是瓶颈，值得当场加人手
      tight: per.filter((x) => x.cap < groups * 0.5).sort((a, b) => a.cap - b.cap),
    };
  }, [config, players, minutesLeft]);

  // 各关忙闲随同步一起来，只有 id 和数字；名字图标从配置里补
  const load = useMemo(() => {
    const meta = new Map((config?.stations || []).map((st) => [st.id, st]));
    return (staff.load || []).map((x) => ({ ...x, ...(meta.get(x.id) || { name: x.id, icon: '📍' }) }));
  }, [staff.load, config]);

  const [busy, setBusy] = useState(null);
  const [drawResult, setDrawResult] = useState(null);
  const [awards, setAwards] = useState([]);
  const [awardSheet, setAwardSheet] = useState(null);
  const [picked, setPicked] = useState([]);        // 手动分配时勾选的人
  const [manualOpen, setManualOpen] = useState(false);

  const settings = config?.settings || {};
  const stations = config?.stations || [];
  const awardDefs = config?.awards || [];
  const resetPin = config?.resetPin || '3927';
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line
  const board = useMemo(() => leaderboardLocal(), [staff.players, staff.outbox]); // eslint-disable-line

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  useEffect(() => {
    api('/api/awards').then((r) => setAwards(r.awards || [])).catch(() => {});
  }, []);

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

  const unassigned = useMemo(() => players.filter((p) => !p.identity), [players]);

  // 同名的多半是「忘了密码又报了一次」。报名时已经拦过一道，
  // 但选手可能点了「不是我」，所以这里再列出来让同工核对。
  const duplicates = useMemo(() => {
    const byName = {};
    players.forEach((p) => { (byName[p.name] = byName[p.name] || []).push(p); });
    return Object.entries(byName)
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => ({ name, list: list.sort((a, b) => a.code.localeCompare(b.code)) }));
  }, [players]);

  /** mode='fill' 只补没身份的人；'all' 全部重新洗牌 */
  async function draw(mode) {
    const n = mode === 'all' ? players.length : unassigned.length;
    if (n === 0) return toast(mode === 'all' ? '还没有人报名' : '所有人都已经分配过了', 'warn');
    const ok = await ask(mode === 'all'
      ? { title: '全部重新洗牌？', danger: true, confirmText: `重新洗牌 ${players.length} 人`,
          body: `已经找到队友的人会被打散重来，场上正在进行的组队会全部作废。\n开场前彩排完再用这个。` }
      : { title: `为 ${n} 人分配身份？`, confirmText: `分配这 ${n} 人`,
          body: '只给还没有身份的人分配，已经分好的人完全不受影响。' });
    if (!ok) return;

    setBusy('draw');
    try {
      const res = await api('/api/admin/draw', { method: 'POST', body: { mode }, token, timeout: 20000 });
      setDrawResult(res);
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`已为 ${res.assigned} 人分配身份` + (res.skipped ? `，${res.skipped} 人保持原样` : ''), 'ok');
    } catch (err) {
      toast(err.message || '分配失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /** 把勾选的人编成一队 */
  async function assignPicked(identity) {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    setBusy('team');
    try {
      const res = await api('/api/admin/team', {
        method: 'POST', body: { playerIds: picked, identity }, token,
      });
      applyRoster(res.players, res.epoch, res.serverTs);
      const names = res.members.map((m) => m.name).join('、');
      const extra = res.rebalanced > 0 ? `，原队伍剩下的人已自动降级` : '';
      toast(`${names} → ${res.identity.toUpperCase()}${res.teamId ? ` · ${res.teamId}` : ''}${extra}`, 'ok');
      setPicked([]);
    } catch (err) {
      toast(err.message || '分配失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function unassignPicked() {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    if (!(await ask({ title: `把 ${picked.length} 人退回未分配？`, danger: true, confirmText: '退回未分配',
                      body: '他们会失去身份、队伍和颜色符号，可以重新分配。积分不受影响。' }))) return;
    setBusy('team');
    try {
      const res = await api('/api/admin/unassign', { method: 'POST', body: { playerIds: picked }, token });
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`${picked.length} 人已退回未分配`, 'ok');
      setPicked([]);
    } catch (err) {
      toast(err.message || '操作失败', 'err');
    } finally {
      setBusy(null);
    }
  }

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

  const togglePick = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function setAward(awardId, playerId) {
    try {
      const res = await api('/api/admin/award', { method: 'POST', body: { awardId, playerId }, token });
      setAwards(
        (res.awards || []).map((a) => ({
          awardId: a.award_id,
          player: players.find((p) => p.id === a.player_id) || null,
        }))
      );
      toast('奖项已保存', 'ok');
      setAwardSheet(null);
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    }
  }

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

  async function reset() {
    const confirmed = await ask({
      title: '⚠️ 重置游戏数据',
      danger: true,
      confirmText: '我确认要重置',
      requireText: 'RESET',
      body: '这会清空全部积分、盖章、盲盒和 Token 记录。\n重置前会自动备份到服务器。',
    });
    if (!confirmed) return;

    const keepPlayers = await ask({
      title: '选手名单怎么处理？',
      body: '积分记录无论如何都会清空，这一步只决定选手名单。',
      choices: [
        { value: 'keep', label: '保留选手，只清积分', primary: true },
        { value: 'wipe', label: '连选手名单一起删掉', danger: true },
      ],
    });
    if (!keepPlayers) return;
    setBusy('reset');
    try {
      await api('/api/admin/reset', {
        method: 'POST', body: { confirm: 'RESET', keepPlayers: keepPlayers === 'keep' }, token,
      });
      await flush({ full: true });
      await loadConfig();
      toast('已重置，旧数据已自动备份到服务器', 'ok');
    } catch (err) {
      toast(err.message || '重置失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const stateMeta = {
    lobby: { label: '入场 / 报名中', icon: '🚪', hint: '选手可以自助报名、改头像。身份还没抽。' },
    running: { label: '游戏进行中', icon: '🎮', hint: '报名通道已自动关闭，选手端全面只读，只剩各站记分。' },
    ended: { label: '已结束', icon: '🏁', hint: '可以颁奖了，选手可以生成分享徽章。' },
  };

  return (
    <div className="page page--wide">
      <NetBar
        online={staff.online}
        connected={staff.connected}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <div className="eyebrow">Control Room</div>
          <h1>总控台</h1>
        </div>
        <button className="btn btn--sm btn--ghost" onClick={() => { logout(); nav('/staff'); }}>退出</button>
      </div>

      <div className="cols-2">
      {/* 概览 */}
      <div className="card row-between" style={{ marginBottom: 12 }}>
        {[
          { label: '已报名', value: players.length },
          { label: '已抽身份', value: players.filter((p) => p.identity).length },
          { label: '总记分', value: players.reduce((s, p) => s + p.stationsDone, 0) },
          { label: '待同步', value: staff.outbox.length },
        ].map((s) => (
          <div key={s.label} className="center grow">
            <div className="bold mono" style={{ fontSize: 21, color: 'var(--gold)' }}>{s.value}</div>
            <div className="tiny dim">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 游戏状态 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🎮 游戏状态</div>
        <div className="row" style={{ gap: 8 }}>
          {Object.entries(stateMeta).map(([k, m]) => (
            <button
              key={k}
              className={`btn btn--sm grow ${settings.gameState === k ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => patchSettings({ gameState: k }, 'state')}
              disabled={busy === 'state'}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="tiny dim">{stateMeta[settings.gameState]?.hint}</div>
      </div>

      {/* 各关忙闲 */}
      {load.length > 0 && settings.gameState === 'running' && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">📍 各关排队情况</div>
          <div className="tiny dim">
            「在等」是下一站指向这一关的人数。开赛时后台已按各关耗时排过班，
            这里用来盯有没有意外堵住 —— 某一关持续高于其他关，
            多半是那边流程比预计的慢，可以加人手或加一套道具并行。
          </div>
          {capacity && (
            <div className="tiny" style={{
              padding: '8px 10px', border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 4, lineHeight: 1.8,
            }}>
              <b>容量体检</b>：场上 {capacity.groups} 组，按各关耗时估算，
              剩余 {capacity.minutes} 分钟内合计能接待约 <b>{capacity.total}</b> 组次
              —— 平均每组跑得完 <b>{capacity.avg}</b> 关。
              {' '}
              <button
                className="btn btn--sm btn--ghost"
                style={{ padding: '0 6px', height: 20, fontSize: 11, verticalAlign: 'middle' }}
                onClick={() => setMinutesLeft((m) => (m <= 10 ? 45 : m - 5))}
                title="按一下减 5 分钟，到 10 分钟后回到 45"
              >
                改时间
              </button>
              {capacity.tight.length > 0 && (
                <>
                  <br />
                  <span style={{ color: 'var(--red)' }}>
                    瓶颈：{capacity.tight.map((t) => `${t.name}（只接待得下 ${t.cap} 组）`).join('、')}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="stack-sm">
            {[...load].sort((a, b) => b.waiting - a.waiting).map((st) => {
              const max = Math.max(1, ...load.map((x) => x.waiting));
              const hot = st.waiting >= 4 && st.waiting === max;
              return (
                <div key={st.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 'none', width: 92 }} className="small">
                    {st.icon} {st.name}
                  </div>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,.07)', borderRadius: 999 }}>
                    <div style={{
                      width: `${Math.round((st.waiting / max) * 100)}%`, height: '100%', borderRadius: 999,
                      background: hot ? 'var(--red)' : 'var(--gold)', transition: 'width .3s ease',
                    }} />
                  </div>
                  <div className="tiny" style={{ flex: 'none', width: 86, textAlign: 'right', color: hot ? 'var(--red)' : undefined }}>
                    在等 {st.waiting} · 完成 {st.done}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 身份分配 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🪪 身份分配 / 组队</div>
        <div className="small muted" style={{ lineHeight: 1.65 }}>
          把选手打散成 Solo / Duo / Trio，同色同符号的人需要在场内互相寻找。
          系统同时给每组分配不同的首站，避免开局全挤在一个关卡。
        </div>

        {/* 花名册是空的时候，要说清楚是「还没人报名」还是「本机数据没同步下来」，
            不能只把按钮禁用掉 —— 那看起来就像功能坏了 */}
        {players.length === 0 ? (
          <div className="card card--flat card--tight stack-sm">
            <div className="small bold" style={{ color: 'var(--yellow)' }}>
              本机花名册是空的
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              可能是还没有人报名，也可能是这台设备的数据没同步下来（比如后台刚重置过）。
              先点下面刷新确认一下。
            </div>
            <button
              className="btn btn--sm btn--full"
              onClick={async () => { await flush({ full: true }); toast('已重新拉取花名册', 'ok'); }}
              disabled={staff.syncing}
            >
              {staff.syncing ? '同步中…' : '↻ 重新拉取花名册'}
            </button>
          </div>
        ) : (
          <>
            <div className="row-between card card--flat card--tight">
              <div>
                <div className="small bold">未分配 {unassigned.length} 人</div>
                <div className="tiny dim">已分配 {players.length - unassigned.length} 人</div>
              </div>
              <button
                className="btn btn--primary"
                onClick={() => draw('fill')}
                disabled={busy === 'draw' || unassigned.length === 0}
              >
                {busy === 'draw' ? '分配中…'
                  : unassigned.length === 0 ? '全部已分配'
                  : `一键分配这 ${unassigned.length} 人`}
              </button>
            </div>
            <div className="tiny dim">
              陆续有人报名时点这个：只给还没身份的人分配，<span className="bold">已经找到队友的人不受影响</span>。
              {unassigned.length === 0 && ' 现在每个人都有身份了，新人报名后这里会重新亮起来。'}
            </div>
          </>
        )}

        <div className="divider" />

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost grow" onClick={() => setManualOpen(true)}>
            ✋ 手动勾选分配
          </button>
          <button
            className="btn btn--danger grow"
            onClick={() => draw('all')}
            disabled={busy === 'draw' || players.length === 0}
          >
            🔄 全部重新洗牌
          </button>
        </div>

        {drawResult && (
          <div className="card card--flat card--tight">
            <div className="small bold">
              本次：Solo {drawResult.counts.solo} · Duo {drawResult.counts.duo} 组 · Trio {drawResult.counts.trio} 组
            </div>
            <div className="tiny dim" style={{ marginTop: 4 }}>
              共 {drawResult.groups.length} 组
              {drawResult.skipped ? `，另有 ${drawResult.skipped} 人保持原有身份` : ''}
              。选手端会自动弹出身份卡。
            </div>
          </div>
        )}
      </div>

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

      {/* 参数 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">⚙️ 游戏参数</div>

        <Toggle
          label="开放报名"
          hint="关闭后新人无法自助报名"
          value={settings.registrationOpen}
          onChange={(v) => patchSettings({ registrationOpen: v }, 'reg')}
        />
        <Toggle
          label="公开排行榜"
          hint="关闭后选手端看不到排名"
          value={settings.leaderboardPublic}
          onChange={(v) => patchSettings({ leaderboardPublic: v }, 'lb')}
        />

        <NumberList
          label="人生盲盒红线"
          hint="总分跨过这些分数时必须去抽盲盒"
          value={settings.lifeEventThresholds || []}
          onChange={(v) => patchSettings({ lifeEventThresholds: v }, 'th')}
        />
        <NumberList
          label="记分档位"
          hint="各站的 勉强 / 正常 / 出色 对应分值"
          value={settings.scoreTiers || []}
          onChange={(v) => patchSettings({ scoreTiers: v }, 'tiers')}
        />
      </div>

      {/* 奖项 */}
      {settings.gameState === 'ended' && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🏆 颁奖</div>
          {awardDefs.map((a) => {
            const won = awards.find((w) => w.awardId === a.id);
            return (
              <button
                key={a.id}
                className="card card--tight row"
                onClick={() => setAwardSheet(a)}
                style={{ textAlign: 'left', width: '100%', gap: 10 }}
              >
                <span style={{ fontSize: 22 }}>{a.icon}</span>
                <div className="grow">
                  <div className="small bold">{a.name}</div>
                  <div className="tiny dim">{won?.player ? `🎉 ${won.player.name}` : a.desc}</div>
                </div>
                <span className="dim">›</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 数据 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">💾 数据</div>
        <button className="btn btn--full" onClick={() => download('/api/admin/export.csv', 'mini-life-game.csv')} disabled={!!busy}>
          📊 导出成绩 CSV（Excel 可直接打开）
        </button>
        <button className="btn btn--full" onClick={() => download('/api/admin/backup.json', 'mlg-backup.json')} disabled={!!busy}>
          🗄 下载完整备份 JSON
        </button>
        <div className="tiny dim">服务器每 60 秒也会自动做一次本地快照备份。</div>
        <button className="btn btn--danger btn--full" onClick={reset} disabled={!!busy} style={{ marginTop: 6 }}>
          ⚠️ 重置游戏数据
        </button>
      </div>

      {/* 花名册 */}
      <div className="card stack">
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>👥 全部选手</div>
          <button className="btn btn--sm btn--ghost" onClick={() => flush({ full: true })}>↻</button>
        </div>
        <div className="stack-sm">
          {board.map((p) => (
            <button key={p.id} className="lb-row" onClick={() => nav(`/staff/p/${p.id}`)} style={{ width: '100%', textAlign: 'left' }}>
              <div className="lb-rank">{p.rank}</div>
              <Avatar config={p.avatar} size={34} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">{p.name}</div>
                <div className="tiny dim mono">
                  {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? stations.length}
                  {p.identity && ` · ${p.identity}`}
                  {p.teamSymbol && ` ${p.teamSymbol}`}
                </div>
              </div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
          {board.length === 0 && <div className="center small dim" style={{ padding: 20 }}>还没有人报名</div>}
        </div>
      </div>

      </div>

      <ManualAssignSheet
        open={manualOpen}
        onClose={() => { setManualOpen(false); setPicked([]); }}
        players={players}
        picked={picked}
        togglePick={togglePick}
        onAssign={assignPicked}
        onUnassign={unassignPicked}
        onResetPin={resetPinPicked}
        busy={busy === 'team' || busy === 'pin'}
        colors={config?.groupColors || []}
        resetPin={resetPin}
      />

      <Sheet open={!!awardSheet} onClose={() => setAwardSheet(null)} title={awardSheet ? `${awardSheet.icon} ${awardSheet.name}` : ''}>
        <div className="stack-sm">
          <div className="small muted">{awardSheet?.desc}</div>
          <button className="btn btn--ghost btn--full" onClick={() => setAward(awardSheet.id, null)}>清除该奖项</button>
          {board.map((p) => (
            <button key={p.id} className="lb-row" onClick={() => setAward(awardSheet.id, p.id)} style={{ width: '100%' }}>
              <Avatar config={p.avatar} size={32} />
              <div className="grow small bold" style={{ textAlign: 'left' }}>{p.name}</div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/** 手动勾选分配：勾几个人，按身份成组。人数会自动推荐对应身份。 */
function ManualAssignSheet({ open, onClose, players, picked, togglePick, onAssign, onUnassign, onResetPin, busy, colors, resetPin }) {
  const [q, setQ] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const unassignedCount = useMemo(() => players.filter((p) => !p.identity).length, [players]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return players
      .filter((p) => (onlyUnassigned ? !p.identity : true))
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.code.includes(kw))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [players, q, onlyUnassigned]);

  // 身份和人数必须严格对应：Duo 就是 2 人、Trio 就是 3 人。
  // 人数不对时按钮直接禁用，并在下面写清楚还差几个。
  const NEED = { solo: 1, duo: 2, trio: 3 };
  const suggested = Object.keys(NEED).find((k) => NEED[k] === picked.length) || null;

  return (
    <Sheet open={open} onClose={onClose} title="✋ 手动勾选分配">
      <div className="stack">
        <div className="small muted">
          勾选要编在一起的人，再选身份。同一队会拿到相同的颜色 + 符号，需要在场内互相寻找。
        </div>

        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字或编号…" />
          {/* 按钮写的是「点了会怎样」，不是「现在是什么」。
              原来反过来写，读着像「点它就只看未分配」，一点却变成了看全部。
              带上人数，当前在看哪一批一眼就知道。 */}
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setOnlyUnassigned((v) => !v)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {onlyUnassigned ? `看全部 ${players.length} 人` : `只看未分配 ${unassignedCount} 人`}
          </button>
        </div>

        <div className="stack-sm" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
          {list.length === 0 && (
            <div className="center small dim" style={{ padding: 18 }}>
              {players.length === 0
                ? '本机花名册是空的，先回上一层点「重新拉取花名册」'
                : onlyUnassigned ? '所有人都已经分配过了，点右上角「看全部」可以重新编队' : '没有符合的人'}
            </div>
          )}
          {list.map((p) => {
            const on = picked.includes(p.id);
            const color = colors.find((c) => c.key === p.teamColor);
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
                  <div className="tiny dim mono">
                    {p.code} 号
                    {p.identity
                      ? ` · ${p.identity.toUpperCase()}${p.teamSymbol && color ? ` ${color.name}${p.teamSymbol}` : ''}`
                      : ' · 未分配'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="card card--flat card--tight center">
          <div className="small">
            已勾选 <span className="gold bold">{picked.length}</span> 人
            {suggested
              ? <span className="muted"> · 可编成 {suggested.toUpperCase()}</span>
              : picked.length > 3
                ? <span style={{ color: 'var(--yellow)' }}> · 一队最多 3 人</span>
                : null}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          {[['solo', 'SOLO', '独行'], ['duo', 'DUO', '双人'], ['trio', 'TRIO', '三人']].map(([k, en, cn]) => {
            const need = NEED[k];
            const ok = picked.length === need;
            const diff = need - picked.length;
            return (
              <button
                key={k}
                className={`btn btn--sm grow ${ok ? 'btn--primary' : 'btn--ghost'}`}
                disabled={busy || !ok}
                onClick={() => onAssign(k)}
                title={ok ? '' : `${en} 需要 ${need} 人`}
                style={{ flexDirection: 'column', gap: 1, minHeight: 46, padding: '4px 6px' }}
              >
                <span style={{ fontSize: 12.5 }}>{en} {cn}</span>
                <span className="tiny" style={{ opacity: ok ? 0.6 : 0.75, fontWeight: 400 }}>
                  {ok ? `${need} 人` : diff > 0 ? `还差 ${diff} 人` : `多了 ${-diff} 人`}
                </span>
              </button>
            );
          })}
        </div>

        {/* 只在请求进行中禁用。原来没勾人时也 disabled，点了完全没反馈 ——
            处理函数里那句「先勾选选手」的提示永远走不到。
            人数写进按钮，为什么点不动一目了然。 */}
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onResetPin}>
          🔑 重置密码为 {resetPin}{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        <div className="tiny dim" style={{ marginTop: -4 }}>
          有人忘了密码就用这个，让他用原编号找回，别重新报名 —— 重新报名会多出一个空号，分数也对不上。
        </div>
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onUnassign}>
          退回未分配{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        {picked.length === 0 && (
          <div className="tiny dim" style={{ marginTop: -4 }}>
            上面这两个都要先勾人。想退回已经分好队的人，先点搜索框右边的
            「看全部」—— 默认只列出还没分配的。
          </div>
        )}
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

function NumberList({ label, hint, value, onChange }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join(',')]); // eslint-disable-line

  function commit() {
    const parsed = text
      .split(/[,，\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    if (parsed.length) onChange(parsed);
  }

  return (
    <div className="field">
      <div className="small bold">{label}</div>
      <div className="tiny dim" style={{ marginBottom: 4 }}>{hint}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" />
        <button className="btn btn--sm" onClick={commit}>保存</button>
      </div>
    </div>
  );
}
