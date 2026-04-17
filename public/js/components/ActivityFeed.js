class ActivityFeed {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.entityType = options.entityType || 'client'; // client, task, meeting, project
        this.entityId = options.entityId || null;
        this.clientId = options.clientId || null; // The global client feed ID
        this.onSave = options.onSave || null;
        this.hideButton = options.hideButton || false;
        
        this.logData = [];
        this.isLoading = false;

        // Auto-sync listener for when notes are saved in other open panels (e.g. Slide-over -> CRM)
        this.syncListener = () => this.loadData();
        window.addEventListener('activityLogUpdated', this.syncListener);

        // Icons using simple inline SVG for a "Lucide" style look
        this.icons = {
            note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
            system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
            meeting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
            invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>'
        };

        this.initUI();
    }

    initUI() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="activity-feed-wrapper">
                <!-- Notes Input Area -->
                <div class="activity-feed-input-area">
                    <div class="activity-feed-section-title">
                        ${this.icons.note} Add Note
                    </div>
                    <textarea class="activity-feed-note-area" id="${this.containerId}-note-input"
                        placeholder="Add meeting notes, client feedback, action items..."></textarea>
                    ${!this.hideButton ? `
                    <button class="activity-feed-btn activity-feed-btn-primary" id="${this.containerId}-save-btn">
                        Save Note
                    </button>` : ''}
                </div>

                <!-- Feed List -->
                <div class="activity-feed-list-area">
                    <div class="activity-feed-section-title">
                        ${this.icons.system} Activity Log
                    </div>
                    <div class="activity-feed-list" id="${this.containerId}-list">
                        <div class="activity-feed-empty">Loading activity...</div>
                    </div>
                </div>
            </div>
        `;

        // Bind events
        const saveBtn = document.getElementById(`${this.containerId}-save-btn`);
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.handleSaveNote());
        }
    }

    async loadData() {
        if (!this.entityId) return;
        this.isLoading = true;
        this.logData = [];
        
        const listEl = document.getElementById(`${this.containerId}-list`);
        if (listEl) listEl.innerHTML = '<div class="activity-feed-empty">Loading activity...</div>';

        try {
            // 1. Resolve unified Client ID if not provided explicitly but we have an entity
            if (!this.clientId && this.entityId) {
                if (this.entityType === 'client') {
                    this.clientId = this.entityId;
                } else if (this.entityType === 'task') {
                    const taskRes = await fetch('/api/tasks').then(r => r.json());
                    const task = (taskRes || []).find(t => String(t.id) === String(this.entityId));
                    if (task && task.client_id) this.clientId = task.client_id;
                } else if (this.entityType === 'project') {
                    const projRes = await fetch('/api/crm/projects').then(r => r.json());
                    const proj = (projRes || []).find(p => String(p.id) === String(this.entityId));
                    if (proj && proj.client_id) this.clientId = proj.client_id;
                }
            }

            // 2. Fetch local entity data (e.g. initial descriptions, logs)
            if (this.entityType === 'task') {
                const [taskRes, logsRes] = await Promise.allSettled([
                    fetch('/api/tasks').then(r => r.json()),
                    fetch(`/api/time?task_id=${this.entityId}`).then(r => r.json())
                ]);

                if (taskRes.status === 'fulfilled') {
                    const task = (taskRes.value || []).find(t => String(t.id) === String(this.entityId));
                    if (task) {
                        if (task.description) {
                            this.logData.push({ text: task.description, time: task.updated_at || task.created_at, type: 'note' });
                        }
                        this.logData.push({ text: `Task created as "${task.status}" priority "${task.priority}"`, time: task.created_at, type: 'system' });
                    }
                }

                if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
                    logsRes.value.forEach(log => {
                        const dur = log.duration ? `${Math.round(log.duration / 60)} min` : 'running';
                        this.logData.push({ text: `Time tracked: ${dur} — ${log.description || 'No description'}`, time: log.start_time, type: 'system' });
                    });
                }
            } else if (this.entityType === 'meeting') {
                const meetRes = await fetch('/api/meetings').then(r => r.json());
                const meeting = (meetRes || []).find(m => String(m.id) === String(this.entityId));
                if (meeting) {
                    if (meeting.attendees) this.logData.push({ text: `Attendees: ${meeting.attendees}`, time: meeting.created_at, type: 'system' });
                    if (meeting.location) this.logData.push({ text: `Location: ${meeting.location}`, time: meeting.created_at, type: 'system' });
                    if (meeting.ai_summary) this.logData.push({ text: `AI Summary: ${meeting.ai_summary}`, time: meeting.created_at, type: 'note' });
                    if (meeting.notes) this.logData.push({ text: meeting.notes, time: meeting.created_at, type: 'note' });
                    this.logData.push({ text: `Meeting scheduled`, time: meeting.created_at, type: 'meeting' });
                }
            } else if (this.entityType === 'project') {
                const projRes = await fetch('/api/crm/projects').then(r => r.json());
                const proj = (projRes || []).find(p => String(p.id) === String(this.entityId));
                if (proj) {
                    if (proj.notes) this.logData.push({ text: proj.notes, time: proj.created_at, type: 'note' });
                    if (proj.budget) this.logData.push({ text: `Budget: $${Number(proj.budget).toFixed(2)}`, time: proj.created_at, type: 'invoice' });
                    this.logData.push({ text: `Project created — Status: ${proj.status}`, time: proj.created_at, type: 'system' });
                }
            } 

            // 3. Fetch the Unified Global Client Feed if a clientId is found
            if (this.clientId) {
                const commsRes = await fetch(`/api/crm/clients/${this.clientId}/communications`);
                if(commsRes.ok) {
                    const comms = await commsRes.json();
                    comms.forEach(c => {
                        let iconType = 'system';
                        if (c.type === 'invoice') iconType = 'invoice';
                        if (c.type === 'meeting') iconType = 'meeting';
                        if (c.type === 'note') iconType = 'note';
                        
                        let contextTag = '';
                        if (c.task_id) contextTag = ' (from task)';

                        this.logData.push({
                            text: (c.description || `Communication logged (${c.type} via ${c.method})`) + contextTag,
                            time: c.created_at,
                            type: iconType
                        });
                    });
                }
            }

            this.renderFeed();
        } catch (err) {
            console.error('ActivityFeed Error:', err);
            if (listEl) listEl.innerHTML = '<div class="activity-feed-empty">Error loading activity.</div>';
        } finally {
            this.isLoading = false;
        }
    }

    renderFeed() {
        const listEl = document.getElementById(`${this.containerId}-list`);
        if (!listEl) return;

        if (this.logData.length === 0) {
            listEl.innerHTML = '<div class="activity-feed-empty">No activity recorded yet. Add a note to get started.</div>';
            return;
        }

        // Sort newest first
        this.logData.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

        listEl.innerHTML = this.logData.map(entry => {
            const timeStr = entry.time ? this.timeAgo(new Date(entry.time)) : '';
            const iconSvg = this.icons[entry.type] || this.icons.system;
            const iconClass = entry.type || 'system';

            return `
            <div class="activity-feed-item">
                <div class="activity-feed-icon ${iconClass}">
                    ${iconSvg}
                </div>
                <div class="activity-feed-body">
                    <div class="activity-feed-text">${entry.text}</div>
                    ${timeStr ? `<div class="activity-feed-time">${timeStr}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    async handleSaveNote() {
        const inputEl = document.getElementById(`${this.containerId}-note-input`);
        const btnEl = document.getElementById(`${this.containerId}-save-btn`);
        if (!inputEl) return;

        const noteText = inputEl.value.trim();
        if (!noteText || !this.entityId) return;

        // UI Feedback (if button exists)
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Saving...';
        }
        
        const now = new Date().toISOString();

        // Optimistic UI Update
        this.logData.unshift({
            text: noteText,
            time: now,
            type: 'note'
        });
        this.renderFeed();
        inputEl.value = '';

        try {
            // ALWAYS update the specific local entity as well to prevent bugs
            if (this.entityType === 'task') {
                await fetch(`/api/tasks/${this.entityId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description: noteText })
                });
            } else if (this.entityType === 'meeting') {
                await fetch(`/api/meetings/${this.entityId}/artifacts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'note', label: 'Manual Note', content: noteText })
                });
            }

            // AND POST to the global unified client feed if we have a client context!
            if (this.clientId) {
                 await fetch(`/api/crm/clients/${this.clientId}/communications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        type: 'note', 
                        method: 'manual', 
                        description: noteText,
                        task_id: this.entityType === 'task' ? this.entityId : null
                    })
                });
            }

            // Sync all other open Feed components across the app!
            window.dispatchEvent(new CustomEvent('activityLogUpdated'));

            if(typeof showToast === 'function') showToast('Note saved centrally');
            if(this.onSave) this.onSave(noteText);

        } catch (err) {
            console.error('Save note error:', err);
            if(typeof showToast === 'function') showToast('Failed to save note', 'error');
            // Revert optimistic update gracefully if needed... (skipped for brevity)
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.textContent = 'Save Note';
            }
        }
    }

    // Helper for "2 hours ago" formatting
    timeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) {
            if (Math.floor(interval) === 1) return "Yesterday at " + date.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric'}) + " " + date.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
        }
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return "Just now";
    }
}

// Export to window if not using modules
window.ActivityFeed = ActivityFeed;
