# File Upload Feature — Implementation Summary

## Overview

Complete file upload system for melloo.hub with dual interfaces: client portal (token-based) and staff CRM (session-based). Files are stored in Google Drive with metadata tracked in SQLite.

---

## Architecture

### Stack
- **Storage:** Google Drive (via OAuth refresh token)
- **Metadata:** SQLite `client_files` table
- **Upload:** Multer (memory storage, 50 MB limit)
- **Auth:** Token-based (portal) + Session-based (staff)

### Folder Structure
```
Google Drive:
  Melloo Media Clients/
    ├── Client A - Uploads/
    │   ├── 2026-05-05_14-30-00_invoice.pdf
    │   └── 2026-05-05_15-00-00_logo.png
    └── Client B - Uploads/
        └── 2026-05-05_16-00-00_contract.docx
```

### Database Schema
```sql
CREATE TABLE client_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_view_link TEXT NOT NULL,
  drive_download_link TEXT NOT NULL,
  uploaded_by_type TEXT NOT NULL CHECK(uploaded_by_type IN ('client', 'staff')),
  uploaded_by_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

ALTER TABLE clients ADD COLUMN drive_folder_id TEXT;
```

---

## Components

### Phase 1: Database + Drive Utility ✅

**Files:**
- `scripts/add-client-files.sql` — Migration SQL
- `server/utils/googleDrive.js` — Drive API wrapper
- `scripts/test-drive-upload.js` — Test script
- `server/database.js` — Table creation + migration

**Functions:**
- `getDriveClient()` — Authenticate via refresh token
- `getOrCreateClientFolder(clientId, clientName)` — Folder management with caching
- `uploadFile(clientId, clientName, fileData)` — Upload with timestamp prefix
- `deleteFile(driveFileId)` — Delete from Drive
- `getFileMetadata(driveFileId)` — Fetch file info

---

### Phase 2: Backend Routes ✅

**File:** `server/routes/files.js`

**Client Portal Routes:**
- `POST /portal/api/:token/upload` — Upload file
- `GET /portal/api/:token/files` — List files
- `DELETE /portal/api/:token/files/:id` — Delete own uploads

**Staff CRM Routes:**
- `POST /api/clients/:clientId/files/upload` — Upload file for client
- `GET /api/clients/:clientId/files` — List all client files
- `DELETE /api/clients/:clientId/files/:id` — Delete any file

**Security:**
- Token validation (portal access + active token)
- Session validation (authenticated staff)
- File type whitelist (blocks executables)
- Size limit (50 MB)
- Client isolation (can only delete own uploads)

---

## Environment Variables Required

```bash
# Google OAuth (already configured)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Google Drive Refresh Token (added in Phase 1)
GOOGLE_REFRESH_TOKEN=...
```

---

## Setup Steps Completed

1. ✅ Added Drive refresh token generation script (`scripts/get-drive-token.js`)
2. ✅ Generated refresh token with `drive.file` and `drive` scopes
3. ✅ Added `GOOGLE_REFRESH_TOKEN` to Railway environment variables
4. ✅ Created `client_files` table + `drive_folder_id` column
5. ✅ Built Drive utility with folder caching
6. ✅ Created backend API routes (dual auth)
7. ✅ Fixed staff table creation bug (admin bootstrap crash)
8. ✅ Deployed to Railway

---

## API Examples

### Client Upload (Portal)

```bash
curl -X POST \
  https://portal.melloo.media/portal/api/abc123token/upload \
  -F "file=@document.pdf"
```

**Response:**
```json
{
  "success": true,
  "file": {
    "id": 1,
    "name": "document.pdf",
    "size": 245678,
    "mimeType": "application/pdf",
    "viewLink": "https://drive.google.com/file/d/...",
    "downloadLink": "https://drive.google.com/uc?id=...",
    "uploadedAt": "2026-05-05T08:12:34.567Z"
  }
}
```

### Staff Upload (CRM)

```bash
curl -X POST \
  https://hub.melloo.media/api/clients/5/files/upload \
  -H "Cookie: connect.sid=..." \
  -F "file=@contract.docx"
```

