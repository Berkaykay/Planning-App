// How Cadence draws its windows on Linux.
//
// - 'x11' (default): through XWayland, so the tray popup can be placed right at the tray (native
//   Wayland doesn't let apps place their own windows). In this mode Cadence renders in software:
//   the GPU path through XWayland crashes on some Mesa drivers (seen on Nobara / Fedora 44 with
//   Mesa 26.2), and a planner doesn't need the GPU.
// - 'wayland': native Wayland, sharper on scaled screens; the system decides where the popup opens.
//
// The choice lives in a tiny file next to Electron's own files, because it's needed before anything
// else starts. If the graphics process still crashes in X11 mode, Cadence restarts in Wayland mode.
// CADENCE_WAYLAND=1 / CADENCE_X11=1 force a mode for one run.
const fs = require('fs');
const path = require('path');

const FILE = 'display-mode';

function savedMode(userData) {
  try {
    const value = fs.readFileSync(path.join(userData, FILE), 'utf8').trim();
    return value === 'wayland' || value === 'x11' ? value : null;
  } catch {
    return null;
  }
}

function saveMode(userData, mode) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, FILE), `${mode}\n`);
}

// Restarts Cadence. Inside an AppImage the running files disappear when the app quits, so the
// new copy is started from the AppImage itself.
function relaunch(app) {
  const appImage = process.env.APPIMAGE;
  app.relaunch(appImage ? { execPath: appImage, args: process.argv.slice(1) } : undefined);
}

// Picks the mode for this run and sets Chromium up for it. Call before the app is ready.
// `onFallback` runs when the graphics process crashed in X11 mode and Wayland was saved.
function applyDisplayMode(app, { onFallback } = {}) {
  if (process.platform !== 'linux') return { mode: 'native', saved: null };
  const userData = app.getPath('userData');
  const saved = savedMode(userData);
  const forced = process.env.CADENCE_WAYLAND === '1' ? 'wayland' : process.env.CADENCE_X11 === '1' ? 'x11' : null;
  const mode = forced ?? saved ?? 'x11';
  const result = { mode, saved };
  if (mode === 'x11') {
    app.commandLine.appendSwitch('ozone-platform', 'x11');
    app.disableHardwareAcceleration();
    // Safety net: if the graphics process crashes anyway, switch to native Wayland.
    app.on('child-process-gone', (_event, details) => {
      if (details.type !== 'GPU' || details.reason === 'clean-exit' || details.reason === 'killed' || result.saved === 'wayland') return;
      try {
        saveMode(userData, 'wayland');
        result.saved = 'wayland';
        console.error(`The graphics process stopped (${details.reason}); switching Cadence to Wayland mode.`);
      } catch (err) {
        console.error('Could not save the display fallback', err);
        return;
      }
      // Restart right away in Wayland mode, unless X11 was forced (that would only crash again).
      if (!forced) onFallback?.();
    });
  }
  return result;
}

module.exports = { applyDisplayMode, relaunch, saveMode, savedMode };
