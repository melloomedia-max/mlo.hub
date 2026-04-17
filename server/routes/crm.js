const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const router = express.Router();
const db = require('../database');
const multer = require('multer');
const fs = require('fs');
const { getDriveClient, createInvoicesSubfolder, getInvoicesSubfolderId, createActivityDoc, appendNoteToDoc, getMeetingRecordingsSubfolderId, getOrCreateProjectFolder } = require('../utils/driveHelpers');
const { generateClientIntelligence } = require('../utils/clientIntelligence');
const upload = multer({ dest: 'uploads/' });

// Helper to create client folder
async function createClientFolder(firstName, lastName) {
    const drive = await getDriveClient();
    if (!drive) return null;

    const mainFolderMetadata = {
        'name': `CRM: ${firstName} ${lastName}`,
        'mimeType': 'application/vnd.google-apps.folder'
    };

    try {
        // 1. Create Main Folder
        const mainFile = await drive.files.create({
            resource: mainFolderMetadata,
            fields: 'id'
        });
        const mainFolderId = mainFile.data.id;

        // 2. Create "Invoices" Subfolder
        await createInvoicesSubfolder(mainFolderId);

        return mainFolderId;
    } catch (err) {
        console.error('Error creating Drive folder:', err);
        return null;
    }
}

// Search clients (quick search across name, email, company, phone, and linked businesses)
router.get('/clients/search', (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const like = `%${q}%`;
    const sql = `
        SELECT DISTINCT c.*,
            GROUP_CONCAT(DISTINCT cb.name) as business_names
        FROM clients c
        LEFT JOIN client_businesses cb ON cb.client_id = c.id
        WHERE c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ? OR c.phone LIKE ?
            OR c.first_name LIKE ? OR c.last_name LIKE ? OR cb.name LIKE ?
        GROUP BY c.id
        ORDER BY c.name ASC
        LIMIT 20
    `;
    db.all(sql, [like, like, like, like, like, like, like], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get all clients (with business names)
router.get('/clients', (req, res) => {
    const sql = `
        SELECT c.*,
            GROUP_CONCAT(DISTINCT cb.name) as business_names,
            (SELECT SUM(total_amount - amount_paid) FROM invoices WHERE invoices.client_id = c.id AND invoices.status IN ('sent', 'finalized', 'overdue')) as total_balance
        FROM clients c
        LEFT JOIN client_businesses cb ON cb.client_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get single client
router.get('/clients/:id', (req, res) => {
    const sql = `
        SELECT c.*,
            GROUP_CONCAT(DISTINCT cb.name) as business_names,
            (SELECT SUM(total_amount - amount_paid) FROM invoices WHERE invoices.client_id = c.id AND invoices.status IN ('sent', 'finalized', 'overdue')) as total_balance
        FROM clients c
        LEFT JOIN client_businesses cb ON cb.client_id = c.id
        WHERE c.id = ?
        GROUP BY c.id
    `;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Client not found' });
        res.json(row);
    });
});

// ── Client Businesses CRUD ───────────────────────────────────────────────
// Get businesses for a client
router.get('/clients/:id/businesses', (req, res) => {
    db.all('SELECT * FROM client_businesses WHERE client_id = ? ORDER BY created_at ASC',
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// Add business to client
router.post('/clients/:id/businesses', (req, res) => {
    const { name, role, industry, website } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Business name is required' });

    db.run(
        'INSERT INTO client_businesses (client_id, name, role, industry, website) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, name.trim(), role || null, industry || null, website || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, client_id: parseInt(req.params.id), name: name.trim(), role, industry, website });
        }
    );
});

// Update business
router.put('/businesses/:id', (req, res) => {
    const { name, role, industry, website } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Business name is required' });

    db.run(
        'UPDATE client_businesses SET name = ?, role = ?, industry = ?, website = ? WHERE id = ?',
        [name.trim(), role || null, industry || null, website || null, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Business updated' });
        }
    );
});

// Delete business
router.delete('/businesses/:id', (req, res) => {
    db.run('DELETE FROM client_businesses WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Business deleted' });
    });
});

// Create client
router.post('/clients', async (req, res) => {
    const { first_name, last_name, birthday, email, phone, company, status, notes, social_instagram, social_linkedin, social_twitter, social_facebook } = req.body;
    // Construct display name
    const name = `${first_name} ${last_name}`.trim();

    // Create Drive folder
    const folderId = await createClientFolder(first_name, last_name);

    const sql = `INSERT INTO clients (first_name, last_name, birthday, name, email, phone, company, status, notes, google_drive_folder_id, social_instagram, social_linkedin, social_twitter, social_facebook) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [first_name, last_name, birthday, name, email, phone, company, status, notes, folderId, social_instagram, social_linkedin, social_twitter, social_facebook], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const clientId = this.lastID;
        
        // Campaign Trigger
        const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
        enrollClientInCampaignByTrigger(clientId, 'client_onboarded').catch(e => console.error(e));

        res.json({ id: clientId, first_name, last_name, birthday, name, email, phone, company, status, notes, google_drive_folder_id: folderId });
    });
});

// Update client
router.put('/clients/:id', (req, res) => {
    // fields allowed to be updated
    const updateableFields = [
        'first_name', 'last_name', 'birthday', 'email', 'phone', 'company',
        'status', 'notes', 'google_drive_folder_id',
        'social_instagram', 'social_linkedin', 'social_twitter', 'social_facebook'
    ];

    const updates = [];
    const params = [];

    // Handle name update if first/last are present
    if (req.body.first_name || req.body.last_name) {
        // We can't easily construct the full name if we only get one part unless we fetch the other part from DB.
        // For simplicity, we assume frontend sends both if it updates name, OR we update name using what we have.
        // Actually, let's just update 'name' if first_name OR last_name is provided.
        // The robust way is to fetch current values if one is missing, but let's stick to the current logic:
        // If frontend sends first_name/last_name, we update 'name'.
        const firstName = req.body.first_name || '';
        const lastName = req.body.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();

        // Only update name if we have at least one name part provided in the request
        if (req.body.first_name !== undefined || req.body.last_name !== undefined) {
            updates.push('name = ?');
            params.push(fullName);
        }
    }

    updateableFields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            params.push(req.body[field]);
        }
    });

    if (updates.length === 0) {
        return res.json({ message: 'No changes provided' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    const sql = `UPDATE clients SET ${updates.join(', ')} WHERE id = ?`;

    db.get('SELECT status FROM clients WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: err ? err.message : 'Client not found' });
        const oldStatus = row.status;

        db.run(sql, params, function (err) {
            if (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
                return;
            }

            // Campaign Trigger: New Onboarded (Lead -> Active)
            if (req.body.status === 'active' && oldStatus !== 'active') {
                const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
                enrollClientInCampaignByTrigger(req.params.id, 'client_onboarded').catch(e => console.error(e));
            }

            res.json({ message: 'Client updated', changes: this.changes });
        });
    });
});

