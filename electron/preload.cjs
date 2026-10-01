const { contextBridge, ipcRenderer } = require('electron');

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
  // Commands triggered from the application menu (keyboard shortcuts).
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('app:command', listener);
    return () => ipcRenderer.removeListener('app:command', listener);
  },
});
