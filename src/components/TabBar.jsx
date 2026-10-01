import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import appIcon from '../../build/icon.png';
import { useApp } from '../context.js';
import { currentPath } from '../lib/store.js';
import { parseRoute, routeTitle, routeIcon, paths } from '../lib/routes.js';

const DRAG_THRESHOLD = 5;

// Keeps the window's minimize / maximize / close buttons (drawn by Electron over the right end of
// the tab strip) in the strip's colors, for the light, dark and system themes.
function useWindowButtonColors(theme) {
  useEffect(() => {
    if (!window.planner?.setTitleBarColors) return undefined;
    const update = () => {
      const css = getComputedStyle(document.documentElement);
      const color = css.getPropertyValue('--chrome').trim();
      const symbolColor = css.getPropertyValue('--text').trim();
      if (color && symbolColor) window.planner.setTitleBarColors({ color, symbolColor });
    };
    // Wait a frame: the new theme is applied by an effect higher up, which runs after this one.
    const frame = requestAnimationFrame(update);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', update);
    };
  }, [theme]);
}

// Browser-style tab strip. Tabs are dragged along the strip (never out of it): the other tabs
// slide aside, and when released every tab glides to its new place.
export default function TabBar() {
  const { state, dispatch, menu } = useApp();
  const { tabs, activeTabId } = state.session;
  const stripRef = useRef(null);
  const tabRefs = useRef(new Map());
  const lastRects = useRef(new Map());
  const [drag, setDrag] = useState(null);
  useWindowButtonColors(state.settings.theme);

  // FLIP animation: whenever tabs move (reorder, open, close), slide them from where they were
  // last seen to their new place. While dragging, React positions the tabs instead.
  useLayoutEffect(() => {
    if (drag) return;
    const els = [...tabRefs.current];
    for (const [, el] of els) {
      el.style.transition = 'none';
      el.style.transform = '';
    }
    const rects = new Map();
    const moved = [];
    for (const [id, el] of els) {
      const left = el.getBoundingClientRect().left;
      rects.set(id, left);
      const before = lastRects.current.get(id);
      if (before !== undefined && Math.abs(before - left) > 1) {
        el.style.transform = `translateX(${before - left}px)`;
        moved.push(el);
      }
    }
    lastRects.current = rects;
    stripRef.current?.getBoundingClientRect(); // apply start positions before animating
    for (const [, el] of els) el.style.transition = '';
    for (const el of moved) el.style.transform = '';
  });

  const startDrag = (e, tab) => {
    if (e.button !== 0) return;
    dispatch({ type: 'tab/activate', id: tab.id });
    const group = tabs.filter((t) => Boolean(t.pinned) === Boolean(tab.pinned));
    const rects = group.map((t) => tabRefs.current.get(t.id).getBoundingClientRect());
    const self = rects[group.indexOf(tab)];
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      id: tab.id,
      startX: e.clientX,
      dx: 0,
      active: false,
      group: group.map((t) => t.id),
      rects,
      self,
      // Keep the dragged tab inside the strip, within its pinned/unpinned group.
      minDx: rects[0].left - self.left,
      maxDx: rects[rects.length - 1].right - self.right,
    });
  };

  const moveDrag = (e) => {
    if (!drag) return;
    const raw = e.clientX - drag.startX;
    if (!drag.active && Math.abs(raw) < DRAG_THRESHOLD) return;
    setDrag({ ...drag, active: true, dx: Math.max(drag.minDx, Math.min(drag.maxDx, raw)) });
  };

  // Index (within the group) where the dragged tab would land.
  const targetIndex = (d) => {
    const from = d.group.indexOf(d.id);
    const center = d.self.left + d.self.width / 2 + d.dx;
    let to = from;
    d.rects.forEach((r, i) => {
      const mid = r.left + r.width / 2;
      // At the very ends the tab is clamped onto the neighbour's middle, which counts as passing it.
      if (i > from && center >= mid) to = i;
      if (i < from && center <= mid && to === from) to = i;
    });
    return to;
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.active) {
      const to = targetIndex(drag);
      const offset = tabs.findIndex((t) => t.id === drag.group[0]);
      // Remember where every tab is on screen right now, so they glide on from there.
      for (const [id, el] of tabRefs.current) lastRects.current.set(id, el.getBoundingClientRect().left);
      dispatch({ type: 'tab/move', id: drag.id, toIndex: offset + to });
    }
    setDrag(null);
  };

  // How far each tab is pushed aside while another one is dragged over it.
  const shiftFor = (tab) => {
    if (!drag?.active) return 0;
    if (tab.id === drag.id) return drag.dx;
    const i = drag.group.indexOf(tab.id);
    if (i === -1) return 0;
    const from = drag.group.indexOf(drag.id);
    const to = targetIndex(drag);
    const gap = drag.self.width + 2;
    if (from < to && i > from && i <= to) return -gap;
    if (from > to && i >= to && i < from) return gap;
    return 0;
  };

  // The strip is also the window's title bar: app icon, tabs, "+", then empty space you can drag
  // the window by (double-click it to maximize), and room for the window buttons.
  return (
    <header className={`titlebar platform-${window.planner?.platform ?? 'web'}`}>
      <img className="app-logo" src={appIcon} alt="Planner" draggable={false} />
      <div
        className="tabbar"
        role="tablist"
        ref={stripRef}
        onDoubleClick={(e) => e.target === e.currentTarget && dispatch({ type: 'tab/open', path: paths.dashboard() })}
      >
        {tabs.map((tab) => {
          const route = parseRoute(currentPath(tab));
          const title = routeTitle(route, state.categories);
          const active = tab.id === activeTabId;
          const shift = shiftFor(tab);
          const dragging = drag?.active && drag.id === tab.id;
          return (
            <div
              key={tab.id}
              ref={(el) => (el ? tabRefs.current.set(tab.id, el) : tabRefs.current.delete(tab.id))}
              role="tab"
              aria-selected={active}
              className={`tab ${active ? 'active' : ''} ${tab.pinned ? 'pinned' : ''} ${dragging ? 'dragging' : ''}`}
              style={shift ? { transform: `translateX(${shift}px)` } : undefined}
              title={title}
              data-testid="tab"
              onPointerDown={(e) => startDrag(e, tab)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
              onAuxClick={(e) => e.button === 1 && dispatch({ type: 'tab/close', id: tab.id })}
              onContextMenu={(e) => menu.open(e, tabMenuItems(tab, state, dispatch))}
            >
              <span className="tab-icon" aria-hidden>
                {routeIcon(route)}
              </span>
              {!tab.pinned && <span className="tab-title">{title}</span>}
              {!tab.pinned && (
                <button
                  className="tab-close"
                  aria-label={`Close tab ${title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => dispatch({ type: 'tab/close', id: tab.id })}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
        <button className="new-tab" aria-label="New tab" title="New tab (Ctrl+T)" onClick={() => dispatch({ type: 'tab/open', path: paths.dashboard() })}>
          +
        </button>
      </div>
      <div className="titlebar-drag" data-testid="titlebar-drag" />
    </header>
  );
}

function tabMenuItems(tab, state, dispatch) {
  const { tabs, closed } = state.session;
  const index = tabs.indexOf(tab);
  return [
    { label: 'New tab to the right', onSelect: () => dispatch({ type: 'tab/open', path: paths.dashboard(), afterId: tab.id }) },
    { label: 'Duplicate', onSelect: () => dispatch({ type: 'tab/duplicate', id: tab.id }) },
    { label: tab.pinned ? 'Unpin' : 'Pin', onSelect: () => dispatch({ type: 'tab/pin', id: tab.id, pinned: !tab.pinned }) },
    null,
    { label: 'Close', shortcut: 'Ctrl+W', onSelect: () => dispatch({ type: 'tab/close', id: tab.id }) },
    { label: 'Close other tabs', disabled: tabs.length < 2, onSelect: () => dispatch({ type: 'tab/closeOthers', id: tab.id }) },
    { label: 'Close tabs to the right', disabled: index === tabs.length - 1, onSelect: () => dispatch({ type: 'tab/closeRight', id: tab.id }) },
    null,
    { label: 'Reopen closed tab', shortcut: 'Ctrl+Shift+T', disabled: !closed?.length, onSelect: () => dispatch({ type: 'tab/reopen' }) },
  ];
}
