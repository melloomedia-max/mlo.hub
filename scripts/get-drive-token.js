/**
 * One-time script to generate a Google OAuth refresh token with Drive scopes
 * 
 * Run this locally to get a refresh token, then paste it into Railway as GOOGLE_REFRESH_TOKEN
 */

require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const open = require('open');

// Scopes needed for file uploads to Google Drive
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive'
];

// Temporary redirect URI for this script only
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
);

console.log('\n=== Google Drive OAuth Token Generator ===\n');
console.log('This script will open your browser to authorize Drive access.');
console.log('After authorization, it will print your refresh token.\n');

// Create a temporary HTTP server to receive the OAuth callback
const server = http.createServer(async (req, res) => {
    try {
        if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
            const code = qs.get('code');
            
            console.log('\n✓ Authorization code received');
            
            res.end('Authorization successful! You can close this window and return to your terminal.');
            server.destroy();

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            console.log('\n=== SUCCESS ===\n');
            console.log('Copy this refresh token into Railway as GOOGLE_REFRESH_TOKEN:\n');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(tokens.refresh_token);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\nScopes granted:', SCOPES.join(', '));
            console.log('\nNext steps:');
            console.log('1. Copy the token above');
            console.log('2. Go to Railway dashboard → Variables');
            console.log('3. Set GOOGLE_REFRESH_TOKEN to the copied value');
            console.log('4. Remove http://localhost:3000/oauth2callback from Google Cloud Console');
            console.log('5. Restart your Railway deployment\n');
            
            process.exit(0);
        }
    } catch (e) {
        console.error('Error during OAuth callback:', e);
        process.exit(1);
    }
});

// Handle server errors
server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
});

// Make the server destroyable
server.destroy = function() {
    server.close();
};

// Start the temporary server
server.listen(3000, () => {
    // Generate the authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force consent screen to get refresh token
    });

    console.log('Opening browser to authorize...\n');
    console.log('If the browser does not open automatically, visit this URL:\n');
    console.log(authUrl);
    console.log('\n');

    // Open the browser
    open(authUrl, { wait: false }).catch(() => {
        console.log('Could not open browser automatically. Please copy the URL above manually.');
    });
});
