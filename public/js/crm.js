function showClientForm() {
    const el = document.getElementById('client-form');
    if (el) el.style.display = 'block';
}

function hideClientForm() {
    const el = document.getElementById('client-form');
    if (el) el.style.display = 'none';
    if (typeof resetClientFormLink === 'function') resetClientFormLink();
    if (typeof resetCreateBizTags === 'function') resetCreateBizTags();
}

window.loadClients = loadClients;
window.openClientProfile = openClientProfile;
window.showClientForm = showClientForm;
window.hideClientForm = hideClientForm;
window.toggleEditMode = toggleEditMode;

async function loadClients(statusFilter = null) {
    try {
        const response = await fetch(`${API_BASE}/crm/clients`);
        let clients = await response.json();
        
        if (statusFilter && statusFilter !== 'all') {
            clients = clients.filter(c => c.status === statusFilter);
        }
        
        displayClients(clients);
    } catch (error) {
        console.error('Error loading clients:', error);
    }
}

function displayClients(clients) {
    const container = document.getElementById('clients-list');

    if (!container) return;
    if (clients.length === 0) {
        container.innerHTML = '<p class="empty-state">No clients yet.</p>';
        return;
    }

    // Group clients by status
    const activeClients = clients.filter(c => c.status === 'active');
    const leadClients = clients.filter(c => c.status === 'lead');
    const pastClients = clients.filter(c => c.status === 'past');
    const otherClients = clients.filter(c => !['active', 'lead', 'past'].includes(c.status));

    // Helper function to render a client card
    const renderClientCard = (client) => {
        const names = (client.name || '').split(' ');
        const initials = names.length > 1 ? names[0][0] + names[names.length - 1][0] : (names[0] ? names[0][0] : '?');
        const displayName = client.name || 'Unknown';

        const bizNames = client.business_names ? client.business_names.split(',') : [];
        const mainBiz = bizNames[0] || client.company || 'Personal Client';

        return `
        <div class="client-card-square" 
             onclick="openClientProfile(${client.id})" 
             oncontextmenu="ContextMenu.attach(event, 'client', ${client.id}, '${(client.name || '').replace(/'/g, "\\'")}')"
             data-context="client">
            <div class="card-status-dot status-dot-${client.status || 'unknown'}"></div>
            <div class="card-avatar">${initials}</div>
            <div class="card-name">${displayName}</div>
            <div class="card-company">${mainBiz}</div>
        </div>
      `;
    };

    // Helper function to render a section
    const renderSection = (title, clients, icon, emptyMessage, isHiddenIfEmpty = false) => {
        if (clients.length === 0) {
            if (isHiddenIfEmpty) return '';
            return `
                <div class="client-section">
                    <div class="section-title">
                        <span class="section-icon">${icon}</span>
                        <h3>${title}</h3>
                        <span class="section-count">0</span>
                    </div>
                    <p class="empty-section-message">${emptyMessage}</p>
                </div>
            `;
        }

        const html = clients.map(renderClientCard).join('');
        const renderedCount = (html.match(/class="client-card-square"/g) || []).length;

        // Mismatch check
        const mismatchNotice = (clients.length > 0 && renderedCount !== clients.length) 
            ? `<div class="render-error-notice">⚠️ Only ${renderedCount} of ${clients.length} clients rendered. Please refresh or contact support.</div>` 
            : '';

        if (mismatchNotice) console.warn(`[CRM] Render mismatch in section "${title}": expected ${clients.length}, got ${renderedCount}`);

        return `
            <div class="client-section">
                <div class="section-title">
                    <span class="section-icon">${icon}</span>
                    <h3>${title}</h3>
                    <span class="section-count">${clients.length}</span>
                </div>
                ${mismatchNotice}
                <div class="clients-grid">
                    ${html}
                </div>
            </div>
        `;
    };

    // Build the complete HTML with all sections
    container.innerHTML = `
        ${renderSection('Active Clients', activeClients, '✨', 'No active clients yet')}
        ${renderSection('Leads', leadClients, '🎯', 'No leads yet')}
        ${renderSection('Past Clients', pastClients, '📦', 'No past clients yet')}
        ${renderSection('Other / Uncategorized', otherClients, '❓', 'No other clients', true)}
    `;
}

// Helper to get folder ID from input (ID or URL)
function extractFolderId(input) {
    if (!input) return null;
    if (input.includes('drive.google.com')) {
        const parts = input.split('/');
        const foldersIndex = parts.indexOf('folders');
        if (foldersIndex !== -1 && parts[foldersIndex + 1]) {
            return parts[foldersIndex + 1].split('?')[0];
        }
    }
    return input.trim();
}

// Global variable to track current viewing client for notes
let currentProfileId = null;

