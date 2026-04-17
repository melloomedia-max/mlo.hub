// Invoice Management - Clean & Robust
window.hasUnsavedDraft = false;
let currentInvoiceId = null;
let isEditingInvoice = false; // tracks whether form is in edit vs create mode


// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (window.hasUnsavedDraft) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Load and display invoices
async function loadInvoices() {
    // Reset detail state when returning to list
    currentInvoiceId = null;

    // Clean up any stale dynamically-injected elements
    const staleHistory = document.getElementById('payment-history-section');
    if (staleHistory) staleHistory.remove();
    const staleForm = document.getElementById('partial-payment-form');
    if (staleForm) staleForm.remove();

    document.getElementById('invoice-form-container').style.display = 'none';
    document.getElementById('invoice-detail-section').style.display = 'none';
    const list = document.getElementById('invoices-list');
    list.style.display = 'grid';

    try {
        const response = await fetch(`${API_BASE}/invoices`);
        const invoices = await response.json();
        displayInvoices(invoices);
    } catch (error) {
        console.error('Error loading invoices:', error);
        list.innerHTML = '<p class="empty-state">Error loading invoices</p>';
    }
}

function displayInvoices(invoices) {
    const container = document.getElementById('invoices-list');

    if (invoices.length === 0) {
        container.innerHTML = '<p class="empty-state">No invoices created yet.</p>';
        container.style.display = 'flex';
        return;
    }

    container.style.display = 'grid';
    container.innerHTML = invoices.map(inv => {
        const isLocked = ['finalized', 'sent', 'paid'].includes(inv.status);
        const lockIcon = isLocked ? '<span title="Locked">🔒</span> ' : '';
        const amountPaid = inv.amount_paid || 0;
        const remaining = Math.max(0, inv.total_amount - amountPaid);
        const paidPercent = inv.total_amount > 0 ? Math.min(100, (amountPaid / inv.total_amount) * 100) : 0;

        let amountDisplay = `$${inv.total_amount.toFixed(2)}`;
        if (inv.status === 'partial') {
            amountDisplay = `<span style="font-size:0.75em; color:#fbbf24;">$${remaining.toFixed(2)} left</span>`;
        }

        return `
        <div class="invoice-item-card" 
             onclick="openInvoiceDetail(${inv.id})"
             oncontextmenu="ContextMenu.attach(event, 'invoice', ${inv.id}, 'Invoice #${inv.id}')"
             data-context="invoice">
            <div class="inv-info">
                <h4>${lockIcon}Invoice #${inv.id}</h4>
                <div class="inv-meta">${inv.client_name || 'Unknown Client'}${inv.project_name ? ` • ${inv.project_name}` : ''}</div>
            </div>
            <div class="inv-details">
                <span class="inv-amount">${amountDisplay}</span>
            </div>
            <div class="inv-status-badge">
                <span class="inv-status status-${inv.status}">${inv.status}</span>
            </div>
            <div class="inv-date">
                <span class="inv-meta">Due: ${new Date(inv.due_date).toLocaleDateString()}</span>
            </div>
            ${inv.status === 'partial' ? `<div style="width:100%; grid-column:1/-1; padding:0 12px 8px;"><div style="height:4px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;"><div style="height:100%; width:${paidPercent.toFixed(0)}%; background:linear-gradient(90deg,#10b981,#34d399); border-radius:4px;"></div></div></div>` : ''}
            <button class="inv-delete-btn" title="Delete invoice" onclick="event.stopPropagation(); quickDeleteInvoice(${inv.id})">🗑</button>
        </div>
        `;
    }).join('');
}

