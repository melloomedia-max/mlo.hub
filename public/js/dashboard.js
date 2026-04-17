async function loadDashboard() {
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    try {
        const [clientsRes, tasksRes, meetingsRes, projectsRes, invoicesRes, subscriptionsRes] = await Promise.all([
            fetch(`${API_BASE}/crm/clients`),
            fetch(`${API_BASE}/tasks`),
            fetch(`${API_BASE}/meetings`),
            fetch(`${API_BASE}/crm/projects`),
            fetch(`${API_BASE}/invoices`),
            fetch(`${API_BASE}/subscriptions`)
        ]);
        
        loadRevenueForecast();
        checkUnbilledHours();

        const clients = await clientsRes.json();
        const tasks = await tasksRes.json();
        const meetings = await meetingsRes.json();
        const projects = await projectsRes.json();
        const invoices = await invoicesRes.json();
        const subscriptions = await subscriptionsRes.json();

        // Update Stats
        document.getElementById('stat-clients').textContent = clients.length || 0;
        document.getElementById('stat-projects').textContent = projects.filter(p => p.status === 'active').length || 0;
        document.getElementById('stat-tasks').textContent = tasks.filter(t => t.status !== 'done').length || 0;
        document.getElementById('stat-subscriptions').textContent = subscriptions.filter(s => s.status === 'active').length || 0;

        // Meetings Today
        const today = new Date().toISOString().split('T')[0];
        const todaysMeetings = meetings.filter(m => m.start_time.startsWith(today)).length;
        document.getElementById('stat-meetings').textContent = todaysMeetings;

        // Financials — account for partial payments
        const totalRevenue = invoices
            .filter(i => i.status === 'paid')
            .reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0)
            + invoices
                .filter(i => i.status === 'partial')
                .reduce((sum, i) => sum + (parseFloat(i.amount_paid) || 0), 0);

        const pendingRevenue = invoices
            .filter(i => ['sent', 'finalized', 'overdue'].includes(i.status))
            .reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0)
            + invoices
                .filter(i => i.status === 'partial')
                .reduce((sum, i) => sum + Math.max(0, (parseFloat(i.total_amount) || 0) - (parseFloat(i.amount_paid) || 0)), 0);

        const projectedRevenue = projects
            .filter(p => ['active', 'in-progress'].includes(p.status))
            .reduce((sum, p) => sum + (parseFloat(p.budget) || 0), 0);

        document.getElementById('stat-revenue').textContent = `$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        document.getElementById('stat-pending-invoices').textContent = `$${pendingRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        document.getElementById('stat-projected').textContent = `$${projectedRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

        // Upcoming Deadlines (Tasks)
        const upcomingTasks = tasks
            .filter(t => t.due_date && t.status !== 'done')
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
            .slice(0, 5);

        const deadlineList = document.getElementById('deadline-list');
        deadlineList.innerHTML = upcomingTasks.map(t => `
      <li oncontextmenu="ContextMenu.attach(event, 'task', ${t.id}, '${t.title.replace(/'/g, "\\'")}')" data-context="task" style="cursor:pointer;">
        <span>${t.title}</span>
        <span class="due-date" style="color: ${getDueDateColor(t.due_date)}">
          ${new Date(t.due_date).toLocaleDateString()}
        </span>
      </li>
    `).join('') || '<li>No upcoming deadlines</li>';

        // Recent Activity
        const combinedActivity = [
            ...tasks.map(t => ({ type: 'Task', id: t.id, title: t.title, date: t.created_at || t.updated_at })),
            ...projects.map(p => ({ type: 'Project', id: p.id, title: p.name, date: p.created_at })),
            ...clients.map(c => ({ type: 'Client', id: c.id, title: c.name, date: c.created_at }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

        const activityList = document.getElementById('activity-feed');
        activityList.innerHTML = combinedActivity.map(item => `
        <li oncontextmenu="ContextMenu.attach(event, '${item.type.toLowerCase()}', ${item.id}, '${item.title.replace(/'/g, "\\'")}')" data-context="${item.type.toLowerCase()}" style="cursor:pointer;">
            <span>New ${item.type}: <strong>${item.title}</strong></span>
            <small>${new Date(item.date).toLocaleDateString()}</small>
        </li>
    `).join('') || '<li>No recent activity</li>';

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

function getDueDateColor(dateString) {
    const due = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return '#ef4444'; // Overdue
    else if (diffDays <= 3) return '#f59e0b'; // Due soon
    return '#10b981'; // Good
}

// ==========================================
// 🧠 AI Client Intelligence UI Handler
// ==========================================
async function generateAIInsights() {
    const container = document.getElementById('ai-insights-content');
    if (!container) return;

    // Loading State
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; padding: 20px 0;">
            <lottie-player src="img/Siri.json" background="transparent" speed="1" style="width: 60px; height: 60px;" loop autoplay></lottie-player>
            <p style="color: #6d28d9; margin-top: 10px; font-weight: 600; font-style: italic;">Structuring Intelligence...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/crm/ai-insights`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to fetch AI insights');
        }

        const insights = await response.json();
        
        if (!insights || insights.length === 0) {
            container.innerHTML = `<p style="text-align: center; color: #6b7280; padding: 10px;">No active clients found to analyze.</p>`;
            return;
        }

        // Sort by health score ascending (lowest score first = biggest risk)
        insights.sort((a, b) => a.healthScore - b.healthScore);

        container.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 10px;">
                ${insights.map(client => {
                    const isRisk = client.healthScore < 60;
                    const isGood = client.healthScore >= 80;
                    const scoreColor = isRisk ? '#fca5a5' : (isGood ? '#6ee7b7' : '#fcd34d');
                    const scoreBg = isRisk ? 'rgba(239, 68, 68, 0.2)' : (isGood ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)');
                    
                    const actionPayload = (client.actionData && client.actionData.title ? client.actionData.title : '').replace(/'/g, "\\'");
                    const actionType = client.actionType || 'VIEW_CLIENT';
                    
                    return `
                        <div ondblclick="handleAIAction('${actionType}', ${client.clientId}, '${actionPayload}')" 
                             oncontextmenu="ContextMenu.attach(event, 'client', ${client.clientId}, '${client.clientName.replace(/'/g, "\\'")}')"
                             data-context="client"
                             style="cursor: pointer; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 14px; position: relative; backdrop-filter: var(--blur); transition: all 0.2s;"
                             onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--glass-shadow)';"
                             onmouseleave="this.style.transform='none'; this.style.boxShadow='none';">
                             
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em;">${client.clientName}</h4>
                                <div style="background: ${scoreBg}; color: ${scoreColor}; font-weight: 800; font-size: 12px; padding: 4px 8px; border-radius: var(--radius-pill); border: 1px solid ${scoreColor}40;">
                                    Health: ${client.healthScore}
                                </div>
                            </div>
                            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; line-height: 1.5; pointer-events: none;">${client.summary}</p>
                            
                            <div style="background: rgba(255, 255, 255, 0.04); border-left: 3px solid var(--accent); padding: 10px 12px; border-radius: 6px; border-top: 1px solid var(--glass-border); border-right: 1px solid var(--glass-border); border-bottom: 1px solid var(--glass-border); pointer-events: none;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <p style="margin: 0; font-size: 12px; font-weight: 700; color: var(--text-primary);">🎯 Action Item:</p>
                                    <span style="font-size: 10px; font-weight: 600; color: var(--text-tertiary); background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">Double Click</span>
                                </div>
                                <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">${client.actionItem}</p>
                            </div>
                            
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (error) {
        console.error('AI Error:', error);
        container.innerHTML = `
            <div style="background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.3); color: #fca5a5; padding: 14px; border-radius: var(--radius-md);">
                <strong>Analysis Failed:</strong> ${error.message}
                <br><br>
                <small style="color: var(--text-secondary);">Ensure your <code>GEMINI_API_KEY</code> is correctly configured in the backend environment variables.</small>
            </div>
        `;
    }
}

// Global action dispatcher for AI Dashboard interactions
window.handleAIAction = function(actionType, clientId, taskTitle) {
    if (actionType === 'CREATE_INVOICE') {
        if (typeof showSection === 'function') showSection('invoices');
        if (typeof showCreationForm === 'function') showCreationForm('invoice');
        
        setTimeout(() => {
            const clientSelect = document.getElementById('invoice-client-select');
            if (clientSelect) clientSelect.value = clientId;
        }, 150);
        showToast('Invoice flow started from AI suggestion.', 'info');
    } else if (actionType === 'CREATE_TASK') {
        if (typeof showSection === 'function') showSection('tasks');
        if (typeof showCreationForm === 'function') showCreationForm('task');
        
        setTimeout(() => {
            const clientSelect = document.getElementById('creation-task-client');
            if (clientSelect) clientSelect.value = clientId;
            const titleInput = document.getElementById('creation-title');
            if (titleInput && taskTitle) titleInput.value = taskTitle;
        }, 150);
        showToast('Task creation initiated via AI.', 'info');
    } else {
        // Default to viewing client profile
        if (typeof showSection === 'function') showSection('crm');
        if (typeof openClientProfile === 'function') openClientProfile(clientId);
        showToast('Navigated to Client Profile.', 'info');
    }
};

// ==========================================
// 📈 Revenue Forecast UI (Feature 1)
// ==========================================
let outstandingChartObj = null;
let trendChartObj = null;

async function loadRevenueForecast() {
    try {
        const res = await fetch(`${API_BASE}/revenue/forecast`);
        if (!res.ok) throw new Error("Failed to load forecast");
        const data = await res.json();
        
        document.getElementById('avg-payment-cycle-badge').innerText = `Avg Cycle: ${data.avgPaymentCycle} days`;

        // Render Outstanding Buckets
        const oCtx = document.getElementById('outstanding-chart');
        if (oCtx && window.Chart) {
            if (outstandingChartObj) outstandingChartObj.destroy();
            outstandingChartObj = new Chart(oCtx, {
                type: 'doughnut',
                data: {
                    labels: ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
                    datasets: [{
                        data: [
                            data.outstanding['30_days'],
                            data.outstanding['60_days'],
                            data.outstanding['90_days'],
                            data.outstanding['older']
                        ],
                        backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
                        borderWidth: 0
                    }]
                },
                options: { cutout: '70%', plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } } }
            });
        }

        // Render Trend Chart
        const tCtx = document.getElementById('monthly-trend-chart');
        if (tCtx && window.Chart) {
            if (trendChartObj) trendChartObj.destroy();
            trendChartObj = new Chart(tCtx, {
                type: 'bar',
                data: {
                    labels: data.monthlyTrend.map(t => t.month),
                    datasets: [{
                        label: 'Revenue',
                        data: data.monthlyTrend.map(t => t.revenue),
                        backgroundColor: '#6366f1',
                        borderRadius: 4
                    }]
                },
                options: { 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } },
                        x: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    } catch (e) {
        console.error("Revenue forecast error:", e);
    }
}

// ==========================================
// 💰 Billing Bridge UI (Feature 2)
// ==========================================
async function checkUnbilledHours() {
    try {
        const res = await fetch(`${API_BASE}/billing/unbilled`);
        if (!res.ok) return;
        const unbilled = await res.json();
        
        const banner = document.getElementById('unbilled-banner');
        if (unbilled.length > 0) {
            banner.style.display = 'flex';
            document.getElementById('unbilled-banner-text').innerText = `You have ${unbilled.length} client(s) with unbilled hours waiting to be invoiced.`;
        } else {
            banner.style.display = 'none';
        }
    } catch (e) {
        console.error("Unbilled check error:", e);
    }
}
