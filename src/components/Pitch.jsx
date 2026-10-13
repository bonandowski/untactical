import React, { useEffect, useRef, useState } from 'react';
import { FULL, LINES, ease, lerp } from '../lib/pitch.js';

// Animate the viewBox between zoom levels (CSS cannot transition viewBox).
function useAnimatedView(target, ms = 600) {
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

export default function Pitch({ view = FULL, label, children, goalGlow = 0 }) {
  const v = useAnimatedView(view);
  return (
    <svg className="pitch" viewBox={v.join(' ')} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <rect x={-2} y={-2} width={124} height={84} className="pitch-bg" />
      {Array.from({ length: 12 }, (_, i) => (i % 2 ? <rect key={i} x={i * 10} y={0} width={10} height={80} className="pitch-stripe" /> : null))}
      <g className="pitch-lines">
        {LINES.map((l, i) => {
          if (l.t === 'rect') return <rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} />;
          if (l.t === 'line') return <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />;
          if (l.t === 'circle') return <circle key={i} cx={l.cx} cy={l.cy} r={l.r} />;
          return <circle key={i} cx={l.cx} cy={l.cy} r={0.4} className="pitch-dot" />;
        })}
      </g>
      <rect x={120} y={36} width={1.6} height={8} className="goal-mouth" style={{ opacity: 0.35 + 0.65 * goalGlow }} />
      {goalGlow > 0 && <rect x={113} y={30} width={7} height={20} className="goal-glow" style={{ opacity: goalGlow * 0.35 }} />}
      {children}
    </svg>
  );
}
