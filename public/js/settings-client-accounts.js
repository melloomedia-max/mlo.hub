// Client Account Management
// Handles client portal access, permissions, and tokens

let currentClients = [];

async function loadClientAccounts() {
    try {
        const response = await fetch('/api/crm/client-accounts');
        currentClients = await response.json();
        renderClientAccountsTable();
    } catch (error) {
        console.error('Error loading client accounts:', error);
        showToast('Failed to load client accounts', 'error');
    }
}

function renderClientAccountsTable() {
    const tbody = document.getElementById('client-accounts-tbody');
    if (!tbody) return;

    if (currentClients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No clients yet.</td></tr>';
        return;
    }

    tbody.innerHTML = currentClients.map(client => {
        const hasAccess = client.portal_access === 1;
        const hasToken = client.portal_token && client.portal_token !== 'N/A';
        const authMethod = client.auth_provider === 'google' ? 'Google OAuth' : 'Email/Password';

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 14px;">
                    <div style="font-weight: 600;">${escapeHtml(client.name || client.first_name + ' ' + client.last_name)}</div>
                    <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">${escapeHtml(client.email)}</div>
                </td>
                <td style="padding: 14px;">
                    <label class="toggle-switch">
                        <input type="checkbox" ${hasAccess ? 'checked' : ''} onchange="togglePortalAccess(${client.id}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td style="padding: 14px; font-size: 13px; color: var(--text-secondary);">
                    ${authMethod}
                </td>
                <td style="padding: 14px;">
                    ${hasAccess && hasToken ? 
                        `<button class="action-btn-text" onclick="showPortalLink(${client.id}, '${client.portal_token}')" title="View Portal Link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg> View Link
                        </button>` : 
                        '<span style="color: var(--text-tertiary); font-size: 12px;">No access</span>'
                    }
                </td>
                <td style="padding: 14px; text-align: right;">
                    ${hasAccess ? `
                        <button class="action-btn" onclick="manageClientPermissions(${client.id})" title="Permissions">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </button>
                        <button class="action-btn" onclick="regenerateClientToken(${client.id})" title="Regenerate Token">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </button>
                        <button class="action-btn" onclick="sendPortalLinkToClient(${client.id})" title="Send Portal Link">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    ` : '<span style="color: var(--text-tertiary); font-size: 11px;">—</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

async function togglePortalAccess(clientId, enabled) {
    try {
        const response = await fetch(`/api/crm/client-accounts/${clientId}/portal-access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });

        const result = await response.json();

        if (response.ok) {
            showToast(enabled ? 'Portal access enabled' : 'Portal access disabled', 'success');
            loadClientAccounts();
        } else {
            showToast(result.error || 'Failed to update portal access', 'error');
            loadClientAccounts(); // Reload to reset toggle
        }
    } catch (error) {
        console.error('Error toggling portal access:', error);
        showToast('Failed to update portal access', 'error');
        loadClientAccounts();
    }
}

async function regenerateClientToken(clientId) {
    if (!confirm('Regenerate this client\'s portal token? Their old link will stop working.')) return;

    try {
        const response = await fetch(`/api/crm/client-accounts/${clientId}/regenerate-token`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Portal token regenerated successfully', 'success');
            loadClientAccounts();
        } else {
            showToast(result.error || 'Failed to regenerate token', 'error');
        }
    } catch (error) {
        console.error('Error regenerating token:', error);
        showToast('Failed to regenerate token', 'error');
    }
}

function showPortalLink(clientId, token) {
    const link = `https://portal.melloo.media/login?token=${token}`;
    
    const modal = document.getElementById('portal-link-modal');
    document.getElementById('portal-link-url').value = link;
    modal.style.display = 'flex';
}

function closePortalLinkModal() {
    document.getElementById('portal-link-modal').style.display = 'none';
}

function copyPortalLink() {
    const input = document.getElementById('portal-link-url');
    input.select();
    document.execCommand('copy');
    showToast('Portal link copied!', 'success');
}

async function sendPortalLinkToClient(clientId) {
    try {
        const response = await fetch(`/api/crm/client-accounts/${clientId}/send-link`, {
            method: 'POST'
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Portal link sent to client\'s email', 'success');
        } else {
            showToast(result.error || 'Failed to send portal link', 'error');
        }
    } catch (error) {
        console.error('Error sending portal link:', error);
        showToast('Failed to send portal link', 'error');
    }
}

function manageClientPermissions(clientId) {
    const client = currentClients.find(c => c.id === clientId);
    if (!client) return;

    const permissions = client.portal_permissions || {};
    
    document.getElementById('edit-client-id').value = clientId;
    document.getElementById('edit-client-name').textContent = client.name || `${client.first_name} ${client.last_name}`;
    
    // Set permission checkboxes
    document.getElementById('client-perm-can_view_invoices').checked = permissions.can_view_invoices !== false;
    document.getElementById('client-perm-can_view_projects').checked = permissions.can_view_projects !== false;
    document.getElementById('client-perm-can_upload_files').checked = permissions.can_upload_files !== false;
    document.getElementById('client-perm-can_message_staff').checked = permissions.can_message_staff !== false;

    document.getElementById('client-permissions-modal').style.display = 'flex';
}

function closeClientPermissionsModal() {
    document.getElementById('client-permissions-modal').style.display = 'none';
}

async function saveClientPermissions(e) {
    e.preventDefault();

    const clientId = document.getElementById('edit-client-id').value;
    const permissions = {
        can_view_invoices: document.getElementById('client-perm-can_view_invoices').checked,
        can_view_projects: document.getElementById('client-perm-can_view_projects').checked,
        can_upload_files: document.getElementById('client-perm-can_upload_files').checked,
        can_message_staff: document.getElementById('client-perm-can_message_staff').checked
    };

    try {
        const response = await fetch(`/api/crm/client-accounts/${clientId}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions })
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Client permissions updated', 'success');
            closeClientPermissionsModal();
            loadClientAccounts();
        } else {
            showToast(result.error || 'Failed to update permissions', 'error');
        }
    } catch (error) {
        console.error('Error updating permissions:', error);
        showToast('Failed to update permissions', 'error');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Initialize on panel show
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('panel-client-accounts')) {
        loadClientAccounts();
    }
});
