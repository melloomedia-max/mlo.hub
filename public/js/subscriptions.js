async function loadSubscriptions() {
    try {
        const response = await fetch('/api/subscriptions');
        const subscriptions = await response.json();
        renderSubscriptions(subscriptions);
    } catch (error) {
        console.error('Error loading subscriptions:', error);
    }
}

function renderSubscriptions(subscriptions) {
    const container = document.getElementById('subscriptions-list-container');
    if (!container) return;

    if (subscriptions.length === 0) {
        container.innerHTML = '<p class="empty-state">No active subscriptions.</p>';
        return;
    }

    container.innerHTML = subscriptions.map(sub => `
        <div class="invoice-item-card subscription-card" 
             oncontextmenu="ContextMenu.attach(event, 'subscription', ${sub.id}, '${sub.name}')"
             data-context="subscription"
             style="margin-bottom: 12px; cursor: default; flex-direction: column; align-items: stretch; padding: 15px;">
            <div style="display: flex; align-items: center; width: 100%;">
                <div class="inv-info" style="flex: 1;">
                    <h4 style="margin: 0;">${sub.name}</h4>
                    <div class="inv-meta">${sub.client_name} (${sub.client_company || 'No Company'})</div>
                </div>
                <div class="inv-details" style="text-align: right; margin-right: 20px;">
                    <span class="inv-amount">$${sub.amount.toFixed(2)} / ${sub.interval}</span>
                    <div class="inv-meta">Next: ${sub.next_billing_date || 'TBD'}</div>
                </div>
                <div class="inv-status-badge">
                    <span class="inv-status status-${sub.status}">${sub.status}</span>
                </div>
                <button class="inv-delete-btn" onclick="deleteSubscription(${sub.id})" title="Cancel Subscription" style="margin-left: 10px;">🗑</button>
                <button class="action-btn-styled" onclick="billNow(${sub.id})" style="margin-left: 10px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;" title="Initiate Billing & Send Invoice">Bill Now</button>
                <button class="action-btn-small" onclick="toggleSubHistory(${sub.id})" style="margin-left: 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 4px; padding: 4px 8px; cursor: pointer;">History</button>
            </div>
            <div id="sub-history-${sub.id}" class="sub-history-container" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div class="loading-small">Loading history...</div>
            </div>
        </div>
    `).join('');
}

async function toggleSubHistory(subId) {
    const historyDiv = document.getElementById(`sub-history-${subId}`);
    if (historyDiv.style.display === 'none') {
        historyDiv.style.display = 'block';
        loadSubInvoices(subId);
    } else {
        historyDiv.style.display = 'none';
    }
}

async function loadSubInvoices(subId) {
    if (!subId) {
        console.error('loadSubInvoices called without subId');
        return;
    }
    console.log('Loading invoices for sub:', subId);
    const historyDiv = document.getElementById(`sub-history-${subId}`);
    if (!historyDiv) return;

    try {
        const response = await fetch(`/api/subscriptions/${subId}/invoices`);
        console.log('History fetched status:', response.status);
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errText}`);
        }

        const invoices = await response.json();
        
        if (!Array.isArray(invoices) || invoices.length === 0) {
            historyDiv.innerHTML = '<div class="inv-meta" style="padding: 10px; font-style: italic; opacity: 0.7;">No billing history found for this subscription.</div>';
            return;
        }

        historyDiv.innerHTML = `
            <div style="max-height: 300px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead style="position: sticky; top: 0; background: rgba(30, 30, 50, 0.95); z-index: 1;">
                        <tr style="text-align: left; color: rgba(255,255,255,0.5);">
                            <th style="padding: 8px 4px; font-size: 11px; text-transform: uppercase;">Invoice #</th>
                            <th style="padding: 8px 4px; font-size: 11px; text-transform: uppercase;">Date</th>
                            <th style="padding: 8px 4px; font-size: 11px; text-transform: uppercase;">Amount</th>
                            <th style="padding: 8px 4px; font-size: 11px; text-transform: uppercase;">Status</th>
                            <th style="padding: 8px 4px; font-size: 11px; text-transform: uppercase; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map(inv => `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);"
                                oncontextmenu="ContextMenu.attach(event, 'invoice', ${inv.id}, 'Invoice #${inv.id}')"
                                data-context="invoice">
                                <td style="padding: 10px 4px;">#${inv.id}</td>
                                <td style="padding: 10px 4px;">${inv.issue_date}</td>
                                <td style="padding: 10px 4px; font-weight: 600;">$${inv.total_amount.toFixed(2)}</td>
                                <td style="padding: 10px 4px;"><span class="inv-status status-${inv.status}" style="font-size: 10px; padding: 2px 8px;">${inv.status}</span></td>
                                <td style="padding: 10px 4px; text-align: right;">
                                    <button class="action-btn-small" onclick="resendSubInvoice(${inv.id}, ${subId})" title="Resend Invoice" style="background: none; border: none; cursor: pointer; opacity: 0.7; padding: 4px;">📧</button>
                                    ${inv.status !== 'paid' ? `
                                        <button class="action-btn-small" onclick="sendLateWarning(${inv.id}, ${subId})" title="Send Late Warning" style="background: none; border: none; cursor: pointer; color: #f87171; padding: 4px; margin-left: 4px;">⚠️</button>
                                    ` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        console.error('History Error:', e);
        historyDiv.innerHTML = `<div class="error" style="color: #fda4af; font-size: 12px; padding: 10px;">Error: ${e.message}</div>`;
    }
}

