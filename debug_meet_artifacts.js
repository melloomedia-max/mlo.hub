require('dotenv').config();
const { findConferenceRecords, getMeetingArtifacts } = require('./server/utils/meetHelpers');

async function debugArtifacts() {
    const spaceName = 'spaces/tOC9FtiP3jcB';
    console.log(`Checking artifacts for space: ${spaceName}`);

    try {
        const records = await findConferenceRecords(spaceName);
        console.log(`Found ${records.length} conference records.`);

        if (records.length > 0) {
            const latest = records[0]; // Just take first
            console.log('Conference Record Name:', latest.name);

            const artifacts = await getMeetingArtifacts(latest.name);
            console.log('Recordings Raw Data:');
            console.dir(artifacts.recordings, { depth: null });
        } else {
            console.log('No records found (meeting might not have happened or started yet).');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

debugArtifacts();
