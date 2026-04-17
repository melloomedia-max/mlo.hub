/**
 * Global Context Menu System
 */
const ContextMenu = {
    element: null,

    init() {
        if (this.element) return;
        
        this.element = document.createElement('div');
        this.element.id = 'custom-context-menu';
        document.body.appendChild(this.element);

        // Hide on click elsewhere
        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => {
            // Only hide if we're not clicking on a trigger
            if (!e.target.closest('[data-context]')) {
                this.hide();
            }
        });

        // Hide on scroll
        window.addEventListener('scroll', () => this.hide(), true);
    },

    show(e, options) {
        e.preventDefault();
        e.stopPropagation();

        this.init();
        this.render(options);

        // Position
        const { clientX: x, clientY: y } = e;
        const menuWidth = 200;
        const menuHeight = this.element.offsetHeight || 200;
        
        let posX = x;
        let posY = y;

        // Boundary checks
        if (x + menuWidth > window.innerWidth) posX = x - menuWidth;
        if (y + menuHeight > window.innerHeight) posY = y - menuHeight;

        this.element.style.left = `${posX}px`;
        this.element.style.top = `${posY}px`;
        this.element.classList.add('active');
    },

    hide() {
        if (this.element) {
            this.element.classList.remove('active');
        }
    },

    render(options) {
        let html = '';
        if (options.header) {
            html += `<div class="context-menu-header">${options.header}</div>`;
        }

        options.items.forEach(item => {
            if (item === 'divider') {
                html += `<div class="context-menu-divider"></div>`;
                return;
            }

            const dangerClass = item.danger ? 'danger' : '';
            html += `
                <div class="context-menu-item ${dangerClass}" onclick="ContextMenu.handleAction('${item.action}', '${options.id}')">
                    <i>${item.icon || '•'}</i>
                    <span>${item.label}</span>
                </div>
            `;
        });

        this.element.innerHTML = html;
        this.currentOptions = options;
    },

    handleAction(action, id) {
        this.hide();
        
        // Dispatch to global handlers
        if (typeof window[action] === 'function') {
            window[action](id);
        } else {
            console.warn(`Context menu action "${action}" not found globally.`);
            // Fallback: Custom Event
            const event = new CustomEvent('contextAction', { detail: { action, id } });
            document.dispatchEvent(event);
        }
    },

    /**
     * Helper to attach context menu to elements
     * @param {string} type - 'client', 'task', 'invoice', etc.
     * @param {string} id - The database ID
     * @param {string} label - Display name for header
     */
    attach(e, type, id, label = '') {
        const configs = {
            'client': {
                header: label || 'Client Options',
                items: [
                    { label: 'View Profile', icon: '👤', action: 'openClientProfile' },
                    { label: 'Edit Info', icon: '📝', action: 'editClientContext' },
                    'divider',
                    { label: 'Create Invoice', icon: '💰', action: 'createInvoiceForClientContext' },
                    { label: 'New Task', icon: '⚡', action: 'createTaskForClientContext' },
                    'divider',
                    { label: 'Delete Client', icon: '🗑️', action: 'deleteClientContext', danger: true }
                ]
            },
            'task': {
                header: label || 'Task Options',
                items: [
                    { label: 'Edit Task', icon: '📝', action: 'editTaskContext' },
                    { label: 'Mark Done', icon: '✅', action: 'completeTaskContext' },
                    'divider',
                    { label: 'Delete Task', icon: '🗑️', action: 'deleteTaskContext', danger: true }
                ]
            },
            'invoice': {
                header: label || 'Invoice Option',
                items: [
                    { label: 'View / Print', icon: '📄', action: 'openInvoiceDetailContext' },
                    { label: 'Email to Client', icon: '✉️', action: 'emailInvoiceContext' },
                    { label: 'Download PDF', icon: '⬇️', action: 'downloadInvoicePDFContext' },
                    'divider',
                    { label: 'Mark as Paid', icon: '✅', action: 'markInvoicePaidContext' },
                    { label: 'Delete', icon: '🗑️', action: 'deleteInvoiceContext', danger: true }
                ]
            },
            'subscription': {
                header: label || 'Subscription',
                items: [
                    { label: 'Manage Sub', icon: '🔄', action: 'manageSubscriptionContext' },
                    { label: 'Cancel Sub', icon: '🚫', action: 'cancelSubscriptionContext', danger: true }
                ]
            },
            'campaign': {
                header: label || 'Campaign',
                items: [
                    { label: 'Edit Flow', icon: '🎨', action: 'editCampaignContext' },
                    { label: 'View Stats', icon: '📊', action: 'viewCampaignStatsContext' },
                    'divider',
                    { label: 'Delete', icon: '🗑️', action: 'deleteCampaignContext', danger: true }
                ]
            },
            'meeting': {
                header: label || 'Meeting Options',
                items: [
                    { label: 'Join Meeting', icon: '🎥', action: 'joinMeetingContext' },
                    { label: 'View Details', icon: '📄', action: 'viewMeetingDetailsContext' },
                    'divider',
                    { label: 'Delete Meeting', icon: '🗑️', action: 'deleteMeetingContext', danger: true }
                ]
            },
            'project': {
                header: label || 'Project Options',
                items: [
                    { label: 'Mark Delivered', icon: '✅', action: 'completeProjectContext' },
                    { label: 'Edit Project', icon: '📝', action: 'editProjectContext' },
                    'divider',
                    { label: 'Delete Project', icon: '🗑️', action: 'deleteProjectContext', danger: true }
                ]
            }
        };

        const config = configs[type];
        if (config) {
            this.show(e, { ...config, id });
        }
    }
};

