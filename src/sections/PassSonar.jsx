import React, { useState } from 'react';
import { arc } from 'd3-shape';
import { scaleLinear } from 'd3-scale';

const accColor = scaleLinear().domain([50, 75, 92]).range(['#ff2b2b', '#ffff00', '#00ff00']).clamp(true);
const R = 44;
const INNER = 4;

// Polar pass sonar: 24 sectors of 15°, radius = passes, colour = % completed.
// 0° points to the attacking direction (right); y grows downwards as on the pitch.
export default function PassSonar({ vertical = false, player, sonar, kitFill, onPrev, onNext, onClose }) {
  const [hover, setHover] = useState(null);
  const sectors = sonar || [];
  const max = Math.max(1, ...sectors.map((s) => s[1]));
  const total = sectors.reduce((a, s) => a + s[1], 0);
  const ok = sectors.reduce((a, s) => a + (s[1] * s[3]) / 100, 0);
  const radius = scaleLinear().domain([0, max]).range([INNER, R]);
  const wedge = arc();
  const h = hover != null ? sectors.find((s) => s[0] === hover) : null;

  return (
    <div className="sonar">
      <div className="sonar-head">
        <button type="button" className="btn" onClick={onPrev} aria-label="Giocatore precedente">◀</button>
        <span className="sonar-name">
          <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="10" fill={kitFill} stroke="#000" /></svg>
          <span className="num">#{player.j}</span> {player.n.toUpperCase()}
        </span>
        <button type="button" className="btn" onClick={onNext} aria-label="Giocatore successivo">▶</button>
        <button type="button" className="btn" onClick={onClose} aria-label="Chiudi il pass sonar">✕</button>
      </div>
      <p className="sonar-sub">{player.r.toUpperCase()} · {total} PASSAGGI · {total ? Math.round((100 * ok) / total) : 0}% RIUSCITI</p>
      <svg className="sonar-svg" viewBox="-50 -50 100 100" role="img" aria-label={`Pass sonar di ${player.n}: ${total} passaggi`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} r={INNER + (R - INNER) * f} className="sonar-ring" />
        ))}
        <line x1={-R} y1={0} x2={R} y2={0} className="sonar-axis" />
        <line x1={0} y1={-R} x2={0} y2={R} className="sonar-axis" />
        {sectors.map(([i, n, len, pct]) => {
          // d3 arcs start at 12 o'clock: forward is right (+90°) or up (0°) on phones.
          const a0 = ((i * 15 + (vertical ? 0 : 90)) * Math.PI) / 180;
          const d = wedge({ innerRadius: INNER, outerRadius: radius(n), startAngle: a0, endAngle: a0 + (15 * Math.PI) / 180 });
          return (
            <path
              key={i} d={d} fill={accColor(pct)} className={`sonar-wedge${hover === i ? ' on' : ''}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            >
              <title>{`${n} passaggi, ${len} m di media, ${pct}% riusciti`}</title>
            </path>
          );
        })}
        <circle r={INNER - 0.6} fill={kitFill} stroke="#000" strokeWidth="0.4" />
        {vertical
          ? <text x={2} y={-R + 3} className="sonar-dir">ATTACCO ↑</text>
          : <text x={R + 1} y={-2} className="sonar-dir" textAnchor="end">ATTACCO →</text>}
        <text x={-R} y={-R + 3} className="sonar-dir">MAX {max}</text>
      </svg>
      <p className="sonar-read">
        {h ? `${h[1]} PASSAGGI · ${h[2]} M DI MEDIA · ${h[3]}% RIUSCITI` : 'PASSA SUGLI SPICCHI PER I DETTAGLI'}
      </p>
      <ul className="legend" aria-label="Legenda sonar">
        <li><span className="swatch" style={{ background: accColor(55) }} /> &lt;60% RIUSCITI</li>
        <li><span className="swatch" style={{ background: accColor(75) }} /> 75%</li>
        <li><span className="swatch" style={{ background: accColor(95) }} /> &gt;90%</li>
        <li>RAGGIO = N° PASSAGGI</li>
      </ul>
    </div>
  );
}
