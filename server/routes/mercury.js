const express = require('express');
const router = express.Router();
const db = require('../database');

/**
 * Mercury Banking Integration
 * 
 * Syncs invoices and transactions from Mercury bank account
 * Requires MERCURY_API_TOKEN environment variable
 * 
 * Endpoints:
 * - GET /api/mercury/sync-transactions - Fetch recent transactions and create invoices
 * - GET /api/mercury/accounts - List Mercury accounts
 */

const MERCURY_API_BASE = 'https://api.mercury.com/api/v1';

// Helper to make Mercury API requests
async function mercuryRequest(endpoint, method = 'GET', body = null) {
    const token = process.env.MERCURY_API_TOKEN;
    if (!token) {
        throw new Error('MERCURY_API_TOKEN not configured');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${MERCURY_API_BASE}${endpoint}`, options);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mercury API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
}

// GET /api/mercury/accounts - List Mercury accounts
router.get('/accounts', async (req, res) => {
    try {
        const data = await mercuryRequest('/accounts');
        res.json(data);
    } catch (error) {
        console.error('[MERCURY] Error fetching accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/mercury/sync-transactions - Sync transactions to invoices
router.get('/sync-transactions', async (req, res) => {
    try {
        const { accountId, limit = 50, startDate } = req.query;
        
        if (!accountId) {
            return res.status(400).json({ error: 'accountId query parameter required' });
        }

        // Build query parameters
        const params = new URLSearchParams({ limit: limit.toString() });
        if (startDate) params.append('start', startDate);

        // Fetch transactions from Mercury
        console.log(`[MERCURY] Fetching transactions for account ${accountId}...`);
        const data = await mercuryRequest(`/accounts/${accountId}/transactions?${params.toString()}`);
        
        const transactions = data.transactions || [];
        console.log(`[MERCURY] Found ${transactions.length} transactions`);

        const results = {
            synced: 0,
            skipped: 0,
            errors: [],
            transactions: []
        };

        // Ensure external_id column exists
        try {
            await db.query(`
                ALTER TABLE invoices 
                ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE
            `);
        } catch (err) {
            console.log('[MERCURY] Column external_id might already exist:', err.message);
        }

        // Process each transaction
        for (const tx of transactions) {
            try {
                // Only process credits (incoming payments)
                if (tx.amount <= 0) {
                    results.skipped++;
                    continue;
                }

                // Check if transaction already exists
                const existing = await db.query(
                    'SELECT id FROM invoices WHERE external_id = $1',
                    [`mercury_${tx.id}`]
                );

                if (existing.rows.length > 0) {
                    results.skipped++;
                    continue;
                }

                // Try to match to existing client by counterparty name
                let clientId = null;
                if (tx.counterpartyName) {
                    const clientMatch = await db.query(
                        'SELECT id FROM clients WHERE company ILIKE $1 OR name ILIKE $1 LIMIT 1',
                        [`%${tx.counterpartyName}%`]
                    );
                    clientId = clientMatch.rows[0]?.id || null;
                }

                // Create invoice record for the transaction
                const result = await db.query(`
                    INSERT INTO invoices 
                    (client_id, external_id, issue_date, due_date, status, total_amount, amount_paid, notes, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, 'paid', $5, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    RETURNING id
                `, [
                    clientId,
                    `mercury_${tx.id}`,
                    tx.postedAt || tx.createdAt,
                    tx.postedAt || tx.createdAt,
                    tx.amount,
                    `Mercury transaction: ${tx.note || tx.counterpartyName || 'Payment received'}`
                ]);

                results.synced++;
                results.transactions.push({
                    id: result.rows[0].id,
                    mercuryId: tx.id,
                    amount: tx.amount,
                    counterparty: tx.counterpartyName,
                    date: tx.postedAt || tx.createdAt
                });

                console.log(`[MERCURY] Synced transaction ${tx.id} → invoice ${result.rows[0].id}`);

            } catch (error) {
                console.error(`[MERCURY] Error processing transaction ${tx.id}:`, error);
                results.errors.push({
                    transactionId: tx.id,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('[MERCURY] Sync error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
