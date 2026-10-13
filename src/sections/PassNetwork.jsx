import React, { useEffect, useMemo, useRef, useState } from 'react';
import Pitch from '../components/Pitch.jsx';
import Selector from '../components/Selector.jsx';
import PassSonar from './PassSonar.jsx';
import { useJson } from '../lib/data.js';
import { ease, lerp, projector } from '../lib/pitch.js';
import useVertical from '../lib/useVertical.js';
import { teamKit } from '../lib/kits.jsx';

const DEFAULT_TEAM = 'serie-a:napoli';
const HIGHLIGHTS = [
  { value: 'none', label: 'NESSUNO' },
  { value: 'top', label: 'IL PIÙ COINVOLTO' },
  { value: 'edges', label: 'ARCHI PIÙ FORTI' },
];
const RES = { V: 'vittoria', N: 'pareggio', P: 'sconfitta' };

const nodeR = (t) => 1.2 + 0.2 * Math.sqrt(t);

// Tween node positions between matches (600 ms); edges follow the tweened nodes.
function useTweenedNodes(nodes, ms = 600) {
  const [shown, setShown] = useState(nodes);
  const prev = useRef(new Map());
  useEffect(() => {
    if (!nodes) return undefined;
    const from = new Map(prev.current);
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = ease(Math.min(1, (now - start) / ms));
      const next = nodes.map((n) => {
        const f = from.get(n.i);
        return f ? { ...n, x: lerp(f[0], n.x, t), y: lerp(f[1], n.y, t), fade: 1 } : { ...n, fade: t };
      });
      setShown(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = new Map(nodes.map((n) => [n.i, [n.x, n.y]]));
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      prev.current = new Map((nodes || []).map((n) => [n.i, [n.x, n.y]]));
    };
  }, [nodes, ms]);
  return shown || [];
}

function useCountUp(value, ms = 500) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (typeof value !== 'number') return undefined;
    const a = typeof from.current === 'number' ? from.current : 0;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = ease(Math.min(1, (now - start) / ms));
      setV(a + (value - a) * t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms]);
  return v;
}

function Kpi({ value, decimals = 0, suffix = '', label }) {
  const v = useCountUp(value);
  return (
    <div className="kpi">
      <b className="num">{typeof value === 'number' ? v.toFixed(decimals) : value}{suffix}</b>
      <small>{label}</small>
    </div>
  );
}

function quip(m, teamName) {
  const k = m.kpi;
  if (k.poss < 38) return `Possesso ${k.poss}%: la palla l'hanno vista soprattutto in TV.`;
  if (k.top_share >= 20) return `${k.top} coinvolto nel ${k.top_share}% dei passaggi: praticamente il Wi-Fi della squadra.`;
  if (k.acc >= 88) return `${k.acc}% di passaggi riusciti: precisione da chirurgo, emozioni da sala d'attesa.`;
  if (k.fwd >= 60) return `${k.fwd}% di passaggi in avanti: il ${teamName} ha fretta, e si vede.`;
  if (k.passes < 330) return `Solo ${k.passes} passaggi: palla lunga e pedalare.`;
  return 'Rete ordinata, nessuno scandalo. Si può cambiare canale tranquilli.';
}

