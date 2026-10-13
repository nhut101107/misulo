// JSON store don gian (don it, khong can SQLite). Luu data/db.json
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { orders: [], keys: [], seq: 0 };
  }
}
function save(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
module.exports = { load, save };
