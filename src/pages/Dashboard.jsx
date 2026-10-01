import React from 'react';
import { useApp } from '../context.js';
import { plansOn, isDone, dayProgress } from '../lib/recurrence.js';
import { addDays, formatLong, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import PlanItem from '../components/PlanItem.jsx';
import Check from '../components/Check.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import { Progress, QuickAdd } from './DayPlanner.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { state, dispatch, today } = useApp();
  const todays = plansOn(state.plans, today);
  const done = todays.filter((p) => isDone(p, today)).length;
  const dayDone = Boolean(state.days[today]?.done);
  const repeating = state.plans.filter((p) => p.repeat && (!p.repeat.until || p.repeat.until >= today) && p.date <= today);
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
        </section>

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
              const titles = plansOn(state.plans, date).map((p) => p.title);
              return (
                <li key={date} className={state.days[date]?.done ? 'day-done' : ''}>
                  <Link to={paths.day(date)} className="upcoming-day">
                    <span className="day-heading">{relativeDayLabel(date, today)}</span>
                    <span className="subtle ellipsis">{titles.length ? titles.join(', ') : 'Free'}</span>
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

        <section className="card wide">
          <div className="card-head">
            <h2>Repeating plans</h2>
            <span className="subtle">Check marks reset each time a plan comes around; past days are kept as history.</span>
          </div>
          {repeating.length === 0 ? (
            <p className="empty">
              No repeating plans yet. Set <strong>Repeat</strong> to daily, weekly or monthly when creating a plan to track
              routines.
            </p>
          ) : (
            repeating.map((p) => <RepeatTracker key={p.id} plan={p} />)
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Categories</h2>
            <Link to={paths.categories()} className="card-link">
              Manage →
            </Link>
          </div>
          <ul className="category-summary">
            {state.categories.map((c) => {
              const todayCount = todays.filter((p) => p.categoryId === c.id).length;
              return (
                <li key={c.id}>
                  <Link to={paths.category(c.id)}>
                    <span className="dot" style={{ background: c.color }} />
                    {c.name}
                    <span className="subtle">{todayCount ? `${todayCount} today` : ''}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
