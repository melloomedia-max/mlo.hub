const db = require('../database');
const gemini = require('./geminiHelpers');

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

async function generateClientIntelligence(clientId) {
    try {
        const client = await dbGet("SELECT id, name, first_name, last_name, company, status, ai_health_report FROM clients WHERE id = ?", [clientId]);
        if (!client) throw new Error("Client not found");

        const invoices = await dbAll("SELECT status, due_date, total_amount, issue_date FROM invoices WHERE client_id = ?", [clientId]);
        const tasks = await dbAll("SELECT title, status, due_date, priority FROM tasks WHERE client_id = ?", [clientId]);
        const notes = await dbAll("SELECT content, created_at FROM client_notes WHERE client_id = ? ORDER BY created_at DESC LIMIT 10", [clientId]);
        const projects = await dbAll("SELECT name, status, deadline, budget FROM projects WHERE client_id = ?", [clientId]);
        const timeLogs = await dbGet("SELECT SUM(tl.duration) as total_mins FROM time_logs tl JOIN tasks t ON tl.task_id = t.id WHERE t.client_id = ?", [clientId]);
        
        const prompt = `
Analyze the following client. Generate a JSON object.
Schema: { "score": 85, "sentiment": "positive" | "neutral" | "negative", "summary": "...", "risks": ["..."], "nextActions": ["..."], "generatedAt": "..." }
Rules:
- score: 0-100 health score
- generatedAt: current ISO timestamp

Client Name: ${client.first_name || ''} ${client.last_name || ''} (${client.company || 'No Company'})
Invoices: ${JSON.stringify(invoices)}
Tasks: ${JSON.stringify(tasks)}
Projects: ${JSON.stringify(projects)}
Notes: ${JSON.stringify(notes)}
Total Logged Time: ${Math.round((timeLogs.total_mins || 0) / 60)} minutes
`;

        let responseText = await gemini.ask(prompt);
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/```json/g, '');
        if (cleaned.startsWith('```')) cleaned = cleaned.replace(/```/g, '');
        cleaned = cleaned.trim();
        
        let reportData;
        try {
            reportData = JSON.parse(cleaned);
        } catch (e) {
            reportData = { score: 50, sentiment: 'neutral', summary: "Generation failed to parse.", risks: [], nextActions: [], generatedAt: new Date().toISOString() };
        }
        
        const jsonString = JSON.stringify(reportData);
        await dbRun("UPDATE clients SET ai_health_report = ? WHERE id = ?", [jsonString, clientId]);
        return reportData;

    } catch (error) {
        console.error("AI Health Error:", error);
        throw error;
    }
}

module.exports = { generateClientIntelligence };
