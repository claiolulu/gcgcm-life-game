import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import RowEditor from '../components/RowEditor.jsx';
import { NetBar, Sheet, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { onTick } from '../lib/realtime.js';
import { useStaff, flush, logout, allPlayers, leaderboardLocal, applyRoster } from '../lib/staff.js';
import { themeVarsOf, coverBgOf } from './book/bookVals.js';

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
      // 新建完直接进画布 —— 「新增活动」这一下真正想做的事是把这一页做出来
      nav(`/staff/admin/a/${made ? made.id : id}/design`);
    } catch (err) {
      toast(err.message || '加不上', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------ 签证页模版 ------------------------ */

  const [tpl, setTpl] = useState(null);           // null = 还没从配置载入
  const [tplDirty, setTplDirty] = useState(false);
  const sources = config?.visaSources || [];

  useEffect(() => {
    if (tplDirty) return;
    if (config?.visaTemplate) setTpl(JSON.parse(JSON.stringify(config.visaTemplate)));
  }, [config, tplDirty]);

  const editTpl = (patch) => {
    setTpl((cur) => ({ ...cur, ...patch }));
    setTplDirty(true);
  };

  /**
   * 栏目表的增删改查。模版和「某场活动自己那套」用的是同一批函数 ——
   * 两边的数据结构本来就是同一个，分成两套只会写岔。
   *
   * rows 传进来，改完的 rows 传出去，谁来存由调用方决定。
   */
  const rowOps = (rows, save) => ({
    edit: (i, patch) => save(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))),
    move: (i, d) => {
      const next = [...rows];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      save(next);
    },
    remove: (i) => save(rows.filter((_, k) => k !== i)),
    add: () => save([...rows, {
      key: `r${Date.now().toString(36)}`, label: '', src: 'text', text: '', accent: false,
    }]),
  });

  async function saveTpl() {
    setBusy('tpl');
    try {
      const res = await api('/api/admin/visa-template', { method: 'POST', body: tpl, token });
      setTpl(res.visaTemplate);
      setTplDirty(false);
      await loadConfig();
      toast('签证页模版已保存', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* -------------------------- 护照模版 -------------------------- */

  const [theme, setTheme] = useState(null);        // null = 还没从配置载入
  const [themeDirty, setThemeDirty] = useState(false);
  const presets = config?.themePresets || [];

  useEffect(() => {
    if (themeDirty) return;
    if (config?.theme) setTheme({ ...config.theme });
  }, [config, themeDirty]);

  const editTheme = (patch) => {
    setTheme((cur) => ({ ...cur, ...patch }));
    setThemeDirty(true);
  };

  const applyPreset = (pre) => {
    const { key, name, ...colors } = pre;
    editTheme({ ...colors, preset: key });
  };

  async function saveTheme() {
    setBusy('theme');
    try {
      const res = await api('/api/admin/theme', { method: 'POST', body: theme, token });
      setTheme(res.theme);
      setThemeDirty(false);
      await loadConfig();
      toast('模版已保存，所有人的护照都换了', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }



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
          { label: '领了护照', value: players.length },
          { label: '活动', value: activities.length },
          { label: '盖过的章', value: players.reduce((s, p) => s + p.stationsDone, 0) },
          { label: '待同步', value: staff.outbox.length },
        ].map((s) => (
          <div key={s.label} className="center grow">
            <div className="bold mono" style={{ fontSize: 21, color: 'var(--gold)' }}>{s.value}</div>
            <div className="tiny dim">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 活动清单 —— 只是一份索引，点进去才是这一场的全部 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>🗓 活动清单</div>
          <button className="btn btn--sm btn--primary" disabled={busy === 'acts'} onClick={addAct}>
            {busy === 'acts' ? '新建中…' : '＋ 新增活动'}
          </button>
        </div>
        <div className="tiny dim">
          护照里一场活动一页签证，参加了就盖章。新增活动会直接打开画布 ——
          默认就是现在这份签证页模版，往上摆字和图就行。改完立刻生效，
          同工端和所有人的护照都会跟着变，不用重启。
        </div>

        <div className="stack-sm">
          {activities.map((a) => {
            const st = ACT_STATE[a.state] || ACT_STATE.upcoming;
            return (
              <button
                key={a.id}
                className="card card--tight row"
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
                    {(a.canvas || []).length ? ` · 画布 ${a.canvas.length} 个元素` : ''}
                    {a.page ? ' · 自己一套版式' : ''}
                  </div>
                </div>
                <span className="dim">›</span>
              </button>
            );
          })}
        </div>

      </div>

      {/* 签证页模版 */}
      {tpl && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🎫 签证页模版</div>
          <div className="tiny dim">
            现在护照上那一页就是这份模版。改它，所有<b>跟随模版</b>的活动一起变；
            某一场想长得不一样，去「活动清单」里把那一场改成「自己一套」——
            之后改模版就不会再动到它。
          </div>

          <div className="row" style={{ gap: 6 }}>
            <label className="stack-sm grow" style={{ gap: 3 }}>
              <div className="tiny dim">横幅上那个词</div>
              <input className="input" value={tpl.banner} maxLength={16}
                onChange={(e) => editTpl({ banner: e.target.value })} />
            </label>
            <label className="stack-sm grow" style={{ gap: 3 }}>
              <div className="tiny dim">右栏标题（活动名上面）</div>
              <input className="input" value={tpl.stationLabel} maxLength={30}
                onChange={(e) => editTpl({ stationLabel: e.target.value })} />
            </label>
          </div>
          <label className="stack-sm" style={{ gap: 3 }}>
            <div className="tiny dim">备注标题（活动说明上面）</div>
            <input className="input" value={tpl.annotationLabel} maxLength={30}
              onChange={(e) => editTpl({ annotationLabel: e.target.value })} />
          </label>

          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {[
              ['showPhoto', '显示配图'],
              ['showAnnotation', '显示备注'],
              ['showLinks', '显示页面链接'],
            ].map(([k, label]) => (
              <label key={k} className="tiny row" style={{ gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={tpl[k] !== false}
                  onChange={(e) => editTpl({ [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>

          <div className="tiny dim" style={{ marginTop: 4 }}>
            左边那片栏目。「固定文字」是同工填的死字，其余都按人算 ——
            姓名、编号、出席与否每个人不一样，填不出来。
          </div>
          <RowEditor
            rows={tpl.rows || []}
            sources={sources}
            ops={rowOps(tpl.rows || [], (rows) => editTpl({ rows }))}
          />

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--sm btn--ghost grow" disabled={!tplDirty}
              onClick={() => { setTpl(JSON.parse(JSON.stringify(config.visaTemplate))); setTplDirty(false); }}>
              还原
            </button>
            <button className="btn btn--sm btn--primary grow"
              disabled={busy === 'tpl' || !tplDirty} onClick={saveTpl}>
              {busy === 'tpl' ? '保存中…' : tplDirty ? '保存模版' : '已保存'}
            </button>
          </div>
        </div>
      )}

      {/* 护照模版 */}
      {theme && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🎨 护照模版</div>
          <div className="tiny dim">
            改的是所有人手机上那本护照的样子。保存之后立刻生效，不用重启，
            也不用让人重新打开页面。
          </div>

          {/* 预览：跟真页面用同一套算法算颜色，所见即所得 */}
          <div
            style={{
              ...themeVarsOf(theme),
              display: 'flex', gap: 8, padding: 10, borderRadius: 6,
              background: '#141110', border: '1px solid var(--line)',
            }}
          >
            {/* 封面 */}
            <div style={{
              flex: '0 0 92px', height: 132, background: coverBgOf(theme),
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 6, position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(var(--pp-gold-2-rgb),.45)' }} />
              <div style={{ fontSize: 7, letterSpacing: '.3em', color: 'var(--pp-gold-2)' }}>
                {theme.coverIssuer}
              </div>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                border: '1px solid rgba(var(--pp-gold-2-rgb),.6)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: 'var(--pp-gold)', fontFamily: "'EB Garamond',serif",
              }}>M</div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', color: 'var(--pp-gold)' }}>
                {theme.coverTitle}
              </div>
              <div style={{ fontSize: 7, letterSpacing: '.24em', color: 'rgba(var(--pp-gold-rgb),.78)' }}>
                {theme.coverEn}
              </div>
            </div>

            {/* 签证页 */}
            <div style={{
              flex: 1, minWidth: 0, height: 132, background: theme.paper,
              display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
                borderBottom: '1px solid rgba(var(--pp-ink-rgb),.4)',
              }}>
                <div style={{
                  width: 14, height: 14, border: '1px solid rgba(var(--pp-ink-rgb),.35)',
                  color: 'var(--pp-ink)', fontSize: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>T</div>
                <div style={{ flex: 1, fontSize: 7, letterSpacing: '.16em', color: 'var(--pp-ink)' }}>
                  🎓 迎新之夜
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pp-ink)' }}>06</div>
              </div>
              <div style={{ padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', height: 16, background: '#ece5d6', border: '1px solid rgba(var(--pp-ink-rgb),.35)' }}>
                  <div style={{
                    flex: '0 0 38%', display: 'flex', alignItems: 'center', paddingLeft: 5,
                    fontSize: 8, letterSpacing: '.2em', color: 'var(--pp-ink)',
                  }}>VISA</div>
                  <div style={{
                    flex: 1, background: 'var(--pp-ink)', display: 'flex', alignItems: 'center',
                    justifyContent: 'flex-end', paddingRight: 5,
                    fontSize: 6, letterSpacing: '.16em', color: 'var(--pp-gold)',
                  }}>{theme.visaBrand}</div>
                </div>
                <div style={{ fontSize: 6, letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }}>
                  ANNOTATION 备注
                </div>
                <div style={{ fontSize: 8, lineHeight: 1.6, color: 'var(--pp-text)' }}>
                  新学年的第一场。分数会归零，但今晚认识的人还在。
                </div>
              </div>
              {/* 水印：用护照里真实那张图，浓度就是滑块的值 */}
              <div style={{
                position: 'absolute', right: '4%', top: '18%', width: '38%', bottom: '10%',
                backgroundImage: 'url("/wm/city-chambers.png")', backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                opacity: theme.watermark, pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', right: 8, bottom: 6, width: 40, height: 40,
                borderRadius: '50%', border: `2px solid ${theme.stamp}`, color: theme.stamp,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', opacity: 0.9, transform: 'rotate(-12deg)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</div>
                <div style={{ fontSize: 5.5, fontWeight: 700, marginTop: 1 }}>已参加</div>
              </div>
            </div>
          </div>

          {/* 预设 */}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {presets.map((pre) => (
              <button
                key={pre.key}
                className={`btn btn--sm ${theme.preset === pre.key ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(pre)}
              >
                <span style={{
                  display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                  background: pre.ink, border: `1px solid ${pre.gold}`, marginRight: 5,
                  verticalAlign: 'middle',
                }} />
                {pre.name}
              </button>
            ))}
          </div>

          {/* 四个色 */}
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {[
              ['ink', '主色', '抬头、边框、签证横幅'],
              ['gold', '烫金', '封面的字和线'],
              ['paper', '纸色', '内页的底'],
              ['text', '正文', '正文黑'],
              ['stamp', '盖章', '「已参加」那个章'],
            ].map(([key, label, hint]) => (
              <label key={key} className="stack-sm" style={{ gap: 3 }} title={hint}>
                <div className="tiny dim">{label}</div>
                <div className="row" style={{ gap: 5, alignItems: 'center' }}>
                  <input
                    type="color" value={theme[key] || '#000000'}
                    onChange={(e) => editTheme({ [key]: e.target.value, preset: 'custom' })}
                    style={{
                      width: 34, height: 28, padding: 0, border: '1px solid var(--line)',
                      background: 'none', cursor: 'pointer',
                    }}
                  />
                  <code className="tiny dim">{theme[key]}</code>
                </div>
              </label>
            ))}
          </div>

          {/* 水印浓度 */}
          <label className="stack-sm" style={{ gap: 4 }}>
            <div className="tiny dim">
              水印浓度 <b>{Number(theme.watermark).toFixed(2)}</b>
              —— 每页底下那张地标图。调太浓会压住正文，所以上限卡在 0.30
            </div>
            <input
              type="range" min="0" max="0.3" step="0.01"
              value={theme.watermark}
              onChange={(e) => editTheme({ watermark: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>

          {/* 印在护照上的字 */}
          <div className="stack-sm">
            <div className="tiny dim">
              印在护照上的字。别的团契要用这本册子，改的就是这几行 ——
              代码里没有写死任何一处。
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.coverTitle} maxLength={12}
                placeholder="封面大字" aria-label="封面大字"
                onChange={(e) => editTheme({ coverTitle: e.target.value })} />
              <input className="input grow" value={theme.coverEn} maxLength={20}
                placeholder="封面英文" aria-label="封面英文"
                onChange={(e) => editTheme({ coverEn: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.coverIssuer} maxLength={20}
                placeholder="签发机构" aria-label="签发机构"
                onChange={(e) => editTheme({ coverIssuer: e.target.value })} />
              <input className="input grow" value={theme.coverSub} maxLength={24}
                placeholder="封面副题" aria-label="封面副题"
                onChange={(e) => editTheme({ coverSub: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.visaBrand} maxLength={24}
                placeholder="签证横幅英文" aria-label="签证横幅英文"
                onChange={(e) => editTheme({ visaBrand: e.target.value })} />
              <input className="input grow" value={theme.visaBrandCn} maxLength={16}
                placeholder="签证横幅中文" aria-label="签证横幅中文"
                onChange={(e) => editTheme({ visaBrandCn: e.target.value })} />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn--sm btn--ghost grow"
              disabled={!themeDirty}
              onClick={() => { setTheme({ ...config.theme }); setThemeDirty(false); }}
            >
              还原
            </button>
            <button
              className="btn btn--sm btn--primary grow"
              disabled={busy === 'theme' || !themeDirty}
              onClick={saveTheme}
            >
              {busy === 'theme' ? '保存中…' : themeDirty ? '保存模版' : '已保存'}
            </button>
          </div>
        </div>
      )}

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
        <div className="section-title">⚙️ 参数</div>

        <Toggle
          label="公开排行榜"
          hint="关掉后选手端看不到「谁盖的章最多」"
          value={settings.leaderboardPublic}
          onChange={(v) => patchSettings({ leaderboardPublic: v }, 'lb')}
        />
        <div className="tiny dim">
          报名开关搬到活动页里去了 —— 它跟着「正在办的那一场」走，
          在那儿才知道自己开的是什么。
        </div>
      </div>

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
                  {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? activities.length}
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
