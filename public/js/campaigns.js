let currentCampaigns = [];

async function loadCampaigns() {
    try {
        const response = await fetch('/api/campaigns');
        currentCampaigns = await response.json();
        renderCampaigns();
    } catch (error) {
        console.error('Error loading campaigns:', error);
    }
}

function renderCampaigns() {
    const list = document.getElementById('campaigns-list');
    if (!list) return;

    list.innerHTML = '';
    
    if (currentCampaigns.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="width: 100%; text-align: center; padding: 40px; color: rgba(255,255,255,0.3); border: 1px dashed var(--glass-border); border-radius: 16px;">
                <span style="font-size: 30px; display: block; margin-bottom: 10px;">📉</span>
                No active campaigns. Create one to start automating.
            </div>
        `;
        return;
    }

    const html = currentCampaigns.map(campaign => {
        const flow = campaign.flow_data || { nodes: [] };
        const actionCount = flow.nodes ? flow.nodes.filter(n => n.type === 'action').length : 0;
        const enrollmentCount = campaign.enrollment_count || 0;

        return `
        <div class="glass-card campaign-card" 
             oncontextmenu="ContextMenu.attach(event, 'campaign', ${campaign.id}, '${campaign.name.replace(/'/g, "\\'")}')"
             data-context="campaign"
             style="display: flex; flex-direction: column; gap: 15px; padding: 24px; cursor: default;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h3 style="margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.01em;">${campaign.name}</h3>
                    <div style="display: flex; gap: 8px; margin-top: 6px;">
                        <span class="status-badge status-${campaign.status || 'draft'}" style="font-size: 9px; padding: 2px 8px;">
                            ${(campaign.status || 'draft').toUpperCase()}
                        </span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="editCampaign(${campaign.id})" class="icon-btn" aria-label="Edit campaign ${campaign.name.replace(/"/g, '&quot;')}" title="Edit" style="width: 32px; height: 32px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✏️</button>
                    <button onclick="deleteCampaign(${campaign.id})" class="icon-btn delete-btn" aria-label="Delete campaign ${campaign.name.replace(/"/g, '&quot;')}" title="Delete" style="width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;">🗑️</button>
                </div>
            </div>
            
            <p style="font-size: 13px; color: var(--text-secondary); margin: 0; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${campaign.description || 'No description provided.'}
            </p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0;">
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: center;">
                    <span style="display: block; font-size: 18px; font-weight: 800; color: var(--accent);">${actionCount}</span>
                    <span style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Steps</span>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 12px; border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; text-align: center;">
                    <span style="display: block; font-size: 18px; font-weight: 800; color: var(--teal);">${enrollmentCount}</span>
                    <span style="font-size: 10px; color: var(--text-tertiary); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Active</span>
                </div>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 15px; margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: var(--text-tertiary);">Trigger: <strong style="color: var(--text-secondary);">${campaign.trigger.replace('_', ' ').toUpperCase()}</strong></span>
                <button onclick="viewCampaignStats(${campaign.id})" class="secondary-btn" style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 6px;">
                    Analytics ↗
                </button>
            </div>
        </div>`;
    }).join('');

    const renderedCount = (html.match(/class="glass-card campaign-card"/g) || []).length;
    if (currentCampaigns.length > 0 && renderedCount !== currentCampaigns.length) {
        list.innerHTML = `<div class="error-notice">⚠️ Only ${renderedCount} of ${currentCampaigns.length} campaigns rendered.</div>`;
        console.warn(`[Campaigns] Render mismatch: expected ${currentCampaigns.length}, got ${renderedCount}`);
    } else {
        list.innerHTML = html;
    }
}

let activeTemplateTab = 'email';

function openTemplateLibrary() {
    document.getElementById('template-library-modal').style.display = 'flex';
    loadTemplates();
}

function closeTemplateLibrary() {
    document.getElementById('template-library-modal').style.display = 'none';
}

function switchTemplateTab(ev, tab) {
    activeTemplateTab = tab;
    document.querySelectorAll('#template-library-modal .tab-btn').forEach(btn => btn.classList.remove('active'));
    ev.target.classList.add('active');
    loadTemplates();
}

async function loadTemplates() {
    const grid = document.getElementById('template-grid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px;">Loading templates...</div>';
    
    try {
        const response = await fetch(`/api/campaigns/templates/${activeTemplateTab}`);
        const templates = await response.json();
        
        if (templates.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.3);">No templates found. Create your first one!</div>';
            return;
        }

        const html = templates.map(t => {
            return `
            <div class="glass-card template-card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px; cursor: default;">
                <div>
                    <div style="font-weight: 700; margin-bottom: 5px;">${t.name}</div>
                    ${activeTemplateTab === 'email' ? `<div style="font-size: 11px; color: var(--accent); margin-bottom: 8px;">${t.category || 'General'}</div>` : ''}
                    <div style="font-size: 12px; color: rgba(255,255,255,0.5); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                        ${t.body}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
                    <button onclick="editTemplate('${activeTemplateTab}', ${t.id})" class="secondary-btn" style="flex: 1; padding: 6px; font-size: 11px;">✏️ Edit</button>
                    <button onclick="deleteTemplate('${activeTemplateTab}', ${t.id})" class="icon-btn delete-btn" style="flex: 1; padding: 6px; font-size: 11px;">🗑️ Delete</button>
                </div>
            </div>`;
        }).join('');

        const renderedCount = (html.match(/class="glass-card template-card"/g) || []).length;
        if (templates.length > 0 && renderedCount !== templates.length) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">⚠️ Only ${renderedCount} of ${templates.length} templates rendered.</div>`;
            console.warn(`[Campaigns] Template render mismatch: expected ${templates.length}, got ${renderedCount}`);
        } else {
            grid.innerHTML = html;
        }
    } catch (e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #ef4444;">Error loading templates</div>';
    }
}

