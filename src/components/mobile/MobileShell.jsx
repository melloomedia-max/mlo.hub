// ============================================
// FILE: src/components/mobile/MobileShell.jsx
// ============================================
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// SVG Icons (no external deps needed)
const Icons = {
  Dashboard: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Clients: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Tasks: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  Meetings: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8"  y1="2" x2="8"  y2="6"/>
      <line x1="3"  y1="10" x2="21" y2="10"/>
    </svg>
  ),
};

const NAV = [
  { key: 'dashboard', label: 'Dashboard', Icon: Icons.Dashboard, path: '/dashboard' },
  { key: 'clients',   label: 'Clients',   Icon: Icons.Clients,   path: '/clients'   },
  { key: 'tasks',     label: 'Tasks',     Icon: Icons.Tasks,     path: '/tasks'     },
  { key: 'meetings',  label: 'Meetings',  Icon: Icons.Meetings,  path: '/meetings'  },
];

export default function MobileShell({ children, onFabPress }) {
  const location = useLocation();
  const navigate  = useNavigate();

  const active = NAV.find(n => location.pathname.startsWith(n.path))?.key || 'dashboard';

  return (
    <>
      {/* ── Main shell ── */}
      <div className="mob-shell">

        {/* Scrollable content */}
        <main className="mob-page">
          {children}
        </main>

        {/* Bottom nav */}
        <nav className="mob-nav">
          {NAV.map(({ key, label, Icon, path }) => (
            <button
              key={key}
              className={`mob-nav-btn${active === key ? ' active' : ''}`}
              onClick={() => navigate(path)}
              aria-label={label}
            >
              <span className="mob-nav-icon"><Icon /></span>
              <span className="mob-nav-label">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* FAB — outside shell so it layers above nav */}
      <button
        className="mob-fab"
        onClick={onFabPress}
        aria-label="Add new"
      >
        +
      </button>
    </>
  );
}
