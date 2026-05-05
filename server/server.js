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

// --- Admin Bootstrap (env-driven, runs once if no admin exists) ---
// Set ADMIN_EMAIL + ADMIN_PASSWORD in Railway to seed the initial admin.
// On subsequent boots this is a no-op. Passwords must be changed via the
// Settings UI or a future password-reset flow — never hard-coded.
setTimeout(() => {
    const adminEmail = process.env.ADMIN_EMAIL || 'melloomedia@gmail.com';
    const adminPass = process.env.ADMIN_PASSWORD || process.env.APP_PASSWORD;

    if (!adminPass) {
        console.warn("[BOOT] No ADMIN_PASSWORD/APP_PASSWORD set — skipping admin bootstrap.");
        return;
    }

    const { hashPassword } = require('./utils/auth');

    db.get("SELECT id FROM staff WHERE email = ?", [adminEmail], (err, row) => {
        if (err) return console.error("[BOOT] Admin lookup error:", err.message);
        if (row) {
            // Admin already exists — ensure role/status are correct but never rotate password at boot.
            // Password changes must go through Settings UI or a proper password-reset flow.
            db.run(
                "UPDATE staff SET role = 'admin', status = 'active' WHERE id = ? AND (role != 'admin' OR status != 'active')",
                [row.id],
                (updErr) => {
                    if (updErr) console.error("[BOOT] Admin role/status fix failed:", updErr.message);
                }
            );
            return;
        }
        // No admin yet — seed one from env.
        const hashed = hashPassword(adminPass);
        db.run(
            "INSERT INTO staff (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)",
            ['Admin', adminEmail, hashed, 'admin', 'active'],
            (insErr) => {
                if (insErr) console.error("[BOOT] Admin seed failed:", insErr.message);
                else console.log(`[BOOT] Seeded initial admin: ${adminEmail}`);
            }
        );
    });
}, 2000);


let tasksRoutes, emailRoutes, meetingsRoutes, crmRoutes, timeRoutes, invoicesRoutes, revenueRoutes, billingRoutes, portalRoutes, campaignsRoutes, subscriptionsRoutes, staffRoutes, archivesRoutes, settingsRoutes, intakeRoutes, proposalsRoutes, clientAuthRoutes;
let verifyPassword, hashPassword, requireAuth, requireAdmin, startArchiveScheduler;

try { tasksRoutes = require('./routes/tasks'); console.log('[BOOT] ✓ tasks'); } catch(e) { console.error('[BOOT] ✗ tasks:', e.message); }
try { emailRoutes = require('./routes/email'); console.log('[BOOT] ✓ email'); } catch(e) { console.error('[BOOT] ✗ email:', e.message); }
try { meetingsRoutes = require('./routes/meetings'); console.log('[BOOT] ✓ meetings'); } catch(e) { console.error('[BOOT] ✗ meetings:', e.message); }
try { crmRoutes = require('./routes/crm'); console.log('[BOOT] ✓ crm'); } catch(e) { console.error('[BOOT] ✗ crm:', e.message); }
try { timeRoutes = require('./routes/time'); console.log('[BOOT] ✓ time'); } catch(e) { console.error('[BOOT] ✗ time:', e.message); }
try { invoicesRoutes = require('./routes/invoices'); console.log('[BOOT] ✓ invoices'); } catch(e) { console.error('[BOOT] ✗ invoices:', e.message); }
try { revenueRoutes = require('./routes/revenue'); console.log('[BOOT] ✓ revenue'); } catch(e) { console.error('[BOOT] ✗ revenue:', e.message); }
try { billingRoutes = require('./routes/billing'); console.log('[BOOT] ✓ billing'); } catch(e) { console.error('[BOOT] ✗ billing:', e.message); }
try { portalRoutes = require('./routes/portal'); console.log('[BOOT] ✓ portal'); } catch(e) { console.error('[BOOT] ✗ portal:', e.message); }
try { campaignsRoutes = require('./routes/campaigns'); console.log('[BOOT] ✓ campaigns'); } catch(e) { console.error('[BOOT] ✗ campaigns:', e.message); }
try { subscriptionsRoutes = require('./routes/subscriptions'); console.log('[BOOT] ✓ subscriptions'); } catch(e) { console.error('[BOOT] ✗ subscriptions:', e.message); }
try { staffRoutes = require('./routes/staff'); console.log('[BOOT] ✓ staff'); } catch(e) { console.error('[BOOT] ✗ staff:', e.message); }
try { archivesRoutes = require('./routes/archives'); console.log('[BOOT] ✓ archives'); } catch(e) { console.error('[BOOT] ✗ archives:', e.message); }
try { settingsRoutes = require('./routes/settings'); console.log('[BOOT] ✓ settings'); } catch(e) { console.error('[BOOT] ✗ settings:', e.message); }
try { intakeRoutes = require('./routes/intake'); console.log('[BOOT] ✓ intake'); } catch(e) { console.error('[BOOT] ✗ intake:', e.message); }
try { proposalsRoutes = require('./routes/proposals'); console.log('[BOOT] ✓ proposals'); } catch(e) { console.error('[BOOT] ✗ proposals:', e.message); }
try { clientAuthRoutes = require('./routes/client-auth'); console.log('[BOOT] ✓ client-auth'); } catch(e) { console.error('[BOOT] ✗ client-auth:', e.message); }
try { ({ verifyPassword, hashPassword, requireAuth, requireAdmin } = require('./utils/auth')); console.log('[BOOT] ✓ auth utils'); } catch(e) { console.error('[BOOT] ✗ auth utils:', e.message); }
try { ({ startArchiveScheduler } = require('./jobs/archiveScheduler')); console.log('[BOOT] ✓ archiveScheduler'); } catch(e) { console.error('[BOOT] ✗ archiveScheduler:', e.message); }

