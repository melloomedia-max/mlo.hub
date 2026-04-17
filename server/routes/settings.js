const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const fs = require('fs');

// ─── Promisified DB helpers ─────────────────────────────
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
            if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// ═══════════════════════════════════════════════════════════
// PORTAL TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════

// Regenerate all client portal tokens
router.post('/regenerate-tokens', async (req, res) => {
    try {
        await dbRun("UPDATE clients SET portal_token = hex(randomblob(24))");
        const result = await dbGet("SELECT COUNT(*) as count FROM clients");
        res.json({ success: true, count: result.count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Regenerate single client token
router.post('/regenerate-token/:clientId', async (req, res) => {
    try {
        await dbRun("UPDATE clients SET portal_token = hex(randomblob(24)) WHERE id = ?", [req.params.clientId]);
        const client = await dbGet("SELECT portal_token FROM clients WHERE id = ?", [req.params.clientId]);
        res.json({ success: true, token: client.portal_token });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// DATABASE TOOLS
// ═══════════════════════════════════════════════════════════

// Optimize database (VACUUM + ANALYZE)
router.post('/optimize-db', async (req, res) => {
    try {
        await dbRun("VACUUM");
        await dbRun("ANALYZE");
        res.json({ success: true, message: 'Database optimized successfully! VACUUM + ANALYZE complete.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export database backup
router.get('/export-db', async (req, res) => {
    try {
        const dbPath = path.join(__dirname, '../../agency.db');
        const backupDir = path.join(__dirname, '../../tmp');
        
        // Ensure backup directory exists
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupPath = path.join(backupDir, `agency_backup_${timestamp}.db`);
        
        fs.copyFileSync(dbPath, backupPath);
        
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        res.json({ 
            success: true, 
            message: `Backup saved! (${sizeMB} MB) → tmp/agency_backup_${timestamp}.db`,
            path: backupPath,
            size: stats.size
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Database statistics
router.get('/db-stats', async (req, res) => {
    try {
        const tables = [
            'clients', 'projects', 'tasks', 'meetings', 'invoices',
            'invoice_items', 'invoice_payments', 'subscriptions',
            'campaigns', 'campaign_enrollments', 'campaign_sends',
            'client_notes', 'client_businesses', 'client_communications',
            'time_logs', 'email_templates', 'sms_templates',
            'archive_log', 'campaign_sends_archive'
        ];

        const stats = {};
        for (const table of tables) {
            try {
                const row = await dbGet(`SELECT COUNT(*) as count FROM ${table}`);
                stats[table] = row.count;
            } catch {
                // Table might not exist
                stats[table] = 0;
            }
        }

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════
// DANGER ZONE ACTIONS
// ═══════════════════════════════════════════════════════════

// Purge local archived data
router.post('/danger/purge-archives', async (req, res) => {
    try {
        const result = await dbRun("DELETE FROM campaign_sends_archive");
        res.json({ 
            success: true, 
            message: `Purged ${result.changes} archived records from local database. Drive copies are preserved.` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Reset all portal tokens
router.post('/danger/reset-tokens', async (req, res) => {
    try {
        const result = await dbRun("UPDATE clients SET portal_token = hex(randomblob(24))");
        res.json({ 
            success: true, 
            message: `Reset ${result.changes} portal tokens. Old links are now invalid.` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Clear campaign history
router.post('/danger/clear-campaigns', async (req, res) => {
    try {
        const sends = await dbRun("DELETE FROM campaign_sends");
        const enrollments = await dbRun("DELETE FROM campaign_enrollments");
        const analytics = await dbRun("DELETE FROM campaign_analytics");
        const archived = await dbRun("DELETE FROM campaign_sends_archive");
        
        res.json({ 
            success: true, 
            message: `Cleared ${sends.changes} sends, ${enrollments.changes} enrollments, ${analytics.changes} analytics rows, ${archived.changes} archived sends. Campaign templates preserved.` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Factory reset (!!!)
router.post('/danger/factory-reset', async (req, res) => {
    try {
        const tables = [
            'client_notes', 'client_businesses', 'client_communications',
            'project_attachments', 'projects',
            'invoice_items', 'invoice_payments', 'invoices',
            'subscription_invoices', 'subscriptions',
            'campaign_sends', 'campaign_sends_archive', 'campaign_enrollments',
            'campaign_analytics', 'campaigns',
            'email_templates', 'sms_templates',
            'time_logs', 'tasks', 'meetings',
            'archive_log', 'unsubscribe_list', 'email_preferences', 'segments',
            'clients'
        ];

        for (const table of tables) {
            try {
                await dbRun(`DELETE FROM ${table}`);
            } catch {
                // Table might not exist, skip
            }
        }

        res.json({ 
            success: true, 
            message: 'Factory reset complete. All data has been permanently deleted.' 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
