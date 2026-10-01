import React, { useState } from 'react';
import { useApp } from '../context.js';
import { isDone, describeRepeat } from '../lib/recurrence.js';
import { formatTimeRange, relativeDayLabel } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Check from './Check.jsx';
import Link from './Link.jsx';
import { usePlanActions } from './planActions.jsx';
import { useDrag } from './dragDrop.jsx';

// One occurrence of a plan (on `date`) with its check mark, details, checklist and edit/delete
// buttons. Drag it to move it; right-click it for more options.
export default function PlanItem({ plan, date, showTime = true, showDate = false }) {
  const { state, dispatch, today } = useApp();
  const actions = usePlanActions();
  const startDrag = useDrag();
  const [open, setOpen] = useState(false);
  const done = isDone(plan, date);
  const category = state.categories.find((c) => c.id === plan.categoryId);
  const items = plan.checklist ?? [];
  const ticked = items.filter((item) => item.doneDates.includes(date)).length;

  return (
    <div
      className={`plan ${done ? 'done' : ''}`}
      style={{ '--cat': category?.color ?? 'var(--muted-line)' }}
      data-testid="plan"
      data-plan-id={plan.id}
      onPointerDown={(e) => startDrag?.(e, plan, date, plan.title)}
      onDoubleClick={(e) => !e.target.closest('button, input, .checklist') && actions.edit(plan, date)}
      onContextMenu={(e) => actions.openMenu(e, plan, date)}
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
          {showTime && <span className="plan-time">{formatTimeRange(plan)}</span>}
          {items.length > 0 && (
            <button
              className={`checklist-badge ${ticked === items.length ? 'complete' : ''}`}
              aria-expanded={open}
              aria-label={`Checklist ${ticked} of ${items.length}`}
              onClick={() => setOpen(!open)}
            >
              ☑ {ticked}/{items.length}
            </button>
          )}
          {category && (
            <span className="chip">
              <span className="dot" style={{ background: category.color }} />
              {category.name}
            </span>
          )}
          {plan.repeat && <span title={describeRepeat(plan)}>↻ {describeRepeat(plan)}</span>}
          {plan.notes && <span className="plan-notes" title={plan.notes}>{plan.notes}</span>}
        </div>
        {open && items.length > 0 && (
          <ul className="checklist" aria-label={`Checklist for ${plan.title}`}>
            {items.map((item) => {
              const checked = item.doneDates.includes(date);
              return (
                <li key={item.id} className={checked ? 'done' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => dispatch({ type: 'plan/checkItem', id: plan.id, itemId: item.id, date, done: e.target.checked })}
                    />
                    <span>{item.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
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
