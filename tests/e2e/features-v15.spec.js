import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { launchApp, tempDataDir, readData, writeData } from './helpers.js';
import { addDays, todayKey, weekday } from '../../src/lib/dates.js';
import { normalizeData, reducer } from '../../src/lib/store.js';

let app;
let page;
let dataDir;

test.afterEach(async () => {
  await app?.close();
  app = null;
});

const today = todayKey();
const P = (o) => ({ notes: '', categoryId: null, hour: null, repeat: null, doneDates: [], skipDates: [], ...o });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const okul = { id: 'okul', name: 'Okul', icon: '🏫', color: '#4f9d7e' };

// A temporary home for files the app writes outside its data folder (menu entry, autostart).
function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-home-'));
  const appImage = path.join(home, 'Apps', 'Planner.AppImage');
  fs.mkdirSync(path.dirname(appImage));
  fs.writeFileSync(appImage, '');
  return { home, appImage, env: { XDG_DATA_HOME: path.join(home, 'data'), XDG_CONFIG_HOME: path.join(home, 'config'), APPIMAGE: appImage } };
}

async function start(data, env = {}) {
  dataDir = tempDataDir();
  if (data) writeData(dataDir, data);
  ({ app, page } = await launchApp(dataDir, env));
}

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

// Captures notifications instead of showing them.
async function captureNotifications() {
  await page.evaluate(() => {
    window.__notes = [];
    window.Notification = class {
      constructor(title, options) {
        window.__notes.push(`${title}: ${options.body}`);
      }
    };
  });
}

// A short silent WAV file.
function wavFile(file) {
  const samples = 800;
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples * 2, 40);
  fs.writeFileSync(file, b);
  return file;
}

test('Ctrl+K quick search: find plans, pages and deadlines, open in this or a new tab', async () => {
  await start(
    normalizeData({
      categories: [okul],
      plans: [P({ id: 'a', title: 'Physics revision', date: addDays(today, 2), hour: 14, minute: 0, categoryId: 'okul' })],
      deadlines: [{ id: 'd', title: 'Physics report', due: addDays(today, 5) }],
    }),
  );
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Search pages, plans and deadlines' });
  await expect(box).toBeFocused();
  await box.fill('phys');
  const options = page.getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText('Physics revision');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Quick search' })).toHaveCount(0);
  await expect(page.getByLabel('Address')).toHaveValue(`planner://day/${addDays(today, 2)}`);

  // Ctrl+Enter opens in a new tab.
  await page.keyboard.press('Control+k');
  await box.fill('settings');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('tab')).toHaveCount(2);

  // A deadline opens its day in the calendar; a date opens that day; Esc closes.
  await page.keyboard.press('Control+k');
  await box.fill('report');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(`cell-${addDays(today, 5)}`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+k');
  await box.fill('2026-12-24');
  await expect(page.getByRole('option').first()).toContainText('Thursday, December 24, 2026');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Quick search' })).toHaveCount(0);

  // Actions: "New deadline…".
  await page.keyboard.press('Control+k');
  await box.fill('new dead');
  await page.keyboard.press('Enter');
  await expect(dialog().getByLabel('Deadline title')).toBeVisible();
});

