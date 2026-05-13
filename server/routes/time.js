const express = require('express');
const router = express.Router();
const db = require('../database');

// Get all logs (optional filter by task)
router.get('/', (req, res) => {
    const { task_id } = req.query;
    let sql = 'SELECT * FROM time_logs ORDER BY start_time DESC';
    let params = [];

    if (task_id) {
        sql = 'SELECT * FROM time_logs WHERE task_id = $1 ORDER BY start_time DESC';
        params = [task_id];
    }

    db.all(sql, params, (err, rows) => {
        if (err) { console.error("[TIME] Error:", err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Start a timer (create a log with null end_time)
router.post('/start', (req, res) => {
    const { task_id, description } = req.body;

    // Check if there's already running timer? (Optional logic, for now allow parallel or client handles it)
    // Ideally, stop any running timer first for this user (single user system simplifiction)

    const sql = `INSERT INTO time_logs (task_id, description, start_time) VALUES ($1, $2, CURRENT_TIMESTAMP)`;

    db.run(sql, [task_id, description], function (err) {
        if (err) { console.error("[TIME] Error:", err);
            res.status(500).json({ error: err.message });
            return;
        }
        // Return the new log entry
        db.get('SELECT * FROM time_logs WHERE id = $1', [this.lastID], (err, row) => {
            if (err) { console.error("[TIME] Error:", err); return res.json({ id: this.lastID }); // Fallback
            res.json(row);
        });
    });
});

// Stop a timer
router.post('/stop', (req, res) => {
    const { id } = req.body; // Log ID to stop
    const endTime = new Date().toISOString();

    // Calculate duration
    db.get('SELECT start_time FROM time_logs WHERE id = $1', [id], (err, row) => {
        if (err || !row) {
            res.status(404).json({ error: 'Timer not found' });
            return;
        }

        const start = new Date(row.start_time + 'Z'); // Add Z to ensure UTC if sqlite returns naive string or handle timezone
        // Actual SQlite CURRENT_TIMESTAMP is UTC. JS Date() is local. 
        // Safest is to let DB calculate or use JS for both. 
        // Let's use JS for both start and end to match.
        // But we inserted with CURRENT_TIMESTAMP...

        // Let's simplify: Update end_time = CURRENT_TIMESTAMP, then calculate duration in SQL or next fetch?
        // Better: pass end_time from client or let server handle.

        const sql = `
        UPDATE time_logs 
        SET end_time = CURRENT_TIMESTAMP,
            duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - start_time))::INTEGER
        WHERE id = $1
      `;

        db.run(sql, [id], function (err) {
            if (err) { console.error("[TIME] Error:", err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ message: 'Timer stopped', id });
        });
    });
});

// Check for running timer
router.get('/running', (req, res) => {
    db.get("SELECT * FROM time_logs WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1", [], (err, row) => {
        if (err) { console.error("[TIME] Error:", err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || null);
    });
});

module.exports = router;
