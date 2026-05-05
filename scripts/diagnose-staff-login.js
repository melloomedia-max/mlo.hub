#!/usr/bin/env node
/**
 * Diagnose staff login issues
 * Checks staff table and verifies password hash
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { hashPassword, verifyPassword } = require('../server/utils/auth');

const dbPath = path.join(__dirname, '../agency.db');
const db = new sqlite3.Database(dbPath);

const adminEmail = process.env.ADMIN_EMAIL || 'melloomedia@gmail.com';
const appPassword = process.env.APP_PASSWORD;

console.log('\n=== Staff Login Diagnostic ===\n');
console.log(`Admin email: ${adminEmail}`);
console.log(`APP_PASSWORD set: ${appPassword ? 'YES' : 'NO'}`);
console.log(`APP_PASSWORD value: ${appPassword ? '[REDACTED]' : 'MISSING'}`);

db.get("SELECT * FROM staff WHERE email = ?", [adminEmail], (err, row) => {
  if (err) {
    console.error('\n❌ Database error:', err.message);
    db.close();
    return;
  }

  if (!row) {
    console.log(`\n❌ No staff record found for ${adminEmail}`);
    db.close();
    return;
  }

  console.log('\n✓ Staff record found:');
  console.log(`  ID: ${row.id}`);
  console.log(`  Name: ${row.name}`);
  console.log(`  Email: ${row.email}`);
  console.log(`  Role: ${row.role}`);
  console.log(`  Status: ${row.status}`);
  console.log(`  Password hash: ${row.password ? row.password.substring(0, 30) + '...' : 'NULL'}`);
  console.log(`  Created: ${row.created_at}`);
  console.log(`  Updated: ${row.updated_at}`);

  if (!appPassword) {
    console.log('\n⚠️  APP_PASSWORD not set in environment');
    db.close();
    return;
  }

  // Test password verification
  const matches = verifyPassword(appPassword, row.password);
  console.log(`\n🔐 Password verification:`);
  console.log(`  APP_PASSWORD matches hash: ${matches ? '✅ YES' : '❌ NO'}`);

  if (!matches) {
    console.log(`\n❌ PASSWORD MISMATCH DETECTED!`);
    console.log(`\n🔧 To fix this, you need to update the staff password hash.`);
    console.log(`\nOption 1: Use Railway shell:`);
    console.log(`  railway shell`);
    console.log(`  node scripts/reset-staff-password.js`);
    console.log(`\nOption 2: Run this locally (if APP_PASSWORD is set):`);
    console.log(`  node scripts/reset-staff-password.js`);
  } else {
    console.log(`\n✅ Password is correct! Login should work.`);
  }

  db.close();
});
