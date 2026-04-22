const express = require('express');
const router = express.Router();
const db = require('../database');
const path = require('path');
const { getDriveClient } = require('../utils/driveHelpers');
const { sendSMS } = require('../utils/emailService');
const nodemailer = require('nodemailer');

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err); else resolve(this.lastID);
        });
    });
}

// Serve Portal HTML
router.get('/:token', (req, res) => {
    if (req.params.token === 'api') return;
    res.sendFile(path.join(__dirname, '../../public/portal.html'));
});

// ─── Main Portal Data ────────────────────────────────────
router.get('/api/:token', async (req, res) => {
    try {
        const client = await dbGet(
            `SELECT id, name, first_name, last_name, company, email,
                    google_drive_folder_id, created_at
             FROM clients WHERE portal_token = ?`,
            [req.params.token]
        );
        if (!client) return res.status(404).json({ error: "Invalid token" });

        // Get root-level media from Drive
        let files = [];
        let folders = [];
        if (client.google_drive_folder_id) {
            try {
                const drive = await getDriveClient();
                const fileRes = await drive.files.list({
                    q: `'${client.google_drive_folder_id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
                    fields: 'files(id, name, webViewLink, webContentLink, iconLink, mimeType, thumbnailLink, modifiedTime, size)',
                    pageSize: 100,
                    orderBy: 'modifiedTime desc'
                });
                files = fileRes.data.files || [];

                const folderRes = await drive.files.list({
                    q: `'${client.google_drive_folder_id}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'`,
                    fields: 'files(id, name, webViewLink, modifiedTime)',
                    pageSize: 50,
                    orderBy: 'name asc'
                });
                folders = folderRes.data.files || [];
            } catch (ignore) {}
        }

        res.json({
            client: {
                name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.name,
                firstName: client.first_name,
                company: client.company
            },
            files,
            folders,
            rootFolderId: client.google_drive_folder_id || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Browse subfolder ────────────────────────────────────
router.get('/api/:token/folder/:folderId', async (req, res) => {
    try {
        const client = await dbGet("SELECT id, google_drive_folder_id FROM clients WHERE portal_token = ?", [req.params.token]);
        if (!client) return res.status(404).json({ error: "Invalid token" });

        const drive = await getDriveClient();
        const fileRes = await drive.files.list({
            q: `'${req.params.folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, webViewLink, webContentLink, iconLink, mimeType, thumbnailLink, modifiedTime, size)',
            pageSize: 100,
            orderBy: 'modifiedTime desc'
        });

        const folderRes = await drive.files.list({
            q: `'${req.params.folderId}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, webViewLink, modifiedTime)',
            pageSize: 50,
            orderBy: 'name asc'
        });

        // Get folder name
        const folderMeta = await drive.files.get({
            fileId: req.params.folderId,
            fields: 'name'
        });

        res.json({
            folderName: folderMeta.data.name,
            files: fileRes.data.files || [],
            folders: folderRes.data.files || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Submit Request ──────────────────────────────────────
router.post('/api/:token/request', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: "Message is required" });

        const client = await dbGet("SELECT id, name, first_name, company FROM clients WHERE portal_token = ?", [req.params.token]);
        if (!client) return res.status(404).json({ error: "Invalid token" });

        const clientLabel = client.company || client.first_name || client.name || 'Client';

        await dbRun(
            "INSERT INTO client_communications (client_id, type, method, description) VALUES (?, ?, ?, ?)",
            [client.id, 'note', 'Portal Request', `[CLIENT PORTAL REQUEST] ${clientLabel}: ${message.trim()}`]
        );

        // Email admin
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
                });
                await transporter.sendMail({
                    from: `"Melloo Hub" <${process.env.EMAIL_USER}>`,
                    to: process.env.EMAIL_USER,
                    subject: `Portal Request from ${clientLabel}`,
                    html: `<p><strong>${clientLabel}</strong> submitted a request via their client portal:</p>
                           <blockquote style="border-left:4px solid #6366f1;padding:10px 16px;background:#f9f9fb;border-radius:4px;">${message.trim()}</blockquote>
                           <p style="color:#94a3b8;font-size:12px;">Log in to Melloo Hub to view and respond.</p>`
                });
            } catch (emailErr) {
                console.error('[PORTAL-REQUEST] Email notification failed:', emailErr.message);
            }
        }

        // SMS to staff (best-effort)
        const staff = await dbGet("SELECT phone FROM staff LIMIT 1");
        if (staff && staff.phone) {
            sendSMS(staff.phone, `Portal request from ${clientLabel}: ${message.trim()}`, 'verizon');
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[PORTAL-REQUEST] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── File Proxy (inline preview) ─────────────────────────
// Streams file content through the server so the portal can
// display images, PDFs, and videos without opening Google Drive.
router.get('/api/:token/file/:fileId', async (req, res) => {
    try {
        // Validate token
        const client = await dbGet("SELECT id FROM clients WHERE portal_token = ?", [req.params.token]);
        if (!client) return res.status(403).send('Forbidden');

        const drive = await getDriveClient();
        if (!drive) return res.status(500).send('Drive not connected');

        const fileId = req.params.fileId;

        // Get metadata
        const meta = await drive.files.get({
            fileId,
            fields: 'mimeType, name, size'
        });

        const mime = meta.data.mimeType;
        const name = meta.data.name;

        // Google Docs/Sheets/Slides can't be downloaded directly — skip proxy
        if (mime.includes('google-apps')) {
            return res.status(400).json({ error: 'Cannot proxy Google Workspace files' });
        }

        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
        if (meta.data.size) res.setHeader('Content-Length', meta.data.size);

        // Enable caching for 1 hour (portal assets rarely change moment to moment)
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const stream = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        stream.data
            .on('error', err => {
                console.error('Portal proxy stream error:', err.message);
                if (!res.headersSent) res.status(500).end();
            })
            .pipe(res);
    } catch (err) {
        console.error('Portal file proxy error:', err.message);
        if (!res.headersSent) res.status(500).send('Error fetching file');
    }
});

// ─── File Download (force download) ─────────────────────
router.get('/api/:token/download/:fileId', async (req, res) => {
    try {
        const client = await dbGet("SELECT id FROM clients WHERE portal_token = ?", [req.params.token]);
        if (!client) return res.status(403).send('Forbidden');

        const drive = await getDriveClient();
        if (!drive) return res.status(500).send('Drive not connected');

        const fileId = req.params.fileId;
        const meta = await drive.files.get({ fileId, fields: 'mimeType, name, size' });

        if (meta.data.mimeType.includes('google-apps')) {
            return res.redirect(302, `https://drive.google.com/uc?export=download&id=${fileId}`);
        }

        res.setHeader('Content-Type', meta.data.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(meta.data.name)}"`);
        if (meta.data.size) res.setHeader('Content-Length', meta.data.size);

        const stream = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        stream.data
            .on('error', err => {
                if (!res.headersSent) res.status(500).end();
            })
            .pipe(res);
    } catch (err) {
        if (!res.headersSent) res.status(500).send('Download error');
    }
});

module.exports = router;

