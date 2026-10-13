import React, { useEffect, useState } from 'react';

const QUIPS = [
  'IL SEGNALE È DEBOLE. COME LA DIFESA DEL FROSINONE 2015/16.',
  'REGOLARE L\'ANTENNA. OPPURE DARE UNA BOTTA AL TELEVISORE.',
  'ATTENDERE: STIAMO RICOSTRUENDO 998 GOL A MANO. SCHERZO, PYTHON.',
  'SE VEDI LA NEVE NON È IL CAMPO DI UDINE A GENNAIO.',
];
const TOTAL_MS = 2600;
const SEEN_KEY = 'untactical-boot-seen';

function alreadySeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

// CRT power-on + teletext page search, shown once per session. Click or any key skips it.
export default function BootScreen() {
  const [on, setOn] = useState(() => {
    if (alreadySeen()) return false;
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  });
  const [page, setPage] = useState(100);
  const [quip] = useState(() => QUIPS[Math.floor(Math.random() * QUIPS.length)]);

  useEffect(() => {
    if (!on) return undefined;
    markSeen();
    const end = setTimeout(() => setOn(false), TOTAL_MS);
    const tick = setTimeout(() => setPage(101), 1650);
    const skip = () => setOn(false);
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      clearTimeout(end);
      clearTimeout(tick);
      window.removeEventListener('keydown', skip);
    };
  }, [on]);

  if (!on) return null;
  return (
    <div className="boot" onClick={() => setOn(false)} role="presentation" aria-hidden="true">
      <div className="boot-flash" />
      <div className="boot-snow" />
      <div className="boot-page">
        <div className="boot-row boot-bar" style={{ '--d': '1.05s' }}>
          <span>P{page}</span><span>UNTACTICAL</span><span className="blink">█</span>
        </div>
        <div className="boot-row boot-search" style={{ '--d': '1.15s' }}>RICERCA PAGINA {page}...</div>
        <div className="boot-row boot-logo" style={{ '--d': '1.35s' }}>UNTACTICAL</div>
        <div className="boot-row boot-sub" style={{ '--d': '1.55s' }}>IL TELEVIDEO DELLA TATTICA</div>
        <div className="boot-row boot-colors" style={{ '--d': '1.7s' }}>
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="boot-row boot-quip" style={{ '--d': '1.85s' }}>{quip}</div>
        <div className="boot-row boot-skip" style={{ '--d': '1.95s' }}>PREMERE UN TASTO PER SALTARE</div>
      </div>
      <div className="boot-scan" />
    </div>
  );
}