async function openClientProfile(clientId) {
    try {
        // ── Clean up state from previous client ─────────────────────────────
        // Reset phone actions popover
        const _phoneActions = document.getElementById('phone-actions');
        if (_phoneActions) _phoneActions.style.display = 'none';

        // Reset socials container
        const _socialsContainer = document.getElementById('detail-socials');
        if (_socialsContainer) { _socialsContainer.innerHTML = ''; _socialsContainer.style.display = 'none'; }

        // Reset edit mode to view mode
        const viewMode = document.getElementById('profile-view-mode');
        const editMode = document.getElementById('profile-edit-mode');
        if (viewMode) viewMode.style.display = 'flex';
        if (editMode) editMode.style.display = 'none';

        // Reset toggle-edit button
        const editBtn = document.getElementById('toggle-edit-btn');
        if (editBtn) { editBtn.style.display = 'block'; editBtn.textContent = 'EDIT PROFILE'; }

        // Clear notes thread so stale notes don't flash
        const notesThread = document.getElementById('detail-notes-thread');
        if (notesThread) notesThread.innerHTML = '<div class="loading-notes">Loading activity...</div>';

        // Clear projects list
        const projList = document.getElementById('proj-list');
        if (projList) projList.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:13px; padding:12px 0;">Loading...</p>';

        // Hide project form if open
        const projForm = document.getElementById('proj-add-form');
        if (projForm) projForm.style.display = 'none';

        // Clear businesses list + hide form
        const bizList = document.getElementById('businesses-list');
        if (bizList) bizList.innerHTML = '<p class="businesses-empty">Loading...</p>';
        const bizForm = document.getElementById('add-business-form');
        if (bizForm) bizForm.style.display = 'none';

        // Clear media grid
        const mediaGrid = document.getElementById('media-grid');
        if (mediaGrid) mediaGrid.innerHTML = '';

        // Reset drive link/folder button state
        const _driveLink = document.getElementById('detail-drive-link');
        const _createFolderBtn = document.getElementById('create-folder-btn');
        if (_driveLink) _driveLink.style.display = 'none';
        if (_createFolderBtn) _createFolderBtn.style.display = 'none';

        // Reset activity doc link
        const _docLink = document.getElementById('activity-doc-link');
        if (_docLink) _docLink.style.display = 'none';

        // ── Fetch and populate new client data ────────────────────────
        const response = await fetch(`${API_BASE}/crm/clients/${clientId}`);
        if (!response.ok) throw new Error('Client not found');
        const client = await response.json();

        if (!client) return;

        currentProfileId = clientId;

        // Populate View Mode
        const nameEl = document.getElementById('detail-name');
        const companyEl = document.getElementById('detail-company');
        if (nameEl) nameEl.textContent = client.name;
        if (companyEl) companyEl.textContent = client.company || 'No Company';
        // Email — link to Gmail compose
        const emailEl = document.getElementById('detail-email');
        if (emailEl) {
            const emailVal = client.email || '';
            emailEl.textContent = emailVal || '-';
            emailEl.href = emailVal
                ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(emailVal)}`
                : '#';
            emailEl.style.pointerEvents = emailVal ? '' : 'none';
        }

        // Phone — click toggles Call / SMS action buttons
        const phoneEl = document.getElementById('detail-phone');
        const phoneActions = document.getElementById('phone-actions');
        if (phoneEl) {
            const phoneVal = client.phone || '';
            const phoneDigits = phoneVal.replace(/\D/g, '');
            phoneEl.textContent = formatPhone(phoneVal) || '-';
            if (phoneDigits) {
                phoneEl.href = '#';
                phoneEl.style.pointerEvents = '';
                phoneEl.onclick = (e) => {
                    e.preventDefault();
                    if (phoneActions) {
                        const shown = phoneActions.style.display !== 'none' && phoneActions.style.display !== '';
                        phoneActions.style.display = shown ? 'none' : 'inline-flex';
                    }
                };
                const callLink = document.getElementById('phone-call-link');
                const smsLink = document.getElementById('phone-sms-link');
                if (callLink) callLink.href = `https://voice.google.com/calls?a=nc,+1${phoneDigits}`;
                if (smsLink) smsLink.href = `https://voice.google.com/messages?a=nc,+1${phoneDigits}`;
            } else {
                phoneEl.href = '#';
                phoneEl.style.pointerEvents = 'none';
                if (phoneActions) phoneActions.style.display = 'none';
            }
        }

        const statusEl = document.getElementById('detail-status');
        if (statusEl) {
            statusEl.className = `status-badge status-${client.status}`;
            statusEl.textContent = client.status;
        }

        const names = client.name.split(' ');
        const initials = names.length > 1 ? names[0][0] + names[names.length - 1][0] : names[0][0];
        const detailAvatar = document.getElementById('detail-avatar');
        const editAvatar = document.getElementById('edit-avatar-preview');
        if (detailAvatar) detailAvatar.textContent = initials;
        if (editAvatar) editAvatar.textContent = initials;

        // Drive Logic (Initial Setup)
        const driveLink = document.getElementById('detail-drive-link');
        const createFolderBtn = document.getElementById('create-folder-btn');

        if (client.google_drive_folder_id) {
            driveLink.href = `https://drive.google.com/drive/folders/${client.google_drive_folder_id}`;
            driveLink.style.display = 'block';
            createFolderBtn.style.display = 'none';
            // We'll actually load the files non-blockingly at the end of this function
            mediaGrid.innerHTML = `
                <div style="display: flex; justify-content: center; padding: 20px;">
                    <lottie-player src="img/loading-circles.json" background="transparent" speed="1" style="width: 100px; height: 100px;" loop autoplay></lottie-player>
                </div>
            `;
            
            // Show portal buttons
            const pBtn = document.getElementById('mh-portal-link-btn');
            const eBtn = document.getElementById('mh-portal-email-btn');
            const sBtn = document.getElementById('mh-portal-sms-btn');
            if (pBtn) pBtn.style.display = 'inline-flex';
            if (eBtn) eBtn.style.display = 'inline-flex';
            if (sBtn) sBtn.style.display = 'inline-flex';
            mhClientPortalToken = client.portal_token;
        } else {
            driveLink.style.display = 'none';
            createFolderBtn.style.display = 'block';
            mediaGrid.innerHTML = '<p class="empty-state">No Drive folder linked.</p>';
        }

        // Populate Edit Form (Pre-fill)
        // If data is old, split name manually
        let fName = client.first_name || '';
        let lName = client.last_name || '';

        if (!fName && !lName && client.name) {
            const parts = client.name.split(' ');
            fName = parts[0];
            lName = parts.slice(1).join(' ') || '';
        }

        // Populate Socials in View Mode
        const socialsContainer = document.getElementById('detail-socials');
        socialsContainer.innerHTML = '';
        const socials = [
            { id: 'instagram', icon: '📷', url: client.social_instagram ? `https://instagram.com/${client.social_instagram.replace('@', '')}` : null },
            { id: 'linkedin', icon: '💼', url: client.social_linkedin },
            { id: 'twitter', icon: '🐦', url: client.social_twitter ? `https://twitter.com/${client.social_twitter.replace('@', '')}` : null },
            { id: 'facebook', icon: '📘', url: client.social_facebook }
        ];

        let hasSocials = false;
        socials.forEach(social => {
            if (social.url) {
                hasSocials = true;
                const link = document.createElement('a');
                link.href = social.url;
                link.target = '_blank';
                link.className = `social-icon-btn social-${social.id}`;
                link.innerHTML = social.icon;
                socialsContainer.appendChild(link);
            }
        });

        if (!hasSocials) {
            socialsContainer.style.display = 'none';
        } else {
            socialsContainer.style.display = 'flex';
        }

        // Navigate
        showSection('client-detail');

        // Populate Edit Form (Pre-fill)
        // No need to redeclare variables or re-parse logic as it's already done above.

        const editFirstName = document.getElementById('edit-first-name');
        const editLastName = document.getElementById('edit-last-name');
        const editBirthday = document.getElementById('edit-birthday');
        const editCompany = document.getElementById('edit-company');
        const editEmail = document.getElementById('edit-email');
        const editPhone = document.getElementById('edit-phone');
        const editStatus = document.getElementById('edit-status');
        const editDrive = document.getElementById('edit-google-drive-folder');

        if (editFirstName) editFirstName.value = fName;
        if (editLastName) editLastName.value = lName;
        if (editBirthday) editBirthday.value = client.birthday || '';
        if (editCompany) editCompany.value = client.company || '';
        if (editEmail) editEmail.value = client.email || '';
        if (editPhone) editPhone.value = formatPhone(client.phone || '');
        if (editStatus) editStatus.value = client.status;
        if (editDrive) editDrive.value = client.google_drive_folder_id || '';

        // Pre-fill Socials
        const editInsta = document.getElementById('edit-instagram');
        const editLinked = document.getElementById('edit-linkedin');
        const editTwitter = document.getElementById('edit-twitter');
        const editFB = document.getElementById('edit-facebook');

        if (editInsta) editInsta.value = client.social_instagram || '';
        if (editLinked) editLinked.value = client.social_linkedin || '';
        if (editTwitter) editTwitter.value = client.social_twitter || '';
        if (editFB) editFB.value = client.social_facebook || '';

        // Reset View
        const viewModeEl = document.getElementById('profile-view-mode');
        const editModeEl = document.getElementById('profile-edit-mode');
        const toggleEditEl = document.getElementById('toggle-edit-btn');
        if (viewModeEl) viewModeEl.style.display = 'flex';
        if (editModeEl) editModeEl.style.display = 'none';
        if (toggleEditEl) {
            toggleEditEl.style.display = 'block';
            toggleEditEl.textContent = 'EDIT PROFILE';
        }

        // Activity Doc Link
        const docLink = document.getElementById('activity-doc-link');
        if (client.activity_doc_id) {
            docLink.style.display = 'inline';
            docLink.href = `https://docs.google.com/document/d/${client.activity_doc_id}/edit`;
        } else {
            docLink.style.display = 'none';
        }

        // Initialize reusable Activity Feed in CRM Client Profile
        window.crmActivityFeed = new ActivityFeed('crm-profile-activity-feed', {
            entityType: 'client',
            entityId: clientId,
            onSave: () => {
                // Optional: refresh other stats if needed
            }
        });
        window.crmActivityFeed.loadData();

        // Navigate to the section immediately
        showSection('client-detail');

        // ── Parallel Data Fetching (Non-blocking) ────────────────────────
        // We load Drive files, Projects, and Businesses simultaneously.
        // If one fails, it won't crash the others.

        // 1. Projects
        loadProjects(clientId).catch(err => {
            console.error('Projects failed to load:', err);
            const projList = document.getElementById('proj-list');
            if (projList) projList.innerHTML = '<p class="error-text">Failed to load projects</p>';
        });

        // 2. Businesses
        loadClientBusinesses(clientId).catch(err => {
            console.error('Businesses failed to load:', err);
            const bizList = document.getElementById('businesses-list');
            if (bizList) bizList.innerHTML = '<p class="error-text">Failed to load businesses</p>';
        });

        // 2.5 Subscriptions
        loadClientSubscriptions(clientId).catch(err => {
            console.error('Subscriptions failed to load:', err);
            const subList = document.getElementById('client-subs-list');
            if (subList) subList.innerHTML = '<p class="error-text">Failed to load subscriptions</p>';
        });

        // 3. Edit Businesses Dropdown
        if (typeof loadEditBusinesses === 'function') {
            loadEditBusinesses(clientId).catch(err => console.error(err));
        }

        // 4. Drive Files (if linked)
        if (client.google_drive_folder_id) {
            loadDriveFiles(clientId).catch(err => {
                console.error('Drive files failed to load:', err);
                const grid = document.getElementById('media-grid');
                if (grid) grid.innerHTML = '<p class="error-text">Failed to connect to Google Drive</p>';
            });
        }

    } catch (error) {
        console.error('Error opening profile:', error);
        showToast('Error opening client profile', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  MEDIA HUB MANAGER (Admin-side Drive folder/file management)
// ═══════════════════════════════════════════════════════════════

let mhFolderStack = []; // [{id, name}] breadcrumb trail
let mhCurrentFolderId = null; // currently viewing folder
let mhClientRootFolderId = null; // client's root Drive folder
let mhClientPortalToken = null;

function mhMimeIcon(mime) {
    if (!mime) return '📄';
    if (mime === 'application/vnd.google-apps.folder') return '📁';
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('pdf'))   return '📕';
    if (mime.includes('video')) return '🎬';
    if (mime.includes('audio')) return '🎵';
    if (mime.includes('zip') || mime.includes('archive')) return '📦';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
    if (mime.includes('presentation')) return '📽️';
    if (mime.includes('document') || mime.includes('word')) return '📝';
    if (mime.includes('font')) return '🔡';
    return '📄';
}

async function loadDriveFiles(clientId) {
    const grid = document.getElementById('media-grid');
    grid.innerHTML = `
        <div style="display:flex;justify-content:center;padding:20px;">
            <lottie-player src="img/loading-circles.json" background="transparent" speed="1" style="width:80px;height:80px;" loop autoplay></lottie-player>
        </div>
    `;

    // Reset folder navigation
    mhFolderStack = [];
    mhCurrentFolderId = null;

    try {
        // Get client info for portal token
        const clientRes = await fetch(`${API_BASE}/crm/clients/${clientId}`);
        const client = await clientRes.json();
        mhClientRootFolderId = client.google_drive_folder_id;
        mhClientPortalToken = client.portal_token;

        // Show portal link button
        const portalBtn = document.getElementById('mh-portal-link-btn');
        if (portalBtn && mhClientPortalToken) portalBtn.style.display = 'inline-flex';

        // Load root folder
        await mhLoadFolder(mhClientRootFolderId);
    } catch (error) {
        console.error('Error loading Drive files:', error);
        grid.innerHTML = '<p class="error-text">Connect Google to see files.</p>';
    }
}

async function mhLoadFolder(folderId) {
    const grid = document.getElementById('media-grid');
    grid.innerHTML = `
        <div style="display:flex;justify-content:center;padding:20px;">
            <lottie-player src="img/loading-circles.json" background="transparent" speed="1" style="width:60px;height:60px;" loop autoplay></lottie-player>
        </div>
    `;

    mhCurrentFolderId = folderId;

    try {
        let files, folders;

        if (folderId === mhClientRootFolderId && mhFolderStack.length === 0) {
            // Use the standard files endpoint for root
            const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/drive/files`);
            if (!res.ok) throw new Error('Failed');
            const allItems = await res.json();
            folders = allItems.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
            files = allItems.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        } else {
            // Use subfolder browser
            const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/drive/folder/${folderId}`);
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            files = data.files || [];
            folders = data.folders || [];
        }

        // Update file count
        const countEl = document.getElementById('mh-file-count');
        if (countEl) countEl.textContent = `${folders.length} folders · ${files.length} files`;

        // Render breadcrumb
        mhRenderBreadcrumb();

        // Render content
        let html = '';

        // Folders
        if (folders.length) {
            html += folders.map(f => `
                <div class="media-item media-item-folder" onclick="mhNavigateInto('${f.id}', '${(f.name || '').replace(/'/g, "\\'")}')"
                     style="cursor:pointer; position:relative;">
                    <div class="media-preview" style="display:flex;align-items:center;justify-content:center;">
                        <span class="media-icon" style="font-size:26px;">📁</span>
                    </div>
                    <div class="media-name" title="${f.name}">${f.name}</div>
                    <div class="mh-item-actions" style="position:absolute;top:6px;right:6px;display:flex;gap:3px;">
                        <button onclick="event.stopPropagation(); mhRenameItem('${f.id}', '${(f.name || '').replace(/'/g, "\\'")}')" title="Rename"
                            style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(0,0,0,0.4);color:white;font-size:10px;cursor:pointer;backdrop-filter:blur(8px);">✏️</button>
                        <button onclick="event.stopPropagation(); mhDeleteItem('${f.id}', '${(f.name || '').replace(/'/g, "\\'")}')" title="Delete"
                            style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(244,63,94,0.3);color:white;font-size:10px;cursor:pointer;backdrop-filter:blur(8px);">🗑</button>
                    </div>
                </div>
            `).join('');
        }

        // Files
        if (files.length) {
            html += files.map(file => {
                const isImage = file.mimeType && file.mimeType.startsWith('image/');
                const preview = isImage ? `${API_BASE}/crm/drive/proxy/${file.id}` : null;
                const icon = mhMimeIcon(file.mimeType);

                return `
                    <div class="media-item" onclick="window.open('${file.webViewLink}', '_blank')" style="position:relative;">
                        <div class="media-preview">
                            ${isImage ? `<img src="${preview}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : `<span class="media-icon">${icon}</span>`}
                        </div>
                        <div class="media-name" title="${file.name}">${file.name}</div>
                        <div class="mh-item-actions" style="position:absolute;top:6px;right:6px;display:flex;gap:3px;">
                            <button onclick="event.stopPropagation(); mhRenameItem('${file.id}', '${(file.name || '').replace(/'/g, "\\'")}')" title="Rename"
                                style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(0,0,0,0.4);color:white;font-size:10px;cursor:pointer;backdrop-filter:blur(8px);">✏️</button>
                            <button onclick="event.stopPropagation(); mhDeleteItem('${file.id}', '${(file.name || '').replace(/'/g, "\\'")}')" title="Delete"
                                style="width:22px;height:22px;border-radius:6px;border:none;background:rgba(244,63,94,0.3);color:white;font-size:10px;cursor:pointer;backdrop-filter:blur(8px);">🗑</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        if (!folders.length && !files.length) {
            html = `<p class="empty-state" style="font-size:13px;">This folder is empty. Use the toolbar above to upload files or create subfolders.</p>`;
        }

        grid.innerHTML = html;
    } catch (error) {
        console.error('Error loading folder:', error);
        grid.innerHTML = '<p class="error-text">Failed to load folder contents.</p>';
    }
}

// ─── Breadcrumb navigation ──────────────────────────────────
function mhRenderBreadcrumb() {
    const el = document.getElementById('mh-breadcrumb');
    if (!el) return;

    if (mhFolderStack.length === 0) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
    let html = `<a onclick="mhGoToRoot()" style="color:#a5b4fc; cursor:pointer; font-weight:500;">📁 Root</a>`;
    mhFolderStack.forEach((f, i) => {
        html += `<span style="color:rgba(255,255,255,0.25);">›</span>`;
        if (i < mhFolderStack.length - 1) {
            html += `<a onclick="mhGoToLevel(${i})" style="color:#a5b4fc; cursor:pointer; font-weight:500;">${f.name}</a>`;
        } else {
            html += `<span style="color:rgba(255,255,255,0.85); font-weight:600;">${f.name}</span>`;
        }
    });
    el.innerHTML = html;
}

function mhNavigateInto(folderId, folderName) {
    mhFolderStack.push({ id: folderId, name: folderName });
    mhLoadFolder(folderId);
}

function mhGoToRoot() {
    mhFolderStack = [];
    mhLoadFolder(mhClientRootFolderId);
}

function mhGoToLevel(index) {
    const target = mhFolderStack[index];
    mhFolderStack = mhFolderStack.slice(0, index + 1);
    mhLoadFolder(target.id);
}

// ─── Folder creation ────────────────────────────────────────
function showCreateFolderModal() {
    const modal = document.getElementById('mh-folder-modal');
    modal.style.display = 'flex';
    document.getElementById('mh-new-folder-name').value = '';
    setTimeout(() => document.getElementById('mh-new-folder-name').focus(), 100);
}

function hideCreateFolderModal() {
    document.getElementById('mh-folder-modal').style.display = 'none';
}

async function createSubfolder() {
    const nameInput = document.getElementById('mh-new-folder-name');
    const name = nameInput.value.trim();
    if (!name) { showToast('Enter a folder name', 'error'); return; }

    const btn = document.getElementById('mh-create-folder-btn');
    btn.disabled = true; btn.textContent = 'Creating...';

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/drive/subfolder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                parentFolderId: mhCurrentFolderId || mhClientRootFolderId
            })
        });

        if (!res.ok) throw new Error('Failed');
        showToast(`📁 "${name}" folder created`);
        hideCreateFolderModal();
        mhLoadFolder(mhCurrentFolderId || mhClientRootFolderId);
    } catch (e) {
        showToast('Failed to create folder', 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Create';
    }
}

