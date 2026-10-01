import React from 'react';
import { useApp } from '../context.js';
import { currentPath } from '../lib/store.js';
import { parseRoute, routeTitle, routeIcon, paths } from '../lib/routes.js';

export default function TabBar() {
  const { state, dispatch } = useApp();
  const { tabs, activeTabId } = state.session;
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => {
        const route = parseRoute(currentPath(tab));
        const title = routeTitle(route, state.categories);
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`tab ${active ? 'active' : ''}`}
            title={title}
            data-testid="tab"
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
