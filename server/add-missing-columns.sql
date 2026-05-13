-- Add missing columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_instagram TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_linkedin TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_twitter TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_facebook TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS activity_doc_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ai_health_report TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hosting_active INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hosting_plan TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hosting_since TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_billing_date TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS total_paid REAL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'lead';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS converted_from_lead_id INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lifetime_value REAL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_account_manager TEXT;

-- Add missing columns to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status TEXT;

-- Add missing columns to invoices table (if not exists)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid REAL DEFAULT 0;

-- Add missing columns to time_logs table
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS billed INTEGER DEFAULT 0;

-- Add missing columns to client_communications table
ALTER TABLE client_communications ADD COLUMN IF NOT EXISTS task_id INTEGER;
