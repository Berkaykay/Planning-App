import React, { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { lessonsOn, lessonAttended } from '../lib/recurrence.js';
import { formatTimeRange } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from './Link.jsx';

// The current time, refreshed every 30 seconds.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// The day's lessons from the Timetable, shown apart from plans. A lesson counts as attended
// automatically once it's over; click one to mark yourself absent (or attended again).
export default function LessonStrip({ date, compact = false }) {
  const { state, dispatch, navigate, menu } = useApp();
  const now = useNow();
  const lessons = lessonsOn(state.plans, date);
  if (!lessons.length) return null;
  const attended = lessons.filter((p) => lessonAttended(p, date, now)).length;
  const set = (p, value) => dispatch({ type: 'lesson/setAttended', id: p.id, date, attended: value });

  return (
    <section className={`lesson-strip ${compact ? 'compact' : ''}`} aria-label="Lessons" data-testid="lessons">
      <div className="lesson-head">
        <span className="section-label">Lessons</span>
        <span className="subtle">
          {attended}/{lessons.length} attended
        </span>
        <Link to={paths.timetable()} className="card-link">
          Timetable →
        </Link>
      </div>
      <div className="lesson-list">
        {lessons.map((p) => {
          const done = lessonAttended(p, date, now);
          const absent = p.absentDates?.includes(date);
          return (
            <button
              key={p.id}
              className={`lesson ${done ? 'done' : ''} ${absent ? 'absent' : ''}`}
              role="checkbox"
              aria-checked={done}
              aria-label={`${p.title} ${formatTimeRange(p)}`}
              title={done ? 'Attended. Click if you were absent' : absent ? 'Absent. Click to mark attended' : 'Click to mark attended'}
              onClick={() => set(p, !done)}
              onContextMenu={(e) =>
                menu.open(e, [
                  { label: 'Mark attended', checked: done, onSelect: () => set(p, true) },
                  { label: 'Mark absent', checked: Boolean(absent), onSelect: () => set(p, false) },
                  null,
                  { label: 'Open Timetable', onSelect: () => navigate(paths.timetable()) },
                ])
              }
            >
              <span className="lesson-time">{formatTimeRange(p)}</span>
              <span className="lesson-title">
                {p.title}
                {done && <span className="lesson-tick"> ✓</span>}
                {absent && <span className="lesson-absent"> ✗</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
