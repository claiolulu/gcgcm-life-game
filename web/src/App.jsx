import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';

import { ToastProvider, ConfirmProvider, Loading } from './components/ui.jsx';
import { loadConfig, useConfig } from './lib/config.js';
import { startPlayerSync, usePlayer, hasSession } from './lib/player.js';
import { startStaffSync, useStaff } from './lib/staff.js';

import Register from './pages/Register.jsx';
import PassportBook from './pages/book/PassportBook.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Badge from './pages/Badge.jsx';
import StaffLogin from './pages/StaffLogin.jsx';
import StaffScan from './pages/StaffScan.jsx';
import StaffPlayer from './pages/StaffPlayer.jsx';
import Admin from './pages/Admin.jsx';

/* ------------------------------ 底部导航 ------------------------------ */

const PLAYER_TABS = [
  { to: '/passport', icon: '🛂', label: '护照' },
  { to: '/leaderboard', icon: '🏆', label: '排行榜' },
  { to: '/badge', icon: '🎖', label: '徽章' },
];

const STAFF_TABS = [
  { to: '/staff/scan', icon: '📷', label: '扫码' },
  { to: '/staff/admin', icon: '🎛', label: '总控', adminOnly: true },
];

function BottomNav() {
  const { pathname } = useLocation();
  const player = usePlayer();
  const staff = useStaff();

  const isStaff = pathname.startsWith('/staff');
  // 护照册是整屏的翻页界面，自带导航，不叠底部 tab
  if (pathname === '/passport') return null;
  if (pathname === '/' || pathname === '/register' || (isStaff && !staff.session)) return null;

  const tabs = isStaff
    ? STAFF_TABS.filter((t) => !t.adminOnly || staff.session?.role === 'admin')
    : PLAYER_TABS;

  if (!isStaff && !player.me) return null;

  return (
    <nav className="nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `nav__item ${isActive ? 'nav__item--on' : ''}`}>
          <span className="nav__icon" style={{ position: 'relative' }}>
            {t.icon}
            {/* 未同步的记分要一直可见地提示，别让人以为已经传上去了 */}
            {isStaff && t.to === '/staff/scan' && staff.outbox.length > 0 && <span className="nav__dot" />}
            {!isStaff && t.to === '/passport' && player.me?.pendingLifeEvents > 0 && <span className="nav__dot" />}
          </span>
          <span>{t.label}</span>
        </NavLink>
      ))}
      {!isStaff && (
        <NavLink to="/staff" className="nav__item">
          <span className="nav__icon">🎯</span>
          <span>工作人员</span>
        </NavLink>
      )}
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
            <Route path="/passport" element={<PlayerRoute><PassportBook /></PlayerRoute>} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/badge" element={<PlayerRoute><Badge /></PlayerRoute>} />

            <Route path="/staff" element={<StaffEntry />} />
            <Route path="/staff/scan" element={<StaffRoute><StaffScan /></StaffRoute>} />
            <Route path="/staff/p/:id" element={<StaffRoute><StaffPlayer /></StaffRoute>} />
            <Route path="/staff/admin" element={<StaffRoute admin><Admin /></StaffRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
        </div>
      </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
