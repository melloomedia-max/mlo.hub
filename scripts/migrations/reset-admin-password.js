/**
 * ONE-TIME MIGRATION: Reset admin password to 'melloo'
 * 
 * Run this on Railway via:
 * node scripts/migrations/reset-admin-password.js
 * 
 * This restores the original password for access recovery.
 * DELETE THIS FILE after running.
 */

const path = require('path');
const dbPath = path.join(__dirname, '../../agency.db');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbPath);

const ADMIN_EMAIL = 'melloomedia@gmail.com';
// Pre-hashed 'melloo' password
const PASSWORD_HASH = '961eed1cfdbfe6a9347d0158ffac98e9:6073852931417da04e6750d15b41a945f247cf69101594c146709abee0d21efb3bd82c7b33e14eb78d2e3fd6c56c97b84c44e50af72e73fffe5ebe3b725fad19';

console.log('[MIGRATION] Resetting admin password...');

db.run(
    'UPDATE staff SET password = ? WHERE email = ?',
    [PASSWORD_HASH, ADMIN_EMAIL],
    function(err) {
        if (err) {
            console.error('[MIGRATION] ❌ Failed:', err.message);
            process.exit(1);
        }
        if (this.changes === 0) {
            console.log('[MIGRATION] ⚠️  No admin found with email:', ADMIN_EMAIL);
            process.exit(1);
        }
        console.log('[MIGRATION] ✅ Admin password reset successfully');
        console.log('[MIGRATION] Email:', ADMIN_EMAIL);
        console.log('[MIGRATION] Password: melloo');
        console.log('[MIGRATION]');
        console.log('[MIGRATION] ⚠️  IMPORTANT: Change this password via Settings → Security ASAP');
        console.log('[MIGRATION] ⚠️  DELETE THIS SCRIPT after running');
        db.close();
        process.exit(0);
    }
);
