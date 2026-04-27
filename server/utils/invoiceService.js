const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { sendMail } = require('./mailService');
const db = require('../database');
const path = require('path');

/**
 * Generates an invoice PDF buffer
 */
async function generateInvoicePDF(invoiceId, client, items, details) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        const currencySymbol = (details.currency === 'EUR') ? '€' : (details.currency === 'GBP' ? '£' : '$');

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header: Branding
        const logoPath = path.join(__dirname, '../../public/img/logo-full.png');
        try {
            doc.image(logoPath, 50, 45, { width: 120 });
        } catch (e) {
            doc.fontSize(20).text('Melloo Media', 50, 50);
        }
        
        doc.fontSize(8).fillColor('#6b7280').text('a Melloo LLC company', 50, 95);
        doc.fontSize(8).fillColor('#000000').text('melloomedia@gmail.com', 50, 105);

        // Header: Invoice Details
        doc.fontSize(24).text('INVOICE', { align: 'right' });
        doc.fontSize(10).text(`Invoice #${invoiceId}`, { align: 'right' });
        doc.moveDown();

        // Client Info
        doc.y = 130; 
        doc.fontSize(12).text('Bill To:', { underline: true });
        doc.fontSize(10).text(client.name || 'N/A');
        if (client.company) doc.text(client.company);
        doc.moveDown();

        // Details
        doc.text(`Issue Date: ${details.issue_date || 'N/A'}`);
        doc.text(`Due Date: ${details.due_date || 'N/A'}`);
        doc.moveDown(2);

        // Table Header
        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Description', 50, tableTop, { width: 220 });
        doc.text('Qty', 280, tableTop);
        doc.text('Rate', 330, tableTop);
        doc.text('Disc %', 390, tableTop);
        doc.text('Amount', 460, tableTop, { align: 'right' });
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Items
        doc.font('Helvetica');
        let y = tableTop + 25;
        if (items && items.length > 0) {
            items.forEach(item => {
                let amt = (item.quantity * item.rate);
                if (item.discount > 0) amt = amt * (1 - (item.discount / 100));

                doc.text(item.description, 50, y, { width: 220 });
                doc.text(item.quantity, 280, y);
                doc.text(`${currencySymbol}${item.rate.toFixed(2)}`, 330, y);
                doc.text(item.discount > 0 ? item.discount + '%' : '-', 390, y);
                doc.text(`${currencySymbol}${amt.toFixed(2)}`, 460, y, { align: 'right' });
                y += 20;
            });
        }

        // Totals
        y += 10;
        doc.moveTo(50, y).lineTo(550, y).stroke();
        y += 10;

        doc.text('Subtotal:', 350, y);
        doc.text(`${currencySymbol}${details.subtotal.toFixed(2)}`, 450, y, { align: 'right' });
        y += 15;

        if (details.discountVal > 0) {
            doc.fillColor('red');
            doc.text(`Discount (${details.discount_type === 'percent' ? details.discount_amount + '%' : 'Fixed'}):`, 300, y);
            doc.text(`-${currencySymbol}${details.discountVal.toFixed(2)}`, 450, y, { align: 'right' });
            doc.fillColor('black');
            y += 15;
        }

        if (details.taxVal > 0) {
            doc.text(`Tax (${details.tax_rate}%):`, 350, y);
            doc.text(`${currencySymbol}${details.taxVal.toFixed(2)}`, 450, y, { align: 'right' });
            y += 15;
        }

        y += 5;
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('TOTAL:', 350, y);
        doc.text(`${currencySymbol}${details.total.toFixed(2)}`, 450, y, { align: 'right' });

        if (details.notes) {
            doc.moveDown(2);
            doc.font('Helvetica').fontSize(10);
            doc.text('Notes / Terms:', { underline: true });
            doc.text(details.notes);
        }

        if (details.payment_instructions) {
            doc.moveDown(2);
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('Payment Instructions:', { underline: true });
            doc.font('Helvetica').fontSize(10);
            doc.text(details.payment_instructions);
        }

        if (details.status === 'paid') {
            doc.save();
            doc.rotate(-45, { origin: [300, 300] });
            doc.fontSize(80).fillColor('red').opacity(0.3).text('PAID', 150, 150);
            doc.restore();
        }

        doc.fontSize(9).fillColor('#9ca3af').text('Melloo Media (a Melloo LLC company)', 50, 750, { align: 'center', width: 500 });
        doc.end();
    });
}

/**
 * Sends an invoice email
 */
