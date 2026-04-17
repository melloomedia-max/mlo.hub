require('dotenv').config();
const { google } = require('googleapis');

async function testCreateMeeting() {
    console.log('Testing Google Meeting Creation...');
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

        const startTime = new Date();
        startTime.setHours(startTime.getHours() + 1);
        const endTime = new Date(startTime);
        endTime.setHours(endTime.getHours() + 1);

        const event = {
            summary: 'Test Meeting from Script',
            description: 'Testing API connectivity',
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'America/Los_Angeles',
            },
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        };

        console.log('Sending request...');
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        console.log('Success! Meeting Link: ' + response.data.hangoutLink);

    } catch (error) {
        console.error('FAILED.');
        console.error(error.message);
        if (error.response) {
            console.error(JSON.stringify(error.response.data, null, 2));
        }
    }
}

testCreateMeeting();