// Show invoice creation form
async function showInvoiceForm() {
    if (window.hasUnsavedDraft && !confirm('Discard current unsaved draft?')) {
        return;
    }

    window.hasUnsavedDraft = true;

    // Update UI
    document.querySelector('#invoice-form-container h3').textContent = 'Create New Invoice';
    document.querySelector('#create-invoice-form button[type="submit"]').textContent = 'Finalize & Save';

    // Load clients
    const select = document.getElementById('invoice-client-select');
    select.innerHTML = '<option value="">Loading...</option>';

    try {
        const response = await fetch(`${API_BASE}/crm/clients`);
        const clients = await response.json();
        select.innerHTML = '<option value="">Select Client</option>' +
            clients.map(c => `<option value="${c.id}">${c.name} (${c.company || 'No Company'})</option>`).join('');
    } catch (error) {
        console.error('Error loading clients:', error);
        select.innerHTML = '<option value="">Error loading clients</option>';
    }

    // Reset form
    document.getElementById('create-invoice-form').reset();
    document.getElementById('invoice-issue-date').valueAsDate = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    document.getElementById('invoice-due-date').valueAsDate = dueDate;
    document.getElementById('invoice-currency').value = 'USD';
    document.getElementById('invoice-discount-type').value = 'fixed';
    document.getElementById('invoice-payment-instructions').value = '';
    document.getElementById('invoice-project-select').innerHTML = '<option value="">Select Project...</option>';

    // Clear and add one line item
    document.getElementById('invoice-line-items').innerHTML = '';
    addInvoiceLine();
    calculateInvoiceTotal();

    // Show form
    document.getElementById('invoice-form-container').style.display = 'block';
    document.getElementById('invoices-list').style.display = 'none';
    document.getElementById('invoice-detail-section').style.display = 'none';
}

function hideInvoiceForm() {
    if (window.hasUnsavedDraft && !confirm('Discard unsaved changes?')) {
        return;
    }
    window.hasUnsavedDraft = false;
    isEditingInvoice = false;
    document.getElementById('invoice-form-container').style.display = 'none';
    // If we were editing, go back to the detail view; otherwise go to list
    if (currentInvoiceId && !isEditingInvoice) {
        openInvoiceDetail(currentInvoiceId);
    } else {
        loadInvoices();
    }
}

// Add line item
function addInvoiceLine(data = null) {
    window.hasUnsavedDraft = true;
    const container = document.getElementById('invoice-line-items');
    const div = document.createElement('div');
    div.className = 'line-item-row';

    // Pre-calculate the line total so it shows correctly immediately when editing
    const qty = data ? (parseFloat(data.quantity) || 0) : 1;
    const rate = data ? (parseFloat(data.rate) || 0) : 0;
    const disc = data ? (parseFloat(data.discount) || 0) : 0;
    let lineTotal = qty * rate;
    if (disc > 0) lineTotal = lineTotal * (1 - disc / 100);
    const currency = document.getElementById('invoice-currency')?.value || 'USD';
    const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

    div.innerHTML = `
        <input type="text"   class="line-desc" placeholder="Description" value="${data ? data.description : ''}" required oninput="calculateInvoiceTotal()">
        <input type="number" class="line-qty"  value="${qty}"  min="0" step="0.01" oninput="calculateInvoiceTotal()">
        <input type="number" class="line-rate" value="${rate}" min="0" step="0.01" oninput="calculateInvoiceTotal()">
        <input type="number" class="line-disc" value="${disc}" min="0" max="100" step="0.1" title="Discount %" oninput="calculateInvoiceTotal()">
        <span class="line-total">${symbol}${lineTotal.toFixed(2)}</span>
        <button type="button" onclick="removeLine(this)" style="color:red; background:none; border:none; cursor:pointer; font-size:1.2em;">&times;</button>
    `;
    container.appendChild(div);
    // Always recalculate totals after adding any line
    calculateInvoiceTotal();
}

function removeLine(btn) {
    window.hasUnsavedDraft = true;
    btn.parentElement.remove();
    calculateInvoiceTotal();
}

// Calculate totals
function calculateInvoiceTotal() {
    window.hasUnsavedDraft = true;
    const rows = document.querySelectorAll('.line-item-row');
    let subtotal = 0;
    const currency = document.getElementById('invoice-currency').value;
    const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.line-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.line-rate').value) || 0;
        const disc = parseFloat(row.querySelector('.line-disc').value) || 0;

        let lineTotal = qty * rate;
        if (disc > 0) lineTotal = lineTotal * (1 - (disc / 100));

        row.querySelector('.line-total').textContent = symbol + lineTotal.toFixed(2);
        subtotal += lineTotal;
    });

    const discountVal = parseFloat(document.getElementById('invoice-discount-val').value) || 0;
    const discountType = document.getElementById('invoice-discount-type').value;
    const taxRate = parseFloat(document.getElementById('invoice-tax').value) || 0;

    let discountAmount = discountType === 'percent' ? subtotal * (discountVal / 100) : discountVal;
    let taxable = Math.max(0, subtotal - discountAmount);
    let taxAmount = taxable * (taxRate / 100);
    let total = taxable + taxAmount;

    document.getElementById('invoice-total-display').innerHTML = `
        <div style="display:inline-block; font-size:13px; text-align:right; color:rgba(255,255,255,0.5); vertical-align:middle; margin-right:12px; line-height:1.7;">
            <div>Subtotal: ${symbol}${subtotal.toFixed(2)}</div>
            ${discountAmount > 0 ? `<div style="color:#fda4af">Discount: -${symbol}${discountAmount.toFixed(2)}</div>` : ''}
            ${taxAmount > 0 ? `<div style="color:#86efac">Tax: +${symbol}${taxAmount.toFixed(2)}</div>` : ''}
        </div>
        <span style="font-size:1.6em; font-weight:800; color:rgba(255,255,255,0.95); letter-spacing:-0.5px;">${symbol}${total.toFixed(2)}</span>
    `;
}