// Expose globally
window.ContextMenu = ContextMenu;

// Global Context Handlers (Bridges between ContextMenu and existing functions)
window.editClientContext = (id) => {
    openClientProfile(id);
    setTimeout(() => toggleEditMode(), 300);
};

window.editTaskContext = (id) => {
    showSection('tasks');
    setTimeout(() => editTask(id), 300);
};

window.createInvoiceForClientContext = (id) => {
    showInvoiceForm();
    const select = document.getElementById('invoice-client-select');
    if (select) {
        select.value = id;
        loadClientProjectsForInvoice(id);
    }
};

window.createTaskForClientContext = (id) => {
    showCreationForm('task');
    const select = document.getElementById('task-client-select');
    if (select) select.value = id;
};

window.deleteClientContext = async (id) => {
    if (confirm('Are you sure you want to delete this client?')) {
        await fetch(`/api/crm/clients/${id}`, { method: 'DELETE' });
        loadClients();
    }
};

window.completeTaskContext = async (id) => {
    await updateTaskStatus(id, 'done');
    loadTasks();
};

window.deleteTaskContext = async (id) => {
    if (confirm('Delete this task?')) {
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        loadTasks();
    }
};

window.emailInvoiceContext = async (id) => {
    if (confirm('Send this invoice to the client?')) {
        try {
            await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
            alert('Email sent successfully!');
            loadInvoices();
        } catch (e) {
            alert('Failed to send email.');
        }
    }
};

window.markInvoicePaidContext = async (id) => {
    await fetch(`/api/invoices/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' })
    });
    loadInvoices();
};

window.openInvoiceDetailContext = (id) => {
    showSection('invoices');
    openInvoiceDetail(id);
};

window.downloadInvoicePDFContext = (id) => {
    window.open(`/api/invoices/generate/pdf/${id}`, '_blank');
};

window.deleteInvoiceContext = async (id) => {
    if (confirm('Delete this invoice?')) {
        await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
        loadInvoices();
    }
};

window.joinMeetingContext = async (id) => {
    const res = await fetch(`/api/meetings/${id}`);
    const meet = await res.json();
    if (meet.meet_link) window.open(meet.meet_link, '_blank');
};

window.viewMeetingDetailsContext = (id) => {
    showSection('meetings');
    setTimeout(() => {
        const btn = document.querySelector(`button[onclick="checkMeetingArtifacts(${id}, this)"]`);
        if (btn) btn.click();
    }, 300);
};

window.deleteMeetingContext = (id) => {
    if (confirm('Delete this meeting?')) {
        deleteMeeting(id);
    }
};

window.completeProjectContext = async (id) => {
    await fetch(`/api/crm/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' })
    });
    if (window.loadSchedule) loadSchedule();
    if (window.loadClients) loadClients();
};

window.editProjectContext = (id) => {
    // Projects are usually edited via the client profile
    // We'll try to find the client_id and open the profile
    fetch(`/api/crm/projects/${id}`).then(r => r.json()).then(p => {
        if (p.client_id) {
            openClientProfile(p.client_id);
            // Highlight or scroll to project in profile? 
            // For now just opening profile is a good start
        }
    });
};

window.deleteProjectContext = async (id) => {
    if (confirm('Delete this project?')) {
        await fetch(`/api/crm/projects/${id}`, { method: 'DELETE' });
        if (window.loadSchedule) loadSchedule();
        if (window.loadClients) loadClients();
    }
};

window.manageSubscriptionContext = (id) => {
    showSection('subscriptions');
    // Maybe highlight it?
};

window.cancelSubscriptionContext = async (id) => {
    if (confirm('Cancel this subscription?')) {
        await deleteSubscription(id);
    }
};

window.editCampaignContext = (id) => {
    showSection('campaigns');
    editCampaign(id);
};

window.viewCampaignStatsContext = (id) => {
    showSection('campaigns');
    viewCampaignStats(id);
};

window.deleteCampaignContext = async (id) => {
    if (confirm('Delete this campaign?')) {
        await deleteCampaign(id);
    }
};
