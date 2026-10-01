import React, { useState } from 'react';
import { useApp } from '../context.js';
import { currentPath } from '../lib/store.js';
import { parseRoute, routeTitle, routeIcon, paths } from '../lib/routes.js';

const TAB_DRAG_TYPE = 'application/x-planner-tab';

export default function TabBar() {
  const { state, dispatch } = useApp();
  const { tabs, activeTabId } = state.session;
  // Position (0..tabs.length) where a dragged tab would be inserted.
  const [insertAt, setInsertAt] = useState(null);

  const onDragOver = (e, index) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    setInsertAt(index + (e.clientX > rect.left + rect.width / 2 ? 1 : 0));
  };

  const onDrop = (e) => {
    const id = e.dataTransfer.getData(TAB_DRAG_TYPE);
    const from = tabs.findIndex((t) => t.id === id);
    if (from !== -1 && insertAt !== null) {
      e.preventDefault();
      dispatch({ type: 'tab/move', id, toIndex: insertAt > from ? insertAt - 1 : insertAt });
    }
    setInsertAt(null);
  };

  return (
    <div className="tabbar" role="tablist" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setInsertAt(null)}>
      {tabs.map((tab, index) => {
        const route = parseRoute(currentPath(tab));
        const title = routeTitle(route, state.categories);
        const active = tab.id === activeTabId;
        const marker =
          insertAt === index ? 'insert-before' : insertAt === tabs.length && index === tabs.length - 1 ? 'insert-after' : '';
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`tab ${active ? 'active' : ''} ${marker}`}
            title={title}
            data-testid="tab"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={onDrop}
            onDragEnd={() => setInsertAt(null)}
            onMouseDown={(e) => e.button === 0 && dispatch({ type: 'tab/activate', id: tab.id })}
            onAuxClick={(e) => e.button === 1 && dispatch({ type: 'tab/close', id: tab.id })}
          >
            <span className="tab-icon" aria-hidden>
              {routeIcon(route)}
            </span>
            <span className="tab-title">{title}</span>
            <button
              className="tab-close"
              aria-label={`Close tab ${title}`}
              draggable={false}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => dispatch({ type: 'tab/close', id: tab.id })}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button
        className="new-tab"
        aria-label="New tab"
        title="New tab (Ctrl+T)"
        onClick={() => dispatch({ type: 'tab/open', path: paths.dashboard() })}
      >
        +
      </button>
    </div>
  );
}
