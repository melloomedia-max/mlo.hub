// schedule.js — Aggregated deadline/schedule view + Task Detail Drawer

const SCHED_TYPE_META = {
    project: { icon: '🚀', label: 'Project', color: '#a5b4fc', section: 'crm' },
    task: { icon: '✅', label: 'Task', color: '#6ee7b7', section: 'tasks' },
    meeting: { icon: '📹', label: 'Meeting', color: '#fbbf24', section: 'meetings' },
};

function schedFmtDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function schedDaysBetween(dateStr) {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - now) / 86400000);
}

function schedRelLabel(days) {
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
}

function renderSchedItem(item) {
    const meta = SCHED_TYPE_META[item.type];
    const days = schedDaysBetween(item.date);
    const relLabel = schedRelLabel(days);
    const urgency = days < 0 ? 'overdue' : days <= 1 ? 'soon' : '';

    // Encode item data for the drawer
    const safeTitle = (item.title || '').replace(/"/g, '&quot;');
    const safeSub = (item.subtitle || '').replace(/"/g, '&quot;');

    return `
    <div class="sched-item ${urgency}" 
         data-type="${item.type}" data-id="${item.id || ''}" data-client-id="${item.client_id || ''}" 
         data-title="${safeTitle}" data-subtitle="${safeSub}" data-date="${item.date}" data-status="${item.status || ''}" 
         oncontextmenu="ContextMenu.attach(event, '${item.type}', '${item.id}', '${safeTitle}')"
         style="cursor:pointer;">
        <div class="sched-item-icon" style="color:${meta.color}">${meta.icon}</div>
        <div class="sched-item-body">
            <div class="sched-item-title">${item.title}</div>
            ${item.subtitle ? `<div class="sched-item-sub">${item.subtitle}</div>` : ''}
            <div class="sched-item-meta">
                <span class="sched-type-badge" style="background:${meta.color}22; color:${meta.color}; border-color:${meta.color}44">${meta.label}</span>
                <span class="sched-date">${schedFmtDate(item.date)}</span>
                <span class="sched-rel ${urgency}">${relLabel}</span>
            </div>
        </div>
    </div>`;
}

function renderSchedColumn(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (items.length === 0) {
        el.innerHTML = '<div class="sched-empty">All clear here 🎉</div>';
        return;
    }
    items.sort((a, b) => new Date(a.date) - new Date(b.date));
    el.innerHTML = items.map(renderSchedItem).join('');
}

// ── Event Delegation — Click opens Drawer ────────────────────────────
document.addEventListener('click', (e) => {
    const item = e.target.closest('.sched-item[data-type]');
    if (!item) return;

    const type = item.dataset.type;
    const id = item.dataset.id;
    const clientId = item.dataset.clientId;
    const title = item.dataset.title;
    const subtitle = item.dataset.subtitle;
    const date = item.dataset.date;
    const status = item.dataset.status;

    openTaskDrawer({ type, id, clientId, title, subtitle, date, status });
});

// ── Drawer State ─────────────────────────────────────────────────────
let _drawerData = null;
let _drawerActivityLog = [];

function openTaskDrawer(itemData) {
    _drawerData = itemData;
    _drawerActivityLog = [];

    const meta = SCHED_TYPE_META[itemData.type] || SCHED_TYPE_META.task;
    const days = itemData.date ? schedDaysBetween(itemData.date) : null;

    // Header icon
    const iconEl = document.getElementById('drawer-icon');
    iconEl.textContent = meta.icon;
    iconEl.style.background = meta.color + '18';

    // Title
    document.getElementById('drawer-title').textContent = itemData.title;

    // Tags
    const tagsEl = document.getElementById('drawer-tags');
    let tagsHTML = `<span class="drawer-tag drawer-tag-type">${meta.label}</span>`;
    if (itemData.date) {
        tagsHTML += `<span class="drawer-tag drawer-tag-date">${schedFmtDate(itemData.date)}</span>`;
    }
    if (days !== null) {
        const urgClass = days < 0 ? 'overdue' : days <= 1 ? 'soon' : '';
        if (urgClass) {
            tagsHTML += `<span class="drawer-tag drawer-tag-urgency ${urgClass}">${schedRelLabel(days)}</span>`;
        }
    }
    if (itemData.status) {
        const statusLabels = { 'active': '🟢 Active', 'in-progress': '🔵 In Progress', 'todo': '📋 To Do', 'done': '✅ Done', 'revision': '🟡 Revision', 'delivered': '🏁 Delivered' };
        tagsHTML += `<span class="drawer-tag drawer-tag-date">${statusLabels[itemData.status] || itemData.status}</span>`;
    }
    tagsEl.innerHTML = tagsHTML;

    // Subtitle / description
    const subEl = document.getElementById('drawer-subtitle');
    if (itemData.subtitle) {
        subEl.textContent = itemData.subtitle;
        subEl.style.display = 'block';
    } else {
        subEl.style.display = 'none';
    }

    // Clear complete button state
    const completeBtn = document.getElementById('drawer-complete-btn');
    completeBtn.classList.remove('completed');
    completeBtn.textContent = '✅ Mark Complete';
    completeBtn.disabled = false;
    
    if (['done', 'delivered', 'completed'].includes(itemData.status)) {
        completeBtn.classList.add('completed');
        completeBtn.textContent = '✅ Completed';
        completeBtn.disabled = true;
    }

    // Open the drawer
    document.getElementById('drawer-backdrop').classList.add('open');
    document.getElementById('drawer-panel').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Initialize reusable Activity Feed in drawer
    window.drawerActivityFeed = new ActivityFeed('drawer-activity-feed-container', {
        entityType: itemData.type,
        entityId: itemData.id,
        clientId: itemData.clientId, // Pass global client context if we have it
        hideButton: true,
        onSave: () => {
             // Optional: Do something on save success like refresh parent
        }
    });

    window.drawerActivityFeed.loadData();
}

function closeTaskDrawer() {
    document.getElementById('drawer-backdrop').classList.remove('open');
    document.getElementById('drawer-panel').classList.remove('open');
    document.body.style.overflow = '';
    _drawerData = null;
    
    // Cleanup feed listener if needed, though window listener is fine
    // window.removeEventListener('activityLogUpdated', window.drawerActivityFeed.syncListener);

    // Clear feed from DOM simply by emptying container
    const feedEl = document.getElementById('drawer-activity-feed-container');
    if (feedEl) feedEl.innerHTML = '';
}

// ── Drawer Button Handlers ───────────────────────────────────────────
async function handleDrawerSaveNote() {
    if (window.drawerActivityFeed && typeof window.drawerActivityFeed.handleSaveNote === 'function') {
        await window.drawerActivityFeed.handleSaveNote();
    }
}

// Close with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _drawerData) closeTaskDrawer();
});

