// ============================================
// FILE: src/pages/mobile/MobileDashboard.jsx
// ============================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function StatCard({ icon, label, value }) {
  return (
    <div className="mob-card">
      <div className="mob-card-icon">{icon}</div>
      <div>
        <div className="mob-card-label">{label}</div>
        <div className="mob-card-value">${value}</div>
      </div>
    </div>
  );
}

export default function MobileDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/dashboard');
        if (!res.ok) throw new Error('Failed to fetch dashboard data');
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Dashboard load failed', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ height: '80dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mob-muted)' }}>
        Loading dashboard...
      </div>
    );
  }

  if (!stats) return <div style={{ padding: 20 }}>Error loading dashboard</div>;

  return (
    <div className="mob-dashboard">
      <div className="mob-header">
        <h1 className="mob-page-title">Overview</h1>
      </div>

      <div className="mob-pills" style={{ marginBottom: 24 }}>
        <div className="mob-pill">
          <span className="mob-pill-icon">👥</span>
          <span className="mob-pill-num">{stats.totalClients}</span>
          <span className="mob-pill-label">clients</span>
        </div>
        <div className="mob-pill">
          <span className="mob-pill-icon">⚡</span>
          <span className="mob-pill-num">{stats.pendingTasks}</span>
          <span className="mob-pill-label">tasks</span>
        </div>
      </div>

      <StatCard icon="💰" label="Total Revenue" value={stats.totalRevenue} />
      <StatCard icon="⏳" label="Pending Invoices" value={stats.pendingInvoices} />
      <StatCard icon="📈" label="Projected" value={stats.projected || 0} />

      <div className="mob-section-header" style={{ marginTop: 24 }}>
        <span className="mob-section-title">Recent Activity</span>
      </div>
      
      {stats.recentActivity?.length === 0 ? (
        <div className="mob-empty">No activities yet</div>
      ) : (
        stats.recentActivity.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mob-accent)', marginTop: 6, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: 'var(--mob-text)' }}>
                <strong>{a.client_name}</strong>: {a.description}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mob-muted)', marginTop: 2 }}>
                {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
