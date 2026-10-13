import React from 'react';

const BARS = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff2b2b', '#0000d6', '#000000'];

// Teletext "page under construction" with a colour-bar test card.
export default function Placeholder({ page, title, text }) {
  return (
    <section className="section" aria-labelledby={`p${page}`}>
      <header className="section-head">
        <h1 id={`p${page}`} className="tt-title">{title}</h1>
        <p className="tt-sub">PAGINA {page} IN ALLESTIMENTO<span className="blink">_</span></p>
      </header>
      <div className="testcard" aria-hidden="true">
        {BARS.map((c) => <span key={c} style={{ background: c }} />)}
        <div className="testcard-label">MONOSCOPIO · TORNIAMO SUBITO</div>
      </div>
      <p className="placeholder-text">{text}</p>
      <p className="placeholder-text dim">NEL FRATTEMPO: <a href="#/gol">P.101 GOL REPLAY</a></p>
    </section>
  );
}
