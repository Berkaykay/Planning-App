import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.js';
import { plansOn, isDone } from '../lib/recurrence.js';
import { addDays, formatHour, formatLong, isDateKey, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import PlanItem, { PLAN_DRAG_TYPE } from '../components/PlanItem.jsx';
import Check from '../components/Check.jsx';
import Link from '../components/Link.jsx';
import { usePlanActions } from '../components/planActions.jsx';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function DayPlanner({ date }) {
  const { state, dispatch, navigate, today } = useApp();
  const actions = usePlanActions();
  const gridRef = useRef(null);
  const plans = plansOn(state.plans, date);
  const allDay = plans.filter((p) => p.hour === null);
  const doneCount = plans.filter((p) => isDone(p, date)).length;
  const dayDone = Boolean(state.days[date]?.done);
  const nowHour = new Date().getHours();

  // Start scrolled so the first relevant hour is visible: for today, the current hour or an
  // earlier unfinished plan; for other days, the first plan or 08:00.
  useEffect(() => {
    const hours = plans.filter((p) => p.hour !== null && (date !== today || !isDone(p, date))).map((p) => p.hour);
    const first = Math.min(date === today ? Math.max(0, nowHour - 1) : 8, ...hours);
    const grid = gridRef.current;
    const row = grid?.querySelector(`[data-hour="${first}"]`);
    if (row) grid.scrollTop = row.offsetTop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dropTo = (hour) => (payload) => {
    const plan = state.plans.find((p) => p.id === payload.id);
    if (plan) actions.move(plan, payload.date, { date, hour });
  };

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

      <section className="all-day">
        <DropZone onDropPlan={dropTo(null)} className="all-day-zone" testId="all-day-zone">
          <div className="section-label">All day</div>
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
        {HOURS.map((hour) => {
          const items = plans.filter((p) => p.hour === hour);
          return (
            <DropZone
              key={hour}
              onDropPlan={dropTo(hour)}
              className={`hour-row ${date === today && hour === nowHour ? 'now' : ''}`}
              testId={`hour-${hour}`}
              dataHour={hour}
            >
              <div className="hour-label">{formatHour(hour)}</div>
              <div className="hour-plans" onClick={(e) => e.target === e.currentTarget && actions.create({ date, hour })}>
                {items.map((p) => (
                  <PlanItem key={p.id} plan={p} date={date} />
                ))}
                <button
                  className="hour-add"
                  aria-label={`Add plan at ${formatHour(hour)}`}
                  onClick={() => actions.create({ date, hour })}
                >
                  + Add at {formatHour(hour)}
                </button>
              </div>
            </DropZone>
          );
        })}
      </section>
    </div>
  );
}

function DropZone({ onDropPlan, className, children, testId, dataHour }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className} ${over ? 'drop-target' : ''}`}
      data-testid={testId}
      data-hour={dataHour}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(PLAN_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const data = e.dataTransfer.getData(PLAN_DRAG_TYPE);
        if (!data) return;
        e.preventDefault();
        onDropPlan(JSON.parse(data));
      }}
    >
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
