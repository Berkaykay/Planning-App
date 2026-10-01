import { test, expect } from '@playwright/test';
import { launchApp, tempDataDir, readData } from './helpers.js';
import { addDays, todayKey, formatLong } from '../../src/lib/dates.js';

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

async function expectCrossedOut(locator, crossed) {
  const decoration = await locator.evaluate((el) => getComputedStyle(el).textDecorationLine);
  expect(decoration.includes('line-through')).toBe(crossed);
}

async function openToday() {
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();
  await expect(page.getByTestId('day-heading')).toHaveText(formatLong(todayKey()));
}

test('create, rename, select and delete categories from the sidebar', async () => {
  await sidebar().getByRole('button', { name: 'Add category' }).click();
  await sidebar().getByLabel('Category name').fill('Study');
  await sidebar().getByLabel('Category name').press('Enter');
  await expect(sidebar().getByRole('link', { name: /Study/ })).toBeVisible();

  // Duplicate names are rejected.
  await sidebar().getByRole('button', { name: 'Add category' }).click();
  await sidebar().getByLabel('Category name').fill('study');
  await sidebar().getByLabel('Category name').press('Enter');
  await expect(sidebar().getByRole('alert')).toContainText('already exists');
  await sidebar().getByLabel('Category name').press('Escape');

  await sidebar().getByRole('button', { name: 'Rename Study' }).click();
  await sidebar().getByLabel('Category name').fill('Learning');
  await sidebar().getByLabel('Category name').press('Enter');
  await expect(sidebar().getByRole('link', { name: /Learning/ })).toBeVisible();

  // Selecting a category opens its page and highlights it.
  await sidebar().getByRole('link', { name: /Learning/ }).click();
  await expect(page.getByTestId('page').getByRole('heading', { level: 1 })).toHaveText('Learning');
  await expect(page.getByLabel('Address')).toHaveValue(/^planner:\/\/category\//);
  await expect(page.getByTestId('category-row').filter({ hasText: 'Learning' })).toHaveClass(/selected/);

  // A plan assigned to the category is kept (uncategorized) when the category is deleted.
  await page.getByRole('button', { name: '+ Add plan' }).click();
  await dialog().getByLabel('Title').fill('Read chapter 3');
  await expect(dialog().getByLabel('Category')).toHaveValue(/.+/);
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect(plan('Read chapter 3')).toContainText('Learning');

  await sidebar().getByRole('button', { name: 'Delete Learning' }).click();
  await expect(dialog()).toContainText('1 plan will be kept, without a category');
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await expect(sidebar().getByRole('link', { name: /Learning/ })).toHaveCount(0);
  await expect(page.getByTestId('page').getByRole('heading', { level: 1 })).toHaveText('Categories');
  // There is no "Uncategorized" entry; the plan simply has no category now.
  await expect(sidebar().getByText('Uncategorized')).toHaveCount(0);
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await expect(plan('Read chapter 3')).toBeVisible();
  await expect(plan('Read chapter 3').locator('.chip')).toHaveCount(0);
});

test('daily and hourly plans: add, complete, undo, edit, move and delete', async () => {
  await openToday();

  // Whole-day plan via quick add.
  await page.getByLabel('Add a plan for the whole day and press Enter').fill('Plan the week');
  await page.getByLabel('Add a plan for the whole day and press Enter').press('Enter');
  await expect(page.getByTestId('all-day-zone').getByTestId('plan')).toHaveText(/Plan the week/);

  // Hourly plan with a category via the dialog.
  await page.getByRole('button', { name: 'Add plan at 09:00' }).click();
  await expect(dialog().getByLabel('All day')).not.toBeChecked();
  await expect(dialog().getByLabel('Start time')).toHaveValue('09:00');
  await dialog().getByLabel('Title').fill('Team standup');
  await dialog().getByLabel('Notes').click();
  await page.keyboard.type('Room 4');
  await expect(dialog().getByLabel('Notes')).toHaveValue('Room 4');
  await dialog().getByLabel('Category').selectOption({ label: 'Work' });
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect(page.getByTestId('hour-9').getByTestId('plan')).toContainText('Team standup');
  await expect(plan('Team standup')).toContainText('Work');
  await expect(plan('Team standup')).toContainText('Room 4');

  // Complete -> crossed out; undo -> not crossed out.
  await check('Team standup').click();
  await expect(check('Team standup')).toHaveAttribute('aria-checked', 'true');
  await expect(plan('Team standup')).toHaveClass(/done/);
  await expectCrossedOut(plan('Team standup').locator('.plan-title'), true);
  await expect(page.getByText('1 of 2 plans done')).toBeVisible();
  await check('Team standup').click();
  await expect(check('Team standup')).toHaveAttribute('aria-checked', 'false');
  await expectCrossedOut(plan('Team standup').locator('.plan-title'), false);

  // Edit: rename and reschedule to 14:00.
  await page.getByRole('button', { name: 'Edit "Team standup"' }).click();
  await dialog().getByLabel('Title').fill('Team sync');
  await dialog().getByLabel('Start time').fill('14:15');
  await dialog().getByLabel('End time').fill('15:00');
  await dialog().getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('hour-14').getByTestId('plan')).toContainText('Team sync');
  await expect(page.getByTestId('hour-14').getByTestId('plan')).toContainText('14:15–15:00');
  await expect(page.getByTestId('hour-9').getByTestId('plan')).toHaveCount(0);

  // Drag and drop to another hour, and from the all-day section into an hour.
  await plan('Team sync').dragTo(page.getByTestId('hour-16'));
  await expect(page.getByTestId('hour-16').getByTestId('plan')).toContainText('Team sync');
  // Dragging keeps the minutes and the length.
  await expect(page.getByTestId('hour-16').getByTestId('plan')).toContainText('16:15–17:00');
  await plan('Plan the week').dragTo(page.getByTestId('hour-8'));
  await expect(page.getByTestId('hour-8').getByTestId('plan')).toContainText('Plan the week');

  // Complete it, then move it to tomorrow: it stays completed on the new date.
  await check('Team sync').click();
  await page.getByRole('button', { name: 'Edit "Team sync"' }).click();
  await dialog().getByLabel('Date').fill(addDays(todayKey(), 1));
  await dialog().getByRole('button', { name: 'Save' }).click();
  await expect(plan('Team sync')).toHaveCount(0);
  await page.getByRole('link', { name: 'Next day' }).click();
  await expect(page.getByTestId('day-heading')).toHaveText(formatLong(addDays(todayKey(), 1)));
  await expect(check('Team sync')).toHaveAttribute('aria-checked', 'true');

  // Delete (with confirmation).
  await page.getByRole('button', { name: 'Delete "Team sync"' }).click();
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await expect(plan('Team sync')).toHaveCount(0);

  const data = readData(dataDir);
  expect(data.plans.map((p) => p.title)).toEqual(['Plan the week']);
  expect(data.plans[0].hour).toBe(8);
});