async function sendInvoiceEmail(invoiceId) {
    return new Promise((resolve, reject) => {
        const invoiceSql = `
            SELECT invoices.*, clients.name as client_name, clients.company as client_company,
                   clients.email as client_email, clients.google_drive_folder_id
            FROM invoices
            LEFT JOIN clients ON invoices.client_id = clients.id
            WHERE invoices.id = ?
        `;
        const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ?`;

        db.get(invoiceSql, [invoiceId], async (err, invoice) => {
            if (err || !invoice) return reject(new Error(err ? err.message : 'Invoice not found'));
            if (!invoice.client_email) return reject(new Error('Client has no email address on file.'));

            db.all(itemsSql, [invoiceId], async (err, items) => {
                if (err) return reject(err);

                const currencySymbol = invoice.currency === 'EUR' ? '€' : invoice.currency === 'GBP' ? '£' : '$';
                let subtotal = (items || []).reduce((s, i) => s + (i.amount || i.quantity * i.rate), 0);
                const discountVal = invoice.discount_type === 'percent'
                    ? subtotal * ((invoice.discount_amount || 0) / 100)
                    : (invoice.discount_amount || 0);
                const taxable = Math.max(0, subtotal - discountVal);
                const taxVal = taxable * ((invoice.tax_rate || 0) / 100);

                let pdfBuffer;
                try {
                    pdfBuffer = await generateInvoicePDF(invoiceId, {
                        name: invoice.client_name,
                        company: invoice.client_company
                    }, items || [], {
                        subtotal, discountVal, taxVal,
                        total: invoice.total_amount,
                        discount_amount: invoice.discount_amount,
                        discount_type: invoice.discount_type,
                        tax_rate: invoice.tax_rate,
                        currency: invoice.currency,
                        issue_date: invoice.issue_date,
                        due_date: invoice.due_date,
                        notes: invoice.notes,
                        payment_instructions: invoice.payment_instructions
                    });
                } catch (pdfErr) {
                    return reject(pdfErr);
                }

                const itemRows = (items || []).map(item => `
                    <tr>
                        <td style="padding:8px 12px; border-bottom:1px solid #f0f0f0;">${item.description}</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #f0f0f0; text-align:center;">${item.quantity}</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #f0f0f0; text-align:right;">${currencySymbol}${(item.rate || 0).toFixed(2)}</td>
                        <td style="padding:8px 12px; border-bottom:1px solid #f0f0f0; text-align:right;">${currencySymbol}${(item.amount || item.quantity * item.rate).toFixed(2)}</td>
                    </tr>
                `).join('');

                const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@1,700&display=swap" rel="stylesheet">
</head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#117aca,#004a99); padding:40px; text-align:center;">
      <img src="cid:melloologo" alt="Melloo Media" style="max-width:220px; height:auto; margin-bottom:15px;">
      <h1 style="margin:0; color:#fff; font-size:24px; letter-spacing:-0.5px;">Invoice #${invoiceId}</h1>
    </div>
    <div style="padding:36px 40px;">
      <p style="margin:0 0 20px; font-size:15px; color:#374151;">Hi <strong>${invoice.client_name || 'there'}</strong>,</p>
      <p style="margin:0 0 28px; font-size:15px; color:#6b7280; line-height:1.6;">Please find your automated recurring invoice attached.</p>
      <table style="width:100%; border-collapse:collapse; margin-bottom:28px; background:#f9fafb; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Issue Date</td>
          <td style="padding:12px 16px; font-size:13px; color:#111827; font-weight:500; text-align:right;">${new Date(invoice.issue_date).toLocaleDateString()}</td>
        </tr>
        <tr style="background:#f3f4f6;">
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Due Date</td>
          <td style="padding:12px 16px; font-size:13px; color:#dc2626; font-weight:600; text-align:right;">${new Date(invoice.due_date).toLocaleDateString()}</td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">Description</th>
            <th style="padding:10px 12px; text-align:center; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">Qty</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">Rate</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:14px 12px; font-size:18px; font-weight:700; color:#111827;">Total Due</td>
          <td style="padding:14px 12px; text-align:right; font-size:22px; font-weight:700; color:#117aca;">${currencySymbol}${(invoice.total_amount || 0).toFixed(2)}</td>
        </tr>
      </table>
      <p style="margin:0; font-size:14px; color:#6b7280;">The full invoice PDF is attached to this email.</p>
    </div>
    <div style="background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:13px; color:#9ca3af;"><span style="font-family: 'Atkinson Hyperlegible', sans-serif; font-weight: 700; font-style: italic; color: #ef4444;">melloo media</span> · melloomedia@gmail.com</p>
    </div>
  </div>
</body>
</html>`;

                sendMail({
                    to: invoice.client_email,
                    subject: `[Recurring] Invoice #${invoiceId} from Melloo Media`,
                    html: htmlBody,
                    attachments: [
                        {
                            filename: `Invoice_${invoiceId}.pdf`,
                            content: pdfBuffer,
                            contentType: 'application/pdf'
                        }
                    ],
                    relatedKind: 'invoice',
                    relatedId: invoiceId,
                }).then((info) => {
                    db.run(`UPDATE invoices SET status = 'sent' WHERE id = ?`, [invoiceId]);
                    db.run("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'invoice', 'email', ?)",
                        [invoice.client_id, `Sent automated recurring invoice #${invoiceId}`]);
                    console.log(`[InvoiceService] Email sent for invoice #${invoiceId} to ${invoice.client_email}`);
                    resolve(info);
                }).catch((err) => reject(err));
            });
        });
    });
}

