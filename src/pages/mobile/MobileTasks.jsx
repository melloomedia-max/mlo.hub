// ============================================
// FILE: src/pages/mobile/MobileTasks.jsx
// ============================================
import React, { useState } from 'react';

export default function MobileTasks({ tasks = [] }) {
  const [done, setDone] = useState({});

  const toggle = id => setDone(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Header */}
      <div className="mob-header">
        <h1 className="mob-page-title">Tasks</h1>
      </div>

      {/* Filter tabs */}
      <div className="mob-tabs" style={{ marginBottom: 24 }}>
        {['All', 'Today', 'Upcoming', 'Done'].map(t => (
          <button key={t} className="mob-tab">{t}</button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">✅</div>
          <div className="mob-empty-title">All clear</div>
          <div className="mob-empty-sub">No tasks yet. Tap + to create one.</div>
        </div>
      ) : (
        tasks.map((task, i) => {
          const isDone = done[task.id || i];
          return (
            <div key={task.id || i} className="mob-task-row">
              <div
                className={`mob-task-check${isDone ? ' done' : ''}`}
                onClick={() => toggle(task.id || i)}
              >
                {isDone && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`mob-task-title${isDone ? ' done' : ''}`}>{task.title}</div>
                <div className="mob-task-meta">{task.due || task.client || ''}</div>
              </div>
              <div className={`mob-task-priority mob-priority-${task.priority || 'low'}`} />
            </div>
          );
        })
      )}
    </div>
  );
}
