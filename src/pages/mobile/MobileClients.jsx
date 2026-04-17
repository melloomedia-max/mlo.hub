// ============================================
// FILE: src/pages/mobile/MobileClients.jsx
// ============================================
import React, { useState, useEffect } from 'react';

function ClientDetails({ client, onClose }) {
  if (!client) return null;

  return (
    <div className="mob-details-overlay">
      <div className="mob-details-card">
        <button className="mob-details-close" onClick={onClose}>×</button>
        <div className="mob-client-avatar" style={{ width: 64, height: 64, fontSize: 24, margin: '0 auto 16px' }}>
          {client.name?.split(' ').map(n=>n[0]).join('')}
        </div>
        <h2 style={{ textAlign: 'center', margin: '0 0 4px', color: 'var(--mob-text)' }}>{client.name}</h2>
        <p style={{ textAlign: 'center', color: 'var(--mob-muted)', margin: '0 0 24px' }}>{client.company || 'Private Client'}</p>

        <div className="mob-details-grid">
          <div className="mob-details-item">
            <label>Email</label>
            <span>{client.email || '—'}</span>
          </div>
          <div className="mob-details-item">
            <label>Phone</label>
            <span>{client.phone || '—'}</span>
          </div>
          <div className="mob-details-item">
            <label>Status</label>
            <span className={`mob-client-status ${client.status === 'active' ? 'mob-status-active' : 'mob-status-pending'}`}>
              {client.status}
            </span>
          </div>
          <div className="mob-details-item">
            <label>Birthday</label>
            <span>{client.birthday || '—'}</span>
          </div>
        </div>

        {client.notes && (
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--mob-muted)', textTransform: 'uppercase' }}>Notes</label>
            <p style={{ fontSize: 14, color: 'var(--mob-text)', margin: '8px 0 0', lineHeight: 1.5 }}>{client.notes}</p>
          </div>
        )}

        <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
          <a href={`mailto:${client.email}`} className="mob-btn-primary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Email</a>
          <a href={`tel:${client.phone}`} className="mob-btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>Call</a>
        </div>
      </div>
    </div>
  );
}

export default function MobileClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/crm/clients');
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(query.toLowerCase()) ||
    c.company?.toLowerCase().includes(query.toLowerCase()) ||
    c.email?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="mob-clients-page">
      <div className="mob-header">
        <h1 className="mob-page-title">Clients</h1>
      </div>

      <div className="mob-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Search name, company, or email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="mob-loading-skeleton">
          {[1,2,3,4,5,6].map(i => <div key={i} className="mob-card skeleton" style={{ height: 80, marginBottom: 10 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">👥</div>
          <div className="mob-empty-title">No clients found</div>
          <div className="mob-empty-sub">{query ? 'Try a different search term' : 'Tap + to add your first client'}</div>
        </div>
      ) : (
        filtered.map(client => (
          <div key={client.id} className="mob-client-row" onClick={() => setSelected(client)}>
            <div className="mob-client-avatar">
              {client.name?.split(' ').map(n=>n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div className="mob-client-name">{client.name}</div>
              <div className="mob-client-meta">{client.company || '—'}</div>
              <div className="mob-client-meta" style={{ fontSize: 11, marginTop: 2 }}>{client.email || client.phone || ''}</div>
            </div>
            <span className={`mob-client-status ${client.status === 'active' ? 'mob-status-active' : 'mob-status-pending'}`}>
              {client.status}
            </span>
          </div>
        ))
      )}

      {selected && <ClientDetails client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