// Get Drive files for a client
router.get('/clients/:id/drive/files', async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive connection required' });

        // Get folder ID from DB
        db.get('SELECT google_drive_folder_id FROM clients WHERE id = ?', [req.params.id], async (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row || !row.google_drive_folder_id) return res.json([]);

            try {
                const response = await drive.files.list({
                    q: `'${row.google_drive_folder_id}' in parents and trashed = false`,
                    fields: 'files(id, name, mimeType, webContentLink, webViewLink, thumbnailLink, iconLink)',
                    pageSize: 50,
                    orderBy: 'folder, name'
                });
                res.json(response.data.files);
            } catch (driveErr) {
                console.error('Drive API Error:', driveErr);
                res.status(500).json({ error: driveErr.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create folder (and Activity Doc) for existing client
router.post('/clients/:id/drive/folder', async (req, res) => {
    try {
        db.get('SELECT first_name, last_name, google_drive_folder_id, activity_doc_id FROM clients WHERE id = ?', [req.params.id], async (err, client) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!client) return res.status(404).json({ error: 'Client not found' });

            let folderId = client.google_drive_folder_id;
            let docId = client.activity_doc_id;
            let changesMade = false;

            // 1. Ensure Folder Exists
            if (!folderId) {
                folderId = await createClientFolder(client.first_name, client.last_name);
                if (folderId) {
                    changesMade = true;
                    // Save immediately in case next step fails
                    db.run('UPDATE clients SET google_drive_folder_id = ? WHERE id = ?', [folderId, req.params.id]);
                } else {
                    return res.status(500).json({ error: 'Failed to create Drive folder' });
                }
            }

            // 2. Ensure Activity Doc Exists
            if (folderId && !docId) {
                const doc = await createActivityDoc(folderId, `${client.first_name} ${client.last_name}`);
                if (doc) {
                    docId = doc.id;
                    changesMade = true;
                    db.run('UPDATE clients SET activity_doc_id = ? WHERE id = ?', [docId, req.params.id]);
                }
            }

            // Wait a moment for DB updates if needed, though they are async fire-and-forget above mostly
            // Ideally we wait properly but keeping it simple for now

            // 3. Ensure Meeting Recordings Folder Exists
            if (folderId) {
                await getMeetingRecordingsSubfolderId(folderId);
            }

            res.json({ folderId, activityDocId: docId });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload file to Client Drive Folder
router.post('/clients/:id/drive/upload', upload.single('file'), async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });

        const client = await new Promise((resolve, reject) => {
            db.get("SELECT google_drive_folder_id FROM clients WHERE id = ?", [req.params.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!client || !client.google_drive_folder_id) {
            return res.status(404).json({ error: 'Client folder not found' });
        }

        const fileMetadata = {
            name: req.file.originalname,
            parents: [client.google_drive_folder_id]
        };
        const media = {
            mimeType: req.file.mimetype,
            body: fs.createReadStream(req.file.path)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        // Cleanup temp file
        if (req.file.path) fs.unlinkSync(req.file.path);

        res.json(file.data);

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Proxy Drive file content (for images/previews)
router.get('/drive/proxy/:fileId', async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).send('No Drive Access');

        const fileId = req.params.fileId;

        // Get file metadata for mime type
        const file = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name'
        });

        res.setHeader('Content-Type', file.data.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${file.data.name}"`);

        // Stream file content
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        response.data
            .on('end', () => { })
            .on('error', err => {
                console.error('Error streaming file:', err);
                res.status(500).end();
            })
            .pipe(res);

    } catch (error) {
        console.error('Proxy Error:', error.message);
        res.status(500).send('Error fetching file');
    }
});

// Delete client
router.delete('/clients/:id', (req, res) => {
    db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: 'Client deleted', changes: this.changes });
    });
});

// Get notes for a client
router.get('/clients/:id/notes', (req, res) => {
    db.all('SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC', [req.params.id], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add note to client
router.post('/clients/:id/notes', (req, res) => {
    const { content } = req.body;
    const client_id = req.params.id;

    db.run('INSERT INTO client_notes (client_id, content) VALUES (?, ?)', [client_id, content], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // Sync to Doc (fire and forget)
        db.get('SELECT activity_doc_id FROM clients WHERE id = ?', [client_id], (err, client) => {
            if (client && client.activity_doc_id) {
                appendNoteToDoc(client.activity_doc_id, content, 'User');
            }
        });

        // Return the new note
        db.get('SELECT * FROM client_notes WHERE id = ?', [this.lastID], (err, row) => {
            res.json(row);
        });
        
        // Auto-regenerate health report in background
        generateClientIntelligence(client_id).catch(e => console.error(e));
    });
});

// Update note
router.put('/notes/:id', (req, res) => {
    const { content } = req.body;
    db.run('UPDATE client_notes SET content = ? WHERE id = ?', [content, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Note updated' });
    });
});

// Delete note
router.delete('/notes/:id', (req, res) => {
    db.run('DELETE FROM client_notes WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Note deleted' });
    });
});

// Get all projects
router.get('/projects', (req, res) => {
    const sql = `SELECT p.*, c.name as client_name 
               FROM projects p 
               LEFT JOIN clients c ON p.client_id = c.id 
               ORDER BY p.created_at DESC`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get projects for a specific client (with invoice summary)
router.get('/clients/:id/projects', (req, res) => {
    const sql = `
        SELECT p.*,
            (SELECT COUNT(*) FROM invoices WHERE invoices.project_id = p.id) as invoice_count,
            (SELECT GROUP_CONCAT(DISTINCT invoices.status) FROM invoices WHERE invoices.project_id = p.id) as invoice_statuses,
            (SELECT SUM(invoices.total_amount) FROM invoices WHERE invoices.project_id = p.id AND invoices.status = 'paid') as paid_amount,
            (SELECT SUM(invoices.total_amount) FROM invoices WHERE invoices.project_id = p.id AND invoices.status IN ('sent','finalized')) as pending_amount
        FROM projects p
        WHERE p.client_id = ?
        ORDER BY p.created_at DESC`;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Derive payment_status from invoices automatically
        rows.forEach(p => {
            if (p.invoice_count > 0) {
                const statuses = (p.invoice_statuses || '').split(',');
                if (statuses.includes('paid') && !statuses.includes('sent') && !statuses.includes('finalized')) {
                    p.payment_status = 'paid';
                } else if (statuses.includes('paid') && (statuses.includes('sent') || statuses.includes('finalized'))) {
                    p.payment_status = 'partial';
                } else if (statuses.includes('sent')) {
                    p.payment_status = 'invoice-sent';
                } else if (statuses.includes('finalized')) {
                    p.payment_status = 'invoice-sent';
                }
            }
        });
        res.json(rows);
    });
});

// Get all invoices linked to a specific project
router.get('/projects/:id/invoices', (req, res) => {
    const sql = `
        SELECT invoices.*, clients.name as client_name
        FROM invoices
        LEFT JOIN clients ON invoices.client_id = clients.id
        WHERE invoices.project_id = ?
        ORDER BY invoices.created_at DESC`;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create project
router.post('/projects', (req, res) => {
    const { client_id, name, status, budget, deadline, notes, payment_status } = req.body;
    const sql = `INSERT INTO projects (client_id, name, status, budget, deadline, notes, payment_status) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [client_id, name, status || 'active', budget, deadline, notes, payment_status || 'unpaid'], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID, client_id, name, status: status || 'active', budget, deadline, notes, payment_status: payment_status || 'unpaid' });
    });
});

// Update project
router.put('/projects/:id', (req, res) => {
    const { name, status, budget, deadline, notes, payment_status } = req.body;
    db.get('SELECT client_id, status FROM projects WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(500).json({ error: err ? err.message : 'Project not found' });
        
        const sql = `UPDATE projects SET name=?, status=?, budget=?, deadline=?, notes=?, payment_status=? WHERE id=?`;
        db.run(sql, [name, status, budget, deadline, notes, payment_status, req.params.id], function (updateErr) {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
            
            // Check if status changed to 'completed'
            if (status === 'completed' && row.status !== 'completed') {
                const campaignRunner = require('../utils/campaignRunner');
                campaignRunner.enrollClientInCampaignByTrigger(row.client_id, 'project_completed');
            }
            
            res.json({ message: 'Project updated' });
        });
    });
});

// Delete project
router.delete('/projects/:id', (req, res) => {
    db.run('DELETE FROM projects WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Project deleted' });
    });
});

// ── Project Attachments ────────────────────────────────────────────────────

// Ensure project Drive folder exists (creates if needed) and saves folder ID
router.post('/projects/:id/folder', async (req, res) => {
    try {
        const project = await new Promise((resolve, reject) =>
            db.get('SELECT p.*, c.google_drive_folder_id FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ?',
                [req.params.id], (err, row) => err ? reject(err) : resolve(row))
        );
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!project.google_drive_folder_id) return res.status(400).json({ error: 'Client has no Drive folder' });

        // If already has a folder, return it
        if (project.project_folder_id) {
            return res.json({ folderId: project.project_folder_id });
        }

        const result = await getOrCreateProjectFolder(project.google_drive_folder_id, project.name);
        if (!result) return res.status(500).json({ error: 'Failed to create project folder' });

        db.run('UPDATE projects SET project_folder_id = ? WHERE id = ?', [result.projectFolderId, req.params.id]);
        res.json({ folderId: result.projectFolderId });
    } catch (err) {
        console.error('Project folder error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get attachments for a project
router.get('/projects/:id/attachments', (req, res) => {
    db.all('SELECT * FROM project_attachments WHERE project_id = ? ORDER BY created_at DESC',
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

// Upload attachment to project Drive folder
router.post('/projects/:id/attachments', upload.single('file'), async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });

        // Get project + its folder
        const project = await new Promise((resolve, reject) =>
            db.get('SELECT p.*, c.google_drive_folder_id FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ?',
                [req.params.id], (err, row) => err ? reject(err) : resolve(row))
        );
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // Ensure project folder exists
        let folderId = project.project_folder_id;
        if (!folderId) {
            if (!project.google_drive_folder_id) return res.status(400).json({ error: 'Client has no Drive folder' });
            const result = await getOrCreateProjectFolder(project.google_drive_folder_id, project.name);
            if (!result) return res.status(500).json({ error: 'Could not create project folder' });
            folderId = result.projectFolderId;
            db.run('UPDATE projects SET project_folder_id = ? WHERE id = ?', [folderId, req.params.id]);
        }

        // Upload file to Drive
        const fileMetadata = { name: req.file.originalname, parents: [folderId] };
        const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };
        const uploaded = await drive.files.create({
            resource: fileMetadata, media,
            fields: 'id, name, mimeType, webViewLink, thumbnailLink'
        });
        if (req.file.path) fs.unlinkSync(req.file.path);

        const f = uploaded.data;
        // Save to DB
        db.run(
            'INSERT INTO project_attachments (project_id, file_id, file_name, mime_type, thumbnail_link, web_view_link) VALUES (?,?,?,?,?,?)',
            [req.params.id, f.id, f.name, f.mimeType, f.thumbnailLink || null, f.webViewLink],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, project_id: req.params.id, file_id: f.id, file_name: f.name, mime_type: f.mimeType, thumbnail_link: f.thumbnailLink, web_view_link: f.webViewLink });
            }
        );
    } catch (err) {
        console.error('Attachment upload error:', err);
        if (req.file && req.file.path) try { fs.unlinkSync(req.file.path); } catch (_) { }
        res.status(500).json({ error: err.message });
    }
});

// Delete attachment
router.delete('/attachments/:id', (req, res) => {
    db.get('SELECT file_id FROM project_attachments WHERE id = ?', [req.params.id], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        // Optionally delete from Drive too
        if (row) {
            try {
                const drive = await getDriveClient();
                if (drive) await drive.files.delete({ fileId: row.file_id }).catch(() => { });
            } catch (_) { }
        }
        db.run('DELETE FROM project_attachments WHERE id = ?', [req.params.id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: 'Attachment deleted' });
        });
    });
});


// Manual Schema Fix Route (for debugging/repair)
router.get('/fix-schema', (req, res) => {
    const queries = [
        "ALTER TABLE clients ADD COLUMN first_name TEXT",
        "ALTER TABLE clients ADD COLUMN last_name TEXT",
        "ALTER TABLE clients ADD COLUMN birthday TEXT"
    ];

    let executed = 0;
    let errors = [];

    queries.forEach(q => {
        db.run(q, (err) => {
            executed++;
            if (err) errors.push(err.message);

            if (executed === queries.length) {
                res.json({
                    message: 'Schema patch attempt finished',
                    errors: errors,
                    note: 'Errors are expected if columns already exist.'
                });
            }
        });
    });
});

// Helper for Promisified DB
function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

// ==========================================
// 🧠 AI Client Intelligence Dashboard Route
// ==========================================
router.get('/ai-insights', async (req, res) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is missing from your .env file.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 1. Fetch active clients
        const clients = await dbAll("SELECT id, name, first_name, last_name, company, status FROM clients WHERE status IN ('active', 'lead')");
        if (clients.length === 0) return res.json([]);

        // 2. Build the dataset
        let promptData = `Analyze the following agency clients. Generate a JSON array containing exactly one object per client.
Schema:
[ { 
  "clientId": 1, 
  "clientName": "...", 
  "healthScore": 85, 
  "summary": "...", 
  "actionItem": "...",
  "actionType": "CREATE_INVOICE" | "CREATE_TASK" | "VIEW_CLIENT",
  "actionData": { "title": "Optional Task Title" }
} ]
Rules:
- healthScore: 0-100 (100 is perfect, 0 means high churn risk). Deduct based on overdue tasks/invoices, negative sentiment, etc.
- summary: 1-2 powerful sentences. e.g. "Hasn't been invoiced in 45 days. 2 overdue tasks."
- actionItem: A short actionable recommendation.
- actionType: Best UI action for the recommendation. Pick CREATE_INVOICE if they need billing, CREATE_TASK to do something, VIEW_CLIENT to review profile.
- actionData: Provide { "title": "..." } if CREATE_TASK is chosen, otherwise {}.

Data:\n`;

        for (const c of clients) {
            const invoices = await dbAll("SELECT status, due_date, total_amount, issue_date FROM invoices WHERE client_id = ?", [c.id]);
            const tasks = await dbAll("SELECT title, status, due_date, priority FROM tasks WHERE client_id = ?", [c.id]);
            const notes = await dbAll("SELECT content, created_at FROM client_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 6", [c.id]);
            const proj = await dbAll("SELECT name, status, deadline FROM projects WHERE client_id = ?", [c.id]);
            
            promptData += `\n--- CLIENT FOCUS: clientId: ${c.id}, Name: ${c.first_name || ''} ${c.last_name || ''} (${c.company || 'No Company'}), Status: ${c.status}\n`;
            promptData += `Invoices: ${JSON.stringify(invoices)}\n`;
            promptData += `Tasks: ${JSON.stringify(tasks)}\n`;
            promptData += `Projects: ${JSON.stringify(proj)}\n`;
            promptData += `Recent Notes: ${JSON.stringify(notes)}\n`;
        }

        // 3. Request insights from Gemini
        const result = await model.generateContent(promptData);
        let responseText = result.response.text();
        
        const insights = JSON.parse(responseText);
        res.json(insights);

    } catch (error) {
        console.error('AI Insights Error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate AI insights' });
    }
});

// GET cached AI health report
router.get('/clients/:id/health-report', (req, res) => {
    db.get('SELECT ai_health_report FROM clients WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row || !row.ai_health_report) return res.json(null);
        try {
            res.json(JSON.parse(row.ai_health_report));
        } catch (e) {
            res.json(null);
        }
    });
});

// POST generate new AI health report
router.post('/clients/:id/health-report', async (req, res) => {
    try {
        const report = await generateClientIntelligence(req.params.id);
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get client communications
router.get('/clients/:id/communications', (req, res) => {
    db.all('SELECT * FROM client_communications WHERE client_id = ? ORDER BY created_at DESC', [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create manual client communication
router.post('/clients/:id/communications', (req, res) => {
    const { type, method, description, task_id } = req.body;
    const sql = `INSERT INTO client_communications (client_id, type, method, description, task_id) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [req.params.id, type, method, description, task_id || null], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        db.get('SELECT * FROM client_communications WHERE id = ?', [this.lastID], (e, row) => {
            res.json(row);
        });
    });
});

// ═══════════════════════════════════════════════════════════
// MEDIA HUB MANAGEMENT ROUTES (Admin-side Drive management)
// ═══════════════════════════════════════════════════════════

// Create subfolder inside a client's Drive folder
router.post('/clients/:id/drive/subfolder', async (req, res) => {
    try {
        const { name, parentFolderId } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name is required' });

        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });

        const client = await new Promise((resolve, reject) => {
            db.get('SELECT google_drive_folder_id FROM clients WHERE id = ?', [req.params.id], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!client || !client.google_drive_folder_id) {
            return res.status(404).json({ error: 'Client has no Drive folder' });
        }

        const targetParent = parentFolderId || client.google_drive_folder_id;

        const folder = await drive.files.create({
            resource: {
                name: name.trim(),
                mimeType: 'application/vnd.google-apps.folder',
                parents: [targetParent]
            },
            fields: 'id, name, webViewLink'
        });

        res.json(folder.data);
    } catch (err) {
        console.error('Subfolder creation error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Upload file to a specific subfolder (or root client folder)
router.post('/clients/:id/drive/upload-to', upload.single('file'), async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });

        const targetFolderId = req.body.folderId;

        // If no specific folder, fall back to client root
        let parentId = targetFolderId;
        if (!parentId) {
            const client = await new Promise((resolve, reject) => {
                db.get('SELECT google_drive_folder_id FROM clients WHERE id = ?', [req.params.id], (err, row) => {
                    if (err) reject(err); else resolve(row);
                });
            });
            if (!client || !client.google_drive_folder_id) {
                return res.status(404).json({ error: 'Client folder not found' });
            }
            parentId = client.google_drive_folder_id;
        }

        const fileMetadata = {
            name: req.file.originalname,
            parents: [parentId]
        };
        const media = {
            mimeType: req.file.mimetype,
            body: fs.createReadStream(req.file.path)
        };

        const uploaded = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: 'id, name, mimeType, webViewLink, thumbnailLink, modifiedTime, size'
        });

        if (req.file.path) fs.unlinkSync(req.file.path);
        res.json(uploaded.data);
    } catch (err) {
        console.error('Upload-to error:', err);
        if (req.file && req.file.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
        res.status(500).json({ error: err.message });
    }
});

// Browse a specific subfolder of a client's Drive
router.get('/clients/:id/drive/folder/:folderId', async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });

        const folderId = req.params.folderId;

        // Files
        const fileRes = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, webViewLink, webContentLink, iconLink, mimeType, thumbnailLink, modifiedTime, size)',
            pageSize: 100,
            orderBy: 'modifiedTime desc'
        });

        // Subfolders
        const folderRes = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false and mimeType = 'application/vnd.google-apps.folder'`,
            fields: 'files(id, name, webViewLink)',
            pageSize: 50,
            orderBy: 'name'
        });

        // Folder name
        const meta = await drive.files.get({ fileId: folderId, fields: 'name' });

        res.json({
            folderName: meta.data.name,
            files: fileRes.data.files || [],
            folders: folderRes.data.files || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a Drive file
router.delete('/drive/file/:fileId', async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });
        await drive.files.delete({ fileId: req.params.fileId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rename a Drive file/folder
router.patch('/drive/file/:fileId', async (req, res) => {
    try {
        const drive = await getDriveClient();
        if (!drive) return res.status(401).json({ error: 'Google Drive not connected' });
        const { name } = req.body;
        const updated = await drive.files.update({
            fileId: req.params.fileId,
            resource: { name },
            fields: 'id, name'
        });
        res.json(updated.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
