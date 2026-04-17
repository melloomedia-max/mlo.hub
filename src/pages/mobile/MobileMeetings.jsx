// ============================================
// FILE: src/pages/mobile/MobileMeetings.jsx
// ============================================
import React, { useState, useEffect } from 'react';

export default function MobileMeetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) throw new Error('Failed to fetch meetings');
      const data = await res.json();
      setMeetings(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mob-page-content" style={{ padding: '0 16px' }}>
      <div className="mob-header">
        <h1 className="mob-page-title">Meetings</h1>
      </div>

      {loading ? (
        <div className="mob-loading-skeleton">
          {[1,2,3,4].map(i => (
            <div key={i} className="mob-card skeleton" style={{ height: 80, marginBottom: 12 }} />
          ))}
        </div>
      ) : error ? (
        <div className="mob-error">Error: {error}</div>
      ) : meetings.length === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">📅</div>
          <div className="mob-empty-title">No upcoming meetings</div>
          <div className="mob-empty-sub">Tap + to schedule your next session</div>
        </div>
      ) : (
        meetings.map((m, i) => (
          <div key={m.id || i} className="mob-card">
            <div className="mob-card-icon">🗓️</div>
            <div style={{ flex: 1 }}>
              <div className="mob-client-name">{m.title || 'Meeting'}</div>
              <div className="mob-client-meta">
                {new Date(m.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              <div className="mob-client-meta" style={{ marginTop: 4 }}>
                {m.location || m.platform || 'Online'}
              </div>
            </div>
            <div className={`mob-client-status ${m.status === 'confirmed' ? 'mob-status-active' : 'mob-status-pending'}`}>
              {m.status || 'pending'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
