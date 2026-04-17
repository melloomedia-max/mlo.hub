console.log("[BOOT] Server boot process started...");
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
console.log("[BOOT] Loading environment variables...");
require('dotenv').config();
const { google } = require('googleapis');

console.log("[BOOT] Initializing database connection...");
const db = require('./database');
console.log("[BOOT] Loading route modules...");
// Admin Account Audit
db.get("SELECT email, role, status, password FROM staff WHERE email = 'melloomedia@gmail.com'", (err, row) => {
    console.log("[BOOT-AUDIT] Admin account check for melloomedia@gmail.com:");
    console.log(` - Admin exists: ${!!row ? 'YES' : 'NO'}`);
    if (row) {
        console.log(` - Admin active: ${row.status === 'active' ? 'YES' : 'NO'}`);
        console.log(` - Admin role: ${row.role}`);
        console.log(` - Password hash present: ${!!row.password ? 'YES' : 'NO'}`);
    }
});

// --- FORCE ADMIN SYNC ---
// This ensures that even if migrations or manual steps failed, the admin account is ready.
setTimeout(() => {
    const email = 'melloomedia@gmail.com';
    const pass = 'melloo';
    const { hashPassword } = require('./utils/auth');
    const hashed = hashPassword(pass);
    
    db.get("SELECT id FROM staff WHERE email = ?", [email], (err, row) => {
        if (err) return console.error("[BOOT-SYNC] Error checking admin:", err.message);
        
        if (row) {
            db.run("UPDATE staff SET password = ?, role = 'admin', status = 'active' WHERE id = ?", [hashed, row.id], (updErr) => {
                if (!updErr) console.log(`[BOOT-SYNC] Successfully UPDATED admin account: ${email}`);
                else console.error("[BOOT-SYNC] Update failed:", updErr.message);
            });
        } else {
            db.run("INSERT INTO staff (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)", 
                ['Admin', email, hashed, 'admin', 'active'], (insErr) => {
                if (!insErr) console.log(`[BOOT-SYNC] Successfully CREATED admin account: ${email}`);
                else console.error("[BOOT-SYNC] Insert failed:", insErr.message);
            });
        }
    });
}, 2000); // Small delay to ensure DB is fully ready


const tasksRoutes = require('./routes/tasks');
const meetingsRoutes = require('./routes/meetings');
const crmRoutes = require('./routes/crm');
const timeRoutes = require('./routes/time');
const invoicesRoutes = require('./routes/invoices');
const revenueRoutes = require('./routes/revenue');
const billingRoutes = require('./routes/billing');
const portalRoutes = require('./routes/portal');
const campaignsRoutes = require('./routes/campaigns');
const subscriptionsRoutes = require('./routes/subscriptions');
const staffRoutes = require('./routes/staff');
const archivesRoutes = require('./routes/archives');
const settingsRoutes = require('./routes/settings');
const { verifyPassword, hashPassword, requireAuth } = require('./utils/auth');
const { startArchiveScheduler } = require('./jobs/archiveScheduler');

console.log("[BOOT] Creating Express app instance...");
const app = express();
console.log("[BOOT] Configuring middleware...");
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    console.warn("\n=======================================================");
    console.warn("⚠️  WARNING: APP_PASSWORD or SESSION_SECRET is missing!");
    console.warn("   Your Agency Hub login is unsecured or unstable.");
    console.warn("   Please define both variables in your Railway env.");
    console.warn("=======================================================\n");
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

console.log("[BOOT] Setting up session middleware...");
const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { 
        httpOnly: true,
        sameSite: 'lax',
        secure: true,
        maxAge: 1000 * 60 * 60 * 6 // 6 hours
    }
}));
console.log("[BOOT] Registering authentication routes...");

