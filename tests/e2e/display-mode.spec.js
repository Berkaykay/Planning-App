import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launchApp, tempDataDir } from './helpers.js';

// Linux only: how Cadence draws its windows (see electron/display.cjs). Cadence 1.6.0 forced X11 with
// the GPU on, which crashed on startup with Nobara's Mesa drivers.
test.skip(process.platform !== 'linux', 'Linux display modes');

let app;
let page;
let dataDir;

test.afterEach(async () => {
  await app?.close();
  app = null;
});

const modeFile = () => path.join(`${dataDir}-electron`, 'display-mode');
const savedFile = () => {
  try {
    return fs.readFileSync(modeFile(), 'utf8').trim();
  } catch {
    return null;
  }
};

async function start(saved, env = {}) {
  dataDir = tempDataDir();
  if (saved) {
    fs.mkdirSync(`${dataDir}-electron`, { recursive: true });
    fs.writeFileSync(modeFile(), `${saved}\n`);
  }
  ({ app, page } = await launchApp(dataDir, env));
}

// What the app reports to Settings. (Under xvfb Electron picks X11 itself and there's no GPU, so the
// switches can't tell the modes apart here; tests/unit/display.test.js checks those.)
const display = () => page.evaluate(() => window.planner.display.get());

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

test('X11 mode by default; a saved Wayland choice or CADENCE_WAYLAND=1 is used instead', async () => {
  await start(null);
  expect(await display()).toEqual({ mode: 'x11', saved: 'x11' });
  expect(await app.evaluate(({ app }) => app.getGPUFeatureStatus().gpu_compositing)).toMatch(/^disabled/);
  await app.close();

  await start('wayland');
  expect(await display()).toEqual({ mode: 'wayland', saved: 'wayland' });
  await app.close();

  await start('x11', { CADENCE_WAYLAND: '1' });
  expect(await display()).toEqual({ mode: 'wayland', saved: 'x11' });
});

test('the Settings switch saves the choice and offers a restart', async () => {
  await start(null);
  await goTo('cadence://settings');
  const toggle = page.getByLabel('Open the tray popup right at the tray');
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('display-restart')).toHaveCount(0);

  await toggle.uncheck();
  await expect(page.getByTestId('display-restart')).toContainText('Restart Cadence to apply');
  await expect(page.getByRole('button', { name: 'Restart now' })).toBeVisible();
  await expect.poll(() => savedFile()).toBe('wayland');

  await toggle.check();
  await expect(page.getByTestId('display-restart')).toHaveCount(0);
  await expect.poll(() => savedFile()).toBe('x11');
});

test('if the graphics process crashes in X11 mode, Cadence switches to Wayland', async () => {
  await start(null, { CADENCE_TEST_NO_RELAUNCH: '1' });
  const gpu = await app.evaluate(({ app }) => app.getAppMetrics().find((m) => m.type === 'GPU')?.pid);
  test.skip(!gpu, 'no graphics process to crash');
  process.kill(gpu, 'SIGSEGV');
  await expect.poll(() => app.evaluate(() => global.cadenceFellBack === true)).toBe(true);
  expect(savedFile()).toBe('wayland');
});
