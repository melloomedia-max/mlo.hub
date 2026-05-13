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

    if (container) container.appendChild(toast);

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
    if (typeof initKeyboardShortcuts === 'function') initKeyboardShortcuts();
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

    // Data Refresh Interval
    setInterval(() => {
        if (!document.hidden) {
            refreshAllData();
        }
    }, 45000); 
});

// Global refresh function to update all active views
async function refreshAllData() {
    if (typeof loadDashboard === 'function') loadDashboard();
    if (typeof loadInvoices === 'function') loadInvoices();
    if (typeof currentProfileId !== 'undefined' && currentProfileId) {
        if (typeof loadProjects === 'function') loadProjects(currentProfileId);
    }
}
window.refreshAllData = refreshAllData;

window.initKeyboardShortcuts = function() {
    let gPressed = false;
    let gTimer = null;

    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
        const activeTag = document.activeElement.tagName;

        // Ignore if typing in input/textarea unless it's the Escape key
        if (e.key !== 'Escape' && (activeTag === 'INPUT' || activeTag === 'TEXTAREA')) return;

        const searchInput = document.getElementById('client-search');

        // ─── SEARCH SHORTCUTS ───────────────────────────
        if (cmdOrCtrl && (e.key || "").toLowerCase() === 'k') {
            e.preventDefault();
            // Always navigate to CRM first (the only section with a search input).
            // Previously this only worked when #client-search was already visible,
            // which meant Cmd+K silently did nothing outside CRM.
            const crmSection = document.getElementById('crm-section');
            if (crmSection && !crmSection.classList.contains('active')) {
                navigateTo('crm');
            }
            // Wait for the section swap to finish before focusing.
            setTimeout(() => {
                const s = document.getElementById('client-search');
                if (s) { s.focus(); s.select(); }
            }, 60);
        }

        if (e.key === '/') {
            if (searchInput && searchInput.offsetParent !== null) {
                e.preventDefault();
                searchInput.focus();
            }
        }

        if (e.key === 'Escape') {
            if (searchInput && document.activeElement === searchInput) {
                searchInput.blur();
            }
            gPressed = false;
            clearTimeout(gTimer);
        }

        // ─── QUICK ACTIONS ──────────────────────────────
        // Cmd/Ctrl + N -> New Client
        if (cmdOrCtrl && (e.key || "").toLowerCase() === 'n') {
            e.preventDefault();
            const newClientBtn = document.getElementById('new-client-btn');
            if (newClientBtn) newClientBtn.click();
        }

        // ─── G + KEY NAVIGATION ─────────────────────────
        if ((e.key || "").toLowerCase() === 'g' && !cmdOrCtrl) {
            // Only trigger if not already waiting for G follow-up
            if (!gPressed) {
                gPressed = true;
                // Auto-reset G after 1.5s
                clearTimeout(gTimer);
                gTimer = setTimeout(() => {
                    gPressed = false;
                }, 1500);
                return;
            }
        }

        if (gPressed) {
            const key = (e.key || "").toLowerCase();
            const sections = {
                'd': 'dashboard',
                'c': 'crm',
                'i': 'invoices',
                't': 'tasks',
                's': 'subscriptions',
                'm': 'campaigns',
                'l': 'schedule' // L for scheduLe/caLendar
            };

            if (sections[key]) {
                e.preventDefault();
                gPressed = false;
                clearTimeout(gTimer);
                navigateTo(sections[key]);
            }
        }
    });
};

window.navigateTo = function(section) {
    // Try data-section first
    const navItem = document.querySelector(`[data-section="${section}"]`);
    if (navItem) {
        navItem.click();
        return;
    }

    // Fallback: find nav button by its onclick attribute
    const btn = Array.from(document.querySelectorAll('nav button')).find(b =>
        b.getAttribute('onclick')?.includes(`'${section}'`)
    );
    if (btn) {
        btn.click();
        return;
    }

    // Final fallback: call showSection directly
    if (typeof showSection === 'function') {
        showSection(section);
    } else {
        console.warn(`navigateTo: could not find section "${section}"`);
    }
};

