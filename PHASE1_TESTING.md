# Phase 1 Testing — Drive Upload Utility

## Status: ✅ Deployed to Railway

**Commit:** 377c7ab  
**Deployed:** Automatic via GitHub push

---

## What Was Deployed

### Database Changes
- New table: `client_files` (with indexes)
- New column: `clients.drive_folder_id`

### New Files
- `server/utils/googleDrive.js` — Core Drive upload utility
- `scripts/add-client-files.sql` — Migration reference
- `scripts/test-drive-upload.js` — Test script

---

## Testing in Railway

### 1. Verify Database Schema

```bash
railway shell
```

Then:
```bash
echo ".schema client_files" | sqlite3 agency.db
```

**Expected:** Table definition with all columns and indexes.

---

### 2. Test Drive Upload Utility

```bash
railway shell
```

Then:
```bash
node scripts/test-drive-upload.js
```

**Expected output:**
```
=== Testing Google Drive Upload ===

1. Testing Drive authentication...
   ✓ Drive client created

2. Verifying Drive access...
   ✓ Authenticated as: melloomedia@gmail.com

3. Testing folder creation...
   ✓ Folder ID: <drive_folder_id>

4. Testing file upload...
   ✓ Upload successful!
   File ID: <file_id>
   View Link: https://drive.google.com/file/d/...
   Download Link: https://drive.google.com/uc?id=...

=== All Tests Passed! ===
```

---

### 3. Verify in Google Drive

Visit the **View Link** from the test output.

You should see:
- A file named `<timestamp>_test-upload.txt`
- In folder: `Melloo Media Clients/Test Client - Uploads`

---

## Troubleshooting

**"No access, refresh token..." error:**
- Check that `GOOGLE_REFRESH_TOKEN` is set in Railway Variables
- Verify token was copied correctly from `scripts/get-drive-token.js` output

**"File not found" in Drive:**
- Check Railway logs for `[Drive]` messages
- Verify Drive API is enabled in Google Cloud Console

**Database errors:**
- Railway should auto-create tables on boot
- Check logs for `[DB] Setting up file uploads tables...`

---

## Next Phase

Once Phase 1 testing passes, proceed to **Phase 2: Backend Routes**:
- File upload endpoints (`POST /portal/api/:token/upload`)
- File list endpoints (`GET /portal/api/:token/files`)
- Delete endpoints (`DELETE /portal/api/:token/files/:id`)
- Multer configuration
- File validation (size, type)
- Rate limiting
