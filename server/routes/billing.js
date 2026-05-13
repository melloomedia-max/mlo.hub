const express = require('express');
const router = express.Router();
const db = require('../database');
const gemini = require('../utils/geminiHelpers');

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

// GET /api/billing/unbilled
router.get('/unbilled', async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT c.id, c.name, SUM(tl.duration) as total_mins, STRING_AGG(tl.id::text, ',') as log_ids
            FROM time_logs tl 
            JOIN tasks t ON tl.task_id = t.id 
            JOIN clients c ON t.client_id = c.id
            WHERE tl.billed = 0 
            GROUP BY c.id, c.name 
            HAVING SUM(tl.duration) > 0
        `);
        // Note: total_mins is actually seconds (duration is in seconds). Let's convert in JSON or here
        // The query from instructions said total_mins, but schema says duration is seconds.
        // We'll rename it in the output for clarity.
        res.json(rows.map(r => ({
            clientId: r.id,
            clientName: r.name,
            totalSeconds: r.total_mins, // duration is seconds in schema
            logIds: r.log_ids.split(',').map(Number)
        })));
    } catch (error) {
        console.error('[BILLING] unbilled error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/billing/preview-invoice
router.post('/preview-invoice', async (req, res) => {
    try {
        const { clientId, hourlyRate = process.env.DEFAULT_HOURLY_RATE || 150 } = req.body;
        
        // 1. Fetch unbilled logs
        const logs = await dbAll(`
            SELECT tl.id, tl.description, tl.duration, tl.created_at, t.title as task_title
            FROM time_logs tl
            JOIN tasks t ON tl.task_id = t.id
            WHERE t.client_id = $1 AND tl.billed = 0
        `, [clientId]);

        if (logs.length === 0) return res.status(404).json({ error: "No unbilled time for client." });

        // 2. Format for Gemini
        const logData = logs.map(l => `[LogID ${l.id}] Task: ${l.task_title} | Description: ${l.description || 'No desc'} | Duration: ${Math.round(l.duration / 60)} mins`).join('\n');

        const prompt = `
You are a professional billing assistant. Here is a list of unbilled time logs for a client.
Group related tasks into clean, professional invoice line items.
The client's hourly rate is $${hourlyRate}/hour.
Return a STRICT JSON array of line items with NO markdown wrapping.
Schema: [ { "description": "...", "quantity": (in hours, e.g. 1.5), "rate": ${hourlyRate}, "amount": (quantity * rate) } ]

Time Logs:
${logData}
`;
        
        const responseText = await gemini.ask(prompt);
        let cleaned = responseText.trim();
        if (cleaned.startsWith('\`\`\`json')) cleaned = cleaned.replace(/\`\`\`json/g, '');
        if (cleaned.startsWith('\`\`\`')) cleaned = cleaned.replace(/\`\`\`/g, '');
        cleaned = cleaned.trim();

        const items = JSON.parse(cleaned);
        
        res.json({
            logIds: logs.map(l => l.id),
            items
        });

    } catch (error) {
        console.error('Preview Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/billing/create-invoice
router.post('/create-invoice', async (req, res) => {
    try {
        const { clientId, logIds, items, dueDate, issueDate, notes } = req.body;
        if (!clientId || !items || !logIds) return res.status(400).json({ error: "Missing data" });

        const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        
        // Ensure dates
        const iDate = issueDate || new Date().toISOString().split('T')[0];
        const dDate = dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // 1. Create Invoice
        const invoiceId = await dbRun(
            "INSERT INTO invoices (client_id, issue_date, due_date, status, total_amount, notes) VALUES ($1, $2, $3, 'draft', $4, $5)",
            [clientId, iDate, dDate, totalAmount, notes || "Auto-generated from time logs"]
        );

        // 2. Insert Items
        for (const item of items) {
            await dbRun(
                "INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount) VALUES ($1, $2, $3, $4, $5)",
                [invoiceId, item.description, item.quantity, item.rate, item.amount]
            );
        }

        // 3. Mark logs as billed
        if (logIds.length > 0) {
            const placeholders = logIds.map(() => '?').join(',');
            await dbRun(`UPDATE time_logs SET billed = 1 WHERE id IN (${placeholders})`, logIds);
        }

        res.json({ success: true, invoiceId });

    } catch (error) {
        console.error('Create Invoice Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
