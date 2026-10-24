import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';

/**
 * Navigation is role-aware: `roles` lists who may see a tab, and a tab without
 * `roles` is common to everyone. This governs visibility only — the API
 * authorises every request independently.
 */
const NAV_ITEMS = [
  { key: '/',            label: 'Dashboard' },   // role-specific view behind one route
  { key: '/advisor',     label: 'Advisor' },
  { key: '/marketplace', label: 'Marketplace' },
  { key: '/portfolio',   label: 'Portfolio' },   // every role may still invest
  { key: '/journal',     label: 'Journal' },
  { key: '/admin',       label: 'Admin',      roles: ['admin'] },
];

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const NAV_TABS = NAV_ITEMS.filter(
    (tab) => !tab.roles || tab.roles.includes(user?.role),
  );

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'SP';

  const handleSignOut = () => {
    setUserOpen(false);
    logout();
    navigate('/auth');
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <header>
      <div className="bar">
        <div className="logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="mark">SP</div>
          Stock<span>Pilot</span>
        </div>

        <div className="tabs">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab${location.pathname === tab.key ? ' active' : ''}`}
              onClick={() => navigate(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="nav-actions">
          <div className="env-badge"><span className="env-dot" />Live</div>

          {/* Notifications */}
          <div className="dropdown-wrap" ref={notifRef}>
            <button
              className="icon-btn"
              onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen); setUserOpen(false); }}
              aria-label="Notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </button>
            <div className={`dropdown notif-drop${notifOpen ? ' open' : ''}`}>
              <div className="dd-head">
                <h4>Notifications</h4>
                <button className="dd-link" onClick={markAllRead}>Mark all as read</button>
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="journal-empty">No notifications yet.</div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className={`notif-item${!n.is_read ? ' unread' : ''}`}
                      onClick={() => markAsRead(n.id)}
                    >
                      <span className="n-dot" />
                      <div className="n-body">
                        <div className="n-title">{n.title}</div>
                        <div className="n-time">{formatTime(n.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* User menu */}
          <div className="dropdown-wrap" ref={userRef}>
            <button
              className="avatar-btn"
              onClick={(e) => { e.stopPropagation(); setUserOpen(!userOpen); setNotifOpen(false); }}
              aria-label="Account"
            >
              <div className="avatar-circle">{initials}</div>
            </button>
            <div className={`dropdown user-drop${userOpen ? ' open' : ''}`}>
              <div className="u-header">
                <div className="avatar-circle">{initials}</div>
                <div className="u-info">
                  <div className="u-name">
                    {user?.full_name || 'User'}
                    {user?.role && user.role !== 'investor' && (
                      <span className={`role-pill ${user.role}`} style={{ marginLeft: 8, fontSize: 10, verticalAlign: 'middle' }}>{user.role}</span>
                    )}
                  </div>
                  <div className="u-email">{user?.email || ''}</div>
                </div>
              </div>
              <div className="u-menu">
                <button className="u-item" onClick={() => { navigate('/settings?tab=profile'); setUserOpen(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  My profile
                </button>
                <button className="u-item" onClick={() => { navigate('/settings'); setUserOpen(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                  Settings
                </button>
                <div className="u-divider" />
                <button className="u-item sign-out" onClick={handleSignOut}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
