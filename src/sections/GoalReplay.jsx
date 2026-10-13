import React, { useEffect, useMemo, useRef, useState } from 'react';
import Pitch from '../components/Pitch.jsx';
import Selector from '../components/Selector.jsx';
import Scrubber from '../components/Scrubber.jsx';
import Legend from '../components/Legend.jsx';
import { useJson } from '../lib/data.js';
import { clamp01, ease, lerp, projector, wavyPath } from '../lib/pitch.js';
import useVertical from '../lib/useVertical.js';
import { TT } from '../lib/theme.js';
import { matchKits } from '../lib/kits.jsx';

// Milito vs Bayern, Champions League final 2010, 70': the feint on Van Buyten.
export const DEFAULT_GOAL = '18235-2';

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
  const [comp, setComp] = useState('tutte');
  const [teamF, setTeamF] = useState('tutte');
  const [tag, setTag] = useState('tutti');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date');
  const [shown, setShown] = useState(30);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tip, setTip] = useState(null);
  const boxRef = useRef(null);
  const tipTimer = useRef(null);
  const vertical = useVertical();
  const P = projector(vertical);
  const [drawer, setDrawer] = useState(() => !(window.matchMedia?.('(max-width: 700px)').matches));

  const { teams, goals: allGoals, matches } = index;
  const entry = allGoals.find((g) => g.id === goalId) || allGoals.find((g) => g.id === DEFAULT_GOAL) || allGoals[0];
  const { data: matchGoals, loading } = useJson(`goals/${entry.match_id}.json`);
  const goal = matchGoals?.find((g) => g.id === entry.id);
  const tl = useMemo(() => (goal ? buildTimeline(goal) : null), [goal]);

  // Restart the replay whenever the goal changes.
  useEffect(() => { setT(0); setPlaying(true); setTip(null); }, [entry.id]);

  // Independent filters: none of them drives the others, each one just narrows the list.
  const dateOf = useMemo(() => Object.fromEntries(matches.map((m) => [m.match_id, m.date])), [matches]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = allGoals.filter((g) => (comp === 'tutte' || g.comp === comp)
      && (teamF === 'tutte' || g.home === teamF || g.away === teamF)
      && (tag === 'tutti' || g.tags.includes(tag))
      && (!q || g.scorer.toLowerCase().includes(q)));
    const by = {
      date: (x, y) => dateOf[y.match_id].localeCompare(dateOf[x.match_id]) || x.minute - y.minute,
      improbable: (x, y) => x.xg - y.xg,
      easy: (x, y) => y.xg - x.xg,
    }[sort];
    return out.sort(by);
  }, [allGoals, comp, teamF, tag, query, sort, dateOf]);
  useEffect(() => setShown(30), [comp, teamF, tag, query, sort]);

  const pos = list.findIndex((g) => g.id === entry.id);
  const step = (dir) => {
    if (!list.length) return;
    const next = pos < 0 ? list[0] : list[(pos + dir + list.length) % list.length];
    setGoalId(next.id);
  };
  const filtersOn = comp !== 'tutte' || teamF !== 'tutte' || tag !== 'tutti' || query.trim();
  const resetFilters = () => { setComp('tutte'); setTeamF('tutte'); setTag('tutti'); setQuery(''); };
  const teamOptions = [{ value: 'tutte', label: 'TUTTE' }, ...index.competitions.map((c) => ({
    group: c.name.toUpperCase(),
    options: teams.filter((t) => t.comps.includes(c.key) && (comp === 'tutte' || comp === c.key))
      .map((t) => ({ value: t.slug, label: t.name.toUpperCase() })),
  })).filter((g) => g.options.length)];

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

  const team = teamName(teams, entry.team);
  const opp = teamName(teams, entry.opp);
  const kits = matchKits(teamName(teams, entry.home), teamName(teams, entry.away));
  const T = tl ? t * tl.total : 0;

  // Hover with a mouse, tap on touch screens (the tap tooltip fades on its own).
  const showTip = (e, text) => {
    const box = boxRef.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text });
    clearTimeout(tipTimer.current);
    if (e.pointerType && e.pointerType !== 'mouse') tipTimer.current = setTimeout(() => setTip(null), 2500);
  };
  const tipProps = (text) => ({
    onPointerMove: (e) => { if (e.pointerType === 'mouse') showTip(e, text); },
    onPointerDown: (e) => showTip(e, text),
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setTip(null); },
  });

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

      <div className="pager pager-top">
        <button type="button" className="btn" onClick={() => step(-1)} aria-label="Gol precedente">◀</button>
        <span className="num">{pos >= 0 ? `GOL ${pos + 1}/${list.length}` : `${list.length} GOL IN LISTA`}</span>
        <button type="button" className="btn" onClick={() => step(1)} aria-label="Gol successivo">▶</button>
        <button type="button" className={`btn btn-drawer${drawer ? ' on' : ''}`} aria-expanded={drawer} aria-controls="gol-drawer" onClick={() => setDrawer(!drawer)}>
          {drawer ? '✕ CHIUDI' : `☰ PALINSESTO${filtersOn ? ' •' : ''}`}
        </button>
      </div>

      <div id="gol-drawer" className="drawer palinsesto" hidden={!drawer}>
        <div className="controls">
          <Selector
            label="COMPETIZIONE" value={comp}
            onChange={(c) => { setComp(c); if (c !== 'tutte' && teamF !== 'tutte' && !teams.find((t) => t.slug === teamF)?.comps.includes(c)) setTeamF('tutte'); }}
            options={[{ value: 'tutte', label: 'TUTTE' }, ...index.competitions.map((c) => ({ value: c.key, label: c.name.toUpperCase() }))]}
          />
          <Selector label="SQUADRA IN CAMPO" value={teamF} onChange={setTeamF} options={teamOptions} />
          <label className="field search">
            <span className="field-label">MARCATORE</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. MILITO" aria-label="Cerca marcatore" />
          </label>
          <Selector
            label="ORDINA" value={sort} onChange={setSort}
            options={[{ value: 'date', label: 'PIÙ RECENTI' }, { value: 'improbable', label: 'PIÙ IMPROBABILI (xG ↓)' }, { value: 'easy', label: 'PIÙ FACILI (xG ↑)' }]}
          />
        </div>

        <div className="chips chips-scroll" role="group" aria-label="Tipo di gol">
          {TAGS.map((x) => (
            <button key={x} type="button" className={`chip${tag === x ? ' on' : ''}`} aria-pressed={tag === x} onClick={() => setTag(x)}>
              {x.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="list-head">
          <span className="num">{list.length} GOL</span>
          {filtersOn && <button type="button" className="chip" onClick={resetFilters}>✕ AZZERA FILTRI</button>}
        </div>
        <div className="results" role="region" aria-label="Elenco gol">
          {list.length === 0 ? (
            <p className="empty">PAGINA NON DISPONIBILE. NESSUN GOL CON QUESTI FILTRI. RIPROVARE DOPO IL 90'.</p>
          ) : (
            <ul className="goal-list">
              {list.slice(0, shown).map((g) => (
                <li key={g.id}>
                  <button type="button" className={g.id === entry.id ? 'on' : ''} aria-current={g.id === entry.id ? 'true' : undefined} onClick={() => { setGoalId(g.id); if (vertical) setDrawer(false); }}>
                    <span className="gl-min num">{g.minute}'</span>
                    <span className="gl-who">{g.scorer.toUpperCase()}</span>
                    <span className="gl-match num">{teamName(teams, g.home).code} {g.after[0]}-{g.after[1]} {teamName(teams, g.away).code} · {dateOf[g.match_id].slice(0, 4)}</span>
                    <span className="gl-xg num">xG {g.xg.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.length > shown && (
            <button type="button" className="chip more" onClick={() => setShown(shown + 60)}>MOSTRA ALTRI {Math.min(60, list.length - shown)}</button>
          )}
        </div>
      </div>

      <div className="stage">
        <div className="stage-main">
          <div className={`pitch-box${vertical ? ' pitch-box-v' : ''}`} ref={boxRef}>
            {!goal && (
              <div className="loading">{loading ? 'PAGINA IN ARRIVO... 101... 102... 103...' : 'SEGNALE ASSENTE'}</div>
            )}
            {goal && tl && (
              <Pitch vertical={vertical} label={`Replay del gol di ${goal.scorer.name} al minuto ${goal.minute}`} goalGlow={done ? 1 : shotP}>
                <defs>
                  <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse">
                    <path d="M0,0L6,3L0,6z" fill={TT.yellow} />
                  </marker>
                </defs>

                {/* Phase 0: ghost of the whole move */}
                <polyline
                  className="ghost"
                  points={[...goal.chain.flatMap((a) => [a.s, a.e]), goal.start, goal.end.slice(0, 2)].map((p) => P(p).join(',')).join(' ')}
                  style={{ opacity: 0.45 * clamp01(T / tl.intro) }}
                />

                {goal.chain.map((a, i) => {
                  const p = progress(T, tl.actions[i]);
                  if (p <= 0) return null;
                  const tipText = `${KIND[a.k]}${a.x ? ` ${a.x}` : ''} · ${a.p.toUpperCase()}${a.ok ? '' : ' (non riuscito)'}`;
                  const common = { pathLength: 1, strokeDasharray: `${p} 1`, ...tipProps(tipText) };
                  const s0 = P(a.s);
                  const e0 = P(a.e);
                  if (a.k === 'pass') {
                    return <path key={i} d={`M${s0.join(',')}L${e0.join(',')}`} className="act act-pass" markerEnd={p >= 1 ? 'url(#arrow)' : undefined} {...common} />;
                  }
                  if (a.k === 'carry') return <path key={i} d={wavyPath(s0, e0)} className="act act-carry" {...common} />;
                  return (
                    <g key={i} {...tipProps(tipText)}>
                      <circle cx={s0[0]} cy={s0[1]} r={2.6 * p} className="act-dribble" />
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
                    const [px, py] = P([pl.x, pl.y]);
                    return (
                      <g key={pl.i} className={cls} transform={`translate(${px},${py})`} {...tipProps(tipText)}>
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
                  <path d={`M${P(goal.start).join(',')}L${P(goal.end.slice(0, 2)).join(',')}`} className="shot" pathLength={1} strokeDasharray={`${shotP} 1`} />
                )}

                {ball && <circle cx={P(ball)[0]} cy={P(ball)[1]} r={1.1} className="ball" />}
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
