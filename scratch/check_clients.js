const path = require('path');
const dbPath = path.join(__dirname, '../server/database');
const db = require(dbPath);

db.all("SELECT id, name, status FROM clients", [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Total clients in DB: ${rows.length}`);
    rows.forEach(r => console.log(`ID: ${r.id}, Name: ${r.name}, Status: ${r.status}`));
    // No close method on the exported db object usually, it's a sqlite3 instance
});
