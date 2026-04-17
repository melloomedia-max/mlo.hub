require('dotenv').config();
const { google } = require('googleapis');

async function testToken() {
    console.log('Testing Google Token...');
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        console.log('Attempting to list calendar events...');
        const response = await calendar.events.list({
            calendarId: 'primary',
            maxResults: 1,
            timeMin: new Date().toISOString(),
        });

        console.log('Success! Found ' + response.data.items.length + ' events.');
    } catch (error) {
        console.error('FAILED.');
        console.error(error.message);
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        }
    }
}

testToken();
