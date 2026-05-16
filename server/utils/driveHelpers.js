const { google } = require('googleapis');

async function getDriveClient() {
    // Check for required environment variables
    const missingVars = [];
    if (!process.env.GOOGLE_CLIENT_ID) missingVars.push('GOOGLE_CLIENT_ID');
    if (!process.env.GOOGLE_CLIENT_SECRET) missingVars.push('GOOGLE_CLIENT_SECRET');
    if (!process.env.GOOGLE_REFRESH_TOKEN) missingVars.push('GOOGLE_REFRESH_TOKEN');
    
    if (missingVars.length > 0) {
        console.error(`[DRIVE] Missing required environment variables: ${missingVars.join(', ')}`);
        return null;
    }

    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        return google.drive({ version: 'v3', auth: oauth2Client });
    } catch (err) {
        console.error('[DRIVE] Failed to initialize Drive client:', err.message);
        return null;
    }
}

async function createInvoicesSubfolder(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const invoicesFolderMetadata = {
            'name': 'Invoices',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId]
        };

        const file = await drive.files.create({
            resource: invoicesFolderMetadata,
            fields: 'id'
        });

        return file.data.id;
    } catch (err) {
        console.error('Error creating Invoices subfolder:', err);
        return null;
    }
}

async function getInvoicesSubfolderId(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and name='Invoices' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        // If not found, create it
        return await createInvoicesSubfolder(parentFolderId);
    } catch (err) {
        console.error('Error getting Invoices subfolder:', err);
        return null;
    }
}

async function uploadInvoiceToDrive(invoiceData, clientFolderId, fileName) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        // Get or create Invoices subfolder
        const invoicesFolderId = await getInvoicesSubfolderId(clientFolderId);
        if (!invoicesFolderId) throw new Error('Could not access Invoices folder');

        // Create file metadata
        const fileMetadata = {
            name: fileName,
            mimeType: 'application/pdf',
            parents: [invoicesFolderId]
        };

        // Upload the file
        const file = await drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: 'application/pdf',
                body: invoiceData
            },
            fields: 'id, webViewLink'
        });

        return file.data;
    } catch (err) {
        console.error('Error uploading invoice to Drive:', err);
        return null;
    }
}

async function createActivityLogSubfolder(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const folderMetadata = {
            'name': 'Activity Logs',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId]
        };

        const file = await drive.files.create({
            resource: folderMetadata,
            fields: 'id'
        });

        return file.data.id;
    } catch (err) {
        console.error('Error creating Activity Logs subfolder:', err);
        return null;
    }
}

async function getActivityLogSubfolderId(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and name='Activity Logs' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        // If not found, create it
        return await createActivityLogSubfolder(parentFolderId);
    } catch (err) {
        console.error('Error getting Activity Logs subfolder:', err);
        return null;
    }
}

async function createActivityDoc(parentFolderId, clientName) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        // Ensure subfolder exists
        const subfolderId = await getActivityLogSubfolderId(parentFolderId);
        if (!subfolderId) throw new Error('Could not get Activity Logs subfolder');

        const fileMetadata = {
            name: `Activity Log - ${clientName}`,
            mimeType: 'application/vnd.google-apps.document',
            parents: [subfolderId] // Use subfolder
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            fields: 'id, webViewLink'
        });

        return file.data;
    } catch (err) {
        console.error('Error creating Activity Doc:', err);
        return null;
    }
}

async function appendNoteToDoc(docId, text, author) {
    const docsClient = await getDocsClient(); // Need to define this helper standalone
    if (!docsClient) return;

    try {
        const date = new Date().toLocaleString();
        const content = `\n[${date}] ${author || 'System'}: ${text}\n`;

        await docsClient.documents.batchUpdate({
            documentId: docId,
            requestBody: {
                requests: [
                    {
                        insertText: {
                            text: content,
                            endOfSegmentLocation: { segmentId: '' } // Body
                        }
                    }
                ]
            }
        });
    } catch (err) {
        console.error('Error appending to Activity Doc:', err);
    }
}



async function createMeetingRecordingsSubfolder(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const folderMetadata = {
            'name': 'Meeting Recordings',
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parentFolderId]
        };

        const file = await drive.files.create({
            resource: folderMetadata,
            fields: 'id'
        });

        return file.data.id;
    } catch (err) {
        console.error('Error creating Meeting Recordings subfolder:', err);
        return null;
    }
}

async function getMeetingRecordingsSubfolderId(parentFolderId) {
    const drive = await getDriveClient();
    if (!drive) return null;

    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and name='Meeting Recordings' and mimeType='application/vnd.google-apps.folder'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        return await createMeetingRecordingsSubfolder(parentFolderId);
    } catch (err) {
        console.error('Error getting Meeting Recordings subfolder:', err);
        return null;
    }
}

// Helper for Docs Client
async function getDocsClient() {
    if (!process.env.GOOGLE_REFRESH_TOKEN) return null;
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.docs({ version: 'v1', auth: oauth2Client });
}

// Get or create a named subfolder inside a parent
async function getOrCreateSubfolder(parentFolderId, folderName) {
    const drive = await getDriveClient();
    if (!drive) return null;
    try {
        const response = await drive.files.list({
            q: `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            pageSize: 1
        });
        if (response.data.files && response.data.files.length > 0) {
            return response.data.files[0].id;
        }
        const file = await drive.files.create({
            resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] },
            fields: 'id'
        });
        return file.data.id;
    } catch (err) {
        console.error(`Error getting/creating subfolder "${folderName}":`, err);
        return null;
    }
}

// Get or create a project-specific subfolder inside client's "Projects" folder
async function getOrCreateProjectFolder(clientFolderId, projectName) {
    const drive = await getDriveClient();
    if (!drive) return null;
    try {
        // Ensure "Projects" parent folder exists
        const projectsParentId = await getOrCreateSubfolder(clientFolderId, 'Projects');
        if (!projectsParentId) return null;
        // Create named subfolder for this project
        const projectFolderId = await getOrCreateSubfolder(projectsParentId, projectName);
        return { projectFolderId, projectsParentId };
    } catch (err) {
        console.error('Error creating project folder:', err);
        return null;
    }
}

module.exports = {
    getDriveClient,
    getDocsClient,
    createInvoicesSubfolder,
    getInvoicesSubfolderId,
    uploadInvoiceToDrive,
    createActivityDoc,
    appendNoteToDoc,
    getActivityLogSubfolderId,
    getMeetingRecordingsSubfolderId,
    getOrCreateSubfolder,
    getOrCreateProjectFolder
};
