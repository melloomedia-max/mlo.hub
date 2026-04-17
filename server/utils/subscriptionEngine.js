const db = require('../database');
const { sendInvoiceEmail } = require('./invoiceService');

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err); else resolve(this.lastID);
        });
    });
}

async function processSubscriptions() {
    try {
        console.log('[Subscription] Checking for due recurring billing...');
        const today = new Date().toISOString().split('T')[0];
        
        // Find active subscriptions due for billing
        const due = await dbAll(`
            SELECT s.*, c.name as client_name
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            WHERE s.status = 'active' AND (s.next_billing_date <= ? OR s.next_billing_date IS NULL)
        `, [today]);

        for (const sub of due) {
            console.log(`[Subscription] Billing ${sub.name} for client ${sub.client_name}`);
            
            // 1. Create Invoice
            const issueDate = today;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            const dueDateStr = dueDate.toISOString().split('T')[0];

            const invoiceId = await dbRun(
                "INSERT INTO invoices (client_id, issue_date, due_date, status, total_amount, notes) VALUES (?, ?, ?, 'sent', ?, ?)",
                [sub.client_id, issueDate, dueDateStr, sub.amount, `Recurring billing for ${sub.name}`]
            );

            // 2. Insert Item
            await dbRun(
                "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES (?, ?, 1, ?, ?)",
                [invoiceId, `${sub.name} Subscription`, sub.amount, sub.amount]
            );

            // 3. Link Sub to Invoice
            await dbRun(
                "INSERT INTO subscription_invoices (subscription_id, invoice_id, billing_period_start) VALUES (?, ?, ?)",
                [sub.id, invoiceId, issueDate]
            );

            // 4. Update Sub next billing date
            let nextDateStr = sub.next_billing_date || today;
            let nextDate = new Date(nextDateStr);
            
            if (sub.interval === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
            else if (sub.interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else nextDate.setMonth(nextDate.getMonth() + 1); // default monthly

            await dbRun(
                "UPDATE subscriptions SET last_billing_date = ?, next_billing_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [issueDate, nextDate.toISOString().split('T')[0], sub.id]
            );

            // 5. Log to Activity Feed
            await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'invoice', 'system', ?)", 
                [sub.client_id, `Automated recurring invoice #${invoiceId} generated for ${sub.name}`]);

            // 6. Send Email
            try {
                await sendInvoiceEmail(invoiceId);
                console.log(`[Subscription] Email sent for invoice #${invoiceId}`);
            } catch (emailErr) {
                console.error(`[Subscription] Failed to send email for invoice #${invoiceId}:`, emailErr.message);
            }
        }
    } catch (e) {
        console.error('[Subscription Engine Error]', e);
    }
}

module.exports = { processSubscriptions };
