// Staff Account Management
// Handles staff CRUD, permissions, invitations, and OAuth linking

let currentStaff = [];
const defaultPermissions = {
    can_view_clients: true,
    can_edit_clients: false,
    can_view_invoices: true,
    can_create_invoices: false,
    can_view_reports: true,
    can_manage_campaigns: false
};

async function loadStaffAccounts() {
    try {
        const response = await fetch('/api/staff');
        currentStaff = await response.json();
        renderStaffTable();
    } catch (error) {
        console.error('Error loading staff:', error);
        showToast('Failed to load staff accounts', 'error');
    }
}

function renderStaffTable() {
    const tbody = document.getElementById('staff-accounts-tbody');
    if (!tbody) return;

    if (currentStaff.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-tertiary);">No staff members yet. Invite your first team member!</td></tr>';
        return;
    }

    tbody.innerHTML = currentStaff.map(staff => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
            <td style="padding: 14px;">
                <div style="font-weight: 600;">${escapeHtml(staff.name)}</div>
                <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 2px;">
                    ${staff.google_id ? '<span style="color: #4285F4;">● Google</span>' : 'Email'}
                </div>
            </td>
            <td style="padding: 14px; font-size: 13px; color: var(--text-secondary);">${escapeHtml(staff.email)}</td>
            <td style="padding: 14px;">
                <span class="role-badge role-${staff.role}">${staff.role}</span>
            </td>
            <td style="padding: 14px;">
                <span class="status-badge status-${staff.status}">${staff.status}</span>
            </td>
            <td style="padding: 14px; font-size: 12px; color: var(--text-tertiary);">
                ${staff.last_login ? formatDate(staff.last_login) : 'Never'}
            </td>
            <td style="padding: 14px; text-align: right;">
                <button class="action-btn" onclick="editStaffAccount(${staff.id})" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="action-btn" onclick="deleteStaffAccount(${staff.id}, '${escapeHtml(staff.name)}')" title="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

function openInviteStaffModal() {
    const modal = document.getElementById('invite-staff-modal');
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-role').value = 'staff';
    resetPermissionCheckboxes();
    modal.style.display = 'flex';
}

function closeInviteStaffModal() {
    document.getElementById('invite-staff-modal').style.display = 'none';
}

async function sendStaffInvite(e) {
    e.preventDefault();
    
    const email = document.getElementById('invite-email').value;
    const role = document.getElementById('invite-role').value;
    const permissions = getPermissionsFromForm();

    try {
        const response = await fetch('/staff/auth/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role, permissions })
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Invitation sent successfully!', 'success');
            closeInviteStaffModal();
        } else {
            showToast(result.error || 'Failed to send invitation', 'error');
        }
    } catch (error) {
        console.error('Error sending invitation:', error);
        showToast('Failed to send invitation', 'error');
    }
}

function openEditStaffModal() {
    const modal = document.getElementById('edit-staff-modal');
    modal.style.display = 'flex';
}

function closeEditStaffModal() {
    document.getElementById('edit-staff-modal').style.display = 'none';
}

function editStaffAccount(staffId) {
    const staff = currentStaff.find(s => s.id === staffId);
    if (!staff) return;

    document.getElementById('edit-staff-id').value = staff.id;
    document.getElementById('edit-staff-name').value = staff.name;
    document.getElementById('edit-staff-email').value = staff.email;
    document.getElementById('edit-staff-role').value = staff.role;
    document.getElementById('edit-staff-status').value = staff.status;
    
    // Load permissions
    const permissions = staff.permissions || {};
    for (const [key, value] of Object.entries(permissions)) {
        const checkbox = document.getElementById(`edit-perm-${key}`);
        if (checkbox) checkbox.checked = value;
    }

    openEditStaffModal();
}

async function saveStaffEdits(e) {
    e.preventDefault();

    const staffId = document.getElementById('edit-staff-id').value;
    const name = document.getElementById('edit-staff-name').value;
    const email = document.getElementById('edit-staff-email').value;
    const role = document.getElementById('edit-staff-role').value;
    const status = document.getElementById('edit-staff-status').value;
    const password = document.getElementById('edit-staff-password').value;
    const permissions = getEditPermissionsFromForm();

    const payload = { name, email, role, status, permissions };
    if (password) payload.password = password;

    try {
        const response = await fetch(`/api/staff/${staffId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            showToast('Staff account updated successfully', 'success');
            closeEditStaffModal();
            loadStaffAccounts();
        } else {
            showToast(result.error || 'Failed to update staff account', 'error');
        }
    } catch (error) {
        console.error('Error updating staff:', error);
        showToast('Failed to update staff account', 'error');
    }
}

async function deleteStaffAccount(staffId, staffName) {
    if (!confirm(`Are you sure you want to remove ${staffName} from the team?`)) return;

    try {
        const response = await fetch(`/api/staff/${staffId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Staff account removed', 'success');
            loadStaffAccounts();
        } else {
            showToast('Failed to remove staff account', 'error');
        }
    } catch (error) {
        console.error('Error deleting staff:', error);
        showToast('Failed to remove staff account', 'error');
    }
}

function getPermissionsFromForm() {
    return {
        can_view_clients: document.getElementById('perm-can_view_clients').checked,
        can_edit_clients: document.getElementById('perm-can_edit_clients').checked,
        can_view_invoices: document.getElementById('perm-can_view_invoices').checked,
        can_create_invoices: document.getElementById('perm-can_create_invoices').checked,
        can_view_reports: document.getElementById('perm-can_view_reports').checked,
        can_manage_campaigns: document.getElementById('perm-can_manage_campaigns').checked
    };
}

function getEditPermissionsFromForm() {
    return {
        can_view_clients: document.getElementById('edit-perm-can_view_clients').checked,
        can_edit_clients: document.getElementById('edit-perm-can_edit_clients').checked,
        can_view_invoices: document.getElementById('edit-perm-can_view_invoices').checked,
        can_create_invoices: document.getElementById('edit-perm-can_create_invoices').checked,
        can_view_reports: document.getElementById('edit-perm-can_view_reports').checked,
        can_manage_campaigns: document.getElementById('edit-perm-can_manage_campaigns').checked
    };
}

function resetPermissionCheckboxes() {
    for (const [key, value] of Object.entries(defaultPermissions)) {
        const checkbox = document.getElementById(`perm-${key}`);
        if (checkbox) checkbox.checked = value;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
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
    if (document.getElementById('panel-staff-accounts')) {
        loadStaffAccounts();
    }
});
