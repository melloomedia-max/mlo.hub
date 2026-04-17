const path = require('path');
const db = require('../database');
const gemini = require('./geminiHelpers');
const nodemailer = require('nodemailer');
const { sendSMS } = require('./emailService');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => resolve(row));
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err); else resolve(this.changes);
        });
    });
}

async function runDueSends() {
    try {
        console.log('[Campaign] Checking for nodes to process...');
        const enrollments = await dbAll(`
            SELECT ce.*, c.flow_data, cl.first_name, cl.last_name, cl.company, cl.email, cl.phone
            FROM campaign_enrollments ce
            JOIN campaigns c ON ce.campaign_id = c.id
            JOIN clients cl ON ce.client_id = cl.id
            WHERE ce.status = 'active' 
              AND (ce.next_action_at IS NULL OR ce.next_action_at <= CURRENT_TIMESTAMP)
        `);

        for (const enr of enrollments) {
            let flow = { nodes: [], edges: [] };
            try { flow = JSON.parse(enr.flow_data || '{"nodes":[], "edges":[]}'); } catch(e) {}
            
            let currentNodeId = enr.current_node_id;
            if (!currentNodeId) {
                const triggerNode = flow.nodes.find(n => n.type === 'trigger');
                if (triggerNode) {
                    const edge = flow.edges.find(e => e.source === triggerNode.id);
                    currentNodeId = edge ? edge.target : null;
                }
            }

            let maxSteps = 10;
            while (currentNodeId && maxSteps > 0) {
                const node = flow.nodes.find(n => n.id === currentNodeId);
                if (!node) {
                    await dbRun("UPDATE campaign_enrollments SET status = 'completed' WHERE id = ?", [enr.id]);
                    break;
                }

                const result = await processNode(enr, node, flow);
                
                if (result && result.waitDuration > 0) break;
                
                currentNodeId = result ? result.nextNodeId : null;
                maxSteps--;
            }
        }
    } catch (e) {
        console.error('[Campaign Runner Error]', e);
    }
}

