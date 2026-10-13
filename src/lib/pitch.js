// StatsBomb pitch: 120 x 80, origin top-left, attack left -> right.
export const W = 120;
export const H = 80;

export const FULL = [-2, -2, 124, 84];
export const FULL_V = [-2, -2, 84, 124];

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

// Vertical pitch for portrait phones: attack goes up, the team's left stays on the left.
// Pitch coords (x, y) -> screen (y, 120 - x).
export const projector = (vertical) => (vertical ? ([x, y]) => [y, 120 - x] : ([x, y]) => [x, y]);

// Rect given in pitch coords, returned as a normalised SVG rect in screen coords.
export function projRect(P, x, y, w, h) {
  const [ax, ay] = P([x, y]);
  const [bx, by] = P([x + w, y + h]);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}
