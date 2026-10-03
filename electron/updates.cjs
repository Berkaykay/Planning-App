// In-app updates from the repository's GitHub releases (electron-updater reads latest.yml /
// latest-linux.yml there). Works for the installed Windows build and the Linux AppImage.
// The page gets 'updates:status' messages: { state, version, percent, message }, where state is
// 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'ready' | 'error' | 'unsupported'.
const { app, shell } = require('electron');

const RELEASES_PAGE = 'https://github.com/Berkaykay/Planning-App/releases/latest';
const SIX_HOURS = 6 * 60 * 60 * 1000;

function setupUpdates({ send }) {
  // Tests point this at a local server (generic provider) instead of GitHub.
  const testFeed = process.env.PLANNER_UPDATE_URL;
  let status = { state: 'idle', version: null };
  let updater = null;
  let timer = null;

  const supported = () => Boolean(testFeed) || (app.isPackaged && (process.platform === 'win32' || Boolean(process.env.APPIMAGE)));

  const set = (next) => {
    status = { ...status, ...next };
    send(status);
  };

  const getUpdater = () => {
    if (updater) return updater;
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.logger = null;
    if (testFeed) {
      updater.forceDevUpdateConfig = true;
      updater.setFeedURL({ provider: 'generic', url: testFeed });
    }
    updater.on('checking-for-update', () => set({ state: 'checking', message: null }));
    updater.on('update-available', (info) => set({ state: 'available', version: info.version, message: null }));
    updater.on('update-not-available', () => set({ state: 'none', version: null, message: null }));
    updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent) }));
    updater.on('update-downloaded', () => {
      set({ state: 'ready', percent: 100 });
      // Give the page a moment to show "Restarting…".
      setTimeout(() => updater.quitAndInstall(true, true), 600);
    });
    updater.on('error', (err) => set({ state: 'error', message: friendly(err) }));
    return updater;
  };

  const check = async () => {
    if (!supported()) {
      set({ state: 'unsupported', message: 'Updates are checked in the installed app.' });
      return status;
    }
    try {
      await getUpdater().checkForUpdates();
    } catch (err) {
      set({ state: 'error', message: friendly(err) });
    }
    return status;
  };

  const download = async () => {
    if (!supported() || status.state !== 'available') return status;
    set({ state: 'downloading', percent: 0 });
    try {
      await getUpdater().downloadUpdate();
    } catch (err) {
      set({ state: 'error', message: friendly(err) });
    }
    return status;
  };

  // Checks now and then every six hours (while `auto` is on).
  let autoOn = null;
  const setAuto = (auto) => {
    if (auto === autoOn) return;
    autoOn = auto;
    clearInterval(timer);
    timer = null;
    if (!auto || !supported()) return;
    check();
    timer = setInterval(check, SIX_HOURS);
  };

  return {
    check,
    download,
    setAuto,
    status: () => status,
    openPage: () => shell.openExternal(RELEASES_PAGE),
  };
}

function friendly(err) {
  const text = String(err?.message || err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(text)) return "Couldn't reach GitHub. Check your internet connection.";
  if (/404/.test(text)) return "Couldn't find the update files on GitHub.";
  return "Couldn't check for updates right now.";
}

module.exports = { setupUpdates, RELEASES_PAGE };
