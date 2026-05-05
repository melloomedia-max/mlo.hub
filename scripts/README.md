# Scripts Directory

## Available Scripts

### `get-drive-token.js`
**Purpose:** One-time setup script to generate a Google OAuth refresh token with Drive scopes.

**When to use:** Before implementing file upload features that require Google Drive access.

**Instructions:** See `DRIVE_TOKEN_SETUP.md` for complete setup guide.

**Quick start:**
```bash
node scripts/get-drive-token.js
```

---

### `add-client-auth.sql`
**Purpose:** Database migration to add Google OAuth and magic link authentication columns to the `clients` table.

**Status:** Already run. This was part of the initial authentication enhancement.

---

### `reset-staff-password.js`
**Purpose:** Generate a fresh PBKDF2 password hash for staff login troubleshooting.

**When to use:** When staff login becomes desynced from Railway `APP_PASSWORD` environment variable.

**Usage:**
```bash
node scripts/reset-staff-password.js <email> <new-password>
```

---

## Adding New Scripts

1. Create the script in this directory
2. Add a brief description here
3. If it requires setup, create a companion `.md` file with detailed instructions
