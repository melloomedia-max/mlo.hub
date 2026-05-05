const express = require('express');
const router = express.Router();
const db = require('../database');
const { google } = require('googleapis');
const { hashPassword, verifyPassword } = require('../utils/auth');
const { createMagicLinkToken, verifyMagicLinkToken } = require('../utils/magicLink');
const { sendEmail } = require('../utils/mailService');

// Google OAuth2 Client for client login (separate from admin OAuth)
const oauth2ClientForClients = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL_CLIENT || 'https://portal.melloo.media/auth/google/callback'
);

/**
 * Initiate Google OAuth for client login
 */
router.get('/google', (req, res) => {
    console.log('[client-auth] Initiating Google OAuth for client login');
    const url = oauth2ClientForClients.generateAuthUrl({
        access_type: 'online',
        scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ],
        prompt: 'select_account'
    });
    console.log('[client-auth] Redirecting to:', url);
    res.redirect(url);
});

/**
 * Google OAuth callback for clients
 */
router.get('/google/callback', async (req, res) => {
    console.log('[client-auth] Google OAuth callback hit, query:', req.query);
    const { code, error } = req.query;
    
    if (error) {
        console.error('[client-auth] OAuth error:', error);
        return res.redirect('/login?error=oauth_failed');
    }

    try {
        // Exchange code for tokens
        const { tokens } = await oauth2ClientForClients.getToken(code);
        oauth2ClientForClients.setCredentials(tokens);

        // Get user info
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2ClientForClients });
        const { data } = await oauth2.userinfo.get();
        
        const { id: googleId, email, name, given_name, family_name } = data;

        if (!email) {
            return res.redirect('/login?error=no_email');
        }

        // Check if client exists with this Google ID or email
        db.get(
            `SELECT * FROM clients WHERE google_id = ? OR email = ?`,
            [googleId, email],
            (err, client) => {
                if (err) {
                    console.error('[client-auth] Database error:', err);
                    return res.redirect('/login?error=db');
                }

                console.log('[client-auth] Client lookup result:', { found: !!client, email, googleId });
                
                if (!client) {
                    // No account found - redirect to signup with Google data
                    console.log('[client-auth] No client found, redirecting to signup');
                    return res.redirect(`/signup?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name || '')}&provider=google`);
                }

                console.log('[client-auth] Client found:', { id: client.id, email: client.email, portal_access: client.portal_access, has_token: !!client.portal_token });

                // Update google_id if not set
                if (!client.google_id) {
                    console.log('[client-auth] Updating google_id for client:', client.id);
                    db.run(
                        `UPDATE clients SET google_id = ?, auth_provider = 'google' WHERE id = ?`,
                        [googleId, client.id],
                        (updateErr) => {
                            if (updateErr) console.error('[client-auth] Failed to update google_id:', updateErr);
                            else console.log('[client-auth] google_id updated successfully');
                        }
                    );
                }

                // Check if client has portal access
                if (!client.portal_access || client.portal_token === 'N/A' || !client.portal_token) {
                    console.log('[client-auth] Portal access check failed:', { portal_access: client.portal_access, portal_token: client.portal_token });
                    return res.redirect('/login?error=portal_not_setup');
                }

                // Create session
                req.session.isAuthenticated = true;
                req.session.user = {
                    id: client.id,
                    name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.name || email,
                    role: 'client',
                    email: client.email,
                    portal_token: client.portal_token
                };

                req.session.save(() => {
                    res.redirect(`/portal/${client.portal_token}`);
                });
            }
        );
    } catch (error) {
        console.error('[client-auth] OAuth callback error:', error);
        res.redirect('/login?error=oauth_failed');
    }
});

/**
 * Send magic link to client email
 */