// Submit invoice (create or update)
async function handleInvoiceSubmit(event) {
    if (event) event.preventDefault();

    const clientId = document.getElementById('invoice-client-select').value;
    if (!clientId) {
        showToast('Please select a client', 'error');
        return;
    }

    const items = [];
    document.querySelectorAll('.line-item-row').forEach(row => {
        items.push({
            description: row.querySelector('.line-desc').value,
            quantity: parseFloat(row.querySelector('.line-qty').value),
            rate: parseFloat(row.querySelector('.line-rate').value),
            discount: parseFloat(row.querySelector('.line-disc').value) || 0
        });
    });

    if (items.length === 0) {
        showToast('Please add at least one line item', 'error');
        return;
    }

    const invoiceData = {
        client_id: clientId,
        project_id: document.getElementById('invoice-project-select').value || null,
        issue_date: document.getElementById('invoice-issue-date').value,
        due_date: document.getElementById('invoice-due-date').value,
        status: isEditingInvoice ? 'finalized' : 'finalized',
        items: items,
        currency: document.getElementById('invoice-currency').value,
        discount_amount: parseFloat(document.getElementById('invoice-discount-val').value) || 0,
        discount_type: document.getElementById('invoice-discount-type').value,
        tax_rate: parseFloat(document.getElementById('invoice-tax').value) || 0,
        notes: document.getElementById('invoice-notes').value,
        payment_instructions: document.getElementById('invoice-payment-instructions').value
    };

    const isEdit = isEditingInvoice && currentInvoiceId;
    showToast(isEdit ? 'Saving changes...' : 'Creating invoice...', 'info');

    try {
        const response = await fetch(
            isEdit ? `${API_BASE}/invoices/${currentInvoiceId}` : `${API_BASE}/invoices`,
            {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoiceData)
            }
        );

        const data = await response.json();

        if (response.ok) {
            window.hasUnsavedDraft = false;
            isEditingInvoice = false;
            const savedId = isEdit ? currentInvoiceId : data.id;
            hideInvoiceForm();
            showToast(isEdit ? 'Invoice updated!' : 'Invoice created!', 'success');
            if (savedId) openInvoiceDetail(savedId);
            refreshAllData(); // Refresh global data after save
        } else {
            showToast(`Failed: ${data.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Error saving invoice:', error);
        showToast(`Error: ${error.message}`, 'error');
    }
}

function createInvoice(event) {
    handleInvoiceSubmit(event);
    return false;
}

// Edit an existing invoice — load it into the form
async function editInvoice() {
    if (!currentInvoiceId) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}`);
        const invoice = await response.json();
        if (!invoice) return;

        isEditingInvoice = true;
        window.hasUnsavedDraft = true;

        // Update form header & button
        document.querySelector('#invoice-form-container h3').textContent = `Edit Invoice #${invoice.id}`;
        document.querySelector('#create-invoice-form button[type="submit"]').textContent = '💾 Save Changes';

        // Load clients then select the right one
        const select = document.getElementById('invoice-client-select');
        select.innerHTML = '<option value="">Loading...</option>';
        const clientsRes = await fetch(`${API_BASE}/crm/clients`);
        const clients = await clientsRes.json();
        select.innerHTML = '<option value="">Select Client</option>' +
            clients.map(c => `<option value="${c.id}" ${c.id === invoice.client_id ? 'selected' : ''}>${c.name} (${c.company || 'No Company'})</option>`).join('');

        if (invoice.client_id) {
            await loadClientProjectsForInvoice(invoice.client_id, invoice.project_id);
        }

        // Dates
        document.getElementById('invoice-issue-date').value = invoice.issue_date ? invoice.issue_date.split('T')[0] : '';
        document.getElementById('invoice-due-date').value = invoice.due_date ? invoice.due_date.split('T')[0] : '';

        // Currency, discount, tax
        document.getElementById('invoice-currency').value = invoice.currency || 'USD';
        document.getElementById('invoice-discount-val').value = invoice.discount_amount || 0;
        document.getElementById('invoice-discount-type').value = invoice.discount_type || 'fixed';
        document.getElementById('invoice-tax').value = invoice.tax_rate || 0;

        // Notes & payment instructions
        document.getElementById('invoice-notes').value = invoice.notes || '';
        document.getElementById('invoice-payment-instructions').value = invoice.payment_instructions || '';

        // Line items
        document.getElementById('invoice-line-items').innerHTML = '';
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => addInvoiceLine(item));
        } else {
            addInvoiceLine();
        }
        calculateInvoiceTotal();

        // Show form, hide detail
        document.getElementById('invoice-form-container').style.display = 'block';
        document.getElementById('invoice-detail-section').style.display = 'none';
        document.getElementById('invoices-list').style.display = 'none';

    } catch (error) {
        console.error('Error loading invoice for edit:', error);
        showToast('Error loading invoice', 'error');
    }
}

