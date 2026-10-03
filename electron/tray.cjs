// The tray icon and the little "today" popup it opens. The popup is the same page loaded with
// ?mini=1 (see src/mini/MiniDashboard.jsx); it shows the data the main window last saved and sends
// its changes back through the main window, so there is only ever one place that changes data.
const { BrowserWindow, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('path');

const ICON = path.join(__dirname, 'icon.png');
const MINI = { width: 340, height: 540 };

function createTray({ loadPage, preload, backgroundColor, openMain, quit, getData }) {
  // Under the automated tests there's no tray host; they drive the popup through toggleMini().
  const fake = process.env.PLANNER_TEST_FAKE_TRAY === '1';
  let tray = null;
  let active = false;
  let mini = null;

  const createMini = () => {
    mini = new BrowserWindow({
      ...MINI,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Planner — Today',
      icon: ICON,
      backgroundColor: backgroundColor(),
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    mini.setMenuBarVisibility(false);
    loadPage(mini, { mini: '1' });
    // Like a tray popup: it goes away when you click elsewhere.
    mini.on('blur', () => {
      if (process.env.PLANNER_TEST_KEEP_MINI !== '1') mini?.hide();
    });
    mini.on('closed', () => {
      mini = null;
    });
    mini.webContents.on('did-finish-load', () => sendState());
    return mini;
  };

  // Next to the tray icon when the system tells us where it is (Windows); otherwise near the
  // pointer (Linux), always kept inside the screen's work area.
  const place = (win) => {
    const bounds = tray?.getBounds?.();
    const anchor = bounds && bounds.width > 0 ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(anchor).workArea;
    const below = anchor.y < area.y + area.height / 2;
    let x = Math.round(anchor.x - MINI.width / 2);
    let y = below ? anchor.y + 16 : anchor.y - MINI.height - 16;
    x = Math.min(Math.max(x, area.x + 8), area.x + area.width - MINI.width - 8);
    y = Math.min(Math.max(y, area.y + 8), area.y + area.height - MINI.height - 8);
    win.setPosition(x, Math.round(y));
  };

  const sendState = () => {
    const data = getData();
    if (mini && data) mini.webContents.send('mini:state', data);
  };

  const showMini = () => {
    const win = mini ?? createMini();
    place(win);
    win.show();
    win.focus();
    sendState();
  };

  const toggleMini = () => (mini?.isVisible() ? mini.hide() : showMini());

  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Today at a glance', click: showMini },
      { label: 'Open Planner', click: openMain },
      { type: 'separator' },
      { label: 'Quit Planner', click: quit },
    ]);

  const enable = (on) => {
    if (on === active) return active;
    active = on;
    if (!on) {
      tray?.destroy();
      tray = null;
      mini?.destroy();
      mini = null;
      return false;
    }
    if (fake) return true;
    try {
      const size = process.platform === 'win32' ? 16 : 24;
      tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: size, height: size, quality: 'best' }));
      tray.setToolTip('Planner');
      tray.setContextMenu(menu());
      tray.on('click', toggleMini);
    } catch (err) {
      console.error('Could not create the tray icon', err);
      tray = null;
      active = false;
    }
    return active;
  };

  return {
    enable,
    isActive: () => active,
    toggleMini,
    showMini,
    hideMini: () => mini?.hide(),
    sendState,
    miniWindow: () => mini,
  };
}

module.exports = { createTray };
