const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper: Sync a project's payment_status based on its linked invoices
function syncProjectPaymentStatus(projectId) {
    if (!projectId) return;
    const sql = `SELECT GROUP_CONCAT(DISTINCT status) as statuses FROM invoices WHERE project_id = $1`;
    db.get(sql, [projectId], (err, row) => {
        if (err || !row || !row.statuses) return;
        const statuses = row.statuses.split(',');
        let paymentStatus = 'unpaid';
        if (statuses.includes('paid') && !statuses.includes('sent') && !statuses.includes('finalized')) {
            paymentStatus = 'paid';
        } else if (statuses.includes('paid') && (statuses.includes('sent') || statuses.includes('finalized'))) {
            paymentStatus = 'partial';
        } else if (statuses.includes('sent')) {
            paymentStatus = 'invoice-sent';
        } else if (statuses.includes('finalized')) {
            paymentStatus = 'invoice-sent';
        }
        db.run(`UPDATE projects SET payment_status = $1 WHERE id = $2`, [paymentStatus, projectId], (err) => {
            if (err) console.error('Error syncing project payment_status:', err);
        });
    });
}
const PDFDocument = require('pdfkit');
const { getInvoicesSubfolderId, getDriveClient } = require('../utils/driveHelpers');
const stream = require('stream');
const { generateClientIntelligence } = require('../utils/clientIntelligence');

