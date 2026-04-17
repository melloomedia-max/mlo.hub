const express = require('express');
const router = express.Router();
const db = require('../database');

// Get all staff members
router.get('/', (req, res) => {
    const sql = 'SELECT id, name, email, phone, role FROM staff ORDER BY name ASC';
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

module.exports = router;
