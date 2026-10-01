import React from 'react';
import { useApp } from '../context.js';
import { lessonsOn, isDone } from '../lib/recurrence.js';
import { formatTimeRange } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from './Link.jsx';

// Today's lessons from the Timetable, shown apart from plans. Ticking a lesson marks that you
// attended; it doesn't count towards plan progress.
export default function LessonStrip({ date, compact = false }) {
  const { state, dispatch } = useApp();
  const lessons = lessonsOn(state.plans, date);
  if (!lessons.length) return null;
  const attended = lessons.filter((p) => isDone(p, date)).length;
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
          const done = isDone(p, date);
          return (
            <button
              key={p.id}
              className={`lesson ${done ? 'done' : ''}`}
              role="checkbox"
              aria-checked={done}
              aria-label={`${p.title} ${formatTimeRange(p)}`}
              title={done ? 'Attended (click to undo)' : 'Mark as attended'}
              onClick={() => dispatch({ type: 'plan/setDone', id: p.id, date, done: !done })}
            >
              <span className="lesson-time">{formatTimeRange(p)}</span>
              <span className="lesson-title">
                {p.title}
                {done && <span className="lesson-tick"> ✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
