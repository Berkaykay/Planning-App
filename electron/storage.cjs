// Persists Cadence's data as a single JSON file.
// Writes go to a temp file first and are then renamed over the real file,
// so a crash mid-write can never leave a half-written data file behind.
const fs = require('fs');
const path = require('path');

const FILE_NAME = 'cadence-data.json';
// The app used to be called Planner; its data file is picked up (renamed) on first start.
const LEGACY_FILE_NAME = 'planner-data.json';
const KEEP_BACKUPS = 7;
const BACKUP = /^(cadence|planner)-data-(\d{4}-\d{2}-\d{2})\.json$/;

// Copies the data (file, daily backups, sounds) from the old "Planner" folder into a new, empty
// data folder. The old folder is left as it is, as an extra safety copy. Returns true if copied.
function migrateFolder(from, to) {
  const has = (dir) => fs.existsSync(path.join(dir, FILE_NAME)) || fs.existsSync(path.join(dir, LEGACY_FILE_NAME));
  if (!from || path.resolve(from) === path.resolve(to) || has(to) || !has(from)) return false;
  fs.mkdirSync(to, { recursive: true });
  for (const name of [FILE_NAME, LEGACY_FILE_NAME, 'backups', 'sounds']) {
    const src = path.join(from, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(to, name), { recursive: true });
  }
  return true;
}

function createStorage(dir) {
  const file = path.join(dir, FILE_NAME);
  const legacy = path.join(dir, LEGACY_FILE_NAME);
  if (!fs.existsSync(file) && fs.existsSync(legacy)) fs.renameSync(legacy, file);
  const tmp = `${file}.tmp`;
  const backupsDir = path.join(dir, 'backups');

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

  // Keeps one copy of the data file per day for the last week (made when the app starts).
  function backupDaily(today = new Date().toISOString().slice(0, 10)) {
    if (!fs.existsSync(file)) return;
    fs.mkdirSync(backupsDir, { recursive: true });
    const target = path.join(backupsDir, `cadence-data-${today}.json`);
    if (!fs.existsSync(target) && !fs.existsSync(path.join(backupsDir, `planner-data-${today}.json`))) fs.copyFileSync(file, target);
    const old = listBackups().slice(KEEP_BACKUPS);
    for (const name of old) fs.rmSync(path.join(backupsDir, name), { force: true });
  }

  function listBackups() {
    if (!fs.existsSync(backupsDir)) return [];
    return fs
      .readdirSync(backupsDir)
      .filter((n) => BACKUP.test(n))
      // Newest first, whatever the file's old or new name.
      .sort((a, b) => (a.match(BACKUP)[2] < b.match(BACKUP)[2] ? 1 : -1));
  }

  return { file, dir, backupsDir, load, save, backupDaily, listBackups };
}

module.exports = { createStorage, migrateFolder, FILE_NAME };
