const path = require('path');
const dbPath = path.join(__dirname, '../server/database');
const db = require(dbPath);

db.all("PRAGMA table_info(clients)", [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    rows.forEach(r => console.log(`Column: ${r.name}`));
});
