const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../database');

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

module.exports = router;
