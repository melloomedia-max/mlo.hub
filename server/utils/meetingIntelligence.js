const db = require('../database');
const gemini = require('./geminiHelpers');
const { getDriveClient } = require('./driveHelpers');
const { google } = require('googleapis');

function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => resolve(row));
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err); else resolve(this.lastID);
        });
    });
}

async function summarizeMeeting(meetingId) {
    try {
        const meeting = await dbGet("SELECT m.*, t.client_id FROM meetings m LEFT JOIN tasks t ON m.title = t.title WHERE m.id = ?", [meetingId]);
        if (!meeting) throw new Error("Meeting not found");
        if (!meeting.meet_space_name) throw new Error("No Google Meet Space linked to this meeting");

        const auth = await getDriveClient(); // gets the oauth2client directly in this setup if modified, or we re-initialize
        // Let's directly init from env since we need google Meet API
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

        const meet = google.meet({ version: 'v2', auth: oauth2Client });
        
        // 1. Fetch Conference Records
        const recordsResponse = await meet.conferenceRecords.list({
            filter: `space.name="${meeting.meet_space_name}"`
        });
        
        const records = recordsResponse.data.conferenceRecords || [];
        if (records.length === 0) throw new Error("No conference records found for this space yet.");
        
        // Use the most recent record
        const recordName = records[0].name;
        
        // 2. Fetch Transcripts
        const transcriptsResponse = await meet.conferenceRecords.transcripts.list({
            parent: recordName
        });
        const transcripts = transcriptsResponse.data.transcripts || [];
        if (transcripts.length === 0) throw new Error("No transcripts found for this meeting.");
        
        const transcriptName = transcripts[0].name;
        
        // 3. Fetch Transcript Entries
        const entriesResponse = await meet.conferenceRecords.transcripts.entries.list({
            parent: transcriptName,
            pageSize: 1000
        });
        
        const entries = entriesResponse.data.entries || [];
        const fullText = entries.map(e => `[${e.participant || 'Speaker'}]: ${e.text}`).join('\n');
        
        if (!fullText) throw new Error("Transcript is empty.");

        // 4. Gemini Summary
        const prompt = `
Analyze the following meeting transcript.
Return pure JSON with no markdown wrapping.
Schema: {
  "summary": "String",
  "decisionsMade": ["..."],
  "actionItems": [{ "task": "...", "owner": "...", "dueDate": "YYYY-MM-DD" }],
  "followUpQuestions": ["..."],
  "mood": "positive|neutral|negative|tense"
}
Transcript:
${fullText}
`;
        let responseText = await gemini.ask(prompt);
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/```json/g, '');
        if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```/g, '');
        
        const analysis = JSON.parse(cleaned);

        // 5. Append to Client Activity Doc
        if (meeting.client_id) {
            const client = await dbGet("SELECT activity_doc_id FROM clients WHERE id = ?", [meeting.client_id]);
            if (client && client.activity_doc_id) {
                const docs = google.docs({ version: 'v1', auth: oauth2Client });
                
                const docAppendText = `\n\n=== Meeting Summary: ${meeting.title} (${new Date().toLocaleDateString()}) ===\nMood: ${analysis.mood}\n\nSummary:\n${analysis.summary}\n\nDecisions:\n${analysis.decisionsMade.map(d => '- ' + d).join('\n')}\n\nAction Items:\n${analysis.actionItems.map(a => `- ${a.task} [Owner: ${a.owner}]`).join('\n')}\n`;
                
                // Get doc end index
                const docStructure = await docs.documents.get({ documentId: client.activity_doc_id });
                const content = docStructure.data.body.content;
                const endIndex = content[content.length - 1].endIndex - 1;

                await docs.documents.batchUpdate({
                    documentId: client.activity_doc_id,
                    requestBody: {
                        requests: [{
                            insertText: {
                                location: { index: endIndex },
                                text: docAppendText
                            }
                        }]
                    }
                });
            }

            // 6. Auto-create Tasks
            for (const item of analysis.actionItems) {
                await dbRun("INSERT INTO tasks (client_id, title, description, status, due_date) VALUES (?, ?, ?, 'todo', ?)", 
                    [meeting.client_id, `[Meeting] ${item.task}`, `Owner: ${item.owner}`, item.dueDate || null]);
            }
        }

        // 7. Save JSON to DB
        await dbRun("UPDATE meetings SET ai_summary = ? WHERE id = ?", [JSON.stringify(analysis), meetingId]);

        return analysis;

    } catch (e) {
        throw e;
    }
}

module.exports = { summarizeMeeting };
