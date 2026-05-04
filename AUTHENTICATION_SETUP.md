# Client Portal Authentication Setup

## ✅ What's Been Added

1. **Google OAuth Login** for clients
2. **Magic Link Email Authentication** (passwordless)
3. **Client Signup Form** for new account requests
4. **Enhanced Login UI** with multiple auth options

## 🔧 Required Environment Variables

Add these to your `.env` file (local) and Railway environment variables (production):

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URL_CLIENT=https://portal.melloo.media/auth/google/callback

# Portal Base URL (for magic link emails)
PORTAL_BASE_URL=https://portal.melloo.media
```

## 📋 Setting Up Google OAuth

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Name it "Melloo Client Portal" or similar

### 2. Enable Google OAuth

1. In your project, go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Configure OAuth consent screen:
   - User Type: **External**
   - App name: **Melloo Client Portal**
   - Support email: **melloomedia@gmail.com**
   - Authorized domains: **melloo.media**
   - Scopes: Add `userinfo.email` and `userinfo.profile`

### 3. Create OAuth Client ID

1. Application type: **Web application**
2. Name: **Melloo Portal Client Login**
3. Authorized redirect URIs:
   ```
   http://localhost:3030/auth/google/callback
   https://portal.melloo.media/auth/google/callback
   ```
4. Click **Create**
5. Copy your **Client ID** and **Client Secret**

### 4. Add to Environment

**Local (.env):**
```bash
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz
GOOGLE_REDIRECT_URL_CLIENT=http://localhost:3030/auth/google/callback
PORTAL_BASE_URL=http://localhost:3030
```

**Production (Railway):**
```bash
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123xyz
GOOGLE_REDIRECT_URL_CLIENT=https://portal.melloo.media/auth/google/callback
PORTAL_BASE_URL=https://portal.melloo.media
```

## 🗄️ Database Schema Changes

The following tables and columns have been added automatically:

### New Columns in `clients` table:
- `password` - Hashed password for traditional login
- `auth_provider` - Track login method (password, google, magic_link)
- `google_id` - Google OAuth user ID for account linking

### New Table: `magic_link_tokens`
Stores temporary login tokens for email-based authentication:
- `id` - Primary key
- `client_id` - References clients.id
- `token` - Unique login token
- `expires_at` - Token expiration (15 minutes)
- `used` - Whether token has been consumed

### New Table: `client_signups`
Stores new account requests from website:
- `id` - Primary key
- `first_name`, `last_name`, `email`, `phone`, `company`
- `message` - What brings them to Melloo
- `status` - pending, approved, rejected
- `created_at`
- `converted_to_client_id` - Links to clients table when approved

## 📧 Email Service Setup

Magic links use the existing **Resend** email service configured with:
```bash
RESEND_API_KEY=re_...
MAIL_FROM=Melloo Media <noreply@melloo.media>
```

No additional setup needed if emails are already working.

## 🚀 Client Login Flow

### Option 1: Google OAuth
1. Client clicks "Continue with Google"
2. Redirects to Google sign-in
3. Google returns to `/auth/google/callback`
4. System checks if email exists in `clients` table
5. If found → create session and redirect to portal
6. If not found → redirect to signup with pre-filled Google data

### Option 2: Magic Link
1. Client enters email
2. System generates secure token and sends email
3. Client clicks link in email
4. Token verified, session created
5. Redirect to portal

### Option 3: Password
1. Client enters email + password
2. System verifies against hashed password in database
3. Create session and redirect to portal

## 🔐 Security Features

- **PBKDF2 password hashing** with salt (1000 iterations, SHA-512)
- **Magic link tokens** expire in 15 minutes and are single-use
- **Google OAuth** handled by Google (no password storage needed)
- **Session-based auth** with httpOnly cookies
- **Host-aware routing** (hub vs portal domains)

## 🌐 Adding "Create Account" Button to Website

Add this to your Framer website (melloo.media):

```html
<a href="https://portal.melloo.media/signup" 
   style="padding: 12px 24px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">
  Create Account
</a>
```

Or if using a button component, link it to:
```
https://portal.melloo.media/signup
```

## 📝 Managing Signup Requests

New signup requests go into the `client_signups` table with status `pending`.

**To approve a signup:**

1. Review request in CRM (you'll need to add a UI for this in Mission Control or Hub)
2. Create client record in `clients` table
3. Generate `portal_token` for them
4. Set `portal_access = 1`
5. Send welcome email with login instructions
6. Update `client_signups.status = 'approved'` and link to `clients.id`

**Quick SQL to view pending signups:**
```sql
SELECT * FROM client_signups WHERE status = 'pending' ORDER BY created_at DESC;
```

## 🧪 Testing

### Local Testing (http://localhost:3030)

1. Start server: `cd mlo-hub-audit/mlo.hub && npm start`
2. Visit: `http://localhost:3030/login` (should show password form for staff)
3. Visit: `http://portal.localhost:3030/login` (won't work without DNS, but `/signup` will)
4. Test signup: `http://localhost:3030/signup`

### Production Testing

1. Deploy to Railway with all env vars set
2. Visit `https://portal.melloo.media/login`
3. Should see three options: Google, Magic Link, Password

## 🔄 Migration Script

The database migration has already been run automatically when you start the server.

If you need to run it manually:
```bash
cd mlo-hub-audit/mlo.hub
sqlite3 agency.db < scripts/add-client-auth.sql
```

## 🚨 Troubleshooting

**"Google OAuth failed"**
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Verify redirect URL matches exactly in Google Cloud Console
- Make sure OAuth consent screen is configured

**"Magic link not sending"**
- Check `RESEND_API_KEY` is valid
- Verify `MAIL_FROM` domain is verified in Resend
- Check server logs for email errors

**"Portal not set up for this account"**
- Client needs `portal_access = 1` in database
- Client needs a valid `portal_token` (not 'N/A')
- Generate token for client: `UPDATE clients SET portal_token = '<random>', portal_access = 1 WHERE id = ?`

## ✨ Next Steps

1. **Set up Google OAuth credentials** (see above)
2. **Add signup management UI** to Hub/Mission Control
3. **Add "Create Account" button** to melloo.media Framer site
4. **Test all three login methods** on portal.melloo.media
5. **Send test magic link** to verify email delivery
6. **Create welcome email template** for new client approvals