// --- Pure Server Auth Middleware ---
app.get('/login', (req, res) => {
    // Migration: Create initial admin if none exists
    db.get('SELECT id FROM staff WHERE role = "admin" LIMIT 1', (err, row) => {
        if (!row && process.env.APP_PASSWORD) {
            const hashed = hashPassword(process.env.APP_PASSWORD);
            db.run('INSERT INTO staff (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)', 
                ['Admin', 'melloomedia@gmail.com', hashed, 'admin', 'active'], (err) => {
                    if (!err) console.log('[AUTH] Created initial admin: melloomedia@gmail.com');
                });
        }
    });

    const loginPath = path.join(__dirname, '../public/login.html');
    res.sendFile(loginPath);
});

app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const { email, password } = req.body;
    const adminPass = process.env.APP_PASSWORD;

    // Check staff accounts in DB
    db.get('SELECT * FROM staff WHERE email = ?', [email], (err, user) => {
        console.log(`[AUTH-DEBUG] Attempt for: ${email}`);
        console.log(` - User found: ${!!user ? 'YES' : 'NO'}`);
        
        if (err) {
            console.error("[AUTH-DEBUG] DB Error:", err.message);
            return res.redirect('/login?error=db');
        }

        if (user) {
            console.log(` - Active: ${user.status === 'active' ? 'YES' : 'NO'}`);
            console.log(` - Role: ${user.role}`);
            const match = verifyPassword(password, user.password);
            console.log(` - Password verified: ${match ? 'YES' : 'NO'}`);

            if (user.status === 'active' && match) {
                console.log(`[AUTH] Login success for user: ${email}`);
                req.session.isAuthenticated = true;
                req.session.user = { id: user.id, name: user.name, role: user.role, email: user.email };
                return req.session.save(() => res.redirect('/'));
            }
        }

        // Legacy Fallback (only if email matches adminPass or APP_PASSWORD exactly)
        if (!email && password === adminPass) {
            console.log('[AUTH] Legacy password login success');
            req.session.isAuthenticated = true;
            req.session.user = { id: 0, name: 'Legacy Admin', role: 'admin', email: 'legacy@agency.com' };
            return req.session.save(() => res.redirect('/'));
        }

        console.log(`[AUTH] Login failed for: ${email}`);
        res.redirect('/login?error=invalid');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// requireAuth moved to utils/auth.js

// Explicit Root Handler
app.get('/', requireAuth, (req, res) => {
    const indexPath = path.join(__dirname, '../public/index.html');
    console.log(`[AUTH-CHECK] Serving index from: ${indexPath}`);
    res.sendFile(indexPath);
});

// Explicit Settings Handler (ADMIN ONLY)
app.get('/settings', requireAdmin, (req, res) => {
    const settingsPath = path.join(__dirname, '../public/settings.html');
    console.log(`[AUTH-CHECK] Serving settings from: ${settingsPath}`);
    res.sendFile(settingsPath);
});

// Explicit Portal Handler
app.get('/portal', (req, res) => {
    const portalPath = path.join(__dirname, '../public/portal.html');
    console.log(`[AUTH-CHECK] Serving portal from: ${portalPath}`);
    res.sendFile(portalPath);
});


// Authenticated Heartbeat
app.get('/api/session/ping', requireAuth, (req, res) => {
    res.json({ ok: true });
});

// Auth Status for Frontend
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.isAuthenticated && req.session.user) {
        res.json({
            loggedIn: true,
            user: req.session.user
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Intercept specific routes
app.use((req, res, next) => {
    const route = req.path;
    const protectedRoutes = ['/', '/dashboard', '/clients', '/invoices', '/meetings', '/campaigns', '/settings', '/index.html', '/settings.html'];
    
    // Always skip these completely
    if (route === '/oauth2callback' || route.startsWith('/auth/google') || route === '/login' || route === '/logout') return next();
    if (route.startsWith('/portal') || route.match(/^\/api\/[A-Z0-9]{30,}/i)) return next();
    if (route.startsWith('/css/') || route.startsWith('/img/') || route.startsWith('/js/components/')) return next();

    // Catch exactly the specified frontend routes or API logic
    if (protectedRoutes.includes(route) || route.startsWith('/api/')) {
        // Special Case: Settings page and specific APIs are Admin Only
        const adminOnlyRoutes = ['/settings', '/settings.html', '/api/staff', '/api/billing', '/api/revenue', '/api/archives'];
        if (adminOnlyRoutes.some(r => route === r || route.startsWith(r + '/'))) {
            return requireAdmin(req, res, next);
        }
        return requireAuth(req, res, next);
    }
    
    next();
});
// -------------------------

app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        }
    }
}));