// ── Mark Complete Handler ────────────────────────────────────────────
async function handleDrawerComplete() {
    if (!_drawerData || !_drawerData.id) return;

    const btn = document.getElementById('drawer-complete-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Updating...';

    try {
        if (_drawerData.type === 'task') {
            await fetch(`/api/tasks/${_drawerData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'done' })
            });
        } else if (_drawerData.type === 'project') {
            await fetch(`/api/crm/projects/${_drawerData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'delivered' })
            });
        }

        btn.classList.add('completed');
        btn.textContent = '✅ Completed';
        showToast(`${_drawerData.type === 'task' ? 'Task' : 'Project'} marked complete`);

        // Refresh schedule in background
        loadSchedule();
    } catch (err) {
        console.error('Complete error:', err);
        btn.disabled = false;
        btn.textContent = '✅ Mark Complete';
        showToast('Failed to update status', 'error');
    }
}

// ── Load Schedule Data ───────────────────────────────────────────────
async function loadSchedule() {
    ['sched-overdue', 'sched-soon', 'sched-upcoming'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="sched-loading">Loading…</div>';
    });

    const overdue = [], soon = [], upcoming = [];

    const [projectsRes, tasksRes, meetingsRes] = await Promise.allSettled([
        fetch('/api/crm/projects').then(r => r.ok ? r.json() : []),
        fetch('/api/tasks').then(r => r.ok ? r.json() : []),
        fetch('/api/meetings').then(r => r.ok ? r.json() : []),
    ]);

    const projects = projectsRes.status === 'fulfilled' ? (Array.isArray(projectsRes.value) ? projectsRes.value : []) : [];
    const tasks = tasksRes.status === 'fulfilled' ? (Array.isArray(tasksRes.value) ? tasksRes.value : []) : [];
    const meetings = meetingsRes.status === 'fulfilled' ? (Array.isArray(meetingsRes.value) ? meetingsRes.value : []) : [];

    function classify(item) {
        const days = schedDaysBetween(item.date);
        if (days < 0) overdue.push(item);
        else if (days <= 1) soon.push(item);
        else if (days <= 30) upcoming.push(item);
    }

    projects.forEach(p => {
        if (!p.deadline) return;
        if (['delivered', 'cancelled'].includes(p.status)) return;
        classify({ type: 'project', id: p.id, client_id: p.client_id, title: p.name, subtitle: p.client_name ? `Client: ${p.client_name}` : null, date: p.deadline, status: p.status });
    });

    tasks.forEach(t => {
        if (!t.due_date) return;
        if (['done', 'cancelled', 'completed'].includes(t.status)) return;
        classify({ type: 'task', id: t.id, client_id: t.client_id, title: t.title, subtitle: t.client_name || null, date: t.due_date, status: t.status });
    });

    meetings.forEach(m => {
        const dateStr = m.start_time || m.date;
        if (!dateStr) return;
        classify({ type: 'meeting', id: m.id, client_id: m.client_id, title: m.title || 'Meeting', subtitle: m.attendees ? `Attendees: ${m.attendees}` : null, date: dateStr, status: null });
    });

    renderSchedColumn('sched-overdue', overdue);
    renderSchedColumn('sched-soon', soon);
    renderSchedColumn('sched-upcoming', upcoming);
}

window.loadSchedule = loadSchedule;
window.openTaskDrawer = openTaskDrawer;
window.closeTaskDrawer = closeTaskDrawer;
window.handleDrawerComplete = handleDrawerComplete;
