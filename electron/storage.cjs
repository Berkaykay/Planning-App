// Persists the planner's data as a single JSON file.
// Writes go to a temp file first and are then renamed over the real file,
// so a crash mid-write can never leave a half-written data file behind.
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'planner-data.json';

function createStorage(dir) {
  const file = path.join(dir, FILE_NAME);
  const tmp = `${file}.tmp`;

  function load() {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    try {
      return JSON.parse(text);
    } catch (err) {
      // Keep the unreadable file around for manual recovery instead of overwriting it.
      const backup = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, backup);
      console.error(`Data file was unreadable; moved it to ${backup}`, err);
      return null;
    }
  }

  function save(data) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  return { file, load, save };
}

module.exports = { createStorage };