test('homework from a lesson: due at the next lesson of that subject, and weekly homework repeats', async () => {
  let data = normalizeData({ categories: [okul] });
  const wd = weekday(today);
  const other = (wd % 5) + 1; // another weekday (Mon–Fri)
  data = reducer(data, {
    type: 'timetable/save',
    timetable: {
      id: 'tt',
      name: 'Okul',
      categoryId: 'okul',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      periods: [
        { id: 'p1', start: '00:00', end: '00:01' },
        { id: 'p2', start: '09:20', end: '10:00' },
      ],
      cells: { [`${wd}:p1`]: 'Fizik', [`${other}:p2`]: 'Fizik' },
      startDate: addDays(today, -30),
    },
  });
  await start(data);
  const nextDate = [...Array(8).keys()].map((i) => addDays(today, i + 1)).find((d) => weekday(d) === other || weekday(d) === wd);
  const nextTime = weekday(nextDate) === other ? '09:20' : '00:00';

  await page.getByTestId('lessons').getByRole('button', { name: '+ Homework' }).first().click();
  await expect(dialog().getByLabel('Deadline title')).toHaveValue('Fizik homework');
  await expect(dialog().getByLabel('Due date')).toHaveValue(nextDate);
  await expect(dialog().getByLabel('Due time')).toHaveValue(nextTime);
  await expect(dialog().getByLabel('Deadline category')).toHaveValue('okul');
  await dialog().getByLabel('Repeat weekly').check();
  await dialog().getByRole('button', { name: 'Add deadline' }).click();
  await expect.poll(() => readData(dataDir).deadlines).toMatchObject([{ title: 'Fizik homework', due: nextDate, repeat: 'weekly' }]);

  // Also from the lesson's right-click menu.
  await page.getByTestId('lessons').getByRole('checkbox', { name: /^Fizik / }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add homework…' }).click();
  await expect(dialog().getByLabel('Due date')).toHaveValue(nextDate);
  await dialog().getByRole('button', { name: 'Cancel' }).click();

  // Checking a weekly homework off adds next week's.
  const card = page.getByTestId('deadlines');
  await card.getByRole('checkbox', { name: 'Mark deadline "Fizik homework" done' }).first().click();
  await expect.poll(() => readData(dataDir).deadlines.map((d) => [d.due, d.done])).toEqual([
    [nextDate, true],
    [addDays(nextDate, 7), false],
  ]);
  await expect(card.getByText('↻').first()).toBeVisible();
});

test('notifications show the category and the plan, play the chosen sound, and follow category and quiet-hour settings', async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60 * 1000);
  test.skip(soon.getDate() !== now.getDate(), 'too close to midnight');
  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sounds = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-sound-'));
  const ding = wavFile(path.join(sounds, 'ding.wav'));
  await start(normalizeData({ categories: [okul, { id: 'gym', name: 'Gym', color: '#d0715b' }] }), { PLANNER_TEST_IMPORT_SOUND: ding });

  // Import a sound and make it Okul's sound; mute Gym.
  await goTo('planner://settings');
  await page.getByRole('button', { name: '+ Add sounds…' }).click();
  await expect(page.getByRole('button', { name: 'Play ding.wav' })).toBeVisible();
  await page.getByLabel('Sound for Okul').selectOption('file:ding.wav');
  await page.getByLabel('Notifications for Gym').uncheck();
  await expect.poll(() => readData(dataDir).settings.reminders.perCategory).toMatchObject({ okul: { sound: 'file:ding.wav' }, gym: { enabled: false } });
  // The imported file is served to the page.
  const playable = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const a = new Audio('planner-sound://sounds/ding.wav');
        a.onloadedmetadata = () => resolve(true);
        a.onerror = () => resolve(false);
      }),
  );
  expect(playable).toBe(true);

  await captureNotifications();
  for (const [title, cat] of [
    ['Math prep', 'okul'],
    ['Leg day', 'gym'],
  ]) {
    await page.getByRole('button', { name: '+ New plan' }).click();
    await dialog().getByLabel('Title').fill(title);
    await dialog().getByLabel('All day').uncheck();
    await dialog().getByLabel('Start time').fill(hhmm(soon));
    await dialog().getByLabel('Category').selectOption(cat);
    await dialog().getByRole('button', { name: 'Add plan' }).click();
  }
  await expect.poll(() => page.evaluate(() => window.__notes)).toEqual([expect.stringMatching(/^Math prep: 🏫 Okul · \d\d:\d\d · starts in [45] min$/)]);
  expect(await page.evaluate(() => window.__plannerLastSound)).toBe('file:ding.wav');

  // Quiet hours around now: nothing more is announced.
  await page.getByLabel('Quiet hours', { exact: true }).check();
  await page.getByLabel('Quiet from').fill(hhmm(new Date(now.getTime() - 60 * 60 * 1000)));
  await page.getByLabel('Quiet to').fill(hhmm(new Date(now.getTime() + 60 * 60 * 1000)));
  await expect.poll(() => readData(dataDir).settings.reminders.quiet.enabled).toBe(true);
  await page.getByLabel('Notifications for Gym').check();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__notes.length)).toBe(1);
});

