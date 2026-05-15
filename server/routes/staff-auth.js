const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../database');
const crypto = require('crypto');
const { sendMail } = require('../utils/mailService');

// Configure Google OAuth Strategy for Staff
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use('google-staff', new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://hub.melloo.media/auth/google/callback',
        passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
        try {
            const googleId = profile.id;
            const email = profile.emails[0].value;
            const name = profile.displayName;

            // Check if staff member exists with this Google ID
            let staff = await db.getAsync('SELECT * FROM staff WHERE google_id = $1', [googleId]);
            
            if (!staff) {
                // Check if email matches existing staff
                staff = await db.getAsync('SELECT * FROM staff WHERE email = $1', [email]);
                
                if (staff) {
                    // Link Google ID to existing staff account
                    await db.runAsync('UPDATE staff SET google_id = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2', [googleId, staff.id]);
                    staff.google_id = googleId;
                } else {
                    // No matching staff account
                    return done(null, false, { message: 'No staff account found for this Google account' });
                }
            } else {
                // Update last login
                await db.runAsync('UPDATE staff SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [staff.id]);
            }

            // Check if account is active
            if (staff.status !== 'active') {
                return done(null, false, { message: 'Account is inactive' });
            }

            return done(null, staff);
        } catch (error) {
            return done(error);
        }
    }));
}

// Serialize/deserialize for session
passport.serializeUser((user, done) => {
    done(null, { id: user.id, type: 'staff' });
});

passport.deserializeUser(async (sessionData, done) => {
    try {
        if (sessionData.type === 'staff') {
            const staff = await db.getAsync('SELECT * FROM staff WHERE id = $1', [sessionData.id]);
            done(null, staff);
        } else {
            done(new Error('Invalid session type'));
        }
    } catch (error) {
        done(error);
    }
});

/**
 * Initiate Google OAuth for staff login
 */
router.get('/google', 
    passport.authenticate('google-staff', { 
        scope: ['profile', 'email']
    })
);

/**
 * Google OAuth callback for staff
 */
router.get('/google/callback', 
    passport.authenticate('google-staff', { 
        failureRedirect: '/login?error=oauth_failed' 
    }),
    (req, res) => {
        // Successful authentication
        req.session.isAuthenticated = true;
        req.session.user = {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role
        };
        res.redirect('/');
    }
);

/**
 * Send magic link invitation to new staff member
 */
router.post('/invite', async (req, res) => {
    try {
        const { email, role, permissions } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Check if staff already exists
        const existing = await db.getAsync('SELECT id FROM staff WHERE email = $1', [email]);
        if (existing) {
            return res.status(400).json({ error: 'Staff member with this email already exists' });
        }

        // Generate secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        // Store invitation
        await db.runAsync(
            `INSERT INTO staff_invites (email, token, role, permissions, invited_by, expires_at) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [email, token, role || 'staff', JSON.stringify(permissions || {}), req.session.user.id, expiresAt]
        );

        // Send invitation email
        const inviteLink = `https://hub.melloo.media/staff/accept-invite?token=${token}`;
        await sendMail({
            to: email,
            subject: 'You\'ve been invited to join Melloo Media Hub',
            html: `
                <h2>Welcome to Melloo Media!</h2>
                <p>You've been invited to join the team as a <strong>${role || 'staff'}</strong> member.</p>
                <p>Click the link below to set up your account:</p>
                <p><a href="${inviteLink}" style="background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a></p>
                <p>This link will expire in 7 days.</p>
                <p style="color: #666; font-size: 14px;">Or copy this link: ${inviteLink}</p>
            `
        });

        res.json({ success: true, message: 'Invitation sent successfully' });
    } catch (error) {
        console.error('[STAFF-INVITE] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Accept staff invitation and create account
 */
router.post('/accept-invite', async (req, res) => {
    try {
        const { token, name, password } = req.body;

        if (!token || !name || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Find invitation
        const invite = await db.getAsync(
            'SELECT * FROM staff_invites WHERE token = $1 AND used = 0 AND expires_at > CURRENT_TIMESTAMP',
            [token]
        );

        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired invitation' });
        }

        // Check if email already exists (race condition check)
        const existing = await db.getAsync('SELECT id FROM staff WHERE email = $1', [invite.email]);
        if (existing) {
            return res.status(400).json({ error: 'Account already exists' });
        }

        // Create staff account
        const { hashPassword } = require('../utils/auth');
        const hashedPassword = hashPassword(password);

        const staffId = await db.insertAsync(
            `INSERT INTO staff (name, email, password, role, permissions, invited_by, status) 
             VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
            [name, invite.email, hashedPassword, invite.role, invite.permissions, invite.invited_by]
        );

        // Mark invitation as used
        await db.runAsync('UPDATE staff_invites SET used = 1 WHERE id = $1', [invite.id]);

        res.json({ success: true, message: 'Account created successfully' });
    } catch (error) {
        console.error('[ACCEPT-INVITE] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get invitation details (for pre-filling form)
 */
router.get('/invite/:token', async (req, res) => {
    try {
        const invite = await db.getAsync(
            'SELECT email, role FROM staff_invites WHERE token = $1 AND used = 0 AND expires_at > CURRENT_TIMESTAMP',
            [req.params.token]
        );

        if (!invite) {
            return res.status(404).json({ error: 'Invalid or expired invitation' });
        }

        res.json({ email: invite.email, role: invite.role });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
