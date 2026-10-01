import React from 'react';
import { useApp } from '../context.js';
import { isDone, describeRepeat } from '../lib/recurrence.js';
import { formatHour, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Check from './Check.jsx';
import Link from './Link.jsx';
import { usePlanActions } from './planActions.jsx';

export const PLAN_DRAG_TYPE = 'application/x-planner-plan';

// One occurrence of a plan (on `date`) with its check mark, details, and edit/delete buttons.
export default function PlanItem({ plan, date, showTime = true, showDate = false }) {
  const { state, today } = useApp();
  const actions = usePlanActions();
  const done = isDone(plan, date);
  const category = state.categories.find((c) => c.id === plan.categoryId);

  const onDragStart = (e) => {
    e.dataTransfer.setData(PLAN_DRAG_TYPE, JSON.stringify({ id: plan.id, date }));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`plan ${done ? 'done' : ''}`}
      style={{ '--cat': category?.color ?? 'var(--muted-line)' }}
      draggable
      onDragStart={onDragStart}
      data-testid="plan"
      data-plan-id={plan.id}
      onDoubleClick={() => actions.edit(plan, date)}
    >
      <Check checked={done} onChange={() => actions.toggle(plan, date)} label={`Mark "${plan.title}" complete`} />
      <div className="plan-main">
        <div className="plan-title">{plan.title}</div>
        <div className="plan-meta">
          {showDate && (
            <Link to={paths.day(date)} className="meta-link">
              {relativeDayLabel(date, today)}
            </Link>
          )}
          {showTime && <span>{plan.hour === null ? 'All day' : formatHour(plan.hour)}</span>}
          {category && <span className="chip" style={{ '--chip': category.color }}>{category.name}</span>}
          {plan.repeat && <span title={describeRepeat(plan)}>↻ {describeRepeat(plan)}</span>}
          {plan.notes && <span className="plan-notes" title={plan.notes}>{plan.notes}</span>}
        </div>
      </div>
      <div className="plan-actions">
        <button className="icon-button" aria-label={`Edit "${plan.title}"`} title="Edit" onClick={() => actions.edit(plan, date)}>
          ✎
        </button>
        <button className="icon-button" aria-label={`Delete "${plan.title}"`} title="Delete" onClick={() => actions.remove(plan, date)}>
          🗑
        </button>
      </div>
    </div>
  );
}
