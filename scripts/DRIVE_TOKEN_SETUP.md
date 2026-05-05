# Google Drive OAuth Token Setup

**Goal:** Generate a fresh `GOOGLE_REFRESH_TOKEN` with Drive upload scopes.

---

## Prerequisites

1. **Google Cloud Console access** (you created the OAuth client for Melloo Hub)
2. **Local access** to this repo with `npm install` already run
3. **Environment variables** set in `.env`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

---

## Step 1: Add Temporary Redirect URI

Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)

1. Click on your **OAuth 2.0 Client ID** (the one used for Melloo Hub)
2. Under **Authorized redirect URIs**, click **+ ADD URI**
3. Add: `http://localhost:3000/oauth2callback`
4. Click **SAVE**

> ⚠️ **You'll remove this after getting the token** — it's only needed for this one-time setup.

---

## Step 2: Enable Google Drive API

Go to [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library)

1. Search for **"Google Drive API"**
2. Click **ENABLE** (if not already enabled)

---

## Step 3: Run the Token Generator Script

In your terminal, from the `mlo.hub/` directory:

```bash
node scripts/get-drive-token.js
```

**What happens:**
1. Script opens your browser to Google's consent screen
2. You authorize Drive access for Melloo Hub
3. Google redirects back to `http://localhost:3000/oauth2callback`
4. Script prints your **refresh token** to the console

**Example output:**
```
=== SUCCESS ===

Copy this refresh token into Railway as GOOGLE_REFRESH_TOKEN:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1//0gHDkV8xYz...long_token_string...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scopes granted: https://www.googleapis.com/auth/drive.file, https://www.googleapis.com/auth/drive
```

---

## Step 4: Update Railway Environment Variable

1. Go to [Railway dashboard](https://railway.app) → Your Melloo Hub project
2. Click **Variables** tab
3. Find `GOOGLE_REFRESH_TOKEN` or create it if missing
4. Paste the token from Step 3
5. Click **Save** (Railway will auto-redeploy)

---

## Step 5: Remove Temporary Redirect URI

Go back to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)

1. Click your OAuth client
2. Under **Authorized redirect URIs**, find `http://localhost:3000/oauth2callback`
3. Click the **X** to remove it
4. Click **SAVE**

---

## Step 6: Verify Drive Access

After Railway redeploys, run this in the Railway shell:

```bash
railway shell
```

Then:

```javascript
node -e "const {google} = require('googleapis'); const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET); o.setCredentials({refresh_token: process.env.GOOGLE_REFRESH_TOKEN}); google.drive({version:'v3',auth:o}).files.list({pageSize:1}).then(r => console.log('✓ Drive access OK')).catch(e => console.error('✗ Drive access failed:', e.message));"
```

**Expected:** `✓ Drive access OK`

---

## Troubleshooting

### "Error: redirect_uri_mismatch"
- Make sure you added `http://localhost:3000/oauth2callback` to Google Cloud Console
- Make sure you saved the change

### "Browser won't open"
- Copy the URL from the terminal and paste it into your browser manually

### "Error: invalid_client"
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` match Google Cloud Console

### "No refresh token in response"
- The script uses `prompt: 'consent'` to force a fresh consent screen
- If you've authorized this app before, you may need to revoke access first:
  - Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
  - Find your OAuth app and click **Remove Access**
  - Run the script again

---

## Ready to Build

Once Step 6 shows `✓ Drive access OK`, you're ready to build the file upload feature.
