import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui.jsx';
import { useConfig } from '../lib/config.js';
import { login } from '../lib/staff.js';

export default function StaffLogin() {
  const nav = useNavigate();
  const toast = useToast();
  const { config } = useConfig();
  // 同工守的是某一场活动。原来这里是「关卡 + 功能站」，那是迎新游戏那套
  const stations = config?.activities || [];

  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [station, setStation] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!pin.trim()) return toast('请输入 PIN', 'err');
    setBusy(true);
    try {
      const res = await login({ pin: pin.trim(), name: name.trim(), station });
      toast(res.role === 'admin' ? '管理员已登录' : '工作人员已登录', 'ok');
      nav(res.role === 'admin' && !station ? '/staff/admin' : '/staff/scan', { replace: true });
    } catch (err) {
      toast(err.message || '登录失败', 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--nonav staff-page staff-login">
      <div className="center staff-login__hero" style={{ padding: '24px 0 18px' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
        <div className="eyebrow">Staff Console</div>
        <h1 style={{ marginTop: 4 }}>工作人员端</h1>
        <div className="small muted" style={{ marginTop: 6 }}>扫码盖章 · 支持离线操作</div>
      </div>

      <div className="card stack staff-login__card">
        <div className="field">
          <label className="label" htmlFor="pin">PIN 码</label>
          <input
            id="pin"
            className="input input--code"
            type="password"
            inputMode="text"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••"
            autoComplete="off"
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="sname">你的名字</label>
          <input
            id="sname"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="盖章时会记录是谁操作的"
            maxLength={24}
          />
        </div>

        <div className="field">
          <label className="label">你负责哪一场</label>
          <div className="opt-row" style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
            {stations.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`opt ${station === s.id ? 'opt--on' : ''}`}
                onClick={() => setStation(station === s.id ? '' : s.id)}
                style={{ height: 40 }}
              >
                {s.icon} {s.name}
              </button>
            ))}
          </div>
          <div className="tiny dim">选了之后扫码界面会直接跳到这一场，少点两下</div>
        </div>

        <button className="btn btn--primary btn--lg btn--full" disabled={busy} onClick={go}>
          {busy ? '登录中…' : '进入工作台'}
        </button>
      </div>

      <div className="card card--flat" style={{ marginTop: 14 }}>
        <div className="small muted" style={{ lineHeight: 1.7 }}>
          <span className="bold gold">离线也能盖章。</span>
          网不好的时候照常扫码，操作会存在手机本地，恢复联网后自动上传，
          <span className="bold">不会重复加分、也不会丢</span>。顶部的状态条会告诉你还有几条没传上去。
        </div>
      </div>

      <div className="center" style={{ marginTop: 18 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => nav('/')}>← 回到选手端</button>
      </div>
    </div>
  );
}