router.post('/magic-link/send', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email required' });
    }

    try {
        // Find client by email
        db.get(
            `SELECT * FROM clients WHERE email = ? AND portal_access = 1`,
            [email],
            async (err, client) => {
                if (err) {
                    console.error('[magic-link] Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (!client) {
                    // Don't reveal if email exists - just say "sent"
                    return res.json({ 
                        success: true, 
                        message: 'If an account exists with this email, a login link has been sent.' 
                    });
                }

                if (!client.portal_token || client.portal_token === 'N/A') {
                    return res.status(400).json({ error: 'Portal not set up for this account' });
                }

                // Generate magic link token
                const token = await createMagicLinkToken(client.id, 15); // 15 min expiry
                const magicLink = `${process.env.PORTAL_BASE_URL || 'https://portal.melloo.media'}/auth/magic-link/verify?token=${token}`;

                // Send email
                const emailBody = `
                    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #1a1a1a;">Sign in to Melloo Portal</h2>
                        <p>Hi ${client.first_name || 'there'},</p>
                        <p>Click the button below to sign in to your client portal. This link will expire in 15 minutes.</p>
                        <div style="margin: 30px 0;">
                            <a href="${magicLink}" 
                               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                Sign In to Portal
                            </a>
                        </div>
                        <p style="color: #666; font-size: 14px;">
                            If you didn't request this link, you can safely ignore this email.
                        </p>
                        <p style="color: #666; font-size: 12px; margin-top: 40px;">
                            Or copy and paste this URL: <br>
                            <span style="color: #2563eb;">${magicLink}</span>
                        </p>
                    </div>
                `;

                await sendEmail(
                    client.email,
                    'Sign in to Melloo Portal',
                    emailBody
                );

                console.log(`[magic-link] Sent login link to ${client.email}`);
                
                res.json({ 
                    success: true, 
                    message: 'Login link sent! Check your email.' 
                });
            }
        );
    } catch (error) {
        console.error('[magic-link] Error sending magic link:', error);
        res.status(500).json({ error: 'Failed to send login link' });
    }
});

/**
 * Verify magic link token and log in
 */
router.get('/magic-link/verify', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.redirect('/login?error=invalid_token');
    }

    try {
        const client = await verifyMagicLinkToken(token);

        if (!client) {
            return res.redirect('/login?error=invalid_or_expired_token');
        }

        if (!client.portal_access || !client.portal_token || client.portal_token === 'N/A') {
            return res.redirect('/login?error=portal_not_setup');
        }

        // Create session
        req.session.isAuthenticated = true;
        req.session.user = {
            id: client.id,
            name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.name || client.email,
            role: 'client',
            email: client.email,
            portal_token: client.portal_token
        };

        req.session.save(() => {
            res.redirect(`/portal/${client.portal_token}`);
        });
    } catch (error) {
        console.error('[magic-link] Verification error:', error);
        res.redirect('/login?error=verification_failed');
    }
});

/**
 * Client signup endpoint (from website CTA)
 */
router.post('/signup', (req, res) => {
    const { first_name, last_name, email, phone, company, message } = req.body;

    if (!first_name || !last_name || !email) {
        return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    // Check if email already exists
    db.get(
        `SELECT id FROM clients WHERE email = ?`,
        [email],
        (err, existing) => {
            if (err) {
                console.error('[signup] Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (existing) {
                return res.status(400).json({ error: 'An account with this email already exists. Try signing in instead.' });
            }

            // Insert into client_signups table for admin approval
            db.run(
                `INSERT INTO client_signups (first_name, last_name, email, phone, company, message) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [first_name, last_name, email, phone || null, company || null, message || null],
                function(insertErr) {
                    if (insertErr) {
                        console.error('[signup] Insert error:', insertErr);
                        return res.status(500).json({ error: 'Failed to create signup request' });
                    }

                    console.log(`[signup] New signup request from ${email} (ID: ${this.lastID})`);

                    // TODO: Send notification to admin about new signup

                    res.json({ 
                        success: true, 
                        message: 'Thank you! Your request has been submitted. We\'ll be in touch soon.' 
                    });
                }
            );
        }
    );
});

// TEMPORARY DEBUG - Preview APP_PASSWORD (REMOVE AFTER CHECKING)
router.get('/debug-app-password', (req, res) => {
    res.json({ 
        appPasswordPreview: process.env.APP_PASSWORD?.substring(0, 4) + '****',
        appPasswordSet: !!process.env.APP_PASSWORD
    });
});

module.exports = router;