test('whole days can be marked complete and undone', async () => {
  await openToday();
  await page.getByLabel('Add a plan for the whole day and press Enter').fill('Groceries');
  await page.getByLabel('Add a plan for the whole day and press Enter').press('Enter');

  const dayCheck = page.getByRole('checkbox', { name: 'Mark whole day complete' });
  await dayCheck.click();
  await expect(dayCheck).toHaveAttribute('aria-checked', 'true');
  await expectCrossedOut(page.getByTestId('day-heading'), true);
  await expect(page.getByText('Day complete')).toBeVisible();
  // Completing the day completes its plans too.
  await expect(check('Groceries')).toHaveAttribute('aria-checked', 'true');

  // The calendar and dashboard show the completed day too.
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  await expect(page.getByTestId(`cell-${todayKey()}`)).toHaveClass(/day-done/);
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('checkbox', { name: 'Mark today complete' })).toHaveAttribute('aria-checked', 'true');

  // Undo from the dashboard.
  await page.getByRole('checkbox', { name: 'Mark today complete' }).click();
  await openToday();
  await expect(dayCheck).toHaveAttribute('aria-checked', 'false');
  await expectCrossedOut(page.getByTestId('day-heading'), false);
  await expect(check('Groceries')).toHaveAttribute('aria-checked', 'false');

  // Checking every plan completes the day; unchecking one reopens it.
  await check('Groceries').click();
  await expect(dayCheck).toHaveAttribute('aria-checked', 'true');
  await check('Groceries').click();
  await expect(dayCheck).toHaveAttribute('aria-checked', 'false');
});