// View invoice detail
async function openInvoiceDetail(id) {
    try {
        const response = await fetch(`${API_BASE}/invoices/${id}`);
        const invoice = await response.json();

        if (!invoice) return;

        currentInvoiceId = invoice.id;

        // Clean up any stale elements from previously viewed invoice
        const staleHistory = document.getElementById('payment-history-section');
        if (staleHistory) staleHistory.remove();
        const staleForm = document.getElementById('partial-payment-form');
        if (staleForm) staleForm.remove();

        const driveLink = invoice.google_drive_file_id
            ? `https://drive.google.com/file/d/${invoice.google_drive_file_id}/view`
            : null;

        const symbol = invoice.currency === 'EUR' ? '€' : invoice.currency === 'GBP' ? '£' : '$';
        let subtotal = 0;
        if (invoice.items) {
            invoice.items.forEach(i => subtotal += (i.amount !== undefined ? i.amount : (i.quantity * i.rate)));
        }

        let discountAmt = invoice.discount_type === 'percent'
            ? subtotal * ((invoice.discount_amount || 0) / 100)
            : (invoice.discount_amount || 0);
        let taxable = Math.max(0, subtotal - discountAmt);
        let taxAmt = taxable * ((invoice.tax_rate || 0) / 100);

        const itemsHtml = (invoice.items || []).map(item => `
            <tr>
                <td>${item.description || ''}</td>
                <td style="text-align:center">${item.quantity || 0}</td>
                <td style="text-align:right">${symbol}${(item.rate || 0).toFixed(2)}</td>
                <td style="text-align:center">${item.discount > 0 ? item.discount + '%' : '-'}</td>
                <td style="text-align:right">${symbol}${(item.amount || (item.quantity * item.rate)).toFixed(2)}</td>
            </tr>
        `).join('');

        const paper = document.getElementById('invoice-paper');
        paper.innerHTML = `
            <div class="paper-header">
                <div class="paper-brand" style="text-align:left;">
                    <h2 style="margin:0; font-size:22px; font-weight:800; color:#6366f1;">Melloo Media</h2>
                    <p style="margin:0; font-size:11px; color:#9ca3af; font-weight:500;">a Melloo LLC company</p>
                    <p style="margin:2px 0 0; font-size:12px; color:#dbeafe;">melloomedia@gmail.com</p>
                </div>
                <div class="paper-meta" style="text-align:right;">
                    <h1 class="paper-title" style="margin:0; font-size:32px; line-height:1;">INVOICE</h1>
                    <p style="color:#9ca3af; font-size:14px; margin-bottom:12px;">#${invoice.id}</p>
                    
                    <p>Issue Date: ${new Date(invoice.issue_date).toLocaleDateString()}</p>
                    <p>Due Date: ${new Date(invoice.due_date).toLocaleDateString()}</p>
                    <p>Status: <b style="text-transform:uppercase; padding:2px 6px; border-radius:4px; font-size:11px; background:${invoice.status === 'paid' ? 'rgba(16, 185, 129, 0.2)' : invoice.status === 'sent' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)'}; color:${invoice.status === 'paid' ? '#6ee7b7' : invoice.status === 'sent' ? '#60a5fa' : '#9ca3af'}">${invoice.status}</b></p>
                    ${invoice.project_name ? `<p style="margin-top:4px; color:#e0e7ff;">Project: <strong>${invoice.project_name}</strong></p>` : ''}
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:8px;">
                        <a href="/api/invoices/generate/pdf/${invoice.id}" target="_blank" style="display:inline-block; font-size:11px; color:#818cf8; text-decoration:underline; font-weight:600;">Download PDF 📥</a>
                        ${driveLink ? `<a href="${driveLink}" target="_blank" style="display:inline-block; font-size:11px; color:#94a3b8; text-decoration:underline;">View on Drive ↗</a>` : ''}
                    </div>
                </div>
            </div>

            <div class="paper-client">
                <p><strong>Bill To:</strong></p>
                <p>${invoice.client_name || 'N/A'}</p>
            </div>

            <table class="paper-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style="text-align:center">Qty</th>
                        <th style="text-align:right">Rate</th>
                        <th style="text-align:center">Disc</th>
                        <th style="text-align:right">Amount</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>

            <div class="paper-totals">
                <div class="total-row"><span>Subtotal:</span><span>${symbol}${subtotal.toFixed(2)}</span></div>
                ${discountAmt > 0 ? `<div class="total-row"><span>Discount:</span><span>-${symbol}${discountAmt.toFixed(2)}</span></div>` : ''}
                ${taxAmt > 0 ? `<div class="total-row"><span>Tax:</span><span>+${symbol}${taxAmt.toFixed(2)}</span></div>` : ''}
                <div class="total-row total-final"><span>Total:</span><span>${symbol}${invoice.total_amount.toFixed(2)}</span></div>
            </div>

            ${(invoice.amount_paid > 0 || invoice.status === 'partial') ? `
            <div class="paper-totals" style="margin-top:16px; border-top:2px solid rgba(99,102,241,0.3); padding-top:16px;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#818cf8; margin-bottom:10px; font-weight:700;">Payment Status</div>
                <div class="total-row"><span style="color:#10b981">✓ Amount Paid:</span><span style="color:#6ee7b7; font-weight:700;">${symbol}${(invoice.amount_paid || 0).toFixed(2)}</span></div>
                <div class="total-row total-final" style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px; margin-top:4px;"><span style="color:#fbbf24;">Remaining Balance:</span><span style="color:#fcd34d; font-weight:800; font-size:1.1em;">${symbol}${(Math.max(0, invoice.total_amount - (invoice.amount_paid || 0))).toFixed(2)}</span></div>
                <div style="margin-top:10px; height:6px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${(invoice.total_amount > 0 ? Math.min(100, ((invoice.amount_paid || 0) / invoice.total_amount) * 100) : 0).toFixed(0)}%; background:linear-gradient(90deg,#10b981,#34d399); border-radius:4px; transition:width 0.5s ease;"></div>
                </div>
                <div style="text-align:right; font-size:11px; color:#9ca3af; margin-top:4px;">${(invoice.total_amount > 0 ? Math.min(100, ((invoice.amount_paid || 0) / invoice.total_amount) * 100) : 0).toFixed(0)}% paid</div>
            </div>` : ''}

            ${invoice.notes ? `<div class="paper-notes"><p><strong>Notes:</strong></p><p>${invoice.notes}</p></div>` : ''}
            ${invoice.payment_instructions ? `<div class="paper-notes" style="margin-top:12px; border-top:1px solid #e5e7eb; padding-top:12px;"><p><strong>💳 Payment Instructions:</strong></p><p style="white-space:pre-line;">${invoice.payment_instructions}</p></div>` : ''}
        `;

        // Load payment history
        loadPaymentHistory(invoice.id, symbol);

        updateInvoiceActions(invoice);

        document.getElementById('invoice-detail-section').style.display = 'block';
        document.getElementById('invoices-list').style.display = 'none';
        document.getElementById('invoice-form-container').style.display = 'none';

    } catch (error) {
        console.error('Error loading invoice:', error);
        showToast('Error loading invoice', 'error');
    }
}

