// Where the tray popup opens: against the panel, at the tray. Pure, so it can be unit-tested.
//
// `display` is { bounds, workArea } of the screen (the work area is the screen minus the panel),
// `tray` the tray icon's bounds when the system tells us (Windows) or null (Linux), `size` the
// popup's { width, height }. Returns { x, y, side } where side is the panel's edge.

const GAP = 6;

// The panel is on the side where the work area is smaller than the screen (bottom if unclear).
function panelSide({ bounds, workArea }) {
  if (workArea.y > bounds.y) return 'top';
  if (workArea.x > bounds.x) return 'left';
  if (workArea.x + workArea.width < bounds.x + bounds.width) return 'right';
  return 'bottom';
}

function popupPosition(display, tray, size) {
  const area = display.workArea;
  const side = panelSide(display);
  const known = tray && tray.width > 0 && tray.height > 0;
  let x;
  let y;
  if (side === 'top' || side === 'bottom') {
    // Centered on the tray icon, or at the right end of the panel, where the tray usually is.
    const cx = known ? tray.x + tray.width / 2 : area.x + area.width;
    x = cx - size.width / 2;
    y = side === 'bottom' ? area.y + area.height - size.height - GAP : area.y + GAP;
  } else {
    const cy = known ? tray.y + tray.height / 2 : area.y + area.height;
    y = cy - size.height / 2;
    x = side === 'right' ? area.x + area.width - size.width - GAP : area.x + GAP;
  }
  // Always fully on screen.
  x = Math.min(Math.max(x, area.x + GAP), area.x + area.width - size.width - GAP);
  y = Math.min(Math.max(y, area.y + GAP), area.y + area.height - size.height - GAP);
  return { x: Math.round(x), y: Math.round(y), side };
}

module.exports = { popupPosition, panelSide };
