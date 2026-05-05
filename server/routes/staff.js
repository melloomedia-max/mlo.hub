const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const { hashPassword } = require('../utils/auth');

// Get all staff members
router.get('/', (req, res) => {
    const sql = 'SELECT id, name, email, phone, role, status FROM staff ORDER BY name ASC';
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create staff member
router.post('/', (req, res) => {
    console.log('[STAFF-CREATE] Session check:', {
        isAuthenticated: req.session?.isAuthenticated,
        userEmail: req.session?.user?.email,
        newStaffEmail: req.body.email
    });
    const { name, email, phone, role, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });

    const hashed = hashPassword(password);
    const sql = 'INSERT INTO staff (name, email, phone, role, password, status) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [name, email, phone || '', role || 'staff', hashed, 'active'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, email, role });
    });
});

// Update staff member
router.put('/:id', (req, res) => {
    const { name, email, phone, role, password, status } = req.body;
    
    let sql = 'UPDATE staff SET name = ?, email = ?, phone = ?, role = ?, status = ?';
    const params = [name, email, phone, role, status];

    if (password) {
        sql += ', password = ?';
        params.push(hashPassword(password));
    }

    sql += ' WHERE id = ?';
    params.push(req.params.id);

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Staff member updated' });
    });
});

// Delete staff member
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM staff WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Staff member removed' });
    });
});

module.exports = router;
