import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvatarEditor from '../components/AvatarEditor.jsx';
import Avatar, { randomAvatar } from '../components/Avatar.jsx';
import { Sheet, useToast } from '../components/ui.jsx';
import { useConfig } from '../lib/config.js';
import { splitName } from './book/bookVals.js';
import { register, restore, lookup, changePin } from '../lib/player.js';

/** 预填一个随机 4 位密码：选手想改就改，不想改也不用多按键 */
function suggestPin() {
  const banned = new Set(['0000', '1111', '1234', '4321', '1212']);
  for (let i = 0; i < 30; i++) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!banned.has(pin)) return pin;
  }
  return '2468';
}

export default function Register() {
  const nav = useNavigate();
  const toast = useToast();
  const { config } = useConfig();
  const game = config?.game;
  const open = config?.settings?.registrationOpen ?? true;

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [given, setGiven] = useState('');
  const [contact, setContact] = useState('');
  const [avatar, setAvatar] = useState(() => randomAvatar());
  const [pin, setPin] = useState(() => suggestPin());
  const [busy, setBusy] = useState(false);
  // 护照上姓/名的默认猜法，同时用作两个输入框的占位提示
  const guess = useMemo(() => splitName(name), [name]);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [dupe, setDupe] = useState(null);   // 同名提醒：{ existing: [{code}] }

  // 注意：一定要用 () => submit(false) 绑定。直接写 onClick={submit} 的话
  // React 会把点击事件当第一个参数传进来，confirmNew 恒为真，重名拦截就失效了。
  async function submit(confirmNew) {
    if (!name.trim()) return toast('请先填写你的名字', 'err');
    setBusy(true);
    try {
      await register({
        name: name.trim(),
        surname: surname.trim(),
        given: given.trim(),
        contact: contact.trim(),
        avatar, pin, confirmNew: confirmNew === true,
      });
      toast('护照已生成，欢迎来到 Mini Life Game', 'ok');
      nav('/passport', { replace: true });
    } catch (err) {
      // 同名：多半是忘了密码想重新注册。先问清楚，避免一个人两个号
      if (err.status === 409 && err.body?.duplicate) {
        setDupe({ existing: err.body.existing || [] });
      } else {
        toast(err.message || '报名失败，请检查网络后重试', 'err');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--nonav">
      <div className="stack">
        <div className="center" style={{ padding: '18px 0 4px' }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🎲</div>
          <div className="eyebrow">{game?.church || 'GCGCM 迎新'}</div>
          <h1 className="title-xl" style={{ marginTop: 6 }}>{game?.title || 'Mini Life Game'}</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            {game?.subtitle || '人生护照 · Life Passport'}
          </div>
        </div>

        {!open ? (
          <div className="card center" style={{ padding: '28px 18px' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🚪</div>
            <div className="bold" style={{ marginBottom: 6 }}>报名通道已经关闭</div>
            <div className="small muted">如果你还没领到护照，请找 Reception 的同工</div>
            <button className="btn btn--ghost btn--full" style={{ marginTop: 16 }} onClick={() => setRestoreOpen(true)}>
              我已经有护照，用编号找回
            </button>
          </div>
        ) : step === 0 ? (
          <>
            <div className="card stack">
              <div className="field">
                <label className="label" htmlFor="name">你的名字 / How should we call you</label>
                <input
                  id="name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：小明 / Ming"
                  maxLength={24}
                  autoComplete="name"
                  enterKeyHint="next"
                  onKeyDown={(e) => e.key === 'Enter' && name.trim() && setStep(1)}
                />
                <div className="tiny dim">这个名字会显示在排行榜上</div>
              </div>

              {/* 护照资料页要分开印姓和名。留空就按上面的名字猜
                  （中文取首字为姓），但复姓、双名、有中间名的都会猜错，
                  所以给个地方自己填。 */}
              <div className="field">
                <label className="label">护照上的姓 / 名（选填）</label>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    id="surname"
                    className="input grow"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    placeholder={guess.surname || '姓 SURNAME'}
                    maxLength={24}
                    aria-label="护照上的姓"
                  />
                  <input
                    id="given"
                    className="input grow"
                    value={given}
                    onChange={(e) => setGiven(e.target.value)}
                    placeholder={guess.given || '名 GIVEN NAMES'}
                    maxLength={24}
                    aria-label="护照上的名"
                  />
                </div>
                <div className="tiny dim">
                  {name.trim() && !surname.trim() && !given.trim()
                    ? `不填就印成「${guess.surname || '—'} / ${guess.given || '—'}」`
                    : '只印在护照资料页上，排行榜仍用上面的名字'}
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="contact">微信号 / 邮箱（选填）</label>
                <input
                  id="contact"
                  className="input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="方便活动后联系你"
                  maxLength={64}
                />
                <div className="tiny dim">只有工作人员看得到，不会出现在排行榜</div>
              </div>

              <div className="divider" />

              <div className="field">
                <label className="label" htmlFor="pin">4 位密码</label>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    id="pin"
                    className="input input--code grow"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    placeholder="0000"
                  />
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setPin(suggestPin())}
                    style={{ height: 50 }}
                  >
                    🎲 换一个
                  </button>
                </div>
                <div className="tiny dim">
                  已经帮你随机生成了一个，想改成好记的也行。
                  <br />只有换手机、清了缓存时才需要用它找回护照。
                </div>
              </div>
            </div>

            <button className="btn btn--primary btn--lg btn--full" disabled={!name.trim() || pin.length !== 4} onClick={() => setStep(1)}>
              下一步：捏个头像 →
            </button>

            <button className="btn btn--ghost btn--full" onClick={() => setRestoreOpen(true)}>
              已经报过名？用编号找回护照
            </button>

            <div className="card card--flat">
              <div className="section-title">这是什么</div>
              <div className="small muted" style={{ lineHeight: 1.7 }}>
                这是一场 60 分钟的浓缩人生。你会抽到不同的起点，闯 {config?.stations?.length ?? 8} 个关卡赚取积分，
                途中可能撞上人生的意外，也可以随时去恩典站寻求帮助。
                <br /><br />
                你的护照和积分<span className="gold bold">绑定到个人</span>：
                就算中途组队变动、或者帮了别人，过关后工作人员也只在你自己的护照上盖章记分。
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card stack">
              <div className="section-title">捏一个你的形象</div>
              <AvatarEditor value={avatar} onChange={setAvatar} size={132} />
            </div>

            <div className="card card--flat row">
              <Avatar config={avatar} size={46} />
              <div className="grow">
                <div className="bold">{name || '未命名'}</div>
                <div className="tiny dim">确认之后，头像和名字在游戏开始前都还能改</div>
              </div>
            </div>

            <button className="btn btn--primary btn--lg btn--full" disabled={busy} onClick={() => submit(false)}>
              {busy ? '正在生成护照…' : '生成我的人生护照 🛂'}
            </button>
            <button className="btn btn--ghost btn--full" onClick={() => setStep(0)} disabled={busy}>
              ← 返回改名字
            </button>
          </>
        )}
      </div>

      <RestoreSheet open={restoreOpen} onClose={() => setRestoreOpen(false)} />

      <Sheet open={!!dupe} onClose={() => setDupe(null)} title="这个名字已经报过名了">
        <div className="stack">
          <div className="small muted" style={{ lineHeight: 1.75 }}>
            已经有人用「<span className="gold bold">{name.trim()}</span>」报名了
            {dupe?.existing?.length ? (
              <>（{dupe.existing.map((e) => `${e.code} 号`).join('、')}）</>
            ) : null}
            。
          </div>

          <div className="card card--flat card--tight">
            <div className="small bold" style={{ marginBottom: 4 }}>如果那就是你</div>
            <div className="tiny muted" style={{ lineHeight: 1.7 }}>
              请用原来的编号 + 4 位密码找回，<span className="bold">不要重新报名</span> ——
              重新报名会多出一个空号，你之前闯关拿的分数也会留在旧号上。
              <br />
              密码忘了就找 Reception 的同工，他们能当场帮你重置。
            </div>
          </div>

          <button
            className="btn btn--primary btn--full"
            onClick={() => { setDupe(null); setRestoreOpen(true); }}
          >
            那是我，去找回护照
          </button>
          <button
            className="btn btn--ghost btn--full"
            disabled={busy}
            onClick={() => { setDupe(null); submit(true); }}
          >
            不是我，我是另一个「{name.trim()}」
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * 清了缓存 / 换了手机 / 忘了密码：在这里找回护照。
 *
 * 三件事：
 *   · 编号想不起来 —— 输名字片段找，找到直接填进去
 *   · 编号 + 密码 —— 正常找回
 *   · 密码不好记 —— 用原密码换一个，换完直接进护照
 *
 * 按名字查只回编号和姓名，不回密码；这两样排行榜上本来就是公开的。
 */
export function RestoreSheet({ open, onClose }) {
  const nav = useNavigate();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [matches, setMatches] = useState(null);   // null = 还没查过
  const [seeking, setSeeking] = useState(false);

  const [changing, setChanging] = useState(false);
  const [newPin, setNewPin] = useState('');

  async function find() {
    const kw = q.trim();
    if (kw.length < 2) return toast('至少输两个字', 'warn');
    setSeeking(true);
    try {
      setMatches(await lookup(kw));
    } catch (err) {
      toast(err.message || '查找失败', 'err');
    } finally {
      setSeeking(false);
    }
  }

  async function go() {
    setBusy(true);
    try {
      if (changing) {
        await changePin({ code: code.trim(), pin: pin.trim(), newPin: newPin.trim() });
        toast('密码已改，护照也找回来了', 'ok');
      } else {
        await restore({ code: code.trim(), pin: pin.trim() });
        toast('护照已找回', 'ok');
      }
      onClose?.();
      nav('/passport', { replace: true });
    } catch (err) {
      toast(err.message || '找回失败', 'err');
    } finally {
      setBusy(false);
    }
  }

  const ready = code.trim() && pin.length === 4 && (!changing || newPin.length === 4);

  return (
    <Sheet open={open} onClose={onClose} title="找回我的护照">
      <div className="stack">
        <div className="small muted">
          输入你的编号和 4 位密码。编号想不起来就用下面的名字查。
        </div>

        {/* 用名字找编号 */}
        <div className="field">
          <label className="label">想不起编号？输名字找一下</label>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input grow"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="名字里的两个字就行"
              maxLength={24}
              enterKeyHint="search"
              onKeyDown={(e) => e.key === 'Enter' && find()}
            />
            <button className="btn btn--sm" disabled={seeking} onClick={find}>
              {seeking ? '查…' : '查找'}
            </button>
          </div>

          {matches !== null && (
            matches.length === 0 ? (
              <div className="tiny dim">没找到。换个写法试试，或者找 Reception 的同工。</div>
            ) : (
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {matches.map((m) => (
                  <button
                    key={m.code}
                    className={`btn btn--sm ${code === m.code ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => { setCode(m.code); toast(`已填入 ${m.code} 号`, 'ok'); }}
                  >
                    {m.code} 号 · {m.name}
                  </button>
                ))}
                <div className="tiny dim">点一下就填进下面的编号栏。还是要输密码。</div>
              </div>
            )
          )}
        </div>

        <div className="divider" />

        <div className="field">
          <label className="label">编号</label>
          <input
            className="input input--code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="07"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="label">{changing ? '原来的 4 位密码' : '4 位密码'}</label>
          <input
            className="input input--code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            enterKeyHint="go"
            onKeyDown={(e) => e.key === 'Enter' && ready && go()}
          />
        </div>

        {changing && (
          <div className="field">
            <label className="label">改成新的 4 位密码</label>
            <input
              className="input input--code"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              enterKeyHint="go"
              onKeyDown={(e) => e.key === 'Enter' && ready && go()}
            />
            <div className="tiny dim">改完直接进护照，不用再登一次。</div>
          </div>
        )}

        <button className="btn btn--primary btn--full" disabled={busy || !ready} onClick={go}>
          {busy ? '处理中…' : changing ? '改密码并进护照' : '找回护照'}
        </button>

        <button
          className="btn btn--ghost btn--full"
          onClick={() => { setChanging((v) => !v); setNewPin(''); }}
        >
          {changing ? '← 不改了，只找回护照' : '顺便把密码改成好记的'}
        </button>

        <div className="tiny dim">
          原密码也想不起来了：找 Reception 的同工，他们可以帮你重置。别重新报名 ——
          会多出一个空号，分数也对不上。
        </div>
      </div>
    </Sheet>
  );
}
