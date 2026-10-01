import React, { useLayoutEffect, useRef } from 'react';
import { useApp } from '../context.js';
import { isDone, lessonAttended, tasksOn, weekLayout, isLesson } from '../lib/recurrence.js';
import { DayFlag, useDeadlineActions } from '../components/deadlineActions.jsx';
import { addDays, formatHour, formatShort, formatTimeRange, formatWeekday, fromKey, monthOf, weekStart } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from '../components/Link.jsx';
import Check from '../components/Check.jsx';
import { dropAttr, useDrag } from '../components/dragDrop.jsx';
import { usePlanActions } from '../components/planActions.jsx';
import { useNow } from '../components/LessonStrip.jsx';

const HOUR_HEIGHT = 56;

// Monday-to-Sunday overview with lessons and plans laid out by time.
export default function Week({ start }) {
  const { state, dispatch, navigate, today, menu } = useApp();
  const actions = usePlanActions();
  const deadlineActions = useDeadlineActions();
  const startDrag = useDrag();
  const now = useNow();
  const { days, fromHour, toHour, firstHour } = weekLayout(state.plans, start);
  const gridRef = useRef(null);
  const firstHourRef = useRef(firstHour);
  firstHourRef.current = firstHour;
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const colors = Object.fromEntries(state.categories.map((c) => [c.id, c.color]));
  const end = addDays(start, 6);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // All 24 hours are always there. When a week opens, scroll once so 07:00 (or the earliest plan)
  // sits just under the day headers; moving plans around afterwards never scrolls or hides hours.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    const page = grid?.closest('.page');
    const label = grid?.querySelectorAll('.week-hour-label')[firstHourRef.current];
    if (!page || !label) return;
    const head = grid.querySelector('.week-day-head');
    page.scrollTop += label.getBoundingClientRect().top - page.getBoundingClientRect().top - head.offsetHeight;
    // Then line the hour up just below the (now stuck) day headers.
    page.scrollTop += label.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 4;
  }, [start]);

  const dayMenu = (e, date) => {
    const done = Boolean(state.days[date]?.done);
    menu.open(e, [
      { label: 'Open in Day Planner', onSelect: () => navigate(paths.day(date)) },
      { label: 'Open in new tab', onSelect: () => navigate(paths.day(date), { newTab: true }) },
      null,
      { label: 'Add plan…', onSelect: () => actions.create({ date }) },
      { label: 'Add deadline…', onSelect: () => deadlineActions.create({ due: date }) },
      { label: done ? 'Mark day as not complete' : 'Mark day complete', onSelect: () => dispatch({ type: 'day/setDone', date, done: !done }) },
      null,
      { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => dispatch({ type: 'history/undo' }) },
    ]);
  };

  const lessonMenu = (e, p, date, attended) =>
    menu.open(e, [
      { label: 'Mark attended', checked: attended, onSelect: () => dispatch({ type: 'lesson/setAttended', id: p.id, date, attended: true }) },
      { label: 'Mark absent', checked: !attended, onSelect: () => dispatch({ type: 'lesson/setAttended', id: p.id, date, attended: false }) },
      null,
      { label: 'Open Timetable', onSelect: () => navigate(paths.timetable()) },
    ]);

  return (
    <div className="week-page">
      <header className="month-header">
        <div className="month-nav">
          <Link to={paths.week(addDays(start, -7))} className="button icon-only" aria-label="Previous week" title="Previous week">
            ‹
          </Link>
          <h1 className="week-title">
            {formatShort(start)} – {formatShort(end)}
          </h1>
          <Link to={paths.week(addDays(start, 7))} className="button icon-only" aria-label="Next week" title="Next week">
            ›
          </Link>
          <Link to={paths.week(today)} className={`button this-month ${start === weekStart(today) ? 'current' : ''}`}>
            This week
          </Link>
          {/* Opens the month of today (when it's in this week) or of the week's Thursday, with that day selected. */}
          <Link to={paths.calendar(today >= start && today <= end ? today : addDays(start, 3))} className="button">
            Month view
          </Link>
        </div>
      </header>

      <div className="week-grid" ref={gridRef} style={{ '--hour': `${HOUR_HEIGHT}px` }} data-testid="week-grid">
        <div className="week-corner" />
        {days.map(({ date }) => {
          const tasks = tasksOn(state.plans, date);
          const done = tasks.filter((p) => isDone(p, date)).length;
          const dayDone = Boolean(state.days[date]?.done);
          return (
            <div
              key={date}
              className={`week-day-head ${date === today ? 'today' : ''} ${dayDone ? 'day-done' : ''}`}
              data-drop={dropAttr({ kind: 'day', date })}
              onContextMenu={(e) => dayMenu(e, date)}
            >
              <Link to={paths.day(date)} className="week-day-link">
                <span className="week-weekday">{formatWeekday(date)}</span>
                <span className="week-date">{fromKey(date).getDate()}</span>
              </Link>
              <span className="subtle">{tasks.length ? `${done}/${tasks.length}` : ''}</span>
              <DayFlag date={date} />
              <Check size="small" checked={dayDone} label={`Mark ${date} complete`} onChange={(v) => dispatch({ type: 'day/setDone', date, done: v })} />
            </div>
          );
        })}

        <div className="week-gutter-label">All day</div>
        {days.map(({ date, allDay }) => (
          <div key={date} className="week-allday" data-drop={dropAttr({ kind: 'slot', date, hour: null })} onDoubleClick={(e) => e.target === e.currentTarget && actions.create({ date })}>
            {allDay.map((p) => (
              <WeekPlan key={p.id} plan={p} date={date} color={colors[p.categoryId]} actions={actions} startDrag={startDrag} />
            ))}
          </div>
        ))}

        <div className="week-hours">
          {hours.map((h) => (
            <div key={h} className="week-hour-label">
              {formatHour(h)}
            </div>
          ))}
        </div>
        {days.map(({ date, blocks }) => (
          <div key={date} className={`week-column ${date === today ? 'today' : ''}`} data-testid={`week-${date}`}>
            {hours.map((h) => (
              <div
                key={h}
                className="week-slot"
                data-drop={dropAttr({ kind: 'slot', date, hour: h })}
                data-testid={`slot-${date}-${h}`}
                title={`Add a plan at ${formatHour(h)}`}
                onClick={() => actions.create({ date, hour: h })}
                onContextMenu={(e) =>
                  menu.open(e, [
                    { label: `Add plan at ${formatHour(h)}`, onSelect: () => actions.create({ date, hour: h }) },
                    { label: 'Open in Day Planner', onSelect: () => navigate(paths.day(date)) },
                  ])
                }
              />
            ))}
            {date === today && nowMinutes >= fromHour * 60 && nowMinutes < toHour * 60 && (
              <div className="week-now" style={{ top: ((nowMinutes - fromHour * 60) / 60) * HOUR_HEIGHT }} />
            )}
            {blocks.map((b) => {
              const style = {
                top: ((b.start - fromHour * 60) / 60) * HOUR_HEIGHT,
                height: Math.max(22, ((b.end - b.start) / 60) * HOUR_HEIGHT - 2),
                left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                width: `calc(${100 / b.lanes}% - 4px)`,
                '--cat': colors[b.plan.categoryId] ?? 'var(--muted)',
              };
              if (isLesson(b.plan)) {
                const attended = lessonAttended(b.plan, date, now);
                return (
                  <button
                    key={b.plan.id}
                    className={`week-block lesson-block ${attended ? 'done' : ''}`}
                    style={style}
                    title={`${b.plan.title} · ${formatTimeRange(b.plan)}${attended ? ' · attended' : ''}`}
                    onClick={() => dispatch({ type: 'lesson/setAttended', id: b.plan.id, date, attended: !attended })}
                    onContextMenu={(e) => lessonMenu(e, b.plan, date, attended)}
                  >
                    <span className="block-title">
                      {b.plan.title}
                      {attended && ' ✓'}
                    </span>
                    <span className="block-time">{formatTimeRange(b.plan)}</span>
                  </button>
                );
              }
              return (
                <div key={b.plan.id} className="week-block-wrap" style={style}>
                  <WeekPlan plan={b.plan} date={date} color={colors[b.plan.categoryId]} actions={actions} startDrag={startDrag} timed={b.end - b.start >= 40} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekPlan({ plan, date, color, actions, startDrag, timed = false }) {
  const done = isDone(plan, date);
  return (
    <div
      className={`week-block plan-block ${done ? 'done' : ''} ${timed ? 'timed' : ''}`}
      style={{ '--cat': color ?? 'var(--muted)' }}
      data-testid="week-plan"
      title={`${plan.title} · ${formatTimeRange(plan)}`}
      onPointerDown={(e) => startDrag?.(e, plan, date, plan.title)}
      onDoubleClick={() => actions.edit(plan, date)}
      onContextMenu={(e) => actions.openMenu(e, plan, date)}
    >
      <Check size="small" checked={done} label={`Mark "${plan.title}" complete`} onChange={() => actions.toggle(plan, date)} />
      <span className="block-text">
        <span className="block-title">{plan.title}</span>
        {timed && <span className="block-time">{formatTimeRange(plan)}</span>}
      </span>
    </div>
  );
}
