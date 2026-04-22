const nodemailer = require('nodemailer');
const { sendSMS } = require('./emailService');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Sends portal link via email and/or SMS
 * @param {Object} client - { id, name, email, phone }
 * @param {string} url - The portal URL
 * @param {string} method - 'email', 'sms', or 'both'
 */
async function sendPortalLinkNotify(client, url, method = 'email') {
    const results = {
        email: { success: false, error: null },
        sms: { success: false, error: null }
    };

    console.log(`[PORTAL-LOG] notification send triggered via ${method}`);

    // 1. Email Notification
    if (method === 'email' || method === 'both') {
        if (!client.email) {
            results.email.error = 'No email address found for client';
        } else {
            try {
                const htmlBody = `
                    <div style="font-family: sans-serif; padding: 30px; background: #f9f9fb; border-radius: 12px; max-width: 600px; margin: auto; border: 1px solid #eef;">
                        <div style="text-align: center; margin-bottom: 25px;">
                             <h2 style="color: #6366f1; margin: 0;">Your Client Portal</h2>
                             <p style="color: #64748b; font-size: 14px;">Melloo Media</p>
                        </div>
                        <div style="background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                             <p>Hi ${client.name || 'there'},</p>
                             <p>Access your personalized client portal to view project media, manage invoices, and send requests directly to our team.</p>
                             <div style="text-align: center; margin: 30px 0;">
                                 <a href="${url}" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; padding: 14px 28px; border-radius: 10px; font-weight: 700; text-decoration: none; display: inline-block; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);">Access My Portal</a>
                             </div>
                             <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">This link gives you direct access to your account. Please do not share this email.</p>
                        </div>
                        <div style="text-align: center; margin-top: 25px;">
                             <p style="font-size: 12px; color: #94a3b8;">&copy; 2026 Melloo LLC · No more generic dashboards.</p>
                        </div>
                    </div>
                `;

                await transporter.sendMail({
                    from: `"Melloo Media" <${process.env.EMAIL_USER}>`,
                    to: client.email,
                    subject: `Your Personalized Client Portal Access`,
                    html: htmlBody
                });
                results.email.success = true;
                console.log(`[PORTAL-LOG] email notification success for ${client.email}`);
            } catch (err) {
                results.email.error = err.message;
                console.error(`[PORTAL-LOG] email notification failure: ${err.message}`);
            }
        }
    }

    // 2. SMS Notification
    if (method === 'sms' || method === 'both') {
        if (!client.phone) {
            results.sms.error = 'No phone number found for client';
        } else {
            try {
                const smsMessage = `Your Melloo Media portal is ready! Access it here: ${url}`;
                // Using carrier 'verizon' as default for now, or we could look up client carrier if we had it
                await sendSMS(client.phone, smsMessage, 'verizon');
                results.sms.success = true;
                console.log(`[PORTAL-LOG] SMS notification triggered for ${client.phone}`);
            } catch (err) {
                results.sms.error = err.message;
                console.error(`[PORTAL-LOG] SMS notification failure: ${err.message}`);
            }
        }
    }

    return results;
}

/**
 * Notifies admin of a new portal request
 */
async function sendPortalRequestNotify(client, message) {
    try {
        const adminEmail = process.env.EMAIL_USER;
        const htmlBody = `
            <div style="font-family: sans-serif; padding: 30px; background: #fff1f2; border-radius: 12px; max-width: 600px; margin: auto; border: 1px solid #fda4af;">
                <div style="text-align: center; margin-bottom: 25px;">
                     <h2 style="color: #e11d48; margin: 0;">New Portal Request</h2>
                     <p style="color: #64748b; font-size: 14px;">Melloo Agency Hub</p>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                     <p><strong>Client:</strong> ${client.name}</p>
                     <p><strong>Message:</strong></p>
                     <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #e11d48; margin: 15px 0; font-style: italic;">
                        "${message}"
                     </div>
                     <div style="text-align: center; margin: 30px 0;">
                         <a href="${process.env.PORTAL_BASE_URL || ''}/" style="background: #1e293b; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block;">Open Agency Hub</a>
                     </div>
                </div>
            </div>
        `;

        await transporter.sendMail({
            from: `"Melloo Portal" <${process.env.EMAIL_USER}>`,
            to: adminEmail,
            subject: `🚨 New Request from ${client.name}`,
            html: htmlBody
        });

        // Also try SMS if phone exists in env or we can fetch from staff
        // For now, let's just do email as it's more reliable than hardcoded carrier SMS
        console.log(`[PORTAL-LOG] Admin notification sent for request from ${client.name}`);
    } catch (err) {
        console.error(`[PORTAL-LOG] Admin notification failed: ${err.message}`);
    }
}

module.exports = { sendPortalLinkNotify, sendPortalRequestNotify };
