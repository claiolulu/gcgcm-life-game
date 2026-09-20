import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { NetBar, useToast } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { track } from '../lib/track.js';
import { usePlayer, refreshMe } from '../lib/player.js';

/**
 * 扫二维码进来的报名页。
 *
 * 两种人：
 *   已经有护照的 —— 一下就报上了
 *   还没有的     —— 先去领护照，领完自动回到这一页并报上名
 *
 * 之所以不做「只留个名字」的轻报名：这套系统里「你是谁」就是那本护照，
 * 报名时另开一条只有名字的记录，活动当天同工要盖章的时候对不上人。
 */
export default function Join() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const player = usePlayer();
  const me = player.me;

  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr(null);
      setInfo(await api(`/api/activity/${id}`, { token: player.session?.token }));
      track('join', { activityId: id, once: true });
    } catch (e) {
      // 区分「网断了」和「服务端说没这场活动」—— 两者要给的下一步完全不同。
      // api() 在网络层失败时把 status 设成 0（见 ApiError.offline）
      setErr({ offline: e.offline === true || e.status === 0, message: e.message || '打不开这场活动' });
    }
  }, [id, player.session?.token]);

  useEffect(() => { load(); }, [load]);

  // 从通知点进来的带 ?from=push，扫参与者分享的报名码进来的带 ?from=share：
  // 记一笔，再把参数去掉，免得刷新又记一次
  const [params] = useSearchParams();
  useEffect(() => {
    const from = params.get('from');
    if (from !== 'push' && from !== 'share') return;
    track(from === 'push' ? 'notif_open' : 'share_visit', { activityId: id, once: true });
    nav(`/join/${id}`, { replace: true });
  }, [params, id, nav]);

  const signedUp = !!me?.signups?.includes(id);
  const registration = info?.registration || {
    status: info?.activity?.state === 'done' ? 'ended' : info?.activity?.state === 'live' ? 'live' : 'open',
    label: info?.activity?.state === 'done' ? '活动已结束 · 可以补登记'
      : info?.activity?.state === 'live' ? '活动进行中 · 仍可报名' : '报名中',
    message: '',
    late: info?.activity?.state !== 'upcoming',
  };
  // 开场后和结束后都照收报名，只是提示语不一样、总控台会标成「补报名」。
  // 旧版服务端没有 late 字段，那时只有 open 收报名 —— 保持兼容
  const signupLate = registration.late === true;
  const signupOpen = registration.status === 'open' || signupLate;

  async function toggle() {
    if (!player.session) {
      // 领完护照顺手把这场报上 —— 开场后扫码进来的人同样走这条路
      const next = encodeURIComponent(`/join/${id}`);
      nav(signupOpen ? `/register?next=${next}&signup=${encodeURIComponent(id)}` : `/register?next=${next}`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/activity/${id}/signup`, {
        method: signedUp ? 'DELETE' : 'POST', token: player.session.token,
      });
      track(signedUp ? 'cancel' : 'signup', { activityId: id });
      await refreshMe();
      await load();
      toast(signedUp ? '已取消报名'
        : signupLate ? '已记下你的报名 · 章要请同工补盖'
        : '报名成功，活动当天带上护照', 'ok');
    } catch (e) {
      toast(e.message || '没报上，再试一次', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="page">
        <NetBar online={!err.offline} />
        <div className="card stack">
          <div className="section-title">{err.offline ? '连不上服务器' : '打不开这场活动'}</div>
          <div className="tiny dim">
            {err.offline ? '看看网络，然后下拉刷新重试。' : err.message}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--sm" onClick={load}>重试</button>
            <Link className="btn btn--sm btn--ghost" to="/">回首页</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!info) return <div className="page"><NetBar /><div className="dim">正在载入…</div></div>;

  const a = info.activity;
  const passportUrl = `/passport?activity=${encodeURIComponent(id)}`;

  return (
    <div className="page">
      <NetBar />

      <div className="card stack" style={{ marginBottom: 12 }}>
        {a.photo && (
          /* 整张图完整显示，高度跟着图片自己的比例走。
             原来是「固定 150 高 + cover」—— 那是按框裁图，竖构图的照片
             只剩中间一条，海报上的字直接被切掉。
             max-height 是给竖图兜底的：不裁，但别把报名按钮顶到屏幕外。 */
          <img
            src={a.photo} alt=""
            style={{
              display: 'block', margin: '0 auto',
              // 框贴着图走：给死宽度的话，竖构图两边会空出两条底色带
              width: 'auto', height: 'auto',
              maxWidth: '100%', maxHeight: '52vh', borderRadius: 4,
            }}
          />
        )}
        <div className="eyebrow">GCGCM {a.tag || '活动'}</div>
        <h1 style={{ margin: '2px 0 0' }}>{a.icon} {a.name}</h1>
        {a.en && <div className="tiny dim" style={{ letterSpacing: '.16em' }}>{a.en.toUpperCase()}</div>}

        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          <div><div className="tiny dim">时间</div><div className="small bold">{a.date || '待定'}</div></div>
          {a.host && <div><div className="tiny dim">负责人</div><div className="small bold">{a.host}</div></div>}
          <div><div className="tiny dim">已报名</div><div className="small bold">{info.signupCount} 人</div></div>
        </div>

        {a.desc && <div className="small" style={{ lineHeight: 1.9 }}>{a.desc}</div>}

        <div className="card card--tight" style={{
          borderColor: signupOpen ? 'rgba(47,97,72,.35)' : 'rgba(92,26,34,.28)',
        }}>
          <div className="small bold">{registration.label}</div>
          <div className="tiny dim" style={{ marginTop: 4 }}>{registration.message}</div>
        </div>

        {(a.links || []).length > 0 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {a.links.map((l, i) => (
              <a key={i} className="btn btn--sm btn--ghost" href={l.url} target="_blank" rel="noopener noreferrer">
                {l.icon} {l.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        {info.eligible === false ? (
          /* 这场活动限定了标签，而这个人（或匿名扫码的人）不在里面。
             页面照常打开、信息照常看 —— 只是把报名按钮换成一句能照做的说明。
             之前服务端在这里直接 404，落地页就成了一个打不开的死页 */
          <>
            <div className="small">这场活动只对特定标签的成员开放。</div>
            <div className="tiny dim">
              {player.session
                ? '你的护照不在这个名单里。如果觉得是弄错了，找同工把标签加上就行。'
                : '如果你是受邀的成员，先找回自己的护照再回到这个页面。'}
            </div>
            {player.session
              ? <Link className="btn btn--ghost btn--full" to="/passport">打开我的护照</Link>
              : (
                <Link className="btn btn--ghost btn--full" to={`/restore?next=${encodeURIComponent(`/join/${id}`)}`}>
                  用编号找回护照
                </Link>
              )}
          </>
        ) :
        !player.session ? (
          <>
            <div className="small">
              {!signupOpen
                ? '即使这场活动不再接受报名，你仍然可以领取自己的人生护照，用于之后的活动。'
                : signupLate
                  ? '先领一本人生护照 —— 领完会把你记在这场活动里；章要请同工或管理员补盖。'
                  : '先领一本人生护照 —— 领完会自动报名这场活动。'}
            </div>
            <button className="btn btn--primary btn--full" onClick={toggle}>
              {!signupOpen ? '领取人生护照 →' : signupLate ? '领护照并登记 →' : '领护照并报名 →'}
            </button>
            <Link className="btn btn--ghost btn--full" to={`/restore?next=${encodeURIComponent(`/join/${id}`)}`}>
              我已经有护照了，用编号找回
            </Link>
          </>
        ) : signupOpen ? (
          <>
            <div className="small">
              {signedUp
                ? signupLate
                  ? `${me?.name}，你的报名已经记下了。${registration.message}`
                  : `${me?.name}，你已经报名了。活动当天带上护照，找同工扫码盖章。`
                : signupLate
                  ? `${me?.name}，${registration.message}`
                  : `${me?.name}，报个名让同工知道你会来。`}
            </div>
            <button
              className={`btn btn--full ${signedUp ? 'btn--ghost' : 'btn--primary'}`}
              disabled={busy}
              onClick={toggle}
            >
              {busy ? '…' : signedUp ? '取消报名' : signupLate ? '我也来了 · 登记一下' : '我要报名'}
            </button>
            <Link className="btn btn--ghost btn--full" to={passportUrl}>打开我的护照</Link>
          </>
        ) : (
          <>
            <div className="small">
              {signedUp
                ? `${me?.name}，你的报名记录还在。${registration.message}`
                : `${me?.name}，${registration.message}`}
            </div>
            <Link className="btn btn--primary btn--full" to={passportUrl}>打开我的护照</Link>
          </>
        )}
      </div>
    </div>
  );
}
