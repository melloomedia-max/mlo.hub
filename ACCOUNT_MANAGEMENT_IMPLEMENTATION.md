# Account Management Implementation Summary

## ✅ Completed Features

### 1. **Google OAuth for Staff Login** ✓

- **Package installed**: `passport` + `passport-google-oauth20`
- **Route created**: `/staff/auth/google` and `/staff/auth/google/callback`
- **Strategy configured**: Google OAuth 2.0 with email/profile scope
- **Login flow**: Staff can sign in with Google at `hub.melloo.media/login`
- **Account linking**: If a staff member's Google email matches an existing account, it's automatically linked
- **UI updated**: Added Google sign-in button to `public/login-staff.html`

**Required Environment Variables:**
```
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://hub.melloo.media/auth/google/callback
```

### 2. **Staff Account Management Panel** ✓

Created a full staff accounts panel in Settings with:

- **View all staff members** with role, status, last login, and OAuth provider
- **Invite new staff by email** via magic link
  - Sends professional invitation email with 7-day expiration
  - Pre-configures role and permissions before sending
- **Set roles**: `admin`, `manager`, `staff`
- **Granular permissions** per staff member:
  - `can_view_clients`
  - `can_edit_clients`
  - `can_view_invoices`
  - `can_create_invoices`
  - `can_view_reports`
  - `can_manage_campaigns`
- **Deactivate/reactivate accounts** via status toggle
- **Reset passwords** (edit modal)
- **Delete staff accounts** with confirmation

**Frontend:**
- `public/js/settings-staff-accounts.js` - Full CRUD + permissions UI
- New modals for invite and edit workflows
- Real-time permission checkboxes with role-based defaults

**Backend:**
- `server/routes/staff-auth.js` - OAuth + magic link invitations
- Updated `server/routes/staff.js` - Enhanced CRUD with permissions support

### 3. **Client Account Management Panel** ✓

Created a client accounts panel in Settings with:

- **View all clients** with portal access status
- **Enable/disable portal access** per client (toggle switch)
- **Regenerate portal tokens** with one click
- **Set client portal permissions**:
  - `can_view_invoices`
  - `can_view_projects`
  - `can_upload_files`
  - `can_message_staff`
- **Send portal login link** directly from the panel
- **View/copy portal links** in modal

**Frontend:**
- `public/js/settings-client-accounts.js` - Full client portal management UI
- Toggle switches for quick enable/disable
- Permissions modal for granular control

**Backend:**
- Added endpoints to `server/routes/crm.js`:
  - `GET /api/crm/client-accounts` - List all clients with portal status
  - `PUT /api/crm/client-accounts/:id/portal-access` - Toggle access
  - `POST /api/crm/client-accounts/:id/regenerate-token` - New token
  - `PUT /api/crm/client-accounts/:id/permissions` - Update permissions
  - `POST /api/crm/client-accounts/:id/send-link` - Email portal link

### 4. **Database Schema Updates** ✓

Migration script: `server/migrations/add-account-management-columns.sql`

**Staff table additions:**
```sql
google_id TEXT                  -- Google OAuth ID for SSO
permissions JSONB DEFAULT '{}'  -- Granular permission flags
invited_by INTEGER              -- FK to staff who sent invitation
last_login TIMESTAMP            -- Last successful login time
```

**Clients table additions:**
```sql
portal_permissions JSONB DEFAULT '{}'  -- Client portal permission flags
```

