const express = require('express');
const router = express.Router();
const db = require('../database');
const { google } = require('googleapis');

const { sendSMS } = require('../utils/emailService');

// Helper to simulate notification
function sendNotification(staffId, taskTitle, action) {
    if (!staffId) return;

    // In a real app, we would look up the staff member's email/phone and send via SendGrid/Twilio
    db.get('SELECT * FROM staff WHERE id = $1', [staffId], (err, staff) => {
        if (err || !staff) return;

        console.log(`[NOTIFICATION] Preparing to send to ${staff.name} (${staff.phone})...`);
        const message = `AgencyHub: Task "${taskTitle}" was ${action}.`;

        // Use 'spectrum' as default based on user request
        if (staff.phone) {
            sendSMS(staff.phone, message, 'spectrum');
        }
    });
}

// Get all tasks
router.get('/', (req, res) => {
    // JOIN to get client name AND staff name
    const sql = `SELECT t.*, c.name as client_name, c.company as client_company, s.name as staff_name
                 FROM tasks t 
                 LEFT JOIN clients c ON t.client_id = c.id 
                 LEFT JOIN staff s ON t.assigned_to = s.id
                 ORDER BY t.created_at DESC`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create task
// Create task
router.post('/', (req, res) => {
    const { title, description, status, priority, due_date, client_id, assigned_to } = req.body;
    const sql = `INSERT INTO tasks (title, description, status, priority, due_date, client_id, assigned_to) 
               VALUES ($1, $2, $3, $4, $5, $6, $7)`;

    db.run(sql, [title, description, status, priority, due_date, client_id || null, assigned_to || null], async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const newTaskId = this.lastID;
        let googleEventId = null;

        // Auto-create on Google Calendar if connected
        if (process.env.GOOGLE_REFRESH_TOKEN && due_date) {
            try {
                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );
                oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

                // Handle Date (Assume YYYY-MM-DD or ISO) -> All Day Event
                const startDate = new Date(due_date);
                if (!isNaN(startDate.getTime())) {
                    // Start date YYYY-MM-DD
                    const startStr = startDate.toISOString().split('T')[0];

                    // End date (Next Day) for Google All-Day
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 1);
                    const endStr = endDate.toISOString().split('T')[0];

                    const event = {
                        summary: `[Task] ${title}`, // Prefix to identify it in sync
                        description: description || '',
                        start: { date: startStr },
                        end: { date: endStr }
                    };

                    const response = await calendar.events.insert({
                        calendarId: 'primary',
                        resource: event
                    });
                    googleEventId = response.data.id;
                    console.log(`[Google Calendar] Created event for task #${newTaskId}: ${googleEventId}`);

                    // Update local task with Google ID immediately
                    db.run('UPDATE tasks SET google_event_id = $1 WHERE id = $2', [googleEventId, newTaskId]);
                }
            } catch (googleErr) {
                console.error('Error creating Google Calendar event:', googleErr);
            }
        }

        if (assigned_to) {
            sendNotification(assigned_to, title, 'CREATED and ASSIGNED to you');
        }

        res.json({
            id: newTaskId,
            title, description, status, priority, due_date, client_id, assigned_to,
            google_event_id: googleEventId
        });
    });
});

// Update task
router.put('/:id', (req, res) => {
    // Fetch the existing task to support partial updates
    db.get('SELECT * FROM tasks WHERE id = $1', [req.params.id], (err, task) => {
        if (err || !task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const title = req.body.title !== undefined ? req.body.title : task.title;
        const description = req.body.description !== undefined ? req.body.description : task.description;
        const status = req.body.status !== undefined ? req.body.status : task.status;
        const priority = req.body.priority !== undefined ? req.body.priority : task.priority;
        const due_date = req.body.due_date !== undefined ? req.body.due_date : task.due_date;
        const client_id = req.body.client_id !== undefined ? (req.body.client_id || null) : task.client_id;
        const assigned_to = req.body.assigned_to !== undefined ? (req.body.assigned_to || null) : task.assigned_to;

        const sql = `UPDATE tasks 
                   SET title = $1, description = $2, status = $3, priority = $4, due_date = $5, client_id = $6, assigned_to = $7,
                       updated_at = CURRENT_TIMESTAMP 
                   WHERE id = $8`;

        db.run(sql, [title, description, status, priority, due_date, client_id, assigned_to, req.params.id], function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            // Check if assigned_to changed? Ideally yes, but simpler to just notify on update if assigned
            if (req.body.assigned_to !== undefined && assigned_to) {
                sendNotification(assigned_to, title, 'UPDATED / ASSIGNED to you');
            }

            res.json({ message: 'Task updated', changes: this.changes });
        });
    });
});

