import React, { useState } from 'react';
import { useApp } from '../context.js';
import { categoryAll, categoryStats, comparePlans, isDone, isLesson } from '../lib/recurrence.js';
import { formatShort, formatTimeRange, WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import PlanItem from '../components/PlanItem.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import { usePlanActions } from '../components/planActions.jsx';
import { useCategoryActions, CategoryNameInput } from '../components/categoryActions.jsx';
import { ColorPicker, IconPicker } from './Categories.jsx';

const byDate = (a, b) => (a.date === b.date ? comparePlans(a, b) : a.date < b.date ? -1 : 1);
const byName = (a, b) => a.title.localeCompare(b.title);

// Everything about one category: its look, how it's going, and its plans.
export default function CategoryPage({ id }) {
  const { state, dispatch, today } = useApp();
  const planActions = usePlanActions();
  const categoryActions = useCategoryActions();
  const [renaming, setRenaming] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date');

  const category = state.categories.find((c) => c.id === id);
  if (!category) {
    return (
      <div className="empty-page">
        <h1>Category not found</h1>
        <p>This category may have been deleted.</p>
        <Link to={paths.categories()} className="button primary">
          See all categories
        </Link>
      </div>
    );
  }

  const all = state.plans.filter((p) => p.categoryId === id);
  const lessons = all.filter(isLesson);
  const tasks = all.filter((p) => !isLesson(p));
  const oneOff = tasks.filter((p) => !p.repeat);
  const lists = {
    upcoming: oneOff.filter((p) => p.date >= today && !isDone(p, p.date)),
    done: oneOff.filter((p) => isDone(p, p.date)),
    missed: oneOff.filter((p) => p.date < today && !isDone(p, p.date)),
    repeating: tasks.filter((p) => p.repeat),
  };
  // "All": every plan in one list, done or not, each on its date (repeating ones on their next date).
  const allEntries = categoryAll(state.plans, id, today);
  lists.all = allEntries.map((e) => e.plan);
  const dateOf = new Map(allEntries.map((e) => [e.plan.id, e.date]));
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'done', label: 'Done' },
    { id: 'missed', label: 'Missed' },
    { id: 'repeating', label: 'Repeating' },
    ...(lessons.length ? [{ id: 'lessons', label: 'Lessons' }] : []),
  ];
  const q = query.trim().toLowerCase();
  const matches = (p) => !q || p.title.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q);
  let list = (lists[tab] ?? []).filter(matches);
  if (tab !== 'all' || sort === 'name') list = [...list].sort(sort === 'name' ? byName : byDate);
  if (tab === 'done' && sort === 'date') list.reverse();
  const stats = categoryStats(state.plans, id, today);
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.total));

  const setDescription = (description) => dispatch({ type: 'category/update', id, description });

  return (
    <div className="category-page" style={{ '--cat': category.color }}>
      <header className="category-hero">
        <button className="hero-icon" title="Change icon and color" aria-label="Change icon and color" onClick={() => setCustomizing(!customizing)}>
          {category.icon || category.name.slice(0, 1).toUpperCase()}
        </button>
        <div className="hero-text">
          {renaming ? (
            <CategoryNameInput
              initial={category.name}
              excludeId={category.id}
              onSubmit={(value) => categoryActions.rename(category.id, value) && setRenaming(false)}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h1 onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
              {category.name}
            </h1>
          )}
          <textarea
            className="hero-description"
            aria-label="Category description"
            placeholder="Add a description…"
            rows={1}
            defaultValue={category.description}
            key={category.id}
            onBlur={(e) => e.target.value !== category.description && setDescription(e.target.value)}
          />
        </div>
        <div className="header-actions">
          <button onClick={() => setCustomizing(!customizing)} aria-expanded={customizing}>
            Customize
          </button>
          <button onClick={() => setRenaming(true)}>Rename</button>
          <button className="danger" onClick={() => categoryActions.remove(category)}>
            Delete
          </button>
          <button className="primary" onClick={() => planActions.create({ categoryId: id })}>
            + Add plan
          </button>
        </div>
      </header>

      {customizing && (
        <section className="card customize-card" aria-label="Customize category">
          <div className="customize-row">
            <span className="field-label">Icon</span>
            <IconPicker value={category.icon} onChange={(icon) => dispatch({ type: 'category/update', id, icon })} />
          </div>
          <div className="customize-row">
            <span className="field-label">Color</span>
            <ColorPicker value={category.color} onChange={(c) => categoryActions.recolor(category.id, c)} custom />
          </div>
        </section>
      )}

      <section className="category-stats" aria-label="Category stats" data-testid="category-stats">
        <div className="stat">
          <span className="stat-value">{stats.rate === null ? '–' : `${stats.rate}%`}</span>
          <span className="stat-label">done (last 4 weeks)</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {stats.thisWeek.done}
            <small>/{stats.thisWeek.total}</small>
          </span>
          <span className="stat-label">this week</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.upcoming}</span>
          <span className="stat-label">upcoming</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats.repeating}</span>
          <span className="stat-label">repeating</span>
        </div>
        {lessons.length > 0 && (
          <div className="stat">
            <span className="stat-value">{lessons.length}</span>
            <span className="stat-label">weekly lessons</span>
          </div>
        )}
        <div className="stat week-chart" title="Plans done per week (last 4 weeks)">
          <div className="bars">
            {stats.weeks.map((w) => (
              <span key={w.start} className="bar" title={`Week of ${formatShort(w.start)}: ${w.done}/${w.total}`}>
                <span className="bar-total" style={{ height: `${(w.total / maxWeek) * 100}%` }}>
                  <span className="bar-done" style={{ height: `${w.total ? (w.done / w.total) * 100 : 0}%` }} />
                </span>
              </span>
            ))}
          </div>
          <span className="stat-label">last 4 weeks</span>
        </div>
      </section>

      <div className="category-toolbar">
        <div className="segmented" role="tablist" aria-label="Show">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              <span className="tab-count">{t.id === 'lessons' ? lessons.length : lists[t.id].length}</span>
            </button>
          ))}
        </div>
        <input className="search" type="search" aria-label="Search plans" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {tab !== 'lessons' && tab !== 'repeating' && (
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="date">Sort by date</option>
            <option value="name">Sort by name</option>
          </select>
        )}
      </div>

      <section className="card category-list-card" data-testid="category-list">
        {tab === 'lessons' ? (
          <LessonWeek lessons={lessons.filter(matches)} />
        ) : tab === 'repeating' ? (
          list.map((p) => <RepeatTracker key={p.id} plan={p} editable />)
        ) : (
          <div className="plan-list">
            {list.map((p) => (
              <PlanItem key={p.id} plan={p} date={dateOf.get(p.id) ?? p.date} showDate />
            ))}
          </div>
        )}
        {tab !== 'lessons' && list.length === 0 && (
          <p className="empty">
            {q ? 'No plans match your search.' : { all: 'No plans in this category yet.', upcoming: 'Nothing coming up.', done: 'Nothing completed yet.', missed: 'Nothing missed. Nice!', repeating: 'No repeating plans.' }[tab]}
          </p>
        )}
      </section>
    </div>
  );
}

// Lessons of this category laid out by weekday, like a small timetable.
function LessonWeek({ lessons }) {
  const days = WEEKDAY_ORDER.filter((d) => lessons.some((p) => p.repeat.weekdays.includes(d)));
  if (!days.length) return <p className="empty">No lessons match.</p>;
  return (
    <div className="lesson-week">
      {days.map((d) => (
        <div key={d} className="lesson-day">
          <div className="section-label">{WEEKDAY_NAMES[d]}</div>
          {lessons
            .filter((p) => p.repeat.weekdays.includes(d))
            .sort(comparePlans)
            .map((p) => (
              <div key={p.id} className="lesson-line">
                <span className="lesson-time">{formatTimeRange(p)}</span>
                <span>{p.title}</span>
              </div>
            ))}
        </div>
      ))}
      <Link to={paths.timetable()} className="card-link">
        Edit in Timetable →
      </Link>
    </div>
  );
}