function updateInvoiceActions(invoice) {
    const actions = document.getElementById('invoice-actions');
    let html = '<button onclick="showSection(\'invoices\'); loadInvoices();">← Back</button>';

    if (invoice.status === 'draft') {
        html += '<button onclick="editInvoice()" class="inv-action-edit">✏️ Edit</button>';
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    } else if (invoice.status === 'finalized') {
        html += '<button onclick="editInvoice()" class="inv-action-edit">✏️ Edit</button>';
        if (invoice.google_drive_file_id) {
            html += `<button onclick="window.open('https://drive.google.com/file/d/${invoice.google_drive_file_id}/view', '_blank')">📄 View PDF</button>`;
        }
        html += '<button onclick="emailInvoice()">📧 Send to Client</button>';
        html += '<button onclick="showPaymentForm()" style="background:linear-gradient(135deg,#10b981,#059669);">💰 Record Payment</button>';
        html += '<button onclick="markAsPaid()">✅ Mark as Paid</button>';
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    } else if (invoice.status === 'sent') {
        if (invoice.google_drive_file_id) {
            html += `<button onclick="window.open('https://drive.google.com/file/d/${invoice.google_drive_file_id}/view', '_blank')">📄 View PDF</button>`;
        }
        html += '<button onclick="showPaymentForm()" style="background:linear-gradient(135deg,#10b981,#059669);">💰 Record Payment</button>';
        html += '<button onclick="markAsPaid()">✅ Mark as Paid</button>';
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    } else if (invoice.status === 'partial') {
        if (invoice.google_drive_file_id) {
            html += `<button onclick="window.open('https://drive.google.com/file/d/${invoice.google_drive_file_id}/view', '_blank')">📄 View PDF</button>`;
        }
        html += '<button onclick="showPaymentForm()" style="background:linear-gradient(135deg,#10b981,#059669);">💰 Record Payment</button>';
        html += '<button onclick="sendRemainingBalance()" style="background:linear-gradient(135deg,#f59e0b,#f97316);">📧 Request Remaining</button>';
        html += '<button onclick="markAsPaid()">✅ Mark as Paid</button>';
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    } else if (invoice.status === 'paid') {
        if (invoice.google_drive_file_id) {
            html += `<button onclick="window.open('https://drive.google.com/file/d/${invoice.google_drive_file_id}/view', '_blank')">📄 View PDF</button>`;
        }
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    } else {
        html += '<button onclick="editInvoice()" class="inv-action-edit">✏️ Edit</button>';
        html += '<button onclick="showPaymentForm()" style="background:linear-gradient(135deg,#10b981,#059669);">💰 Record Payment</button>';
        html += '<button onclick="deleteInvoice()" class="inv-action-delete">🗑 Delete</button>';
    }

    actions.innerHTML = html;
}

