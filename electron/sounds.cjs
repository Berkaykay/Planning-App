// Notification sounds the user imported: copies of their files in <data folder>/sounds, played by
// the page through the planner-sound:// protocol.
const fs = require('fs');
const path = require('path');

const EXTENSIONS = ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.flac'];
const MAX_BYTES = 10 * 1024 * 1024;

function createSounds(dataDir) {
  const dir = path.join(dataDir, 'sounds');

  const list = () => {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => EXTENSIONS.includes(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  };

  // Full path of an imported sound, or null if the name isn't one of ours (no path tricks).
  const fileFor = (name) => {
    const clean = path.basename(String(name));
    if (clean !== name || !list().includes(clean)) return null;
    return path.join(dir, clean);
  };

  // Copies the given files in. Returns { added: [names], skipped: [{ file, reason }] }.
  const importFiles = (files) => {
    fs.mkdirSync(dir, { recursive: true });
    const added = [];
    const skipped = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!EXTENSIONS.includes(ext)) {
        skipped.push({ file, reason: 'not a sound file' });
        continue;
      }
      if (fs.statSync(file).size > MAX_BYTES) {
        skipped.push({ file, reason: 'larger than 10 MB' });
        continue;
      }
      // Keep the original name; add (2), (3)… if it's taken.
      const base = path.basename(file, ext).replace(/[^\p{L}\p{N} _.-]/gu, '_').trim() || 'sound';
      let name = `${base}${ext}`;
      for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base} (${i})${ext}`;
      fs.copyFileSync(file, path.join(dir, name));
      added.push(name);
    }
    return { added, skipped };
  };

  const remove = (name) => {
    const file = fileFor(name);
    if (file) fs.unlinkSync(file);
    return list();
  };

  return { dir, list, fileFor, importFiles, remove, EXTENSIONS };
}

module.exports = { createSounds };
