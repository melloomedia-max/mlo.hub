// ============================================
// FILE: src/pages/mobile/MobileClients.jsx
// ============================================
import React, { useState } from 'react';

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function MobileClients({ clients = [] }) {
  const [query, setQuery] = useState('');

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="mob-clients-page">

      {/* Header */}
      <div className="mob-header">
        <h1 className="mob-page-title">Clients</h1>
      </div>

      {/* Search */}
      <div className="mob-search-bar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Search clients..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">👥</div>
          <div className="mob-empty-title">No clients yet</div>
          <div className="mob-empty-sub">Tap + to add your first client</div>
        </div>
      ) : (
        filtered.map((client, i) => (
          <div key={client.id || i} className="mob-client-row">
            <div className="mob-client-avatar">{getInitials(client.name)}</div>
            <div>
              <div className="mob-client-name">{client.name}</div>
              <div className="mob-client-meta">{client.company || client.email || '—'}</div>
            </div>
            <span className={`mob-client-status ${client.status === 'active' ? 'mob-status-active' : 'mob-status-pending'}`}>
              {client.status || 'pending'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
