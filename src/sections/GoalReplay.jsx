import React, { useEffect, useMemo, useRef, useState } from 'react';
import Pitch from '../components/Pitch.jsx';
import Selector from '../components/Selector.jsx';
import Scrubber from '../components/Scrubber.jsx';
import Legend from '../components/Legend.jsx';
import { useJson } from '../lib/data.js';
import { FULL, clamp01, ease, lerp, wavyPath } from '../lib/pitch.js';
import { TT } from '../lib/theme.js';
import { matchKits } from '../lib/kits.jsx';

// Dybala vs Lazio, 4 Dec 2015: 11 passes from his own half, xG 0.022.
export const DEFAULT_GOAL = '3879637-1';

const TAGS = ['tutti', 'contropiede', 'azione manovrata', 'assolo', 'palla inattiva', 'rigore', 'azione'];
const KIND = { pass: 'Passaggio', carry: 'Conduzione', dribble: 'Dribbling' };

function buildTimeline(goal) {
  let t = 0.7;
  const actions = goal.chain.map((a) => {
    const dur = a.k === 'dribble' ? 0.5 : 0.35 + 0.22 * Math.min(a.d, 3);
    const seg = { start: t, end: t + dur };
    t += dur;
    return seg;
  });
  const ff = { start: t, end: t + 0.35 };
  t += 0.35;
  const shot = { start: t, end: t + 0.55 };
  t += 0.55;
  return { total: t + 1.2, intro: 0.7, actions, ff, shot };
}

const progress = (T, seg) => clamp01((T - seg.start) / (seg.end - seg.start));

function teamName(teams, slug) {
  return teams.find((t) => t.slug === slug) || { slug, name: slug, code: slug.slice(0, 3).toUpperCase(), kit: { p: 'solid', c: ['#888888'], num: '#fff' }, away_kit: { p: 'solid', c: ['#f4f4f4'], num: '#111' } };
}

