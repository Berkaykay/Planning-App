import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Right-click menus. Items look like { label, onSelect, disabled, shortcut, danger, checked, children }
// and `null` draws a separator. Items with `children` open a submenu to the side.
export function useContextMenuState() {
  const [menu, setMenu] = useState(null);
  const open = (event, items) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, items: items.filter((item, i, all) => item || (i > 0 && all[i - 1])) });
  };
  return { menu, open, close: () => setMenu(null) };
}

export function ContextMenu({ menu, onClose }) {
  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={onClose} root />;
}

function MenuList({ items, x, y, onClose, root = false }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState(null);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const rect = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    if (!root) return undefined;
    const onDown = (e) => !e.target.closest?.('.context-menu') && onClose();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    ref.current?.querySelector('button:not(:disabled)')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [root, onClose]);

  return (
    <div className="context-menu" role="menu" ref={ref} style={pos} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) =>
        item ? (
          <div key={item.label} className="menu-item-wrap" onMouseEnter={() => setOpenSub(item.children ? i : null)}>
            <button
              role="menuitem"
              aria-haspopup={item.children ? 'menu' : undefined}
              disabled={item.disabled}
              className={`${item.danger ? 'danger' : ''} ${openSub === i ? 'open' : ''}`}
              onClick={(e) => {
                if (item.children) {
                  // Always open (never toggle): hovering has usually opened it already, and a
                  // toggle would race with that and sometimes close it again.
                  setOpenSub(i);
                  return;
                }
                e.stopPropagation();
                onClose();
                item.onSelect?.();
              }}
            >
              <span>
                {item.checked !== undefined && <span className="menu-check">{item.checked ? '✓' : ''}</span>}
                {item.label}
              </span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
              {item.children && <span aria-hidden>▸</span>}
            </button>
            {item.children && openSub === i && <SubMenu items={item.children} onClose={onClose} />}
          </div>
        ) : (
          <hr key={`sep-${i}`} />
        ),
      )}
    </div>
  );
}

function SubMenu({ items, onClose }) {
  const anchor = useRef(null);
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    const rect = anchor.current.parentElement.getBoundingClientRect();
    setAt({ x: rect.right - 2, y: rect.top - 4 });
  }, []);
  return <span ref={anchor}>{at && <MenuList items={items} x={at.x} y={at.y} onClose={onClose} />}</span>;
}
