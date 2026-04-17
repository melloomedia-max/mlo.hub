// ============================================
// FILE: src/components/mobile/QuickActions.jsx
// ============================================
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function QuickActions({ onClose }) {
  const navigate = useNavigate();

  const ACTIONS = [
    { label: 'New Client', icon: '👤', path: '/clients', action: 'add-client' },
    { label: 'New Task',   icon: '✅', path: '/tasks',   action: 'add-task' },
    { label: 'New Meeting',icon: '📅', path: '/meetings',action: 'add-meeting' },
    { label: 'Send Invoice',icon: '💰', path: '/dashboard',action: 'add-invoice' },
  ];

  return (
    <div className="mob-details-overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div className="mob-details-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, color: 'var(--mob-text)', fontSize: 20 }}>Quick Actions</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--mob-muted)', fontSize: 24 }}>×</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              className="mob-card"
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                margin: 0,
                padding: '24px 16px',
                textAlign: 'center'
              }}
              onClick={() => {
                navigate(a.path);
                onClose();
              }}
            >
              <span style={{ fontSize: 32 }}>{a.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--mob-text)' }}>{a.label}</span>
            </button>
          ))}
        </div>
        
        <div style={{ marginTop: 24 }}>
          <button className="mob-btn-secondary" style={{ width: '100%' }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
