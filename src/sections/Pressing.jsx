import React, { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import Pitch from '../components/Pitch.jsx';
import Selector from '../components/Selector.jsx';
import { useJson } from '../lib/data.js';
import { projRect, projector } from '../lib/pitch.js';
import useVertical from '../lib/useVertical.js';
import { teamKit } from '../lib/kits.jsx';

const YARD = 0.9144;
const METRICS = [
  { value: 'rec', label: 'RECUPERI' },
  { value: 'terr', label: 'TERRITORIO' },
];
const HALVES = [
  { value: 'all', label: 'TUTTA' },
  { value: '1', label: '1° TEMPO' },
  { value: '2', label: '2° TEMPO' },
];
const VENUES = [
  { value: 'all', label: 'OVUNQUE' },
  { value: 'home', label: 'IN CASA' },
  { value: 'away', label: 'FUORI' },
];
const HEAT = ['#0000d6', '#ff00ff', '#ff2b2b', '#ffff00'];
// Low values fade into the pitch, hot spots stay: opacity grows faster than the value.
const heatOpacity = (v, max) => Math.min(1, Math.max(0, (v / max - 0.15) / 0.85) ** 1.6 * 0.95);

function Seg({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chips seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className={`chip${value === o.value ? ' on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function quip(a, b, nameA, nameB) {
  if (a?.ppda == null || b?.ppda == null) return 'Dati insufficienti per sfottere qualcuno. Riprovare più tardi.';
  const diff = a.ppda - b.ppda;
  if (Math.abs(diff) < 0.8) return `${nameA} e ${nameB} pressano uguale: o tutti e due gegenpressing, o tutti e due in ciabatte.`;
  const [hi, lo] = diff < 0 ? [nameA, nameB] : [nameB, nameA];
  return `Il ${hi} morde come uno che ha perso il treno; il ${lo} lo guarda partire dalla banchina.`;
}

function HeatPitch({ team, kit, split, metric, max, vertical, onTip }) {
  const P = projector(vertical);
  const color = scaleLinear().domain([0.15, 0.45, 0.75, 1].map((f) => f * max)).range(HEAT).clamp(true);
  const values = split ? split[metric] : [];
  const lineAt = (x, cls, text) => {
    if (x == null) return null;
    const [x1, y1] = P([x, 0]);
    const [x2, y2] = P([x, 80]);
    const [tx, ty] = P([x, 2]);
    return (
      <g className={cls}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <text x={vertical ? tx + 1 : tx + 1} y={vertical ? ty - 1.5 : ty + 2.5}>{text}</text>
      </g>
    );
  };
  return (
    <Pitch vertical={vertical} label={`Mappa ${metric === 'rec' ? 'recuperi' : 'territorio'} ${team.name}`}>
      <g className="heat">
        {values.map((v, i) => {
          if (!v) return null;
          const x = (i % 12) * 10;
          const y = Math.floor(i / 12) * 10;
          const text = metric === 'rec'
            ? `${v.toFixed(2)} RECUPERI/90 · ${split.pct[i]}° PERCENTILE IN LEGA`
            : `${v.toFixed(1)}% DEI TOCCHI DEL ${team.name.toUpperCase()}`;
          return (
            <rect
              key={i} {...projRect(P, x, y, 10, 10)} fill={color(v)} fillOpacity={heatOpacity(v, max)} className="heat-cell"
              onPointerMove={(e) => { if (e.pointerType === 'mouse') onTip(e, text); }}
              onPointerDown={(e) => onTip(e, text)}
              onPointerLeave={(e) => { if (e.pointerType === 'mouse') onTip(null); }}
            />
          );
        })}
      </g>
      {split && lineAt(split.line, 'line-def', `LINEA ${Math.round(split.line * YARD)}M`)}
      {split && lineAt(split.height, 'line-press', `PRESSING ${Math.round(split.height * YARD)}M`)}
      <circle {...(() => { const [cx, cy] = P([4, 4]); return { cx, cy }; })()} r={2.4} fill={kit.fill} stroke="#000" strokeWidth={0.4} />
    </Pitch>
  );
}

function Strip({ title, rows, field, a, b, kits, teams, better, digits = 1, unit = '' }) {
  const vals = rows.map((r) => r[field]).filter((v) => v != null);
  if (!vals.length) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  const x = scaleLinear().domain(better === 'low' ? [hi + pad, lo - pad] : [lo - pad, hi + pad]).range([8, 292]);
  const mark = (slug, k, above) => {
    const r = rows.find((row) => row.slug === slug);
    if (!r || r[field] == null) return null;
    const cx = x(r[field]);
    return (
      <g key={slug}>
        <circle cx={cx} cy={20} r={6} fill={kits[slug]?.fill || '#fff'} stroke="#fff" strokeWidth={1.2} />
        <text x={cx} y={above ? 9 : 38} textAnchor="middle" className="strip-label">{teams[slug]?.code} {r[field].toFixed(digits)}{unit}</text>
      </g>
    );
  };
  return (
    <div className="strip">
      <div className="strip-head"><span>{title}</span><span className="dim">{better === 'low' ? 'PRESSA DI PIÙ →' : 'PIÙ ALTO →'}</span></div>
      <svg viewBox="0 0 300 42" role="img" aria-label={`${title}: posizione delle squadre`}>
        <line x1={8} x2={292} y1={20} y2={20} className="strip-axis" />
        {rows.map((r) => (r[field] == null ? null : (
          <circle key={r.slug} cx={x(r[field])} cy={20} r={3} className="strip-dot"><title>{`${teams[r.slug]?.name}: ${r[field]}`}</title></circle>
        )))}
        {mark(b, kits[b], false)}
        {mark(a, kits[a], true)}
      </svg>
    </div>
  );
}

export default function Pressing({ index }) {
  const [selA, setSelA] = useState('serie-a:napoli');
  const [selB, setSelB] = useState('serie-a:juventus');
  const [metric, setMetric] = useState('rec');
  const [half, setHalf] = useState('all');
  const [venue, setVenue] = useState('all');
  const [tip, setTip] = useState(null);
  const boxRef = useRef(null);
  const tipTimer = useRef(null);
  const vertical = useVertical();

  const [compA, slugA] = selA.split(':');
  const [compB, slugB] = selB.split(':');
  const { data: dA } = useJson(`pressing/${slugA}.json`);
  const { data: dB } = useJson(`pressing/${slugB}.json`);
  const { data: league } = useJson('pressing/league.json');

  const teams = useMemo(() => Object.fromEntries(index.teams.map((t) => [t.slug, t])), [index]);
  const key = `${half}|${venue}`;
  const sA = dA?.comps[compA]?.[key];
  const sB = dB?.comps[compB]?.[key];
  const tA = teams[slugA];
  const tB = teams[slugB];
  const kA = teamKit(tA);
  const kB = teamKit(tB);
  const max = Math.max(0.01, ...(sA?.[metric] || []), ...(sB?.[metric] || []));
  const rows = league?.[compA]?.[key] || [];
  const kits = Object.fromEntries(index.teams.map((t) => [t.slug, teamKit(t)]));

  const options = index.competitions.map((c) => ({
    group: c.name.toUpperCase(),
    options: index.teams.filter((t) => t.comps.includes(c.key)).map((t) => ({ value: `${c.key}:${t.slug}`, label: t.name.toUpperCase() })),
  }));

  const onTip = (e, text) => {
    if (!e) { setTip(null); return; }
    const box = boxRef.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
    clearTimeout(tipTimer.current);
    if (e.pointerType !== 'mouse') tipTimer.current = setTimeout(() => setTip(null), 2500);
  };

  const card = (team, kit, s, comp) => (
    <div className="press-card">
      <div className="press-head">
        <span className="press-name">{team?.name.toUpperCase()}</span>
        <span className="badge-ppda num" title="Passaggi concessi per azione difensiva">PPDA {s?.ppda ?? '—'}</span>
      </div>
      <div className="press-pitch">
        {s ? <HeatPitch team={team} kit={kit} split={s} metric={metric} max={max} vertical={vertical} onTip={onTip} />
          : <p className="loading">SINTONIZZAZIONE...</p>}
      </div>
      {s && (
        <p className="press-sub num">
          {s.rec90} REC/90 · {s.rec_ft} NEL TERZO OFFENSIVO · {s.matches} {comp === 'serie-a' ? 'PARTITE' : s.matches === 1 ? 'FINALE' : 'FINALI'}
        </p>
      )}
    </div>
  );

  return (
    <section className="section" aria-labelledby="press-title">
      <header className="section-head">
        <h1 id="press-title" className="tt-title">CHI PRESSA CHI</h1>
        <p className="tt-sub">Dove una squadra si riprende il pallone (o dove passa il tempo), a confronto. Si attacca {vertical ? 'verso l\'alto' : 'verso destra'}.</p>
      </header>

      <div className="controls controls-press">
        <Selector label="SQUADRA A" value={selA} onChange={setSelA} options={options} />
        <Selector label="SQUADRA B" value={selB} onChange={setSelB} options={options} />
      </div>
      <div className="seg-row">
        <Seg label="COSA" value={metric} options={METRICS} onChange={setMetric} />
        <Seg label="QUANDO" value={half} options={HALVES} onChange={setHalf} />
        <Seg label="DOVE" value={venue} options={VENUES} onChange={setVenue} />
      </div>

      <div className="press-grid" ref={boxRef}>
        {card(tA, kA, sA, compA)}
        {card(tB, kB, sB, compB)}
        {tip && <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.text}</div>}
      </div>

      <div className="heat-legend" aria-hidden="true">
        <span>{metric === 'rec' ? 'RECUPERI/90 PER CELLA' : '% DEI TOCCHI'}</span>
        <span className="heat-bar" style={{ background: 'linear-gradient(90deg, rgba(255,0,255,0) 0%, #ff00ff 45%, #ff2b2b 75%, #ffff00 100%)' }} />
        <span className="num">0 → {max.toFixed(metric === 'rec' ? 2 : 1)}</span>
        <span className="lg-press">— PRESSING MEDIO</span>
        <span className="lg-line">- - LINEA DIFENSIVA</span>
      </div>

      <div className="bot">
        <span className="bot-head">&gt; COMMENTO AUTOMATICO:</span>
        <span>{quip(sA, sB, tA?.name, tB?.name)}</span>
      </div>

      {rows.length > 2 && (
        <div className="strips">
          <h2 className="tt-h2">{index.competitions.find((c) => c.key === compA)?.name.toUpperCase()}: IN CLASSIFICA</h2>
          <Strip title="PPDA" rows={rows} field="ppda" a={slugA} b={compB === compA ? slugB : null} kits={kits} teams={teams} better="low" />
          <Strip title="ALTEZZA AZIONI DIFENSIVE (IARDE)" rows={rows} field="height" a={slugA} b={compB === compA ? slugB : null} kits={kits} teams={teams} better="high" />
          <Strip title="RECUPERI NEL TERZO OFFENSIVO /90" rows={rows} field="rec_ft" a={slugA} b={compB === compA ? slugB : null} kits={kits} teams={teams} better="high" />
        </div>
      )}

      <details className="method">
        <summary>COME LO CALCOLIAMO (PER CHI NON SI FIDA, GIUSTAMENTE)</summary>
        <ul>
          <li>Recuperi: Ball Recovery riusciti, intercetti e contrasti vinti, più i pressing che fanno riprendere palla entro 5 secondi. Contati in celle da 10×10 iarde e divisi per i minuti giocati (per 90').</li>
          <li>Territorio: dove la squadra tocca il pallone, in % sul totale dei suoi tocchi.</li>
          <li>PPDA: passaggi su azione dell'avversario nel suo 60% di campo, diviso contrasti + intercetti + falli della squadra nella stessa zona. Più basso = pressa di più.</li>
          <li>Pressing medio: x media di pressioni, intercetti, recuperi, respinte, rinvii e duelli. Linea difensiva: x media dei tocchi dei difensori quando la palla ce l'hanno gli altri.</li>
          <li>Percentile della cella: rispetto alle altre squadre della stessa competizione, con gli stessi filtri. Le finali di Champions sono 1-3 partite a squadra: prendere con le pinze.</li>
        </ul>
      </details>
    </section>
  );
}
