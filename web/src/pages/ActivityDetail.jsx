import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import RowEditor from '../components/RowEditor.jsx';
import { NetBar, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff, allPlayers } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';

/**
 * 一场活动的详情页。
 *
 * 打卡本里「一场活动」就是一切的中心 —— 护照上的一页、同工要盖的那个章、
 * 现在开不开放报名，全都长在它身上。所以总控台只留一份活动清单，
 * 点进来才是这一场的全部。
 *
 * 活动清单在服务端是整份存的（settings 的 _activities），所以这里改一场
 * 也是把整份提交回去 —— 少一个「只改一场」的接口，也就少一处能和清单
 * 顺序打架的地方。
 */

const STATE_META = {
  upcoming: { icon: '🗓', label: '还没到', hint: '护照上看得到这一页，但还没到日子。同工也可以提前盖章，没有拦。' },
  live:     { icon: '🎯', label: '进行中', hint: '同工扫码时默认盖这一场。同时只能有一场进行中。活动期间护照信息锁定，改不了名字。' },
  done:     { icon: '✅', label: '已办完', hint: '章还在，页还在。下一场开始之前，大家可以回来改自己的名字和头像。' },
};

export default function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;

  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState(null);      // 这一场的本地改动，null = 还没载入
  const [dirty, setDirty] = useState(false);

  const activities = config?.activities || [];
  const sources = config?.visaSources || [];
  const tpl = config?.visaTemplate || {};
  const settings = config?.settings || {};
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line

  useEffect(() => {
    if (dirty) return;
    const hit = activities.find((a) => a.id === id);
    if (hit) setDraft(JSON.parse(JSON.stringify(hit)));
  }, [activities, id, dirty]);

  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  /** 这一场谁盖过章 —— 顺便就是「谁来了」 */
  const attended = useMemo(() => players
    .filter((p) => p.stations?.[id])
    .map((p) => ({ ...p, stamp: p.stations[id] }))
    .sort((a, b) => b.stamp.at - a.stamp.at), [players, id]);

  if (!config) return <div className="page"><NetBar /><div className="dim">正在载入…</div></div>;
  if (!draft) {
    return (
      <div className="page">
        <NetBar />
        <div className="card stack">
          <div className="section-title">找不到这一场活动</div>
          <div className="tiny dim">它可能刚被别人删掉了。</div>
          <Link className="btn btn--sm" to="/staff/admin">← 回总控台</Link>
        </div>
      </div>
    );
  }

  const edit = (patch) => { setDraft((c) => ({ ...c, ...patch })); setDirty(true); };
  const editPage = (patch) => edit({ page: { ...(draft.page || {}), ...patch } });

  const rowOps = (rows, save) => ({
    edit: (i, patch) => save(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))),
    move: (i, d) => { const n = [...rows]; [n[i], n[i + d]] = [n[i + d], n[i]]; save(n); },
    remove: (i) => save(rows.filter((_, k) => k !== i)),
    add: () => save([...rows, { key: `r${Date.now().toString(36)}`, label: '', src: 'text', text: '', accent: false }]),
  });

  const links = draft.links || [];
  const linkOps = {
    edit: (k, patch) => edit({ links: links.map((l, j) => (j === k ? { ...l, ...patch } : l)) }),
    remove: (k) => edit({ links: links.filter((_, j) => j !== k) }),
    add: () => edit({ links: [...links, { icon: '🔗', label: '', url: '' }] }),
  };

  /** 把这一场的改动写回整份清单 */
  async function save(patch = {}) {
    const next = { ...draft, ...patch };
    setBusy('save');
    try {
      // 设成「进行中」的时候顺手把别人降下来 —— 服务端只允许一场，
      // 与其让同工先去别的页面关掉再回来，不如在这里替他做了
      const list = activities.map((a) => {
        if (a.id === id) return next;
        if (next.state === 'live' && a.state === 'live') return { ...a, state: 'done' };
        return a;
      });
      const res = await api('/api/admin/activities', { method: 'POST', body: { activities: list }, token });
      setDirty(false);
      setDraft(res.activities.find((a) => a.id === id) || next);
      await loadConfig();
      toast('已保存', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function setState(state) {
    const demoted = state === 'live' ? activities.filter((a) => a.id !== id && a.state === 'live') : [];
    if (demoted.length) {
      const ok = await ask({
        title: `把「${draft.name}」设成进行中？`,
        body: `同时只能有一场进行中，所以「${demoted.map((a) => a.name).join('、')}」会被标成「已办完」。`,
        confirmText: '就这么办',
      });
      if (!ok) return;
    }
    edit({ state });
    await save({ state });
  }

  async function pickPhoto(file) {
    if (!file) return;
    setBusy('photo');
    try {
      const res = await uploadPhoto(file, token);
      edit({ photo: res.url });
      toast(`配图已上传（${Math.round(res.bytes / 1024)}KB），记得保存`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function patchSettings(patch, key) {
    setBusy(key);
    try {
      await api('/api/admin/settings', { method: 'POST', body: patch, token });
      await loadConfig();
    } catch (err) {
      toast(err.message || '改不动', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const n = attended.length;
    const ok = await ask({
      title: `删掉「${draft.name}」？`,
      danger: true,
      confirmText: '删掉',
      body: n > 0
        ? `已经有 ${n} 个人在这一场盖过章。删掉之后护照里不再有这一页，那些记录还在数据库里但不会显示。确定要删吗？`
        : '还没有人在这一场盖过章，删掉没有影响。',
    });
    if (!ok) return;
    setBusy('save');
    try {
      await api('/api/admin/activities', {
        method: 'POST', body: { activities: activities.filter((a) => a.id !== id) }, token,
      });
      await loadConfig();
      nav('/staff/admin', { replace: true });
    } catch (err) {
      toast(err.message || '删不掉', 'err');
      setBusy(null);
    }
  }

  const meta = STATE_META[draft.state] || STATE_META.upcoming;
  const isLive = draft.state === 'live';

  return (
    <div className="page">
      <NetBar />

      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <Link className="tiny dim" to="/staff/admin">← 总控台</Link>
          <h1 style={{ margin: '2px 0 0' }}>
            <span style={{ marginRight: 8 }}>{draft.icon}</span>
            {draft.name || '（还没起名字）'}
          </h1>
        </div>
        <button
          className="btn btn--sm btn--primary"
          disabled={busy === 'save' || !dirty}
          onClick={() => save()}
        >
          {busy === 'save' ? '保存中…' : dirty ? '保存' : '已保存'}
        </button>
      </div>

      <div className="cols-2">

      {/* 这一场的状态 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🎯 这一场</div>
        <div className="row" style={{ gap: 8 }}>
          {Object.entries(STATE_META).map(([k, m]) => (
            <button
              key={k}
              className={`btn btn--sm grow ${draft.state === k ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy === 'save'}
              onClick={() => setState(k)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="tiny dim">{meta.hint}</div>

        {/* 报名开关只在进行中这一场露出来 —— 它是全场唯一的一个开关，
            放在「现在正在办的这一场」旁边，才知道自己开的是什么 */}
        {isLive ? (
          <div className="card card--tight row-between" style={{ gap: 10 }}>
            <div>
              <div className="small bold">开放报名</div>
              <div className="tiny dim">
                开着的时候，今晚新来的人可以自己扫码领一本护照。
                这是全场唯一的报名开关。
              </div>
            </div>
            <button
              className={`btn btn--sm ${settings.registrationOpen ? 'btn--primary' : 'btn--ghost'}`}
              disabled={busy === 'reg'}
              onClick={() => patchSettings({ registrationOpen: !settings.registrationOpen }, 'reg')}
            >
              {settings.registrationOpen ? '开' : '关'}
            </button>
          </div>
        ) : (
          <div className="tiny dim">
            报名开关在「进行中」那一场里 —— 现在这一场不是。
          </div>
        )}
      </div>

      {/* 谁来了 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">
          👥 已参加（{attended.length}）
        </div>
        {attended.length === 0 ? (
          <div className="tiny dim">还没有人在这一场盖章。同工扫码盖了章，这里就会出现。</div>
        ) : (
          <div className="stack-sm">
            {attended.map((p) => (
              <div key={p.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
                <Avatar avatar={p.avatar} size={28} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div className="tiny dim">
                    {p.code} · {ago(p.stamp.at)}
                    {p.stamp.operator ? ` · ${p.stamp.operator} 盖的` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 基本信息 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📝 基本信息</div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" style={{ flex: '0 0 52px', textAlign: 'center' }}
            value={draft.icon} maxLength={4} aria-label="图标"
            onChange={(e) => edit({ icon: e.target.value })} />
          <input className="input grow" value={draft.name} maxLength={20} placeholder="活动名"
            onChange={(e) => edit({ name: e.target.value })} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" value={draft.date} maxLength={20} placeholder="日期（留空显示「待定」）"
            onChange={(e) => edit({ date: e.target.value })} />
          <input className="input grow" value={draft.tag} maxLength={12} placeholder="类型"
            onChange={(e) => edit({ tag: e.target.value })} />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input grow" value={draft.en} maxLength={40} placeholder="英文名（选填）"
            onChange={(e) => edit({ en: e.target.value })} />
          <input className="input grow" value={draft.host} maxLength={20} placeholder="负责人"
            onChange={(e) => edit({ host: e.target.value })} />
        </div>
        <input className="input" value={draft.desc} maxLength={200} placeholder="这场活动是什么（显示在签证页上）"
          onChange={(e) => edit({ desc: e.target.value })} />
        <div className="tiny dim">
          id <code>{draft.id}</code> —— 盖过的章认这个 id，所以建了就不能改。
        </div>
      </div>

      {/* 配图 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🖼 配图</div>
        <div className="tiny dim">贴在签证页右上角，横构图最好看。上传完还要点保存才算数。</div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div style={{
            flex: '0 0 120px', height: 76, border: '1px solid var(--line)', borderRadius: 3,
            overflow: 'hidden', background: 'var(--ink-3)',
            backgroundImage: draft.photo ? `url("${draft.photo}")` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!draft.photo && <span className="tiny dim">无图</span>}
          </div>
          <div className="stack-sm grow">
            <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
              {busy === 'photo' ? '上传中…' : draft.photo ? '换一张' : '＋ 选一张图'}
              <input type="file" accept="image/*" hidden disabled={busy === 'photo'}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickPhoto(f); }} />
            </label>
            {draft.photo && (
              <button className="btn btn--sm btn--ghost" onClick={() => edit({ photo: '' })}>去掉</button>
            )}
          </div>
        </div>
      </div>

      {/* 页面链接 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🔗 页面链接（{links.length}）</div>
        <div className="tiny dim">
          印成签证页底下一排可点的小图标 —— 相册、报名表、场地地图、群。
          地址要以 http:// 或 https:// 开头。
        </div>
        <div className="stack-sm">
          {links.map((l, k) => (
            <div key={k} className="row" style={{ gap: 6 }}>
              <input className="input" style={{ flex: '0 0 46px', textAlign: 'center' }}
                value={l.icon} maxLength={4} aria-label="图标"
                onChange={(e) => linkOps.edit(k, { icon: e.target.value })} />
              <input className="input" style={{ flex: '0 0 92px' }}
                value={l.label} maxLength={12} placeholder="名字"
                onChange={(e) => linkOps.edit(k, { label: e.target.value })} />
              <input className="input grow" value={l.url} maxLength={300}
                placeholder="https://…" inputMode="url"
                onChange={(e) => linkOps.edit(k, { url: e.target.value })} />
              <button className="btn btn--sm btn--ghost" onClick={() => linkOps.remove(k)} title="删掉">✕</button>
            </div>
          ))}
          {links.length < 6 && (
            <button className="btn btn--sm btn--ghost" onClick={linkOps.add}>+ 加一个链接</button>
          )}
        </div>
      </div>

      {/* 这一页的版式 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">
          🎫 这一页的版式 —— {draft.page ? <b style={{ color: 'var(--gold)' }}>自己一套</b> : '跟随模版'}
        </div>
        {!draft.page ? (
          <>
            <div className="tiny dim">
              这一页现在长得和总控台的「签证页模版」一样，改模版它就跟着变。
            </div>
            <button className="btn btn--sm btn--ghost"
              onClick={() => edit({ page: JSON.parse(JSON.stringify(tpl)) })}>
              改成自己一套
            </button>
          </>
        ) : (
          <>
            <div className="tiny dim">这一页已经脱离模版了 —— 之后改模版<b>不会</b>再动到它。</div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={draft.page.banner ?? ''} maxLength={16}
                placeholder="横幅上那个词" onChange={(e) => editPage({ banner: e.target.value })} />
              <input className="input grow" value={draft.page.stationLabel ?? ''} maxLength={30}
                placeholder="右栏标题" onChange={(e) => editPage({ stationLabel: e.target.value })} />
            </div>
            <input className="input" value={draft.page.annotationLabel ?? ''} maxLength={30}
              placeholder="备注标题" onChange={(e) => editPage({ annotationLabel: e.target.value })} />
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              {[['showPhoto', '显示配图'], ['showAnnotation', '显示备注'], ['showLinks', '显示链接']].map(([k, label]) => (
                <label key={k} className="tiny row" style={{ gap: 5, alignItems: 'center' }}>
                  <input type="checkbox" checked={draft.page[k] !== false}
                    onChange={(e) => editPage({ [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <RowEditor
              rows={draft.page.rows || []}
              sources={sources}
              ops={rowOps(draft.page.rows || [], (rows) => editPage({ rows }))}
            />
            <button className="btn btn--sm btn--ghost" onClick={() => edit({ page: undefined })}>
              回到跟随模版（自己这套会丢掉）
            </button>
          </>
        )}
      </div>

      {/* 删掉 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🗑 删掉这一场</div>
        <div className="tiny dim">
          护照里不再有这一页。已经盖过的章还在数据库里，但不会再显示。
        </div>
        <button className="btn btn--danger btn--full" disabled={busy === 'save'} onClick={remove}>
          ⚠️ 删掉「{draft.name}」
        </button>
      </div>

      </div>
    </div>
  );
}
