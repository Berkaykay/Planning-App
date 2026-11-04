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

// Chromium picks X11 or Wayland from the real command line before main.cjs runs, so
// app.commandLine.appendSwitch('ozone-platform', 'x11') comes too late on a Wayland desktop (Electron
// 38+ uses Wayland there by default): the main process stays on Wayland while the GPU process, which
// does get the switch, draws for X11. No window ever appears (Cadence 1.6.0 and 1.6.1). So X11 mode
// restarts Cadence once with --ozone-platform=x11 on its command line.
const X11_FLAG = '--ozone-platform=x11';
const isOzoneFlag = (arg) => arg === '--ozone-platform' || arg.startsWith('--ozone-platform=');

function hasX11Flag(argv) {
  return argv.some((arg, i) => arg === X11_FLAG || (arg === '--ozone-platform' && argv[i + 1] === 'x11'));
}

// The arguments without any --ozone-platform flag (and the value after a bare one).
function withoutOzoneFlags(args) {
  return args.filter((arg, i) => !isOzoneFlag(arg) && args[i - 1] !== '--ozone-platform');
}

const onWaylandDesktop = (env = process.env) => Boolean(env.WAYLAND_DISPLAY) || env.XDG_SESSION_TYPE === 'wayland';

// Restarts Cadence; `extraArgs` are added to its command line. Inside an AppImage the running files
// disappear when the app quits, so the new copy is started from the AppImage itself. The display
// flag is dropped, so the new copy picks its mode again.
function relaunch(app, extraArgs = []) {
  const appImage = process.env.APPIMAGE;
  const args = [...withoutOzoneFlags(process.argv.slice(1)), ...extraArgs];
  app.relaunch(appImage ? { execPath: appImage, args } : { args });
}

// Starts a new copy right now, with `extraArgs` added. For use before the app is ready, when
// app.relaunch() does nothing (it only acts once the app has fully started).
function startCopy(extraArgs = []) {
  const { spawn } = require('child_process');
  const appImage = process.env.APPIMAGE;
  const args = [...withoutOzoneFlags(process.argv.slice(1)), ...extraArgs];
  spawn(appImage || process.execPath, args, { detached: true, stdio: 'ignore' }).unref();
}

// Picks the mode for this run and sets Chromium up for it. Call before the app is ready.
// `onFallback` runs when the graphics process crashed in X11 mode and Wayland was saved.
function applyDisplayMode(app, { onFallback } = {}) {
  if (process.platform !== 'linux') return { mode: 'native', saved: null };
  // A copy that already has the flag clears the loop guard, so its own restarts can switch again.
  if (hasX11Flag(process.argv)) delete process.env.CADENCE_X11_RESTARTED;
  const userData = app.getPath('userData');
  const saved = savedMode(userData);
  const forced = process.env.CADENCE_WAYLAND === '1' ? 'wayland' : process.env.CADENCE_X11 === '1' ? 'x11' : null;
  const mode = forced ?? saved ?? 'x11';
  const result = { mode, saved, restartForX11: false };
  if (mode === 'x11' && onWaylandDesktop() && !hasX11Flag(process.argv)) {
    // The switch below wouldn't take (see X11_FLAG): main.cjs restarts with the flag instead.
    // CADENCE_X11_RESTARTED guards against a restart loop if the flag gets lost on the way.
    if (process.env.CADENCE_X11_RESTARTED !== '1') {
      process.env.CADENCE_X11_RESTARTED = '1';
      result.restartForX11 = true;
      return result;
    }
    console.error('Could not start Cadence in X11 mode; using Wayland for this run.');
    result.mode = 'wayland';
    return result;
  }
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

module.exports = { applyDisplayMode, relaunch, startCopy, saveMode, savedMode, hasX11Flag, withoutOzoneFlags, X11_FLAG };
