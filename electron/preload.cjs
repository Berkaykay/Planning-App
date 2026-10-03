const { contextBridge, ipcRenderer } = require('electron');

// Subscribes `callback` to a channel; returns the unsubscribe function.
const listen = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('planner', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  dataFile: () => ipcRenderer.invoke('store:path'),
  dataInfo: () => ipcRenderer.invoke('store:info'),
  openDataFolder: () => ipcRenderer.invoke('store:openFolder'),
  exportData: (data) => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import'),
  platform: process.platform,
  // Recolors the window's minimize / maximize / close buttons to match the theme.
  setTitleBarColors: (colors) => ipcRenderer.send('window:titleBarOverlay', colors),
  showWindow: () => ipcRenderer.send('window:show'),
  // Settings the main process acts on (tray, start at login, menu entry, automatic updates).
  applySettings: (settings) => ipcRenderer.send('app:settings', settings),
  // Commands triggered from the application menu (keyboard shortcuts).
  onCommand: (callback) => listen('app:command', callback),
  // Changes made in the tray popup ({ action } or { command }), applied by the main window.
  onRemote: (callback) => listen('app:remote', callback),
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    status: () => ipcRenderer.invoke('updates:status'),
    openPage: () => ipcRenderer.invoke('updates:openPage'),
    onStatus: (callback) => listen('updates:status', callback),
  },
  sounds: {
    list: () => ipcRenderer.invoke('sounds:list'),
    import: () => ipcRenderer.invoke('sounds:import'),
    remove: (name) => ipcRenderer.invoke('sounds:remove', name),
  },
  // Used by the tray popup.
  mini: {
    onState: (callback) => listen('mini:state', callback),
    dispatch: (action) => ipcRenderer.send('mini:action', action),
    command: (command) => ipcRenderer.send('mini:command', command),
    hide: () => ipcRenderer.send('mini:hide'),
    ready: () => ipcRenderer.send('mini:ready'),
  },
});
