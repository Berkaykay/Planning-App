import { test, expect } from '@playwright/test';
import { launchApp, tempDataDir, readData, pointerDrag } from './helpers.js';
import { addDays, todayKey, weekday, formatLong } from '../../src/lib/dates.js';

let app;
let page;
let dataDir;

test.beforeEach(async () => {
  dataDir = tempDataDir();
  ({ app, page } = await launchApp(dataDir));
});

test.afterEach(async () => {
  await app?.close();
});

const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const check = (title) => page.getByRole('checkbox', { name: `Mark "${title}" complete` });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const tabTitles = () => page.getByTestId('tab').locator('.tab-title').allTextContents();

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

// First Monday on or after today, so the test works on any day of the week.
function nextMonday() {
  let date = todayKey();
  while (weekday(date) !== 1) date = addDays(date, 1);
  return date;
}

test('the top "+ New plan" button works on every page (no blank screen)', async () => {
  for (const link of ['Dashboard', 'Calendar', 'Categories', 'Timetable']) {
    await sidebar().getByRole('link', { name: link }).click();
    await page.getByRole('button', { name: '+ New plan' }).click();
    await expect(dialog()).toBeVisible();
    await expect(dialog().getByLabel('Date')).toHaveValue(todayKey());
    await dialog().getByRole('button', { name: 'Cancel' }).click();
  }
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: '+ New plan' }).click();
  await dialog().getByLabel('Title').fill('Call grandma');
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect(plan('Call grandma')).toBeVisible();
});

test('timetable: set up weekly lessons once, they repeat with their own check marks', async () => {
  await sidebar().getByRole('link', { name: 'Timetable' }).click();
  await expect(page.getByRole('heading', { name: 'Timetable' })).toBeVisible();

  // Default lesson times are pre-filled; change the first lesson's start and the end follows.
  await expect(page.getByLabel('Lesson 1 start')).toHaveValue('08:30');
  await expect(page.getByLabel('Lesson 1 end')).toHaveValue('09:10');
  await expect(page.getByLabel('Lesson 2 start')).toHaveValue('09:20');

  // Monday: Math, Physics. Enter moves down to the next lesson.
  await page.getByLabel('Mon lesson 1').fill('Math');
  await page.getByLabel('Mon lesson 1').press('Enter');
  await expect(page.getByLabel('Mon lesson 2')).toBeFocused();
  await page.keyboard.type('Physics');
  // Copy Monday to Tuesday, then change one Tuesday lesson.
  await page.getByRole('button', { name: 'Copy Mon to Tue' }).click();
  await expect(page.getByLabel('Tue lesson 2')).toHaveValue('Physics');
  await page.getByLabel('Tue lesson 2').fill('History');
  await page.getByLabel('Fri lesson 3').fill('Art');
  await expect(page.getByText('5 lessons per week')).toBeVisible();

  await page.getByRole('button', { name: 'Save timetable' }).click();
  await expect(page.getByRole('status')).toContainText('5 lessons now repeat every week');
  await expect(page.getByRole('button', { name: 'Save timetable' })).toBeDisabled();
  // A "School" category was created for the lessons.
  await expect(sidebar().getByRole('link', { name: /School/ })).toBeVisible();

  // Lessons show in their own strip, not as plans.
  const lesson = (title) => page.getByTestId('lessons').getByRole('checkbox', { name: new RegExp(`^${title} `) });
  const monday = nextMonday();
  await goTo(`planner://day/${monday}`);
  await expect(lesson('Math')).toContainText('08:30–09:10');
  await expect(lesson('Physics')).toContainText('09:20–10:00');
  await expect(page.getByTestId('plan')).toHaveCount(0);
  await lesson('Math').click();
  await expect(lesson('Math')).toHaveAttribute('aria-checked', 'true');

  // The next Monday has the same lessons, unchecked.
  await goTo(`planner://day/${addDays(monday, 7)}`);
  await expect(lesson('Math')).toHaveAttribute('aria-checked', 'false');
  // Tuesday has its own lessons.
  await goTo(`planner://day/${addDays(monday, 1)}`);
  await expect(lesson('History')).toBeVisible();
  await expect(lesson('Physics')).toHaveCount(0);

  // Editing the timetable later keeps check marks.
  await sidebar().getByRole('link', { name: 'Timetable' }).click();
  await expect(page.getByLabel('Mon lesson 2')).toHaveValue('Physics');
  await page.getByLabel('Mon lesson 2').fill('Chemistry');
  await expect(page.getByText('unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save timetable' }).click();
  await goTo(`planner://day/${monday}`);
  await expect(lesson('Math')).toHaveAttribute('aria-checked', 'true');
  await expect(lesson('Chemistry')).toBeVisible();
  await expect(lesson('Physics')).toHaveCount(0);

  // Deleting the timetable removes its lessons.
  await sidebar().getByRole('link', { name: 'Timetable' }).click();
  await page.getByRole('button', { name: 'Delete timetable' }).click();
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await goTo(`planner://day/${monday}`);
  await expect(page.getByTestId('lessons')).toHaveCount(0);
  expect(readData(dataDir).timetables).toEqual([]);
});

