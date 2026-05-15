// TEMPORARY: Bypass route for automated restore - DELETE AFTER USE
module.exports = function(app, db) {
    app.post('/api/restore-bypass-temp', async (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            
            console.log('[RESTORE-BYPASS] Starting data restore...');
            
            const filePath = path.join(__dirname, '../recovered-data.json');
            if (!fs.existsSync(filePath)) {
                return res.status(400).json({ error: 'File not found' });
            }
            
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const results = {};
            
            await db.query('SET CONSTRAINTS ALL DEFERRED');
            
            const tablesToRestore = [
                'clients', 'client_notes', 'client_businesses', 'client_communications',
                'projects', 'invoices', 'invoice_items', 'invoice_payments',
                'subscriptions', 'subscription_invoices', 'time_logs', 'tasks',
                'email_templates', 'sms_templates', 'campaign_sends',
                'campaign_analytics', 'portal_links'
            ];

            for (const tableName of tablesToRestore) {
                if (!data[tableName] || !Array.isArray(data[tableName]) || data[tableName].length === 0) {
                    results[tableName] = { inserted: 0, skipped: 0, errors: 0 };
                    continue;
                }

                let inserted = 0, skipped = 0, errors = 0, firstError = null;

                for (const row of data[tableName]) {
                    try {
                        const columns = Object.keys(row);
                        const values = Object.values(row);
                        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                        
                        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
                        const result = await db.query(sql, values);
                        
                        if (result.rowCount > 0) inserted++;
                        else skipped++;
                    } catch (err) {
                        console.error(`[RESTORE] ${tableName}:`, err.message);
                        if (!firstError) firstError = err.message;
                        errors++;
                    }
                }

                try {
                    await db.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), (SELECT MAX(id) FROM ${tableName}))`);
                } catch (err) {
                    console.error(`[RESTORE] ${tableName} sequence:`, err.message);
                }

                results[tableName] = { inserted, skipped, errors, firstError };
            }

            res.json({ success: true, results });
        } catch (err) {
            console.error('[RESTORE] Fatal:', err);
            res.status(500).json({ error: err.message });
        }
    });
};