async function resendSubInvoice(invoiceId, subId) {
    console.log('Resending invoice:', invoiceId);
    try {
        const res = await fetch(`/api/subscriptions/invoices/${invoiceId}/resend`, { method: 'POST' });
        console.log('Resend status:', res.status);
        if (res.ok) {
            showToast('Invoice resent!', 'success');
            if (subId) loadSubInvoices(subId);
        } else {
            showToast('Failed to resend', 'error');
        }
    } catch (e) {
        showToast('Error resending invoice', 'error');
    }
}

async function sendLateWarning(invoiceId, subId) {
    console.log('Initiating late warning for:', invoiceId);
    const confirmed = await showConfirm('Send Warning', 'Send a late payment warning with service interruption notice?', null, null, 'Send Warning', false);
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/subscriptions/invoices/${invoiceId}/warning`, { method: 'POST' });
        console.log('Warning status:', res.status);
        if (res.ok) {
            showToast('Warning sent!', 'success');
            if (subId) loadSubInvoices(subId);
        } else {
            showToast('Failed to send warning', 'error');
        }
    } catch (e) {
        showToast('Error sending warning', 'error');
    }
}

async function createSubscription(event) {
    if (event) event.preventDefault();
    
    const clientId = document.getElementById('sub-client-select').value;
    const name = document.getElementById('sub-name').value;
    const amount = parseFloat(document.getElementById('sub-amount').value);
    const interval = document.getElementById('sub-interval').value;
    const billingDay = parseInt(document.getElementById('sub-billing-day').value);

    if (!clientId || !name || isNaN(amount)) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, name, amount, interval, billing_day: billingDay })
        });

        if (response.ok) {
            showToast('Subscription created!', 'success');
            hideSubscriptionForm();
            loadSubscriptions();
            if (typeof refreshAllData === 'function') refreshAllData();
        } else {
            showToast('Failed to create subscription', 'error');
        }
    } catch (error) {
        console.error('Error creating subscription:', error);
        showToast('Error creating subscription', 'error');
    }
}

async function deleteSubscription(id) {
    const confirmed = await showConfirm('Cancel Subscription', 'Are you sure you want to cancel this recurring subscription?');
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Subscription cancelled', 'success');
            loadSubscriptions();
            if (typeof refreshAllData === 'function') refreshAllData();
        }
    } catch (error) {
        console.error('Error deleting subscription:', error);
    }
}

function showSubscriptionForm() {
    document.getElementById('sub-form-modal').style.display = 'flex';
    loadSubClients();
}

function hideSubscriptionForm() {
    document.getElementById('sub-form-modal').style.display = 'none';
}

async function loadSubClients() {
    const select = document.getElementById('sub-client-select');
    try {
        const response = await fetch('/api/crm/clients');
        const clients = await response.json();
        select.innerHTML = '<option value="">Select Client...</option>' + 
            clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch (e) {
        console.error(e);
    }
}

async function billNow(subId) {
    const confirmed = await showConfirm(
        'Initiate Billing', 
        'Generate an invoice and send it to the client immediately? This will also update the next billing date.',
        null, null, 'Initiate Now', false
    );
    if (!confirmed) return;

    showToast('Initiating billing...', 'info');
    try {
        const response = await fetch(`/api/subscriptions/${subId}/bill-now`, { method: 'POST' });
        if (response.ok) {
            showToast('Billing initiated and invoice sent!', 'success');
            loadSubscriptions(); // Refresh list to see new next_billing_date
            if (typeof refreshAllData === 'function') refreshAllData();
        } else {
            const err = await response.json();
            showToast(`Failed: ${err.error}`, 'error');
        }
    } catch (error) {
        console.error('Bill Now Error:', error);
        showToast('Error initiating billing', 'error');
    }
}

async function processDueSubscriptions() {
    showToast('Checking for due subscriptions...', 'info');
    try {
        const response = await fetch('/api/subscriptions/process-due', { method: 'POST' });
        const data = await response.json();
        if (response.ok) {
            const count = data.processed ? data.processed.length : 0;
            showToast(`Billing complete. ${count} invoices generated.`, 'success');
            loadSubscriptions();
            if (typeof refreshAllData === 'function') refreshAllData();
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (e) {
        console.error('Process Due Error:', e);
        showToast('Error processing subscriptions', 'error');
    }
}

window.loadSubscriptions = loadSubscriptions;
window.showSubscriptionForm = showSubscriptionForm;
window.hideSubscriptionForm = hideSubscriptionForm;
window.createSubscription = createSubscription;
window.deleteSubscription = deleteSubscription;
window.toggleSubHistory = toggleSubHistory;
window.resendSubInvoice = resendSubInvoice;
window.sendLateWarning = sendLateWarning;
window.billNow = billNow;
window.processDueSubscriptions = processDueSubscriptions;
