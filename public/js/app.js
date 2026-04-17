const API_BASE = '/api';

// Toast Notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icons
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation
function showSection(sectionName) {
    // Check for unsaved changes (global variable from invoices.js)
    if (typeof window.hasUnsavedDraft !== 'undefined' && window.hasUnsavedDraft) {
        if (!confirm('You have an unsaved invoice draft. Leaving this section will discard it. Continue?')) {
            // Restore previous active button if possible, but simplest is just abort
            return;
        }
        // User confirmed discard
        window.hasUnsavedDraft = false;
    }

    // ── Clean up previous section state ──────────────────────────────────
    // Invoice cleanup: remove stale dynamically-injected elements
    const stalePaymentHistory = document.getElementById('payment-history-section');
    if (stalePaymentHistory) stalePaymentHistory.remove();
    const stalePaymentForm = document.getElementById('partial-payment-form');
    if (stalePaymentForm) stalePaymentForm.remove();

    // CRM cleanup: hide phone actions popover from previous client
    const phoneActions = document.getElementById('phone-actions');
    if (phoneActions) phoneActions.style.display = 'none';

    // Close any open project modal
    const projModal = document.getElementById('proj-detail-modal');
    if (projModal && projModal.style.display !== 'none') {
        if (typeof closeProjectModal === 'function') closeProjectModal();
    }

    // Close any open confirm modal
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal && confirmModal.style.display === 'flex') {
        if (typeof closeConfirmModal === 'function') closeConfirmModal();
    }

    // Close meeting success modal if open
    const meetModal = document.getElementById('meeting-success-modal');
    if (meetModal && meetModal.style.display !== 'none') {
        meetModal.style.display = 'none';
    }

    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active from all nav buttons
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) targetSection.classList.add('active');

    // Find and highlight nav button
    let btn;
    if (typeof event !== 'undefined' && event.target) {
        btn = event.target.closest('button');
    }

    // If no event button, try to find by text or onclick
    if (!btn) {
        btn = Array.from(document.querySelectorAll('nav button')).find(b =>
            b.getAttribute('onclick')?.includes(`'${sectionName}'`)
        );
    }

    if (btn) btn.classList.add('active');

    // Load data for the section
    if (sectionName === 'dashboard') {
        if (typeof window.loadDashboard === 'function') loadDashboard();
    } else if (sectionName === 'tasks') {
        if (typeof window.loadTasks === 'function') loadTasks();
    } else if (sectionName === 'meetings') {
        if (typeof window.loadMeetings === 'function') loadMeetings();
    } else if (sectionName === 'crm') {
        if (typeof window.loadClients === 'function') loadClients();
    } else if (sectionName === 'invoices') {
        if (typeof window.loadInvoices === 'function') loadInvoices();
    } else if (sectionName === 'schedule') {
        if (typeof window.loadSchedule === 'function') window.loadSchedule();
    } else if (sectionName === 'subscriptions') {
        if (typeof window.loadSubscriptions === 'function') window.loadSubscriptions();
    } else if (sectionName === 'campaigns') {
        if (typeof window.loadCampaigns === 'function') window.loadCampaigns();
    } else if (sectionName === 'archives') {
        if (typeof window.initArchives === 'function') window.initArchives();
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sectionToLoad = urlParams.get('section');

    if (document.getElementById('dashboard-section')) {
        if (sectionToLoad && document.getElementById(sectionToLoad + '-section')) {
            showSection(sectionToLoad);
        } else if (typeof loadDashboard === 'function') {
            loadDashboard();
        }
    }
    if (document.getElementById('archives-section') && typeof initArchives === 'function') {
        initArchives();
    }
    checkGlobalAuth();

    // STOP API SPAM: Run once on load, then every 30-60s (NOT 1s)
    // Only refresh if the tab is visible to save server resources
    setInterval(() => {
        if (!document.hidden) {
            refreshAllData();
        }
    }, 30000); 
});

// Global refresh function to update all active views
async function refreshAllData() {
    console.log('[POLL] Refreshing global data...');
    
    // 1. Dashboard stats (if on dashboard or just to keep stats fresh)
    if (typeof loadDashboard === 'function') loadDashboard();

    // 2. Invoices list
    if (typeof loadInvoices === 'function') loadInvoices();

    // 3. CRM Projects (if viewing a client)
    if (typeof currentProfileId !== 'undefined' && currentProfileId) {
        if (typeof loadProjects === 'function') loadProjects(currentProfileId);
    }

    // 4. Project Modal (if open)
    const modal = document.getElementById('proj-detail-modal');
    if (modal && modal.style.display !== 'none' && typeof _modalProjectId !== 'undefined' && _modalProjectId) {
        if (typeof loadProjectInvoices === 'function') loadProjectInvoices(_modalProjectId);
    }
}
window.refreshAllData = refreshAllData;

async function checkGlobalAuth() {
    const statusDiv = document.getElementById('global-auth-status');
    if (!statusDiv) return;

    try {
        const response = await fetch('/api/auth/status');
        const status = await response.json(); // { loggedIn: bool, user: { name, email, role } }

        if (status.loggedIn && status.user) {
            const role = status.user.role || 'staff';
            window.userRole = role; // Global role for other scripts
            
            // ── Update Global Status Pill ────────────────────────────
            statusDiv.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                    <a href="/auth/google" target="_blank" title="Click to refresh connection" style="color: #6ee7b7; display: flex; align-items: center; gap: 4px; text-decoration: none; font-size:12px; font-weight:600;">
                        <span style="width: 7px; height: 7px; background: #10b981; border-radius: 50%; box-shadow: 0 0 6px rgba(16,185,129,0.6);"></span>
                        Google Connected
                    </a>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: rgba(255,255,255,0.4); font-size: 11px;">${status.user.email}</span>
                        <span class="badge" style="background: rgba(var(--brand-rgb, 99, 102, 241), 0.15); color: var(--brand-color); font-size: 9px; padding: 2px 6px; border-radius: 6px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">${role}</span>
                    </div>
                </div>
            `;

            // ── Role-Based UI Hiding ────────────────────────────
            if (role !== 'admin') {
                console.log('[RBAC] Pruning admin-only elements for staff user...');
                document.querySelectorAll('[data-role="admin"]').forEach(el => {
                    el.style.display = 'none';
                    el.remove(); // Force removal for security/cleanliness
                });
            }
        } else {
            statusDiv.innerHTML = `
                <a href="/auth/google" target="_blank" style="color: #a5b4fc; text-decoration: none; font-weight: 600; font-size:12px; display: flex; align-items: center; gap: 4px;">
                    <span style="width: 7px; height: 7px; background: #f43f5e; border-radius: 50%; box-shadow: 0 0 6px rgba(244,63,94,0.6);"></span>
                    Connect Google
                </a>
            `;
        }
    } catch (e) {
        console.error('Auth check fail', e);
    }
}
