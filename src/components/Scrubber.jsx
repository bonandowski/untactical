import React, { useEffect, useRef } from 'react';

const SPEEDS = [0.5, 1, 2];

// Play/pause + timeline slider driving a normalised time t in [0, 1].
export default function Scrubber({ t, setT, playing, setPlaying, speed, setSpeed, duration }) {
  const last = useRef(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    last.current = null;
    const tick = (now) => {
      if (last.current != null) {
        const next = tRef.current + ((now - last.current) / 1000) * (speed / duration);
        if (next >= 1) { setT(1); setPlaying(false); return; }
        setT(next);
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const toggle = () => {
    if (!playing && t >= 1) setT(0);
    setPlaying(!playing);
  };
  const secs = (t * duration).toFixed(1).padStart(4, '0');

  return (
    <div className="scrubber">
      <button type="button" className="btn btn-play" onClick={toggle} aria-label={playing ? 'Pausa' : 'Play'}>
        {playing ? '▮▮' : '▶'}
      </button>
      <input
        type="range" min={0} max={1000} value={Math.round(t * 1000)}
        onChange={(e) => { setPlaying(false); setT(+e.target.value / 1000); }}
        aria-label="Posizione nel replay"
      />
      <span className="scrub-time num" aria-hidden="true">00:{secs}</span>
      <div className="speeds" role="group" aria-label="Velocità">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={`btn btn-speed${s === speed ? ' on' : ''}`} aria-pressed={s === speed} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
