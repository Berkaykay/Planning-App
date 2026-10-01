import React, { useRef, useState } from 'react';
import { useApp } from '../context.js';
import { deadlinesDueOn, tasksOn, isDone } from '../lib/recurrence.js';
import { addDays, formatLong, formatTime, isDateKey, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import PlanItem from '../components/PlanItem.jsx';
import { dropAttr } from '../components/dragDrop.jsx';
import Check from '../components/Check.jsx';
import Link from '../components/Link.jsx';
import LessonStrip from '../components/LessonStrip.jsx';
import { DeadlineItem, DueSoonBar } from '../components/deadlineActions.jsx';
import { usePlanActions } from '../components/planActions.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function DayPlanner({ date }) {
  const { state, dispatch, navigate, today, menu } = useApp();
  const actions = usePlanActions();
  const gridRef = useRef(null);
  // Lessons are listed separately (LessonStrip) and don't count as plans.
  const plans = tasksOn(state.plans, date);
  const allDay = plans.filter((p) => p.hour === null);
  const doneCount = plans.filter((p) => isDone(p, date)).length;
  const dayDone = Boolean(state.days[date]?.done);
  // Deadlines due on this day are listed with the day's all-day plans (and not in "Due soon").
  const dueHere = deadlinesDueOn(state.deadlines, date);
  const nowHour = new Date().getHours();

  // The page opens at the top; "Now" scrolls the current hour to about a third of the way down.
  const scrollToNow = () => {
    const row = gridRef.current?.querySelector(`[data-hour="${nowHour}"]`);
    const page = gridRef.current?.closest('.page');
    if (!row || !page) return;
    const top = page.scrollTop + row.getBoundingClientRect().top - page.getBoundingClientRect().top - page.clientHeight / 3;
    page.scrollTo({ top, behavior: 'smooth' });
  };

  // One line per hour, plus a line of its own for every other start time in use (e.g. 03:05).
  const rows = [];
  for (const hour of HOURS) {
    rows.push({ hour, minute: 0 });
    const minutes = [...new Set(plans.filter((p) => p.hour === hour && p.minute > 0).map((p) => p.minute))].sort((a, b) => a - b);
    for (const minute of minutes) rows.push({ hour, minute });
  }

  const hourMenu = (e, hour, minute = 0) =>
    menu.open(e, [
      { label: `Add plan at ${formatTime(hour, minute)}`, onSelect: () => actions.create({ date, hour, minute }) },
      { label: 'Add all-day plan', onSelect: () => actions.create({ date }) },
      null,
      { label: dayDone ? 'Mark day as not complete' : 'Mark day complete', onSelect: () => dispatch({ type: 'day/setDone', date, done: !dayDone }) },
      { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => dispatch({ type: 'history/undo' }) },
    ]);

  return (
    <div className={`day-planner ${dayDone ? 'day-done' : ''}`}>
      <header className="page-header">
        <div className="day-nav">
          <Link to={paths.day(addDays(date, -1))} className="button icon-only" title="Previous day" aria-label="Previous day">
            ‹
          </Link>
          <Link to={paths.day(today)} className={`button ${date === today ? 'current' : ''}`}>
            Today
          </Link>
          <Link to={paths.day(addDays(date, 1))} className="button icon-only" title="Next day" aria-label="Next day">
            ›
          </Link>
          <input
            type="date"
            aria-label="Go to date"
            value={date}
            onChange={(e) => isDateKey(e.target.value) && navigate(paths.day(e.target.value))}
          />
          {date === today && (
            <button className="button" title="Scroll to the current hour" onClick={scrollToNow}>
              Now
            </button>
          )}
        </div>
        <div className="day-title">
          <Check
            size="large"
            checked={dayDone}
            onChange={(done) => dispatch({ type: 'day/setDone', date, done })}
            label="Mark whole day complete"
          />
          <div>
            <h1 className="day-heading" data-testid="day-heading">
              {formatLong(date)}
            </h1>
            <div className="subtle">
              {relativeDayLabel(date, today)} · {plans.length ? `${doneCount} of ${plans.length} plans done` : 'No plans yet'}
              {dayDone && <span className="badge success">Day complete</span>}
            </div>
          </div>
        </div>
        <Progress done={doneCount} total={plans.length} />
      </header>

      <DueSoonBar date={date} />
      <LessonStrip date={date} />

      <section className="all-day">
        <DropZone target={{ kind: 'slot', date, hour: null }} className="all-day-zone" testId="all-day-zone">
          <div className="section-label">All day</div>
          {dueHere.length > 0 && (
            <div className="plan-list due-here" data-testid="due-here" aria-label="Deadlines due this day">
              {dueHere.map((d) => (
                <DeadlineItem key={d.id} deadline={d} />
              ))}
            </div>
          )}
          <div className="plan-list">
            {allDay.map((p) => (
              <PlanItem key={p.id} plan={p} date={date} showTime={false} />
            ))}
          </div>
          <QuickAdd
            placeholder="Add a plan for the whole day and press Enter"
            onAdd={(title) => dispatch({ type: 'plan/add', plan: { id: newId(), title, date, hour: null } })}
          />
        </DropZone>
      </section>

      <section className="hour-grid" ref={gridRef} aria-label="Hourly schedule">
        {rows.map(({ hour, minute }) => {
          // Plans at the same time sit side by side.
          const items = plans.filter((p) => p.hour === hour && p.minute === minute);
          const label = formatTime(hour, minute);
          return (
            <DropZone
              key={`${hour}:${minute}`}
              target={{ kind: 'slot', date, hour, minute }}
              onContextMenu={(e) => hourMenu(e, hour, minute)}
              className={`hour-row ${minute ? 'minute-row' : ''} ${date === today && hour === nowHour && !minute ? 'now' : ''}`}
              testId={minute ? `time-${label.replace(':', '-')}` : `hour-${hour}`}
              dataHour={minute ? undefined : hour}
            >
              <div className="hour-label">{label}</div>
              <div className="hour-plans" onClick={(e) => e.target === e.currentTarget && actions.create({ date, hour, minute })}>
                {items.map((p) => (
                  <PlanItem key={p.id} plan={p} date={date} />
                ))}
                <button className="hour-add" aria-label={`Add plan at ${label}`} onClick={() => actions.create({ date, hour, minute })}>
                  + Add at {label}
                </button>
              </div>
            </DropZone>
          );
        })}
      </section>
    </div>
  );
}

// A place a dragged plan can be dropped (see components/dragDrop.jsx).
function DropZone({ target, className, children, testId, dataHour, onContextMenu }) {
  return (
    <div className={className} data-testid={testId} data-hour={dataHour} data-drop={dropAttr(target)} onContextMenu={onContextMenu}>
      {children}
    </div>
  );
}

export function QuickAdd({ placeholder, onAdd }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value.trim());
        setValue('');
      }}
    >
      <span aria-hidden>+</span>
      <input aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  );
}

export function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress" title={`${done}/${total} done`} aria-label={`${pct}% done`}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
