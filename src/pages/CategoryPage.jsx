import React, { useState } from 'react';
import { useApp } from '../context.js';
import { categoryStats, comparePlans, isDone, isLesson, tasksOn } from '../lib/recurrence.js';
import { formatShort, formatTimeRange, relativeDayLabel, WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import PlanItem from '../components/PlanItem.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import { usePlanActions } from '../components/planActions.jsx';
import { useCategoryActions, CategoryNameInput } from '../components/categoryActions.jsx';
import { ColorPicker, IconPicker } from './Categories.jsx';
import { DeadlineItem } from '../components/deadlineActions.jsx';

const byDate = (a, b) => (a.date === b.date ? comparePlans(a, b) : a.date < b.date ? -1 : 1);

// A titled group of items on the category page; hidden when empty.
function Section({ title, count, children, testId, collapsible = false, open = true, onToggle }) {
  if (!count) return null;
  return (
    <section className="card category-section" data-testid={testId}>
      <h2 className="section-title">
        {collapsible ? (
          <button className="link-button section-toggle" aria-expanded={open} onClick={onToggle}>
            {open ? '▾' : '▸'} {title}
          </button>
        ) : (
          title
        )}
        <span className="tab-count">{count}</span>
      </h2>
      {open && children}
    </section>
  );
}

// Everything about one category: its look, how it's going, and its plans.
export default function CategoryPage({ id }) {
  const { state, dispatch, today } = useApp();
  const planActions = usePlanActions();
  const categoryActions = useCategoryActions();
  const [renaming, setRenaming] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [query, setQuery] = useState('');
  const [showDone, setShowDone] = useState(false);

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
  const q = query.trim().toLowerCase();
  const matches = (p) => !q || p.title.toLowerCase().includes(q) || p.notes.toLowerCase().includes(q);
  const oneOff = tasks.filter((p) => !p.repeat && matches(p));
  // Everything is visible at once, organized into sections.
  const overdue = oneOff.filter((p) => p.date < today && !isDone(p, p.date)).sort(byDate);
  const todays = tasksOn(state.plans, today).filter((p) => p.categoryId === id && matches(p));
  const upcoming = oneOff.filter((p) => p.date > today && !isDone(p, p.date)).sort(byDate);
  const upcomingDates = [...new Set(upcoming.map((p) => p.date))];
  const deadlines = state.deadlines.filter((d) => d.categoryId === id && matches(d));
  const openDeadlines = deadlines.filter((d) => !d.done).sort((a, b) => (a.due < b.due ? -1 : 1));
  const repeating = tasks.filter((p) => p.repeat && matches(p));
  const shownLessons = lessons.filter(matches);
  const done = [...oneOff.filter((p) => p.date !== today && isDone(p, p.date)).sort(byDate).reverse()];
  const doneDeadlines = deadlines.filter((d) => d.done);
  const nothing = !overdue.length && !todays.length && !upcoming.length && !deadlines.length && !repeating.length && !shownLessons.length && !done.length;
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
        <input className="search" type="search" aria-label="Search plans" placeholder="Search this category…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {nothing && <p className="empty">{q ? 'Nothing matches your search.' : 'No plans in this category yet.'}</p>}

      <Section title="Overdue" count={overdue.length} testId="section-overdue">
        <div className="plan-list">
          {overdue.map((p) => (
            <PlanItem key={p.id} plan={p} date={p.date} showDate />
          ))}
        </div>
      </Section>

      <Section title="Today" count={todays.length} testId="section-today">
        <div className="plan-list">
          {todays.map((p) => (
            <PlanItem key={p.id} plan={p} date={today} />
          ))}
        </div>
      </Section>

      <Section title="Upcoming" count={upcoming.length} testId="section-upcoming">
        {upcomingDates.map((date) => (
          <div key={date} className="date-group">
            <div className="section-label">{relativeDayLabel(date, today)}</div>
            <div className="plan-list">
              {upcoming
                .filter((p) => p.date === date)
                .map((p) => (
                  <PlanItem key={p.id} plan={p} date={date} />
                ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Deadlines" count={openDeadlines.length} testId="section-deadlines">
        <div className="plan-list">
          {openDeadlines.map((d) => (
            <DeadlineItem key={d.id} deadline={d} />
          ))}
        </div>
      </Section>

      <Section title="Repeating" count={repeating.length} testId="section-repeating">
        {repeating.map((p) => (
          <RepeatTracker key={p.id} plan={p} editable />
        ))}
      </Section>

      <Section title="Lessons" count={shownLessons.length} testId="section-lessons">
        <LessonWeek lessons={shownLessons} />
      </Section>

      <Section
        title="Done"
        count={done.length + doneDeadlines.length}
        testId="section-done"
        collapsible
        open={showDone || Boolean(q)}
        onToggle={() => setShowDone(!showDone)}
      >
        <div className="plan-list">
          {done.map((p) => (
            <PlanItem key={p.id} plan={p} date={p.date} showDate />
          ))}
          {doneDeadlines.map((d) => (
            <DeadlineItem key={d.id} deadline={d} />
          ))}
        </div>
      </Section>
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