// GET dedicated PDF download
router.get('/generate/pdf/:id', (req, res) => {
    const invoiceId = req.params.id;
    const invoiceSql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company, clients.email as client_email, clients.phone as client_phone, clients.id as client_id,
               projects.name as project_name
        FROM invoices 
        LEFT JOIN clients ON invoices.client_id = clients.id
        LEFT JOIN projects ON invoices.project_id = projects.id
        WHERE invoices.id = ?
    `;
    const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = $1`;

    db.get(invoiceSql, [invoiceId], (err, invoice) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        db.all(itemsSql, [invoiceId], async (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            
            try {
                // Prepare details for PDF helper
                const subtotal = (items || []).reduce((sum, item) => {
                    let lineTotal = (item.quantity * item.rate);
                    if (item.discount > 0) lineTotal = lineTotal * (1 - (item.discount / 100));
                    return sum + lineTotal;
                }, 0);

                const discountVal = (invoice.discount_type === 'percent') ? subtotal * ((invoice.discount_amount || 0) / 100) : (invoice.discount_amount || 0);
                const taxable = Math.max(0, subtotal - discountVal);
                const taxVal = taxable * ((invoice.tax_rate || 0) / 100);

                const resultBuffer = await generateInvoicePDF(invoiceId, {
                    name: invoice.client_name,
                    company: invoice.client_company
                }, items, {
                    issue_date: invoice.issue_date,
                    due_date: invoice.due_date,
                    currency: invoice.currency,
                    subtotal: subtotal,
                    discountVal: discountVal,
                    discount_type: invoice.discount_type,
                    discount_amount: invoice.discount_amount,
                    taxVal: taxVal,
                    tax_rate: invoice.tax_rate,
                    total: invoice.total_amount,
                    notes: invoice.notes,
                    payment_instructions: invoice.payment_instructions
                });

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename=Invoice_${invoiceId}.pdf`);
                res.send(resultBuffer);
            } catch (pdfErr) {
                console.error('PDF Generation Error:', pdfErr);
                res.status(500).json({ error: 'Failed to generate PDF' });
            }
        });
    });
});

// GET all invoices
router.get('/', (req, res) => {
    const sql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company, projects.name as project_name 
        FROM invoices 
        LEFT JOIN clients ON invoices.client_id = clients.id
        LEFT JOIN projects ON invoices.project_id = projects.id
        ORDER BY invoices.created_at DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET single invoice with items
router.get('/:id', (req, res) => {
    const invoiceId = req.params.id;
    const invoiceSql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company, clients.email as client_email, clients.phone as client_phone, clients.id as client_id,
               projects.name as project_name
        FROM invoices 
        LEFT JOIN clients ON invoices.client_id = clients.id
        LEFT JOIN projects ON invoices.project_id = projects.id
        WHERE invoices.id = ?
    `;
    const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ?`;

    db.get(invoiceSql, [invoiceId], (err, invoice) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        db.all(itemsSql, [invoiceId], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            invoice.items = items;
            res.json(invoice);
        });
    });
});

// POST new invoice
router.post('/', async (req, res) => {
    const { client_id, project_id, issue_date, due_date, status, notes, items, discount_amount, discount_type, tax_rate, currency, payment_instructions } = req.body;

    let subtotal = 0;
    if (items && Array.isArray(items)) {
        subtotal = items.reduce((sum, item) => {
            let lineTotal = (item.quantity * item.rate);
            if (item.discount > 0) lineTotal = lineTotal * (1 - (item.discount / 100));
            return sum + lineTotal;
        }, 0);
    }

    // Calculate Totals
    const discountVal = (discount_type === 'percent') ? subtotal * ((discount_amount || 0) / 100) : (discount_amount || 0);
    const taxable = Math.max(0, subtotal - discountVal);
    const taxVal = taxable * ((tax_rate || 0) / 100);
    const total_amount = taxable + taxVal;

    const sql = `INSERT INTO invoices (client_id, project_id, issue_date, due_date, status, total_amount, notes, discount_amount, discount_type, tax_rate, currency, payment_instructions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

    db.run(sql, [client_id, project_id || null, issue_date, due_date, status || 'draft', total_amount, notes, discount_amount || 0, discount_type || 'fixed', tax_rate || 0, currency || 'USD', payment_instructions || ''], async function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const invoiceId = this.lastID;
        
        generateClientIntelligence(client_id).catch(e => console.error(e));

        // Insert items
        if (items && items.length > 0) {
            const itemPlaceholder = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
            const itemValues = [];
            items.forEach(item => {
                let amount = item.quantity * item.rate;
                if (item.discount > 0) amount = amount * (1 - (item.discount / 100));

                itemValues.push(invoiceId, item.description, item.quantity, item.rate, amount, item.discount || 0);
            });

            const itemSql = `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount, discount) VALUES ${itemPlaceholder}`;
            db.run(itemSql, itemValues, (err) => { if (err) console.error(err); });
        }

        // Generate PDF and Upload
        db.get('SELECT google_drive_folder_id, name, company FROM clients WHERE id = $1', [client_id], async (err, client) => {
            if (err || !client || !client.google_drive_folder_id) {
                return res.status(201).json({ id: invoiceId, message: 'Invoice created (no Drive upload)' });
            }

            try {
                const pdfBuffer = await generateInvoicePDF(invoiceId, client, items, {
                    subtotal, discountVal, taxVal, total: total_amount,
                    discount_amount, discount_type, tax_rate, currency,
                    issue_date, due_date, notes, payment_instructions
                });

                const invoicesFolderId = await getInvoicesSubfolderId(client.google_drive_folder_id);
                if (!invoicesFolderId) return res.status(201).json({ id: invoiceId, message: 'Created (Drive error)' });

                const drive = await getDriveClient();
                const fileName = `Invoice_${invoiceId}_${client.name.replace(/\s+/g, '_')}.pdf`;

                const driveFile = await drive.files.create({
                    resource: { name: fileName, parents: [invoicesFolderId] },
                    media: { mimeType: 'application/pdf', body: stream.PassThrough().end(pdfBuffer) },
                    fields: 'id, webViewLink'
                });

                db.run('UPDATE invoices SET google_drive_file_id = $1 WHERE id = $2', [driveFile.data.id, invoiceId]);

                res.status(201).json({
                    id: invoiceId,
                    message: 'Invoice created and uploaded',
                    driveFileId: driveFile.data.id,
                    driveLink: driveFile.data.webViewLink
                });

            } catch (error) {
                console.error('Drive Upload Error:', error);
                res.status(201).json({ id: invoiceId, message: 'Invoice created (Upload failed)' });
            }
        });
    });
});

// Helper function to generate invoice PDF
async function generateInvoicePDF(invoiceId, client, items, details) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers = [];
        const currencySymbol = (details.currency === 'EUR') ? '€' : (details.currency === 'GBP' ? '£' : '$');

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Header: Branding
        doc.fontSize(20).text('Melloo Media', 50, 50);
        doc.fontSize(10).fillColor('#6b7280').text('a Melloo LLC company', 50, 75);
        doc.fontSize(10).fillColor('#000000').text('melloomedia@gmail.com', 50, 90);

        // Header: Invoice Details
        doc.fontSize(24).text('INVOICE', { align: 'right' });
        doc.fontSize(10).text(`Invoice #${invoiceId}`, { align: 'right' });
        doc.moveDown();

        // Client Info
        doc.y = 130; // Move down below branding
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

        // Subtotal
        doc.text('Subtotal:', 350, y);
        doc.text(`${currencySymbol}${details.subtotal.toFixed(2)}`, 450, y, { align: 'right' });
        y += 15;

        // Discount
        if (details.discountVal > 0) {
            doc.fillColor('red');
            doc.text(`Discount (${details.discount_type === 'percent' ? details.discount_amount + '%' : 'Fixed'}):`, 300, y); // shifted left
            doc.text(`-${currencySymbol}${details.discountVal.toFixed(2)}`, 450, y, { align: 'right' });
            doc.fillColor('black');
            y += 15;
        }

        // Tax
        if (details.taxVal > 0) {
            doc.text(`Tax (${details.tax_rate}%):`, 350, y);
            doc.text(`${currencySymbol}${details.taxVal.toFixed(2)}`, 450, y, { align: 'right' });
            y += 15;
        }

        // Grand Total
        y += 5;
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('TOTAL:', 350, y);
        doc.text(`${currencySymbol}${details.total.toFixed(2)}`, 450, y, { align: 'right' });

        // Notes
        if (details.notes) {
            doc.moveDown(2);
            doc.font('Helvetica').fontSize(10);
            doc.text('Notes / Terms:', { underline: true });
            doc.text(details.notes);
        }

        // Payment Instructions
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
// PUT update invoice (Full update for drafts, or status update)
router.put('/:id', (req, res) => {
    const { client_id, project_id, issue_date, due_date, status, notes, items, discount_amount, discount_type, tax_rate, currency } = req.body;
    const id = req.params.id;

    // Check if this is a full update (editing a draft)
    if (client_id && items) {
        // 1. Update Invoice Details
        let subtotal = items.reduce((sum, item) => {
            let lineTotal = (item.quantity * item.rate);
            if (item.discount > 0) lineTotal = lineTotal * (1 - (item.discount / 100));
            return sum + lineTotal;
        }, 0);

        const discountVal = (discount_type === 'percent') ? subtotal * ((discount_amount || 0) / 100) : (discount_amount || 0);
        const taxable = Math.max(0, subtotal - discountVal);
        const taxVal = taxable * ((tax_rate || 0) / 100);
        const total_amount = taxable + taxVal;

        const sql = `UPDATE invoices SET client_id=$1, project_id=$2, issue_date=$3, due_date=$4, status=$5, total_amount=$6, notes=$7, discount_amount=$8, discount_type=$9, tax_rate=$10, currency=$11, updated_at=CURRENT_TIMESTAMP WHERE id=$12`;

        db.run(sql, [client_id, project_id || null, issue_date, due_date, status, total_amount, notes, discount_amount || 0, discount_type || 'fixed', tax_rate || 0, currency || 'USD', id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // 2. Replace Items (Delete all and re-insert)
            db.run(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id], function (err) {
                if (err) console.error('Error clearing items', err);

                if (items.length > 0) {
                    const itemPlaceholder = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
                    const itemValues = [];
                    items.forEach(item => {
                        let amount = item.quantity * item.rate;
                        if (item.discount > 0) amount = amount * (1 - (item.discount / 100));
                        itemValues.push(id, item.description, item.quantity, item.rate, amount, item.discount || 0);
                    });

                    const itemSql = `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount, discount) VALUES ${itemPlaceholder}`;
                    db.run(itemSql, itemValues, (err) => {
                        if (err) console.error('Error rewriting items', err);
                    });
                }

                res.json({ message: 'Invoice updated completely', id });
            });
        });

    } else {
        // Partial Update (status change like markAsPaid)
        const sql = `UPDATE invoices SET status = COALESCE($1, status), notes = COALESCE($2, notes) WHERE id = $3`;
        db.run(sql, [status, notes, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Auto-sync project payment_status if invoice has a project
            if (status) {
                db.get(`SELECT project_id FROM invoices WHERE id = $1`, [id], (err, inv) => {
                    if (!err && inv && inv.project_id) syncProjectPaymentStatus(inv.project_id);
                });
                if (status === 'paid') {
                    sendReceiptEmail(id); // Send receipt email when status is set to 'paid'
                    // Campaign Trigger
                    const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
                    db.get(`SELECT client_id FROM invoices WHERE id = $1`, [id], (err, inv) => {
                        if (!err && inv) enrollClientInCampaignByTrigger(inv.client_id, 'invoice_paid').catch(e => console.error(e));
                    });
                }
            }
            res.json({ message: 'Invoice status/notes updated' });
        });
    }
});

// DELETE invoice
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM invoices WHERE id = $1', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Invoice deleted' });
    });
});

