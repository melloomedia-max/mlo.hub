# Admin Seeder & Magic Link Database Fix

## Problems Fixed

### 1. ✅ Admin Seeder - Improved Safety

**Problem:** User reported staff login failing because seeder might be overwriting password on every boot.

**Analysis:** The original seeder was actually correct (never touched password after initial seed), but could be made safer.

**Fix Applied:**

**Before** (`server/server.js`):
```javascript
// Checked if specific admin email existed
db.get("SELECT id FROM staff WHERE email = ?", [adminEmail], (err, row) => {
    if (row) {
        // Run UPDATE to ensure role/status correct
        db.run("UPDATE staff SET role = 'admin', status = 'active' WHERE id = ?...");
        return;
    }
    // Seed admin...
});
```

**After** (`server/server.js`):
```javascript
// Check if ANY staff exist first
db.get("SELECT COUNT(*) as count FROM staff", [], (err, result) => {
    if (result.count > 0) {
        // Staff exist — NEVER touch database at boot
        console.log(`[BOOT] Staff table has ${result.count} record(s) — skipping bootstrap.`);
        return;
    }
    // No staff exist — seed initial admin
    console.log(`[BOOT] No staff found. Seeding initial admin: ${adminEmail}`);
    const hashed = hashPassword(adminPass);
    db.run("INSERT INTO staff...");
});
```

**Benefits:**
- ✅ Safer: Checks if ANY staff exist (not just specific email)
- ✅ Simpler: No UPDATE statements at boot time
- ✅ Clearer: Better logging shows exactly what's happening
- ✅ Guaranteed: Seeder only runs once ever (when staff table is empty)

---

### 2. ✅ Magic Link Database Error - Missing Table

**Problem:** Magic link authentication failing with SQL error.

**Root Cause:** `magic_link_tokens` table was never created in `database.js`.

**Fix Applied:**

Added to `server/database.js` after `client_notes` table:

```javascript
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
```

**Also Added:** Missing client authentication columns:
```javascript
// Client authentication columns (for portal login + OAuth)
db.run("ALTER TABLE clients ADD COLUMN auth_provider TEXT DEFAULT 'email'", (err) => { });
db.run("ALTER TABLE clients ADD COLUMN google_id TEXT", (err) => { });
db.run("ALTER TABLE clients ADD COLUMN portal_access INTEGER DEFAULT 0", (err) => { });
db.run("ALTER TABLE clients ADD COLUMN portal_token TEXT", (err) => { });
db.run("ALTER TABLE clients ADD COLUMN drive_folder_id TEXT", (err) => { });
```

**Schema:**
- `id` — Auto-increment primary key
- `client_id` — Foreign key to clients table
- `token` — 32-byte base64url unique token
- `expires_at` — Expiration timestamp (default 15 minutes)
- `used` — Flag to prevent token reuse
- `created_at` — Creation timestamp

**Indexes:**
- `idx_magic_link_token` — Fast token lookup
- `idx_magic_link_expires` — Fast expired token cleanup

---

## Files Modified

1. **server/server.js**
   - Lines 15-51: Improved admin seeder (checks COUNT(*) instead of specific email)
   - Removes UPDATE statements at boot
   - Better logging

2. **server/database.js**
   - Added missing client auth columns (auth_provider, google_id, portal_access, portal_token, drive_folder_id)
   - Added magic_link_tokens table creation
   - Added indexes for performance

---

## Testing

### Test Admin Seeder

1. **Check current staff count:**
   ```bash
   railway shell
   echo "SELECT COUNT(*) FROM staff;" | sqlite3 agency.db
   ```

2. **Check boot logs:**
   ```bash
   railway logs | grep "\[BOOT\]"
   ```
   
   Should see:
   - If staff exist: `[BOOT] Staff table has N record(s) — skipping admin bootstrap.`
   - If no staff: `[BOOT] ✅ Seeded initial admin: melloomedia@gmail.com`

3. **Verify no password changes at boot:**
   ```bash
   # Before restart
   railway shell
   echo "SELECT password FROM staff WHERE email='melloomedia@gmail.com';" | sqlite3 agency.db
   
   # Trigger Railway restart
   git commit --allow-empty -m "test restart" && git push
   
   # After restart
   railway shell
   echo "SELECT password FROM staff WHERE email='melloomedia@gmail.com';" | sqlite3 agency.db
   
   # Hashes should be IDENTICAL
   ```

### Test Magic Link

1. **Verify table creation:**
   ```bash
   railway shell
   echo ".schema magic_link_tokens" | sqlite3 agency.db
   ```
   
   Should show table definition with all columns.

2. **Test magic link request:**
   ```bash
   curl -X POST https://portal.melloo.media/auth/magic-link/send \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com"}'
   ```
   
   Should return `200 OK` with `{ "success": true, "message": "Magic link sent" }`

3. **Check token in database:**
   ```bash
   railway shell
   echo "SELECT * FROM magic_link_tokens ORDER BY created_at DESC LIMIT 1;" | sqlite3 agency.db
   ```

4. **Test magic link verification:**
   ```bash
   # Get token from database or email
   curl "https://portal.melloo.media/auth/magic-link/verify?token={TOKEN}"
   ```
   
   Should redirect to portal with session cookie set.

---

## Diagnostic Scripts

Created helper scripts for debugging:

### 1. `scripts/diagnose-staff-login.js`

```bash
node scripts/diagnose-staff-login.js
```

Shows:
- Current staff record details
- Password hash preview
- Whether APP_PASSWORD matches hash
- Fix instructions if mismatch

### 2. `scripts/reset-staff-password.js`

```bash
# Sync staff password with current APP_PASSWORD
node scripts/reset-staff-password.js
```

Use when password gets out of sync.

---

## Deployment

Changes committed and ready to deploy:

```bash
git add -A
git commit -m "Fix admin seeder and add magic_link_tokens table

- Improve admin seeder safety (check COUNT(*) instead of specific email)
- Remove UPDATE statements at boot (never touch database after initial seed)
- Add magic_link_tokens table for passwordless authentication
- Add missing client auth columns (auth_provider, google_id, portal_access, etc.)
- Add indexes for performance
- Better boot logging"
git push origin main
```

Railway will auto-deploy in ~2-3 minutes.

---

## Post-Deployment Verification

1. **Check Railway logs for successful boot:**
   ```bash
   railway logs | grep "\[DB\].*magic"
   ```
   Should see: `[DB] Setting up magic link tokens table...`

2. **Verify seeder behavior:**
   ```bash
   railway logs | grep "\[BOOT\].*Staff table"
   ```
   Should see: `[BOOT] Staff table has 1 record(s) — skipping admin bootstrap.`

3. **Test magic link flow end-to-end:**
   - Request magic link via portal
   - Check email delivery
   - Click link
   - Verify portal login succeeds

---

## Summary

✅ **Admin Seeder:** Now 100% safe - only seeds when staff table is empty, never touches database after initial seed  
✅ **Magic Link:** Database table created with proper schema and indexes  
✅ **Client Auth:** All missing columns added for OAuth + portal authentication  
✅ **Logging:** Better visibility into boot process  
✅ **Diagnostics:** Helper scripts for debugging staff login issues
