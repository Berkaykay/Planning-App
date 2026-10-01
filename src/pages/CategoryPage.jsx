import React, { useState } from 'react';
import { useApp } from '../context.js';
import { comparePlans } from '../lib/recurrence.js';
import { paths } from '../lib/routes.js';
import PlanItem from '../components/PlanItem.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import { usePlanActions } from '../components/planActions.jsx';
import { useCategoryActions, CategoryNameInput } from '../components/categoryActions.jsx';
import { ColorPicker } from './Categories.jsx';

const byDate = (a, b) => (a.date === b.date ? comparePlans(a, b) : a.date < b.date ? -1 : 1);

// All plans in one category.
export default function CategoryPage({ id }) {
  const { state, today } = useApp();
  const planActions = usePlanActions();
  const categoryActions = useCategoryActions();
  const [renaming, setRenaming] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const category = state.categories.find((c) => c.id === id);

  if (!category) {
    return (
      <div className="empty-page">
        <h1>Category not found</h1>
        <p>This category may have been deleted.</p>
        <Link to={paths.categories()} className="button primary">
          See all categories
        </Link>
      </div>
    );
  }

  const plans = state.plans.filter((p) => p.categoryId === id);
  const repeating = plans.filter((p) => p.repeat);
  const upcoming = plans.filter((p) => !p.repeat && p.date >= today).sort(byDate);
  const past = plans.filter((p) => !p.repeat && p.date < today).sort(byDate).reverse();

  return (
    <div className="category-page" style={{ '--cat': category.color }}>
      <header className="page-header row">
        <div className="category-title">
          <span className="dot big" style={{ background: category.color }} />
          {renaming ? (
            <CategoryNameInput
              initial={category.name}
              excludeId={category.id}
              onSubmit={(value) => categoryActions.rename(category.id, value) && setRenaming(false)}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h1>{category.name}</h1>
          )}
        </div>
        <div className="header-actions">
          <ColorPicker value={category.color} onChange={(c) => categoryActions.recolor(category.id, c)} />
          <button onClick={() => setRenaming(true)}>Rename</button>
          <button className="danger" onClick={() => categoryActions.remove(category)}>
            Delete
          </button>
          <button className="primary" onClick={() => planActions.create({ categoryId: id })}>
            + Add plan
          </button>
        </div>
      </header>

      {plans.length === 0 && <p className="empty">No plans in this category yet.</p>}

      {repeating.length > 0 && (
        <section className="card">
          <h2>Repeating</h2>
          {repeating.map((p) => (
            <RepeatTracker key={p.id} plan={p} editable />
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card">
          <h2>Upcoming</h2>
          <div className="plan-list">
            {upcoming.map((p) => (
              <PlanItem key={p.id} plan={p} date={p.date} showDate />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="card">
          <button className="link-button" onClick={() => setShowPast(!showPast)}>
            {showPast ? '▾' : '▸'} Past ({past.length})
          </button>
          {showPast && (
            <div className="plan-list">
              {past.map((p) => (
                <PlanItem key={p.id} plan={p} date={p.date} showDate />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
