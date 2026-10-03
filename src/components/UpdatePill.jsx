import React, { useEffect, useRef, useState } from 'react';
import { updates } from '../lib/persistence.js';

// A small "↑ 1.5.1" pill at the right of the tab strip when a new version is out. Click it for
// Update and restart / Later. While downloading it shows a little progress ring.
export default function UpdatePill() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    updates.status().then(setStatus);
    return updates.onStatus(setStatus);
  }, []);

  // Close the popover when clicking anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const state = status?.state;
  const busy = state === 'downloading' || state === 'ready';
  const failedUpdate = state === 'error' && status?.version;
  if (!(state === 'available' || busy || failedUpdate) || (dismissed === status.version && !busy)) return null;

  const percent = status.percent ?? 0;
  return (
    <div className="update-pill-wrap" ref={ref}>
      <button
        className={`update-pill ${busy ? 'busy' : ''}`}
        data-testid="update-pill"
        aria-label={busy ? `Updating to ${status.version}` : `Update to Planner ${status.version}`}
        aria-expanded={open}
        title={busy ? 'Updating…' : `Planner ${status.version} is available`}
        onClick={() => setOpen(!open)}
      >
        {busy ? (
          <svg className="update-ring" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8" className="ring-track" />
            <circle cx="10" cy="10" r="8" className="ring-fill" style={{ strokeDasharray: `${(percent / 100) * 50.3} 50.3` }} />
          </svg>
        ) : (
          <span aria-hidden>↑</span>
        )}
        {status.version}
      </button>
      {open && (
        <div className="update-popover" role="dialog" aria-label="Update">
          {state === 'available' && (
            <>
              <strong>Planner {status.version} is here ✨</strong>
              <p className="subtle">It downloads in the background, then Planner restarts. Your plans stay as they are.</p>
              <div className="update-actions">
                <button className="primary" onClick={() => updates.download()}>
                  Update and restart
                </button>
                <button
                  onClick={() => {
                    setDismissed(status.version);
                    setOpen(false);
                  }}
                >
                  Later
                </button>
              </div>
              <button className="link-button" onClick={() => updates.openPage()}>
                What's new →
              </button>
            </>
          )}
          {busy && (
            <>
              <strong>{state === 'ready' ? 'Restarting…' : `Downloading… ${percent}%`}</strong>
              <div className="update-bar">
                <span style={{ width: `${percent}%` }} />
              </div>
            </>
          )}
          {failedUpdate && (
            <>
              <strong>The update didn't work</strong>
              <p className="subtle">{status.message}</p>
              <button className="primary" onClick={() => updates.openPage()}>
                Open download page
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
