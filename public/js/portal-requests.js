// ─── Portal Requests Inbox ────────────────────────────────
// Source of truth: portal_requests table via GET /api/crm/portal-requests

const PR_STATUS_LABEL = { new: 'New', in_progress: 'In Progress', completed: 'Completed', archived: 'Archived' };
const PR_STATUS_COLOR = { new: '#f43f5e', in_progress: '#fbbf24', completed: '#34d399', archived: '#6b7280' };
const PR_PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: '🔥 High' };

let _prAll = [];
let _prFilter = 'all';
let _prOpenId = null;

async function loadAllPortalRequests() {
    const inbox = document.getElementById('portal-requests-inbox');
    if (!inbox) return;
    inbox.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">Loading...</div>';
    try {
        const res = await fetch(`${API_BASE}/crm/portal-requests`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _prAll = await res.json();
        renderPortalRequests();
        updateRequestsBadge();
    } catch (e) {
        inbox.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171;">Failed to load requests: ${e.message}</div>`;
    }
}

function filterPortalRequests(status) {
    _prFilter = status;
    document.querySelectorAll('.pr-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.status === status);
    });
    renderPortalRequests();
}

function renderPortalRequests() {
    const inbox = document.getElementById('portal-requests-inbox');
    if (!inbox) return;

    const items = _prFilter === 'all' ? _prAll : _prAll.filter(r => r.status === _prFilter);

    if (!items.length) {
        const label = _prFilter === 'all' ? 'No requests yet.' : `No ${PR_STATUS_LABEL[_prFilter] || _prFilter} requests.`;
        inbox.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-tertiary);font-size:14px;">${label}</div>`;
        return;
    }

    inbox.innerHTML = items.map(r => {
        const clientLabel = r.company ? `${r.client_name} · ${r.company}` : r.client_name;
        const preview = r.message.length > 120 ? r.message.slice(0, 120) + '…' : r.message;
        const age = timeAgoShort(new Date(r.created_at));
        const statusColor = PR_STATUS_COLOR[r.status] || '#a5b4fc';
        const assignedLabel = r.assigned_to_name ? `→ ${r.assigned_to_name}` : '';
        return `
        <div class="pr-card status-${r.status}" onclick="openPrDrawer(${r.id})">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap;">
              <span style="font-size:13px;font-weight:700;color:var(--text-primary);">#${r.id} · ${escHtml(r.subject)}</span>
              <span class="pr-status-pill" style="background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}40;">${PR_STATUS_LABEL[r.status] || r.status}</span>
              ${r.priority === 'high' ? '<span class="pr-status-pill" style="background:#f59e0b18;color:#f59e0b;border:1px solid #f59e0b40;">🔥 High</span>' : ''}
              ${assignedLabel ? `<span style="font-size:11px;color:var(--text-tertiary);">${escHtml(assignedLabel)}</span>` : ''}
            </div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px;">${escHtml(preview)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);display:flex;gap:12px;">
              <span>👤 ${escHtml(clientLabel)}</span>
              <span>🕐 ${age}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
            ${r.status === 'new' ? `<button class="pr-action-btn primary" onclick="event.stopPropagation();updatePrStatus(${r.id},'in_progress')">Start</button>` : ''}
            ${r.status === 'in_progress' ? `<button class="pr-action-btn success" onclick="event.stopPropagation();updatePrStatus(${r.id},'completed')">Done</button>` : ''}
            ${r.status !== 'archived' && r.status !== 'new' ? `<button class="pr-action-btn" onclick="event.stopPropagation();updatePrStatus(${r.id},'archived')" title="Archive">📦</button>` : ''}
          </div>
        </div>`;
    }).join('');
}

