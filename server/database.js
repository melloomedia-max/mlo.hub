const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use DB_PATH from env or fall back to local agency.db
const dbPath = process.env.DB_PATH || path.join(__dirname, '../agency.db');

// Ensure directory exists if DB_PATH is set to a volume mount
if (process.env.DB_PATH) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    console.log(`[DB] Creating database directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

console.log(`[DB] Using database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

// Initialize database tables
console.log("[DB] Starting database serialization/init...");
db.serialize(() => {
  console.log("[DB] Setting up tasks tables...");
  // Tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      assigned_to INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL
    )
  `);

  // Migration for existing tables
  db.run("ALTER TABLE tasks ADD COLUMN client_id INTEGER", (err) => { });
  db.run("ALTER TABLE tasks ADD COLUMN google_event_id TEXT", (err) => {
    if (!err) {
      db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_google_event_id ON tasks(google_event_id)");
    }
  });
  db.run("ALTER TABLE tasks ADD COLUMN assigned_to INTEGER", (err) => { });

  console.log("[DB] Setting up meetings tables...");
  // Meetings table
  db.run(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      meet_link TEXT,
      attendees TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrations for meetings table
  db.run("ALTER TABLE meetings ADD COLUMN google_event_id TEXT", () => { });
  db.run("ALTER TABLE meetings ADD COLUMN meet_space_name TEXT", () => { });

  console.log("[DB] Setting up CRM tables...");
  // CRM Clients table
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, -- Keeping for legacy or full name display
      first_name TEXT,
      last_name TEXT,
      birthday TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      status TEXT DEFAULT 'lead',
      notes TEXT,
      google_drive_folder_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration to add columns if they don't exist
  db.run("ALTER TABLE clients ADD COLUMN first_name TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN last_name TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN birthday TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN google_drive_folder_id TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN password TEXT", (err) => { });
  
  // Client authentication columns (for portal login + OAuth)
  db.run("ALTER TABLE clients ADD COLUMN auth_provider TEXT DEFAULT 'email'", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN google_id TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN portal_access INTEGER DEFAULT 0", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN portal_token TEXT", (err) => { });
  db.run("ALTER TABLE clients ADD COLUMN drive_folder_id TEXT", (err) => { });

  // Client Notes Thread
  db.run(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Magic Link Tokens (for passwordless client portal authentication)
  console.log("[DB] Setting up magic link tokens table...");
  db.run(`
    CREATE TABLE IF NOT EXISTS magic_link_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_magic_link_token ON magic_link_tokens(token)", (err) => { });
  db.run("CREATE INDEX IF NOT EXISTS idx_magic_link_expires ON magic_link_tokens(expires_at)", (err) => { });

  // Projects table (linked to clients)
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      budget REAL,
      deadline TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  // Migrations for projects
  db.run("ALTER TABLE projects ADD COLUMN project_folder_id TEXT", (err) => { });

  // Project Attachments table
  db.run(`
    CREATE TABLE IF NOT EXISTS project_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      thumbnail_link TEXT,
      web_view_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Time Logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration INTEGER DEFAULT 0, -- in seconds
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Feature 2: Time logs billing
  db.run("ALTER TABLE time_logs ADD COLUMN billed INTEGER DEFAULT 0", () => { });

  // Invoices table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
      total_amount REAL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
    )
  `);

  // Migration for invoices
  db.run("ALTER TABLE invoices ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => { });
  db.run("ALTER TABLE invoices ADD COLUMN project_id INTEGER", (err) => { });
  db.run("ALTER TABLE invoices ADD COLUMN amount_paid REAL DEFAULT 0", (err) => { });

  // Invoice Payments table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // Invoice Items table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      rate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // Client Businesses table
  db.run(`
    CREATE TABLE IF NOT EXISTS client_businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT,
      industry TEXT,
      website TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  console.log("[DB] Setting up campaign and automation tables...");
  // Feature 6: Drip Campaign Sequencer
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      trigger TEXT, 
      steps TEXT, 
      flow_data TEXT, 
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run("ALTER TABLE campaigns ADD COLUMN flow_data TEXT", () => { });
  db.run("ALTER TABLE campaigns ADD COLUMN description TEXT", () => { });
  db.run("ALTER TABLE campaigns ADD COLUMN status TEXT DEFAULT 'draft'", () => { });
  db.run("ALTER TABLE campaigns ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", () => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      campaign_id INTEGER,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      current_step INTEGER DEFAULT 0,
      current_node_id TEXT, 
      last_action_at DATETIME,
      next_action_at DATETIME,
      status TEXT DEFAULT 'active', 
      metadata TEXT, 
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )
  `);

  db.run("ALTER TABLE campaign_enrollments ADD COLUMN current_node_id TEXT", () => { });
  db.run("ALTER TABLE campaign_enrollments ADD COLUMN last_action_at DATETIME", () => { });
  db.run("ALTER TABLE campaign_enrollments ADD COLUMN next_action_at DATETIME", () => { });
  db.run("ALTER TABLE campaign_enrollments ADD COLUMN metadata TEXT", () => { });

  // Feature 8: CRM Subscriptions (Recurring Billing)
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      interval TEXT DEFAULT 'monthly', -- monthly, yearly, weekly
      status TEXT DEFAULT 'active', -- active, cancelled, paused
      billing_day INTEGER DEFAULT 1,
      last_billing_date TEXT,
      next_billing_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscription_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      billing_period_start TEXT,
      billing_period_end TEXT,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `);

  // CRM Communication Log (messages, emails, invoices sent)
  db.run(`
    CREATE TABLE IF NOT EXISTS client_communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      type TEXT, -- 'invoice', 'campaign', 'meeting', 'direct', 'system'
      method TEXT, -- 'email', 'sms', 'system', 'phone'
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // New Campaign System Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      variables TEXT, -- JSON array of dynamic fields
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sms_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT,
      variables TEXT, -- JSON array
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      enrollment_id INTEGER,
      client_id INTEGER,
      type TEXT, -- 'email', 'sms'
      template_id INTEGER,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      opened_at DATETIME,
      clicked_at DATETIME,
      failed_at DATETIME,
      error_message TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (enrollment_id) REFERENCES campaign_enrollments(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      date TEXT,
      sends INTEGER DEFAULT 0,
      opens INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      UNIQUE(campaign_id, date)
    )
  `);
  
  // Archive tracking table
  db.run(`
    CREATE TABLE IF NOT EXISTS archive_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_type TEXT NOT NULL, -- 'campaign_sends', 'analytics', etc.
      archive_date DATE NOT NULL,
      records_archived INTEGER,
      drive_folder_id TEXT,
      drive_file_id TEXT,
      drive_file_url TEXT,
      file_size_bytes INTEGER,
      date_range_start DATE,
      date_range_end DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Archive table for old campaign sends
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_sends_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      enrollment_id INTEGER,
      client_id INTEGER,
      node_id TEXT,
      type TEXT,
      subject TEXT,
      body TEXT,
      status TEXT,
      scheduled_for DATETIME,
      sent_at DATETIME,
      delivered_at DATETIME,
      opened_at DATETIME,
      clicked_at DATETIME,
      replied_at DATETIME,
      failed_at DATETIME,
      error_message TEXT,
      metadata TEXT,
      created_at DATETIME,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Unsubscribe list table
  db.run(`
    CREATE TABLE IF NOT EXISTS unsubscribe_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email preferences table
  db.run(`
    CREATE TABLE IF NOT EXISTS email_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER UNIQUE,
      marketing_enabled BOOLEAN DEFAULT 1,
      product_updates_enabled BOOLEAN DEFAULT 1,
      newsletter_enabled BOOLEAN DEFAULT 1,
      frequency TEXT DEFAULT 'Daily',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Segments table
  db.run(`
    CREATE TABLE IF NOT EXISTS segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      conditions TEXT, -- JSON holding criteria
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log("[DB] Setting up staff and auth tables...");
  // Staff table (create if not exists)
  db.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      role TEXT DEFAULT 'staff',
      password TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Staff table enhancement (authentication) - legacy ALTER statements for existing databases
  db.run("ALTER TABLE staff ADD COLUMN password TEXT", (err) => { });
  db.run("ALTER TABLE staff ADD COLUMN status TEXT DEFAULT 'active'", (err) => { });
  db.run("ALTER TABLE staff ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => { });
  db.run("ALTER TABLE staff ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => { });

  // Portal Links Tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS portal_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      url TEXT NOT NULL,
      notification_method TEXT, -- 'email', 'sms', 'both'
      notification_status TEXT, -- 'sent', 'failed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Dedicated Portal Requests table (source of truth)
  db.run(`
    CREATE TABLE IF NOT EXISTS portal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      project_id INTEGER,
      subject TEXT NOT NULL DEFAULT 'General',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      priority TEXT NOT NULL DEFAULT 'normal',
      source TEXT NOT NULL DEFAULT 'portal',
      token_used TEXT,
      assigned_to INTEGER,
      notify_email_status TEXT,
      notify_sms_status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL
    )
  `);

  console.log("[DB] Setting up file uploads tables...");
  // Add drive_folder_id to clients table if not exists
  db.run("ALTER TABLE clients ADD COLUMN drive_folder_id TEXT", (err) => { });

  // Client Files table (for file uploads via portal/staff)
  db.run(`
    CREATE TABLE IF NOT EXISTS client_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT,
      drive_file_id TEXT NOT NULL,
      drive_view_link TEXT,
      drive_download_link TEXT,
      uploaded_by_type TEXT NOT NULL CHECK(uploaded_by_type IN ('client', 'staff')),
      uploaded_by_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

  // Indexes for faster lookups
  db.run("CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files(client_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_client_files_created_at ON client_files(created_at DESC)");

  console.log("[DB] Database initialization scripts queued.");
});

module.exports = db;