**Response:** Same structure as client upload.

### List Files

```bash
# Portal
curl https://portal.melloo.media/portal/api/abc123token/files

# CRM
curl https://hub.melloo.media/api/clients/5/files \
  -H "Cookie: connect.sid=..."
```

**Response:**
```json
{
  "files": [
    {
      "id": 1,
      "file_name": "document.pdf",
      "file_size": 245678,
      "mime_type": "application/pdf",
      "drive_view_link": "https://drive.google.com/...",
      "drive_download_link": "https://drive.google.com/...",
      "uploaded_by_type": "client",
      "created_at": "2026-05-05 08:12:34"
    }
  ]
}
```

---

## Security Model

### Client Portal
- **Auth:** `portal_token` (40-char hex) + `portal_access = 1`
- **Read:** Own files only
- **Write:** Can upload
- **Delete:** Can delete own uploads (not staff uploads)

### Staff CRM
- **Auth:** Express session (`connect.sid` cookie)
- **Read:** All files for any client
- **Write:** Can upload for any client
- **Delete:** Can delete any file

### File Validation
- **Allowed types:** Documents (PDF, Office), Images, Video, Audio, Archives
- **Blocked types:** Executables (.exe, .sh, .bat, etc.)
- **Max size:** 50 MB per file
- **Storage:** Memory (not written to disk before Drive upload)

---

## Known Limitations

1. **No rate limiting** — Uploads are not throttled yet
2. **No virus scanning** — Production should add ClamAV or similar
3. **No chunked uploads** — Files >50 MB not supported
4. **No frontend UI yet** — Phase 3 will add upload forms

---

## Testing Checklist

- [x] Local Drive authentication works
- [x] Local test upload creates folder + file
- [x] Database migration applied (client_files table)
- [x] Staff table creation fixed (admin bootstrap)
- [x] Code deployed to Railway
- [ ] Railway Drive test passes (`node scripts/test-drive-upload.js`)
- [ ] Portal upload endpoint works
- [ ] Portal file listing works
- [ ] Portal file deletion works (own uploads only)
- [ ] Staff upload endpoint works
- [ ] Staff file listing works
- [ ] Staff file deletion works (any file)
- [ ] File appears in Google Drive with correct folder structure
- [ ] Database record created with correct metadata
- [ ] Invalid file types rejected
- [ ] Files >50 MB rejected
- [ ] Invalid portal token rejected
- [ ] Unauthenticated staff request rejected

---

## Next Steps

### Phase 3: Frontend UI
- Client portal upload interface (drag-and-drop)
- Staff CRM file management UI
- File preview/thumbnails
- Progress indicators
- Better error handling

### Phase 4: Enhancements
- Rate limiting (express-rate-limit)
- Virus scanning (ClamAV integration)
- Chunked uploads for large files
- Bulk delete
- File search/filtering
- Download analytics

---

## Commits

- `377c7ab` — Phase 1: Database schema + Google Drive utility
- `d435118` — Add Phase 1 testing documentation
- `da4906f` — Security: Remove agency.db from git tracking
- `69de424` — Fix: Create staff table before admin bootstrap
- `3b39d6e` — Phase 2: Add file upload backend routes

---

## Files Changed

### New Files
- `scripts/add-client-files.sql`
- `scripts/get-drive-token.js`
- `scripts/test-drive-upload.js`
- `scripts/DRIVE_TOKEN_SETUP.md`
- `scripts/README.md`
- `server/utils/googleDrive.js`
- `server/routes/files.js`
- `PHASE1_TESTING.md`
- `PHASE2_TESTING.md`
- `FILE_UPLOAD_SUMMARY.md` (this file)

### Modified Files
- `server/database.js` (client_files table, drive_folder_id, staff table creation)
- `server/server.js` (filesRoutes mounting, admin bootstrap timeout)
- `.gitignore` (added *.db pattern)
- `package.json` (added `open` dev dependency)

---

**Status:** Backend complete, ready for frontend implementation.
