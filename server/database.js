const { Pool } = require('pg');

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log(`[DB] Using PostgreSQL database`);

// Backward-compatible wrapper that supports both callbacks and promises
class DatabaseWrapper {
  // Core async methods
  async query(text, params = []) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB] Executed query', { text: text.substring(0, 60), duration, rows: res.rowCount });
    return res;
  }

  // Callback-compatible get (returns single row)
  get(text, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    pool.query(text, params)
      .then(res => callback(null, res.rows[0] || null))
      .catch(err => callback(err, null));
  }

  // Callback-compatible all (returns all rows)
  all(text, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    pool.query(text, params)
      .then(res => callback(null, res.rows))
      .catch(err => callback(err, null));
  }

  // Callback-compatible run (for INSERT/UPDATE/DELETE)
  run(text, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    // PostgreSQL needs RETURNING clause for lastID
    const needsReturning = /^INSERT/i.test(text.trim()) && !/RETURNING/i.test(text);
    const finalText = needsReturning ? text.replace(/;?\s*$/i, ' RETURNING id') : text;
    
    pool.query(finalText, params)
      .then(res => {
        // Mimic sqlite3's this.lastID behavior
        const context = {
          lastID: res.rows[0]?.id || null,
          changes: res.rowCount || 0
        };
        callback.call(context, null);
      })
      .catch(err => callback(err));
  }

  // Promise-based methods for new code
  async getAsync(text, params = []) {
    const res = await this.query(text, params);
    return res.rows[0] || null;
  }

  async allAsync(text, params = []) {
    const res = await this.query(text, params);
    return res.rows;
  }

  async runAsync(text, params = []) {
    const res = await this.query(text, params);
    return res.rowCount;
  }

  async insertAsync(text, params = []) {
    const needsReturning = /^INSERT/i.test(text.trim()) && !/RETURNING/i.test(text);
    const finalText = needsReturning ? text.replace(/;?\s*$/i, ' RETURNING id') : text;
    const res = await this.query(finalText, params);
    return res.rows[0]?.id || null;
  }

  // Close pool (for graceful shutdown)
  async close() {
    await pool.end();
  }

  // Serialize method for compatibility (PostgreSQL doesn't need this)
  serialize(callback) {
    callback();
  }
}

const db = new DatabaseWrapper();

// Initialize database schema
async function initializeDatabase() {
  console.log("[DB] Starting database initialization...");

  try {
    console.log("[DB] Setting up tasks tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        due_date TEXT,
        assigned_to INTEGER,
        google_event_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_google_event_id ON tasks(google_event_id) WHERE google_event_id IS NOT NULL");

    console.log("[DB] Setting up meetings tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        meet_link TEXT,
        attendees TEXT,
        google_event_id TEXT,
        meet_space_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("[DB] Setting up CRM tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT,
        first_name TEXT,
        last_name TEXT,
        birthday TEXT,
        email TEXT,
        phone TEXT,
        company TEXT,
        status TEXT DEFAULT 'lead',
        notes TEXT,
        google_drive_folder_id TEXT,
        password TEXT,
        auth_provider TEXT DEFAULT 'email',
        google_id TEXT,
        portal_access INTEGER DEFAULT 0,
        portal_token TEXT,
        drive_folder_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS client_notes (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    console.log("[DB] Setting up magic link tokens table...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);
    await db.query("CREATE INDEX IF NOT EXISTS idx_magic_link_token ON magic_link_tokens(token)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_magic_link_expires ON magic_link_tokens(expires_at)");

    await db.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        budget REAL,
        deadline TEXT,
        notes TEXT,
        project_folder_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_attachments (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        thumbnail_link TEXT,
        web_view_link TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS time_logs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER DEFAULT 0,
        description TEXT,
        billed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        project_id INTEGER,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        total_amount REAL DEFAULT 0,
        amount_paid REAL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER,
        description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        rate REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS client_businesses (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        industry TEXT,
        website TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    console.log("[DB] Setting up campaign and automation tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name TEXT,
        description TEXT,
        trigger TEXT,
        steps TEXT,
        flow_data TEXT,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS campaign_enrollments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER,
        campaign_id INTEGER,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        current_step INTEGER DEFAULT 0,
        current_node_id TEXT,
        last_action_at TIMESTAMP,
        next_action_at TIMESTAMP,
        status TEXT DEFAULT 'active',
        metadata TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        interval TEXT DEFAULT 'monthly',
        status TEXT DEFAULT 'active',
        billing_day INTEGER DEFAULT 1,
        last_billing_date TEXT,
        next_billing_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS subscription_invoices (
        id SERIAL PRIMARY KEY,
        subscription_id INTEGER NOT NULL,
        invoice_id INTEGER NOT NULL,
        billing_period_start TEXT,
        billing_period_end TEXT,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS client_communications (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        type TEXT,
        method TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT,
        body TEXT,
        variables TEXT,
        category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        body TEXT,
        variables TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS campaign_sends (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER,
        enrollment_id INTEGER,
        client_id INTEGER,
        type TEXT,
        template_id INTEGER,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        failed_at TIMESTAMP,
        error_message TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
        FOREIGN KEY (enrollment_id) REFERENCES campaign_enrollments(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS campaign_analytics (
        id SERIAL PRIMARY KEY,
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

    await db.query(`
      CREATE TABLE IF NOT EXISTS archive_log (
        id SERIAL PRIMARY KEY,
        archive_type TEXT NOT NULL,
        archive_date DATE NOT NULL,
        records_archived INTEGER,
        drive_folder_id TEXT,
        drive_file_id TEXT,
        drive_file_url TEXT,
        file_size_bytes INTEGER,
        date_range_start DATE,
        date_range_end DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS campaign_sends_archive (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER,
        enrollment_id INTEGER,
        client_id INTEGER,
        node_id TEXT,
        type TEXT,
        subject TEXT,
        body TEXT,
        status TEXT,
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        replied_at TIMESTAMP,
        failed_at TIMESTAMP,
        error_message TEXT,
        metadata TEXT,
        created_at TIMESTAMP,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS unsubscribe_list (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS email_preferences (
        id SERIAL PRIMARY KEY,
        client_id INTEGER UNIQUE,
        marketing_enabled BOOLEAN DEFAULT TRUE,
        product_updates_enabled BOOLEAN DEFAULT TRUE,
        newsletter_enabled BOOLEAN DEFAULT TRUE,
        frequency TEXT DEFAULT 'Daily',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS segments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        conditions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("[DB] Setting up staff and auth tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'staff',
        password TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS portal_links (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        url TEXT NOT NULL,
        notification_method TEXT,
        notification_status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS portal_requests (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES staff(id) ON DELETE SET NULL
      )
    `);

    console.log("[DB] Setting up file uploads tables...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_files (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT,
        drive_file_id TEXT NOT NULL,
        drive_view_link TEXT,
        drive_download_link TEXT,
        uploaded_by_type TEXT NOT NULL CHECK(uploaded_by_type IN ('client', 'staff')),
        uploaded_by_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      )
    `);

    await db.query("CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files(client_id)");
    await db.query("CREATE INDEX IF NOT EXISTS idx_client_files_created_at ON client_files(created_at DESC)");

    console.log("[DB] Database initialization complete.");
  } catch (err) {
    console.error("[DB] Initialization error:", err);
    throw err;
  }
}

// Run initialization
initializeDatabase().catch(err => {
  console.error("[DB] Fatal initialization error:", err);
  process.exit(1);
});

module.exports = db;
