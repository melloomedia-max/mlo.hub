require('dotenv').config();
const { google } = require('googleapis');

const calendar = google.calendar('v3');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

async function createTestEvent() {
    try {
        const event = {
            summary: 'Agency Hub Test Event with Google Meet',
            location: 'Virtual',
            description: 'This is a test event created by Agency Hub automation with a Google Meet link.',
            start: {
                dateTime: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), // Tomorrow
                timeZone: 'UTC',
            },
            end: {
                dateTime: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString(), // Tomorrow
                timeZone: 'UTC',
            },
            conferenceData: {
                createRequest: {
                    requestId: "sample123",
                    conferenceSolutionKey: { type: "hangoutsMeet" }
                }
            }
        };

        // Adjust end time to be 1 hour later
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const end = new Date(tomorrow);
        end.setHours(end.getHours() + 1);
        event.end.dateTime = end.toISOString();

        const response = await calendar.events.insert({
            auth: oauth2Client,
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        console.log('Event created successfully:');
        console.log('Event ID:', response.data.id);
        console.log('Event Link:', response.data.htmlLink);
        console.log('Google Meet Link:', response.data.hangoutLink);
    } catch (error) {
        console.error('Error creating event:', error);
    }
}

createTestEvent();