// ─── Upload to current folder ───────────────────────────────
async function uploadToCurrentFolder(input) {
    if (!input.files || !input.files.length) return;
    if (!currentProfileId) return;

    const files = Array.from(input.files);
    showToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');

    let success = 0;
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        if (mhCurrentFolderId) formData.append('folderId', mhCurrentFolderId);

        try {
            const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/drive/upload-to`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) success++;
        } catch (e) { /* skip */ }
    }

    showToast(`✅ ${success}/${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
    mhLoadFolder(mhCurrentFolderId || mhClientRootFolderId);
    input.value = '';
}

// ─── Delete file/folder ─────────────────────────────────────
async function mhDeleteItem(fileId, fileName) {
    showConfirm('Delete Item?', `Are you sure you want to delete "${fileName}"? This cannot be undone.`, async () => {
        try {
            const res = await fetch(`${API_BASE}/crm/drive/file/${fileId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed');
            showToast(`🗑 "${fileName}" deleted`);
            mhLoadFolder(mhCurrentFolderId || mhClientRootFolderId);
        } catch (e) {
            showToast('Failed to delete', 'error');
        }
    });
}

// ─── Rename file/folder ─────────────────────────────────────
async function mhRenameItem(fileId, currentName) {
    const newName = prompt('Rename to:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
        const res = await fetch(`${API_BASE}/crm/drive/file/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });
        if (!res.ok) throw new Error('Failed');
        showToast(`✏️ Renamed to "${newName.trim()}"`);
        mhLoadFolder(mhCurrentFolderId || mhClientRootFolderId);
    } catch (e) {
        showToast('Failed to rename', 'error');
    }
}

// ─── Portal Link ────────────────────────────────────────────

async function sendPortalLink(method) {
    if (!currentProfileId) return;
    
    const btn = method === 'email' ? document.getElementById('mh-portal-email-btn') : document.getElementById('mh-portal-sms-btn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Sending...';
    }

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/portal-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method })
        });
        const data = await res.json();
        
        if (data.success) {
            showToast(`Portal link sent via ${method}! ✓`);
            // Refresh activity feed to show the new system note
            if (window.crmActivityFeed) window.crmActivityFeed.loadData();
        } else {
            showToast(`Failed to send: ${data.error}`, 'error');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function copyPortalLink() {
    if (!mhClientPortalToken) { showToast('No portal token', 'error'); return; }
    const baseUrl = window.PORTAL_CONFIG?.PORTAL_BASE_URL || window.location.origin;
    const url = `${baseUrl}/portal/${mhClientPortalToken}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast('🔗 Portal link copied!');
    } catch (e) {
        // Fallback
        prompt('Copy this portal link:', url);
    }
}
async function uploadDriveFile(input) {
    uploadToCurrentFolder(input);
}

function createDriveFolderForClient() {
    if (!currentProfileId) return;

    const btn = document.getElementById('create-folder-btn');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    fetch(`${API_BASE}/crm/clients/${currentProfileId}/drive/folder`, { method: 'POST' })
        .then(res => {
            if (res.ok) {
                showToast('Folder created successfully');
                openClientProfile(currentProfileId);
            } else {
                return res.json().then(err => showToast(`Error: ${err.error}`, 'error'));
            }
        })
        .catch(() => showToast('Failed to create folder', 'error'))
        .finally(() => { btn.disabled = false; btn.textContent = '+ Create Folder'; });
}

function toggleEditMode() {
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');
    const btn = document.getElementById('toggle-edit-btn');

    if (viewMode.style.display !== 'none') {
        viewMode.style.display = 'none';
        editMode.style.display = 'block';
        btn.style.display = 'none'; // Hide main edit button while in form
    } else {
        viewMode.style.display = 'flex';
        editMode.style.display = 'none';
        btn.style.display = 'block';
    }
}

async function saveClientProfile(event) {
    event.preventDefault();
    if (!currentProfileId) return;

    const folderEl = document.getElementById('edit-google-drive-folder');
    const folderInput = folderEl ? folderEl.value : '';
    const folderId = extractFolderId(folderInput);

    const editFirstName = document.getElementById('edit-first-name');
    const editLastName = document.getElementById('edit-last-name');
    const editBirthday = document.getElementById('edit-birthday');
    const editEmail = document.getElementById('edit-email');
    const editPhone = document.getElementById('edit-phone');
    const editCompany = document.getElementById('edit-company');
    const editStatus = document.getElementById('edit-status');
    const editInsta = document.getElementById('edit-instagram');
    const editLinked = document.getElementById('edit-linkedin');
    const editTwitter = document.getElementById('edit-twitter');
    const editFB = document.getElementById('edit-facebook');

    const client = {
        first_name: editFirstName ? editFirstName.value : '',
        last_name: editLastName ? editLastName.value : '',
        birthday: editBirthday ? editBirthday.value : '',
        email: editEmail ? editEmail.value : '',
        phone: editPhone ? editPhone.value : '',
        company: editCompany ? editCompany.value : '',
        status: editStatus ? editStatus.value : 'lead',
        google_drive_folder_id: folderId,
        social_instagram: editInsta ? editInsta.value : '',
        social_linkedin: editLinked ? editLinked.value : '',
        social_twitter: editTwitter ? editTwitter.value : '',
        social_facebook: editFB ? editFB.value : ''
    };

    if (client.email && !validateEmail(client.email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/crm/clients/${currentProfileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(client)
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Profile updated');
            // Refresh view
            openClientProfile(currentProfileId);
            loadClients(); // Refresh the main client list
        } else {
            console.error('Update failed:', data);
            showToast(`Failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error updating:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

// ... (Update Client Function (likely unused now that we use saveClientProfile, but let's keep it consistent or remove))
// ... (Actually createClient is used for new clients.)
// ... (Update Client Function (logic moved to saveClientProfile))
// ... (createClient is defined below in the unified form handling section.)

// Note Editing Logic
// ... (previous note logic)

// Helper to delete from the profile view
async function deleteClientFromProfile(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!currentProfileId) return;
    deleteClient(currentProfileId, event);
}
// Note: enableEditNote function continues below...
function enableEditNote(event, id) {
    if (event) { event.stopPropagation(); }
    const contentDiv = document.getElementById(`note-content-${id}`);
    const editDiv = document.getElementById(`note-edit-${id}`);
    const input = document.getElementById(`note-input-${id}`);

    // Populate textarea with current content
    input.value = contentDiv.innerText;

    // Toggle visibility
    contentDiv.style.display = 'none';
    editDiv.style.display = 'block';
    input.focus();
}

function cancelNoteEdit(id) {
    document.getElementById(`note-content-${id}`).style.display = 'block';
    document.getElementById(`note-edit-${id}`).style.display = 'none';
}

async function saveNoteEdit(id) {
    const input = document.getElementById(`note-input-${id}`);
    const content = input.value.trim();
    if (!content) return;

    try {
        const response = await fetch(`${API_BASE}/crm/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            // Update UI directly for speed
            document.getElementById(`note-content-${id}`).textContent = content;
            cancelNoteEdit(id);
            showToast('Note updated');
        } else {
            showToast('Failed to update note', 'error');
        }
    } catch (error) {
        console.error('Error updating note:', error);
        showToast('Error updating note', 'error');
    }
}

async function deleteNote(event, id) {
    showConfirm('Delete Note?', 'Are you sure you want to delete this note?', async () => {
        try {
            const response = await fetch(`${API_BASE}/crm/notes/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const noteEl = document.getElementById(`note-${id}`);
                if (noteEl) noteEl.remove();
                showToast('Note deleted');
            } else {
                showToast('Failed to delete note', 'error');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            showToast('Error deleting note', 'error');
        }
    }, event);
}

