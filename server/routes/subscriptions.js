const express = require('express');
const router = express.Router();
const db = require('../database');
const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
const { sendInvoiceEmail, sendSubscriptionCancellationEmail, sendLatePaymentWarningEmail } = require('../utils/invoiceService');

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err); else resolve(row);
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

// GET all subscriptions
router.get('/', async (req, res) => {
    try {
        const sql = `
            SELECT s.*, c.name as client_name, c.company as client_company
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            ORDER BY s.created_at DESC
        `;
        const rows = await dbAll(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET subscriptions for a specific client
router.get('/client/:id', async (req, res) => {
    try {
        const sql = `
            SELECT s.*, c.name as client_name, c.company as client_company
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            WHERE s.client_id = ?
            ORDER BY s.created_at DESC
        `;
        const rows = await dbAll(sql, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST new subscription
router.post('/', async (req, res) => {
    try {
        const { client_id, name, amount, interval, billing_day, notes } = req.body;
        
        // Calculate next billing date
        const today = new Date();
        let nextBilling = new Date(today.getFullYear(), today.getMonth(), billing_day || 1);
        if (nextBilling <= today) {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        
        const sql = `INSERT INTO subscriptions (client_id, name, amount, interval, billing_day, next_billing_date, notes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`;
        const id = await dbRun(sql, [client_id, name, amount, interval || 'monthly', billing_day || 1, nextBilling.toISOString().split('T')[0], notes]);
        
        // Log to Activity Feed
        await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES ($1, 'system', 'system', $2)", 
            [client_id, `New subscription created: ${name} ($${amount}/${interval || 'monthly'})`]);

        res.json({ id, success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE subscription
router.delete('/:id', async (req, res) => {
    try {
        const sub = await dbGet("SELECT client_id, name FROM subscriptions WHERE id = $1", [req.params.id]);
        if (sub) {
            await dbRun("DELETE FROM subscriptions WHERE id = $1", [req.params.id]);
            await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'system', 'system', ?)", 
                [sub.client_id, `Subscription cancelled: ${sub.name}`]);
            
            // Notify client
            await sendSubscriptionCancellationEmail(sub.client_id, sub.name);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST bill now (manual trigger for a specific subscription)
router.post('/:id/bill-now', async (req, res) => {
    try {
        const subId = req.params.id;
        const today = new Date().toISOString().split('T')[0];
        
        const sub = await dbGet(`
            SELECT s.*, c.email as client_email, c.name as client_name
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            WHERE s.id = ?
        `, [subId]);

        if (!sub) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        // Generate Invoice
        const issueDate = today;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        const invoiceId = await dbRun(
            "INSERT INTO invoices (client_id, issue_date, due_date, status, total_amount, notes) VALUES ($1, $2, $3, 'sent', $4, $5)",
            [sub.client_id, issueDate, dueDateStr, sub.amount, `Manual recurring billing for ${sub.name}`]
        );

        await dbRun(
            "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES ($1, $2, 1, $3, $4)",
            [invoiceId, `${sub.name} Subscription`, sub.amount, sub.amount]
        );

        await dbRun(
            "INSERT INTO subscription_invoices (subscription_id, invoice_id, billing_period_start) VALUES ($1, $2, $3)",
            [sub.id, invoiceId, issueDate]
        );

        // Update Sub next billing date
        let nextDate = new Date(sub.next_billing_date || today);
        if (sub.interval === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
        else if (sub.interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else nextDate.setMonth(nextDate.getMonth() + 1);

        await dbRun(
            "UPDATE subscriptions SET last_billing_date = $1, next_billing_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
            [issueDate, nextDate.toISOString().split('T')[0], sub.id]
        );

        await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES ($1, 'invoice', 'system', $2)", 
            [sub.client_id, `Manual subscription invoice #${invoiceId} initiated for ${sub.name}`]);

        // Send Email
        await sendInvoiceEmail(invoiceId);

        res.json({ success: true, invoiceId });
    } catch (error) {
        console.error("Manual Billing Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Cron-like endpoint to process due subscriptions
router.post('/process-due', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const due = await dbAll(`
            SELECT s.*, c.email as client_email, c.name as client_name
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            WHERE s.status = 'active' AND (s.next_billing_date <= ? OR s.next_billing_date IS NULL)
        `, [today]);

        const processed = [];
        for (const sub of due) {
            // 1. Create Invoice
            const issueDate = today;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7); // 7 day grace period
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
            let nextDate = new Date(sub.next_billing_date || today);
            if (sub.interval === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);
            else if (sub.interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else nextDate.setMonth(nextDate.getMonth() + 1); // default monthly

            await dbRun(
                "UPDATE subscriptions SET last_billing_date = ?, next_billing_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [issueDate, nextDate.toISOString().split('T')[0], sub.id]
            );

            // 5. Log activity
            await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'invoice', 'system', ?)", 
                [sub.client_id, `Automated recurring invoice #${invoiceId} generated for ${sub.name}`]);

            // 6. Send Email
            try {
                await sendInvoiceEmail(invoiceId);
            } catch (emailErr) {
                console.error(`Failed to send email for subscription invoice #${invoiceId}:`, emailErr.message);
            }

            processed.push({ subId: sub.id, invoiceId });
        }

        res.json({ success: true, processed });
    } catch (error) {
        console.error("Subscription Processing Error:", error);
        res.status(500).json({ error: error.message });
    }
});



// POST send late payment warning
router.post('/invoices/:id/warning', async (req, res) => {
    try {
        await sendLatePaymentWarningEmail(req.params.id);
        res.json({ success: true, message: 'Warning email sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST resend subscription invoice
router.post('/invoices/:id/resend', async (req, res) => {
    try {
        await sendInvoiceEmail(req.params.id);
        res.json({ success: true, message: 'Invoice resent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET subscription invoices for a specific subscription
router.get('/:id/invoices', async (req, res) => {
    try {
        const sql = `
            SELECT i.*, si.billing_period_start, si.billing_period_end
            FROM invoices i
            JOIN subscription_invoices si ON i.id = si.invoice_id
            WHERE si.subscription_id = ?
            ORDER BY i.issue_date DESC
        `;
        const rows = await dbAll(sql, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
