// ============================================
// FILE: src/pages/mobile/MobileDashboard.jsx
// ============================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function StatCard({ icon, label, value, loading, error }) {
  if (loading) return <div className="mob-card skeleton" style={{ height: 94 }} />;
  if (error) return <div className="mob-card" style={{ opacity: 0.6 }}><div className="mob-card-label">{label}</div><div className="mob-card-value" style={{ fontSize: 14 }}>Error</div></div>;
  
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

function SectionLoading() {
  return (
    <div className="mob-loading-skeleton">
      <div className="mob-card skeleton" style={{ height: 60, marginBottom: 8 }} />
      <div className="mob-card skeleton" style={{ height: 60 }} />
    </div>
  );
}

export default function MobileDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    clients: { items: [], loading: true, error: null },
    tasks: { items: [], loading: true, error: null },
    meetings: { items: [], loading: true, error: null },
    revenue: { stats: null, loading: true, error: null },
    activity: { items: [], loading: true, error: null }
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const auth = await res.json();
      if (auth.loggedIn) {
        setUser(auth.user);
        fetchAllData(auth.user);
      }
    } catch (err) {
      console.error('Auth check failed', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async (currentUser) => {
    const isAdmin = currentUser?.role === 'admin';
    
    const endpoints = [
      { key: 'clients', url: '/api/crm/clients' },
      { key: 'tasks', url: '/api/tasks' },
      { key: 'meetings', url: '/api/meetings' },
      { key: 'activity', url: '/api/crm/activity' }
    ];

    if (isAdmin) {
      endpoints.push({ key: 'revenue', url: '/api/revenue/stats' });
    }

    const results = await Promise.allSettled(
      endpoints.map(e => fetch(e.url).then(r => r.json()))
    );

    const newData = { ...data };
    results.forEach((result, i) => {
      const key = endpoints[i].key;
      if (result.status === 'fulfilled') {
        if (key === 'tasks') {
          newData.tasks = { items: result.value.filter(t => t.status !== 'done'), loading: false, error: null };
        } else if (key === 'revenue') {
          newData.revenue = { stats: result.value, loading: false, error: null };
        } else {
          newData[key] = { items: result.value, loading: false, error: null };
        }
      } else {
        newData[key] = { ...data[key], loading: false, error: result.reason.message };
      }
    });

    if (!isAdmin) {
      newData.revenue = { stats: null, loading: false, error: null };
    }

    setData(newData);
  };

  const isAdmin = user?.role === 'admin';

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
        <h1 className="mob-page-title">Hey, {user?.name?.split(' ')[0] || 'there'}</h1>
      </div>

      {/* ── KPI Grid ── */}
      <div className="mob-pills" style={{ marginBottom: 24 }}>
        <div className="mob-pill">
          <span className="mob-pill-icon">👥</span>
          <span className="mob-pill-num">{data.clients.loading ? '...' : data.clients.items.length}</span>
          <span className="mob-pill-label">clients</span>
        </div>
        <div className="mob-pill">
          <span className="mob-pill-icon">⚡</span>
          <span className="mob-pill-num">{data.tasks.loading ? '...' : data.tasks.items.length}</span>
          <span className="mob-pill-label">tasks</span>
        </div>
        <div className="mob-pill">
          <span className="mob-pill-icon">🗓️</span>
          <span className="mob-pill-num">{data.meetings.loading ? '...' : data.meetings.items.length}</span>
          <span className="mob-pill-label">meetings</span>
        </div>
      </div>

      {/* ── Revenue Snapshot (Admin Only) ── */}
      {isAdmin && (
        <>
          <div className="mob-section-header">
            <span className="mob-section-title">Revenue</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <StatCard 
              label="Total" 
              value={`$${data.revenue.stats?.totalRevenue || 0}`} 
              loading={data.revenue.loading} 
              error={data.revenue.error}
            />
            <StatCard 
              label="Pending" 
              value={`$${data.revenue.stats?.pendingInvoices || 0}`} 
              loading={data.revenue.loading} 
              error={data.revenue.error}
            />
          </div>
        </>
      )}

      {/* ── CRM Snapshot ── */}
      <div className="mob-section-header">
        <span className="mob-section-title">Latest Clients</span>
        <span className="mob-section-action" onClick={() => navigate('/clients')}>View All</span>
      </div>
      {data.clients.loading ? <SectionLoading /> : data.clients.items.length === 0 ? (
        <div className="mob-empty" style={{ padding: '20px 0' }}>No clients found</div>
      ) : (
        data.clients.items.slice(0, 3).map(c => (
          <div key={c.id} className="mob-client-row" onClick={() => navigate('/clients')}>
            <div className="mob-client-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
              {c.name?.split(' ').map(n=>n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div className="mob-client-name" style={{ fontSize: 14 }}>{c.name}</div>
              <div className="mob-client-meta" style={{ fontSize: 12 }}>{c.company || 'Private Client'}</div>
            </div>
            <span className={`mob-client-status ${c.status === 'active' ? 'mob-status-active' : 'mob-status-pending'}`} style={{ fontSize: 10, padding: '2px 8px' }}>
              {c.status}
            </span>
          </div>
        ))
      )}

      {/* ── Tasks Snapshot ── */}
      <div className="mob-section-header" style={{ marginTop: 20 }}>
        <span className="mob-section-title">Upcoming Tasks</span>
        <span className="mob-section-action" onClick={() => navigate('/tasks')}>View All</span>
      </div>
      {data.tasks.loading ? <SectionLoading /> : data.tasks.items.length === 0 ? (
        <div className="mob-empty" style={{ padding: '20px 0' }}>All tasks completed!</div>
      ) : (
        data.tasks.items.slice(0, 3).map(t => (
          <div key={t.id} className="mob-task-row" onClick={() => navigate('/tasks')}>
            <div className="mob-task-check" />
            <div style={{ flex: 1 }}>
              <div className="mob-task-title" style={{ fontSize: 14 }}>{t.title}</div>
              <div className="mob-task-meta" style={{ fontSize: 12 }}>{t.due_date || 'No deadline'}</div>
            </div>
          </div>
        ))
      )}

      {/* ── Activity Snapshot ── */}
      <div className="mob-section-header" style={{ marginTop: 20 }}>
        <span className="mob-section-title">Recent Activity</span>
      </div>
      {data.activity.loading ? <SectionLoading /> : data.activity.items.length === 0 ? (
        <div className="mob-empty" style={{ padding: '20px 0' }}>No recent activity</div>
      ) : (
        data.activity.items.slice(0, 5).map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: 16, padding: '0 4px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mob-accent)', marginTop: 6, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, color: 'var(--mob-text)', lineHeight: 1.4 }}>
                <strong>{a.client_name}</strong>: {a.description}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mob-muted)', marginTop: 2 }}>
                {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {a.type}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
