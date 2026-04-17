const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbPath = path.join(__dirname, '../agency.db');
const db = new sqlite3.Database(dbPath);

async function main() {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        console.error('Error: GOOGLE_REFRESH_TOKEN is not set in .env');
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
        console.log('Checking for existing "CRM Profiles" folder...');
        
        // Find existing root folder
        const rootSearch = await drive.files.list({
            q: "name = 'CRM Profiles' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        let crmRootFolderId;

        if (rootSearch.data.files.length > 0) {
            crmRootFolderId = rootSearch.data.files[0].id;
            console.log(`Found existing "CRM Profiles" folder (ID: ${crmRootFolderId})`);
        } else {
            console.log('Creating new "CRM Profiles" folder...');
            const rootFolder = await drive.files.create({
                resource: {
                    name: 'CRM Profiles',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            crmRootFolderId = rootFolder.data.id;
            console.log(`Created new "CRM Profiles" folder (ID: ${crmRootFolderId})`);
        }

        console.log('Fetching clients with Google Drive folders...');
        db.all('SELECT id, name, google_drive_folder_id FROM clients WHERE google_drive_folder_id IS NOT NULL', [], async (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                process.exit(1);
            }

            console.log(`Found ${rows.length} clients to organize.`);

            for (const client of rows) {
                try {
                    // Get current folder parents
                    const file = await drive.files.get({
                        fileId: client.google_drive_folder_id,
                        fields: 'parents'
                    });

                    // Check if already in the new root folder
                    const previousParents = file.data.parents ? file.data.parents.join(',') : '';
                    if (previousParents.includes(crmRootFolderId)) {
                        console.log(`Client ${client.name} (ID: ${client.id}) is already organized.`);
                        continue;
                    }

                    // Move to new root folder
                    await drive.files.update({
                        fileId: client.google_drive_folder_id,
                        addParents: crmRootFolderId,
                        removeParents: previousParents,
                        fields: 'id, parents'
                    });

                    console.log(`Moved folder for client ${client.name} (ID: ${client.id}) to "CRM Profiles" folder.`);
                } catch (folderErr) {
                    console.error(`Failed to move folder for client ${client.name} (ID: ${client.id}):`, folderErr.message);
                }
            }

            console.log('Done organizing CRM folders!');
            process.exit(0);
        });

    } catch (error) {
        console.error('An error occurred:', error.message);
        process.exit(1);
    }
}

main();