// SEND invoice via Gmail
router.post('/:id/send', async (req, res) => {
    const id = req.params.id;
    const { sendMail } = require('../utils/mailService');

    // 1. Fetch invoice + client
    const invoiceSql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company,
               clients.email as client_email, clients.google_drive_folder_id
        FROM invoices
        LEFT JOIN clients ON invoices.client_id = clients.id
        WHERE invoices.id = ?
    `;
    const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ?`;

    db.get(invoiceSql, [id], async (err, invoice) => {
        if (err || !invoice) return res.status(500).json({ error: err ? err.message : 'Invoice not found' });

        if (!invoice.client_email) {
            return res.status(400).json({ error: 'Client has no email address on file.' });
        }

        db.all(itemsSql, [id], async (err, items) => {
            if (err) return res.status(500).json({ error: err.message });

            // 2. Generate PDF
            const currencySymbol = invoice.currency === 'EUR' ? '€' : invoice.currency === 'GBP' ? '£' : '$';
            let subtotal = items.reduce((s, i) => s + (i.amount || i.quantity * i.rate), 0);
            const discountVal = invoice.discount_type === 'percent'
                ? subtotal * ((invoice.discount_amount || 0) / 100)
                : (invoice.discount_amount || 0);
            const taxable = Math.max(0, subtotal - discountVal);
            const taxVal = taxable * ((invoice.tax_rate || 0) / 100);

            let pdfBuffer;
            try {
                pdfBuffer = await generateInvoicePDF(id, {
                    name: invoice.client_name,
                    company: invoice.client_company
                }, items, {
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
                console.error('PDF generation error:', pdfErr);
                return res.status(500).json({ error: 'Failed to generate PDF for email.' });
            }

            // 3. Build HTML email body
            const itemRows = items.map(item => `
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
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6); padding:36px 40px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:28px; letter-spacing:-0.5px;">Invoice #${id}</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.85); font-size:15px;">From Melloo Media</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;">
      <p style="margin:0 0 20px; font-size:15px; color:#374151;">
        Hi <strong>${invoice.client_name || 'there'}</strong>,
      </p>
      <p style="margin:0 0 28px; font-size:15px; color:#6b7280; line-height:1.6;">
        Please find your invoice attached to this email. A summary is included below for your convenience.
      </p>

      <!-- Invoice Meta -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:28px; background:#f9fafb; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Issue Date</td>
          <td style="padding:12px 16px; font-size:13px; color:#111827; font-weight:500; text-align:right;">${new Date(invoice.issue_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        <tr style="background:#f3f4f6;">
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Due Date</td>
          <td style="padding:12px 16px; font-size:13px; color:#dc2626; font-weight:600; text-align:right;">${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Status</td>
          <td style="padding:12px 16px; font-size:13px; text-align:right;"><span style="background:#fef3c7; color:#92400e; padding:2px 10px; border-radius:20px; font-size:12px; font-weight:600; text-transform:uppercase;">Due</span></td>
        </tr>
      </table>

      <!-- Line Items -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px; text-align:left; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Description</th>
            <th style="padding:10px 12px; text-align:center; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Qty</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Rate</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <!-- Totals -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
        ${discountVal > 0 ? `<tr><td style="padding:6px 12px; color:#6b7280; font-size:14px;">Discount</td><td style="padding:6px 12px; text-align:right; color:#dc2626; font-size:14px;">-${currencySymbol}${discountVal.toFixed(2)}</td></tr>` : ''}
        ${taxVal > 0 ? `<tr><td style="padding:6px 12px; color:#6b7280; font-size:14px;">Tax</td><td style="padding:6px 12px; text-align:right; font-size:14px;">+${currencySymbol}${taxVal.toFixed(2)}</td></tr>` : ''}
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:14px 12px; font-size:18px; font-weight:700; color:#111827;">Total Due</td>
          <td style="padding:14px 12px; text-align:right; font-size:22px; font-weight:700; color:#6366f1;">${currencySymbol}${(invoice.total_amount || 0).toFixed(2)}</td>
        </tr>
      </table>

      ${invoice.payment_instructions ? `
      <!-- Payment Instructions -->
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px 20px; margin-bottom:28px;">
        <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#166534; text-transform:uppercase; letter-spacing:0.05em;">💳 Payment Instructions</p>
        <p style="margin:0; font-size:14px; color:#15803d; white-space:pre-line; line-height:1.6;">${invoice.payment_instructions}</p>
      </div>` : ''}

      ${invoice.notes ? `
      <div style="background:#f9fafb; border-radius:8px; padding:16px 20px; margin-bottom:28px;">
        <p style="margin:0 0 6px; font-size:13px; font-weight:600; color:#374151;">Notes</p>
        <p style="margin:0; font-size:14px; color:#6b7280; line-height:1.6;">${invoice.notes}</p>
      </div>` : ''}

      <p style="margin:0; font-size:14px; color:#6b7280;">
        The full invoice PDF is attached to this email. Please don't hesitate to reach out with any questions.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:13px; color:#9ca3af;">Melloo Media (a Melloo LLC company) · melloomedia@gmail.com</p>
    </div>
  </div>
</body>
</html>`;

            // 4. Send via mailService (Resend primary, Gmail fallback)
            try {
                await sendMail({
                    to: invoice.client_email,
                    subject: `Invoice #${id} from Melloo Media – ${currencySymbol}${(invoice.total_amount || 0).toFixed(2)} Due`,
                    html: htmlBody,
                    attachments: [{
                        filename: `Invoice_${id}_MellooMedia.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }],
                    relatedKind: 'invoice',
                    relatedId: id,
                });
                console.log(`[Email] Invoice #${id} sent to ${invoice.client_email}`);

                // 5. Mark as sent + sync project
                db.run(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id], (err) => {
                    if (err) console.error('Failed to update status:', err);
                    // Auto-sync project payment_status
                    if (invoice.project_id) syncProjectPaymentStatus(invoice.project_id);
                    
                    db.run("INSERT INTO client_communications (client_id, type, method, description) VALUES ($1, $2, $3, $4)", 
                        [invoice.client_id, 'invoice', 'email', `Sent Invoice #${id} for ${currencySymbol}${(invoice.total_amount || 0).toFixed(2)}`]);
                        
                    // Campaign Trigger
                    const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
                    enrollClientInCampaignByTrigger(invoice.client_id, 'invoice_sent').catch(e => console.error(e));
                });

                res.json({ message: `Invoice sent to ${invoice.client_email}` });
            } catch (emailErr) {
                console.error('Email send error:', emailErr);
                res.status(500).json({ error: `Failed to send email: ${emailErr.message}` });
            }
        });
    });
});

// Helper to send receipt email
async function sendReceiptEmail(invoiceId) {
    const { sendMail } = require('../utils/mailService');

    // 1. Fetch invoice + client
    const invoiceSql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company,
               clients.email as client_email, clients.google_drive_folder_id
        FROM invoices
        LEFT JOIN clients ON invoices.client_id = clients.id
        WHERE invoices.id = ?
    `;
    const itemsSql = `SELECT * FROM invoice_items WHERE invoice_id = ?`;

    return new Promise((resolve, reject) => {
        db.get(invoiceSql, [invoiceId], (err, invoice) => {
            if (err || !invoice) return resolve(); // Fail silently/log if not found
            // minimal check: if no email, we might still want to save to Drive? 
            // Original logic returned if no email. We'll keep it consistent but maybe log it.
            if (!invoice.client_email) {
                console.log(`[Receipt] No email for client, skipping receipt email for #${invoiceId}.`);
                // If you want to save to drive even without email, move this check later. 
                // For now, assuming email is primary trigger, we'll proceed only if email exists or modify logic.
                // User request was "once invoice is marked as paid...". 
                // I'll assume we should try to save to Drive even if email is missing, but strict adherence to existing flow means I should probably remove this strict return 
                // and handle email sending conditionally. However, to minimize disruption, I will stick to the existing pattern but I'll add the Drive logic.
                // Actually, if I return here, I miss the Drive upload. 
                // Let's modify to proceed.
            }

            db.all(itemsSql, [invoiceId], async (err, items) => {
                if (err) return resolve();

                // 2. Generate PDF (Status is PAID)
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
                        payment_instructions: invoice.payment_instructions,
                        status: 'paid' // Force paid status for stamp
                    });
                } catch (pdfErr) {
                    console.error('Receipt PDF Error:', pdfErr);
                    return resolve();
                }

                // 2b. Upload to Google Drive (Linked Invoice Folder)
                if (invoice.google_drive_folder_id) {
                    try {
                        const invoicesFolderId = await getInvoicesSubfolderId(invoice.google_drive_folder_id);
                        if (invoicesFolderId) {
                            const drive = await getDriveClient();
                            const fileName = `PAID INVOICE# ${invoiceId}.pdf`; // User requested format
                            await drive.files.create({
                                resource: { name: fileName, parents: [invoicesFolderId] },
                                media: { mimeType: 'application/pdf', body: stream.PassThrough().end(pdfBuffer) }
                            });
                            console.log(`[Drive] Saved "${fileName}" to linked folder.`);
                        }
                    } catch (driveErr) {
                        console.error('Error saving paid invoice to Drive:', driveErr);
                    }
                }

                // 3. Build HTML Receipt & Send Email (only if email exists)
                if (invoice.client_email) {
                    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#10b981,#34d399); padding:36px 40px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:28px; letter-spacing:-0.5px;">Payment Received</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:15px;">Thank You!</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="margin:0 0 20px; font-size:15px; color:#374151;">
        Hi <strong>${invoice.client_name || 'there'}</strong>,
      </p>
      <p style="margin:0 0 28px; font-size:15px; color:#6b7280; line-height:1.6;">
        We have received your payment for <strong>Invoice #${invoiceId}</strong>. A receipt copy is attached to this email.
      </p>
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:20px; text-align:center;">
         <p style="margin:0 0 4px; font-size:13px; color:#166534; font-weight:600; text-transform:uppercase;">Amount Paid</p>
         <p style="margin:0; font-size:32px; font-weight:700; color:#15803d;">${currencySymbol}${(invoice.total_amount || 0).toFixed(2)}</p>
      </div>
      <p style="margin:28px 0 0; font-size:14px; color:#6b7280;">Thanks for your business!</p>
    </div>
    <div style="background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:13px; color:#9ca3af;">Melloo Media (a Melloo LLC company) · melloomedia@gmail.com</p>
    </div>
  </div>
</body>
</html>`;

                    const mailOptions = {
                        to: invoice.client_email,
                        subject: `Payment Receipt: Invoice #${invoiceId}`,
                        html: htmlBody,
                        relatedKind: 'invoice_receipt',
                        relatedId: invoiceId,
                        attachments: [{
                            filename: `Receipt_Invoice_${invoiceId}.pdf`,
                            content: pdfBuffer,
                            contentType: 'application/pdf'
                        }]
                    };

                    sendMail(mailOptions).then(() => {
                        console.log(`[Email] Receipt for #${invoiceId} sent to ${invoice.client_email}`);
                        db.run("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, ?, ?, ?)",
                            [invoice.client_id, 'invoice', 'email', `Sent Payment Receipt for Invoice #${invoiceId} (${currencySymbol}${(invoice.total_amount || 0).toFixed(2)})`]);
                    }).catch((err) => {
                        console.error('Receipt Email Error:', err);
                    }).finally(() => resolve());
                } else {
                    resolve();
                }
            });
        });
    });
}