/**
 * Sends a subscription cancellation notification
 */
async function sendSubscriptionCancellationEmail(clientId, subscriptionName) {
    return new Promise((resolve, reject) => {
        db.get("SELECT name, email FROM clients WHERE id = ?", [clientId], (err, client) => {
            if (err || !client || !client.email) return resolve();

            const htmlBody = `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Subscription Cancelled</h2>
                    <p>Hi ${client.name},</p>
                    <p>This email is to confirm that your subscription <strong>${subscriptionName}</strong> has been cancelled.</p>
                    <p>We're sorry to see you go! If this was a mistake, please reach out to us.</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;"><span style="font-family: 'Atkinson Hyperlegible', sans-serif; font-weight: 700; font-style: italic; color: #ef4444;">melloo media</span></p>
                </div>
            `;

            sendMail({
                to: client.email,
                subject: `Subscription Cancelled: ${subscriptionName}`,
                html: htmlBody,
                relatedKind: 'subscription_cancel',
                relatedId: clientId,
            }).catch((err) => {
                console.error('Cancellation Email Error:', err);
            }).finally(() => resolve());
        });
    });
}

/**
 * Sends a late payment / service interruption warning
 */
async function sendLatePaymentWarningEmail(invoiceId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT i.*, c.name as client_name, c.email as client_email
            FROM invoices i
            JOIN clients c ON i.client_id = c.id
            WHERE i.id = ?
        `;
        db.get(sql, [invoiceId], (err, invoice) => {
            if (err || !invoice || !invoice.client_email) return reject(new Error('Invoice or client email not found'));

            const htmlBody = `
                <div style="font-family: sans-serif; padding: 24px; border: 2px solid #ef4444; border-radius: 12px; color: #333;">
                    <h2 style="color: #dc2626;">⚠️ URGENT: Payment Overdue</h2>
                    <p>Hi ${invoice.client_name},</p>
                    <p>Our records show that <strong>Invoice #${invoiceId}</strong> for <strong>$${invoice.total_amount.toFixed(2)}</strong> is currently overdue.</p>
                    <p style="background: #fee2e2; padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444;">
                        <strong>Warning:</strong> To avoid any interruption to your recurring services, please settle the outstanding balance immediately.
                    </p>
                    <p>You can view and pay your invoice using the link provided in our previous emails, or reach out if you need assistance.</p>
                    <p>Thank you for your prompt attention to this matter.</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;"><span style="font-family: 'Atkinson Hyperlegible', sans-serif; font-weight: 700; font-style: italic; color: #ef4444;">melloo media</span> · Finance Department</p>
                </div>
            `;

            sendMail({
                from: 'Melloo Media Finance <noreply@melloo.media>',
                to: invoice.client_email,
                subject: `URGENT: Overdue Payment Warning (Invoice #${invoiceId})`,
                html: htmlBody,
                relatedKind: 'invoice_late',
                relatedId: invoiceId,
            }).then(() => {
                db.run("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, 'invoice', 'email', ?)",
                    [invoice.client_id, `Sent LATE PAYMENT WARNING for Invoice #${invoiceId}`]);
                resolve();
            }).catch((err) => reject(err));
        });
    });
}

module.exports = { generateInvoicePDF, sendInvoiceEmail, sendSubscriptionCancellationEmail, sendLatePaymentWarningEmail };
