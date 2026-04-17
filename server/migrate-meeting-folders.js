require('dotenv').config();
const db = require('./database');
const { getDriveClient, getMeetingRecordingsSubfolderId } = require('./utils/driveHelpers');

async function migrate() {
    console.log('Starting Meeting Recordings Folder migration...');
    const drive = await getDriveClient();
    if (!drive) {
        console.error('No Drive client available');
        return;
    }

    db.all('SELECT * FROM clients', [], async (err, clients) => {
        if (err) {
            console.error('DB Error:', err);
            return;
        }

        for (const client of clients) {
            console.log(`Processing ${client.name}...`);

            if (!client.google_drive_folder_id) {
                console.log(' - No Drive folder, skipping.');
                continue;
            }

            try {
                const subfolderId = await getMeetingRecordingsSubfolderId(client.google_drive_folder_id);
                if (subfolderId) {
                    console.log(` - Verified/Created "Meeting Recordings": ${subfolderId}`);
                } else {
                    console.error(' - Failed to create subfolder');
                }
            } catch (error) {
                console.error(` - Error processing client ${client.id}:`, error.message);
            }
        }
        console.log('Migration complete.');
    });
}

migrate();
