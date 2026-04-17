const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // Your gmail address
        pass: process.env.EMAIL_PASS  // Your gmail App Password
    }
});

/**
 * Send SMS notification via Email-to-SMS gateway
 * @param {string} phoneNumber - The 10-digit phone number
 * @param {string} message - The message body
 * @param {string} carrier - 'spectrum', 'verizon', 'tmobile', 'att' (default: spectrum)
 */
async function sendSMS(phoneNumber, message, carrier = 'spectrum') {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('[SMS] Skipped: Missing EMAIL_USER or EMAIL_PASS in .env');
        return;
    }

    // Clean number
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (cleanNumber.length !== 10) {
        console.error('[SMS] Invalid phone number:', phoneNumber);
        return;
    }

    // Gateway Map
    const gateways = {
        'spectrum': 'vtext.com', // Uses Verizon network
        'verizon': 'vtext.com',
        'tmobile': 'tmomail.net',
        'att': 'txt.att.net',
        'sprint': 'messaging.sprintpcs.com'
    };

    const domain = gateways[carrier] || gateways['spectrum'];
    const emailTo = `${cleanNumber}@${domain}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: emailTo,
        subject: '', // SMS usually don't have subjects
        text: message
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[SMS] Sent to ${emailTo}: ${message}`);
    } catch (error) {
        console.error('[SMS] Failed to send:', error);
    }
}

module.exports = { sendSMS };