function createNewTemplate(type) {
    document.getElementById('template-editor-modal').style.display = 'flex';
    document.getElementById('template-editor-title').textContent = `New ${type.toUpperCase()} Template`;
    document.getElementById('template-editor-form').reset();
    document.getElementById('editor-template-id').value = '';
    document.getElementById('editor-template-type').value = type;
    
    document.getElementById('email-only-fields').style.display = (type === 'email' ? 'block' : 'none');
}

async function editTemplate(type, id) {
    try {
        const response = await fetch(`/api/campaigns/templates/${type}`);
        const templates = await response.json();
        const t = templates.find(temp => temp.id === id);
        
        if (!t) return;

        document.getElementById('template-editor-modal').style.display = 'flex';
        document.getElementById('template-editor-title').textContent = `Edit ${type.toUpperCase()} Template`;
        document.getElementById('editor-template-id').value = id;
        document.getElementById('editor-template-type').value = type;
        
        document.getElementById('editor-template-name').value = t.name;
        document.getElementById('editor-template-body').value = t.body;
        
        if (type === 'email') {
            document.getElementById('email-only-fields').style.display = 'block';
            document.getElementById('editor-template-subject').value = t.subject || '';
            document.getElementById('editor-template-category').value = t.category || '';
        } else {
            document.getElementById('email-only-fields').style.display = 'none';
        }
    } catch (e) {
        showToast('Error loading template details', 'error');
    }
}

function closeTemplateEditor() {
    document.getElementById('template-editor-modal').style.display = 'none';
}

async function saveTemplate(ev) {
    ev.preventDefault();
    const id = document.getElementById('editor-template-id').value;
    const type = document.getElementById('editor-template-type').value;
    
    const payload = {
        name: document.getElementById('editor-template-name').value,
        body: document.getElementById('editor-template-body').value
    };
    
    if (type === 'email') {
        payload.subject = document.getElementById('editor-template-subject').value;
        payload.category = document.getElementById('editor-template-category').value;
    }
    
    try {
        const url = id ? `/api/campaigns/templates/${type}/${id}` : `/api/campaigns/templates/${type}`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            showToast('Template saved successfully');
            closeTemplateEditor();
            loadTemplates();
        }
    } catch (e) {
        showToast('Error saving template', 'error');
    }
}

async function deleteTemplate(type, id) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
        const response = await fetch(`/api/campaigns/templates/${type}/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Template deleted');
            loadTemplates();
        }
    } catch (e) {
        showToast('Error deleting template', 'error');
    }
}

async function viewCampaignStats(id) {
    const modal = document.getElementById('campaign-analytics-modal');
    modal.style.display = 'flex';
    
    try {
        const campaign = currentCampaigns.find(c => c.id === id);
        document.getElementById('analytics-title').textContent = `${campaign.name} Analytics`;
        
        const res = await fetch(`/api/campaigns/${id}/analytics`);
        const { daily, recent_sends } = await res.json();
        
        // Render Summary
        const totalSends = recent_sends.length;
        const activeEnrollments = campaign.enrollment_count || 0;
        
        document.getElementById('analytics-summary-grid').innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${totalSends}</div>
                <div class="stat-label">Total Sends</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeEnrollments}</div>
                <div class="stat-label">Active Enrollments</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">100%</div>
                <div class="stat-label">Delivery Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">0%</div>
                <div class="stat-label">Conversion Rate</div>
            </div>
        `;
        
        // Render Chart
        renderAnalyticsChart(daily);
        
        // Render Executions
        const list = document.getElementById('recent-executions-list');
        list.innerHTML = recent_sends.length ? recent_sends.map(s => `
            <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px;">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${s.type.toUpperCase()} Sent</strong>
                    <span style="opacity: 0.5;">${new Date(s.sent_at).toLocaleDateString()}</span>
                </div>
                <div style="color: var(--text-secondary); margin-top: 4px;">To Client #${s.client_id}</div>
            </div>
        `).join('') : '<div style="text-align: center; padding: 20px; opacity: 0.5;">No recent executions</div>';
        
    } catch (e) {
        showToast('Error loading analytics', 'error');
    }
}

function closeCampaignAnalytics() {
    document.getElementById('campaign-analytics-modal').style.display = 'none';
    if (window.campaignChart) window.campaignChart.destroy();
}

let campaignChart = null;
function renderAnalyticsChart(data) {
    const ctx = document.getElementById('campaign-sends-chart').getContext('2d');
    if (window.campaignChart) window.campaignChart.destroy();
    
    // Sort and fill missing days if needed, for now just plot
    const labels = data.map(d => d.date);
    const sends = data.map(d => d.sends);
    
    window.campaignChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
                label: 'Daily Sends',
                data: sends.length ? sends : [0],
                borderColor: '#2dd4bf',
                backgroundColor: 'rgba(45, 212, 191, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function deleteCampaign(id) {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
        await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        loadCampaigns();
        showToast('Campaign deleted');
    } catch (e) {
        showToast('Error deleting campaign', 'error');
    }
}

// NOTE: `editCampaign` is defined in campaign-builder.js — it opens the visual
// flow builder with the campaign loaded. Do not re-declare or re-assign it here;
// a stub would clobber the real implementation.

window.deleteCampaign = deleteCampaign;
window.viewCampaignStats = viewCampaignStats;
window.loadCampaigns = loadCampaigns;
