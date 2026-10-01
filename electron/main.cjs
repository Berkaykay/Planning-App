const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStorage } = require('./storage.cjs');

const isMac = process.platform === 'darwin';
// PLANNER_DATA_DIR lets tests (or power users) point the app at another data folder.
const dataDir = process.env.PLANNER_DATA_DIR || app.getPath('userData');
const storage = createStorage(dataDir);

let mainWindow = null;

function sendCommand(command) {
  if (mainWindow) mainWindow.webContents.send('app:command', command);
}

function buildMenu() {
  const command = (label, accelerator, name) => ({ label, accelerator, click: () => sendCommand(name) });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        command('New Tab', 'CmdOrCtrl+T', 'new-tab'),
        command('Close Tab', 'CmdOrCtrl+W', 'close-tab'),
        command('Reopen Closed Tab', 'CmdOrCtrl+Shift+T', 'reopen-tab'),
        { type: 'separator' },
        isMac ? { role: 'close', accelerator: 'Cmd+Shift+W' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        command('Back', isMac ? 'Cmd+[' : 'Alt+Left', 'back'),
        command('Forward', isMac ? 'Cmd+]' : 'Alt+Right', 'forward'),
        { type: 'separator' },
        command('Next Tab', 'Ctrl+Tab', 'next-tab'),
        command('Previous Tab', 'Ctrl+Shift+Tab', 'prev-tab'),
        { type: 'separator' },
        command('Dashboard', 'CmdOrCtrl+1', 'go-dashboard'),
        command('Calendar', 'CmdOrCtrl+2', 'go-calendar'),
        command('Day Planner (Today)', 'CmdOrCtrl+3', 'go-today'),
        command('Categories', 'CmdOrCtrl+4', 'go-categories'),
        { type: 'separator' },
        command('Focus Address Bar', 'CmdOrCtrl+L', 'focus-address'),
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 560,
    title: 'Planner',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121316' : '#f4f4f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) mainWindow.loadURL(devServer);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('store:load', () => storage.load());
ipcMain.handle('store:save', (_event, data) => {
  storage.save(data);
  return true;
});
ipcMain.handle('store:path', () => storage.file);
ipcMain.handle('store:info', () => ({ file: storage.file, dir: storage.dir, backups: storage.listBackups() }));
ipcMain.handle('store:openFolder', () => shell.openPath(storage.dir));

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
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
