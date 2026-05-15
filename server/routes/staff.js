const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const { hashPassword } = require('../utils/auth');

// Get all staff members with permissions
router.get('/', async (req, res) => {
    try {
        const staff = await db.allAsync(
            `SELECT id, name, email, phone, role, status, permissions, google_id, last_login, created_at 
             FROM staff 
             ORDER BY 
                CASE role 
                    WHEN 'admin' THEN 1 
                    WHEN 'manager' THEN 2 
                    ELSE 3 
                END, 
                name ASC`
        );
        res.json(staff);
    } catch (err) {
        console.error('[STAFF] Error:', err);
        res.status(500).json({ error: err.message });
    }
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
    const sql = 'INSERT INTO staff (name, email, phone, role, password, status) VALUES ($1, $2, $3, $4, $5, $6)';
    db.run(sql, [name, email, phone || '', role || 'staff', hashed, 'active'], function(err) {
        if (err) { console.error("[STAFF] Error:", err); return res.status(500).json({ error: err.message }); }
        res.json({ id: this.lastID, name, email, role });
    });
});

// Update staff member
router.put('/:id', async (req, res) => {
    try {
        const { name, email, phone, role, password, status, permissions } = req.body;
        
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            params.push(email);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(phone);
        }
        if (role !== undefined) {
            updates.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        if (status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            params.push(status);
        }
        if (permissions !== undefined) {
            updates.push(`permissions = $${paramIndex++}`);
            params.push(JSON.stringify(permissions));
        }
        if (password) {
            updates.push(`password = $${paramIndex++}`);
            params.push(hashPassword(password));
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(req.params.id);

        const sql = `UPDATE staff SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
        await db.runAsync(sql, params);
        
        res.json({ success: true, message: 'Staff member updated' });
    } catch (err) {
        console.error('[STAFF] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete staff member
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM staff WHERE id = $1', [req.params.id], function(err) {
        if (err) { console.error("[STAFF] Error:", err); return res.status(500).json({ error: err.message }); }
        res.json({ message: 'Staff member removed' });
    });
});

module.exports = router;