// Debug logger
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.url}`);
    next();
});

console.log("[BOOT] Registering API routes...");

// Routes
app.use('/api/tasks', tasksRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/time', timeRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/revenue', revenueRoutes);
app.use('/api/billing', billingRoutes);
app.use('/portal', portalRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/archives', archivesRoutes);
app.use('/api/settings', settingsRoutes);

// Alias for testing
app.get('/api/email-templates', async (req, res) => {
    try {
        db.all('SELECT * FROM email_templates ORDER BY name ASC', [], (err, rows) => {
            if (err) throw err;
            res.json(rows);
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Google OAuth Helpers
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

app.get('/api/auth/status', (req, res) => {
    res.json({
        isAuthenticated: !!process.env.GOOGLE_REFRESH_TOKEN,
        email: 'melloomedia@gmail.com'
    });
});

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force consent to ensure we get a refresh token
        scope: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/meetings.space.created',
            'https://www.googleapis.com/auth/meetings.space.readonly',
            'https://www.googleapis.com/auth/meetings.conference.media.readonly',
            'https://www.googleapis.com/auth/tasks.readonly',
            'https://www.googleapis.com/auth/documents'
        ]
    });
    res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Verify the email address
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const userEmail = userInfo.data.email;

        if (userEmail !== 'melloomedia@gmail.com') {
            return res.status(403).send(`
                <h1>Authentication Failed</h1>
                <p>You signed in as <strong>${userEmail}</strong>.</p>
                <p>Please sign in with <strong>melloomedia@gmail.com</strong> to be the host.</p>
                <a href="/auth/google">Try Again</a>
            `);
        }

        // Only update if we actually got a refresh token
        if (tokens.refresh_token) {
            // Update .env file automatically
            const envPath = path.join(__dirname, '../.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            } else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }

            fs.writeFileSync(envPath, envContent);

            // Update the environment variable in memory immediately
            process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
        }

        res.send(`
            <h1>Authentication Successful</h1>
            <p><strong>${userEmail}</strong> is now set as the meeting host.</p>
            <p>The system is ready to create meetings.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
        `);
    } catch (error) {
        res.status(500).send('Error retrieving access token: ' + error.message);
    }
});

console.log("[BOOT] Attempting to listen on port", PORT, "...");
// Start server
try {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`[BOOT] Agency Hub running on port ${PORT}`);
        console.log("SERVER STARTUP COMPLETE");
        
        try {
            // Start Drip Campaign Engine
            const { runDueSends } = require('./utils/campaignRunner');
            runDueSends();
            setInterval(runDueSends, 60 * 1000); // Check every minute instead of every hour

            // Start Recurring Billing Engine
            const { processSubscriptions } = require('./utils/subscriptionEngine');
            processSubscriptions();
            setInterval(processSubscriptions, 12 * 60 * 60 * 1000); // Every 12 hours

            // Start Archive Scheduler
            startArchiveScheduler();
        } catch (jobErr) {
            console.error("[BOOT-ERROR] Failed to initialize background jobs:", jobErr);
        }
    });

    server.on('error', (e) => {
        console.error("[BOOT-FATAL] Server socket error:", e);
    });
} catch (listenErr) {
    console.error("[BOOT-FATAL] Failed to start server listening:", listenErr);
}
