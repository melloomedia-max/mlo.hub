// Email/Resend admin & webhook endpoints.
const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendMail, getStatus } = require('../utils/mailService');
const { requireAdmin } = require('../utils/auth');

// Status
router.get('/status', requireAdmin, (req, res) => {
    res.json(getStatus());
});

// Recent send log
router.get('/log', requireAdmin, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    db.all(
        `SELECT id, ts, provider, status, to_addr, from_addr, subject, resend_id, error, related_kind, related_id
         FROM mail_log ORDER BY id DESC LIMIT $1`,
        [limit],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ items: rows || [] });
        }
    );
});

// Aggregate counts (last 30 days)
router.get('/stats', requireAdmin, (req, res) => {
    db.all(
        `SELECT provider, status, COUNT(*) as n
         FROM mail_log
         WHERE ts > datetime('now', '-30 days')
         GROUP BY provider, status`,
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const totals = { sent: 0, failed: 0, by_provider: {} };
            for (const r of rows || []) {
                if (r.status === 'sent') totals.sent += r.n;
                if (r.status === 'failed') totals.failed += r.n;
                totals.by_provider[r.provider] = (totals.by_provider[r.provider] || 0) + r.n;
            }
            res.json(totals);
        }
    );
});

// Send a test email — admin only.
router.post('/test', requireAdmin, async (req, res) => {
    const to = (req.body && req.body.to) || (req.session?.user?.email);
    if (!to) return res.status(400).json({ error: 'No recipient (pass {to} or be logged in with an email).' });
    try {
        const result = await sendMail({
            to,
            subject: 'Melloo Hub — Resend test',
            html: `
                <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px; margin: 40px auto; padding: 28px 32px; background: #fff; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.08);">
                    <h2 style="margin: 0 0 12px; color: #1e293b;">✅ Hub ↔ Resend is wired up</h2>
                    <p style="color: #475569; line-height: 1.55;">If you're reading this, the Hub successfully delivered an email through Resend. Bounces and opens will be logged automatically.</p>
                    <p style="color: #94a3b8; font-size: 12.5px; margin-top: 18px;">Sent at ${new Date().toLocaleString()}</p>
                </div>
            `,
            relatedKind: 'test',
            relatedId: req.session?.user?.id,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Resend webhook receiver. Resend signs payloads with svix; we verify if a
// webhook secret is set, otherwise accept (best-effort dev mode).
const crypto = require('crypto');
router.post('/webhook/resend', express.json({ type: '*/*' }), (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET || '';
    if (secret) {
        // svix signature verification
        const id = req.headers['svix-id'];
        const ts = req.headers['svix-timestamp'];
        const sig = req.headers['svix-signature'];
        if (!id || !ts || !sig) return res.status(401).json({ error: 'missing svix headers' });
        try {
            const body = JSON.stringify(req.body);
            const toSign = `${id}.${ts}.${body}`;
            const key = secret.startsWith('whsec_') ? Buffer.from(secret.split('_')[1], 'base64') : Buffer.from(secret);
            const computed = 'v1,' + crypto.createHmac('sha256', key).update(toSign).digest('base64');
            const ok = String(sig).split(' ').some((s) => safeEq(s, computed));
            if (!ok) return res.status(401).json({ error: 'invalid signature' });
        } catch (e) {
            return res.status(401).json({ error: 'sig check failed: ' + e.message });
        }
    }

    const ev = req.body || {};
    const type = ev.type || ev.event || 'unknown';
    const data = ev.data || ev;
    const resendId = data.email_id || data.id || null;
    if (!resendId) return res.json({ ok: true, ignored: 'no_id' });
    let status = null;
    if (type.includes('delivered')) status = 'delivered';
    else if (type.includes('bounced')) status = 'bounced';
    else if (type.includes('complained')) status = 'complained';
    else if (type.includes('opened')) status = 'opened';
    else if (type.includes('clicked')) status = 'clicked';
    else status = type;
    db.run(
        `UPDATE mail_log SET status = $1 WHERE resend_id = $2`,
        [status, resendId],
        (err) => {
            if (err) console.error('[mail webhook] update:', err.message);
        }
    );
    res.json({ ok: true });
});

function safeEq(a, b) {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = router;