async function updateClient(event, clientId) {
    event.preventDefault();

    const nameEl = document.getElementById('client-name');
    const emailEl = document.getElementById('client-email');
    const phoneEl = document.getElementById('client-phone');
    const companyEl = document.getElementById('client-company');
    const statusEl = document.getElementById('client-status');
    const notesEl = document.getElementById('client-notes');

    const client = {
        name: nameEl ? nameEl.value : '',
        email: emailEl ? emailEl.value : '',
        phone: phoneEl ? phoneEl.value : '',
        company: companyEl ? companyEl.value : '',
        status: statusEl ? statusEl.value : 'lead',
        notes: notesEl ? notesEl.value : ''
    };

    try {
        const response = await fetch(`${API_BASE}/crm/clients/${clientId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(client)
        });

        if (response.ok) {
            hideClientForm();
            loadClients();
            showToast('Client updated successfully');

            // Reset form to create mode for next time
            resetClientFormLink();
        } else {
            showToast('Failed to update client', 'error');
        }
    } catch (error) {
        console.error('Error updating client:', error);
        showToast('Error updating client', 'error');
    }
}

function resetClientFormLink() {
    const form = document.querySelector('#client-form form');
    if (form) {
        form.onsubmit = createClient;
        form.reset();
    }
    const h3 = document.querySelector('#client-form h3');
    if (h3) h3.textContent = 'Add Client';
    const submitBtn = document.querySelector('#client-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Add Client';
}

async function createClient(event) {
    event.preventDefault();

    const client = {
        first_name: document.getElementById('client-first-name')?.value || '',
        last_name: document.getElementById('client-last-name')?.value || '',
        birthday: document.getElementById('client-birthday')?.value || '',
        email: document.getElementById('client-email')?.value || '',
        phone: document.getElementById('client-phone')?.value || '',
        company: document.getElementById('client-company')?.value || '',
        status: document.getElementById('client-status')?.value || 'lead',
        social_instagram: document.getElementById('client-instagram')?.value || '',
        social_linkedin: document.getElementById('client-linkedin')?.value || '',
        social_twitter: document.getElementById('client-twitter')?.value || '',
        social_facebook: document.getElementById('client-facebook')?.value || '',
        notes: document.getElementById('client-notes')?.value || ''
    };

    if (client.email && !validateEmail(client.email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/crm/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(client)
        });

        if (response.ok) {
            const newClient = await response.json();

            // Save any pending businesses for this new client
            if (_pendingBizTags.length > 0 && newClient.id) {
                const bizPromises = _pendingBizTags.map(biz =>
                    fetch(`${API_BASE}/crm/clients/${newClient.id}/businesses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(biz)
                    })
                );
                await Promise.all(bizPromises);
            }

            hideClientForm();
            loadClients();
            showToast('Client added successfully');
        }
    } catch (error) {
        console.error('Error creating client:', error);
        showToast('Failed to add client', 'error');
    }
}

