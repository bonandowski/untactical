// Televideo palette: the eight teletext colours, used for every chart.
export const TT = {
  black: '#000000',
  red: '#ff2b2b',
  green: '#00ff00',
  yellow: '#ffff00',
  blue: '#0000d6',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  white: '#ffffff',
};

// Pitch colours per theme (read by Pitch.jsx through CSS variables).
export const THEMES = ['televideo', 'carta'];

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem('untactical-theme');
    if (THEMES.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  // Televideo is the identity: dark by default, the pink-paper theme is opt-in.
  return 'televideo';
}

export function saveTheme(theme) {
  try { localStorage.setItem('untactical-theme', theme); } catch { /* ignore */ }
}
