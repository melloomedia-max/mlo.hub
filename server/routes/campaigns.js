const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper for DB calls
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
            if (err) reject(err); else resolve(this.lastID || this.changes);
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

// Get all campaigns
router.get('/', async (req, res) => {
    try {
        const sql = `
            SELECT campaigns.*, 
                   (SELECT COUNT(*) FROM campaign_enrollments WHERE campaign_id = campaigns.id AND status = 'active') as enrollment_count
            FROM campaigns 
            ORDER BY id DESC
        `;
        const campaigns = await dbAll(sql);
        for (const c of campaigns) {
            c.steps = JSON.parse(c.steps || '[]');
            c.flow_data = JSON.parse(c.flow_data || 'null');
        }
        res.json(campaigns);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Campaign Templates (Flow structures)
router.get('/templates', async (req, res) => {
    try {
        res.json([]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get single campaign
router.get('/:id', async (req, res) => {
    try {
        const campaign = await dbGet('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
        if (campaign) {
            campaign.steps = JSON.parse(campaign.steps || '[]');
            campaign.flow_data = JSON.parse(campaign.flow_data || 'null');
            res.json(campaign);
        } else {
            res.status(404).json({ error: 'Campaign not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create campaign
router.post('/', async (req, res) => {
    const { name, description, trigger, flow_data, steps } = req.body;
    try {
        const id = await dbRun('INSERT INTO campaigns (name, description, trigger, flow_data, steps, status) VALUES ($1, $2, $3, $4, $5, $6)', 
            [name, description, trigger, JSON.stringify(flow_data || null), JSON.stringify(steps || []), 'draft']);
        res.json({ id, name, trigger });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update campaign
router.put('/:id', async (req, res) => {
    const { name, description, trigger, flow_data, steps, status } = req.body;
    try {
        await dbRun('UPDATE campaigns SET name = $1, description = $2, trigger = $3, flow_data = $4, steps = $5, status = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7', 
            [name, description, trigger, JSON.stringify(flow_data || null), JSON.stringify(steps || []), status || 'draft', req.params.id]);
        res.json({ message: 'Campaign updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Email Templates
router.get('/templates/email', async (req, res) => {
    try {
        const templates = await dbAll('SELECT * FROM email_templates ORDER BY name ASC');
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/templates/email', async (req, res) => {
    const { name, subject, body, category } = req.body;
    try {
        const id = await dbRun('INSERT INTO email_templates (name, subject, body, category) VALUES ($1, $2, $3, $4)', 
            [name, subject, body, category]);
        res.json({ id, name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/templates/email/:id', async (req, res) => {
    const { name, subject, body, category } = req.body;
    try {
        await dbRun('UPDATE email_templates SET name = $1, subject = $2, body = $3, category = $4 WHERE id = $5', 
            [name, subject, body, category, req.params.id]);
        res.json({ message: 'Template updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/templates/email/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
        res.json({ message: 'Template deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// SMS Templates
router.get('/templates/sms', async (req, res) => {
    try {
        const templates = await dbAll('SELECT * FROM sms_templates ORDER BY name ASC');
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/templates/sms', async (req, res) => {
    const { name, body } = req.body;
    try {
        const id = await dbRun('INSERT INTO sms_templates (name, body) VALUES ($1, $2)', 
            [name, body]);
        res.json({ id, name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/templates/sms/:id', async (req, res) => {
    const { name, body } = req.body;
    try {
        await dbRun('UPDATE sms_templates SET name = $1, body = $2 WHERE id = $3', 
            [name, body, req.params.id]);
        res.json({ message: 'Template updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/templates/sms/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM sms_templates WHERE id = $1', [req.params.id]);
        res.json({ message: 'Template deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Analytics
router.get('/:id/analytics', async (req, res) => {
    try {
        const analytics = await dbAll('SELECT * FROM campaign_analytics WHERE campaign_id = $1 ORDER BY date DESC LIMIT 30', [req.params.id]);
        const sends = await dbAll('SELECT * FROM campaign_sends WHERE campaign_id = $1 ORDER BY sent_at DESC LIMIT 100', [req.params.id]);
        res.json({ daily: analytics, recent_sends: sends });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete campaign
router.delete('/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
        await dbRun('DELETE FROM campaign_enrollments WHERE campaign_id = $1', [req.params.id]);
        res.json({ message: 'Campaign and enrollments deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
