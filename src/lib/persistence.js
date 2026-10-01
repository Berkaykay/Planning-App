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
