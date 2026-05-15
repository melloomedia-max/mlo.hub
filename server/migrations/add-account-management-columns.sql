-- Staff account management columns
-- Add Google OAuth support and permissions
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS google_id TEXT,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS invited_by INTEGER,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Add index on google_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_staff_google_id ON staff(google_id) WHERE google_id IS NOT NULL;

-- Client portal permissions
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS portal_permissions JSONB DEFAULT '{}';

-- Update existing staff to have default permissions
UPDATE staff 
SET permissions = CASE 
    WHEN role IN ('admin', 'manager') THEN 
        '{"can_view_clients": true, "can_edit_clients": true, "can_view_invoices": true, "can_create_invoices": true, "can_view_reports": true, "can_manage_campaigns": true}'::jsonb
    ELSE 
        '{"can_view_clients": true, "can_edit_clients": false, "can_view_invoices": true, "can_create_invoices": false, "can_view_reports": true, "can_manage_campaigns": false}'::jsonb
    END
WHERE permissions = '{}'::jsonb OR permissions IS NULL;

-- Update existing clients with default portal permissions
UPDATE clients
SET portal_permissions = '{"can_view_invoices": true, "can_view_projects": true, "can_upload_files": true, "can_message_staff": true}'::jsonb
WHERE portal_permissions = '{}'::jsonb OR portal_permissions IS NULL;

-- Create staff_invites table for tracking magic link invitations
CREATE TABLE IF NOT EXISTS staff_invites (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'staff',
    permissions JSONB DEFAULT '{}',
    invited_by INTEGER,
    expires_at TIMESTAMP NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invited_by) REFERENCES staff(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_invites_token ON staff_invites(token);
CREATE INDEX IF NOT EXISTS idx_staff_invites_expires ON staff_invites(expires_at);
