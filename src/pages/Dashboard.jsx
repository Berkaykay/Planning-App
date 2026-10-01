import React from 'react';
import { useApp } from '../context.js';
import { tasksOn, isDone, dayProgress, isLesson, unfinishedPlans, categoryStats, lessonsOn } from '../lib/recurrence.js';
import { addDays, formatLong, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import PlanItem from '../components/PlanItem.jsx';
import Check from '../components/Check.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import LessonStrip from '../components/LessonStrip.jsx';
import { Progress, QuickAdd } from './DayPlanner.jsx';

const MAX_UNFINISHED = 5;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { state, dispatch, today } = useApp();
  const todays = tasksOn(state.plans, today);
  const done = todays.filter((p) => isDone(p, today)).length;
  const dayDone = Boolean(state.days[today]?.done);
  const routines = state.plans.filter(
    (p) => p.repeat && !isLesson(p) && (!p.repeat.until || p.repeat.until >= today) && p.date <= today,
  );
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>{greeting()}</h1>
        <div className="subtle">{formatLong(today)}</div>
      </header>

      <div className="cards">
        <section className={`card today-card ${dayDone ? 'day-done' : ''}`}>
          <div className="card-head">
            <Check checked={dayDone} onChange={(v) => dispatch({ type: 'day/setDone', date: today, done: v })} label="Mark today complete" />
            <h2 className="day-heading">Today</h2>
            <span className="subtle">
              {done}/{todays.length} done
            </span>
            <Link to={paths.day(today)} className="card-link">
              Open planner →
            </Link>
          </div>
          <Progress done={done} total={todays.length} />
          <div className="plan-list">
            {todays.length === 0 && <p className="empty">Nothing planned for today yet.</p>}
            {todays.map((p) => (
              <PlanItem key={p.id} plan={p} date={today} />
            ))}
          </div>
          <QuickAdd
            placeholder="Add a plan for today"
            onAdd={(title) => dispatch({ type: 'plan/add', plan: { id: newId(), title, date: today, hour: null } })}
          />
          <LessonStrip date={today} compact />
        </section>

        <div className="dashboard-side">
          <Unfinished />

          <section className="card">
            <div className="card-head">
              <h2>Next 7 days</h2>
              <Link to={paths.calendar()} className="card-link">
                Calendar →
              </Link>
            </div>
            <ul className="upcoming">
              {upcoming.map((date) => {
                const { total, done: d } = dayProgress(state.plans, date);
                const titles = tasksOn(state.plans, date).map((p) => p.title);
                const lessons = lessonsOn(state.plans, date).length;
                return (
                  <li key={date} className={state.days[date]?.done ? 'day-done' : ''}>
                    <Link to={paths.day(date)} className="upcoming-day">
                      <span className="day-heading">{relativeDayLabel(date, today)}</span>
                      <span className="subtle ellipsis">
                        {titles.length ? titles.join(', ') : 'Free'}
                        {lessons > 0 && <span className="lesson-note"> · {lessons} lessons</span>}
                      </span>
                      {total > 0 && (
                        <span className="count">
                          {d}/{total}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {routines.length > 0 && (
          <section className="card wide">
            <div className="card-head">
              <h2>Routines</h2>
            </div>
            {routines.map((p) => (
              <RepeatTracker key={p.id} plan={p} />
            ))}
          </section>
        )}

        <section className="card wide">
          <div className="card-head">
            <h2>Categories</h2>
            <Link to={paths.categories()} className="card-link">
              Manage →
            </Link>
          </div>
          <div className="category-tiles">
            {state.categories.map((c) => (
              <CategoryTile key={c.id} category={c} todays={todays} />
            ))}
            {state.categories.length === 0 && <p className="empty">No categories yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function CategoryTile({ category, todays }) {
  const { state, today } = useApp();
  const stats = categoryStats(state.plans, category.id, today);
  const todayCount = todays.filter((p) => p.categoryId === category.id).length;
  const lessonCount = lessonsOn(state.plans, today).filter((p) => p.categoryId === category.id).length;
  const week = stats.thisWeek;
  return (
    <Link to={paths.category(category.id)} className="category-tile" style={{ '--cat': category.color }} title={category.description || category.name}>
      <span className="tile-icon" aria-hidden>
        {category.icon || category.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="tile-body">
        <span className="tile-name">{category.name}</span>
        <span className="subtle">
          {todayCount ? `${todayCount} today` : lessonCount ? '' : 'Nothing today'}
          {lessonCount > 0 && `${todayCount ? ' · ' : ''}${lessonCount} lesson${lessonCount === 1 ? '' : 's'} today`}
          {week.total > 0 && ` · ${week.done}/${week.total} this week`}
        </span>
        <span className="tile-bar">
          <span style={{ width: `${week.total ? (week.done / week.total) * 100 : 0}%` }} />
        </span>
      </span>
    </Link>
  );
}

// Plans from recent days that were never finished, with a quick way to bring them to today.
function Unfinished() {
  const { state, dispatch, today } = useApp();
  const list = unfinishedPlans(state.plans, today);
  if (!list.length) return null;
  return (
    <section className="card unfinished" data-testid="unfinished">
      <div className="card-head">
        <h2>Unfinished</h2>
        <span className="subtle">{list.length} from past days</span>
        <button className="link-button card-link" onClick={() => dispatch({ type: 'plans/moveToDate', ids: list.map((p) => p.id), date: today })}>
          Move all to today
        </button>
      </div>
      <div className="plan-list">
        {list.slice(0, MAX_UNFINISHED).map((p) => (
          <div key={p.id} className="unfinished-row">
            <PlanItem plan={p} date={p.date} showDate showTime={false} />
            <button className="small-button" onClick={() => dispatch({ type: 'plans/moveToDate', ids: [p.id], date: today })}>
              Move to today
            </button>
          </div>
        ))}
      </div>
      {list.length > MAX_UNFINISHED && (
        <Link to={paths.history()} className="card-link more-link">
          See all in History →
        </Link>
      )}
    </section>
  );
}
