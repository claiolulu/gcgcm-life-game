import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import IconPicker from '../components/IconPicker.jsx';
import { NetBar, useToast, useConfirm, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff, allPlayers } from '../lib/staff.js';
import { uploadPhoto } from '../lib/photo.js';
import { onTick } from '../lib/realtime.js';
import QRCode from 'qrcode';

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

  /* --------------------------- 报名 --------------------------- */

  const [signups, setSignups] = useState([]);
  const joinUrl = `${window.location.origin}/join/${id}`;

  useEffect(() => {
    if (!token) return;
    const pull = () => api(`/api/admin/activity/${id}/signups`, { token })
      .then((r) => setSignups(r.signups || [])).catch(() => {});
    pull();
    const off = onTick((p) => { if (p.reason === 'signup') pull(); });
    const timer = setInterval(pull, 20_000);
    return () => { off(); clearInterval(timer); };
  }, [id, token]);

  /** 这一场谁盖过章 —— 顺便就是「谁来了」 */
  const attended = useMemo(() => players
    .filter((p) => p.stations?.[id])
    .map((p) => ({ ...p, stamp: p.stations[id] }))
    .sort((a, b) => b.stamp.at - a.stamp.at), [players, id]);

  /**
   * 自动保存。
   *
   * 停手一秒多就存一次 —— 这一页全是零碎的输入框（名字、日期、链接、
   * 配图），每改一处都要人记得去按保存，迟早有人改完直接关掉。
   *
   * 只在 dirty 时排，存完 dirty 清掉、定时器自然不再排，不会来回打转。
   * 每次改动都重置定时器，所以打字中途不会插进来存一半。
   * 保存按钮留着：想立刻落盘、或者自动保存失败过一次，还得有个手动的。
   *
   * 位置必须在所有早退（!config / !draft）之前 —— hook 写在条件返回
   * 后面的话，走早退那一支时 hook 数量对不上，整页直接白掉（React #310）。
   * save 是函数声明，会提升，在这儿引用没问题。
   */
  useEffect(() => {
    if (!dirty || busy) return;
    const t = setTimeout(() => { save({}, { quiet: true }); }, 1200);
    return () => clearTimeout(t);
  }, [draft, dirty, busy]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 栏目和版式都在画布编辑器里改了（/staff/admin/a/<id>/design），
  // 这一页只管这一场本身的信息、配图、链接和报名。

  const links = draft.links || [];
  const linkOps = {
    edit: (k, patch) => edit({ links: links.map((l, j) => (j === k ? { ...l, ...patch } : l)) }),
    remove: (k) => edit({ links: links.filter((_, j) => j !== k) }),
    add: () => edit({ links: [...links, { icon: '🔗', label: '', url: '' }] }),
  };

  /** 把这一场的改动写回整份清单 */
  async function save(patch = {}, { quiet = false } = {}) {
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
      // 自动保存不吐提示：每停手一次弹一个「已保存」，一页填下来能弹十几次。
      // 存没存成看右上角那个按钮就够了（灰掉 = 没有未保存的改动）
      if (!quiet) toast('已保存', 'ok');
    } catch (err) {
      // 失败一定要说，自动保存也一样 —— 不吭声的话人以为存上了
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
    <div className="page page--wide">
      <NetBar />

      {/* 窄屏上按钮换行到第二排：不换的话「返回 + 标题」会被三个按钮
          挤到零宽，活动名整个看不见 */}
      <div className="row-between" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 12, flex: '1 1 200px', minWidth: 0 }}>
          {/* 返回是这一页最常按的东西之一（看完一场回去看下一场），
              原来是标题上面一行 tiny dim 的小字，又小又难点 */}
          <Link className="btn btn--ghost" to="/staff/admin" style={{ flex: '0 0 auto' }}>
            ← 总控台
          </Link>
          <h1 style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ marginRight: 8 }}>{draft.icon}</span>
            {draft.name || '（还没起名字）'}
          </h1>
        </div>
        {/* 设计和删掉各自只有一个动作，不值得各占一张卡 */}
        <div className="row" style={{ gap: 6, flex: '0 0 auto', marginLeft: 'auto' }}>
          <Link className="btn btn--sm btn--ghost" to={`/staff/admin/a/${id}/design`}>🎨 设计这一页</Link>
          {/* 自动保存已经在管了，这个按钮是给「想立刻落盘」和
              「自动保存失败过一次」留的 */}
          <button className="btn btn--sm btn--primary" disabled={busy === 'save' || !dirty}
            onClick={() => save()} title={dirty ? '立刻保存' : '没有未保存的改动'}>
            💾 保存
          </button>
          <button className="btn btn--sm btn--danger" onClick={remove} disabled={busy === 'save'}
            title={`删掉「${draft.name}」`}>🗑 删除</button>
        </div>
      </div>

      <div className="cols-2">

      {/* 宽屏下分三摞：现在怎么样 / 怎么让人来 / 这一页长什么样。
          不分的话每张卡各占一格，那一行会被最高的报名码撑到五百多，
          矮的两张底下白掉一大片（网格的行高按最高那张算，填不回去） */}
      {/* 宽屏下分三摞。报名单独占最右边一摞 —— 它最高（二维码 + 名单），
          和别的卡挤在一行的话，那一行按它的高度算，旁边就白掉一大片。
          版式和删掉不在这里：各自只有一个动作，做成了右上角的按钮 */}
      {/* 宽屏下分三摞：
            左   这一场是什么（基本信息、链接、配图）
            中   现在怎么样、怎么让人来（状态、报名码）
            右   谁来了 —— 单独一摞，人多了也有地方看（列表自己滚）
          版式和删掉不在这里：各自只有一个动作，做成了右上角的按钮 */}
      <div className="cell-stack">
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
        {/* 每一栏该填什么就写在灰字提示里，不再在框下面另起一行解释 ——
            解释常年占着地方，而真正要看它的只有第一次填的那一下 */}
        <input className="input" value={draft.issuer || ''} maxLength={24}
          placeholder="签发机构（留空用护照模版上的；控制号那栏印「机构 + 日期」）"
          onChange={(e) => edit({ issuer: e.target.value })} />
        <textarea className="input" rows={4} value={draft.desc} maxLength={200}
          placeholder="这场活动是什么。印在签证页的备注栏里，翻到这一页就看到这段。"
          onChange={(e) => edit({ desc: e.target.value })}
          style={{ resize: 'vertical', minHeight: 92, lineHeight: 1.7 }} />
        <div style={{ height: 1, background: 'var(--line-soft)' }} />
        <div className="section-title">🔗 页面链接（{links.length}）</div>
        <div className="tiny dim">
          印成签证页底下一排可点的小图标 —— 相册、报名表、场地地图、群。
          地址要以 http:// 或 https:// 开头。
        </div>
        <div className="stack-sm">
          {links.map((l, k) => (
            <div key={k} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <IconPicker
                value={l.icon} label={l.label}
                onChange={(patch) => linkOps.edit(k, patch)}
              />
              <input className="input" style={{ flex: '1 1 90px' }}
                value={l.label} maxLength={12} placeholder="名字"
                onChange={(e) => linkOps.edit(k, { label: e.target.value })} />
              <input className="input" style={{ flex: '3 1 160px' }} value={l.url} maxLength={300}
                placeholder="https://…" inputMode="url"
                onChange={(e) => linkOps.edit(k, { url: e.target.value })} />
              <button className="btn btn--sm btn--ghost" onClick={() => linkOps.remove(k)} title="删掉">✕</button>
            </div>
          ))}
          {links.length < 6 && (
            <button className="btn btn--sm btn--ghost" onClick={linkOps.add}>+ 加一个链接</button>
          )}
        </div>
        <div style={{ height: 1, background: 'var(--line-soft)' }} />
        <div className="section-title">🖼 配图</div>
        <div className="tiny dim">贴在签证页右上角，横构图最好看。上传完还要点保存才算数。</div>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <div style={{
            flex: '0 0 120px', height: 76, border: '1px solid var(--line)', borderRadius: 3,
            overflow: 'hidden', background: 'var(--ink-3)',
            backgroundImage: draft.photo ? `url("${draft.photo}")` : 'none',
            // contain 而不是 cover：这一块是给人确认「我传上去的是什么」的，
            // 裁着显示会让人以为图就是那样
            backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
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
      </div>

      <div className="cell-stack">
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
      {/* 报名 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">📣 报名（{signups.length}）</div>
        <div className="tiny dim">
          把这个码贴出去 / 投到屏幕上，大家扫了就能报名。没有护照的人会先领一本，
          领完自动报上 —— 所以活动当天同工扫码盖章时，人是对得上的。
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto', background: '#fff', padding: 8, borderRadius: 4 }}>
            <JoinQR url={joinUrl} />
          </div>
          <div className="stack-sm grow" style={{ minWidth: 180 }}>
            <div className="tiny dim">扫不了就发这个链接：</div>
            <input className="input" readOnly value={joinUrl} onFocus={(e) => e.target.select()} />
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => {
                navigator.clipboard?.writeText(joinUrl)
                  .then(() => toast('链接已复制', 'ok'))
                  .catch(() => toast('复制不了，长按上面那行自己选', 'warn'));
              }}
            >
              复制链接
            </button>
            <a className="btn btn--sm btn--ghost" href={joinUrl} target="_blank" rel="noopener noreferrer">
              看看别人扫到什么 →
            </a>
          </div>
        </div>

        {signups.length > 0 && (
          <div className="stack-sm">
            {signups.map((p) => {
              const came = !!attended.find((x) => x.id === p.id);
              return (
                <div key={p.id} className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <Avatar avatar={p.avatar} size={26} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div className="tiny dim">{p.code}{p.contact ? ` · ${p.contact}` : ''}</div>
                  </div>
                  <span className="tiny" style={{ flex: '0 0 auto', color: came ? 'var(--green)' : 'var(--text-3)' }}>
                    {came ? '来了 ✓' : '待到场'}
                  </span>
                </div>
              );
            })}
            {/* 报了名没来的人，是活动结束之后最该被问一句的那批 */}
            <div className="tiny dim">
              报名 {signups.length} 人，到场 {signups.filter((p) => attended.find((x) => x.id === p.id)).length} 人。
            </div>
          </div>
        )}
      </div>
      </div>

      <div className="cell-stack">
      {/* 谁来了 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">
          👥 已参加（{attended.length}）
        </div>
        {attended.length === 0 ? (
          <div className="tiny dim">还没有人在这一场盖章。同工扫码盖了章，这里就会出现。</div>
        ) : (
          /* 单独占一摞，所以给得起高度；再多就自己滚，不会把整页拉长 */
          <div className="stack-sm attend-list">
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
      </div>



      </div>
    </div>
  );
}

/**
 * 报名码。
 *
 * 单独一个组件，是因为详情页在活动数据到位之前会提前 return —— 画二维码的
 * effect 那时跑过一遍，canvas 还没挂上，之后 url 没变就不会再跑，
 * 结果是一块白板。挂成自己的组件，effect 就跟着 canvas 一起上场。
 *
 * 载荷是完整网址而不是护照码那种短串：扫的人多半还没有护照，手机相机得能
 * 直接跳过去。所以点阵会密一些，投影或打印的时候别印太小。
 */
function JoinQR({ url }) {
  const ref = React.useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !url) return;
    QRCode.toCanvas(canvas, url, {
      errorCorrectionLevel: 'M', margin: 1, width: 440,
      color: { dark: '#0d1220ff', light: '#ffffffff' },
    }, (err) => {
      if (err) return console.error('[qr]', err);
      // qrcode 会把行内 style 覆盖成位图尺寸（这里是 2 倍），画完得改回显示尺寸
      canvas.style.width = '220px';
      canvas.style.height = '220px';
    });
  }, [url]);
  return <canvas ref={ref} style={{ width: 220, height: 220, display: 'block' }} />;
}
