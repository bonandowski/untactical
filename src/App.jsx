import React, { useEffect, useState } from 'react';
import GoalReplay from './sections/GoalReplay.jsx';
import About from './sections/About.jsx';
import Placeholder from './sections/Placeholder.jsx';
import PassNetwork from './sections/PassNetwork.jsx';
import { useJson } from './lib/data.js';
import { KitDefs } from './lib/kits.jsx';
import BootScreen from './components/BootScreen.jsx';

export const PAGES = [
  { route: 'gol', page: 101, label: 'GOL', color: 'red' },
  { route: 'rete', page: 201, label: 'RETI', color: 'green' },
  { route: 'pressing', page: 301, label: 'PRESSING', color: 'yellow' },
  { route: 'dati', page: 888, label: 'DATI', color: 'cyan' },
];

function parseHash() {
  const [route = 'gol', arg = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { route: PAGES.some((p) => p.route === route) ? route : 'gol', arg };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function App() {
  const [loc, setLoc] = useState(parseHash);
  const [typed, setTyped] = useState('');
  const [notFound, setNotFound] = useState(false);
  const { data: index, error } = useJson('index.json');
  const now = useClock();

  useEffect(() => {
    const on = () => setLoc(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const current = PAGES.find((p) => p.route === loc.route);
  useEffect(() => { document.title = `Untactical · P.${current.page}`; }, [current]);

  // Teletext muscle memory: type a three-digit page number anywhere to jump there.
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (!/^[0-9]$/.test(e.key)) return;
      setTyped((prev) => {
        const next = (prev + e.key).slice(-3);
        if (next.length === 3) {
          const target = PAGES.find((p) => String(p.page) === next);
          if (target) window.location.hash = `#/${target.route}`;
          else { setNotFound(true); setTimeout(() => setNotFound(false), 2200); }
          return '';
        }
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setGoalId = (id) => { window.location.hash = `#/gol/${id}`; };
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return (
    <div className="app">
      <BootScreen />
      <a className="skip" href="#main">Salta al contenuto</a>
      {index && <KitDefs teams={index.teams} />}
      <header className="topbar">
        <span className="num">P.{typed ? typed.padEnd(3, '_') : current.page} UNTACTICAL</span>
        <span className="topbar-mid">{notFound ? 'PAGINA NON DISPONIBILE' : 'IL TELEVIDEO DELLA TATTICA'}</span>
        <span className="num">{now.getDate().toString().padStart(2, '0')}.{String(now.getMonth() + 1).padStart(2, '0')} {hh}:{mm}:{ss}</span>
      </header>

      <nav className="fastext" aria-label="Sezioni">
        {PAGES.map((p) => (
          <a key={p.route} href={`#/${p.route}`} className={`ft ft-${p.color}${p.route === loc.route ? ' on' : ''}`} aria-current={p.route === loc.route ? 'page' : undefined}>
            <span className="ft-num num">{p.page}</span> {p.label}
          </a>
        ))}
      </nav>

      <div className="brand">
        <p className="brand-name" aria-hidden="true">UNTACTICAL</p>
        <p className="brand-sub">LA PAGINA CHE TUO NONNO CONSULTAVA ALLE 17:50. ORA CON L&apos;xG.</p>
      </div>

      <main id="main">
        {error && <p className="loading">SEGNALE ASSENTE. CONTROLLARE L&apos;ANTENNA ({String(error.message)}).</p>}
        {!index && !error && <p className="loading">PAGINA IN ARRIVO... 101... 102... 103...</p>}
        {index && loc.route === 'gol' && <GoalReplay index={index} goalId={loc.arg} setGoalId={setGoalId} />}
        {index && loc.route === 'rete' && <PassNetwork index={index} />}
        {loc.route === 'pressing' && (
          <Placeholder
            page={301} title="CHI PRESSA CHI"
            text="Mappe di pressing, PPDA e linea difensiva: chi morde alto e chi parcheggia il pullman. In allestimento: il pullman è ancora in officina."
          />
        )}
        {loc.route === 'dati' && <About index={index} />}
      </main>

      <footer className="footer">
        <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer" className="sb">
          <span>DATI</span>
          <img src={`${import.meta.env.BASE_URL}statsbomb.png`} alt="StatsBomb" width="150" height="24" />
        </a>
        <span>Dati open StatsBomb, uso non commerciale. Nessun logo di squadra è stato maltrattato: solo colori e sigle.</span>
        <span className="hint">DIGITA 101 · 201 · 301 · 888 PER CAMBIARE PAGINA</span>
      </footer>
    </div>
  );
}