test('calendar: selecting a day shows its plans beside the calendar, with month stats', async () => {
  const today = todayKey();
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();
  await page.getByLabel('Add a plan for the whole day and press Enter').fill('Laundry');
  await page.getByLabel('Add a plan for the whole day and press Enter').press('Enter');

  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  const panel = page.getByTestId('selected-day');
  await expect(panel.getByRole('heading')).toHaveText(formatLong(today));
  await expect(panel.getByTestId('plan')).toContainText('Laundry');
  await expect(page.getByTestId(`cell-${today}`)).toHaveAttribute('aria-selected', 'true');

  // Complete the plan and the day from the panel.
  await panel.getByRole('checkbox', { name: 'Mark "Laundry" complete' }).click();
  await expect(page.getByTestId(`cell-${today}`).locator('.cell-count')).toHaveText('1/1');
  await panel.getByRole('checkbox', { name: `Mark ${today} complete` }).click();
  await expect(page.getByTestId(`cell-${today}`)).toHaveClass(/day-done/);
  const stats = page.getByTestId('month-stats');
  await expect(stats).toContainText('Days completed1');
  await expect(stats).toContainText('100%');

  // Select another day and add a plan to it without leaving the calendar.
  const other = addDays(today, 1);
  await page.getByTestId(`cell-${other}`).click();
  await expect(panel.getByRole('heading')).toHaveText(formatLong(other));
  await panel.getByRole('textbox').fill('Dentist');
  await panel.getByRole('textbox').press('Enter');
  await expect(panel.getByTestId('plan')).toContainText('Dentist');
  await expect(page.getByLabel('Address')).toHaveValue(/^planner:\/\/calendar/);

  // Double-click opens the Day Planner.
  await page.getByTestId(`cell-${other}`).dblclick();
  await expect(page.getByTestId('day-heading')).toHaveText(formatLong(other));
  await expect(plan('Dentist')).toBeVisible();
});

test('tabs can be reordered by dragging, and theme and tab order persist', async () => {
  const tabs = page.getByTestId('tab');
  await page.getByRole('button', { name: 'New tab' }).click();
  await sidebar().getByRole('link', { name: 'Categories' }).click();
  await page.getByRole('button', { name: 'New tab' }).click();
  await sidebar().getByRole('link', { name: 'Timetable' }).click();
  expect(await tabTitles()).toEqual(['Dashboard', 'Categories', 'Timetable']);

  // Drag tabs along the strip, like in a browser.
  const center = async (i) => {
    await page.waitForTimeout(300); // let the previous drop finish gliding into place
    const b = await tabs.nth(i).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const first = await center(0);
  await pointerDrag(page, await center(2), { x: first.x - 40, y: first.y });
  await expect.poll(tabTitles).toEqual(['Timetable', 'Dashboard', 'Categories']);
  await pointerDrag(page, await center(0), { x: (await center(2)).x + 40, y: first.y });
  await expect.poll(tabTitles).toEqual(['Dashboard', 'Categories', 'Timetable']);
  await pointerDrag(page, await center(2), { x: (await center(1)).x - 30, y: first.y });
  await expect.poll(tabTitles).toEqual(['Dashboard', 'Timetable', 'Categories']);

  const theme = page.getByRole('radiogroup', { name: 'Theme' });
  await theme.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await expect.poll(() => readData(dataDir).settings.theme).toBe('light');
  await app.close();
  ({ app, page } = await launchApp(dataDir));
  expect(await tabTitles()).toEqual(['Dashboard', 'Timetable', 'Categories']);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
});