async function deleteClient(clientId, event) {
    showConfirm('Delete Client?', 'Are you sure? This will delete all client data.', async () => {
        try {
            const response = await fetch(`${API_BASE}/crm/clients/${clientId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                loadClients();
                showToast('Client deleted');
                // If we are viewing this client, go back to list
                if (currentProfileId === clientId) {
                    showSection('crm');
                }
            } else {
                showToast('Failed to delete', 'error');
            }
        } catch (error) {
            console.error('Error deleting client:', error);
            showToast('Failed to delete client', 'error');
        }
    }, event);
}

// Note Editing Logic
// ... (previous note logic)

// Helper to delete from the profile view
async function deleteClientFromProfile(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!currentProfileId) return;
    deleteClient(currentProfileId, event);
}
// Note: enableEditNote function continues below...
function enableEditNote(event, id) {
    if (event) { event.stopPropagation(); }
    const contentDiv = document.getElementById(`note-content-${id}`);
    const editDiv = document.getElementById(`note-edit-${id}`);
    const input = document.getElementById(`note-input-${id}`);

    // Populate textarea with current content
    input.value = contentDiv.innerText;

    // Toggle visibility
    contentDiv.style.display = 'none';
    editDiv.style.display = 'block';
    input.focus();
}

function cancelNoteEdit(id) {
    document.getElementById(`note-content-${id}`).style.display = 'block';
    document.getElementById(`note-edit-${id}`).style.display = 'none';
}

async function saveNoteEdit(id) {
    const input = document.getElementById(`note-input-${id}`);
    const content = input.value.trim();
    if (!content) return;

    try {
        const response = await fetch(`${API_BASE}/crm/notes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (response.ok) {
            // Update UI directly for speed
            document.getElementById(`note-content-${id}`).textContent = content;
            cancelNoteEdit(id);
            showToast('Note updated');
        } else {
            showToast('Failed to update note', 'error');
        }
    } catch (error) {
        console.error('Error updating note:', error);
        showToast('Error updating note', 'error');
    }
}

async function deleteNote(event, id) {
    showConfirm('Delete Note?', 'Are you sure you want to delete this note?', async () => {
        try {
            const response = await fetch(`${API_BASE}/crm/notes/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                document.getElementById(`note-${id}`).remove();
                showToast('Note deleted');
            } else {
                showToast('Failed to delete note', 'error');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            showToast('Error deleting note', 'error');
        }
    }, event);
}

function validateEmail(email) {
    // Basic validation: contains @ and . and no spaces
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

document.addEventListener('DOMContentLoaded', () => {
    const phoneInputs = [document.getElementById('client-phone'), document.getElementById('edit-phone')];
    phoneInputs.forEach(input => {
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = formatPhone(e.target.value);
            });
        }
    });
});

// ── Project Tracker ────────────────────────────────────────────────────────
const PROJECT_STATUSES = ['active', 'in-progress', 'revision', 'delivered', 'on-hold', 'cancelled'];
const PROJECT_STATUS_LABELS = {
    'active': '🟢 Active',
    'in-progress': '🔵 In Progress',
    'revision': '🟡 Revision',
    'delivered': '✅ Delivered',
    'on-hold': '⏸ On Hold',
    'cancelled': '🔴 Cancelled'
};
const PROJECT_PAYMENT_LABELS = {
    'unpaid': '❌ Unpaid',
    'invoice-sent': '✉️ Inv Sent',
    'partial': '🌗 Partial',
    'paid': '✅ Paid'
};

let editingProjectId = null;

async function loadProjects(clientId) {
    const list = document.getElementById('proj-list');
    if (list) list.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:13px; padding:12px 0;">Loading...</p>';
    try {
        const res = await fetch(`${API_BASE}/crm/clients/${clientId}/projects`);
        const projects = await res.json();
        renderProjects(projects);
    } catch (e) {
        list.innerHTML = '<p class="error-text">Failed to load projects.</p>';
    }
}

function renderProjects(projects) {
    const list = document.getElementById('proj-list');
    if (!list) return;
    if (!projects.length) {
        list.innerHTML = '<p class="empty-state" style="font-size:13px; padding:20px 0; text-align:center;">No projects yet.<br><span style="font-size:11px; opacity:0.5;">Click + Add to create one</span></p>';
        return;
    }

    const html = projects.map(p => {
        const statusClass = `proj-status-${p.status}`;
        const label = PROJECT_STATUS_LABELS[p.status] || p.status;
        const budget = p.budget ? `💰 $${parseFloat(p.budget).toLocaleString()}` : null;
        const deadline = p.deadline ? `📅 ${new Date(p.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : null;
        const payLabel = PROJECT_PAYMENT_LABELS[p.payment_status || 'unpaid'];
        const payColor = p.payment_status === 'paid' ? '#4ade80' : (p.payment_status === 'invoice-sent' ? '#fbbf24' : (p.payment_status === 'partial' ? '#a78bfa' : '#f87171'));

        const pills = [];
        const invCount = p.invoice_count || 0;
        const invBadge = invCount > 0 ? ` <span style="opacity:0.6; font-size:10px;">(${invCount} inv)</span>` : '';
        if (payLabel) pills.push(`<span class="proj-meta-pill" style="color:${payColor}; border-color:${payColor}">${payLabel}${invBadge}</span>`);
        if (budget) pills.push(`<span class="proj-meta-pill">${budget}</span>`);
        if (deadline) pills.push(`<span class="proj-meta-pill">${deadline}</span>`);

        const metaPills = pills.join('');

        return `
        <div class="proj-card" id="proj-card-${p.id}" 
             ondblclick="openProjectModal(${p.id})"
             oncontextmenu="ContextMenu.attach(event, 'project', ${p.id}, '${(p.name || '').replace(/'/g, "\\'")}')"
             data-context="project">
            <div class="proj-card-header">
                <span class="proj-card-name">${p.name}</span>
                <span class="proj-status-chip ${statusClass}">${label}</span>
            </div>
            ${metaPills ? `<div class="proj-card-meta">${metaPills}</div>` : ''}
            ${p.notes ? `<div class="proj-card-notes">${p.notes}</div>` : ''}
        </div>`;
    }).join('');

    const renderedCount = (html.match(/class="proj-card"/g) || []).length;
    if (projects.length > 0 && renderedCount !== projects.length) {
        list.innerHTML = `<div class="error-notice">⚠️ Only ${renderedCount} of ${projects.length} projects rendered.</div>`;
        console.warn(`[CRM] Project render mismatch: expected ${projects.length}, got ${renderedCount}`);
    } else {
        list.innerHTML = html;
    }
}

function showAddProjectForm() {
    editingProjectId = null;
    const nameInput = document.getElementById('proj-name-input');
    const statusInput = document.getElementById('proj-status-input');
    const paymentInput = document.getElementById('proj-payment-input');
    const budgetInput = document.getElementById('proj-budget-input');
    const deadlineInput = document.getElementById('proj-deadline-input');
    const notesInput = document.getElementById('proj-notes-input');
    const title = document.getElementById('proj-form-title');
    const form = document.getElementById('proj-add-form');

    if (nameInput) nameInput.value = '';
    if (statusInput) statusInput.value = 'active';
    if (paymentInput) paymentInput.value = 'unpaid';
    if (budgetInput) budgetInput.value = '';
    if (deadlineInput) deadlineInput.value = '';
    if (notesInput) notesInput.value = '';
    if (title) title.textContent = 'New Project';
    if (form) form.style.display = 'flex';
    if (nameInput) nameInput.focus();
}

function cancelProjectForm() {
    editingProjectId = null;
    const form = document.getElementById('proj-add-form');
    if (form) form.style.display = 'none';
}

function startEditProject(id, project) {
    editingProjectId = id;
    const nameInput = document.getElementById('proj-name-input');
    const statusInput = document.getElementById('proj-status-input');
    const budgetInput = document.getElementById('proj-budget-input');
    const deadlineInput = document.getElementById('proj-deadline-input');
    const notesInput = document.getElementById('proj-notes-input');
    const title = document.getElementById('proj-form-title');
    const form = document.getElementById('proj-add-form');

    if (nameInput) nameInput.value = project.name || '';
    if (statusInput) statusInput.value = project.status || 'active';
    if (budgetInput) budgetInput.value = project.budget || '';
    if (deadlineInput) deadlineInput.value = project.deadline || '';
    if (notesInput) notesInput.value = project.notes || '';
    if (title) title.textContent = 'Edit Project';
    if (form) {
        form.style.display = 'flex';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (nameInput) nameInput.focus();
}

async function saveProject() {
    const name = document.getElementById('proj-name-input').value.trim();
    if (!name) { showToast('Project name is required', 'error'); return; }

    const payload = {
        client_id: currentProfileId,
        name,
        status: document.getElementById('proj-status-input')?.value || 'active',
        payment_status: document.getElementById('proj-payment-input')?.value || 'unpaid',
        budget: parseFloat(document.getElementById('proj-budget-input')?.value) || null,
        deadline: document.getElementById('proj-deadline-input')?.value || null,
        notes: document.getElementById('proj-notes-input')?.value?.trim() || null
    };

    try {
        const url = editingProjectId ? `${API_BASE}/crm/projects/${editingProjectId}` : `${API_BASE}/crm/projects`;
        const method = editingProjectId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Failed');
        showToast(editingProjectId ? 'Project updated' : 'Project added', 'success');
        cancelProjectForm();
        loadProjects(currentProfileId);
    } catch (e) {
        showToast('Error saving project', 'error');
    }
}

async function deleteProject(id) {
    const confirmed = await showConfirm('🗑 Delete Project', 'Permanently delete this project? This cannot be undone.');
    if (!confirmed) return;
    try {
        const res = await fetch(`${API_BASE}/crm/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        showToast('Project deleted');
        loadProjects(currentProfileId);
    } catch (e) {
        showToast('Error deleting project', 'error');
    }
}

async function cycleProjectStatus(id, currentStatus) {
    const idx = PROJECT_STATUSES.indexOf(currentStatus);
    const nextStatus = PROJECT_STATUSES[(idx + 1) % PROJECT_STATUSES.length];
    try {
        // Fetch current project data first to preserve other fields
        const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/projects`);
        const projects = await res.json();
        const proj = projects.find(p => p.id === id);
        if (!proj) return;
        await fetch(`${API_BASE}/crm/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...proj, status: nextStatus })
        });
        showToast(`Status → ${PROJECT_STATUS_LABELS[nextStatus]}`, 'success');
        loadProjects(currentProfileId);
    } catch (e) {
        showToast('Error updating status', 'error');
    }
}

window.loadProjects = loadProjects;
window.showAddProjectForm = showAddProjectForm;
window.cancelProjectForm = cancelProjectForm;
window.saveProject = saveProject;
window.deleteProject = deleteProject;
window.cycleProjectStatus = cycleProjectStatus;
window.startEditProject = startEditProject;
window.openProjectModal = openProjectModal;
window.closeProjectModal = closeProjectModal;
window.carouselNav = carouselNav;
window.uploadProjectAttachments = uploadProjectAttachments;
window.deleteAttachment = deleteAttachment;
window.openModalEdit = openModalEdit;
window.closeModalEdit = closeModalEdit;
window.saveModalEdit = saveModalEdit;

// ── Inline Modal Edit ────────────────────────────────────────────────────
function openModalEdit(project) {
    const nameInput = document.getElementById('proj-edit-name');
    const statusInput = document.getElementById('proj-edit-status');
    const paymentInput = document.getElementById('proj-edit-payment');
    const budgetInput = document.getElementById('proj-edit-budget');
    const deadlineInput = document.getElementById('proj-edit-deadline');
    const notesInput = document.getElementById('proj-edit-notes');
    const viewPanel = document.getElementById('proj-modal-view');
    const editPanel = document.getElementById('proj-modal-edit');

    if (nameInput) nameInput.value = project.name || '';
    if (statusInput) statusInput.value = project.status || 'active';
    if (paymentInput) paymentInput.value = project.payment_status || 'unpaid';
    if (budgetInput) budgetInput.value = project.budget || '';
    if (deadlineInput) deadlineInput.value = project.deadline || '';
    if (notesInput) notesInput.value = project.notes || '';

    if (viewPanel) viewPanel.style.display = 'none';
    if (editPanel) editPanel.style.display = '';
    if (nameInput) nameInput.focus();
}

function closeModalEdit() {
    const viewPanel = document.getElementById('proj-modal-view');
    const editPanel = document.getElementById('proj-modal-edit');
    if (editPanel) editPanel.style.display = 'none';
    if (viewPanel) viewPanel.style.display = '';
}

async function saveModalEdit() {
    const name = document.getElementById('proj-edit-name').value.trim();
    if (!name) { showToast('Project name is required', 'error'); return; }

    const payload = {
        client_id: currentProfileId,
        name,
        status: document.getElementById('proj-edit-status')?.value || 'active',
        payment_status: document.getElementById('proj-edit-payment')?.value || 'unpaid',
        budget: parseFloat(document.getElementById('proj-edit-budget')?.value) || null,
        deadline: document.getElementById('proj-edit-deadline')?.value || null,
        notes: document.getElementById('proj-edit-notes')?.value?.trim() || null
    };

    try {
        const res = await fetch(`${API_BASE}/crm/projects/${_modalProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed');
        showToast('Project updated ✓', 'success');

        // Refresh the project list in the background
        loadProjects(currentProfileId);

        // Refresh the view panel with updated data
        await openProjectModal(_modalProjectId);
    } catch (e) {
        showToast('Error saving project', 'error');
    }
}

// ── Project Detail Modal & Carousel ───────────────────────────────────────
let _modalProjectId = null;
let _carouselPage = 0;
let _carouselAttachments = [];
const CAROUSEL_PER_PAGE = 3;

async function openProjectModal(projectId) {
    _modalProjectId = projectId;
    _carouselPage = 0;

    // Find project data from rendered list (already fetched)
    const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/projects`);
    const projects = await res.json();
    const p = projects.find(x => x.id === projectId);
    if (!p) return;

    // Populate header
    document.getElementById('proj-modal-name').textContent = p.name;
    const chip = document.getElementById('proj-modal-status-chip');
    chip.textContent = PROJECT_STATUS_LABELS[p.status] || p.status;
    chip.className = `proj-status-chip proj-status-${p.status}`;

    const payChip = document.getElementById('proj-modal-payment-chip');
    const payStatus = p.payment_status || 'unpaid';
    payChip.textContent = PROJECT_PAYMENT_LABELS[payStatus];
    const payColor = payStatus === 'paid' ? '#4ade80' : (payStatus === 'invoice-sent' ? '#fbbf24' : (payStatus === 'partial' ? '#a78bfa' : '#f87171'));
    payChip.style.color = payColor;
    payChip.style.border = `1px solid ${payColor}`;

    const budgetEl = document.getElementById('proj-modal-budget');
    if (p.budget) { budgetEl.textContent = `💰 $${parseFloat(p.budget).toLocaleString()}`; budgetEl.style.display = ''; }
    else budgetEl.style.display = 'none';

    const deadlineEl = document.getElementById('proj-modal-deadline');
    if (p.deadline) { deadlineEl.textContent = `📅 ${new Date(p.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`; deadlineEl.style.display = ''; }
    else deadlineEl.style.display = 'none';

    document.getElementById('proj-modal-notes').textContent = p.notes || 'No notes.';

    // Wire modal action buttons to this project
    const editBtn = document.getElementById('proj-modal-edit-btn');
    if (editBtn) editBtn.onclick = () => openModalEdit(p);
    const delBtn = document.getElementById('proj-modal-delete-btn');
    if (delBtn) delBtn.onclick = () => {
        closeProjectModal();
        deleteProject(p.id);
    };
    // Status chip cycles status from modal
    if (chip) {
        chip.onclick = () => cycleProjectStatus(p.id, p.status);
        chip.title = 'Click to cycle status';
    }

    // Drive folder link
    const folderLink = document.getElementById('proj-modal-folder-link');
    if (p.project_folder_id) {
        folderLink.href = `https://drive.google.com/drive/folders/${p.project_folder_id}`;
        folderLink.style.display = '';
    } else {
        folderLink.style.display = 'none';
    }

    // Show modal
    const modal = document.getElementById('proj-detail-modal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    // Load linked invoices
    await loadProjectInvoices(projectId);

    // Load attachments
    await loadAttachments(projectId);
}

async function loadProjectInvoices(projectId) {
    const container = document.getElementById('proj-modal-invoices');
    if (!container) return;
    try {
        const res = await fetch(`${API_BASE}/crm/projects/${projectId}/invoices`);
        const invoices = await res.json();

        if (!invoices.length) {
            container.innerHTML = `
                <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.7); margin-bottom:6px;">🧾 Linked Invoices</div>
                <p style="color:rgba(255,255,255,0.3); font-size:12px; padding:8px 0;">No invoices linked to this project.</p>`;
            return;
        }

        const STATUS_COLORS = { draft: '#6b7280', finalized: '#3b82f6', sent: '#f59e0b', paid: '#10b981', overdue: '#ef4444' };
        const STATUS_ICONS = { draft: '📝', finalized: '📋', sent: '✉️', paid: '✅', overdue: '⚠️' };

        const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0);
        const totalPending = invoices.filter(i => ['sent', 'finalized'].includes(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0);

        let summaryHtml = '';
        if (totalPaid > 0 || totalPending > 0) {
            const parts = [];
            if (totalPaid > 0) parts.push(`<span style="color:#10b981;">$${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })} received</span>`);
            if (totalPending > 0) parts.push(`<span style="color:#f59e0b;">$${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })} pending</span>`);
            summaryHtml = `<span style="font-size:11px; color:rgba(255,255,255,0.5); margin-left:8px;">${parts.join(' · ')}</span>`;
        }

        container.innerHTML = `
            <div style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.7); margin-bottom:8px; display:flex; align-items:center; flex-wrap:wrap;">
                🧾 Linked Invoices (${invoices.length})${summaryHtml}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${invoices.map(inv => {
            const color = STATUS_COLORS[inv.status] || '#6b7280';
            const icon = STATUS_ICONS[inv.status] || '📄';
            return `
                    <div onclick="closeProjectModal(); document.querySelectorAll('button').forEach(b=>{ if(b.textContent==='Invoices') b.click(); }); setTimeout(()=>openInvoiceDetail(${inv.id}),300);"
                        style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; cursor:pointer; transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.08)'">
                        <span style="font-size:14px;">${icon}</span>
                        <span style="flex:1; font-size:13px; font-weight:600; color:rgba(255,255,255,0.85);">Invoice #${inv.id}</span>
                        <span style="font-size:13px; font-weight:700; color:rgba(255,255,255,0.9);">$${(inv.total_amount || 0).toFixed(2)}</span>
                        <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:${color}; background:${color}20; padding:2px 8px; border-radius:6px;">${inv.status}</span>
                    </div>`;
        }).join('')}
            </div>`;
    } catch (e) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:12px;">Error loading invoices.</p>';
    }
}
window.loadProjectInvoices = loadProjectInvoices;

function closeProjectModal() {
    const modal = document.getElementById('proj-detail-modal');
    const editPanel = document.getElementById('proj-modal-edit');
    const viewPanel = document.getElementById('proj-modal-view');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    // Always reset to view panel for next open
    if (editPanel) editPanel.style.display = 'none';
    if (viewPanel) viewPanel.style.display = '';
    _modalProjectId = null;
    _carouselAttachments = [];
    _carouselPage = 0;
    // Reset inline editing state
    if (typeof editingProjectId !== 'undefined') editingProjectId = null;
    // Clear dynamic sections to prevent stale data
    const invoiceSection = document.getElementById('proj-modal-invoices');
    if (invoiceSection) invoiceSection.innerHTML = '';
    const carouselContainer = document.getElementById('proj-modal-carousel');
    if (carouselContainer) carouselContainer.innerHTML = '';
}

// Close on backdrop click
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('proj-detail-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeProjectModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeProjectModal();
    });
});

async function loadAttachments(projectId) {
    const carousel = document.getElementById('proj-carousel');
    if (carousel) carousel.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:13px; padding:20px 0; text-align:center; width:100%;">Loading...</p>';
    try {
        const res = await fetch(`${API_BASE}/crm/projects/${projectId}/attachments`);
        _carouselAttachments = await res.json();
        renderCarousel();
    } catch (e) {
        carousel.innerHTML = '<p class="error-text" style="width:100%;">Failed to load attachments.</p>';
    }
}

function getAttachmentIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return null; // use img
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('folder')) return '📁';
    return '📄';
}

function renderCarousel() {
    const carousel = document.getElementById('proj-carousel');
    const dotsEl = document.getElementById('proj-carousel-dots');
    if (!carousel) return;
    const attachments = _carouselAttachments;

    if (!attachments.length) {
        carousel.innerHTML = '<p class="empty-state" style="font-size:13px; padding:30px 0; text-align:center; width:100%;">No attachments yet. Upload files above.</p>';
        if (dotsEl) dotsEl.innerHTML = '';
        const prev = document.getElementById('proj-carousel-prev');
        const next = document.getElementById('proj-carousel-next');
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
    }

    const totalPages = Math.ceil(attachments.length / CAROUSEL_PER_PAGE);
    _carouselPage = Math.max(0, Math.min(_carouselPage, totalPages - 1));

    const start = _carouselPage * CAROUSEL_PER_PAGE;
    const pageItems = attachments.slice(start, start + CAROUSEL_PER_PAGE);

    const html = pageItems.map(att => {
        const isImage = att.mime_type && att.mime_type.startsWith('image/');
        const icon = getAttachmentIcon(att.mime_type);
        const proxyUrl = isImage ? `${API_BASE}/crm/drive/proxy/${att.file_id}` : null;
        const thumbContent = isImage
            ? `<img src="${proxyUrl}" alt="${att.file_name}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=attach-icon>🖼️</span>'">`
            : `<span class="attach-icon">${icon}</span>`;

        return `
        <div class="proj-attachment-thumb"
             ondblclick="window.open('${att.web_view_link}', '_blank')"
             title="Double-click to open • ${att.file_name}">
            ${thumbContent}
            <span class="attach-name">${att.file_name}</span>
            <button class="attach-delete" onclick="event.stopPropagation(); deleteAttachment(${att.id})" title="Remove">✕</button>
        </div>`;
    }).join('');

    const renderedCount = (html.match(/class="proj-attachment-thumb"/g) || []).length;
    if (pageItems.length > 0 && renderedCount !== pageItems.length) {
        carousel.innerHTML = `<div class="error-notice">⚠️ Only ${renderedCount} of ${pageItems.length} attachments rendered.</div>`;
        console.warn(`[CRM] Attachment render mismatch: expected ${pageItems.length}, got ${renderedCount}`);
    } else {
        carousel.innerHTML = html;
    }

    // Dots
    if (dotsEl) {
        dotsEl.innerHTML = Array.from({ length: totalPages }, (_, i) =>
            `<span class="proj-carousel-dot ${i === _carouselPage ? 'active' : ''}" onclick="carouselGoTo(${i})"></span>`
        ).join('');
    }

    const prev = document.getElementById('proj-carousel-prev');
    const next = document.getElementById('proj-carousel-next');
    if (prev) prev.disabled = _carouselPage === 0;
    if (next) next.disabled = _carouselPage >= totalPages - 1;

    // Update folder link if project now has a folder
    // (folder may have been created during upload)
}

function carouselNav(dir) {
    const totalPages = Math.ceil(_carouselAttachments.length / CAROUSEL_PER_PAGE);
    _carouselPage = Math.max(0, Math.min(_carouselPage + dir, totalPages - 1));
    renderCarousel();
}

function carouselGoTo(page) {
    _carouselPage = page;
    renderCarousel();
}

async function uploadProjectAttachments(input) {
    if (!input.files || !input.files.length || !_modalProjectId) return;
    const files = Array.from(input.files);
    showToast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`, 'info');

    let successCount = 0;
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${API_BASE}/crm/projects/${_modalProjectId}/attachments`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                successCount++;
                const data = await res.json();
                // Update folder link if we now have one
                if (data.project_folder_id) {
                    const fl = document.getElementById('proj-modal-folder-link');
                    fl.href = `https://drive.google.com/drive/folders/${data.project_folder_id}`;
                    fl.style.display = '';
                }
            } else {
                const err = await res.json();
                showToast(`Upload failed: ${err.error}`, 'error');
            }
        } catch (e) {
            showToast(`Upload error: ${e.message}`, 'error');
        }
    }
    input.value = '';
    if (successCount > 0) {
        showToast(`${successCount} file${successCount > 1 ? 's' : ''} uploaded ✓`);
        // Refresh project list to get updated project_folder_id
        loadProjects(currentProfileId);
        await loadAttachments(_modalProjectId);
        // Also refresh folder link
        const projRes = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/projects`);
        const projs = await projRes.json();
        const proj = projs.find(p => p.id === _modalProjectId);
        if (proj && proj.project_folder_id) {
            const fl = document.getElementById('proj-modal-folder-link');
            if (fl) {
                fl.href = `https://drive.google.com/drive/folders/${proj.project_folder_id}`;
                fl.style.display = '';
            }
        }
    }
}

