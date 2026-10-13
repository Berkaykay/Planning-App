// The tray icon and the little "today" popup it opens. The popup is the same page loaded with
// ?mini=1 (see src/mini/MiniDashboard.jsx); it shows the data the main window last saved and sends
// its changes back through the main window, so there is only ever one place that changes data.
const { BrowserWindow, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('path');
const { popupPosition } = require('./popupPosition.cjs');

const ICON = path.join(__dirname, 'icon.png');
const MINI = { width: 380, height: 640 };
// The focus timer's length; the tests make it a few seconds.
const FOCUS_SECONDS = Number(process.env.CADENCE_TEST_FOCUS_SECONDS) || 25 * 60;

function createTray({ loadPage, preload, backgroundColor, openMain, quit, getData, onFocusDone }) {
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
      // It belongs to the tray: it can't be dragged away.
      movable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: 'Cadence — Today',
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

  // Against the panel, at the tray icon (its real position on Windows; on Linux the system doesn't
  // say, so the tray end of the panel). Returns the panel's side for the slide-out animation.
  const place = (win) => {
    const bounds = tray?.getBounds?.() ?? null;
    const display = bounds && bounds.width > 0 ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
    const { x, y, side } = popupPosition(display, bounds, MINI);
    win.setPosition(x, y);
    return side;
  };

  // ---- Focus timer (lives here so it keeps running while the popup is closed) ----
  let focus = { duration: FOCUS_SECONDS, remaining: FOCUS_SECONDS, endsAt: null, done: false };
  let focusTimer = null;
  const sendFocus = () => mini?.webContents.send('mini:focus', { ...focus, now: Date.now() });
  const focusAction = ({ type, minutes }) => {
    if (type === 'get') return sendFocus();
    const now = Date.now();
    clearTimeout(focusTimer);
    if (type === 'start' && !focus.endsAt) {
      if (focus.done || focus.remaining <= 0) focus = { ...focus, remaining: focus.duration, done: false };
      focus = { ...focus, endsAt: now + focus.remaining * 1000 };
    } else if (type === 'pause' && focus.endsAt) {
      focus = { ...focus, remaining: Math.max(0, Math.round((focus.endsAt - now) / 1000)), endsAt: null };
    } else if (type === 'reset') {
      focus = { duration: FOCUS_SECONDS, remaining: FOCUS_SECONDS, endsAt: null, done: false };
    } else if (type === 'add') {
      const extra = (minutes ?? 5) * 60;
      focus = focus.endsAt ? { ...focus, endsAt: focus.endsAt + extra * 1000 } : { ...focus, remaining: focus.remaining + extra, done: false };
    }
    if (focus.endsAt) {
      focusTimer = setTimeout(() => {
        focus = { ...focus, remaining: 0, endsAt: null, done: true };
        sendFocus();
        onFocusDone?.();
      }, focus.endsAt - now);
    }
    sendFocus();
  };

  const sendState = () => {
    const data = getData();
    if (mini && data) mini.webContents.send('mini:state', data);
  };

  const showMini = () => {
    const win = mini ?? createMini();
    const side = place(win);
    win.show();
    win.focus();
    sendState();
    sendFocus();
    // Plays the "comes out of the tray" animation from the panel's side.
    win.webContents.send('mini:shown', { side });
  };

  const toggleMini = () => (mini?.isVisible() ? mini.hide() : showMini());

  const menu = () =>
    Menu.buildFromTemplate([
      { label: 'Today at a glance', click: showMini },
      { label: 'Open Cadence', click: openMain },
      { type: 'separator' },
      { label: 'Quit Cadence', click: quit },
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
      tray.setToolTip('Cadence');
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
    sendFocus,
    focusAction,
    miniWindow: () => mini,
  };
}

module.exports = { createTray };