// Make sure to export sendReceiptEmail or include it if I move logic out. 
// For now, it's a local helper in this file.

// (Removed: GET /fix-schema — one-shot migration that already ran.)

// ========= PARTIAL PAYMENTS =========

// POST record a partial payment
router.post('/:id/payment', (req, res) => {
    const invoiceId = req.params.id;
    const { amount, method, note } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }

    // 1. Get current invoice
    db.get('SELECT * FROM invoices WHERE id = $1', [invoiceId], (err, invoice) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const currentPaid = invoice.amount_paid || 0;
        const newPaid = currentPaid + amount;
        const remaining = Math.max(0, invoice.total_amount - newPaid);

        // Determine new status
        let newStatus = invoice.status;
        if (newPaid >= invoice.total_amount) {
            newStatus = 'paid';
        } else if (newPaid > 0) {
            newStatus = 'partial';
        }

        // 2. Record the payment
        db.run(
            'INSERT INTO invoice_payments (invoice_id, amount, method, note) VALUES ($1, $2, $3, $4)',
            [invoiceId, amount, method || '', note || ''],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                const paymentId = this.lastID;

                // 3. Update invoice totals and status
                db.run(
                    'UPDATE invoices SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                    [newPaid, newStatus, invoiceId],
                    (err) => {
                        if (err) return res.status(500).json({ error: err.message });

                        // Sync project payment status
                        if (invoice.project_id) syncProjectPaymentStatus(invoice.project_id);

                        // If fully paid, send receipt and trigger campaign
                        if (newStatus === 'paid') {
                            sendReceiptEmail(invoiceId);
                            const { enrollClientInCampaignByTrigger } = require('../utils/campaignRunner');
                            enrollClientInCampaignByTrigger(invoice.client_id, 'invoice_paid').catch(e => console.error(e));
                        }

                        res.json({
                            message: 'Payment recorded',
                            payment_id: paymentId,
                            amount_paid: newPaid,
                            remaining_balance: remaining,
                            status: newStatus
                        });
                    }
                );
            }
        );
    });
});

