// ============================================
// FILE: src/pages/mobile/MobileDashboard.jsx
// ============================================
import React, { useState } from 'react';

const TABS = ['All', 'Cashflow', 'Operations', 'Activity'];

function StatCard({ icon, label, value }) {
  return (
    <div className="mob-card">
      <div className="mob-card-icon">{icon}</div>
      <div>
        <div className="mob-card-label">{label}</div>
        <div className="mob-card-value">{value}</div>
      </div>
    </div>
  );
}

export default function MobileDashboard({ stats = {} }) {
  const [tab, setTab] = useState('All');

  const {
    clients        = 0,
    active         = 0,
    pending        = 0,
    totalRevenue   = '$0',
    pendingInvoices = '$0',
    projected      = '$0',
    totalClients   = 0,
  } = stats;

  return (
    <div className="mob-dashboard">

      {/* ── Header ── */}
      <div className="mob-header">
        <div className="mob-brand">
          <div className="mob-brand-orb" />
          <span className="mob-brand-name">
            <em>melloo</em> <strong>Agency Hub</strong>
          </span>
        </div>
        <h1 className="mob-page-title">Overview</h1>
      </div>

      {/* ── Quick pills ── */}
      <div className="mob-pills">
        <div className="mob-pill">
          <span className="mob-pill-icon">📦</span>
          <span className="mob-pill-num">{clients}</span>
          <span className="mob-pill-label">clients</span>
        </div>
        <div className="mob-pill">
          <span className="mob-pill-icon">📡</span>
          <span className="mob-pill-num">{active}</span>
          <span className="mob-pill-label">active</span>
        </div>
        <div className="mob-pill">
          <span className="mob-pill-icon">⚡</span>
          <span className="mob-pill-num">{pending}</span>
          <span className="mob-pill-label">pending</span>
        </div>
      </div>

      {/* ── Tab filter ── */}
      <div className="mob-tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`mob-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Stat cards ── */}
      <StatCard icon="💰" label="Total Revenue"    value={totalRevenue} />
      <StatCard icon="⏳" label="Pending Invoices" value={pendingInvoices} />
      <StatCard icon="📈" label="Projected"        value={projected} />
      <div className="mob-card">
        <div className="mob-card-icon">👥</div>
        <div>
          <div className="mob-card-label">Total Clients</div>
          <div className="mob-card-value">{totalClients}</div>
        </div>
      </div>

      {/* Active Projects section */}
      <div className="mob-section-header" style={{ marginTop: 8 }}>
        <span className="mob-section-title">Active Projects</span>
        <span className="mob-section-action">See all</span>
      </div>

      {totalClients === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">🚀</div>
          <div className="mob-empty-title">No projects yet</div>
          <div className="mob-empty-sub">Tap + to add your first client and project</div>
        </div>
      ) : null}
    </div>
  );
}
