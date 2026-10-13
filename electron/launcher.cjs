// Puts Cadence in the applications menu (Linux AppImage) and starts it at login (Linux autostart
// entry, Windows login item). Paths follow the freedesktop conventions and honor XDG_*_HOME.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ICON = path.join(__dirname, 'icon.png');
const dataHome = () => process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const configHome = () => process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

const menuFile = () => path.join(dataHome(), 'applications', 'cadence.desktop');
const iconFile = () => path.join(dataHome(), 'icons', 'hicolor', '512x512', 'apps', 'cadence.png');
const autostartFile = () => path.join(configHome(), 'autostart', 'cadence.desktop');
// What the app wrote while it was called Planner.
const legacyFiles = () => [
  path.join(dataHome(), 'applications', 'planner.desktop'),
  path.join(dataHome(), 'icons', 'hicolor', '512x512', 'apps', 'planner.png'),
  path.join(configHome(), 'autostart', 'planner.desktop'),
];

// The AppImage's own path (set by the AppImage runtime). Without it there's nothing to point at.
const appImage = () => process.env.APPIMAGE || null;

function desktopEntry(exec, extra = '') {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Cadence',
    'Comment=Plan your days, lessons and deadlines',
    `Exec="${exec}"${extra} %U`,
    // The full path, so icon themes (which may have their own "planner"/"cadence" icon) can't swap it.
    `Icon=${iconFile()}`,
    'Terminal=false',
    'Categories=Office;Calendar;',
    '',
  ].join('\n');
}

// Writes `file` only when its content changed (e.g. the AppImage was moved).
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

const removeFile = (file) => fs.existsSync(file) && fs.unlinkSync(file);

// Adds (or removes) the applications-menu entry and its icon. Linux AppImage only.
function setMenuEntry(enabled) {
  if (process.platform !== 'linux' || !appImage()) return false;
  if (!enabled) {
    removeFile(menuFile());
    removeFile(iconFile());
    return false;
  }
  fs.mkdirSync(path.dirname(iconFile()), { recursive: true });
  fs.copyFileSync(ICON, iconFile());
  writeIfChanged(menuFile(), desktopEntry(appImage()));
  return true;
}

// Starts Cadence hidden (in the tray) when you log in.
function setStartOnLogin(enabled) {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
    return enabled;
  }
  if (process.platform !== 'linux' || !appImage()) return false;
  if (!enabled) {
    removeFile(autostartFile());
    return false;
  }
  writeIfChanged(autostartFile(), desktopEntry(appImage(), ' --hidden'));
  return true;
}

// Removes the menu entry, icon and autostart entry from when the app was called Planner.
function removeLegacyEntries() {
  if (process.platform !== 'linux') return;
  for (const file of legacyFiles()) removeFile(file);
}

module.exports = { removeLegacyEntries, setMenuEntry, setStartOnLogin, menuFile, autostartFile, iconFile };