async function markAsPaid() {
    const confirmed = await showConfirm(
        'Mark as Paid',
        'Mark this invoice as Paid? A receipt will be automatically sent to the client.',
        null,
        null,
        'Mark Paid',
        false
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'paid' })
        });

        if (response.ok) {
            showToast('Invoice marked as paid', 'success');
            openInvoiceDetail(currentInvoiceId);
            refreshAllData(); // Refresh global data after status change
        } else {
            showToast('Failed to update invoice', 'error');
        }
    } catch (error) {
        showToast('Error updating invoice', 'error');
    }
}

async function emailInvoice() {
    const confirmed = await showConfirm(
        'Send Invoice',
        'Are you sure you want to send this invoice to the client?',
        null,
        null,
        'Yes, Send',
        false
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}/send`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('Invoice sent successfully', 'success');
            openInvoiceDetail(currentInvoiceId);
            refreshAllData(); // Refresh global data after sending
        } else {
            showToast('Failed to send invoice', 'error');
        }
    } catch (error) {
        showToast('Error sending invoice', 'error');
    }
}

async function deleteInvoice() {
    const confirmed = await showConfirm(
        '🗑 Delete Invoice',
        `Permanently delete Invoice #${currentInvoiceId}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Invoice deleted', 'success');
            showSection('invoices');
            loadInvoices();
            refreshAllData(); // Refresh global data after delete
        } else {
            const err = await response.json().catch(() => ({}));
            showToast(err.error || 'Failed to delete invoice', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Error deleting invoice', 'error');
    }
}

