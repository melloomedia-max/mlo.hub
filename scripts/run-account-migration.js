#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    console.log('[MIGRATION] Starting account management migration...');
    
    const sqlPath = path.join(__dirname, '../server/migrations/add-account-management-columns.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        await pool.query(sql);
        console.log('[MIGRATION] ✅ Migration completed successfully!');
        console.log('[MIGRATION] Added columns:');
        console.log('  - staff.google_id');
        console.log('  - staff.permissions');
        console.log('  - staff.invited_by');
        console.log('  - staff.last_login');
        console.log('  - clients.portal_permissions');
        console.log('[MIGRATION] Created table: staff_invites');
    } catch (error) {
        console.error('[MIGRATION] ❌ Migration failed:');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('Code:', error.code);
        console.error('Detail:', error.detail);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
