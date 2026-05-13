// One-time admin endpoint to restore data from recovered-data.json
// POST /api/admin/restore-data
// Accepts JSON file or reads from /app/recovered-data.json

const fs = require('fs');
const path = require('path');

module.exports = function(app, db, requireAdmin) {
    app.post('/api/admin/restore-data', requireAdmin, async (req, res) => {
        try {
            console.log('[RESTORE] Starting data restore...');
            
            // Try to get data from request body first, then fallback to file
            let data = req.body;
            if (!data || Object.keys(data).length === 0) {
                const filePath = path.join(__dirname, '../recovered-data.json');
                if (fs.existsSync(filePath)) {
                    console.log('[RESTORE] Reading from file:', filePath);
                    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } else {
                    return res.status(400).json({ error: 'No data provided and no file found at /app/recovered-data.json' });
                }
            }

            const results = {};
            
            // Disable foreign key checks and use deferred constraints
            console.log('[RESTORE] Setting deferred constraints...');
            await db.query('SET CONSTRAINTS ALL DEFERRED');
            
            // Tables to restore in dependency order (parents before children)
            const tablesToRestore = [
                'clients',
                'client_notes',
                'client_businesses',
                'client_communications',
                'projects',
                'invoices',
                'invoice_items',
                'invoice_payments',
                'subscriptions',
                'subscription_invoices',
                'time_logs',
                'tasks',
                'email_templates',
                'sms_templates',
                'campaign_sends',
                'campaign_analytics',
                'portal_links'
            ];

            for (const tableName of tablesToRestore) {
                if (!data[tableName] || !Array.isArray(data[tableName]) || data[tableName].length === 0) {
                    console.log(`[RESTORE] Skipping ${tableName} (no data)`);
                    results[tableName] = { inserted: 0, skipped: 0, errors: 0 };
                    continue;
                }

                console.log(`[RESTORE] Processing ${tableName}: ${data[tableName].length} rows`);
                let inserted = 0;
                let skipped = 0;
                let errors = 0;
                let firstError = null;

                for (const row of data[tableName]) {
                    try {
                        // Get column names and values
                        const columns = Object.keys(row);
                        const values = Object.values(row);
                        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                        
                        // Build INSERT with ON CONFLICT DO NOTHING
                        const sql = `
                            INSERT INTO ${tableName} (${columns.join(', ')})
                            VALUES (${placeholders})
                            ON CONFLICT (id) DO NOTHING
                        `;
                        
                        const result = await db.query(sql, values);
                        
                        // Check if row was actually inserted (rowCount > 0) or skipped
                        if (result.rowCount > 0) {
                            inserted++;
                        } else {
                            skipped++;
                        }
                    } catch (err) {
                        console.error(`[RESTORE] ${tableName} insert error:`, err.message);
                        console.error(`[RESTORE] ${tableName} SQL:`, `INSERT INTO ${tableName} (${Object.keys(row).join(', ')})`);
                        if (!firstError) {
                            firstError = err.message;
                        }
                        errors++;
                    }
                }

                // Update sequence for this table
                try {
                    const seqSql = `
                        SELECT setval(
                            pg_get_serial_sequence('${tableName}', 'id'), 
                            (SELECT MAX(id) FROM ${tableName})
                        )
                    `;
                    await db.query(seqSql);
                    console.log(`[RESTORE] Updated sequence for ${tableName}`);
                } catch (err) {
                    console.error(`[RESTORE] Error updating sequence for ${tableName}:`, err.message);
                }

                results[tableName] = { inserted, skipped, errors, firstError };
            }

            console.log('[RESTORE] Data restore complete');
            res.json({
                success: true,
                message: 'Data restore complete',
                results
            });

        } catch (err) {
            console.error('[RESTORE] Fatal error:', err);
            res.status(500).json({ error: err.message });
        }
    });
};
