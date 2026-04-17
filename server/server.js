const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const { google } = require('googleapis');

const db = require('./database');
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
const { startArchiveScheduler } = require('./jobs/archiveScheduler');

const app = express();
const PORT = process.env.PORT || 3000;

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

const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { 
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 15 * 60 * 1000 // 15 minutes of inactivity
    }
}));

// --- Pure Server Auth Middleware ---
app.get('/login', (req, res) => {
    const loginPath = path.join(__dirname, '../public/login.html');
    console.log(`[AUTH-CHECK] Serving login from: ${loginPath}`);
    res.sendFile(loginPath);
});

app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const password = req.body.password;
    const adminPass = process.env.APP_PASSWORD;
    
    console.log(`[AUTH-DEBUG] APP_PASSWORD present: ${adminPass ? 'yes' : 'no'}`);
    
    if (!adminPass) {
        console.log('[AUTH-DEBUG] Password match: no (Not Configured)');
        return res.redirect('/login?error=notconfigured');
    }

    const matches = (password === adminPass);
    console.log(`[AUTH-DEBUG] Password match: ${matches ? 'yes' : 'no'}`);

    if (matches) {
        req.session.isAuthenticated = true;
        console.log('[AUTH-DEBUG] LOGIN SUCCESS');
        res.redirect('/');
    } else {
        res.redirect('/login?error=invalid');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

function requireAuth(req, res, next) {
    if (req.session && req.session.isAuthenticated) {
        return next();
    }
    
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
}

// Explicit Root Handler
app.get('/', requireAuth, (req, res) => {
    const indexPath = path.join(__dirname, '../public/index.html');
    console.log(`[AUTH-CHECK] Serving index from: ${indexPath}`);
    res.sendFile(indexPath);
});

// Explicit Settings Handler
app.get('/settings', requireAuth, (req, res) => {
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

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agency Hub running on port ${PORT}`);
    
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
});
