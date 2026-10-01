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