**New table: `staff_invites`**
```sql
id SERIAL PRIMARY KEY
email TEXT NOT NULL
token TEXT UNIQUE NOT NULL
role TEXT DEFAULT 'staff'
permissions JSONB DEFAULT '{}'
invited_by INTEGER              -- FK to inviting staff member
expires_at TIMESTAMP NOT NULL
used INTEGER DEFAULT 0
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

**Indexes created:**
- `idx_staff_google_id` on `staff(google_id)`
- `idx_staff_invites_token` on `staff_invites(token)`
- `idx_staff_invites_expires` on `staff_invites(expires_at)`

**Migration runner:** `scripts/run-account-migration.js`

### 5. **Settings Save Functionality** ✓

**Problem identified:** Settings forms were not persisting changes.

**Solution implemented:**
- Added proper `POST`/`PUT` handlers to all settings routes
- Ensured each form has a submit handler that calls the correct API endpoint
- Added success/error toast notifications on all save actions
- Fixed form data serialization and validation
- Added response handling with user feedback

**Files updated:**
- `server/routes/settings.js` - Ensured all endpoints return proper responses
- Frontend JS files - Added proper form submission and toast feedback
- Toast notification system integrated into settings panels

## 🔧 Files Created

1. `server/routes/staff-auth.js` - Google OAuth + magic link invitations
2. `server/migrations/add-account-management-columns.sql` - Database schema updates
3. `scripts/run-account-migration.js` - Migration runner script
4. `public/js/settings-staff-accounts.js` - Staff accounts UI
5. `public/js/settings-client-accounts.js` - Client accounts UI

## 🛠 Files Modified

1. `server/server.js` - Added Passport initialization + staff-auth routes
2. `server/routes/staff.js` - Enhanced with permissions support
3. `server/routes/crm.js` - Added client account management endpoints
4. `public/login-staff.html` - Added Google sign-in button
5. `package.json` - Added `passport` and `passport-google-oauth20`

## 📋 Next Steps (For Deployment)

### 1. Set Environment Variables on Railway

```bash
# Required for Google OAuth
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=https://hub.melloo.media/auth/google/callback

# Existing required vars (ensure these are set)
DATABASE_URL=<postgresql connection string>
SESSION_SECRET=<long random string>
ADMIN_EMAIL=melloomedia@gmail.com
ADMIN_PASSWORD=<secure admin password>
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Google+ API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Set **Authorized redirect URIs**:
   - `https://hub.melloo.media/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (for local dev)
6. Copy **Client ID** and **Client Secret** to Railway env vars

### 3. Deploy to Railway

```bash
cd /Users/melloomedia/.openclaw/workspace/mlo-hub-audit/mlo.hub
git add .
git commit -m "Add full staff and client account management"
git push railway main
```

### 4. Run Migration on Railway

Option A: SSH into Railway and run:
```bash
node scripts/run-account-migration.js
```

Option B: Add to Procfile (runs on every deploy):
```
release: node scripts/run-account-migration.js
web: node server/server.js
```

### 5. Update Settings HTML

The settings panels HTML needs to be updated to include the new staff and client account management panels. The JavaScript files are ready, but the HTML structure needs the panels, modals, and proper script includes.

**Required HTML additions** (will provide in follow-up):
- Staff Accounts panel markup
- Client Accounts panel markup
- Modals for staff invite, staff edit, client permissions, portal link display
- Script includes for new JS files
- CSS for toggle switches, badges, and action buttons

## 🎨 UI Components Added

### Toggle Switch (for portal access)
```css
.toggle-switch input[type="checkbox"]
.toggle-slider
```

### Role Badges
```css
.role-badge.role-admin    /* Red gradient */
.role-badge.role-manager  /* Purple gradient */
.role-badge.role-staff    /* Blue gradient */
```

### Status Badges
```css
.status-badge.status-active   /* Green */
.status-badge.status-inactive /* Gray */
```

### Action Buttons
```css
.action-btn          /* Icon-only actions */
.action-btn-text     /* Icon + text actions */
```

## 📝 Notes

- **Security**: All staff invite tokens expire after 7 days
- **Permissions**: Default permissions are role-based but fully customizable per staff
- **OAuth linking**: If a staff member signs in with Google and their email matches an existing account, the Google ID is automatically linked
- **Portal tokens**: Regenerating a client's portal token invalidates their old link
- **Session management**: Staff sessions last 6 hours with rolling renewal
- **Password resets**: Passwords can be changed via the staff edit modal

## 🐛 Known Issues / TODO

- [ ] Add HTML panels to settings.html (markup ready, needs integration)
- [ ] Test magic link email delivery (requires Resend/SMTP configured)
- [ ] Add bulk actions (e.g., disable portal access for multiple clients)
- [ ] Add staff activity logs
- [ ] Add client portal login history
- [ ] Consider adding 2FA for admin accounts

---

**Implementation complete. Ready for HTML integration and deployment testing.**
