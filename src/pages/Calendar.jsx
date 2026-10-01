import React from 'react';
import { useApp } from '../context.js';
import { plansOn, isDone } from '../lib/recurrence.js';
import { addMonths, formatMonth, fromKey, monthGrid, monthOf, WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from '../components/Link.jsx';
import Check from '../components/Check.jsx';

const MAX_VISIBLE = 3;

export default function Calendar({ month }) {
  const { state, dispatch, navigate, today } = useApp();
  const days = monthGrid(month);
  const colors = Object.fromEntries(state.categories.map((c) => [c.id, c.color]));

  const open = (date, e) => navigate(paths.day(date), { newTab: e.ctrlKey || e.metaKey, background: true });

  return (
    <div className="calendar">
      <header className="page-header row">
        <h1>{formatMonth(month)}</h1>
        <div className="day-nav">
          <Link to={paths.calendar(addMonths(month, -1))} className="button icon-only" aria-label="Previous month">
            ‹
          </Link>
          <Link to={paths.calendar(monthOf(today))} className={`button ${month === monthOf(today) ? 'current' : ''}`}>
            This month
          </Link>
          <Link to={paths.calendar(addMonths(month, 1))} className="button icon-only" aria-label="Next month">
            ›
          </Link>
        </div>
      </header>
      <div className="calendar-grid" role="grid" aria-label={formatMonth(month)}>
        {WEEKDAY_ORDER.map((d) => (
          <div key={d} className="weekday-head" role="columnheader">
            {WEEKDAY_NAMES[d]}
          </div>
        ))}
        {days.map((date) => {
          const plans = plansOn(state.plans, date);
          const done = plans.filter((p) => isDone(p, date)).length;
          const dayDone = Boolean(state.days[date]?.done);
          const classes = [
            'calendar-cell',
            monthOf(date) !== month && 'outside',
            date === today && 'today',
            dayDone && 'day-done',
            date < today && 'past',
          ].filter(Boolean);
          return (
            <div
              key={date}
              className={classes.join(' ')}
              role="gridcell"
              tabIndex={0}
              data-testid={`cell-${date}`}
              onClick={(e) => open(date, e)}
              onAuxClick={(e) => e.button === 1 && navigate(paths.day(date), { newTab: true, background: true })}
              onKeyDown={(e) => e.key === 'Enter' && open(date, e)}
            >
              <div className="cell-head">
                <span className="cell-day">{fromKey(date).getDate()}</span>
                {plans.length > 0 && (
                  <span className={`cell-count ${done === plans.length ? 'all-done' : ''}`}>
                    {done}/{plans.length}
                  </span>
                )}
                <Check
                  size="small"
                  checked={dayDone}
                  onChange={(value) => dispatch({ type: 'day/setDone', date, done: value })}
                  label={`Mark ${date} complete`}
                />
              </div>
              <ul className="cell-plans">
                {plans.slice(0, MAX_VISIBLE).map((p) => (
                  <li key={p.id} className={isDone(p, date) ? 'done' : ''} style={{ '--cat': colors[p.categoryId] ?? 'var(--muted-line)' }}>
                    {p.hour !== null && <span className="cell-time">{String(p.hour).padStart(2, '0')}</span>}
                    {p.title}
                  </li>
                ))}
                {plans.length > MAX_VISIBLE && <li className="more">+{plans.length - MAX_VISIBLE} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="hint">Click a day to open it in the Day Planner. Ctrl+click or middle-click opens it in a new tab.</p>
    </div>
  );
}