async function quickDeleteInvoice(id) {
    const confirmed = await showConfirm(
        '🗑 Delete Invoice',
        `Permanently delete Invoice #${id}? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('Invoice deleted', 'success');
            loadInvoices();
            refreshAllData(); // Refresh global data after delete
        } else {
            const err = await response.json().catch(() => ({}));
            showToast(err.error || 'Failed to delete invoice', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Error deleting invoice', 'error');
    }
}

// Payment instruction presets
function applyPaymentPreset(type) {
    const field = document.getElementById('invoice-payment-instructions');
    const presets = {
        zelle: 'Please send payment via Zelle to: (626) 238-3434\nInclude your invoice number in the memo.',
        venmo: 'Please send payment via Venmo to: @YourVenmoHandle\nInclude your invoice number in the memo.',
        cashapp: 'Please send payment via Cash App to: $YourCashTag\nInclude your invoice number in the memo.',
        bank: 'Bank Transfer Details:\nBank: Your Bank Name\nAccount Name: Your Name\nAccount #: XXXXXXXXXX\nRouting #: XXXXXXXXX',
        clear: ''
    };
    field.value = presets[type] ?? '';
    window.hasUnsavedDraft = true;
}

// Expose functions globally
window.showInvoiceForm = showInvoiceForm;
window.hideInvoiceForm = hideInvoiceForm;
window.createInvoice = createInvoice;
window.editInvoice = editInvoice;
window.addInvoiceLine = addInvoiceLine;
window.removeLine = removeLine;
window.calculateInvoiceTotal = calculateInvoiceTotal;
window.openInvoiceDetail = openInvoiceDetail;
window.markAsPaid = markAsPaid;
window.emailInvoice = emailInvoice;
window.deleteInvoice = deleteInvoice;
window.quickDeleteInvoice = quickDeleteInvoice;
window.loadInvoices = loadInvoices;
window.applyPaymentPreset = applyPaymentPreset;
window.showPaymentForm = showPaymentForm;
window.submitPartialPayment = submitPartialPayment;
window.sendRemainingBalance = sendRemainingBalance;
window.loadPaymentHistory = loadPaymentHistory;

// ========= PARTIAL PAYMENT FUNCTIONS =========

function showPaymentForm() {
    // Insert payment form after the invoice paper if not already present
    let formEl = document.getElementById('partial-payment-form');
    if (formEl) {
        formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
        return;
    }

    const container = document.getElementById('invoice-detail-section');
    const formHtml = `
    <div id="partial-payment-form" style="margin-top:20px; background:rgba(255,255,255,0.03); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:24px;">
        <h4 style="margin:0 0 16px; color:#6ee7b7; font-size:15px;">💰 Record Partial Payment</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
                <label style="font-size:12px; color:#9ca3af; margin-bottom:4px; display:block;">Amount ($)</label>
                <input type="number" id="pp-amount" min="0.01" step="0.01" placeholder="0.00" style="width:100%; padding:10px 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff; font-size:16px; font-weight:700;">
            </div>
            <div>
                <label style="font-size:12px; color:#9ca3af; margin-bottom:4px; display:block;">Payment Method</label>
                <select id="pp-method" style="width:100%; padding:10px 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff; font-size:14px;">
                    <option value="zelle">Zelle</option>
                    <option value="venmo">Venmo</option>
                    <option value="cash">Cash</option>
                    <option value="cashapp">Cash App</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                </select>
            </div>
        </div>
        <div style="margin-top:12px;">
            <label style="font-size:12px; color:#9ca3af; margin-bottom:4px; display:block;">Note (optional)</label>
            <input type="text" id="pp-note" placeholder="e.g. First installment" style="width:100%; padding:10px 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff; font-size:14px;">
        </div>
        <div style="margin-top:16px; display:flex; gap:10px;">
            <button onclick="submitPartialPayment()" style="flex:1; padding:10px; background:linear-gradient(135deg,#10b981,#059669); border:none; border-radius:8px; color:#fff; font-weight:700; cursor:pointer; font-size:14px;">✓ Record Payment</button>
            <button onclick="document.getElementById('partial-payment-form').style.display='none'" style="padding:10px 16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#9ca3af; cursor:pointer; font-size:14px;">Cancel</button>
        </div>
    </div>`;

    container.insertAdjacentHTML('beforeend', formHtml);
}

async function submitPartialPayment() {
    const amount = parseFloat(document.getElementById('pp-amount').value);
    const method = document.getElementById('pp-method').value;
    const note = document.getElementById('pp-note').value;

    if (!amount || amount <= 0) {
        showToast('Please enter a valid payment amount', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, method, note })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`Payment of $${amount.toFixed(2)} recorded! Remaining: $${data.remaining_balance.toFixed(2)}`, 'success');
            // Remove the form and reload the detail view
            const formEl = document.getElementById('partial-payment-form');
            if (formEl) formEl.remove();
            openInvoiceDetail(currentInvoiceId);
            refreshAllData();
        } else {
            showToast(data.error || 'Failed to record payment', 'error');
        }
    } catch (error) {
        console.error('Error recording payment:', error);
        showToast('Error recording payment', 'error');
    }
}

async function sendRemainingBalance() {
    const confirmed = await showConfirm(
        '📧 Send Remaining Balance',
        'This will send an email to the client requesting payment for the remaining balance. Continue?',
        null,
        null,
        'Yes, Send',
        false
    );
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/invoices/${currentInvoiceId}/send-remaining`, {
            method: 'POST'
        });

        const data = await response.json();
        if (response.ok) {
            showToast(data.message || 'Remaining balance request sent!', 'success');
        } else {
            showToast(data.error || 'Failed to send email', 'error');
        }
    } catch (error) {
        console.error('Error sending remaining balance:', error);
        showToast('Error sending remaining balance email', 'error');
    }
}

