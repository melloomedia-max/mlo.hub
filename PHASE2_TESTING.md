# Phase 2 Testing — File Upload Backend Routes

## Status: ✅ Deployed to Railway

**Commit:** 3b39d6e  
**Deployed:** Automatic via GitHub push

---

## What Was Deployed

### New Files
- `server/routes/files.js` — Complete file upload/list/delete API

### Modified Files
- `server/server.js` — Added filesRoutes mounting

---

## Routes Reference

### Client Portal Routes (Token-Based Auth)

**Upload File:**
```http
POST /portal/api/{portal_token}/upload
Content-Type: multipart/form-data

file: <binary>
```

**List Files:**
```http
GET /portal/api/{portal_token}/files
```

**Delete File (Client's Own Uploads Only):**
```http
DELETE /portal/api/{portal_token}/files/{fileId}
```

---

### Staff CRM Routes (Session-Based Auth)

**Upload File:**
```http
POST /api/clients/{clientId}/files/upload
Content-Type: multipart/form-data
Cookie: connect.sid=...

file: <binary>
```

**List Files:**
```http
GET /api/clients/{clientId}/files
Cookie: connect.sid=...
```

**Delete File (Any File):**
```http
DELETE /api/clients/{clientId}/files/{fileId}
Cookie: connect.sid=...
```

---

## Testing in Railway

### 1. Test Client Portal Upload

Use `curl` or a tool like Postman/Insomnia:

```bash
# Get a valid portal token first
railway shell
echo "SELECT portal_token FROM clients WHERE email='test@example.com';" | sqlite3 agency.db
# Copy the token

# Exit shell, then upload from local machine:
curl -X POST \
  https://portal.melloo.media/portal/api/{TOKEN_HERE}/upload \
  -F "file=@test-file.pdf" \
  -v
```

**Expected response:**
```json
{
  "success": true,
  "file": {
    "id": 1,
    "name": "test-file.pdf",
    "size": 12345,
    "mimeType": "application/pdf",
    "viewLink": "https://drive.google.com/file/d/...",
    "downloadLink": "https://drive.google.com/uc?id=...",
    "uploadedAt": "2026-05-05T..."
  }
}
```

---

### 2. Test File Listing

```bash
curl https://portal.melloo.media/portal/api/{TOKEN_HERE}/files
```

**Expected response:**
```json
{
  "files": [
    {
      "id": 1,
      "file_name": "test-file.pdf",
      "file_size": 12345,
      "mime_type": "application/pdf",
      "drive_view_link": "https://drive.google.com/...",
      "drive_download_link": "https://drive.google.com/uc?id=...",
      "uploaded_by_type": "client",
      "created_at": "2026-05-05 ..."
    }
  ]
}
```

---

### 3. Verify in Google Drive

1. Visit the `viewLink` from the upload response
2. Should see the file in folder structure:
   ```
   Melloo Media Clients/
     └── {Client Name} - Uploads/
         └── {timestamp}_{filename}
   ```

---

### 4. Verify Database Record

```bash
railway shell
echo "SELECT * FROM client_files ORDER BY id DESC LIMIT 1;" | sqlite3 agency.db
```

**Expected columns:**
- `id`, `client_id`, `file_name`, `file_size`, `mime_type`
- `drive_file_id`, `drive_view_link`, `drive_download_link`
- `uploaded_by_type` ('client' or 'staff')
- `uploaded_by_id`, `created_at`

---

## Security Features

✅ **File Type Validation:** Only allows safe file types (documents, images, video, audio, archives)  
✅ **Size Limit:** 50 MB max per file  
✅ **Client Isolation:** Clients can only see/delete their own uploads  
✅ **Staff Permissions:** Staff can view/delete any file  
✅ **Token Validation:** Portal routes require valid `portal_token` and `portal_access = 1`  
✅ **Session Validation:** Staff routes require authenticated session

---

## Known Limitations

- **No rate limiting yet** — TODO: Add express-rate-limit for upload endpoints
- **No virus scanning** — TODO: Consider ClamAV or similar for production
- **No chunked uploads** — Large files (>50 MB) not supported
- **No drag-and-drop UI yet** — Phase 3 will add frontend

---

## Troubleshooting

**"File type not allowed" error:**
- Check file MIME type matches allowed list in `files.js`
- For new types, add to `allowedMimes` array

**"Invalid or inactive portal token" error:**
- Verify client has `portal_access = 1` in database
- Verify `portal_token` matches exactly (case-sensitive)

**"Upload failed" with Google Drive error:**
- Check `GOOGLE_REFRESH_TOKEN` is set in Railway
- Check token has `drive.file` scope
- Check Drive API is enabled in Google Cloud Console

**"Not authenticated" on staff routes:**
- Verify session cookie is being sent
- Check session middleware is working (`/login` should set cookie)

---

## Next Phase

**Phase 3: Frontend UI**
- Client portal upload interface
- Staff CRM file management UI
- Drag-and-drop support
- File preview/thumbnails
- Progress indicators
