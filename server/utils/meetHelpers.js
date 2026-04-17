const { google } = require('googleapis');

async function getMeetClient() {
    if (!process.env.GOOGLE_REFRESH_TOKEN) return null;
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.meet({ version: 'v2', auth: oauth2Client });
}

/**
 * Create a new Meeting Space
 */
async function createMeetingSpace() {
    const meetStr = await getMeetClient();
    if (!meetStr) throw new Error('Google Meet not authenticated');

    const response = await meetStr.spaces.create({
        requestBody: {} // Empty body creates a default space
    });
    return response.data;
}

/**
 * Get Meeting Space details
 * @param {string} name - Resource name (e.g. 'spaces/ABC-DEF-GHI')
 */
async function getMeetingSpace(name) {
    const meetStr = await getMeetClient();
    if (!meetStr) throw new Error('Google Meet not authenticated');

    const response = await meetStr.spaces.get({ name });
    return response.data;
}

/**
 * Get Participants
 * @param {string} meetingUri - "conferenceRecords/{conferenceRecord}/participants"
 * Note: You need a Conference Record ID, which is generated AFTER a meeting happens.
 * Mapping "meeting code" (abc-def-ghi) to "conference record" is complex.
 * Usually you list conferenceRecords filters by space.
 */
async function getMeetingParticipants(conferenceRecordId) {
    const meetStr = await getMeetClient();
    if (!meetStr) throw new Error('Google Meet not authenticated');

    const response = await meetStr.conferenceRecords.participants.list({
        parent: conferenceRecordId
    });
    return response.data.participants;
}

/**
 * Get Artifacts (Recordings/Transcripts)
 * @param {string} conferenceRecordId 
 */
async function getMeetingArtifacts(conferenceRecordId) {
    const meetStr = await getMeetClient();
    if (!meetStr) throw new Error('Google Meet not authenticated');

    // Recordings
    const recordings = await meetStr.conferenceRecords.recordings.list({
        parent: conferenceRecordId
    });

    // Transcripts
    const transcripts = await meetStr.conferenceRecords.transcripts.list({
        parent: conferenceRecordId
    });

    return {
        recordings: recordings.data.recordings || [],
        transcripts: transcripts.data.transcripts || []
    };
}

/**
 * Find Conference Record by Space Name
 * (Used to bridge the gap between a scheduled meeting and its past records)
 */
async function findConferenceRecords(spaceName) {
    const meetStr = await getMeetClient();
    if (!meetStr) throw new Error('Google Meet not authenticated');

    // Filter by space name? valid filters: 'space.name=spaces/XYZ'
    const response = await meetStr.conferenceRecords.list({
        filter: `space.name="${spaceName}"`
    });
    return response.data.conferenceRecords || [];
}

module.exports = {
    createMeetingSpace,
    getMeetingSpace,
    getMeetingParticipants,
    getMeetingArtifacts,
    findConferenceRecords
};