async function loadPaymentHistory(invoiceId, symbol) {
    try {
        const response = await fetch(`${API_BASE}/invoices/${invoiceId}/payments`);
        const payments = await response.json();

        if (!payments || payments.length === 0) return; // No history to show

        // Check if container exists, remove old one
        let historyEl = document.getElementById('payment-history-section');
        if (historyEl) historyEl.remove();

        const historyHtml = `
        <div id="payment-history-section" style="margin-top:20px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:20px;">
            <h4 style="margin:0 0 14px; color:#818cf8; font-size:14px; text-transform:uppercase; letter-spacing:0.05em;">Payment History</h4>
            ${payments.map(p => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                        <span style="color:#6ee7b7; font-weight:700; font-size:15px;">${symbol}${p.amount.toFixed(2)}</span>
                        <span style="color:#6b7280; font-size:12px; margin-left:8px;">${p.method ? p.method.toUpperCase() : ''}</span>
                        ${p.note ? `<div style="color:#9ca3af; font-size:12px; margin-top:2px;">${p.note}</div>` : ''}
                    </div>
                    <span style="color:#6b7280; font-size:12px;">${new Date(p.created_at).toLocaleDateString()} ${new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            `).join('')}
        </div>`;

        const container = document.getElementById('invoice-detail-section');
        container.insertAdjacentHTML('beforeend', historyHtml);
    } catch (error) {
        console.error('Error loading payment history:', error);
    }
}

// Global refresh function to update all affected views
async function refreshAllData() {
    // 1. Dashboard stats
    if (typeof loadDashboard === 'function') loadDashboard();

    // 2. Invoices list (always reload to keep list fresh even if hidden)
    loadInvoices();

    // 3. CRM Projects (if viewing a client)
    if (typeof currentProfileId !== 'undefined' && currentProfileId) {
        if (typeof loadProjects === 'function') loadProjects(currentProfileId);
    }

    // 4. Project Modal (if open)
    const modal = document.getElementById('proj-detail-modal');
    if (modal && modal.style.display !== 'none' && typeof _modalProjectId !== 'undefined' && _modalProjectId) {
        // Reload linked invoices for open project modal
        if (typeof loadProjectInvoices === 'function') loadProjectInvoices(_modalProjectId);
        // Also reload project details (like payment pill) - but tricky to just reload p. find a way?
        // Actually, loadProjects above updates the list -> we might need to update modal header too.
        // For now invoice list refresh is key.
    }
}
window.refreshAllData = refreshAllData;

async function loadClientProjectsForInvoice(clientId, selectedProjectId = null) {
    const select = document.getElementById('invoice-project-select');
    select.innerHTML = '<option value="">Loading...</option>';
    select.disabled = true;

    if (!clientId) {
        select.innerHTML = '<option value="">Select Client First</option>';
        select.disabled = false;
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/crm/clients/${clientId}/projects`);
        const projects = await res.json();

        if (projects.length === 0) {
            select.innerHTML = '<option value="">No projects found for client</option>';
        } else {
            let html = '<option value="">Select Project...</option>';
            projects.forEach(p => {
                const isSel = (p.id == selectedProjectId) ? 'selected' : '';
                html += `<option value="${p.id}" ${isSel}>${p.name} (${p.status})</option>`;
            });
            select.innerHTML = html;

            // Auto-select if only one project and we are creating new
            if (projects.length === 1 && !selectedProjectId) {
                select.value = projects[0].id;
            }
        }
    } catch (e) {
        console.error('Error loading projects:', e);
        select.innerHTML = '<option value="">Error loading projects</option>';
    } finally {
        select.disabled = false;
    }
}
window.loadClientProjectsForInvoice = loadClientProjectsForInvoice;
