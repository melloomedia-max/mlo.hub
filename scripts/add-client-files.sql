-- Migration: Add client file uploads support
-- Run date: 2026-05-05

-- Add drive_folder_id to clients table (stores Google Drive folder ID for each client)
ALTER TABLE clients ADD COLUMN drive_folder_id TEXT;

-- Create client_files table
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
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_created_at ON client_files(created_at DESC);