async function deleteAttachment(id) {
    const confirmed = await showConfirm('Remove Attachment', 'Remove this attachment? The file will also be deleted from Drive.');
    if (!confirmed) return;
    try {
        const res = await fetch(`${API_BASE}/crm/attachments/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        showToast('Attachment removed');
        _carouselAttachments = _carouselAttachments.filter(a => a.id !== id);
        renderCarousel();
    } catch (e) {
        showToast('Error removing attachment', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── QUICK CLIENT SEARCH ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _searchTimeout = null;

function initClientSearch() {
    const input = document.getElementById('client-search');
    const results = document.getElementById('client-search-results');
    if (!input || !results) return;

    // Debounced search on keyup
    input.addEventListener('input', () => {
        clearTimeout(_searchTimeout);
        const q = input.value.trim();
        if (q.length === 0) {
            results.classList.remove('active');
            return;
        }
        _searchTimeout = setTimeout(() => performClientSearch(q), 200);
    });

    // Keyboard shortcut: ⌘K / Ctrl+K to focus search
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            // Navigate to CRM if not already there
            if (typeof showSection === 'function') showSection('crm');
            setTimeout(() => input.focus(), 100);
        }

        // Escape to clear and close
        if (e.key === 'Escape' && document.activeElement === input) {
            input.value = '';
            results.classList.remove('active');
            input.blur();
        }
    });

    // Close results on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#client-search-wrap')) {
            results.classList.remove('active');
        }
    });
}

async function performClientSearch(query) {
    const results = document.getElementById('client-search-results');
    try {
        const res = await fetch(`${API_BASE}/crm/clients/search?q=${encodeURIComponent(query)}`);
        const clients = await res.json();
        renderSearchResults(clients, query);
    } catch (err) {
        console.error('Search error:', err);
        if (results) {
            results.innerHTML = '<div class="search-empty"><span>⚠️</span>Search error</div>';
            results.classList.add('active');
        }
    }
}

function renderSearchResults(clients, query) {
    const results = document.getElementById('client-search-results');

    if (clients.length === 0) {
        if (results) {
            results.innerHTML = `
                <div class="search-empty">
                    <span>🔍</span>
                    No clients match "<strong>${query}</strong>"
                </div>`;
            results.classList.add('active');
        }
        return;
    }

    const statusColors = {
        active: '#10b981',
        lead: '#f59e0b',
        past: '#94a3b8'
    };

    if (results) {
        results.innerHTML = clients.map(client => {
            const names = (client.name || '').split(' ');
            const initials = names.length > 1 ? names[0][0] + names[names.length - 1][0] : (names[0] ? names[0][0] : '?');
            const dotColor = statusColors[client.status] || '#94a3b8';

            // Build meta line: company + business tags
            let meta = [];
            if (client.company) meta.push(client.company);
            if (client.email) meta.push(client.email);

            const bizNames = client.business_names ? client.business_names.split(',') : [];
            const bizTags = bizNames.map(b => `<span class="biz-tag">${b.trim()}</span>`).join('');

            return `
            <div class="search-result-item" 
                 onclick="openClientProfile(${client.id}); document.getElementById('client-search-results').classList.remove('active'); document.getElementById('client-search').value = '';"
                 oncontextmenu="ContextMenu.attach(event, 'client', ${client.id}, '${(client.name || '').replace(/'/g, "\\'")}')"
                 data-context="client">
                <div class="search-result-avatar">${initials}</div>
                <div class="search-result-info">
                    <div class="search-result-name">
                        ${client.name}
                        <span class="status-dot" style="background:${dotColor}; box-shadow: 0 0 6px ${dotColor};"></span>
                    </div>
                    <div class="search-result-meta">${meta.join(' · ')}${bizTags ? ' ' + bizTags : ''}</div>
                </div>
            </div>`;
        }).join('');

        results.classList.add('active');
    }
}

// Initialize search when DOM is ready
document.addEventListener('DOMContentLoaded', initClientSearch);


// ═══════════════════════════════════════════════════════════════════════════
// ── SHARED: INDUSTRY ICONS & CARD RENDERER ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const _industryIcons = {
    'tech': '💻', 'technology': '💻', 'software': '💻',
    'food': '🍕', 'restaurant': '🍕', 'catering': '🍕',
    'retail': '🛍️', 'ecommerce': '🛍️', 'e-commerce': '🛍️',
    'real estate': '🏠', 'property': '🏠',
    'health': '🏥', 'healthcare': '🏥', 'medical': '🏥',
    'finance': '💳', 'banking': '💳',
    'education': '📚', 'creative': '🎨', 'design': '🎨',
    'marketing': '📣', 'media': '📺', 'advertising': '📣',
    'construction': '🏗️', 'auto': '🚗', 'automotive': '🚗',
    'beauty': '💅', 'salon': '💅', 'fitness': '💪', 'gym': '💪',
    'legal': '⚖️', 'consulting': '📋', 'music': '🎵',
    'entertainment': '🎬', 'travel': '✈️', 'hospitality': '🏨',
    'photography': '📷', 'fashion': '👗', 'clothing': '👗',
    'sports': '⚽', 'gaming': '🎮', 'logistics': '📦', 'shipping': '📦',
};

function getIndustryIcon(industry) {
    if (!industry) return '🏢';
    const key = industry.toLowerCase().trim();
    return _industryIcons[key] || '🏢';
}

/**
 * Render a single business card HTML — shared by all panels
 */
function renderBizCard(biz, removeAction) {
    const icon = getIndustryIcon(biz.industry);
    const roleBadge = biz.role ? `<span class="biz-card-role">${biz.role}</span>` : '';
    const metaParts = [];
    if (biz.industry) metaParts.push(biz.industry);
    const websiteHtml = biz.website
        ? `<a href="${biz.website.startsWith('http') ? biz.website : 'https://' + biz.website}" target="_blank" class="biz-card-website">${biz.website}</a>`
        : '';
    if (websiteHtml) metaParts.push(websiteHtml);

    return `
    <div class="biz-card" ${biz.id ? `id="biz-${biz.id}"` : ''}>
        <div class="biz-card-icon">${icon}</div>
        <div class="biz-card-info">
            <div class="biz-card-name">${biz.name}${roleBadge}</div>
            ${metaParts.length ? `<div class="biz-card-meta">${metaParts.join(' · ')}</div>` : ''}
        </div>
        <button type="button" class="biz-card-remove" onclick="${removeAction}" title="Remove">✕</button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── PROFILE SIDEBAR: CLIENT BUSINESSES ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function loadClientBusinesses(clientId) {
    const container = document.getElementById('businesses-list');
    if (!container) return;
    container.innerHTML = '<p class="biz-panel-empty">Loading...</p>';

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${clientId}/businesses`);
        const businesses = await res.json();

        if (!businesses || businesses.length === 0) {
            container.innerHTML = '<p class="biz-panel-empty">No businesses linked yet</p>';
            return;
        }
        container.innerHTML = businesses.map(biz =>
            renderBizCard(biz, `deleteBusiness(${biz.id}, event)`)
        ).join('');
    } catch (err) {
        console.error('Error loading businesses:', err);
        container.innerHTML = '<p class="biz-panel-empty">Error loading businesses</p>';
    }
}

function toggleAddBusinessForm() {
    const form = document.getElementById('add-business-form');
    if (!form) return;
    const isVisible = form.style.display !== 'none';
    form.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        const nameIn = document.getElementById('biz-name-input');
        const roleIn = document.getElementById('biz-role-input');
        const indIn = document.getElementById('biz-industry-input');
        const webIn = document.getElementById('biz-website-input');
        if (nameIn) nameIn.value = '';
        if (roleIn) roleIn.value = '';
        if (indIn) indIn.value = '';
        if (webIn) webIn.value = '';
        if (nameIn) nameIn.focus();
    }
}

async function saveBusiness() {
    if (!currentProfileId) return;

    const name = document.getElementById('biz-name-input').value.trim();
    if (!name) { showToast('Business name is required', 'error'); return; }

    const payload = {
        name,
        role: document.getElementById('biz-role-input')?.value?.trim() || null,
        industry: document.getElementById('biz-industry-input')?.value?.trim() || null,
        website: document.getElementById('biz-website-input')?.value?.trim() || null,
    };

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/businesses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast('Business linked ✓');
            toggleAddBusinessForm();
            loadClientBusinesses(currentProfileId);
            loadClients();
        } else {
            const err = await res.json();
            showToast(`Error: ${err.error}`, 'error');
        }
    } catch (err) {
        showToast('Failed to save business', 'error');
    }
}

async function deleteBusiness(bizId, event) {
    if (event) event.stopPropagation();
    const confirmed = await showConfirm('Remove Business', 'Unlink this business from the client?');
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/crm/businesses/${bizId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Business removed');
            // Remove cards from both sidebar and edit panels
            document.querySelectorAll(`#biz-${bizId}`).forEach(el => el.remove());
            // Check if lists are now empty
            ['businesses-list', 'edit-biz-list'].forEach(id => {
                const c = document.getElementById(id);
                if (c && !c.querySelector('.biz-card')) {
                    c.innerHTML = '<p class="biz-panel-empty">No businesses linked yet</p>';
                }
            });
            loadClients();
        } else {
            showToast('Failed to remove business', 'error');
        }
    } catch (err) {
        showToast('Failed to remove business', 'error');
    }
}

