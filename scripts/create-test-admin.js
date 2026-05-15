#!/usr/bin/env node

/**
 * Create Test Admin Account
 * 
 * Creates a test admin account for development and testing.
 * 
 * Usage:
 *   node scripts/create-test-admin.js
 * 
 * Environment:
 *   DATABASE_URL - PostgreSQL connection string
 * 
 * Credentials:
 *   Email: test@melloo.com
 *   Password: TestAdmin123!
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTestAdmin() {
  const client = await pool.connect();
  
  try {
    console.log('[CREATE-ADMIN] Connecting to database...');
    
    // Check if test admin already exists
    const existing = await client.query(
      "SELECT id FROM staff WHERE email = $1",
      ['test@melloo.com']
    );
    
    if (existing.rows.length > 0) {
      console.log('⚠️  Test admin already exists (test@melloo.com)');
      console.log('   Use password: TestAdmin123!');
      return;
    }
    
    // Hash password
    const password = 'TestAdmin123!';
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // Insert test admin
    await client.query(
      `INSERT INTO staff (name, email, password, role, status)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Test Admin', 'test@melloo.com', hashedPassword, 'admin', 'active']
    );
    
    console.log('✅ Test admin created successfully!');
    console.log('');
    console.log('   Email: test@melloo.com');
    console.log('   Password: TestAdmin123!');
    console.log('');
    console.log('   Login at: https://hub.melloo.media/login');
    
  } catch (error) {
    console.error('❌ Failed to create test admin:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTestAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
