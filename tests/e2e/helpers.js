import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
}

// Launches the real Electron app with its data stored in `dataDir`.
export async function launchApp(dataDir) {
  const args = ['.'];
  // Chromium refuses to run sandboxed as root (e.g. in CI containers).
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  const app = await electron.launch({ args, env: { ...process.env, PLANNER_DATA_DIR: dataDir } });
  const page = await app.firstWindow();
  await page.waitForSelector('.app');
  return { app, page };
}

export const readData = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'planner-data.json'), 'utf8'));