window.toggleAddBusinessForm = toggleAddBusinessForm;
window.saveBusiness = saveBusiness;
window.deleteBusiness = deleteBusiness;
window.loadClientBusinesses = loadClientBusinesses;

// ═══════════════════════════════════════════════════════════════════════════
// ── EDIT FORM: LINKED BUSINESSES PANEL ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function loadEditBusinesses(clientId) {
    const container = document.getElementById('edit-biz-list');
    if (!container) return;
    container.innerHTML = '<p class="biz-panel-empty">Loading...</p>';

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${clientId}/businesses`);
        const businesses = await res.json();
        if (!businesses || businesses.length === 0) {
            container.innerHTML = '<p class="biz-panel-empty">No businesses linked yet</p>';
            return;
        }
        container.innerHTML = businesses.map(biz =>
            renderBizCard(biz, `deleteEditBusiness(${biz.id})`)
        ).join('');
    } catch (err) {
        container.innerHTML = '<p class="biz-panel-empty">Error loading</p>';
    }
}

function toggleEditBizRow() {
    const row = document.getElementById('edit-biz-row');
    if (!row) return;
    const showing = row.style.display !== 'none';
    row.style.display = showing ? 'none' : 'block';
    if (!showing) {
        const nameIn = document.getElementById('edit-biz-name');
        const roleIn = document.getElementById('edit-biz-role');
        const indIn = document.getElementById('edit-biz-industry');
        const webIn = document.getElementById('edit-biz-website');
        if (nameIn) nameIn.value = '';
        if (roleIn) roleIn.value = '';
        if (indIn) indIn.value = '';
        if (webIn) webIn.value = '';
        if (nameIn) nameIn.focus();
    }
}

async function saveEditBusiness() {
    if (!currentProfileId) return;
    const name = document.getElementById('edit-biz-name').value.trim();
    if (!name) { showToast('Business name is required', 'error'); return; }

    const payload = {
        name,
        role: document.getElementById('edit-biz-role')?.value?.trim() || null,
        industry: document.getElementById('edit-biz-industry')?.value?.trim() || null,
        website: document.getElementById('edit-biz-website')?.value?.trim() || null,
    };

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${currentProfileId}/businesses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast('Business linked ✓');
            toggleEditBizRow();
            loadEditBusinesses(currentProfileId);
            loadClientBusinesses(currentProfileId);
            loadClients();
        } else {
            const err = await res.json();
            showToast(`Error: ${err.error}`, 'error');
        }
    } catch (err) {
        showToast('Failed to save business', 'error');
    }
}

async function deleteEditBusiness(bizId) {
    const confirmed = await showConfirm('Remove Business', 'Unlink this business from the client?');
    if (!confirmed) return;
    try {
        const res = await fetch(`${API_BASE}/crm/businesses/${bizId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Business removed');
            loadEditBusinesses(currentProfileId);
            loadClientBusinesses(currentProfileId);
            loadClients();
        } else {
            showToast('Failed to remove', 'error');
        }
    } catch (err) {
        showToast('Failed to remove business', 'error');
    }
}

