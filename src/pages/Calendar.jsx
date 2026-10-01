import React, { useRef, useState } from 'react';
import { useApp } from '../context.js';
import { tasksOn, isDone, monthStats } from '../lib/recurrence.js';
import {
  addMonths,
  formatLong,
  formatMedium,
  formatMonth,
  fromKey,
  monthGrid,
  monthOf,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
} from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import Link from '../components/Link.jsx';
import Check, { DayStamp } from '../components/Check.jsx';
import PlanItem from '../components/PlanItem.jsx';
import LessonStrip from '../components/LessonStrip.jsx';
import { Progress, QuickAdd } from './DayPlanner.jsx';

const MAX_DOTS = 6;

export default function Calendar({ month }) {
  const { state, navigate, today } = useApp();
  // Clicking a day selects it and shows it in the side panel; double-click opens the Day Planner.
  const [selected, setSelected] = useState(monthOf(today) === month ? today : `${month}-01`);
  // Stamps only animate for days completed while this page is open.
  const doneOnOpen = useRef(new Set(Object.keys(state.days)));
  const days = monthGrid(month);
  const colors = Object.fromEntries(state.categories.map((c) => [c.id, c.color]));

  const openDay = (date, e) =>
    navigate(paths.day(date), { newTab: Boolean(e?.ctrlKey || e?.metaKey), background: true });

  return (
    <div className="calendar-page">
      <header className="month-header">
        <div className="month-nav">
          <Link to={paths.calendar(addMonths(month, -1))} className="button icon-only" aria-label="Previous month" title="Previous month">
            ‹
          </Link>
          <h1>{formatMonth(month)}</h1>
          <Link to={paths.calendar(addMonths(month, 1))} className="button icon-only" aria-label="Next month" title="Next month">
            ›
          </Link>
          <Link to={paths.calendar(monthOf(today))} className={`button this-month ${month === monthOf(today) ? 'current' : ''}`}>
            This month
          </Link>
        </div>
      </header>

      <div className="calendar-top">
        <div className="calendar-column">
          <div
            className="calendar-grid"
            role="grid"
            aria-label={formatMonth(month)}
            title="Click a day to see it on the right. Double-click opens it in the Day Planner; Ctrl+click opens it in a new tab."
          >
            {WEEKDAY_ORDER.map((d) => (
              <div key={d} className="weekday-head" role="columnheader">
                {WEEKDAY_NAMES[d]}
              </div>
            ))}
            {days.map((date) => {
              const plans = tasksOn(state.plans, date);
              const done = plans.filter((p) => isDone(p, date)).length;
              const dayDone = Boolean(state.days[date]?.done);
              const classes = [
                'calendar-cell',
                monthOf(date) !== month && 'outside',
                date === today && 'today',
                date === selected && 'selected',
                dayDone && 'day-done',
              ].filter(Boolean);
              return (
                <div
                  key={date}
                  className={classes.join(' ')}
                  role="gridcell"
                  aria-selected={date === selected}
                  aria-label={`${formatLong(date)}: ${plans.length ? `${done} of ${plans.length} plans done` : 'no plans'}${dayDone ? ', day complete' : ''}`}
                  tabIndex={0}
                  data-testid={`cell-${date}`}
                  onClick={(e) => (e.ctrlKey || e.metaKey ? openDay(date, e) : setSelected(date))}
                  onDoubleClick={() => openDay(date)}
                  onAuxClick={(e) => e.button === 1 && openDay(date, { ctrlKey: true })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openDay(date, e);
                    if (e.key === ' ') {
                      e.preventDefault();
                      setSelected(date);
                    }
                  }}
                >
                  <div className="cell-head">
                    <span className="cell-day">{fromKey(date).getDate()}</span>
                    {plans.length > 0 && (
                      <span className={`cell-count ${done === plans.length ? 'all-done' : ''}`}>
                        {done}/{plans.length}
                      </span>
                    )}
                  </div>
                  {dayDone && <DayStamp animate={!doneOnOpen.current.has(date)} />}
                  {/* One dot per plan (faded when done), in its category color. */}
                  <span className="cell-dots" aria-hidden>
                    {plans.slice(0, MAX_DOTS).map((p) => (
                      <span
                        key={p.id}
                        className={`dot ${isDone(p, date) ? 'dot-done' : ''}`}
                        style={{ background: colors[p.categoryId] ?? 'var(--muted)' }}
                      />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <SelectedDay date={selected} onOpen={() => openDay(selected)} />
      </div>

      <MonthStats month={month} />
    </div>
  );
}

function SelectedDay({ date, onOpen }) {
  const { state, dispatch, today } = useApp();
  const plans = tasksOn(state.plans, date);
  const todo = plans.filter((p) => !isDone(p, date));
  const completed = plans.filter((p) => isDone(p, date));
  const dayDone = Boolean(state.days[date]?.done);
  return (
    <section className={`card selected-day ${dayDone ? 'day-done' : ''}`} aria-label="Selected day" data-testid="selected-day">
      <div className="card-head">
        <Check checked={dayDone} onChange={(value) => dispatch({ type: 'day/setDone', date, done: value })} label={`Mark ${date} complete`} />
        <div className="selected-title">
          <h2 className="day-heading">{formatLong(date)}</h2>
          <span className="subtle">
            {date === today ? 'Today · ' : ''}
            {plans.length ? `${completed.length} of ${plans.length} done` : 'No plans'}
          </span>
        </div>
      </div>
      {plans.length > 0 && <Progress done={completed.length} total={plans.length} />}
      <div className="selected-body">
        <LessonStrip date={date} compact />
        {todo.length > 0 && (
          <div className="plan-group" data-testid="todo">
            <div className="section-label">To do · {todo.length}</div>
            <div className="plan-list">
              {todo.map((p) => (
                <PlanItem key={p.id} plan={p} date={date} />
              ))}
            </div>
          </div>
        )}
        {completed.length > 0 && (
          <div className="plan-group" data-testid="completed">
            <div className="section-label">Completed · {completed.length}</div>
            <div className="plan-list">
              {completed.map((p) => (
                <PlanItem key={p.id} plan={p} date={date} />
              ))}
            </div>
          </div>
        )}
        <QuickAdd
          placeholder={`Add a plan for ${formatMedium(date)}`}
          onAdd={(title) => dispatch({ type: 'plan/add', plan: { id: newId(), title, date, hour: null } })}
        />
      </div>
      <button className="link-button open-day" onClick={onOpen}>
        Open in Day Planner →
      </button>
    </section>
  );
}

function MonthStats({ month }) {
  const { state, today } = useApp();
  const s = monthStats(state.plans, state.days, month, today);
  const pct = s.plansTotal ? Math.round((s.plansDone / s.plansTotal) * 100) : 0;
  return (
    <section className="card month-stats" aria-label="Month stats" data-testid="month-stats">
      <h2>This month</h2>
      <dl className="stats">
        <div>
          <dt>Days completed</dt>
          <dd>
            {s.daysDone}
            <small> / {s.daysElapsed || '–'}</small>
          </dd>
        </div>
        <div>
          <dt>Plans done</dt>
          <dd>
            {s.plansTotal ? `${pct}%` : '–'}
            <small>
              {' '}
              {s.plansDone}/{s.plansTotal}
            </small>
          </dd>
        </div>
        <div>
          <dt>Longest streak</dt>
          <dd>
            {s.bestStreak}
            <small> day{s.bestStreak === 1 ? '' : 's'}</small>
          </dd>
        </div>
        <div>
          <dt>Busiest day</dt>
          <dd className="busiest">
            {s.busiest ? formatMedium(s.busiest) : '–'}
            {s.busiest && <small> {s.busiestCount} plans</small>}
          </dd>
        </div>
      </dl>
      <Progress done={s.plansDone} total={s.plansTotal} />
    </section>
  );
}
