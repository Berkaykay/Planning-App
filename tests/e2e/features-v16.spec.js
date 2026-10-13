import { test, expect } from '@playwright/test';
import fs from 'node:fs';
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
const tomorrow = addDays(today, 1);
const P = (o) => ({ notes: '', categoryId: null, hour: null, repeat: null, doneDates: [], skipDates: [], ...o });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const menuItem = (name) => page.getByRole('menuitem', { name });

async function start(data, env = {}) {
  dataDir = tempDataDir();
  if (data) writeData(dataDir, data);
  ({ app, page } = await launchApp(dataDir, env));
}

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-home-'));
  const appImage = path.join(home, 'Apps', 'Cadence-1.6.0-linux.AppImage');
  fs.mkdirSync(path.dirname(appImage));
  fs.writeFileSync(appImage, '');
  return { home, appImage, env: { XDG_DATA_HOME: path.join(home, 'data'), XDG_CONFIG_HOME: path.join(home, 'config'), APPIMAGE: appImage } };
}

test('the app is called Cadence: title, cadence:// addresses (old planner:// still work), and old Planner data moves over', async () => {
  const legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'Planner-'));
  fs.writeFileSync(path.join(legacy, 'planner-data.json'), JSON.stringify(normalizeData({ plans: [P({ id: 'old', title: 'From Planner', date: today })] })));
  dataDir = path.join(tempDataDir(), 'Cadence');
  ({ app, page } = await launchApp(dataDir, { CADENCE_LEGACY_DATA_DIR: legacy }));
  expect(await page.title()).toBe('Cadence');
  await expect(plan('From Planner')).toBeVisible();
  expect(fs.existsSync(path.join(dataDir, 'cadence-data.json'))).toBe(true);
  await expect(page.getByLabel('Address')).toHaveValue('cadence://dashboard');
  await goTo('planner://settings');
  await expect(page.getByLabel('Address')).toHaveValue('cadence://settings');
  // The in-app logo is the mark without its blue tile.
  await expect(page.locator('.titlebar .app-logo svg')).toBeVisible();
  await expect(page.locator('.titlebar img')).toHaveCount(0);
});

test('lessons can go back to "not set" after a mistaken click', async () => {
  let data = normalizeData({ categories: [{ id: 'okul', name: 'Okul', color: '#4f9d7e' }] });
  const wd = weekday(today);
  data = reducer(data, {
    type: 'timetable/save',
    timetable: { id: 'tt', name: 'Okul', categoryId: 'okul', weekdays: [wd], periods: [{ id: 'late', start: '23:58', end: '23:59' }], cells: { [`${wd}:late`]: 'Fizik' }, startDate: today },
  });
  await start(data);
  const lesson = page.getByTestId('lessons').getByRole('checkbox', { name: /^Fizik / });
  await expect(lesson).toHaveAttribute('aria-checked', 'false');
  await lesson.click();
  await expect(lesson).toHaveAttribute('aria-checked', 'true');
  await expect(lesson).toHaveClass(/marked/);
  // Clicking again goes back to automatic (still to come, so not attended).
  await lesson.click();
  await expect(lesson).toHaveAttribute('aria-checked', 'false');
  await expect(lesson).not.toHaveClass(/absent|marked/);
  // The right-click menu has all three.
  await lesson.click({ button: 'right' });
  await menuItem('Absent').click();
  await expect(lesson).toHaveClass(/absent/);
  await lesson.click({ button: 'right' });
  await menuItem('Not set (automatic)').click();
  await expect(lesson).not.toHaveClass(/absent|marked/);
  await expect.poll(() => readData(dataDir).plans.find((p) => p.title === 'Fizik')).toMatchObject({ doneDates: [], absentDates: [] });
});