// Delete task
router.delete('/:id', (req, res) => {
    const taskId = req.params.id;

    // 1. Check for linked Google ID
    db.get('SELECT google_event_id FROM tasks WHERE id = $1', [taskId], async (err, task) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // 2. Try to delete from Google (Calendar OR Tasks)
        if (task.google_event_id && process.env.GOOGLE_REFRESH_TOKEN) {
            try {
                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET,
                    process.env.GOOGLE_REDIRECT_URI
                );
                oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

                let deletedFromGoogle = false;

                // A. Try Calendar First
                try {
                    await calendar.events.delete({
                        calendarId: 'primary',
                        eventId: task.google_event_id
                    });
                    console.log(`[Google Calendar] Deleted linked event: ${task.google_event_id}`);
                    deletedFromGoogle = true;
                } catch (calErr) {
                    // Ignore if not found, it might be a Task
                }

                // B. If not deleted from Calendar, Try Google Tasks (Mark as Completed)
                if (!deletedFromGoogle) {
                    try {
                        const taskListsRes = await tasksService.tasklists.list({ maxResults: 20 });
                        const taskLists = taskListsRes.data.items || [];

                        for (const list of taskLists) {
                            try {
                                // Try to mark as completed (hides it from sync)
                                await tasksService.tasks.update({
                                    tasklist: list.id,
                                    task: task.google_event_id,
                                    resource: {
                                        status: 'completed',
                                        title: task.title,
                                        completed: new Date().toISOString()
                                    }
                                });
                                console.log(`[Google Tasks] Marked COMPLETED in list ${list.title}: ${task.google_event_id}`);
                                deletedFromGoogle = true;
                                break;
                            } catch (taskErr) {
                                // 404 = Not in this list
                            }
                        }
                    } catch (tasksErr) {
                        console.error('Google Tasks API error:', tasksErr.message);
                    }
                }

            } catch (googleMainErr) {
                console.error('Google Auth/Setup Error:', googleMainErr.message);
            }
        }

        // 3. Delete from Local DB
        db.run('DELETE FROM tasks WHERE id = $1', [taskId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Task deleted', changes: this.changes });
        });
    });
});

// ... existing routes ...

// Sync tasks with Google Calendar AND Google Tasks
router.post('/sync-google', async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../sync_debug.log');
    const log = (msg) => {
        try {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
        } catch (e) {
            console.error('Log Error:', e);
        }
    };

    log('--- Starting Sync Request ---');

    try {
        if (!process.env.GOOGLE_REFRESH_TOKEN) {
            log('Error: No Refresh Token');
            return res.status(401).json({ error: 'Google Calendar not connected' });
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

        let syncedCount = 0;
        let errors = [];

        // 1. Fetch Calendar Events (Legacy "Task" events)
        try {
            log('Fetching Calendar Events...');
            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: new Date().toISOString(),
                maxResults: 100,
                singleEvents: true,
                orderBy: 'startTime',
            });
            const events = response.data.items || [];
            log(`Found ${events.length} total calendar events`);

            const taskEvents = events.filter(event =>
                event.summary && (event.summary.toLowerCase().startsWith('[task]') || event.summary.toLowerCase().startsWith('task:'))
            );
            log(`Found ${taskEvents.length} generic task events`);

            for (const event of taskEvents) {
                const title = event.summary.replace(/^\[task\]\s*/i, '').replace(/^task:\s*/i, '').trim();
                const googleEventId = event.id;
                await upsertTask(title, event.description || '', googleEventId, event.start.dateTime || event.start.date, 'todo');
                syncedCount++;
            }
        } catch (calErr) {
            log('Calendar Error: ' + calErr.message);
            errors.push('Calendar: ' + calErr.message);
        }

        // 2. Fetch Google Tasks
        try {
            log('Fetching Google Task Lists...');
            const taskListsRes = await tasksService.tasklists.list({ maxResults: 10 });
            const taskLists = taskListsRes.data.items || [];
            log(`Found ${taskLists.length} task lists`);

            for (const list of taskLists) {
                log(`Processing list: ${list.title} (${list.id})`);
                const tasksRes = await tasksService.tasks.list({
                    tasklist: list.id,
                    showCompleted: false, // Only fetch active tasks
                    showHidden: true,
                    maxResults: 100
                });

                const googleTasks = tasksRes.data.items || [];
                log(`Found ${googleTasks.length} active tasks in list ${list.title}`);

                for (const task of googleTasks) {
                    // Google Task has 'status' = 'needsAction' or 'completed'
                    // Skip if empty title
                    if (!task.title) continue;

                    let status = 'todo';
                    if (task.status === 'completed') status = 'done';

                    log(` - Syncing Task: ${task.title} [${status}] (Due: ${task.due})`);

                    await upsertTask(
                        task.title,
                        task.notes || '',
                        task.id,
                        task.due,
                        status
                    );
                    syncedCount++;
                }
            }
        } catch (taskErr) {
            log('Tasks API Error: ' + taskErr.message);
            if (taskErr.message.includes('Insufficient Permission')) {
                errors.push('Google Tasks: Permission denied. Please re-authenticate at /auth/google to grant Tasks access.');
            } else if (taskErr.message.includes('API has not been used') || taskErr.message.includes('is disabled')) {
                errors.push('Google Tasks API is not enabled. Please enable it in your Google Cloud Console.');
            } else {
                errors.push('Google Tasks: ' + taskErr.message);
            }
        }

        log(`Sync Complete. Total Synced: ${syncedCount}`);

        res.json({
            message: `Successfully synced ${syncedCount} items using Google Calendar & Tasks APIs`,
            count: syncedCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        log('Fatal Sync Error: ' + error.message);
        console.error('Sync Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to upsert tasks
async function upsertTask(title, description, googleId, dueDate, status) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO tasks (title, description, google_event_id, due_date, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(google_event_id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                due_date = excluded.due_date,
                status = excluded.status,
                updated_at = CURRENT_TIMESTAMP
        `, [title, description, googleId, dueDate, status], function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = router;
