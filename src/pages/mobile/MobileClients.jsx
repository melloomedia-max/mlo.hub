// ============================================
// FILE: src/pages/mobile/MobileClients.jsx
// ============================================
import React, { useState, useEffect } from 'react';

export default function MobileClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clients')
      .then(res => res.json())
      .then(data => {
        setClients(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: 20, color: 'var(--mob-muted)' }}>Loading clients...</div>;

  return (
    <div className="mob-clients-page">
      <div className="mob-header">
        <h1 className="mob-page-title">Clients</h1>
      </div>

      {clients.length === 0 ? (
        <div className="mob-empty">No clients found</div>
      ) : (
        clients.map(c => (
          <div key={c.id} className="mob-client-row">
            <div className="mob-client-avatar">
              {c.name?.split(' ').map(n=>n[0]).join('') || '?'}
            </div>
            <div>
              <div className="mob-client-name">{c.name}</div>
              <div className="mob-client-meta">{c.company || 'Private Client'}</div>
            </div>
            <span className={`mob-client-status ${c.status === 'active' ? 'mob-status-active' : 'mob-status-pending'}`}>
              {c.status || 'lead'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