test('Calendar and Week headers line up exactly', async () => {
  await start();
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  const thisMonth = await page.getByRole('link', { name: 'This month' }).boundingBox();
  const weekView = await page.getByRole('link', { name: 'Week view' }).boundingBox();
  await page.getByRole('link', { name: 'Week view' }).click();
  // The week view scrolls itself to 07:00; the header must stay put anyway.
  await expect.poll(() => page.locator('.page').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const thisWeek = await page.getByRole('link', { name: 'This week' }).boundingBox();
  const monthView = await page.getByRole('link', { name: 'Month view' }).boundingBox();
  expect(thisWeek.y).toBeCloseTo(thisMonth.y, 0);
  expect(thisWeek.height).toBeCloseTo(thisMonth.height, 0);
  expect(monthView.y).toBeCloseTo(weekView.y, 0);
  expect(monthView.height).toBeCloseTo(weekView.height, 0);
});

test('special days: a birthday shows as a ticket on the calendar and everywhere else, but never as a plan', async () => {
  await start(normalizeData({ categories: [{ id: 'fam', name: 'Family', color: '#cf6b8f' }], plans: [P({ id: 'p', title: 'Buy a cake', date: tomorrow })] }));
  await goTo(`cadence://calendar/${tomorrow}`);
  await page.getByTestId(`cell-${tomorrow}`).click({ button: 'right' });
  await menuItem('Add special day…').click();
  await expect(dialog().getByLabel('Special day date')).toHaveValue(tomorrow);
  await dialog().getByLabel('Special day name').fill("Mom's birthday");
  await dialog().getByLabel('Special day date').fill(`1974-${tomorrow.slice(5)}`);
  await dialog().getByLabel('Special day category').selectOption('fam');
  await dialog().getByRole('button', { name: 'Add special day' }).click();
  const age = Number(tomorrow.slice(0, 4)) - 1974;

  const cell = page.getByTestId(`cell-${tomorrow}`);
  await expect(cell.getByTestId('special-ticket')).toContainText("Mom's birthday");
  await expect(cell.getByTestId('special-ticket')).toContainText('🎂');
  // Not a plan: the day still has one plan.
  await expect(cell.locator('.cell-count')).toHaveText('0/1');
  await expect(page.getByTestId('day-specials')).toContainText(`turns ${age}`);

  await goTo(`cadence://day/${tomorrow}`);
  await expect(page.getByTestId('special-banner')).toContainText(`Mom's birthday · turns ${age}`);
  await expect(page.getByText('0 of 1 plans done')).toBeVisible();

  await goTo('cadence://dashboard');
  const comingUp = page.getByTestId('coming-up');
  await expect(comingUp).toContainText("Mom's birthday");
  await expect(comingUp).toContainText('Tomorrow');

  await page.keyboard.press('Control+k');
  await page.getByLabel('Search pages, plans and deadlines').fill('mom');
  await expect(page.getByRole('option').first()).toContainText('Special day');
  await page.keyboard.press('Escape');

  await expect.poll(() => readData(dataDir).specialDays).toMatchObject([{ title: "Mom's birthday", kind: 'birthday', year: 1974, yearly: true, categoryId: 'fam' }]);
});

test('"Ask before deleting" can be turned off; Ctrl+Z still brings things back', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Throwaway', date: today })] }));
  await page.getByRole('button', { name: 'Delete "Throwaway"' }).click();
  await expect(dialog()).toBeVisible();
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  await goTo('cadence://settings');
  await page.getByLabel('Ask before deleting').uncheck();
  await goTo('cadence://dashboard');
  await page.getByRole('button', { name: 'Delete "Throwaway"' }).click();
  await expect(dialog()).toHaveCount(0);
  await expect(plan('Throwaway')).toHaveCount(0);
  await page.locator('.page').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(plan('Throwaway')).toBeVisible();
});

test('habits: weekdays and count goals, tapping up and down, the grid and the dashboard card', async () => {
  await start();
  await sidebar().getByRole('link', { name: 'Habits' }).click();
  await page.getByRole('button', { name: '+ New habit' }).click();
  await dialog().getByLabel('Habit name').fill('Water');
  await dialog().getByLabel('Habit emoji').fill('💧');
  await dialog().getByLabel('Times per day').fill('3');
  await dialog().getByRole('button', { name: 'Add habit' }).click();
  // A second habit only on another weekday than today.
  const other = (weekday(today) + 1) % 7;
  await page.getByRole('button', { name: '+ New habit' }).click();
  await dialog().getByLabel('Habit name').fill('Gym');
  await dialog().getByRole('group', { name: 'Habit days' }).locator('button').nth([1, 2, 3, 4, 5, 6, 0].indexOf(other)).click();
  await dialog().getByRole('button', { name: 'Add habit' }).click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);
  await expect(page.getByTestId(`habit-cell-Gym-${today}`)).toBeDisabled();

  // Count Water up in the grid, and down with a right-click.
  const cell = page.getByTestId(`habit-cell-Water-${today}`);
  await cell.click();
  await cell.click();
  await expect(cell).toHaveText('2');
  await cell.click({ button: 'right' });
  await expect(cell).toHaveText('1');

  // The Dashboard card shows today's habits only.
  await goTo('cadence://dashboard');
  const card = page.getByTestId('habits-today');
  await expect(card.getByTestId('habit-button')).toHaveCount(1);
  const water = card.getByRole('button', { name: /^Water/ });
  await expect(water).toContainText('1/3');
  await water.click();
  await water.click();
  await expect(water).toContainText('3/3');
  await expect(water).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => Object.values(readData(dataDir).habitLog[today] ?? {})).toEqual([3]);
  // Its streak shows on the Habits page.
  await goTo('cadence://habits');
  await expect(page.getByTestId('habit-streak').first()).toContainText('🔥 1');
});

