const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper for Promisified DB
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

// GET /api/revenue/forecast
router.get('/forecast', async (req, res) => {
    try {
        const hourlyRate = process.env.DEFAULT_HOURLY_RATE || 150;

        // 1. Outstanding by bucket
        const unpaidInvoices = await dbAll(`
            SELECT 
                due_date,
                total_amount - COALESCE(amount_paid, 0) as remaining_amount
            FROM invoices
            WHERE status NOT IN ('paid', 'cancelled', 'draft') 
              AND total_amount > COALESCE(amount_paid, 0)
        `);

        let outstanding = { '30_days': 0, '60_days': 0, '90_days': 0, 'older': 0 };
        const now = new Date();
        const days30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const days60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        const days90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        unpaidInvoices.forEach(inv => {
            const due = new Date(inv.due_date);
            if (due <= days30) outstanding['30_days'] += inv.remaining_amount;
            else if (due <= days60) outstanding['60_days'] += inv.remaining_amount;
            else if (due <= days90) outstanding['90_days'] += inv.remaining_amount;
            else outstanding['older'] += inv.remaining_amount;
        });

        // 2. Monthly trend
        const monthlyTrend = await dbAll(`
            SELECT TO_CHAR(created_at, 'YYYY-MM') as month, SUM(amount) as revenue 
            FROM invoice_payments 
            GROUP BY month 
            ORDER BY month DESC 
            LIMIT 6
        `);
        monthlyTrend.reverse(); // Chronological

        // 3. Avg payment cycle
        const cycleData = await dbGet(`
            SELECT AVG(julianday(ip.created_at) - julianday(i.issue_date)) as avgDays
            FROM invoice_payments ip
            JOIN invoices i ON ip.invoice_id = i.id
        `);
        const avgPaymentCycle = cycleData.avgDays ? Math.round(cycleData.avgDays) : 0;

        // 4. Unbilled hours value
        const unbilledData = await dbGet(`
            SELECT SUM(duration) as total_seconds 
            FROM time_logs 
            WHERE billed = 0
        `);
        
        let unbilledValue = 0;
        if (unbilledData.total_seconds) {
            unbilledValue = (unbilledData.total_seconds / 3600) * hourlyRate;
        }

        res.json({
            outstanding,
            monthlyTrend,
            avgPaymentCycle,
            unbilledValue
        });

    } catch (error) {
        console.error('Forecast error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
