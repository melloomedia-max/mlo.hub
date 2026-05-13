const express = require('express');
const router = express.Router();
const db = require('../database');
const { google } = require('googleapis');
const { createMeetingSpace, getMeetingParticipants, getMeetingArtifacts, findConferenceRecords } = require('../utils/meetHelpers');
const { getDriveClient, getMeetingRecordingsSubfolderId } = require('../utils/driveHelpers');
const { summarizeMeeting } = require('../utils/meetingIntelligence');

// Get all meetings
router.get('/', (req, res) => {
    db.all('SELECT * FROM meetings ORDER BY start_time DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create meeting
router.post('/', (req, res) => {
    const { title, description, start_time, end_time, attendees } = req.body;
    const sql = `INSERT INTO meetings (title, description, start_time, end_time, attendees) 
               VALUES ($1, $2, $3, $4, $5)`;

    db.run(sql, [title, description, start_time, end_time, attendees], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            id: this.lastID,
            title,
            description,
            start_time,
            end_time,
            attendees
        });
    });
});

// Create Google Meet meeting
router.post('/google-meet', async (req, res) => {
    try {
        const { title, description, start_time, end_time, attendees } = req.body;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        console.log('Attempting to create Google Meet:', { title, start_time, end_time });

        if (!process.env.GOOGLE_REFRESH_TOKEN) {
            console.error('Missing Refresh Token in Route');
            return res.status(401).json({
                error: 'Host authentication missing. Please go to /auth/google to sign in as the host.',
                status: 'auth_required'
            });
        }

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // Ensure time format includes seconds (YYYY-MM-DDThh:mm:ss) required by Google API
        const formatTime = (time) => {
            if (!time) return time;
            return time.length === 16 ? `${time}:00` : time;
        };

        const formattedStart = formatTime(start_time);
        const formattedEnd = formatTime(end_time);

        // Parse attendees — always include the host so they get the event too
        const attendeeList = attendees
            ? attendees.split(',').map(e => ({ email: e.trim() })).filter(a => a.email.length > 0)
            : [];

        // Build the Calendar event with a native Google Meet conference request.
        // Using conferenceDataVersion=1 + createRequest tells Google Calendar to
        // generate the Meet link and attach it to the event — attendees then receive
        // a proper invite email with the "Join with Google Meet" button.
        const event = {
            summary: title,
            description: description || '',
            start: {
                dateTime: formattedStart,
                timeZone: 'America/Los_Angeles',
            },
            end: {
                dateTime: formattedEnd,
                timeZone: 'America/Los_Angeles',
            },
            attendees: attendeeList,
            conferenceData: {
                createRequest: {
                    requestId: `meet-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 60 },
                    { method: 'popup', minutes: 10 },
                ],
            },
        };

        // conferenceDataVersion=1 is required for Google to process the createRequest
        console.log('[Google Meet] inserting event with attendees:', attendeeList);

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event, // Use requestBody for newer googleapis versions
            conferenceDataVersion: 1,
            sendUpdates: 'all', // Force sending emails to attendees
        });

        const createdEvent = response.data;
        const meetLink = createdEvent.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri
            || createdEvent.hangoutLink
            || null;

        console.log('[Google Meet] Event Created!');
        console.log(' - ID:', createdEvent.id);
        console.log(' - HTML Link:', createdEvent.htmlLink);
        console.log(' - Meet Link:', meetLink);
        console.log(' - Status:', createdEvent.status);


        // Save to database
        const sql = `INSERT INTO meetings (title, description, start_time, end_time, meet_link, attendees, google_event_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`;

        db.run(sql, [title, description, start_time, end_time, meetLink, attendees, createdEvent.id], function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            const meetingId = this.lastID;
            
            // Auto-trigger meeting summarize 5 min after end_time
            const delay = new Date(end_time).getTime() - Date.now() + 5 * 60 * 1000;
            if (delay > 0 && delay < 24 * 60 * 60 * 1000) { // Max 24 hours schedule
                setTimeout(() => summarizeMeeting(meetingId).catch(console.error), delay);
            }

            res.json({
                id: meetingId,
                title,
                meet_link: meetLink,
                google_event_id: createdEvent.id,
                html_link: createdEvent.htmlLink,
            });
        });

    } catch (error) {
        console.error('Error creating Google Meet:', error);
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: errorDetails });
    }
});

// Helper to send notification
const { sendSMS } = require('../utils/emailService');

function sendEventNotification(staffId, title, time) {
    if (!staffId) return;

    db.get('SELECT * FROM staff WHERE id = $1', [staffId], (err, staff) => {
        if (err || !staff) return;

        console.log(`[NOTIFICATION] Preparing to send to ${staff.name} (${staff.phone})...`);
        const message = `AgencyHub: Reminder for Event "${title}" at ${time}.`;

        if (staff.phone) {
            sendSMS(staff.phone, message, 'spectrum');
        }
    });
}

// Create Google Calendar Event (No Local DB)
router.post('/calendar-event', async (req, res) => {
    try {
        const { title, description, start_time, end_time, attendees, notify_staff_id } = req.body;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        if (!process.env.GOOGLE_REFRESH_TOKEN) {
            return res.status(401).json({
                error: 'Host authentication missing.',
                status: 'auth_required'
            });
        }

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const formatTime = (time) => {
            if (!time) return time;
            return time.length === 16 ? `${time}:00` : time;
        };

        const formattedStart = formatTime(start_time);
        const formattedEnd = formatTime(end_time);

        const event = {
            summary: title,
            description: description,
            start: {
                dateTime: formattedStart,
                timeZone: 'America/Los_Angeles',
            },
            end: {
                dateTime: formattedEnd,
                timeZone: 'America/Los_Angeles',
            },
            attendees: attendees ? attendees.split(',').map(email => ({ email: email.trim() })).filter(a => a.email.length > 0) : [],
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            sendUpdates: 'all',
        });

        // Send Notification if requested
        if (notify_staff_id) {
            sendEventNotification(notify_staff_id, title, start_time.replace('T', ' '));
        }

        // Return success with Google ID, NO local DB save
        res.json({
            message: 'Event created on Google Calendar',
            google_event_id: response.data.id,
            htmlLink: response.data.htmlLink
        });

    } catch (error) {
        console.error('Error creating Google Event:', error);
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        res.status(500).json({ error: errorDetails });
    }
});

// List Google Calendar Events
router.get('/google-events', async (req, res) => {
    try {
        if (!process.env.GOOGLE_REFRESH_TOKEN) {
            return res.json([]); // Return empty if not auth instead of error
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 50,
            singleEvents: true,
            orderBy: 'startTime',
        });

        res.json(response.data.items);

    } catch (error) {
        console.error('Error fetching Google Events:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update Google Event (Drag & Drop)
router.put('/google-event/:id', async (req, res) => {
    const { start, end } = req.body;
    const eventId = req.params.id;

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        return res.status(401).json({ error: 'Not authenticated with Google' });
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        await calendar.events.patch({
            calendarId: 'primary',
            eventId: eventId,
            resource: {
                start: { dateTime: start },
                end: { dateTime: end }
            }
        });

        // Sync local DB if it matches
        const formatTime = (t) => t.substring(0, 16); // Simple format for SQL if needed, or stick to ISO
        // Actually SQLite stores strings. keeping ISO is fine or existing format.
        // Existing format in DB seems to be 'YYYY-MM-DDTHH:mm'.

        db.run('UPDATE meetings SET start_time = $1, end_time = $2 WHERE google_event_id = $3',
            [start, end, eventId]);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating Google Event:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete meeting
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM meetings WHERE id = $1', [req.params.id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Meeting deleted', changes: this.changes });
    });
});

// Get Meeting Artifacts (Participants, Recordings)
router.get('/:id/artifacts', (req, res) => {
    db.get('SELECT meet_space_name, attendees FROM meetings WHERE id = $1', [req.params.id], async (err, meeting) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!meeting || !meeting.meet_space_name) {
            return res.json({ participants: [], recordings: [], transcripts: [], note: 'No Meet Space associated' });
        }

        try {
            // Find records for this space
            const records = await findConferenceRecords(meeting.meet_space_name);
            if (!records || records.length === 0) {
                return res.json({ participants: [], recordings: [], transcripts: [], note: 'No conference records found yet' });
            }

            // Get latest record
            const latestRecord = records.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))[0];
            const recordId = latestRecord.name;

            const participants = await getMeetingParticipants(recordId);
            const artifacts = await getMeetingArtifacts(recordId);

            // --- AUTO-ORGANIZE RECORDINGS ---
            if (artifacts.recordings && artifacts.recordings.length > 0) {
                const drive = await getDriveClient();
                const matchedClients = [];
                const emails = new Set();

                // 1. Collect Emails
                participants.forEach(p => {
                    if (p.signedinUser && p.signedinUser.email) emails.add(p.signedinUser.email);
                });
                if (meeting.attendees) {
                    meeting.attendees.split(',').forEach(e => emails.add(e.trim()));
                }

                // 2. Match Clients (Sequential for DB SQLite safety)
                for (const email of emails) {
                    await new Promise(resolve => {
                        db.get('SELECT id, name, google_drive_folder_id FROM clients WHERE email = $1', [email], (err, client) => {
                            if (client && client.google_drive_folder_id) matchedClients.push(client);
                            resolve();
                        });
                    });
                }

                // 3. Move Recordings
                if (matchedClients.length > 0 && drive) {
                    console.log(`[Auto-Organize] Found ${matchedClients.length} matched clients.`);
                    for (const client of matchedClients) {
                        const recordingsFolderId = await getMeetingRecordingsSubfolderId(client.google_drive_folder_id);
                        if (recordingsFolderId) {
                            for (const rec of artifacts.recordings) {
                                // Extract ID
                                let fileId = '';
                                if (rec.driveDestination && rec.driveDestination.file) {
                                    fileId = rec.driveDestination.file.replace(/^files\//, '');
                                }

                                if (fileId) {
                                    try {
                                        /* Get current parents to avoid re-adding */
                                        const fileInfo = await drive.files.get({ fileId, fields: 'parents' });
                                        if (!fileInfo.data.parents.includes(recordingsFolderId)) {
                                            await drive.files.update({
                                                fileId: fileId,
                                                addParents: recordingsFolderId
                                            });
                                            console.log(`[Auto-Organize] Linked recording ${fileId} to ${client.name}`);
                                        }
                                    } catch (moveErr) {
                                        console.error('[Auto-Organize] Error:', moveErr.message);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // --------------------------------

            res.json({
                participants,
                recordings: artifacts.recordings,
                transcripts: artifacts.transcripts
            });

        } catch (apiErr) {
            console.error('Meet API Error:', apiErr);
            res.status(500).json({ error: apiErr.message });
        }
    });
});
// Trigger AI Summarization
router.post('/:id/summarize', async (req, res) => {
    try {
        const summary = await summarizeMeeting(req.params.id);
        res.json(summary);
    } catch (error) {
        console.error('Summarize Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
