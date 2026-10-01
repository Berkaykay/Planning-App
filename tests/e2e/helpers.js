import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
}

// Launches the real Electron app with its data stored in `dataDir`.
export async function launchApp(dataDir, env = {}) {
  const args = ['.'];
  // Chromium's sandbox is unavailable when running as root or on CI runners.
  if (process.getuid?.() === 0 || process.env.CI) args.push('--no-sandbox');
  const app = await electron.launch({ args, env: { ...process.env, PLANNER_DATA_DIR: dataDir, ...env } });
  const page = await app.firstWindow();
  await page.waitForSelector('.app');
  return { app, page };
}

export const writeData = (dataDir, data) => fs.writeFileSync(path.join(dataDir, 'planner-data.json'), JSON.stringify(data));

// Drags with real pointer movements (like a person would), in small steps.
export async function pointerDrag(page, from, to, { steps = 12 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
}

export const readData = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'planner-data.json'), 'utf8'));
