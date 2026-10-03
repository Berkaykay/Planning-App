const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStorage } = require('./storage.cjs');
const { createSounds } = require('./sounds.cjs');
const { setupUpdates } = require('./updates.cjs');
const { createTray } = require('./tray.cjs');
const launcher = require('./launcher.cjs');

// PLANNER_DATA_DIR lets tests (or power users) point the app at another data folder. Electron's
// own files then go next to it, so test runs never share a profile (or the single-instance lock).
const dataDir = process.env.PLANNER_DATA_DIR || app.getPath('userData');
if (process.env.PLANNER_DATA_DIR) app.setPath('userData', `${process.env.PLANNER_DATA_DIR}-electron`);
const storage = createStorage(dataDir);
const sounds = createSounds(dataDir);
const PRELOAD = path.join(__dirname, 'preload.cjs');
const ICON = path.join(__dirname, 'icon.png');

// Height of the tab strip, which doubles as the window's title bar.
const TITLE_BAR_HEIGHT = 40;

let mainWindow = null;
let quitting = false;
// The data as last saved by the page; the tray popup is shown this.
let latestData = null;
// Background options from Settings (see settings.background in src/lib/store.js).
let background = { tray: false, keepRunning: false, startOnLogin: false, menuLauncher: true };

// Imported notification sounds are played from planner-sound://sounds/<name>.
protocol.registerSchemesAsPrivileged([{ scheme: 'planner-sound', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);

// Only one Planner runs at a time: starting it again brings the open one to the front.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => showMain());
}
// Windows uses this to show Planner's name and icon on notifications.
if (process.platform === 'win32') app.setAppUserModelId('com.berkaykay.planner');

const send = (channel, payload) => mainWindow?.webContents.send(channel, payload);
const sendCommand = (command) => send('app:command', command);
const darkBackground = () => (nativeTheme.shouldUseDarkColors ? '#121316' : '#f4f4f5');

function loadPage(win, query) {
  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) win.loadURL(query ? `${devServer}?${new URLSearchParams(query)}` : devServer);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), query ? { query } : undefined);
}

