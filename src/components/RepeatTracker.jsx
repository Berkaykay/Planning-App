import React from 'react';
import { useApp } from '../context.js';
import { occursOn, isDone, describeRepeat, streak } from '../lib/recurrence.js';
import { addDays, formatMedium, formatWeekday } from '../lib/dates.js';
import { usePlanActions } from './planActions.jsx';

const DAYS = 14;

// History of a repeating plan over the last two weeks: one square per day.
export default function RepeatTracker({ plan, editable = false }) {
  const { today } = useApp();
  const actions = usePlanActions();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1));
  const s = streak(plan, today);
  return (
    <div className="tracker" data-testid="tracker">
      <div className="tracker-info">
        <div className="tracker-title">{plan.title}</div>
        <div className="subtle">
          ↻ {describeRepeat(plan)} · {s} day streak
        </div>
      </div>
      <div className="tracker-days">
        {dates.map((date) => {
          const scheduled = occursOn(plan, date);
          const done = scheduled && isDone(plan, date);
          const state = !scheduled ? 'off' : done ? 'hit' : date < today ? 'miss' : 'open';
          return (
            <button
              key={date}
              className={`tracker-day ${state} ${date === today ? 'today' : ''}`}
              disabled={!scheduled}
              title={`${formatMedium(date)}: ${{ off: 'not scheduled', hit: 'done', miss: 'missed', open: 'not done yet' }[state]}`}
              aria-label={`${plan.title} on ${date}: ${state}`}
              onClick={() => actions.toggle(plan, date)}
            >
              <span>{formatWeekday(date)[0]}</span>
            </button>
          );
        })}
      </div>
      {editable && (
        <div className="plan-actions visible">
          <button className="icon-button" aria-label={`Edit "${plan.title}"`} title="Edit" onClick={() => actions.edit(plan, today)}>
            ✎
          </button>
          <button className="icon-button" aria-label={`Delete "${plan.title}"`} title="Delete" onClick={() => actions.remove(plan, today)}>
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
