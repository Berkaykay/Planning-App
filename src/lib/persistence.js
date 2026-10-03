// Talks to the Electron main process (see electron/preload.cjs). When the UI is opened in
// a plain browser during development, it falls back to localStorage.
const KEY = 'planner-data';
const bridge = typeof window !== 'undefined' ? window.planner : undefined;

export async function loadData() {
  if (bridge) return bridge.load();
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveData(data) {
  if (bridge) return bridge.save(data);
  localStorage.setItem(KEY, JSON.stringify(data));
  return Promise.resolve(true);
}

export const onAppCommand = (callback) => (bridge ? bridge.onCommand(callback) : () => {});

export const dataInfo = () => (bridge ? bridge.dataInfo() : Promise.resolve({ file: 'localStorage', dir: '', backups: [] }));
export const openDataFolder = () => bridge?.openDataFolder();

// Writes `data` to a backup file chosen by the user. Resolves with the path, or null if cancelled.
export function exportData(data) {
  if (bridge) return bridge.exportData(data);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'planner-backup.json' });
  a.click();
  URL.revokeObjectURL(url);
  return Promise.resolve('planner-backup.json');
}

// Resolves with { data, path }, { error } or null if cancelled.
export const importData = () => (bridge ? bridge.importData() : Promise.resolve(null));

// Settings the main process acts on: tray, keep running, start at login, menu entry, updates.
export const applyAppSettings = (settings) => bridge?.applySettings?.(settings);
export const showMainWindow = () => bridge?.showWindow?.();
// Changes sent from the tray popup: { action } to apply, or { command } to run.
export const onRemote = (callback) => bridge?.onRemote?.(callback) ?? (() => {});

const noUpdates = { state: 'unsupported', message: 'Updates are checked in the installed app.' };
export const updates = {
  check: () => bridge?.updates?.check() ?? Promise.resolve(noUpdates),
  download: () => bridge?.updates?.download() ?? Promise.resolve(noUpdates),
  status: () => bridge?.updates?.status() ?? Promise.resolve(noUpdates),
  openPage: () => bridge?.updates?.openPage(),
  onStatus: (callback) => bridge?.updates?.onStatus(callback) ?? (() => {}),
};

// Imported notification sounds (file names in the data folder's sounds/ folder).
export const sounds = {
  list: () => bridge?.sounds?.list() ?? Promise.resolve([]),
  import: () => bridge?.sounds?.import() ?? Promise.resolve({ added: [], skipped: [], list: [] }),
  remove: (name) => bridge?.sounds?.remove(name) ?? Promise.resolve([]),
};

export const miniBridge = bridge?.mini ?? null;
export const appVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '');
