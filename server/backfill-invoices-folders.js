require('dotenv').config();
const db = require('./database');
const { getInvoicesSubfolderId } = require('./utils/driveHelpers');

async function backfillInvoicesFolders() {
    console.log('Starting backfill of Invoices subfolders for existing clients...');

    return new Promise((resolve, reject) => {
        db.all('SELECT id, first_name, last_name, google_drive_folder_id FROM clients WHERE google_drive_folder_id IS NOT NULL', [], async (err, clients) => {
            if (err) {
                console.error('Error fetching clients:', err);
                reject(err);
                return;
            }

            console.log(`Found ${clients.length} clients with Drive folders`);

            let successCount = 0;
            let errorCount = 0;

            for (const client of clients) {
                try {
                    console.log(`\nProcessing: ${client.first_name} ${client.last_name} (ID: ${client.id})`);
                    console.log(`  Folder ID: ${client.google_drive_folder_id}`);

                    const invoicesFolderId = await getInvoicesSubfolderId(client.google_drive_folder_id);

                    if (invoicesFolderId) {
                        console.log(`  ✓ Invoices subfolder ID: ${invoicesFolderId}`);
                        successCount++;
                    } else {
                        console.log(`  ✗ Failed - returned null`);
                        errorCount++;
                    }
                } catch (error) {
                    console.error(`  ✗ Error:`, error.message);
                    errorCount++;
                }
            }

            console.log('\n=== Backfill Complete ===');
            console.log(`Success: ${successCount}`);
            console.log(`Errors: ${errorCount}`);
            console.log(`Total: ${clients.length}`);

            resolve({ successCount, errorCount, total: clients.length });
        });
    });
}

// Run if called directly
if (require.main === module) {
    backfillInvoicesFolders()
        .then(() => {
            console.log('\nBackfill completed successfully');
            process.exit(0);
        })
        .catch((err) => {
            console.error('\nBackfill failed:', err);
            process.exit(1);
        });
}

module.exports = { backfillInvoicesFolders };
