import React, { useEffect, useRef, useState } from 'react';
import { FULL, FULL_V, LINES, ease, lerp, projRect, projector } from '../lib/pitch.js';

// Animate the viewBox between layouts (CSS cannot transition viewBox).
function useAnimatedView(target, ms = 400) {
  const [view, setView] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const v0 = from.current;
    let raf;
    const tick = (now) => {
      const t = ease(Math.min(1, (now - start) / ms));
      const v = v0.map((a, i) => lerp(a, target[i], t));
      from.current = v;
      setView(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.join(','), ms]);
  return view;
}

// StatsBomb pitch (120 x 80). `vertical` rotates it for portrait screens (attack upwards).
export default function Pitch({ vertical = false, label, children, goalGlow = 0 }) {
  const P = projector(vertical);
  const v = useAnimatedView(vertical ? FULL_V : FULL);
  const R = (x, y, w, h) => projRect(P, x, y, w, h);
  return (
    <svg className={`pitch${vertical ? ' pitch-v' : ''}`} viewBox={v.join(' ')} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <rect x={-2} y={-2} width={vertical ? 84 : 124} height={vertical ? 124 : 84} className="pitch-bg" />
      {Array.from({ length: 12 }, (_, i) => (i % 2 ? <rect key={i} {...R(i * 10, 0, 10, 80)} className="pitch-stripe" /> : null))}
      <g className="pitch-lines">
        {LINES.map((l, i) => {
          if (l.t === 'rect') return <rect key={i} {...R(l.x, l.y, l.w, l.h)} />;
          if (l.t === 'line') {
            const [x1, y1] = P([l.x1, l.y1]);
            const [x2, y2] = P([l.x2, l.y2]);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          }
          const [cx, cy] = P([l.cx, l.cy]);
          if (l.t === 'circle') return <circle key={i} cx={cx} cy={cy} r={l.r} />;
          return <circle key={i} cx={cx} cy={cy} r={0.4} className="pitch-dot" />;
        })}
      </g>
      <rect {...R(120, 36, 1.6, 8)} className="goal-mouth" style={{ opacity: 0.35 + 0.65 * goalGlow }} />
      {goalGlow > 0 && <rect {...R(113, 30, 7, 20)} className="goal-glow" style={{ opacity: goalGlow * 0.35 }} />}
      {children}
    </svg>
  );
}
