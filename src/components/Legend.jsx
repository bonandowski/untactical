import React from 'react';

export default function Legend({ items }) {
  return (
    <ul className="legend" aria-label="Legenda">
      {items.map((it) => (
        <li key={it.label}>
          <svg width="22" height="14" aria-hidden="true">
            {it.kind === 'dot' && <circle cx="11" cy="7" r="5.5" fill={it.color} stroke={it.stroke || 'none'} strokeWidth="1.2" />}
            {it.kind === 'ring' && <circle cx="11" cy="7" r="5" fill="none" stroke={it.color} strokeWidth="1.5" strokeDasharray="2 1.5" />}
            {it.kind === 'line' && <line x1="2" y1="7" x2="20" y2="7" stroke={it.color} strokeWidth="2" />}
            {it.kind === 'wave' && <path d="M2,7 Q5,2 8,7 T14,7 T20,7" fill="none" stroke={it.color} strokeWidth="2" />}
            {it.kind === 'dash' && <line x1="2" y1="7" x2="20" y2="7" stroke={it.color} strokeWidth="2" strokeDasharray="3 2" />}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