test('tray popup: top bar, Add deadline under quick add, tomorrow and coming up, focus timer, stuck at the tray', async () => {
  const { env } = fakeHome();
  await start(
    normalizeData({
      plans: [P({ id: 'a', title: 'Groceries', date: today }), P({ id: 't', title: 'Dentist', date: tomorrow, hour: 9 })],
      specialDays: [{ id: 's', title: 'Anniversary', kind: 'anniversary', month: Number(tomorrow.slice(5, 7)), day: Number(tomorrow.slice(8)), year: 2016 }],
      settings: { background: { tray: true } },
    }),
    { ...env, PLANNER_TEST_FAKE_TRAY: '1', PLANNER_TEST_KEEP_MINI: '1', CADENCE_TEST_FOCUS_SECONDS: '2' },
  );
  await page.evaluate(() => {
    window.__notes = [];
    window.Notification = class {
      constructor(title, options) {
        window.__notes.push(`${title}: ${options.body}`);
      }
    };
  });
  const [mini] = await Promise.all([app.waitForEvent('window'), app.evaluate(() => globalThis.plannerTest.tray.showMini())]);
  await mini.waitForSelector('[data-testid="mini-dashboard"]');

  // Top bar with "Open Cadence"; "Add deadline" right under the quick-add box.
  const open = mini.getByRole('button', { name: 'Open Cadence' });
  const top = await open.boundingBox();
  expect(top.y).toBeLessThan(40);
  const add = await mini.getByLabel('Add a plan for today').boundingBox();
  const deadline = await mini.getByRole('button', { name: '⚑ Add deadline' }).boundingBox();
  expect(deadline.y).toBeGreaterThan(add.y + add.height - 1);
  expect(deadline.y - (add.y + add.height)).toBeLessThan(30);

  await expect(mini.getByTestId('mini-tomorrow')).toContainText('Dentist');
  await expect(mini.getByTestId('mini-tomorrow')).toContainText('Anniversary');
  const years = Number(tomorrow.slice(0, 4)) - 2016;
  await expect(mini.getByTestId('mini-coming-up')).toContainText(`Anniversary · ${years} years`);

  // It can't be dragged away, and it sits in the bottom-right corner against the (bottom) panel.
  const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('mini=1'));
    return { movable: w.isMovable(), bounds: w.getBounds(), area: screen.getPrimaryDisplay().workArea };
  });
  // (Windows honors "not movable"; on Linux the popup simply has nowhere to grab it.)
  if (process.platform !== 'linux') expect(geometry.movable).toBe(false);
  await expect(mini.locator('.mini-top')).not.toHaveCSS('-webkit-app-region', 'drag');
  expect(geometry.area.x + geometry.area.width - (geometry.bounds.x + geometry.bounds.width)).toBeLessThanOrEqual(8);
  expect(geometry.area.y + geometry.area.height - (geometry.bounds.y + geometry.bounds.height)).toBeLessThanOrEqual(8);

  // Focus timer (2 seconds in the tests): start it; when it ends the main window notifies.
  await mini.getByRole('button', { name: 'Start' }).click();
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(mini.getByTestId('focus-time')).toHaveText('Done! 🎉', { timeout: 6000 });
  await expect.poll(() => page.evaluate(() => window.__notes)).toEqual([expect.stringMatching(/^Focus time is over/)]);

  // "Open Cadence" brings up the main window.
  await open.click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => !x.webContents.getURL().includes('mini=1')).isVisible())).toBe(true);
});

test('Linux menu entry: cadence.desktop with the full icon path, and the old Planner entries removed', async () => {
  const { appImage, env } = fakeHome();
  const oldEntry = path.join(env.XDG_DATA_HOME, 'applications', 'planner.desktop');
  const oldAutostart = path.join(env.XDG_CONFIG_HOME, 'autostart', 'planner.desktop');
  for (const f of [oldEntry, oldAutostart]) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '[Desktop Entry]\nName=Planner\n');
  }
  await start(null, env);
  const entry = fs.readFileSync(path.join(env.XDG_DATA_HOME, 'applications', 'cadence.desktop'), 'utf8');
  const icon = path.join(env.XDG_DATA_HOME, 'icons', 'hicolor', '512x512', 'apps', 'cadence.png');
  expect(entry).toContain('Name=Cadence');
  expect(entry).toContain(`Icon=${icon}`);
  expect(entry).toContain(`Exec="${appImage}" %U`);
  expect(fs.existsSync(icon)).toBe(true);
  expect(fs.existsSync(oldEntry) || fs.existsSync(oldAutostart)).toBe(false);
});