async function processNode(enr, node, flow) {
    let nextNodeId = null;
    let waitDuration = 0; // in hours

    try {
        switch (node.type) {
            case 'action':
                const actionType = node.data.actionType;
                if (actionType === 'email') {
                    await sendCampaignEmail(enr, node.data.templateId, node.data.subject, node.data.body);
                } else if (actionType === 'sms') {
                    await sendCampaignSMS(enr, node.data.templateId, node.data.body);
                } else if (actionType === 'task') {
                    await createCampaignTask(enr, node.data.taskTitle, node.data.taskDescription);
                }
                const edge = flow.edges.find(e => e.source === node.id);
                nextNodeId = edge ? edge.target : null;
                break;

            case 'wait':
                const hours = parseInt(node.data.hours) || 0;
                const days = parseInt(node.data.days) || 0;
                waitDuration = hours + (days * 24);
                
                const waitEdge = flow.edges.find(e => e.source === node.id);
                nextNodeId = waitEdge ? waitEdge.target : null;
                break;

            case 'condition':
                let conditionMet = false;
                const cType = node.data.conditionType;
                
                if (cType === 'has_paid_invoice') {
                    const inv = await dbGet("SELECT id FROM invoices WHERE client_id = ? AND status = 'paid' LIMIT 1", [enr.client_id]);
                    conditionMet = !!inv;
                } else if (cType === 'is_subscribed') {
                    const sub = await dbGet("SELECT id FROM subscriptions WHERE client_id = ? AND status = 'active' LIMIT 1", [enr.client_id]);
                    conditionMet = !!sub;
                } else if (cType === 'was_email_sent') {
                    const comm = await dbGet("SELECT id FROM campaign_sends WHERE enrollment_id = ? AND type = 'email' LIMIT 1", [enr.id]);
                    conditionMet = !!comm;
                }

                const handle = conditionMet ? 'true' : 'false';
                const condEdge = flow.edges.find(e => e.source === node.id && e.sourceHandle === handle);
                nextNodeId = condEdge ? condEdge.target : null;
                break;

            case 'end':
                await dbRun("UPDATE campaign_enrollments SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [enr.id]);
                return;

            default:
                const defaultEdge = flow.edges.find(e => e.source === node.id);
                nextNodeId = defaultEdge ? defaultEdge.target : null;
        }

        const nextActionAt = waitDuration > 0 
            ? new Date(Date.now() + waitDuration * 60 * 60 * 1000).toISOString()
            : null;

        await dbRun(`
            UPDATE campaign_enrollments 
            SET current_node_id = ?, 
                last_action_at = CURRENT_TIMESTAMP,
                next_action_at = ?,
                status = ?
            WHERE id = ?
        `, [nextNodeId, nextActionAt, nextNodeId ? 'active' : 'completed', enr.id]);

        return { nextNodeId, waitDuration };

    } catch (err) {
        console.error(`Error processing node ${node.id} for enrollment ${enr.id}`, err);
        return null;
    }
}

async function sendCampaignEmail(enr, templateId, customSubject, customBody) {
    let subject = customSubject || "Check-in";
    let body = customBody || "";

    if (templateId) {
        const template = await dbGet("SELECT * FROM email_templates WHERE id = ?", [templateId]);
        if (template) {
            subject = template.subject;
            body = template.body;
        }
    }

    // Replace placeholders
    const replacements = {
        '{{client_name}}': enr.first_name || 'there',
        '{{company}}': enr.company || 'your team',
        // Add more as needed
    };
    
    for (const [key, val] of Object.entries(replacements)) {
        body = body.split(key).join(val);
        subject = subject.split(key).join(val);
    }

    // Optional: Gemini polish if body is short/template
    if (body.length < 50) {
        body = await gemini.ask(`Expand this into a professional email for an agency client: ${body}`);
    }

    if (enr.email) {
        const htmlBody = wrapInMellooTemplate(subject, body, enr.first_name || 'there');
        await transporter.sendMail({
            from: `"Melloo Media" <${process.env.EMAIL_USER}>`,
            to: enr.email,
            subject: subject,
            html: htmlBody,
            attachments: [
                {
                    filename: 'logo.png',
                    path: path.join(__dirname, '../../public/img/logo-full.png'),
                    cid: 'melloologo'
                }
            ]
        });

        await dbRun("INSERT INTO campaign_sends (campaign_id, enrollment_id, client_id, type, template_id) VALUES (?, ?, ?, 'email', ?)",
            [enr.campaign_id, enr.id, enr.client_id, templateId || null]);

        await dbRun("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'campaign', 'email', ?)",
            [enr.client_id, `Campaign Email: ${subject}`]);

        await updateCampaignAnalytics(enr.campaign_id);
    }
}

function wrapInMellooTemplate(title, body, firstName) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@1,700&display=swap" rel="stylesheet">
</head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#117aca,#004a99); padding:40px; text-align:center;">
      <img src="cid:melloologo" alt="Melloo Media" style="max-width:200px; height:auto; margin-bottom:15px;">
      <h1 style="margin:0; color:#fff; font-size:22px; letter-spacing:-0.5px;">${title}</h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="margin:0 0 20px; font-size:16px; color:#374151;">Hi <strong>${firstName}</strong>,</p>
      <div style="font-size:15px; color:#4b5563; line-height:1.6; margin-bottom: 28px;">
        ${body.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
      </div>
      <p style="margin:0; font-size:14px; color:#6b7280;">Best regards,<br><strong>Melloo Media Team</strong></p>
    </div>
    <div style="background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:13px; color:#9ca3af;"><span style="font-family: 'Atkinson Hyperlegible', sans-serif; font-weight: 700; font-style: italic; color: #ef4444;">melloo media</span> · melloomedia@gmail.com</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendCampaignSMS(enr, templateId, customBody) {
    let body = customBody || "";

    if (templateId) {
        const template = await dbGet("SELECT * FROM sms_templates WHERE id = ?", [templateId]);
        if (template) body = template.body;
    }

    const replacements = { '{{client_name}}': enr.first_name || 'there' };
    for (const [key, val] of Object.entries(replacements)) body = body.split(key).join(val);

    if (enr.phone) {
        await sendSMS(enr.phone, body, 'spectrum');
        await dbRun("INSERT INTO campaign_sends (campaign_id, enrollment_id, client_id, type, template_id) VALUES (?, ?, ?, 'sms', ?)",
            [enr.campaign_id, enr.id, enr.client_id, templateId || null]);
        await updateCampaignAnalytics(enr.campaign_id);
    }
}

async function createCampaignTask(enr, title, description) {
    const taskTitle = title || "Campaign Follow-up";
    await dbRun("INSERT INTO tasks (client_id, title, description, priority) VALUES (?, ?, ?, 'high')",
        [enr.client_id, taskTitle, description || "Automatically created by campaign"]);
}

async function updateCampaignAnalytics(campaignId) {
    const today = new Date().toISOString().split('T')[0];
    try {
        await dbRun(`
            INSERT INTO campaign_analytics (campaign_id, date, sends)
            VALUES (?, ?, 1)
            ON CONFLICT(campaign_id, date) DO UPDATE SET sends = sends + 1
        `, [campaignId, today]);
    } catch (e) {
        console.error("Failed to update analytics:", e);
    }
}

// Enrollment hooks
async function enrollClientInCampaignByTrigger(clientId, triggerType) {
    try {
        const campaigns = await dbAll("SELECT id FROM campaigns WHERE trigger = ? AND status = 'active'", [triggerType]);
        for (const campaign of campaigns) {
            const existing = await dbGet("SELECT id FROM campaign_enrollments WHERE client_id = ? AND campaign_id = ? AND status = 'active'", [clientId, campaign.id]);
            if(!existing) {
                await dbRun("INSERT INTO campaign_enrollments (client_id, campaign_id, status) VALUES (?, ?, 'active')", [clientId, campaign.id]);
                console.log(`[Campaign] Enrolled client ${clientId} in campaign ${campaign.id} via trigger ${triggerType}`);
            }
        }
        // Trigger immediate check to process the first node
        if (campaigns.length > 0) {
            runDueSends().catch(e => console.error(e));
        }
    } catch(e) {
        console.error("Enrollment failed:", e);
    }
}

module.exports = { runDueSends, enrollClientInCampaignByTrigger };