async function updatePrStatus(id, status) {
    try {
        const res = await fetch(`${API_BASE}/crm/portal-requests/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const req = _prAll.find(r => r.id === id);
        if (req) req.status = status;
        renderPortalRequests();
        updateRequestsBadge();
        if (_prOpenId === id) openPrDrawer(id); // refresh drawer
        if (typeof showToast === 'function') showToast(`Request #${id} → ${PR_STATUS_LABEL[status]}`);
    } catch (e) {
        if (typeof showToast === 'function') showToast(`Failed to update: ${e.message}`, 'error');
    }
}

function openPrDrawer(id) {
    _prOpenId = id;
    const r = _prAll.find(x => x.id === id);
    if (!r) return;
    const drawer = document.getElementById('pr-drawer');
    const overlay = document.getElementById('pr-drawer-overlay');
    const content = document.getElementById('pr-drawer-content');
    const title = document.getElementById('pr-drawer-title');

    title.textContent = `#${r.id} · ${r.subject}`;
    const statusColor = PR_STATUS_COLOR[r.status] || '#a5b4fc';
    const clientLabel = r.company ? `${r.client_name} (${r.company})` : r.client_name;

    content.innerHTML = `
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Client</div>
        <div class="pr-drawer-value">${escHtml(clientLabel)}</div>
      </div>
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Status</div>
        <div>
          <span class="pr-status-pill" style="background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}40;">${PR_STATUS_LABEL[r.status] || r.status}</span>
        </div>
      </div>
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Category</div>
        <div class="pr-drawer-value">${escHtml(r.subject)}</div>
      </div>
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Priority</div>
        <div class="pr-drawer-value">${PR_PRIORITY_LABEL[r.priority] || r.priority}</div>
      </div>
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Submitted</div>
        <div class="pr-drawer-value">${new Date(r.created_at).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Message</div>
        <div class="pr-drawer-value" style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);border-radius:10px;padding:14px;white-space:pre-wrap;">${escHtml(r.message)}</div>
      </div>
      ${r.assigned_to_name ? `<div class="pr-drawer-section"><div class="pr-drawer-label">Assigned To</div><div class="pr-drawer-value">${escHtml(r.assigned_to_name)}</div></div>` : ''}
      <div class="pr-drawer-section">
        <div class="pr-drawer-label">Notifications</div>
        <div class="pr-drawer-value" style="font-size:12px;color:var(--text-tertiary);">
          Email: ${r.notify_email_status || '—'} · SMS: ${r.notify_sms_status || '—'}
        </div>
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;">
        ${r.status === 'new' ? `<button class="pr-action-btn primary" onclick="updatePrStatus(${r.id},'in_progress')">🟡 Mark In Progress</button>` : ''}
        ${r.status !== 'completed' ? `<button class="pr-action-btn success" onclick="updatePrStatus(${r.id},'completed')">✅ Mark Complete</button>` : ''}
        ${r.status !== 'archived' ? `<button class="pr-action-btn danger" onclick="updatePrStatus(${r.id},'archived')">📦 Archive</button>` : ''}
        <button class="pr-action-btn" onclick="showSection('crm');setTimeout(()=>openClientProfile(${r.client_id}),300)">👤 Open in CRM</button>
      </div>
    `;

    drawer.style.display = 'block';
    overlay.style.display = 'block';
}

function closePrDrawer() {
    _prOpenId = null;
    document.getElementById('pr-drawer').style.display = 'none';
    document.getElementById('pr-drawer-overlay').style.display = 'none';
}

function updateRequestsBadge() {
    const newCount = _prAll.filter(r => r.status === 'new').length;
    const badge = document.getElementById('nav-requests-badge');
    if (!badge) return;
    if (newCount > 0) {
        badge.textContent = newCount;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeAgoShort(date) {
    const s = Math.floor((new Date() - date) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
}

// Load badge on page load and when switching to the section
document.addEventListener('DOMContentLoaded', () => {
    // Fetch count for badge without loading full list
    fetch(`${API_BASE}/crm/portal-requests/count`)
        .then(r => r.json())
        .then(data => {
            const badge = document.getElementById('nav-requests-badge');
            if (badge && data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = 'inline';
            }
        })
        .catch(() => {});
});

// Hook into showSection so the list loads when the tab is opened
const _origShowSection = typeof showSection === 'function' ? showSection : null;
window.__prShowSectionHooked = false;
function hookPortalRequestsSection() {
    if (window.__prShowSectionHooked) return;
    const orig = window.showSection;
    if (!orig) return;
    window.showSection = function(name, ...args) {
        orig(name, ...args);
        if (name === 'portal-requests') loadAllPortalRequests();
    };
    window.__prShowSectionHooked = true;
}
// Try immediately and also after DOMContentLoaded
hookPortalRequestsSection();
document.addEventListener('DOMContentLoaded', hookPortalRequestsSection);
