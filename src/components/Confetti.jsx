import React, { useEffect, useRef, useState } from 'react';

const COLORS = ['#4fbf86', '#5b7fd6', '#d4a03f', '#cf6b8f', '#9273c7', '#3f9bb0'];

// A short burst of confetti whenever a whole day becomes complete (from any page). Skipped when
// the system asks for reduced motion.
export default function Confetti({ days }) {
  const seen = useRef(null);
  const [bursts, setBursts] = useState([]);

  useEffect(() => {
    const done = new Set(Object.keys(days).filter((d) => days[d]?.done));
    if (seen.current) {
      const fresh = [...done].some((d) => !seen.current.has(d));
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (fresh && !calm) {
        const id = Date.now();
        const pieces = Array.from({ length: 36 }, (_, i) => ({
          i,
          x: (Math.random() - 0.5) * 520,
          y: -(140 + Math.random() * 260),
          r: Math.random() * 720 - 360,
          delay: Math.random() * 0.12,
          color: COLORS[i % COLORS.length],
          round: Math.random() > 0.5,
        }));
        setBursts((b) => [...b, { id, pieces }]);
        setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1600);
      }
    }
    seen.current = done;
  }, [days]);

  return bursts.map((b) => (
    <div key={b.id} className="confetti" data-testid="confetti" aria-hidden>
      {b.pieces.map((p) => (
        <span
          key={p.i}
          className={p.round ? 'round' : ''}
          style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg`, background: p.color, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  ));
}
