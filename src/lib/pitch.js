// StatsBomb pitch: 120 x 80, origin top-left, attack left -> right.
export const W = 120;
export const H = 80;

export const FULL = [-2, -2, 124, 84];
export const HALF = [56, -2, 68, 84];

// Lines of the pitch as SVG primitives (rendered by Pitch.jsx).
export const LINES = [
  { t: 'rect', x: 0, y: 0, w: 120, h: 80 },
  { t: 'line', x1: 60, y1: 0, x2: 60, y2: 80 },
  { t: 'circle', cx: 60, cy: 40, r: 10 },
  { t: 'rect', x: 0, y: 18, w: 18, h: 44 },
  { t: 'rect', x: 102, y: 18, w: 18, h: 44 },
  { t: 'rect', x: 0, y: 30, w: 6, h: 20 },
  { t: 'rect', x: 114, y: 30, w: 6, h: 20 },
  { t: 'dot', cx: 12, cy: 40 },
  { t: 'dot', cx: 108, cy: 40 },
  { t: 'dot', cx: 60, cy: 40 },
];

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// A wavy path between two points, used for carries.
export function wavyPath([x1, y1], [x2, y2], amp = 0.9, wavelength = 4) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return `M${x1},${y1}L${x2},${y2}`;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(8, Math.round(len * 2));
  let d = `M${x1},${y1}`;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const w = Math.sin((t * len * 2 * Math.PI) / wavelength) * amp * Math.sin(Math.PI * t);
    d += `L${(x1 + dx * t + nx * w).toFixed(2)},${(y1 + dy * t + ny * w).toFixed(2)}`;
  }
  return d;
}

// Zoom on the attacking half when the whole move happens there.
export function viewFor(goal) {
  const xs = [goal.start[0], ...goal.chain.flatMap((a) => [a.s[0], a.e[0]])];
  return Math.min(...xs) >= 58 ? HALF : FULL;
}
