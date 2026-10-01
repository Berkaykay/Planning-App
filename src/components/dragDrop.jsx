import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Pointer-based drag and drop for plans. Unlike the browser's built-in drag and drop it keeps
// the mouse wheel working, so you can scroll while holding a plan; the page also scrolls by
// itself when the pointer nears its top or bottom edge.
//
// Drop targets are elements with a `data-drop` attribute holding JSON, for example
//   {"kind":"slot","date":"2026-10-05","hour":9}   an hour row (hour null = all day)
//   {"kind":"day","date":"2026-10-05"}              a calendar day
//   {"kind":"category","id":"..."}                  a category in the sidebar

const DragContext = createContext(null);
export const useDrag = () => useContext(DragContext);

const THRESHOLD = 5;
const EDGE = 70;
const MAX_SPEED = 18;

export function DragProvider({ onDrop, children }) {
  const [ghost, setGhost] = useState(null);
  const session = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const setTarget = (el) => {
    const s = session.current;
    if (s.targetEl === el) return;
    s.targetEl?.classList.remove('drop-target');
    el?.classList.add('drop-target');
    s.targetEl = el;
  };

  const findTarget = () => {
    const s = session.current;
    const el = document.elementFromPoint(s.x, s.y)?.closest('[data-drop]') ?? null;
    setTarget(el);
  };

  const stop = (drop) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    cancelAnimationFrame(s.frame);
    window.removeEventListener('pointermove', s.onMove, true);
    window.removeEventListener('pointerup', s.onUp, true);
    window.removeEventListener('keydown', s.onKey, true);
    window.removeEventListener('scroll', s.onScroll, true);
    document.body.classList.remove('dragging-plan');
    const target = s.targetEl;
    target?.classList.remove('drop-target');
    setGhost(null);
    if (drop && s.active && target) {
      // Swallow the click that may follow the drop, but only that one: if no click comes right
      // away, stop listening so the next real click isn't lost.
      const swallow = (e) => e.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      onDropRef.current(s.plan, s.date, JSON.parse(target.dataset.drop));
    }
  };

  // Scrolls the page while the pointer is near its top or bottom edge. A plan picked up close to an
  // edge doesn't scroll the page until the pointer actually moves toward that edge.
  const autoScroll = () => {
    const s = session.current;
    if (!s) return;
    const page = document.querySelector('.page');
    if (page && s.active) {
      const rect = page.getBoundingClientRect();
      let dy = 0;
      if (s.y < rect.top + EDGE && s.y < s.startY - THRESHOLD) dy = -MAX_SPEED * Math.min(1, (rect.top + EDGE - s.y) / EDGE);
      else if (s.y > rect.bottom - EDGE && s.y > s.startY + THRESHOLD) dy = MAX_SPEED * Math.min(1, (s.y - (rect.bottom - EDGE)) / EDGE);
      if (dy) {
        page.scrollTop += dy;
        findTarget();
      }
    }
    s.frame = requestAnimationFrame(autoScroll);
  };

  const start = useCallback((e, plan, date, label) => {
    if (e.button !== 0 || e.target.closest('button, input, textarea, select, a, [role="checkbox"]')) return;
    const s = { plan, date, label, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, targetEl: null };
    s.onMove = (ev) => {
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.startX, s.y - s.startY) < THRESHOLD) return;
        s.active = true;
        document.body.classList.add('dragging-plan');
        window.getSelection()?.removeAllRanges();
      }
      setGhost({ x: s.x, y: s.y, label: s.label });
      findTarget();
    };
    s.onUp = () => stop(true);
    s.onKey = (ev) => ev.key === 'Escape' && stop(false);
    s.onScroll = () => s.active && findTarget();
    session.current = s;
    window.addEventListener('pointermove', s.onMove, true);
    window.addEventListener('pointerup', s.onUp, true);
    window.addEventListener('keydown', s.onKey, true);
    window.addEventListener('scroll', s.onScroll, true);
    s.frame = requestAnimationFrame(autoScroll);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stop(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DragContext.Provider value={start}>
      {children}
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x + 12, top: ghost.y + 8 }} data-testid="drag-ghost">
          {ghost.label}
        </div>
      )}
    </DragContext.Provider>
  );
}

export const dropAttr = (target) => JSON.stringify(target);
