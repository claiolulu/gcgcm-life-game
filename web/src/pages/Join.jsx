import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { NetBar, useToast } from '../components/ui.jsx';
import { api } from '../lib/api.js';
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
      setInfo(await api(`/api/activity/${id}`));
    } catch (e) {
      setErr(e.message || '打不开这场活动');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const signedUp = !!me?.signups?.includes(id);

  async function toggle() {
    if (!player.session) {
      // 领完护照回到这一页，回来之后下面那个 effect 会自动把名报上
      nav(`/register?next=${encodeURIComponent(`/join/${id}`)}&signup=${encodeURIComponent(id)}`);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/activity/${id}/signup`, {
        method: signedUp ? 'DELETE' : 'POST', token: player.session.token,
      });
      await refreshMe();
      await load();
      toast(signedUp ? '已取消报名' : '报名成功，活动当天带上护照', 'ok');
    } catch (e) {
      toast(e.message || '没报上，再试一次', 'err');
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="page">
        <NetBar />
        <div className="card stack">
          <div className="section-title">打不开这场活动</div>
          <div className="tiny dim">{err}</div>
          <Link className="btn btn--sm" to="/">回首页</Link>
        </div>
      </div>
    );
  }
  if (!info) return <div className="page"><NetBar /><div className="dim">正在载入…</div></div>;

  const a = info.activity;

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
        {!player.session ? (
          <>
            <div className="small">
              先领一本人生护照 —— 报名、盖章、看自己参加过哪些活动，都在那本护照上。
            </div>
            <button className="btn btn--primary btn--full" onClick={toggle}>
              领护照并报名 →
            </button>
            <Link className="btn btn--ghost btn--full" to={`/restore?next=${encodeURIComponent(`/join/${id}`)}`}>
              我已经有护照了，用编号找回
            </Link>
          </>
        ) : (
          <>
            <div className="small">
              {signedUp
                ? `${me?.name}，你已经报名了。活动当天带上护照，找同工扫码盖章。`
                : `${me?.name}，报个名让同工知道你会来。`}
            </div>
            <button
              className={`btn btn--full ${signedUp ? 'btn--ghost' : 'btn--primary'}`}
              disabled={busy}
              onClick={toggle}
            >
              {busy ? '…' : signedUp ? '取消报名' : '我要报名'}
            </button>
            <Link className="btn btn--ghost btn--full" to="/passport">打开我的护照</Link>
          </>
        )}
      </div>
    </div>
  );
}