function showMain() {
  if (!mainWindow) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quit() {
  quitting = true;
  app.quit();
}

const tray = createTray({ loadPage, preload: PRELOAD, backgroundColor: darkBackground, openMain: showMain, quit, getData: () => latestData });
const updates = setupUpdates({ send: (status) => send('updates:status', status) });

function buildMenu() {
  const command = (label, accelerator, name) => ({ label, accelerator, click: () => sendCommand(name) });
  const template = [
    {
      label: 'File',
      submenu: [
        command('New Tab', 'Ctrl+T', 'new-tab'),
        command('Close Tab', 'Ctrl+W', 'close-tab'),
        command('Reopen Closed Tab', 'Ctrl+Shift+T', 'reopen-tab'),
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Ctrl+Q', click: quit },
      ],
    },
    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: 'Go',
      submenu: [
        command('Quick Search…', 'Ctrl+K', 'quick-search'),
        { type: 'separator' },
        command('Back', 'Alt+Left', 'back'),
        command('Forward', 'Alt+Right', 'forward'),
        { type: 'separator' },
        command('Next Tab', 'Ctrl+Tab', 'next-tab'),
        command('Previous Tab', 'Ctrl+Shift+Tab', 'prev-tab'),
        { type: 'separator' },
        command('Dashboard', 'Ctrl+1', 'go-dashboard'),
        command('Calendar', 'Ctrl+2', 'go-calendar'),
        command('Day Planner (Today)', 'Ctrl+3', 'go-today'),
        command('Categories', 'Ctrl+4', 'go-categories'),
        { type: 'separator' },
        command('Focus Address Bar', 'Ctrl+L', 'focus-address'),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    show,
    title: 'Planner',
    icon: ICON,
    backgroundColor: darkBackground(),
    // Browser-style frame: the tab strip is the top of the window, and Electron draws the
    // minimize / maximize / close buttons over its right end (colored to match the theme by the
    // page, see 'window:titleBarOverlay').
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: nativeTheme.shouldUseDarkColors ? '#0c0d0f' : '#e6e6ea',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ececf0' : '#18181b',
      height: TITLE_BAR_HEIGHT,
    },
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Reminders keep their pace while the window is hidden in the tray.
      backgroundThrottling: false,
    },
  });

  // No menu bar (not even when Alt is pressed); its keyboard shortcuts keep working.
  mainWindow.setMenuBarVisibility(false);

  // This is not a web browser: never navigate the window away from the app,
  // and send any real web links to the system browser instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Electron shows no right-click menu in text fields by default; offer the usual edit actions.
  // (The app's own right-click menus prevent this event, so it only fires for text fields.)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll' },
    ]).popup({ window: mainWindow });
  });

  loadPage(mainWindow);

  // With "keep running" on, closing the window only hides it; the tray brings it back.
  mainWindow.on('close', (event) => {
    if (!quitting && background.keepRunning && tray.isActive()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Applies the Background options: tray icon, keep running, start at login, applications menu.
function applyBackground(next, { startup = false } = {}) {
  const prev = background;
  background = { ...background, ...next };
  tray.enable(background.tray);
  if (startup || prev.startOnLogin !== background.startOnLogin) {
    try {
      launcher.setStartOnLogin(background.startOnLogin);
    } catch (err) {
      console.error('Could not change start at login', err);
    }
  }
  if (startup || prev.menuLauncher !== background.menuLauncher) {
    try {
      launcher.setMenuEntry(background.menuLauncher);
    } catch (err) {
      console.error('Could not update the applications menu entry', err);
    }
  }
}

// The page tells us its tab-strip colors so the window buttons match the light or dark theme.
ipcMain.on('window:titleBarOverlay', (_event, { color, symbolColor }) => {
  try {
    mainWindow?.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
  } catch (err) {
    console.error('Could not recolor the window buttons', err);
  }
});
ipcMain.on('window:show', () => showMain());

// Settings that the main process acts on.
ipcMain.on('app:settings', (_event, { background: bg, updates: up }) => {
  if (bg) applyBackground(bg);
  if (up) updates.setAuto(up.auto);
});

ipcMain.handle('store:load', () => {
  latestData = storage.load();
  return latestData;
});
ipcMain.handle('store:save', (event, data) => {
  storage.save(data);
  latestData = data;
  // Keep the tray popup in step with the main window.
  if (event.sender === mainWindow?.webContents) tray.sendState();
  return true;
});
ipcMain.handle('store:path', () => storage.file);
ipcMain.handle('store:info', () => ({ file: storage.file, dir: storage.dir, backups: storage.listBackups() }));
ipcMain.handle('store:openFolder', () => shell.openPath(storage.dir));

// The tray popup: changes go to the main window, which owns the data.
ipcMain.on('mini:action', (_event, action) => send('app:remote', { action }));
ipcMain.on('mini:command', (_event, command) => {
  showMain();
  tray.hideMini();
  send('app:remote', { command });
});
ipcMain.on('mini:hide', () => tray.hideMini());
ipcMain.on('mini:ready', () => tray.sendState());

// In-app updates.
ipcMain.handle('updates:check', () => updates.check());
ipcMain.handle('updates:download', () => updates.download());
ipcMain.handle('updates:status', () => updates.status());
ipcMain.handle('updates:openPage', () => updates.openPage());

// Notification sounds. PLANNER_TEST_IMPORT_SOUND skips the file dialog in the tests.
ipcMain.handle('sounds:list', () => sounds.list());
ipcMain.handle('sounds:remove', (_event, name) => sounds.remove(name));
ipcMain.handle('sounds:import', async () => {
  let files = process.env.PLANNER_TEST_IMPORT_SOUND?.split(path.delimiter).filter(Boolean);
  if (!files) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add notification sounds',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Sounds', extensions: sounds.EXTENSIONS.map((e) => e.slice(1)) }],
    });
    if (result.canceled) return { added: [], skipped: [], list: sounds.list() };
    files = result.filePaths;
  }
  return { ...sounds.importFiles(files), list: sounds.list() };
});

// Backup export/import. PLANNER_TEST_EXPORT_PATH / PLANNER_TEST_IMPORT_PATH skip the file
// dialogs so the automated tests can exercise these features.
ipcMain.handle('data:export', async (_event, data) => {
  let target = process.env.PLANNER_TEST_EXPORT_PATH;
  if (!target) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export planner backup',
      defaultPath: `planner-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Planner backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    target = result.filePath;
  }
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
  return target;
});
ipcMain.handle('data:import', async () => {
  let source = process.env.PLANNER_TEST_IMPORT_PATH;
  if (!source) {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import planner backup',
      properties: ['openFile'],
      filters: [{ name: 'Planner backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths.length) return null;
    source = result.filePaths[0];
  }
  try {
    return { data: JSON.parse(fs.readFileSync(source, 'utf8')), path: source };
  } catch (err) {
    return { error: `Could not read ${source}: ${err.message}` };
  }
});

app.whenReady().then(() => {
  try {
    storage.backupDaily();
  } catch (err) {
    console.error('Could not make the daily backup', err);
  }
  protocol.handle('planner-sound', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const file = sounds.fileFor(name);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 });
  });
  buildMenu();

  // Start with the saved Background options (the page re-sends them once it's loaded).
  latestData = storage.load();
  applyBackground(latestData?.settings?.background ?? {}, { startup: true });
  // Started at login with the tray on: stay in the tray until opened.
  createWindow({ show: !(process.argv.includes('--hidden') && tray.isActive()) });
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => app.quit());

// Hooks for the automated tests.
if (process.env.PLANNER_TEST_FAKE_TRAY === '1') {
  global.plannerTest = { tray, launcher, showMain, isQuitting: () => quitting };
}
