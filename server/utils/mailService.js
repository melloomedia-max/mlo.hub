// Unified mail service for Melloo Hub.
// Primary transport: Resend (https://resend.com). Fallback: Gmail SMTP via nodemailer.
//
// Switching logic:
//   - If RESEND_API_KEY is set AND not explicitly disabled, use Resend.
//   - Otherwise fall back to Gmail (existing EMAIL_USER + EMAIL_PASS).
//   - Set MAIL_FORCE_FALLBACK=1 to force Gmail (kill switch for incidents).
//
// Records every send to the mail_log SQLite table (provider, status, error,
// resend_id) so we can show a Settings panel + later wire up webhooks.
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const db = require('../database');

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM_DEFAULT = process.env.MAIL_FROM || 'Melloo Media <noreply@melloo.media>';
const REPLY_TO_DEFAULT = process.env.MAIL_REPLY_TO || 'hello@melloo.media';
const FORCE_FALLBACK = String(process.env.MAIL_FORCE_FALLBACK || '').toLowerCase() === '1' ||
                       String(process.env.MAIL_FORCE_FALLBACK || '').toLowerCase() === 'true';

let resendClient = null;
function getResend() {
  if (!RESEND_KEY) return null;
  if (!resendClient) resendClient = new Resend(RESEND_KEY);
  return resendClient;
}

let gmailTransport = null;
function getGmailTransport() {
  if (gmailTransport) return gmailTransport;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  gmailTransport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return gmailTransport;
}

// One-time table init
function ensureMailLogTable() {
  db.run(`CREATE TABLE IF NOT EXISTS mail_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    to_addr TEXT,
    from_addr TEXT,
    subject TEXT,
    resend_id TEXT,
    error TEXT,
    related_kind TEXT,
    related_id TEXT
  )`, (err) => { if (err) console.error('[mail] mail_log table init:', err.message); });
}
ensureMailLogTable();

function logSend({ provider, status, to, from, subject, resendId, error, relatedKind, relatedId }) {
  try {
    db.run(
      `INSERT INTO mail_log (ts, provider, status, to_addr, from_addr, subject, resend_id, error, related_kind, related_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [new Date().toISOString(), provider, status, to, from, subject, resendId || null, error || null, relatedKind || null, relatedId || null],
      (err) => { if (err) console.error('[mail] log insert:', err.message); }
    );
  } catch (e) { console.error('[mail] log insert exception:', e.message); }
}

/**
 * Send a single email.
 * @param {object} opts
 * @param {string|string[]} opts.to        recipient(s)
 * @param {string} opts.subject            subject
 * @param {string} [opts.html]             html body
 * @param {string} [opts.text]             plain text body (auto-derived from html if missing)
 * @param {string} [opts.from]             override sender
 * @param {string} [opts.replyTo]          override reply-to
 * @param {Array}  [opts.attachments]      [{ filename, content (Buffer|base64), contentType? }]
 * @param {string} [opts.relatedKind]      tag for the log row (e.g., 'invoice', 'campaign')
 * @param {string|number} [opts.relatedId] tag for the log row
 */
async function sendMail(opts) {
  const {
    to,
    subject,
    html,
    text,
    from = FROM_DEFAULT,
    replyTo = REPLY_TO_DEFAULT,
    attachments,
    relatedKind,
    relatedId,
  } = opts || {};

  if (!to) throw new Error('mail: missing to');
  if (!subject) throw new Error('mail: missing subject');
  if (!html && !text) throw new Error('mail: must include html or text');

  const recipients = Array.isArray(to) ? to : [to];
  const useResend = !!getResend() && !FORCE_FALLBACK;

  if (useResend) {
    try {
      const payload = {
        from,
        to: recipients,
        subject,
        html: html || undefined,
        text: text || (html ? stripTags(html) : undefined),
        reply_to: replyTo,
      };
      if (Array.isArray(attachments) && attachments.length > 0) {
        payload.attachments = attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : (typeof a.content === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(a.content) ? a.content : Buffer.from(a.content).toString('base64')),
        }));
      }
      const resp = await getResend().emails.send(payload);
      // Resend SDK v4 returns { data, error } shape
      if (resp.error) {
        const err = new Error(resp.error.message || JSON.stringify(resp.error));
        err.resendError = resp.error;
        throw err;
      }
      const id = resp.data?.id || null;
      logSend({ provider: 'resend', status: 'sent', to: recipients.join(','), from, subject, resendId: id, relatedKind, relatedId });
      return { ok: true, provider: 'resend', id };
    } catch (e) {
      console.error('[mail] resend send failed, attempting fallback:', e.message);
      logSend({ provider: 'resend', status: 'failed', to: recipients.join(','), from, subject, error: e.message, relatedKind, relatedId });
      // fall through to Gmail fallback
    }
  }

  const gmail = getGmailTransport();
  if (!gmail) {
    const err = new Error('No mail transport configured (set RESEND_API_KEY or EMAIL_USER+EMAIL_PASS)');
    logSend({ provider: 'none', status: 'failed', to: recipients.join(','), from, subject, error: err.message, relatedKind, relatedId });
    throw err;
  }

  // For Gmail, the from-address must usually be the EMAIL_USER itself.
  const gmailFrom = process.env.EMAIL_USER ? `Melloo Media <${process.env.EMAIL_USER}>` : from;
  try {
    const info = await gmail.sendMail({
      from: gmailFrom,
      to: recipients.join(', '),
      subject,
      html: html || undefined,
      text: text || (html ? stripTags(html) : undefined),
      replyTo,
      attachments,
    });
    logSend({ provider: 'gmail', status: 'sent', to: recipients.join(','), from: gmailFrom, subject, resendId: info?.messageId || null, relatedKind, relatedId });
    return { ok: true, provider: 'gmail', id: info?.messageId || null };
  } catch (e) {
    logSend({ provider: 'gmail', status: 'failed', to: recipients.join(','), from: gmailFrom, subject, error: e.message, relatedKind, relatedId });
    throw e;
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What's the current active provider — used by the Settings UI.
 */
function getActiveProvider() {
  if (FORCE_FALLBACK) return 'gmail (forced)';
  if (getResend()) return 'resend';
  if (getGmailTransport()) return 'gmail';
  return 'none';
}

function getStatus() {
  return {
    active: getActiveProvider(),
    resendConfigured: !!RESEND_KEY,
    gmailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    forceFallback: FORCE_FALLBACK,
    from: FROM_DEFAULT,
    replyTo: REPLY_TO_DEFAULT,
  };
}

module.exports = {
  sendMail,
  getActiveProvider,
  getStatus,
};