export default function PassNetwork({ index }) {
  const [sel, setSel] = useState(DEFAULT_TEAM);
  const [comp, slug] = sel.split(':');
  const { data, loading } = useJson(`networks/${slug}.json`);
  const [mi, setMi] = useState(null);
  const [minEdge, setMinEdge] = useState(4);
  const [hl, setHl] = useState('none');
  const [sonarPid, setSonarPid] = useState(null);
  const vertical = useVertical();
  const P = projector(vertical);
  const [drawer, setDrawer] = useState(() => !(window.matchMedia?.('(max-width: 700px)').matches));
  const tlRef = useRef(null);

  const teamsBySlug = useMemo(() => Object.fromEntries(index.teams.map((t) => [t.slug, t])), [index]);
  const matches = useMemo(() => (data ? data.matches.filter((m) => m.comp === comp) : []), [data, comp]);

  // Default match: the one with the most passes (a team at its most "itself").
  useEffect(() => {
    if (!matches.length) return;
    let best = 0;
    matches.forEach((m, i) => { if (m.kpi.passes > matches[best].kpi.passes) best = i; });
    setMi(best);
    setSonarPid(null);
  }, [matches]);

  const m = mi != null ? matches[mi] : null;
  const nodes = useTweenedNodes(m ? m.nodes : null);

  useEffect(() => {
    tlRef.current?.querySelector('.tl-dot.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [mi]);

  useEffect(() => {
    if (sonarPid && m && !m.nodes.some((n) => n.i === sonarPid)) setSonarPid(null);
  }, [m]);

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') setMi((i) => (i == null ? i : Math.min(matches.length - 1, i + 1)));
      if (e.key === 'ArrowLeft') setMi((i) => (i == null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [matches]);

  const team = teamsBySlug[slug];
  const kit = team ? teamKit(team) : { fill: '#888', kit: { num: '#fff' } };
  const options = index.competitions.map((c) => ({
    group: c.name.toUpperCase(),
    options: index.teams.filter((t) => t.comps.includes(c.key))
      .map((t) => ({ value: `${c.key}:${t.slug}`, label: t.name.toUpperCase() })),
  }));

  // Nodes in screen coordinates (vertical on phones); edges are computed from these.
  const pnodes = nodes.map((n) => { const [x, y] = P([n.x, n.y]); return { ...n, x, y }; });
  const pos = new Map(pnodes.map((n) => [n.i, n]));
  const edges = m ? m.edges.filter((e) => e[2] >= minEdge && pos.has(e[0]) && pos.has(e[1])) : [];
  const maxC = Math.max(1, ...edges.map((e) => e[2]));
  const strong = new Set(hl === 'edges' ? [...edges].sort((a, b) => b[2] - a[2]).slice(0, 3).map((e) => `${e[0]}-${e[1]}`) : []);
  const topId = m?.kpi.top_id;
  const sonarNode = sonarPid ? m?.nodes.find((n) => n.i === sonarPid) : null;
  const order = m ? [...m.nodes].sort((a, b) => a.x - b.x) : [];
  const cycle = (dir) => {
    const i = order.findIndex((n) => n.i === sonarPid);
    setSonarPid(order[(i + dir + order.length) % order.length].i);
  };

  const label = (mm) => {
    const opp = teamsBySlug[mm.opp];
    const vs = mm.home ? `${team?.code}-${opp?.code}` : `${opp?.code}-${team?.code}`;
    const sc = mm.home ? `${mm.gf}-${mm.ga}` : `${mm.ga}-${mm.gf}`;
    return `${mm.comp === 'serie-a' ? `G${mm.week}` : mm.date.slice(0, 4)} ${vs} ${sc}`;
  };

  return (
    <section className="section" aria-labelledby="rete-title">
      <header className="section-head">
        <h1 id="rete-title" className="tt-title">CHI PASSA A CHI</h1>
        <p className="tt-sub">Ogni pallino è un titolare nella sua posizione media, ogni filo i passaggi tra due compagni. Si gioca verso destra.</p>
      </header>

      <div className="pager pager-top">
        <button type="button" className="btn" onClick={() => setMi(Math.max(0, (mi ?? 0) - 1))} aria-label="Partita precedente">◀</button>
        <span className="num">{team?.code} · {m ? label(m) : '...'}</span>
        <button type="button" className="btn" onClick={() => setMi(Math.min(matches.length - 1, (mi ?? 0) + 1))} aria-label="Partita successiva">▶</button>
        <button type="button" className={`btn btn-drawer${drawer ? ' on' : ''}`} aria-expanded={drawer} aria-controls="net-drawer" onClick={() => setDrawer(!drawer)}>
          {drawer ? '✕ CHIUDI' : '☰ SQUADRA E FILTRI'}
        </button>
      </div>

      <div className="controls controls-net drawer" id="net-drawer" hidden={!drawer}>
        <Selector label="SQUADRA" value={sel} onChange={setSel} options={options} />
        <label className="field">
          <span className="field-label">MINIMO PASSAGGI PER FILO: <span className="num hl">{minEdge}</span></span>
          <input type="range" min={2} max={10} value={minEdge} onChange={(e) => setMinEdge(+e.target.value)} aria-label="Minimo passaggi per arco" />
        </label>
        <div className="field">
          <span className="field-label">METTI IN EVIDENZA</span>
          <div className="chips" role="group" aria-label="Metti in evidenza">
            {HIGHLIGHTS.map((h) => (
              <button key={h.value} type="button" className={`chip${hl === h.value ? ' on' : ''}`} aria-pressed={hl === h.value} onClick={() => setHl(h.value)}>{h.label}</button>
            ))}
          </div>
        </div>
      </div>

      {m && (
        <div className="kpis">
          <Kpi value={m.kpi.poss} decimals={0} suffix="%" label="POSSESSO" />
          <Kpi value={m.kpi.passes} label="PASSAGGI" />
          <Kpi value={m.kpi.acc} decimals={0} suffix="%" label="RIUSCITI" />
          <Kpi value={m.kpi.top ? m.kpi.top.toUpperCase() : '—'} label={`IL PIÙ COINVOLTO · ${m.kpi.top_share}%`} />
        </div>
      )}

      <div className="timeline" ref={tlRef} role="group" aria-label="Partite della stagione">
        {matches.map((mm, i) => {
          const opp = teamsBySlug[mm.opp];
          return (
            <button
              key={mm.match_id} type="button" className={`tl-dot tl-${mm.res}${i === mi ? ' on' : ''}`} onClick={() => setMi(i)}
              aria-label={`${label(mm)}, ${RES[mm.res]} contro ${opp?.name}`} aria-pressed={i === mi} title={label(mm)}
            >
              {mm.comp === 'serie-a' ? mm.week : mm.date.slice(2, 4)}
            </button>
          );
        })}
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className="pitch-box">
            {(!m || loading) && <div className="loading">PAGINA IN ARRIVO... 201... 202... 203...</div>}
            {m && (
              <Pitch vertical={vertical} label={`Pass network ${team?.name}, ${label(m)}`}>
                <defs>
                  <marker id="net-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="2" markerHeight="2" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M0,0L6,3L0,6z" className="net-arrowhead" />
                  </marker>
                </defs>
                {vertical
                  ? <text x={78} y={4} textAnchor="end" className="net-dir">ATTACCO ↑</text>
                  : <text x={118} y={78} textAnchor="end" className="net-dir">ATTACCO →</text>}
                <g>
                  {edges.map(([a, b, c]) => {
                    const A = pos.get(a);
                    const B = pos.get(b);
                    const dx = B.x - A.x;
                    const dy = B.y - A.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const ux = dx / len;
                    const uy = dy / len;
                    const off = Math.min(3, len * 0.12);
                    const ra = nodeR(A.t) + 0.3;
                    const rb = nodeR(B.t) + 0.8;
                    const sx = A.x + ux * ra - uy * 0.8;
                    const sy = A.y + uy * ra + ux * 0.8;
                    const ex = B.x - ux * rb - uy * 0.8;
                    const ey = B.y - uy * rb + ux * 0.8;
                    const cx = (sx + ex) / 2 - uy * off;
                    const cy = (sy + ey) / 2 + ux * off;
                    const key = `${a}-${b}`;
                    const dim = (hl === 'top' && a !== topId && b !== topId) || (hl === 'edges' && !strong.has(key));
                    const on = (hl === 'top' && (a === topId || b === topId)) || strong.has(key);
                    return (
                      <path
                        key={key} d={`M${sx},${sy}Q${cx},${cy} ${ex},${ey}`}
                        className={`net-edge${on ? ' on' : ''}`} markerEnd="url(#net-arrow)"
                        style={{ strokeWidth: 0.2 + c * 0.09, opacity: dim ? 0.08 : 0.25 + (0.75 * c) / maxC }}
                      >
                        <title>{`${A.n} → ${B.n}: ${c} passaggi`}</title>
                      </path>
                    );
                  })}
                </g>
                <g>
                  {pnodes.map((n) => {
                    const r = nodeR(n.t);
                    const on = hl === 'top' && n.i === topId;
                    const dim = hl === 'top' && n.i !== topId;
                    return (
                      <g
                        key={n.i} transform={`translate(${n.x},${n.y})`} className={`net-node${on ? ' on' : ''}${n.i === sonarPid ? ' sel' : ''}`}
                        style={{ opacity: (dim ? 0.45 : 1) * (n.fade ?? 1) }}
                        role="button" tabIndex={0} aria-label={`${n.n}, ${n.t} tocchi, ${n.p} passaggi riusciti. Apri pass sonar`}
                        onClick={() => setSonarPid(sonarPid === n.i ? null : n.i)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSonarPid(sonarPid === n.i ? null : n.i); } }}
                      >
                        <circle r={r} fill={kit.fill} className="net-dot" />
                        <text y={0.9} textAnchor="middle" className="net-num" style={{ fill: kit.kit.num, stroke: kit.kit.num === '#111111' ? '#fff' : '#000' }}>{n.j}</text>
                        <text y={r + 3} textAnchor="middle" className="net-label">{n.n.toUpperCase()}</text>
                      </g>
                    );
                  })}
                </g>
              </Pitch>
            )}
          </div>
          <p className="net-note">
            {m && (m.cut ? `RETE CALCOLATA FINO AL ${m.cut}' (PRIMO CAMBIO O ESPULSIONE), PER AVERE 11 GIOCATORI FISSI.` : 'NESSUN CAMBIO: RETE SU TUTTA LA PARTITA.')}
            {' '}← → PER CAMBIARE PARTITA.
          </p>
        </div>

        <aside className={`panel${sonarNode && vertical ? ' sheet' : ''}`} aria-label="Dettagli">
          {sonarNode ? (
            <PassSonar
              vertical={vertical} player={sonarNode} sonar={m.sonar[String(sonarNode.i)]} kitFill={kit.fill}
              onPrev={() => cycle(-1)} onNext={() => cycle(1)} onClose={() => setSonarPid(null)}
            />
          ) : m && (
            <>
              <div className="scoreline">
                <span className={m.home ? 'hl' : ''}>{(m.home ? team?.name : teamsBySlug[m.opp]?.name)?.toUpperCase()}</span>
                <span className="num score">{m.home ? `${m.gf}-${m.ga}` : `${m.ga}-${m.gf}`}</span>
                <span className={m.home ? '' : 'hl'}>{(m.home ? teamsBySlug[m.opp]?.name : team?.name)?.toUpperCase()}</span>
              </div>
              <dl className="facts">
                <dt>DATA</dt><dd className="num">{m.date.split('-').reverse().join('.')}</dd>
                <dt>ESITO</dt><dd className={`res-${m.res}`}>{RES[m.res].toUpperCase()}</dd>
                <dt>LUNGHEZZA</dt><dd className="num">{m.kpi.len} M DI MEDIA</dd>
                <dt>IN AVANTI</dt><dd className="num">{m.kpi.fwd}% DEI PASSAGGI</dd>
              </dl>
              <div className="bot">
                <span className="bot-head">&gt; COMMENTO AUTOMATICO:</span>
                <span>{quip(m, team?.name)}</span>
              </div>
              <p className="hint-box">CLICCA UN GIOCATORE PER IL SUO PASS SONAR: DOVE PASSA, QUANTO, E QUANTO BENE.</p>
            </>
          )}
        </aside>
      </div>

      <details className="method">
        <summary>COME LO CALCOLIAMO (PER CHI NON SI FIDA, GIUSTAMENTE)</summary>
        <ul>
          <li>La rete usa solo il tempo fino al primo cambio o rosso della squadra: così gli 11 sono sempre gli stessi.</li>
          <li>Pallino = posizione media di tutti i tocchi del titolare in quel periodo; grandezza ∝ √tocchi.</li>
          <li>Filo = passaggi riusciti da A a B (la freccia indica il verso); spessore e opacità ∝ numero di passaggi.</li>
          <li>Pass sonar: tutti i passaggi del giocatore nella partita (rimesse e calci d'inizio esclusi), in 24 spicchi da 15°. Raggio = quanti, colore = % riusciti.</li>
          <li>Possesso = durata dei possessi StatsBomb di ciascuna squadra. «Il più coinvolto» = quota di passaggi riusciti fatti o ricevuti.</li>
        </ul>
      </details>
    </section>
  );
}
