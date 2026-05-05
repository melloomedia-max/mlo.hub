const { hashPassword } = require('../server/utils/auth');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const NEW_PASSWORD = 'MellooHub2026!';
const STAFF_EMAIL = 'melloomedia@gmail.com';

console.log('=== STAFF PASSWORD RESET ===');
console.log(`Password: ${NEW_PASSWORD}`);
console.log(`Email: ${STAFF_EMAIL}`);
console.log('');

// Generate new hash
const newHash = hashPassword(NEW_PASSWORD);
console.log('Generated hash:');
console.log(newHash);
console.log('');

// Update database
const dbPath = path.join(__dirname, '..', 'agency.db');
const db = new sqlite3.Database(dbPath);

db.run(
    'UPDATE staff SET password = ? WHERE email = ?',
    [newHash, STAFF_EMAIL],
    function(err) {
        if (err) {
            console.error('ERROR:', err.message);
            db.close();
            process.exit(1);
        }

        console.log(`Rows affected: ${this.changes}`);
        console.log('');

        // Verify the update
        db.get(
            'SELECT email, password, status FROM staff WHERE email = ?',
            [STAFF_EMAIL],
            (err, row) => {
                if (err) {
                    console.error('ERROR:', err.message);
                    db.close();
                    process.exit(1);
                }

                console.log('=== VERIFICATION ===');
                console.log(`Email: ${row.email}`);
                console.log(`Status: ${row.status}`);
                console.log(`Hash in DB: ${row.password}`);
                console.log('');
                console.log('✅ Password hash updated successfully!');
                console.log(`Login with: ${NEW_PASSWORD}`);

                db.close();
            }
        );
    }
);
