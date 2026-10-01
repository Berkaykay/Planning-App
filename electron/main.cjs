const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
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
        { type: 'separator' },
        isMac ? { role: 'close', accelerator: 'Cmd+Shift+W' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
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
    backgroundColor: '#f5f6f8',
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

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
