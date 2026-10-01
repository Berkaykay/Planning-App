// In-app "addresses". Every page has a path such as `day/2026-10-01`, shown in the
// address bar as `planner://day/2026-10-01`.
import { isDateKey, isMonthKey, todayKey, monthOf, formatMedium, formatMonth } from './dates.js';

export const SCHEME = 'planner://';
export const HOME = 'dashboard';

export function parseRoute(path) {
  const clean = String(path || '').trim().replace(SCHEME, '').replace(/^\/+|\/+$/g, '');
  const [page = '', param, extra] = clean.split('/');
  if (extra !== undefined) return { page: 'notfound', path: clean };
  switch (page.toLowerCase()) {
    case '':
    case 'dashboard':
      return param === undefined ? { page: 'dashboard' } : { page: 'notfound', path: clean };
    case 'calendar':
      if (param === undefined) return { page: 'calendar', month: monthOf(todayKey()) };
      return isMonthKey(param) ? { page: 'calendar', month: param } : { page: 'notfound', path: clean };
    case 'day':
      if (param === undefined || param === 'today') return { page: 'day', date: todayKey() };
      return isDateKey(param) ? { page: 'day', date: param } : { page: 'notfound', path: clean };
    case 'categories':
      return param === undefined ? { page: 'categories' } : { page: 'notfound', path: clean };
    case 'category':
      return param ? { page: 'category', id: param } : { page: 'categories' };
    default:
      return { page: 'notfound', path: clean };
  }
}

export const paths = {
  dashboard: () => 'dashboard',
  calendar: (month) => (month ? `calendar/${month}` : 'calendar'),
  day: (date) => `day/${date}`,
  categories: () => 'categories',
  category: (id) => `category/${id}`,
};

export function routeTitle(route, categories) {
  switch (route.page) {
    case 'dashboard':
      return 'Dashboard';
    case 'calendar':
      return formatMonth(route.month);
    case 'day':
      return route.date === todayKey() ? 'Today' : formatMedium(route.date);
    case 'categories':
      return 'Categories';
    case 'category': {
      if (route.id === 'none') return 'Uncategorized';
      return categories.find((c) => c.id === route.id)?.name ?? 'Missing category';
    }
    default:
      return 'Page not found';
  }
}

export const routeIcon = (route) =>
  ({ dashboard: '◧', calendar: '▦', day: '☰', categories: '◉', category: '●' })[route.page] ?? '⚠';