test('update pill: shows a newer version at the top right; Later hides it; Settings checks on request', async () => {
  let latest = '9.9.9';
  const server = http.createServer((req, res) => {
    if (!req.url.startsWith('/latest-linux.yml')) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/yaml' });
    res.end(`version: ${latest}\nfiles:\n  - url: Planner-${latest}-linux.AppImage\n    sha512: abc\n    size: 1\npath: Planner-${latest}-linux.AppImage\nsha512: abc\nreleaseDate: '2026-10-03T00:00:00.000Z'\n`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { env } = fakeHome();
  try {
    await start(null, { ...env, PLANNER_UPDATE_URL: `http://127.0.0.1:${server.address().port}` });
    const pill = page.getByTestId('update-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveText(/9\.9\.9/);
    // It sits at the right end of the tab strip.
    const box = await pill.boundingBox();
    const bar = await page.locator('.titlebar').boundingBox();
    expect(box.x).toBeGreaterThan(bar.width / 2);
    expect(box.y).toBeLessThan(bar.height);
    await pill.click();
    const pop = page.getByRole('dialog', { name: 'Update' });
    await expect(pop.getByRole('button', { name: 'Update and restart' })).toBeVisible();
    await pop.getByRole('button', { name: 'Later' }).click();
    await expect(pill).toHaveCount(0);

    latest = '0.0.1';
    await goTo('planner://settings');
    await expect(page.getByTestId('app-version')).toHaveText(/^\d+\.\d+\.\d+$/);
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByTestId('update-status')).toHaveText("You're up to date.");
  } finally {
    server.close();
  }
});

test('tray and background: keep running when closed, start at login and the applications menu entry', async () => {
  const { appImage, env } = fakeHome();
  await start(null, { ...env, PLANNER_TEST_FAKE_TRAY: '1' });
  const menuEntry = path.join(env.XDG_DATA_HOME, 'applications', 'planner.desktop');
  const autostart = path.join(env.XDG_CONFIG_HOME, 'autostart', 'planner.desktop');
  // The applications menu entry (with icon) is there from the first start.
  expect(fs.readFileSync(menuEntry, 'utf8')).toContain(`Exec="${appImage}" %U`);
  expect(fs.existsSync(path.join(env.XDG_DATA_HOME, 'icons', 'hicolor', '512x512', 'apps', 'planner.png'))).toBe(true);

  await goTo('planner://settings');
  await expect(page.getByLabel('Keep running when the window is closed')).toBeDisabled();
  await page.getByLabel('Show Planner in the system tray').check();
  await page.getByLabel('Keep running when the window is closed').check();
  await page.getByLabel('Start when I log in').check();
  await expect.poll(() => fs.existsSync(autostart)).toBe(true);
  expect(fs.readFileSync(autostart, 'utf8')).toContain(`Exec="${appImage}" --hidden %U`);

  // Closing the window only hides it; the app keeps running.
  const visible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('mini=1'))?.isVisible());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(visible).toBe(false);
  await app.evaluate(() => globalThis.plannerTest.showMain());
  await expect.poll(visible).toBe(true);

  // Turning things off removes them again.
  await page.getByLabel('Start when I log in').uncheck();
  await page.getByLabel('Add Planner to my applications menu').uncheck();
  await expect.poll(() => fs.existsSync(autostart) || fs.existsSync(menuEntry)).toBe(false);
  await page.getByLabel('Show Planner in the system tray').uncheck();
  await expect(page.getByLabel('Keep running when the window is closed')).not.toBeChecked();
});

test('tray mini dashboard: today at a glance, kept in step with the main window', async () => {
  const { env } = fakeHome();
  await start(
    normalizeData({
      categories: [okul],
      plans: [P({ id: 'a', title: 'Read chapter 4', date: today, categoryId: 'okul' }), P({ id: 'b', title: 'Groceries', date: today })],
      deadlines: [{ id: 'd', title: 'Physics report', due: addDays(today, 3) }],
      settings: { background: { tray: true } },
    }),
    { ...env, PLANNER_TEST_FAKE_TRAY: '1', PLANNER_TEST_KEEP_MINI: '1' },
  );
  const [mini] = await Promise.all([app.waitForEvent('window'), app.evaluate(() => globalThis.plannerTest.tray.showMini())]);
  await mini.waitForSelector('[data-testid="mini-dashboard"]');
  await expect(mini.getByTestId('mini-count')).toHaveText('0/2 done');
  await expect(mini.getByText('Physics report')).toBeVisible();
  await expect(mini.getByText('3 days left')).toBeVisible();

  // Checking a plan in the popup checks it in the main window (and saves it).
  await mini.getByRole('checkbox', { name: 'Mark "Groceries" complete' }).click();
  await expect(page.getByRole('checkbox', { name: 'Mark "Groceries" complete' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => readData(dataDir).plans.find((p) => p.id === 'b').doneDates).toEqual([today]);
  await expect(mini.getByTestId('mini-count')).toHaveText('1/2 done');

  // …and the other way round.
  await page.getByRole('checkbox', { name: 'Mark "Read chapter 4" complete' }).click();
  await expect(mini.getByTestId('mini-count')).toHaveText('2/2 done');
  await expect(mini.getByTestId('mini-dashboard')).toHaveClass(/all-done/);

  // Quick add from the popup.
  await mini.getByLabel('Add a plan for today').fill('Water plants');
  await mini.getByLabel('Add a plan for today').press('Enter');
  await expect(plan('Water plants')).toBeVisible();
  await expect(mini.getByTestId('mini-count')).toHaveText('2/3 done');
});

test('completing a whole day sets off a little confetti', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Only plan', date: today })] }));
  await expect(page.getByTestId('confetti')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Mark "Only plan" complete' }).click();
  await expect(page.getByTestId('confetti').locator('span').first()).toBeVisible();
  await expect(page.getByTestId('confetti')).toHaveCount(0, { timeout: 4000 });
});