// GET payment history for an invoice
router.get('/:id/payments', (req, res) => {
    db.all(
        'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY created_at DESC',
        [req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        }
    );
});

// POST send updated invoice requesting remaining balance
router.post('/:id/send-remaining', async (req, res) => {
    const id = req.params.id;
    const { sendMail } = require('../utils/mailService');

    const invoiceSql = `
        SELECT invoices.*, clients.name as client_name, clients.company as client_company,
               clients.email as client_email
        FROM invoices
        LEFT JOIN clients ON invoices.client_id = clients.id
        WHERE invoices.id = ?
    `;

    db.get(invoiceSql, [id], async (err, invoice) => {
        if (err || !invoice) return res.status(500).json({ error: err ? err.message : 'Invoice not found' });
        if (!invoice.client_email) return res.status(400).json({ error: 'Client has no email address on file.' });

        const amountPaid = invoice.amount_paid || 0;
        const remaining = Math.max(0, invoice.total_amount - amountPaid);

        if (remaining <= 0) {
            return res.status(400).json({ error: 'Invoice is already fully paid.' });
        }

        const currencySymbol = invoice.currency === 'EUR' ? '€' : invoice.currency === 'GBP' ? '£' : '$';

        // Build HTML email
        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#f59e0b,#f97316); padding:36px 40px; text-align:center;">
      <h1 style="margin:0; color:#fff; font-size:28px; letter-spacing:-0.5px;">Payment Reminder</h1>
      <p style="margin:8px 0 0; color:rgba(255,255,255,0.9); font-size:15px;">Invoice #${id}</p>
    </div>

    <div style="padding:36px 40px;">
      <p style="margin:0 0 20px; font-size:15px; color:#374151;">
        Hi <strong>${invoice.client_name || 'there'}</strong>,
      </p>
      <p style="margin:0 0 28px; font-size:15px; color:#6b7280; line-height:1.6;">
        Thank you for your partial payment on <strong>Invoice #${id}</strong>. Below is a summary of the current payment status and the remaining balance due.
      </p>

      <table style="width:100%; border-collapse:collapse; margin-bottom:28px; background:#f9fafb; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="padding:12px 16px; font-size:13px; color:#6b7280;">Invoice Total</td>
          <td style="padding:12px 16px; font-size:13px; color:#111827; font-weight:500; text-align:right;">${currencySymbol}${invoice.total_amount.toFixed(2)}</td>
        </tr>
        <tr style="background:#f0fdf4;">
          <td style="padding:12px 16px; font-size:13px; color:#166534; font-weight:600;">Amount Paid</td>
          <td style="padding:12px 16px; font-size:13px; color:#15803d; font-weight:600; text-align:right;">${currencySymbol}${amountPaid.toFixed(2)}</td>
        </tr>
        <tr style="background:#fef2f2;">
          <td style="padding:14px 16px; font-size:15px; color:#991b1b; font-weight:700;">Remaining Balance</td>
          <td style="padding:14px 16px; font-size:20px; color:#dc2626; font-weight:700; text-align:right;">${currencySymbol}${remaining.toFixed(2)}</td>
        </tr>
      </table>

      <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:8px; padding:16px 20px; margin-bottom:28px; text-align:center;">
        <p style="margin:0 0 4px; font-size:13px; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:0.05em;">Due Date</p>
        <p style="margin:0; font-size:16px; font-weight:600; color:#78350f;">${new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      ${invoice.payment_instructions ? `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px 20px; margin-bottom:28px;">
        <p style="margin:0 0 8px; font-size:13px; font-weight:700; color:#166534; text-transform:uppercase; letter-spacing:0.05em;">💳 Payment Instructions</p>
        <p style="margin:0; font-size:14px; color:#15803d; white-space:pre-line; line-height:1.6;">${invoice.payment_instructions}</p>
      </div>` : ''}

      <p style="margin:0; font-size:14px; color:#6b7280;">
        Please remit the remaining balance at your earliest convenience. Don't hesitate to reach out with any questions.
      </p>
    </div>

    <div style="background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-size:13px; color:#9ca3af;">Melloo Media (a Melloo LLC company) · melloomedia@gmail.com</p>
    </div>
  </div>
</body>
</html>`;

        try {
            await sendMail({
                to: invoice.client_email,
                subject: `Payment Reminder: Invoice #${id} – ${currencySymbol}${remaining.toFixed(2)} Remaining`,
                html: htmlBody,
                relatedKind: 'invoice_reminder',
                relatedId: id,
            });

            console.log(`[Email] Remaining balance request for #${id} sent to ${invoice.client_email}`);
            
            db.run("INSERT INTO client_communications (client_id, type, method, description) VALUES (?, ?, ?, ?)", 
                [invoice.client_id, 'invoice', 'email', `Sent partial payment reminder for Invoice #${id} (${currencySymbol}${remaining.toFixed(2)} remaining)`]);

            res.json({ message: `Remaining balance email sent to ${invoice.client_email}`, remaining });
        } catch (emailErr) {
            console.error('Email send error:', emailErr);
            res.status(500).json({ error: `Failed to send email: ${emailErr.message}` });
        }
    });
});

router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    db.run("UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Status updated to ${status}` });
    });
});

module.exports = router;