test('repeating plans get a fresh check mark each day and keep history', async () => {
  await openToday();
  await page.getByRole('button', { name: '+ New plan' }).click();
  await dialog().getByLabel('Title').fill('Meditate');
  await dialog().getByLabel('All day').uncheck();
  await dialog().getByLabel('Start time').fill('07:00');
  await dialog().getByLabel('Repeat').selectOption('daily');
  await expect(dialog()).toContainText('Every day');
  await dialog().getByRole('button', { name: 'Add plan' }).click();

  await check('Meditate').click();
  await expect(check('Meditate')).toHaveAttribute('aria-checked', 'true');

  // Tomorrow it shows up again, unchecked.
  await page.getByRole('link', { name: 'Next day' }).click();
  await expect(check('Meditate')).toHaveAttribute('aria-checked', 'false');

  // Delete only tomorrow's occurrence.
  await page.getByRole('button', { name: 'Delete "Meditate"' }).click();
  await dialog().getByRole('button', { name: 'Only this day' }).click();
  await expect(plan('Meditate')).toHaveCount(0);
  await page.getByRole('link', { name: 'Next day' }).click();
  await expect(check('Meditate')).toHaveAttribute('aria-checked', 'false');

  // Back in history to today: still checked.
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('day-heading')).toHaveText(formatLong(todayKey()));
  await expect(check('Meditate')).toHaveAttribute('aria-checked', 'true');

  // Dashboard tracker shows today as done.
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('tracker')).toContainText('Meditate');
  await expect(page.getByRole('button', { name: `Meditate on ${todayKey()}: hit` })).toBeVisible();

  // Edit only one occurrence: moves that day to 18:00, the series stays at 07:00.
  await openToday();
  await page.getByRole('button', { name: 'Edit "Meditate"' }).click();
  await dialog().getByLabel(/^Only /).check();
  await dialog().getByLabel('Start time').fill('18:00');
  await dialog().getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('hour-18').getByTestId('plan')).toContainText('Meditate');
  await expect(check('Meditate')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('link', { name: 'Next day' }).click();
  await page.getByRole('link', { name: 'Next day' }).click();
  await expect(page.getByTestId('hour-7').getByTestId('plan')).toContainText('Meditate');
});

test('browser-like tabs, history and address bar', async () => {
  const tabs = page.getByTestId('tab');
  await expect(tabs).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();

  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  await sidebar().getByRole('link', { name: 'Categories' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Address')).toHaveValue('planner://calendar');
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(page.getByLabel('Address')).toHaveValue('planner://categories');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.getByLabel('Address')).toHaveValue('planner://calendar');

  // New tab has its own history.
  await page.getByRole('button', { name: 'New tab' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Address')).toHaveValue('planner://dashboard');
  await expect(page.getByRole('button', { name: 'Back' })).toBeDisabled();

  // Typing an address navigates.
  await page.getByLabel('Address').fill('planner://day/2026-12-25');
  await page.getByLabel('Address').press('Enter');
  await expect(page.getByTestId('day-heading')).toHaveText('Friday, December 25, 2026');
  await expect(tabs.nth(1)).toContainText('Fri, Dec 25');
  await page.getByLabel('Address').fill('planner://nowhere');
  await page.getByLabel('Address').press('Enter');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  // Switching back to the first tab restores its page.
  await tabs.nth(0).click();
  await expect(page.getByLabel('Address')).toHaveValue('planner://calendar');

  // Ctrl+click on a calendar day opens it in a background tab.
  await page.getByTestId(`cell-${todayKey()}`).click({ modifiers: ['Control'] });
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toContainText('Today');

  // Keyboard shortcuts: Ctrl+T opens, Ctrl+W closes, Ctrl+Tab cycles.
  await page.keyboard.press('Control+t');
  await expect(tabs).toHaveCount(4);
  await page.keyboard.press('Control+w');
  await expect(tabs).toHaveCount(3);
  await page.keyboard.press('Control+Tab');
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /Close tab/ }).first().click();
  await expect(tabs).toHaveCount(2);
});

test('everything persists after closing and reopening the app', async () => {
  await sidebar().getByRole('button', { name: 'Add category' }).click();
  await sidebar().getByLabel('Category name').fill('Garden');
  await sidebar().getByLabel('Category name').press('Enter');

  await openToday();
  await page.getByRole('button', { name: 'Add plan at 10:00' }).click();
  await dialog().getByLabel('Title').fill('Water the plants');
  await dialog().getByLabel('Category').selectOption({ label: 'Garden' });
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  // Checking the day's only plan also completes the day.
  await check('Water the plants').click();
  await expect(page.getByRole('checkbox', { name: 'Mark whole day complete' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'New tab' }).click();
  await sidebar().getByRole('link', { name: 'Calendar' }).click();

  await expect.poll(() => readData(dataDir).session.tabs.length).toBe(2);
  await expect.poll(() => readData(dataDir).days[todayKey()]?.done).toBe(true);
  await app.close();

  ({ app, page } = await launchApp(dataDir));
  await expect(page.getByTestId('tab')).toHaveCount(2);
  await expect(page.getByLabel('Address')).toHaveValue('planner://calendar');
  await expect(sidebar().getByRole('link', { name: /Garden/ })).toBeVisible();
  await page.getByTestId('tab').nth(0).click();
  await expect(page.getByTestId('day-heading')).toHaveText(formatLong(todayKey()));
  await expect(check('Water the plants')).toHaveAttribute('aria-checked', 'true');
  await expect(plan('Water the plants')).toContainText('Garden');
  await expect(page.getByRole('checkbox', { name: 'Mark whole day complete' })).toHaveAttribute('aria-checked', 'true');
  // Back history survives the restart too.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Address')).toHaveValue('planner://dashboard');
});
