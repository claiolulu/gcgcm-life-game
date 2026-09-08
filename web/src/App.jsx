import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';

import { ToastProvider, ConfirmProvider, Loading } from './components/ui.jsx';
import { loadConfig, useConfig } from './lib/config.js';
import { startPlayerSync, usePlayer, hasSession } from './lib/player.js';
import { startStaffSync, useStaff } from './lib/staff.js';
import { onTick } from './lib/realtime.js';

import Register from './pages/Register.jsx';
import PassportBook from './pages/book/PassportBook.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Badge from './pages/Badge.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
import StaffScan from './pages/StaffScan.jsx';
import ActivityDetail from './pages/ActivityDetail.jsx';
import ActivityDesign from './pages/ActivityDesign.jsx';
import Join from './pages/Join.jsx';
import StaffPlayer from './pages/StaffPlayer.jsx';
import Admin from './pages/Admin.jsx';

/* ------------------------------ 底部导航 ------------------------------ */

const PLAYER_TABS = [
  { to: '/passport', icon: '🛂', label: '护照' },
  { to: '/leaderboard', icon: '🏆', label: '排行榜' },
  { to: '/badge', icon: '🎖', label: '徽章' },
];

function BottomNav() {
  const { pathname } = useLocation();
  const player = usePlayer();

  const isStaff = pathname.startsWith('/staff');
  // Staff 与总控页面各自已有完整操作入口，不再叠加选手端样式的底栏。
  if (isStaff) return null;
  // 护照册是整屏的翻页界面，自带导航，不叠底部 tab
  if (pathname === '/passport') return null;
  // 画布编辑器在所有设备上都只保留自己的工具，不叠「扫码 / 总控」。
  if (pathname.endsWith('/design')) return null;
  if (pathname === '/' || pathname === '/register') return null;

  const tabs = PLAYER_TABS;

  if (!isStaff && !player.me) return null;

  return (
    <nav className="nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav__item ${isActive ? 'nav__item--on' : ''}`}>
          <span className="nav__icon">{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
      <NavLink to="/staff" className="nav__item">
        <span className="nav__icon">🎯</span>
        <span>工作人员</span>
      </NavLink>
    </nav>
  );
}

/* ------------------------------- 守卫 ------------------------------- */

function PlayerRoute({ children }) {
  const { me, loading } = usePlayer();
  if (loading && !me) return <Loading label="正在打开你的护照…" />;
  if (!me && !hasSession()) return <Navigate to="/" replace />;
  return children;
}

function StaffRoute({ children, admin = false }) {
  const staff = useStaff();
  if (!staff.session) return <Navigate to="/staff" replace />;
  if (admin && staff.session.role !== 'admin') return <Navigate to="/staff/scan" replace />;
  return children;
}

function Home() {
  return hasSession() ? <Navigate to="/passport" replace /> : <Register />;
}

function StaffEntry() {
  const staff = useStaff();
  if (staff.session) {
    return <Navigate to={staff.session.role === 'admin' && !staff.session.station ? '/staff/admin' : '/staff/scan'} replace />;
  }
  return <StaffLogin />;
}

/* ------------------------------- 根组件 ------------------------------- */

export default function App() {
  const [booted, setBooted] = useState(false);
  const { config } = useConfig();

  useEffect(() => {
    loadConfig().finally(() => setBooted(true));
    startPlayerSync();
    startStaffSync();
    // 后台改了活动清单或护照模版会广播 config。原来只在启动时拉一次，
    // 于是现场改完之后，已经把护照开在手里的人要自己刷新才看得到 ——
    // 而「不用让人重新打开页面」正是总控台上写着的承诺。
    return onTick((p) => {
      if (p.reason === 'config' || p.reason === 'settings') loadConfig();
    });
  }, []);

  if (!booted && !config) return <Loading label="正在载入游戏…" />;

  return (
    <ToastProvider>
      <ConfirmProvider>
      <BrowserRouter>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            {/* 活动二维码扫进来的落地页。不需要登录也能看，报名才要护照 */}
            <Route path="/join/:id" element={<Join />} />
            <Route path="/passport" element={<PlayerRoute><PassportBook /></PlayerRoute>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/badge" element={<PlayerRoute><Badge /></PlayerRoute>} />

            <Route path="/staff" element={<StaffEntry />} />
            <Route path="/staff/scan" element={<StaffRoute><StaffScan /></StaffRoute>} />
            <Route path="/staff/p/:id" element={<StaffRoute><StaffPlayer /></StaffRoute>} />
            <Route path="/staff/admin" element={<StaffRoute admin><Admin /></StaffRoute>} />
            <Route path="/staff/admin/a/:id" element={<StaffRoute admin><ActivityDetail /></StaffRoute>} />
            <Route path="/staff/admin/a/:id/design" element={<StaffRoute admin><ActivityDesign /></StaffRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
