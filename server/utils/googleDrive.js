/**
 * Google Drive Integration for Client File Uploads
 * 
 * Provides utilities for:
 * - Authenticating with Google Drive
 * - Creating per-client folders
 * - Uploading files
 * - Managing file permissions
 * - Deleting files
 */

const { google } = require('googleapis');
const db = require('../database');

/**
 * Get an authenticated Google Drive client
 * @returns {Promise<drive_v3.Drive>} Authenticated Drive client
 */
function getDriveClient() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });

    return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Get or create the root "Melloo Media Clients" folder
 * @param {drive_v3.Drive} drive - Authenticated Drive client
 * @returns {Promise<string>} Folder ID
 */
async function getRootFolder(drive) {
    const folderName = 'Melloo Media Clients';

    // Search for existing folder
    const res = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
    }

    // Create root folder
    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
    });

    console.log(`[Drive] Created root folder: ${folderName} (${folder.data.id})`);
    return folder.data.id;
}

/**
 * Get or create a client's Drive folder
 * @param {number} clientId - Client ID from database
 * @param {string} clientName - Client name (for folder naming)
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateClientFolder(clientId, clientName) {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if client already has a folder ID in database
            db.get(
                'SELECT drive_folder_id FROM clients WHERE id = ?',
                [clientId],
                async (err, row) => {
                    if (err) {
                        return reject(err);
                    }

                    // If folder ID exists, verify it's still valid
                    if (row && row.drive_folder_id) {
                        try {
                            const drive = getDriveClient();
                            await drive.files.get({ fileId: row.drive_folder_id });
                            console.log(`[Drive] Using existing folder for client ${clientId}: ${row.drive_folder_id}`);
                            return resolve(row.drive_folder_id);
                        } catch (verifyErr) {
                            console.log(`[Drive] Cached folder ${row.drive_folder_id} not found, creating new one`);
                            // Folder doesn't exist, create new one
                        }
                    }

                    // Create new folder
                    const drive = getDriveClient();
                    const rootFolderId = await getRootFolder(drive);

                    // Sanitize client name for folder naming
                    const safeFolderName = clientName.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim();
                    const folderName = `${safeFolderName} - Uploads`;

                    const folderMetadata = {
                        name: folderName,
                        mimeType: 'application/vnd.google-apps.folder',
                        parents: [rootFolderId]
                    };

                    const folder = await drive.files.create({
                        resource: folderMetadata,
                        fields: 'id'
                    });

                    const folderId = folder.data.id;
                    console.log(`[Drive] Created client folder: ${folderName} (${folderId})`);

                    // Cache folder ID in database
                    db.run(
                        'UPDATE clients SET drive_folder_id = ? WHERE id = ?',
                        [folderId, clientId],
                        (updateErr) => {
                            if (updateErr) {
                                console.error(`[Drive] Failed to cache folder ID:`, updateErr);
                            }
                        }
                    );

                    resolve(folderId);
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Upload a file to a client's Drive folder
 * @param {number} clientId - Client ID
 * @param {string} clientName - Client name
 * @param {Buffer} fileBuffer - File contents
 * @param {string} fileName - Original filename
 * @param {string} mimeType - MIME type
 * @returns {Promise<{fileId: string, viewLink: string, downloadLink: string}>}
 */
async function uploadFile(clientId, clientName, fileBuffer, fileName, mimeType) {
    try {
        const drive = getDriveClient();
        const folderId = await getOrCreateClientFolder(clientId, clientName);

        // Add timestamp prefix to avoid conflicts
        const timestamp = Date.now();
        const safeFileName = `${timestamp}_${fileName}`;

        const fileMetadata = {
            name: safeFileName,
            parents: [folderId]
        };

        const media = {
            mimeType: mimeType,
            body: require('stream').Readable.from(fileBuffer)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink, webContentLink'
        });

        console.log(`[Drive] Uploaded file: ${safeFileName} (${file.data.id})`);

        return {
            fileId: file.data.id,
            viewLink: file.data.webViewLink,
            downloadLink: file.data.webContentLink
        };
    } catch (err) {
        console.error('[Drive] Upload failed:', err);
        throw err;
    }
}

/**
 * Delete a file from Google Drive
 * @param {string} fileId - Drive file ID
 * @returns {Promise<void>}
 */
async function deleteFile(fileId) {
    try {
        const drive = getDriveClient();
        await drive.files.delete({ fileId });
        console.log(`[Drive] Deleted file: ${fileId}`);
    } catch (err) {
        console.error(`[Drive] Delete failed for ${fileId}:`, err);
        throw err;
    }
}

/**
 * Get file metadata from Google Drive
 * @param {string} fileId - Drive file ID
 * @returns {Promise<drive_v3.Schema$File>}
 */
async function getFileMetadata(fileId) {
    try {
        const drive = getDriveClient();
        const res = await drive.files.get({
            fileId,
            fields: 'id, name, size, mimeType, webViewLink, webContentLink, createdTime'
        });
        return res.data;
    } catch (err) {
        console.error(`[Drive] Get metadata failed for ${fileId}:`, err);
        throw err;
    }
}

module.exports = {
    getDriveClient,
    getOrCreateClientFolder,
    uploadFile,
    deleteFile,
    getFileMetadata
};
