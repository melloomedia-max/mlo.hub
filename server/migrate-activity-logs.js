require('dotenv').config();
const db = require('./database');
const { getDriveClient, getActivityLogSubfolderId, createActivityDoc } = require('./utils/driveHelpers');

async function migrate() {
    console.log('Starting migration...');
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
                // 1. Ensure/Get Subfolder
                const subfolderId = await getActivityLogSubfolderId(client.google_drive_folder_id);
                if (!subfolderId) {
                    console.error(' - Failed to get subfolder');
                    continue;
                }

                // 2. Check Doc
                if (client.activity_doc_id) {
                    // Check if it's in the right place
                    try {
                        const file = await drive.files.get({
                            fileId: client.activity_doc_id,
                            fields: 'parents'
                        });

                        const currentParents = file.data.parents || [];
                        if (!currentParents.includes(subfolderId)) {
                            // Move it
                            console.log(' - Moving doc to subfolder...');
                            await drive.files.update({
                                fileId: client.activity_doc_id,
                                addParents: subfolderId,
                                removeParents: currentParents.join(',')
                            });
                            console.log(' - Moved.');
                        } else {
                            console.log(' - Doc already in correct folder.');
                        }
                    } catch (e) {
                        console.error(' - Error checking/moving existing doc:', e.message);
                        // If 404, maybe clear invalid ID? Or create new one?
                        // For now just log.
                    }
                } else {
                    // Create new doc in subfolder
                    console.log(' - Creating new Activity Doc...');
                    // createActivityDoc logic now puts it in subfolder if we pass the PARENT. 
                    // Wait, my createActivityDoc implementation takes `parentFolderId` and finds the subfolder internally.
                    // So I can just call createActivityDoc(client.google_drive_folder_id).

                    // Actually, I should verify createActivityDoc logic again.
                    // Yes: "const subfolderId = await getActivityLogSubfolderId(parentFolderId);"

                    const newDoc = await createActivityDoc(client.google_drive_folder_id, `${client.first_name} ${client.last_name}`);
                    if (newDoc) {
                        await new Promise((resolve) => {
                            db.run('UPDATE clients SET activity_doc_id = ? WHERE id = ?', [newDoc.id, client.id], (err) => {
                                if (err) console.error('DB Update failed:', err);
                                else console.log(' - Created and Linked.');
                                resolve();
                            });
                        });
                    }
                }

            } catch (error) {
                console.error(` - Error processing client ${client.id}:`, error.message);
            }
        }
        console.log('Migration complete.');
    });
}

migrate();