console.log("[BOOT] Creating Express app instance...");
const app = express();
console.log("[BOOT] Configuring middleware...");
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

if ((!process.env.APP_PASSWORD && !process.env.ADMIN_PASSWORD) || !process.env.SESSION_SECRET) {
    console.warn("\n=======================================================");
    console.warn("⚠️  WARNING: ADMIN_PASSWORD/APP_PASSWORD or SESSION_SECRET is missing!");
    console.warn("   Your Agency Hub login is unsecured or unstable.");
    console.warn("   Set ADMIN_EMAIL, ADMIN_PASSWORD, and SESSION_SECRET in Railway.");
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

// Domain Detection Middleware
app.use((req, res, next) => {
    const host = req.get('host') || '';
    req.isPortal = host.startsWith('portal.');
    req.isHub = host.startsWith('hub.') || !req.isPortal; // Default to Hub if not explicitly Portal
    next();
});

// --- Debug Route (Remove After Confirming) ---
app.get('/debug/host', (req, res) => {
    res.json({
        hostname: req.hostname,
        host: req.get('host'),
        'x-forwarded-host': req.get('x-forwarded-host'),
        'x-original-host': req.get('x-original-host'),
        headers: req.headers
    });
});

// --- Pure Server Auth Middleware ---
app.get('/login', (req, res) => {
    // Server-side routing based on host header (works behind Railway proxy)
    const host = req.get('host') || req.hostname || '';
    const isPortal = host.startsWith('portal.');
    
    // Debug logging
    console.log(`[login] host=${host} hostname=${req.hostname} isPortal=${isPortal}`);
    
    // Prevent caching of login page
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    if (isPortal) {
        // Client portal login (Google OAuth, Magic Link, Password)
        const clientLoginPath = path.join(__dirname, '../public/login-client.html');
        console.log(`[login] Serving client login: ${clientLoginPath}`);
        res.sendFile(clientLoginPath);
    } else {
        // Staff hub login (password-only)
        const staffLoginPath = path.join(__dirname, '../public/login-staff.html');
        console.log(`[login] Serving staff login: ${staffLoginPath}`);
        res.sendFile(staffLoginPath);
    }
});

app.get('/signup', (req, res) => {
    const signupPath = path.join(__dirname, '../public/signup.html');
    res.sendFile(signupPath);
});

app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const { email, password } = req.body;
    const adminPass = process.env.APP_PASSWORD;

    if (req.isPortal) {
        // Portal Login (Clients)
        db.get('SELECT * FROM clients WHERE email = ?', [email], (err, user) => {
            if (err) return res.redirect('/login?error=db');
            if (user && user.password && verifyPassword(password, user.password)) {
                req.session.isAuthenticated = true;
                req.session.user = { 
                    id: user.id, 
                    name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name, 
                    role: 'client', 
                    email: user.email,
                    portal_token: user.portal_token
                };
                
                const portalToken = user.portal_token;
                if (!portalToken || portalToken === 'N/A') {
                    return req.session.save(() => res.redirect('/login?error=portal_not_setup'));
                }
                return req.session.save(() => res.redirect(`/portal/${portalToken}`));
            }
            res.redirect('/login?error=invalid');
        });
    } else {
        // Hub Login (Staff)
        console.log(`[STAFF-LOGIN] Attempt for email: ${email}`);
        db.get('SELECT * FROM staff WHERE email = ?', [email], (err, user) => {
            if (err) {
                console.log(`[STAFF-LOGIN] DB Error: ${err.message}`);
                return res.redirect('/login?error=db');
            }

            console.log(`[STAFF-LOGIN] User found: ${!!user}, status: ${user?.status}, has password: ${!!user?.password}`);
            
            if (user) {
                const match = verifyPassword(password, user.password);
                console.log(`[STAFF-LOGIN] Password match: ${match}`);
                if (user.status === 'active' && match) {
                    req.session.isAuthenticated = true;
                    req.session.user = { id: user.id, name: user.name, role: user.role, email: user.email };
                    return req.session.save(() => res.redirect('/'));
                }
            }

            // Legacy fallback removed for security — all logins must go through staff table.
            console.log(`[STAFF-LOGIN] Login failed - redirecting to /login?error=invalid`);
            res.redirect('/login?error=invalid');
        });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// requireAuth moved to utils/auth.js

app.get('/', requireAuth, (req, res) => {
    if (req.isPortal) {
        const token = req.session.user?.portal_token;
        if (!token || token === 'N/A') {
            return res.redirect('/login?error=portal_not_setup');
        }
        return res.redirect(`/portal/${token}`);
    }
    const indexPath = path.join(__dirname, '../public/index.html');
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
            user: req.session.user,
            googleConnected: !!process.env.GOOGLE_REFRESH_TOKEN
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
    if (route === '/oauth2callback' || route.startsWith('/auth/') || route === '/login' || route === '/logout' || route === '/signup') return next();
    if (route.startsWith('/css/') || route.startsWith('/img/') || route.startsWith('/js/components/')) return next();

    // Portal logic: If on portal domain, require auth for almost everything except login
    if (req.isPortal) {
        // Allow public access to the portal token-based API ONLY IF we want to keep token access public.
        // But the user said "log in", so let's require auth.
        // However, we need to allow the portal HTML and its assets.
        if (route.startsWith('/js/') || route.startsWith('/img/') || route.startsWith('/css/')) return next();
        return requireAuth(req, res, next);
    }

    // Hub logic (current)
    if (protectedRoutes.includes(route) || route.startsWith('/api/')) {
        const adminOnlyRoutes = ['/settings', '/settings.html', '/api/staff', '/api/billing', '/api/revenue', '/api/archives'];
        if (adminOnlyRoutes.some(r => route === r || route.startsWith(r + '/'))) {
            return requireAdmin(req, res, next);
        }
        return requireAuth(req, res, next);
    }
    
    next();
});
// -------------------------


app.get('/js/config.js', (req, res) => {
    // Priority: 1. ENV, 2. Current Host
    const portalBaseUrl = process.env.PORTAL_BASE_URL || `${req.protocol}://${req.get('host')}`;
    res.type('application/javascript');
    res.send(`window.PORTAL_CONFIG = { PORTAL_BASE_URL: "${portalBaseUrl}" };`);
});

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


console.log("[BOOT] Registering API routes...");

// Add no-cache headers to all API endpoints to prevent stale dashboard data
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

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
app.use('/api/email', emailRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/intake', intakeRoutes);  // Also serve /intake/start for public access
app.use('/api/proposals', proposalsRoutes);
app.use('/auth', clientAuthRoutes);

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

// Google OAuth Configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/oauth2callback'
);

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

// --- UNIFIED DASHBOARD API ---
app.get('/api/dashboard', requireAuth, async (req, res) => {
    try {
        const stats = {
            totalRevenue: 0,
            pendingInvoices: 0,
            projected: 0,
            totalClients: 0,
            activeClients: 0,
            pendingTasks: 0,
            recentActivity: []
        };

        const revenue = await new Promise((resolve) => {
            db.get(`
                SELECT 
                    SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total,
                    SUM(CASE WHEN status IN ('sent', 'finalized', 'overdue') THEN (total_amount - amount_paid) ELSE 0 END) as pending
                FROM invoices
            `, (err, row) => resolve(row || { total: 0, pending: 0 }));
        });
        stats.totalRevenue = (revenue.total || 0).toFixed(2);
        stats.pendingInvoices = (revenue.pending || 0).toFixed(2);

        const clients = await new Promise((resolve) => {
            db.get(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
                FROM clients
            `, (err, row) => resolve(row || { total: 0, active: 0 }));
        });
        stats.totalClients = clients.total;
        stats.activeClients = clients.active;

        const tasks = await new Promise((resolve) => {
            db.get("SELECT COUNT(*) as count FROM tasks WHERE status != 'done'", (err, row) => resolve(row?.count || 0));
        });
        stats.pendingTasks = tasks;

        const activity = await new Promise((resolve) => {
            db.all(`
                SELECT cc.*, c.name as client_name
                FROM client_communications cc
                JOIN clients c ON cc.client_id = c.id
                ORDER BY cc.created_at DESC
                LIMIT 5
            `, (err, rows) => resolve(rows || []));
        });
        stats.recentActivity = activity;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADDED ALIAS FOR CONVENIENCE ---
app.get('/api/clients', requireAuth, (req, res) => {
    const sql = 'SELECT * FROM clients ORDER BY created_at DESC';
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
