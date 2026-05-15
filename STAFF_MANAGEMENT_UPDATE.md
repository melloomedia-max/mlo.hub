# Staff Management Update — Direct Credentials Only

## Changes Made

### ❌ Removed: Magic Link Invites for Staff

**What was removed:**
- `/staff/auth/invite` endpoint (POST)
- `/staff/auth/accept-invite` endpoint (POST)
- `/staff/auth/invite/:token` endpoint (GET)
- Staff invite email flow
- `staff_invites` table usage for staff (table still exists for potential future use)

**Why:**
Magic links create friction and security concerns for staff account management. Admins should have direct control over staff credentials.

---

### ✅ Added: Direct Staff Credential Management

**Admin can now:**

1. **Create new staff accounts directly** via settings panel
   - Set name, email, password
   - Choose role (admin, manager, staff)
   - Configure permissions
   - Account is immediately active

2. **Change staff email addresses**
   - Edit modal includes email field
   - Email can be updated at any time
   - Google OAuth accounts can update email too

3. **Reset staff passwords**
   - Admin types new password in edit modal
   - Password is hashed and stored
   - Password field is optional (only updates if filled)
   - If left blank, existing password remains unchanged

**Frontend changes:**
- Replaced `openInviteStaffModal()` with `openCreateStaffModal()`
- Create staff modal includes: name, email, password, phone, role, permissions
- Edit modal includes email field (editable)
- Edit modal includes password field (optional, resets password if filled)

**Backend changes:**
- Stripped `server/routes/staff-auth.js` down to Google OAuth only
- Existing PUT `/api/staff/:id` already handled email/password updates
- Existing POST `/api/staff` already handled account creation with password

---

## Staff Login Methods

Staff can log in via:

1. **Email + Password** (traditional login)
2. **Google OAuth** (`/staff/auth/google`)

**Not allowed:**
- ❌ Magic link invitations (removed)

---

## Client Portal (Unchanged)

**Clients still use magic links** for portal access:
- Client portal tokens remain functional
- `/api/crm/client-accounts/:id/send-link` still sends portal link emails
- Regenerate token still works
- This is separate from staff authentication

---

## Database

**Staff Table:**
- `email` — Editable by admin
- `password` — Editable by admin (hashed)
- `google_id` — Set automatically via OAuth
- `permissions` — Editable by admin

**staff_invites Table:**
- Still exists (not dropped)
- No longer used for staff workflow
- Can be repurposed or dropped in future migration

---

## Frontend HTML Still Needed

The JavaScript is ready, but the HTML panels still need integration into `settings.html`:

**Create Staff Modal:**
```html
<div id="create-staff-modal" class="modal">
  <form onsubmit="createStaffAccount(event)">
    <input id="create-staff-name" placeholder="Name" required>
    <input id="create-staff-email" type="email" placeholder="Email" required>
    <input id="create-staff-password" type="password" placeholder="Password" required>
    <input id="create-staff-phone" placeholder="Phone (optional)">
    <select id="create-staff-role">
      <option value="staff">Staff</option>
      <option value="manager">Manager</option>
      <option value="admin">Admin</option>
    </select>
    <!-- Permission checkboxes -->
    <button type="submit">Create Account</button>
  </form>
</div>
```

**Edit Staff Modal:**
- Same as before, but email field is now editable
- Password field is optional (admin only fills it to reset password)

---

## Summary

**Before:**
- Staff invited via magic links
- Admin couldn't directly set passwords
- Email was set at invitation and couldn't be changed

**After:**
- Staff created directly by admin
- Admin sets email and password immediately
- Email and password can be changed at any time
- Magic links removed for staff (still used for client portal)

**Status:**
✅ Backend complete  
✅ JavaScript complete  
🔲 HTML integration needed (modals + panels)

---

**Commit:** `b29de11` - "Remove magic link invites for staff, add direct email/password management"

🪢 **melloo — Direct control, no friction.**
