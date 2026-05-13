const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../database');
const { getDriveClient, getOrCreateClientFolder, uploadFile, deleteFile, getFileMetadata } = require('../utils/googleDrive');

// Configure multer for memory storage (files handled in-memory, not saved to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow most common file types, block executables
    const allowedMimes = [
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      // Video
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      // Archives
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      // Other
      'application/json',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  }
});

// -----------------------------------------------------------
// CLIENT PORTAL ROUTES (token-authenticated)
// -----------------------------------------------------------

/**
 * POST /portal/api/:token/upload
 * Upload a file from the client portal
 * Request: multipart/form-data with 'file' field
 */
router.post('/portal/api/:token/upload', upload.single('file'), async (req, res) => {
  const { token } = req.params;

  try {
    // 1. Verify token and get client
    const client = await new Promise((resolve, reject) => {
      db.get(
        "SELECT id, name, email FROM clients WHERE portal_token = $1 AND portal_access = 1",
        [token],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('Invalid or inactive portal token'));
          else resolve(row);
        }
      );
    });

    // 2. Validate file upload
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, size, buffer } = req.file;

    // 3. Upload to Google Drive
    const driveResult = await uploadFile(client.id, client.name, {
      name: originalname,
      mimeType: mimetype,
      buffer: buffer
    });

    // 4. Save metadata to database
    const fileRecord = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO client_files 
         (client_id, file_name, file_size, mime_type, drive_file_id, drive_view_link, drive_download_link, uploaded_by_type, uploaded_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'client', $8)`,
        [client.id, originalname, size, mimetype, driveResult.fileId, driveResult.viewLink, driveResult.downloadLink, client.id],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    res.json({
      success: true,
      file: {
        id: fileRecord.id,
        name: originalname,
        size: size,
        mimeType: mimetype,
        viewLink: driveResult.viewLink,
        downloadLink: driveResult.downloadLink,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Files] Upload error:', error.message);
    res.status(error.message.includes('token') ? 403 : 500).json({ 
      error: error.message || 'Upload failed' 
    });
  }
});

/**
 * GET /portal/api/:token/files
 * List all files for a client (portal view)
 */
router.get('/portal/api/:token/files', async (req, res) => {
  const { token } = req.params;

  try {
    // 1. Verify token and get client
    const client = await new Promise((resolve, reject) => {
      db.get(
        "SELECT id FROM clients WHERE portal_token = $1 AND portal_access = 1",
        [token],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('Invalid or inactive portal token'));
          else resolve(row);
        }
      );
    });

    // 2. Get all files for this client
    const files = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, file_name, file_size, mime_type, drive_view_link, drive_download_link, uploaded_by_type, created_at
         FROM client_files
         WHERE client_id = $1
         ORDER BY created_at DESC`,
        [client.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ files });

  } catch (error) {
    console.error('[Files] List error:', error.message);
    res.status(error.message.includes('token') ? 403 : 500).json({ 
      error: error.message || 'Failed to list files' 
    });
  }
});

/**
 * DELETE /portal/api/:token/files/:id
 * Delete a file (client can only delete their own uploads)
 */
router.delete('/portal/api/:token/files/:id', async (req, res) => {
  const { token, id } = req.params;

  try {
    // 1. Verify token and get client
    const client = await new Promise((resolve, reject) => {
      db.get(
        "SELECT id FROM clients WHERE portal_token = ? AND portal_access = 1",
        [token],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('Invalid or inactive portal token'));
          else resolve(row);
        }
      );
    });

    // 2. Get file record and verify ownership
    const file = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, drive_file_id, uploaded_by_type, uploaded_by_id
         FROM client_files
         WHERE id = $1 AND client_id = $2`,
        [id, client.id],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('File not found or access denied'));
          else resolve(row);
        }
      );
    });

    // 3. Clients can only delete their own uploads (not staff uploads)
    if (file.uploaded_by_type !== 'client') {
      return res.status(403).json({ error: 'You can only delete files you uploaded' });
    }

    // 4. Delete from Google Drive
    await deleteFile(file.drive_file_id);

    // 5. Delete from database
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM client_files WHERE id = $1", [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true });

  } catch (error) {
    console.error('[Files] Delete error:', error.message);
    res.status(error.message.includes('token') || error.message.includes('denied') ? 403 : 500).json({ 
      error: error.message || 'Failed to delete file' 
    });
  }
});

// -----------------------------------------------------------
// STAFF CRM ROUTES (session-authenticated)
// -----------------------------------------------------------

/**
 * POST /api/clients/:clientId/files/upload
 * Upload a file from the staff CRM (requires auth)
 */
router.post('/api/clients/:clientId/files/upload', upload.single('file'), async (req, res) => {
  // Require authentication (middleware should be added in server.js)
  if (!req.session?.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { clientId } = req.params;
  const staffId = req.session.user?.id;

  try {
    // 1. Get client info
    const client = await new Promise((resolve, reject) => {
      db.get(
        "SELECT id, name FROM clients WHERE id = $1",
        [clientId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('Client not found'));
          else resolve(row);
        }
      );
    });

    // 2. Validate file upload
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, mimetype, size, buffer } = req.file;

    // 3. Upload to Google Drive
    const driveResult = await uploadFile(client.id, client.name, {
      name: originalname,
      mimeType: mimetype,
      buffer: buffer
    });

    // 4. Save metadata to database
    const fileRecord = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO client_files 
         (client_id, file_name, file_size, mime_type, drive_file_id, drive_view_link, drive_download_link, uploaded_by_type, uploaded_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'staff', $8)`,
        [client.id, originalname, size, mimetype, driveResult.fileId, driveResult.viewLink, driveResult.downloadLink, staffId],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    res.json({
      success: true,
      file: {
        id: fileRecord.id,
        name: originalname,
        size: size,
        mimeType: mimetype,
        viewLink: driveResult.viewLink,
        downloadLink: driveResult.downloadLink,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Files] Staff upload error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({ 
      error: error.message || 'Upload failed' 
    });
  }
});

/**
 * GET /api/clients/:clientId/files
 * List all files for a client (staff view)
 */
router.get('/api/clients/:clientId/files', async (req, res) => {
  if (!req.session?.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { clientId } = req.params;

  try {
    const files = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, file_name, file_size, mime_type, drive_view_link, drive_download_link, uploaded_by_type, created_at
         FROM client_files
         WHERE client_id = ?
         ORDER BY created_at DESC`,
        [clientId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ files });

  } catch (error) {
    console.error('[Files] Staff list error:', error.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * DELETE /api/clients/:clientId/files/:id
 * Delete any file (staff has full delete permissions)
 */
router.delete('/api/clients/:clientId/files/:id', async (req, res) => {
  if (!req.session?.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { clientId, id } = req.params;

  try {
    // 1. Get file record
    const file = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, drive_file_id FROM client_files WHERE id = $1 AND client_id = $2`,
        [id, clientId],
        (err, row) => {
          if (err) reject(err);
          else if (!row) reject(new Error('File not found'));
          else resolve(row);
        }
      );
    });

    // 2. Delete from Google Drive
    await deleteFile(file.drive_file_id);

    // 3. Delete from database
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM client_files WHERE id = ?", [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true });

  } catch (error) {
    console.error('[Files] Staff delete error:', error.message);
    res.status(error.message.includes('not found') ? 404 : 500).json({ 
      error: error.message || 'Failed to delete file' 
    });
  }
});

module.exports = router;
