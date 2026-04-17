require('dotenv').config();
const db = require('./database');
const { getDriveClient } = require('./utils/driveHelpers');

async function testDriveAccess() {
    console.log('Testing Drive access...');

    // Check if refresh token exists
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        console.error('❌ No GOOGLE_REFRESH_TOKEN found in environment');
        return;
    }
    console.log('✓ Refresh token found');

    // Try to get Drive client
    const drive = await getDriveClient();
    if (!drive) {
        console.error('❌ Failed to get Drive client');
        return;
    }
    console.log('✓ Drive client obtained');

    // Get a client from DB
    db.get('SELECT id, first_name, last_name, google_drive_folder_id FROM clients WHERE google_drive_folder_id IS NOT NULL LIMIT 1', [], async (err, client) => {
        if (err) {
            console.error('❌ Database error:', err);
            return;
        }

        if (!client) {
            console.log('No clients with Drive folders found');
            return;
        }

        console.log(`\nTesting with client: ${client.first_name} ${client.last_name}`);
        console.log(`Folder ID: ${client.google_drive_folder_id}`);

        try {
            // Try to access the folder
            const folder = await drive.files.get({
                fileId: client.google_drive_folder_id,
                fields: 'id, name, mimeType'
            });
            console.log('✓ Can access folder:', folder.data);

            // Try to list contents
            const contents = await drive.files.list({
                q: `'${client.google_drive_folder_id}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 10
            });
            console.log(`✓ Folder contains ${contents.data.files.length} items:`);
            contents.data.files.forEach(file => {
                console.log(`  - ${file.name} (${file.mimeType})`);
            });

            // Try to create Invoices folder
            console.log('\nAttempting to create Invoices subfolder...');
            const invoicesFolderMetadata = {
                'name': 'Invoices',
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [client.google_drive_folder_id]
            };

            const newFolder = await drive.files.create({
                resource: invoicesFolderMetadata,
                fields: 'id, name'
            });
            console.log('✓ Created Invoices folder:', newFolder.data);

        } catch (error) {
            console.error('❌ Error:', error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
        }

        process.exit(0);
    });
}

testDriveAccess();
