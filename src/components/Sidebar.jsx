import React, { useState } from 'react';
import { useApp } from '../context.js';
import { paths } from '../lib/routes.js';
import Link from './Link.jsx';
import { PLAN_DRAG_TYPE } from './PlanItem.jsx';
import { useCategoryActions, CategoryNameInput } from './categoryActions.jsx';

export default function Sidebar() {
  const { state, route, today } = useApp();
  const categoryActions = useCategoryActions();
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState(null);

  const counts = {};
  for (const p of state.plans) counts[p.categoryId ?? 'none'] = (counts[p.categoryId ?? 'none'] ?? 0) + 1;

  const pages = [
    { to: paths.dashboard(), label: 'Dashboard', icon: '◧', active: route.page === 'dashboard' },
    { to: paths.calendar(), label: 'Calendar', icon: '▦', active: route.page === 'calendar' },
    { to: paths.day(today), label: 'Day Planner', icon: '☰', active: route.page === 'day' },
    { to: paths.categories(), label: 'Categories', icon: '◉', active: route.page === 'categories' },
  ];

  return (
    <nav className="sidebar" aria-label="Sidebar">
      <div className="sidebar-section">
        {pages.map((p) => (
          <Link key={p.label} to={p.to} className={`side-item ${p.active ? 'active' : ''}`}>
            <span className="side-icon" aria-hidden>
              {p.icon}
            </span>
            {p.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-section categories-section">
        <div className="sidebar-heading">
          <span>Categories</span>
          <button className="icon-button" aria-label="Add category" title="Add category" onClick={() => setAdding(true)}>
            +
          </button>
        </div>
        <ul className="category-list" data-testid="sidebar-categories">
          {state.categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              count={counts[c.id] ?? 0}
              selected={route.page === 'category' && route.id === c.id}
              renaming={renamingId === c.id}
              onRenameStart={() => setRenamingId(c.id)}
              onRenameEnd={() => setRenamingId(null)}
              actions={categoryActions}
            />
          ))}
          <CategoryRow
            category={{ id: 'none', name: 'Uncategorized', color: 'transparent' }}
            count={counts.none ?? 0}
            selected={route.page === 'category' && route.id === 'none'}
            actions={categoryActions}
            builtIn
          />
        </ul>
        {adding && (
          <CategoryNameInput
            placeholder="New category name"
            onSubmit={(name) => {
              if (categoryActions.add(name)) setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {!adding && (
          <button className="add-category-link" onClick={() => setAdding(true)}>
            + New category
          </button>
        )}
      </div>
    </nav>
  );
}

function CategoryRow({ category, count, selected, renaming, onRenameStart, onRenameEnd, actions, builtIn }) {
  const { state, dispatch } = useApp();
  const [dropping, setDropping] = useState(false);

  // Drop a plan on a category to assign it.
  const onDragOver = (e) => {
    if (!e.dataTransfer.types.includes(PLAN_DRAG_TYPE)) return;
    e.preventDefault();
    setDropping(true);
  };
  const onDrop = (e) => {
    setDropping(false);
    const data = e.dataTransfer.getData(PLAN_DRAG_TYPE);
    if (!data) return;
    e.preventDefault();
    const { id } = JSON.parse(data);
    if (state.plans.some((p) => p.id === id)) {
      dispatch({ type: 'plan/update', id, changes: { categoryId: builtIn ? null : category.id } });
    }
  };

  if (renaming) {
    return (
      <li>
        <CategoryNameInput
          initial={category.name}
          excludeId={category.id}
          onSubmit={(name) => {
            if (actions.rename(category.id, name)) onRenameEnd();
          }}
          onCancel={onRenameEnd}
        />
      </li>
    );
  }

  return (
    <li
      className={`category-row ${selected ? 'selected' : ''} ${dropping ? 'drop-target' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      onDoubleClick={() => !builtIn && onRenameStart()}
      data-testid="category-row"
    >
      <Link to={paths.category(category.id)} className="side-item">
        <span className={`dot ${builtIn ? 'dot-empty' : ''}`} style={{ background: category.color }} />
        <span className="category-name">{category.name}</span>
        <span className="count">{count}</span>
      </Link>
      {!builtIn && (
        <span className="row-actions">
          <button className="icon-button" aria-label={`Rename ${category.name}`} title="Rename" onClick={onRenameStart}>
            ✎
          </button>
          <button className="icon-button" aria-label={`Delete ${category.name}`} title="Delete" onClick={() => actions.remove(category)}>
            🗑
          </button>
        </span>
      )}
    </li>
  );
}