export default function GoalReplay({ index, goalId, setGoalId }) {
  const [tag, setTag] = useState('tutti');
  const [query, setQuery] = useState('');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tip, setTip] = useState(null);
  const boxRef = useRef(null);

  const { teams, goals: allGoals, matches } = index;
  const entry = allGoals.find((g) => g.id === goalId) || allGoals.find((g) => g.id === DEFAULT_GOAL) || allGoals[0];
  const goals = useMemo(() => (tag === 'tutti' ? allGoals : allGoals.filter((g) => g.tags.includes(tag))), [allGoals, tag]);

  const { data: matchGoals, loading } = useJson(`goals/${entry.match_id}.json`);
  const goal = matchGoals?.find((g) => g.id === entry.id);
  const tl = useMemo(() => (goal ? buildTimeline(goal) : null), [goal]);

  // Restart the replay whenever the goal changes.
  useEffect(() => { setT(0); setPlaying(true); setTip(null); }, [entry.id]);

  // When the tag filter excludes the current goal, jump to the closest match.
  useEffect(() => {
    if (tag === 'tutti' || entry.tags.includes(tag)) return;
    const next = goals.find((g) => g.team === entry.team && g.comp === entry.comp) || goals.find((g) => g.comp === entry.comp) || goals[0];
    if (next) setGoalId(next.id);
  }, [tag]);

  const compGoals = goals.filter((g) => g.comp === entry.comp);
  const teamSlugs = [...new Set(compGoals.map((g) => g.team))];
  const teamGoals = compGoals.filter((g) => g.team === entry.team);
  const matchIds = [...new Set(teamGoals.map((g) => g.match_id))];
  const pos = teamGoals.findIndex((g) => g.id === entry.id);

  const step = (dir) => {
    const list = teamGoals.length ? teamGoals : goals;
    const i = list.findIndex((g) => g.id === entry.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next) setGoalId(next.id);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'range') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => { if (!p && t >= 1) setT(0); return !p; });
      } else if (e.key === 'ArrowRight' && e.target.type !== 'range') step(1);
      else if (e.key === 'ArrowLeft' && e.target.type !== 'range') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const matchLabel = (mid) => {
    const m = matches.find((x) => x.match_id === mid);
    const h = teamName(teams, m.home).code;
    const a = teamName(teams, m.away).code;
    const when = m.comp === 'serie-a' ? `G${String(m.week).padStart(2, '0')}` : m.date.slice(0, 4);
    return `${when} ${h}-${a} ${m.home_score}-${m.away_score}`;
  };

  const results = query.trim().length >= 2
    ? goals.filter((g) => g.scorer.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40)
    : null;

  const team = teamName(teams, entry.team);
  const opp = teamName(teams, entry.opp);
  const kits = matchKits(teamName(teams, entry.home), teamName(teams, entry.away));
  const T = tl ? t * tl.total : 0;

  const showTip = (e, text) => {
    const box = boxRef.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
  };

  let ball = null;
  let ffOpacity = 0;
  let shotP = 0;
  if (goal && tl) {
    const firstPt = goal.chain[0]?.s || goal.start;
    ball = firstPt;
    goal.chain.forEach((a, i) => {
      const p = progress(T, tl.actions[i]);
      if (p > 0) ball = [lerp(a.s[0], a.e[0], ease(p)), lerp(a.s[1], a.e[1], ease(p))];
    });
    ffOpacity = progress(T, tl.ff);
    if (ffOpacity > 0) {
      const last = goal.chain.length ? goal.chain[goal.chain.length - 1].e : goal.start;
      ball = [lerp(last[0], goal.start[0], ease(ffOpacity)), lerp(last[1], goal.start[1], ease(ffOpacity))];
    }
    shotP = progress(T, tl.shot);
    if (shotP > 0) ball = [lerp(goal.start[0], goal.end[0], ease(shotP)), lerp(goal.start[1], goal.end[1], ease(shotP))];
  }
  const done = shotP >= 1;

  // Every player, interpolated between the keyframes of the current stepIdx.
  let stepIdx = -1;
  let stepP = 0;
  let players = [];
  if (goal && tl) {
    goal.chain.forEach((a, i) => {
      const p = progress(T, tl.actions[i]);
      if (p > 0) { stepIdx = i; stepP = p; }
    });
    const n = goal.chain.length;
    const from = stepIdx < 0 ? 0 : stepIdx;
    const to = stepIdx < 0 ? 0 : Math.min(stepIdx + 1, n);
    const w = stepIdx < 0 ? 0 : ease(stepP);
    players = goal.pl.map((pl) => {
      const a = pl.k[from];
      const b = pl.k[to];
      const exact = (w < 0.5 ? a[2] : b[2]) === 1;
      return { ...pl, x: lerp(a[0], b[0], w), y: lerp(a[1], b[1], w), exact };
    });
  }
  const shooting = ffOpacity > 0;
  const cur = !shooting && stepIdx >= 0 ? goal.chain[stepIdx] : null;
  const actorId = shooting ? goal?.scorer.id : cur?.pid;
  const receiverId = cur && cur.k === 'pass' ? cur.tid : null;
  let ticker = 'PALLA AL CENTRO... QUASI.';
  if (goal && shooting) {
    ticker = `TIRO DI ${goal.scorer.short.toUpperCase()} (${goal.body.toUpperCase()})${done ? ' ........ GOL' : ''}`;
  } else if (cur) {
    const what = cur.k === 'pass'
      ? `PASSAGGIO${cur.x ? ` ${cur.x.toUpperCase()}` : ''}: ${cur.p.toUpperCase()} → ${(cur.to || '???').toUpperCase()}${cur.ok ? '' : ' (SBAGLIATO)'}`
      : cur.k === 'carry' ? `CONDUZIONE: ${cur.p.toUpperCase()} PORTA PALLA` : `DRIBBLING: ${cur.p.toUpperCase()}${cur.ok ? ' SALTA L\'UOMO' : ' CI PROVA'}`;
    ticker = `AZIONE ${stepIdx + 1}/${goal.chain.length} · ${what}`;
  }

  return (
    <section className="section" aria-labelledby="gol-title">
      <header className="section-head">
        <h1 id="gol-title" className="tt-title">GOL REPLAY</h1>
        <p className="tt-sub">{allGoals.length} gol veri, ricostruiti passaggio per passaggio. Scegli, premi play, giudica.</p>
      </header>

      <div className="controls">
        <Selector
          label="COMPETIZIONE" value={entry.comp}
          onChange={(c) => { const g = goals.find((x) => x.comp === c); if (g) setGoalId(g.id); }}
          options={index.competitions.map((c) => ({ value: c.key, label: c.name.toUpperCase() }))}
        />
        <Selector
          label="SQUADRA" value={entry.team}
          onChange={(s) => { const g = compGoals.find((x) => x.team === s); if (g) setGoalId(g.id); }}
          options={teamSlugs.map((s) => teamName(teams, s)).sort((a, b) => a.name.localeCompare(b.name)).map((tm) => ({ value: tm.slug, label: tm.name.toUpperCase() }))}
        />
        <Selector
          label="PARTITA" value={entry.match_id}
          onChange={(mid) => { const g = teamGoals.find((x) => x.match_id === +mid); if (g) setGoalId(g.id); }}
          options={matchIds.map((mid) => ({ value: mid, label: matchLabel(mid) }))}
        />
        <Selector
          label="GOL" value={entry.id} onChange={setGoalId}
          options={teamGoals.filter((g) => g.match_id === entry.match_id).map((g) => ({ value: g.id, label: `${g.minute}' ${g.scorer.toUpperCase()}` }))}
        />
      </div>

      <div className="controls controls-2">
        <div className="chips" role="group" aria-label="Filtra per tipo di gol">
          {TAGS.map((x) => (
            <button key={x} type="button" className={`chip${tag === x ? ' on' : ''}`} aria-pressed={tag === x} onClick={() => setTag(x)}>
              {x.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="field search">
          <span className="field-label">CERCA MARCATORE</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. HIGUAÍN" aria-label="Cerca marcatore" />
        </label>
      </div>

      {results && (
        <div className="results" role="region" aria-label="Risultati ricerca">
          {results.length === 0 ? (
            <p className="empty">PAGINA NON DISPONIBILE. NESSUN GOL PER «{query.toUpperCase()}». RIPROVARE DOPO IL 90'.</p>
          ) : (
            <ul>
              {results.map((g) => (
                <li key={g.id}>
                  <button type="button" className={g.id === entry.id ? 'on' : ''} onClick={() => { setGoalId(g.id); setQuery(''); }}>
                    <span className="num">{g.minute}'</span> {g.scorer.toUpperCase()} · {teamName(teams, g.home).code}-{teamName(teams, g.away).code} · xG {g.xg.toFixed(2)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="stage">
        <div className="stage-main">
          <div className="pitch-box" ref={boxRef} onMouseLeave={() => setTip(null)}>
            {!goal && (
              <div className="loading">{loading ? 'PAGINA IN ARRIVO... 101... 102... 103...' : 'SEGNALE ASSENTE'}</div>
            )}
            {goal && tl && (
              <Pitch view={FULL} label={`Replay del gol di ${goal.scorer.name} al minuto ${goal.minute}`} goalGlow={done ? 1 : shotP}>
                <defs>
                  <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse">
                    <path d="M0,0L6,3L0,6z" fill={TT.yellow} />
                  </marker>
                </defs>

                {/* Phase 0: ghost of the whole move */}
                <polyline
                  className="ghost"
                  points={[...goal.chain.flatMap((a) => [a.s, a.e]), goal.start, goal.end.slice(0, 2)].map((p) => p.join(',')).join(' ')}
                  style={{ opacity: 0.45 * clamp01(T / tl.intro) }}
                />

                {goal.chain.map((a, i) => {
                  const p = progress(T, tl.actions[i]);
                  if (p <= 0) return null;
                  const tipText = `${KIND[a.k]}${a.x ? ` ${a.x}` : ''} · ${a.p.toUpperCase()}${a.ok ? '' : ' (non riuscito)'}`;
                  const common = {
                    pathLength: 1, strokeDasharray: `${p} 1`,
                    onMouseMove: (e) => showTip(e, tipText), onMouseLeave: () => setTip(null),
                  };
                  if (a.k === 'pass') {
                    return <path key={i} d={`M${a.s.join(',')}L${a.e.join(',')}`} className="act act-pass" markerEnd={p >= 1 ? 'url(#arrow)' : undefined} {...common} />;
                  }
                  if (a.k === 'carry') return <path key={i} d={wavyPath(a.s, a.e)} className="act act-carry" {...common} />;
                  return (
                    <g key={i} onMouseMove={common.onMouseMove} onMouseLeave={common.onMouseLeave}>
                      <circle cx={a.s[0]} cy={a.s[1]} r={2.6 * p} className="act-dribble" />
                    </g>
                  );
                })}

                <g className="players">
                  {players.map((pl) => {
                    const actor = pl.i === actorId;
                    const recv = pl.i === receiverId;
                    const cls = `pl ${pl.tm ? 'pl-mate' : 'pl-opp'}${pl.exact ? ' pl-exact' : ' pl-est'}${pl.gk ? ' pl-gk' : ''}${actor ? ' pl-actor' : ''}${recv ? ' pl-recv' : ''}${actor && shooting ? ' pl-shooter' : ''}`;
                    const k = kits[pl.tm ? entry.team : entry.opp];
                    const tipText = `#${pl.j ?? '?'} ${pl.n.toUpperCase()} · ${pl.r} · ${pl.exact ? 'POSIZIONE RILEVATA' : 'POSIZIONE STIMATA'}`;
                    return (
                      <g key={pl.i} className={cls} transform={`translate(${pl.x},${pl.y})`} onMouseMove={(e) => showTip(e, tipText)} onMouseLeave={() => setTip(null)}>
                        <circle r={4} className="hit" />
                        <circle r={2.1} className="pl-dot" fill={k.fill} />
                        <text y={0.8} textAnchor="middle" className="pl-num" style={{ fill: k.kit.num, stroke: k.kit.num === '#111111' ? '#fff' : '#000' }}>{pl.j ?? ''}</text>
                        {(actor || recv) && (
                          <text y={-3.3} textAnchor="middle" className="pl-label">{recv ? `→ ${pl.n.toUpperCase()}` : pl.n.toUpperCase()}</text>
                        )}
                      </g>
                    );
                  })}
                </g>

                {shotP > 0 && (
                  <path d={`M${goal.start.join(',')}L${goal.end.slice(0, 2).join(',')}`} className="shot" pathLength={1} strokeDasharray={`${shotP} 1`} />
                )}

                {ball && <circle cx={ball[0]} cy={ball[1]} r={1.1} className="ball" />}
              </Pitch>
            )}
            {goal && done && (
              <div className="xg-overlay" role="status">
                xG {goal.xg.toFixed(3)} <span className="dots">........</span> GOL
              </div>
            )}
            {tip && <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.text}</div>}
          </div>

          {goal && <p className="ticker" aria-hidden="true"><span className="ticker-tag">IN ONDA</span> {ticker}</p>}
          {tl && (
            <Scrubber t={t} setT={setT} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} duration={tl.total} />
          )}
          <Legend items={[
            { kind: 'line', color: TT.yellow, label: 'PASSAGGIO' },
            { kind: 'wave', color: TT.green, label: 'CONDUZIONE' },
            { kind: 'dot', color: kits[entry.team].fill, stroke: '#000', label: team.code },
            { kind: 'dot', color: kits[entry.opp].fill, stroke: '#000', label: opp.code },
            { kind: 'ring', color: TT.white, label: 'POSIZIONE STIMATA' },
            { kind: 'dot', color: TT.white, stroke: TT.yellow, label: 'CHI HA LA PALLA' },
            { kind: 'line', color: TT.magenta, label: 'TIRO' },
          ]}
          />
        </div>

        <aside className="panel" aria-label="Dettagli del gol">
          <div className="pager">
            <button type="button" className="btn" onClick={() => step(-1)} aria-label="Gol precedente">◀</button>
            <span className="num">GOL {pos + 1}/{teamGoals.length} · {team.code}</span>
            <button type="button" className="btn" onClick={() => step(1)} aria-label="Gol successivo">▶</button>
          </div>
          {goal ? (
            <>
              <div className="scoreline">
                <span className={goal.team === goal.home ? 'hl' : ''}>{teamName(teams, goal.home).name.toUpperCase()}</span>
                <span className="num score">{goal.after[0]}-{goal.after[1]}</span>
                <span className={goal.team === goal.away ? 'hl' : ''}>{teamName(teams, goal.away).name.toUpperCase()}</span>
              </div>
              <h2 className="scorer"><span className="num">{goal.minute}'</span> {goal.scorer.name.toUpperCase()}</h2>
              <dl className="facts">
                <dt>ASSIST</dt><dd>{goal.assist ? goal.assist.name.toUpperCase() : 'NESSUNO (FA TUTTO DA SÉ)'}</dd>
                <dt>xG</dt><dd className="num">{goal.xg.toFixed(3)} <span className="xg-bar" aria-hidden="true"><span style={{ width: `${Math.max(2, goal.xg * 100)}%` }} /></span></dd>
                <dt>TIRO</dt><dd>{goal.body.toUpperCase()} · {goal.technique.toUpperCase()} · {Math.round(goal.dist)} M</dd>
                <dt>PRIMA</dt><dd className="num">{goal.before[0]}-{goal.before[1]}</dd>
                <dt>DATA</dt><dd className="num">{goal.date.split('-').reverse().join('.')}</dd>
              </dl>
              <p className="line">{goal.line.toUpperCase()}</p>
              <div className="tags">
                {goal.tags.map((x) => <span key={x} className="tag">{x.toUpperCase()}</span>)}
              </div>
              {goal.badges.length > 0 && (
                <ul className="badges" aria-label="Badge">
                  {goal.badges.map((b) => <li key={b}>{b}</li>)}
                </ul>
              )}
              <div className="bot">
                <span className="bot-head">&gt; COMMENTO AUTOMATICO:</span>
                <span>{goal.quip}</span>
              </div>
            </>
          ) : (
            <p className="loading-inline">CARICAMENTO<span className="blink">_</span></p>
          )}
        </aside>
      </div>

      <details className="method">
        <summary>COME LO CALCOLIAMO (PER CHI NON SI FIDA, GIUSTAMENTE)</summary>
        <ul>
          <li>Prendiamo ogni tiro StatsBomb con esito «Goal» (autogol esclusi, rigori in partita inclusi, lotterie dei rigori escluse).</li>
          <li>La catena è il possesso della squadra che segna: passaggi, conduzioni e dribbling, fino a 8 azioni prima del tiro.</li>
          <li>StatsBomb fotografa le posizioni di tutti solo al momento del tiro (e solo chi è inquadrato). Negli altri istanti sono esatte solo le posizioni di chi compare in un evento (chi passa, chi riceve, chi pressa): le altre sono stimate dalla posizione media del giocatore nella partita, spostata verso la palla e agganciata ai suoi eventi più vicini. Pallino pieno = rilevato, tratteggiato = stimato.</li>
          <li>xG è il modello StatsBomb: la probabilità che un tiro così finisca in rete. 0.02 = 2 su 100.</li>
          <li>Tag e commenti sono regole automatiche sui numeri (durata, passaggi, xG, minuto). Nessuno stagista è stato maltrattato.</li>
        </ul>
      </details>
    </section>
  );
}
