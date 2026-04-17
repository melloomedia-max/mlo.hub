// ============================================
// FILE: src/pages/mobile/MobileTasks.jsx
// ============================================
import React, { useState, useEffect } from 'react';

export default function MobileTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = tasks.filter(t => {
    if (filter === 'Done') return t.status === 'done';
    if (filter === 'All') return true;
    if (filter === 'Today') {
      const today = new Date().toISOString().split('T')[0];
      return t.due_date === today;
    }
    return t.status !== 'done';
  });

  return (
    <div style={{ padding: '0 16px' }}>
      <div className="mob-header">
        <h1 className="mob-page-title">Tasks</h1>
      </div>

      <div className="mob-tabs" style={{ marginBottom: 24 }}>
        {['All', 'Today', 'Upcoming', 'Done'].map(t => (
          <button 
            key={t} 
            className={`mob-tab ${filter === t ? 'active' : ''}`}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mob-loading-skeleton">
          {[1,2,3,4,5].map(i => <div key={i} className="mob-card skeleton" style={{ height: 74, marginBottom: 10 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mob-empty">
          <div className="mob-empty-icon">✅</div>
          <div className="mob-empty-title">{filter === 'Done' ? 'No completed tasks' : 'All clear'}</div>
          <div className="mob-empty-sub">No tasks found for this view</div>
        </div>
      ) : (
        filtered.map(task => {
          const isDone = task.status === 'done';
          return (
            <div key={task.id} className="mob-task-row">
              <div className={`mob-task-check ${isDone ? 'done' : ''}`}>
                {isDone && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`mob-task-title ${isDone ? 'done' : ''}`}>{task.title}</div>
                <div className="mob-task-meta">
                  {task.due_date || 'No due date'} {task.client_name ? `• ${task.client_name}` : ''}
                </div>
              </div>
              <div className={`mob-task-priority mob-priority-${task.priority || 'low'}`} />
            </div>
          );
        })
      )}
    </div>
  );
}