window.toggleEditBizRow = toggleEditBizRow;
window.saveEditBusiness = saveEditBusiness;
window.deleteEditBusiness = deleteEditBusiness;
window.loadEditBusinesses = loadEditBusinesses;

// ═══════════════════════════════════════════════════════════════════════════
// ── CREATE FORM: STAGED BUSINESSES ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _pendingBizTags = [];

function toggleCreateBizRow() {
    const row = document.getElementById('create-biz-row');
    if (!row) return;
    const showing = row.style.display !== 'none';
    row.style.display = showing ? 'none' : 'block';
    if (!showing) {
        const nameIn = document.getElementById('create-biz-name');
        const roleIn = document.getElementById('create-biz-role');
        const indIn = document.getElementById('create-biz-industry');
        const webIn = document.getElementById('create-biz-website');
        if (nameIn) nameIn.value = '';
        if (roleIn) roleIn.value = '';
        if (indIn) indIn.value = '';
        if (webIn) webIn.value = '';
        if (nameIn) nameIn.focus();
    }
}

function addCreateBizTag() {
    const name = document.getElementById('create-biz-name').value.trim();
    if (!name) { showToast('Business name is required', 'error'); return; }

    _pendingBizTags.push({
        name,
        role: document.getElementById('create-biz-role')?.value?.trim() || null,
        industry: document.getElementById('create-biz-industry')?.value?.trim() || null,
        website: document.getElementById('create-biz-website')?.value?.trim() || null,
    });
    renderCreateBizCards();
    toggleCreateBizRow();
}

function removeCreateBiz(index) {
    _pendingBizTags.splice(index, 1);
    renderCreateBizCards();
}

function renderCreateBizCards() {
    const container = document.getElementById('create-biz-list');
    if (!container) return;
    if (_pendingBizTags.length === 0) {
        container.innerHTML = '<p class="biz-panel-empty">No businesses linked yet. Click "+ Add Business" above.</p>';
        return;
    }
    container.innerHTML = _pendingBizTags.map((biz, i) =>
        renderBizCard(biz, `removeCreateBiz(${i})`)
    ).join('');
}

function resetCreateBizTags() {
    _pendingBizTags = [];
    const container = document.getElementById('create-biz-list');
    if (container) container.innerHTML = '<p class="biz-panel-empty">No businesses linked yet. Click "+ Add Business" above.</p>';
    const row = document.getElementById('create-biz-row');
    if (row) row.style.display = 'none';
}

window.toggleCreateBizRow = toggleCreateBizRow;
window.addCreateBizTag = addCreateBizTag;
window.removeCreateBiz = removeCreateBiz;

async function loadClientSubscriptions(clientId) {
    const list = document.getElementById('client-subs-list');
    if (!list) return;

    try {
        const response = await fetch(`/api/subscriptions/client/${clientId}`);
        const subs = await response.json();

        if (!subs || subs.length === 0) {
            list.innerHTML = '<p class="empty-state" style="font-size:13px; padding:20px 0;">No active subscriptions.</p>';
            return;
        }

        list.innerHTML = subs.map(sub => `
            <div class="invoice-card" style="padding: 15px; margin-bottom: 0; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <div>
                        <div style="font-weight: 700; color: #fff; font-size: 14px;">${sub.name}</div>
                        <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;">$${sub.amount.toFixed(2)} / ${sub.interval}</div>
                    </div>
                    <span class="inv-status status-${sub.status}" style="font-size: 10px; padding: 2px 8px;">${sub.status}</span>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                    <button class="action-btn-styled" onclick="billNow(${sub.id})" style="flex: 1; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; padding: 6px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;">Initiate Send</button>
                    <button class="action-btn-styled" onclick="toggleSubHistory(${sub.id})" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 11px;">History</button>
                    <button class="inv-delete-btn" onclick="deleteSubscription(${sub.id})" style="padding: 6px 10px;">🗑</button>
                </div>
                <div id="sub-history-${sub.id}" class="sub-history-container" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div class="inv-meta">Loading history...</div>
                </div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Error loading client subs:', e);
        list.innerHTML = '<p class="empty-state">Error loading subscriptions.</p>';
    }
}

