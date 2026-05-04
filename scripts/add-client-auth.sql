-- Add authentication columns to clients table
-- Run this with: sqlite3 agency.db < scripts/add-client-auth.sql

-- Add password column if it doesn't exist
ALTER TABLE clients ADD COLUMN password TEXT;

-- Add auth provider column (password, google, magic_link)
ALTER TABLE clients ADD COLUMN auth_provider TEXT DEFAULT 'password';

-- Add Google OAuth ID column
ALTER TABLE clients ADD COLUMN google_id TEXT;

-- Create magic link tokens table
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- Create index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_magic_link_token ON magic_link_tokens(token);
CREATE INDEX IF NOT EXISTS idx_magic_link_expires ON magic_link_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_link_client ON magic_link_tokens(client_id);

-- Add index on clients.google_id for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_clients_google_id ON clients(google_id);

-- Create client signups table (for new account requests from website)
CREATE TABLE IF NOT EXISTS client_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    converted_to_client_id INTEGER,
    FOREIGN KEY (converted_to_client_id) REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_signups_email ON client_signups(email);
CREATE INDEX IF NOT EXISTS idx_signups_status ON client_signups(status);
