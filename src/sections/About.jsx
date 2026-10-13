import React from 'react';

export default function About({ index }) {
  const n = index?.goals.length;
  return (
    <section className="section about" aria-labelledby="about-title">
      <header className="section-head">
        <h1 id="about-title" className="tt-title">DATI E METODO</h1>
        <p className="tt-sub">Da dove vengono i numeri, come li tratto, e dove sbagliano. (Sbagliano.)</p>
      </header>

      <h2 className="tt-h2">FONTE</h2>
      <p>
        Tutto viene dagli <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">open data di StatsBomb</a>,
        rilasciati per uso non commerciale. Ogni evento di ogni partita (passaggi, tiri, contrasti…) con coordinate
        su un campo di 120×80 iarde.
      </p>

      <h2 className="tt-h2">PERIMETRO</h2>
      <table className="tt-table">
        <thead><tr><th>DATASET</th><th>competition_id</th><th>season_id</th><th>PARTITE</th></tr></thead>
        <tbody>
          <tr><td>SERIE A 2015/16</td><td className="num">12</td><td className="num">27</td><td className="num">380</td></tr>
          <tr><td>CHAMPIONS LEAGUE</td><td className="num">16</td><td className="num">1, 2, 4, 21–27, 37, 39, 41, 44, 76</td><td className="num">15</td></tr>
        </tbody>
      </table>
      <p className="dim">
        Nota: le «finali» di Champions sono 14 finali vere (2004–2019) più un intruso, Fiorentina–Manchester United
        del 23.11.1999 (fase a gironi). StatsBomb l&apos;ha messo lì, io non l&apos;ho tolto: è un bel ricordo.
      </p>
      {n && <p>In totale: <span className="num hl">{n}</span> gol ricostruibili.</p>}

      <h2 className="tt-h2">COME LO CALCOLIAMO</h2>
      <ul className="tt-list">
        <li><b>Gol:</b> tiri con esito «Goal». Autogol esclusi dal replay (ma contati nel punteggio), rigori della lotteria finale esclusi.</li>
        <li><b>Catena:</b> le azioni (passaggi, conduzioni, dribbling) dello stesso possesso della squadra che segna, fino alle ultime 8 prima del tiro.</li>
        <li><b>Giocatori sul campo:</b> il «freeze frame» registrato al momento del tiro.</li>
        <li><b>xG:</b> il modello StatsBomb. Quanto spesso un tiro così diventa gol.</li>
        <li><b>Tag:</b> rigore; palla inattiva (punizione/corner diretti o entro 10 s); contropiede (catena &lt; 15 s partita dalla propria metà campo); azione manovrata (≥ 6 passaggi); assolo (dribbling o conduzione &gt; 20 m del marcatore).</li>
        <li><b>Badge e commenti:</b> regole fisse sui numeri, frasi scelte in modo deterministico. Nessuna intelligenza artificiale, solo molta stupidità naturale.</li>
      </ul>

      <h2 className="tt-h2">LIMITI</h2>
      <ul className="tt-list">
        <li>Niente dati 360: vediamo solo i giocatori inquadrati al momento del tiro, non tutti e 22.</li>
        <li>Una sola stagione di Serie A. Per i ricorsi rivolgersi a StatsBomb, non a me.</li>
        <li>Le posizioni sono quelle registrate dagli operatori: precise, non perfette.</li>
        <li>Le durate del replay sono stilizzate: un contropiede di 9 secondi non dura 9 secondi anche qui.</li>
      </ul>
    </section>
  );
}
