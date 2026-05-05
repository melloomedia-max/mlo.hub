const db = require('../server/database');
const { hashPassword } = require('../server/utils/auth');

const newPassword = process.env.APP_PASSWORD;

if (!newPassword) {
    console.error('ERROR: APP_PASSWORD environment variable not set');
    process.exit(1);
}

console.log('Updating staff password for melloomedia@gmail.com');
console.log('APP_PASSWORD found:', !!newPassword);

const hashedPassword = hashPassword(newPassword);
console.log('New password hash generated');

db.run(
    'UPDATE staff SET password = ? WHERE email = ?',
    [hashedPassword, 'melloomedia@gmail.com'],
    function(err) {
        if (err) {
            console.error('ERROR updating password:', err);
            process.exit(1);
        }
        
        console.log('✅ Password updated successfully');
        console.log('Rows affected:', this.changes);
        
        // Verify the update
        db.get(
            'SELECT email, password, status FROM staff WHERE email = ?',
            ['melloomedia@gmail.com'],
            (err, row) => {
                if (err) {
                    console.error('ERROR verifying update:', err);
                    process.exit(1);
                }
                console.log('\nUpdated staff record:');
                console.log('  Email:', row.email);
                console.log('  Status:', row.status);
                console.log('  Password hash:', row.password.substring(0, 50) + '...');
                
                db.close();
                process.exit(0);
            }
        );
    }
);
