# Untactical

> Il Televideo della tattica. Mille gol veri, ricostruiti passaggio per passaggio, con dati open StatsBomb.

Sito statico (Vite + React + SVG) su **Serie A 2015/16** e **finali di Champions League 2004–2019**.
La specifica completa è in [`PLAN.md`](PLAN.md).

| Pagina | Route | Stato |
|---|---|---|
| P.101 Gol replay | `#/gol`, `#/gol/{goal_id}` | ✅ |
| P.201 Pass network + sonar | `#/rete` | ✅ |
| P.301 Pressing / territorio | `#/pressing` | 🚧 in allestimento |
| P.888 Dati e metodo | `#/dati` | ✅ |

All'apertura parte un'accensione da tubo catodico + ricerca pagina Televideo (una volta per sessione, saltabile, disattivata con `prefers-reduced-motion`).

Easter egg: digita un numero di pagina a tre cifre (101, 201, 301, 888) ovunque nel sito.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

## Rigenerare i dati

I JSON in `public/data/` sono committati: il deploy non esegue Python. Per rigenerarli:

```bash
python3 pipeline/download.py   # ~1.2 GB in data/raw/ (gitignored), idempotente
python3 pipeline/run_all.py    # → public/data/, controlla il budget (< 25 MB)
python3 -m pytest tests        # richiede pytest
```

Solo libreria standard Python 3.11+.

## Deploy

Vercel, collegato al repository: ogni push sul branch di produzione pubblica il sito.
Config in `vercel.json` (framework Vite, output `dist/`).

## Decisioni

Scelte non coperte da `PLAN.md`, o che se ne discostano:

- **Stile Televideo** al posto del design system del piano (Sora/Inter, accento `#e63c5a`): font VT323 in bundle
  (`@fontsource/vt323`), palette teletext a 8 colori. Tono "sfottò bonario". Mockup delle alternative in `mockups/stile.html`.
- **Solo tema scuro** (Televideo): niente toggle chiaro/scuro né `prefers-color-scheme`, il nero è l'identità del sito.
- **Campo scuro** (è lo "schermo TV"); linee, passaggi e tiri in colori teletext.
- **Maglie vere sui pallini**: ogni squadra ha prima e seconda maglia in `pipeline/common.py` (pattern `solid`,
  `stripes`, `halves`, `band`, `diagonal`), disegnate come pattern SVG (`src/lib/kits.jsx`). Se i colori principali
  di casa e trasferta sono troppo simili (distanza RGB < 140) la squadra in trasferta usa la seconda maglia.
  Colori ricostruiti a memoria sulle divise 2015/16 e delle finali: indicativi, non ufficiali.
- **Catena del gol**: tengo solo Pass, Carry e Dribble (i Ball Receipt non aggiungono movimento).
- **Tutti i 22 giocatori a ogni step** (`pipeline/tracks.py`): StatsBomb open non ha tracking. Per ogni giocatore
  in campo (XI + cambi − espulsi) calcolo una posizione per keyframe (inizio di ogni azione + tiro): esatta se
  il giocatore compare in un evento in quell'istante (azione, ricezione, pressing, duello…) o nel freeze frame;
  altrimenti interpolata tra i suoi eventi vicini e/o stimata dalla posizione media nella partita spostata verso la
  palla. Flag `exact` per keyframe; nel frontend pieno = rilevato, tratteggiato = stimato. ~13% dei punti è esatto.
- **Durate del replay stilizzate**: ogni azione dura 0.35 s + 0.22 × durata reale (max 3 s), così un'azione da
  47 s non dura 47 s.
- **Palla inattiva**: tiro su punizione/corner, oppure possesso nato da corner/punizione e tiro entro 10 s
  (altrimenti un possesso da 40 s nato da una punizione verrebbe etichettato come palla inattiva).
- **Commenti e badge** generati a template in `build_goals.py` (regole su xG, durata, passaggi, minuto, distanza);
  la frase è scelta in modo deterministico con un hash dell'id del gol.
- **Nomi giocatori**: uso `player_nickname` dai lineups quando c'è (Jorginho, non Jorge Luiz Frello Filho).
- **Champions**: esclusa la stagione 1999/2000 (season_id 76): StatsBomb contiene Fiorentina–Manchester United della
  fase a gironi, non la finale. Restano 14 finali, 2004–2019.
- **Lotteria dei rigori** (period 5) esclusa dai gol.
- **Niente zoom automatico**: con tutti i 22 in campo serve sempre il campo intero.
- **Pass network**: sonar su tutti i passaggi della partita (rimesse e calci d'inizio esclusi), non solo fino al
  primo cambio come la rete. Possesso = somma delle durate dei possessi StatsBomb. Default: Napoli, la partita
  con più passaggi. Frecce a dimensione fissa, archi curvi per separare A→B da B→A.
- **DEFAULT_GOAL**: Dybala, Lazio–Juventus 0-2 del 04.12.2015: 11 passaggi, xG 0.022.

## Crediti

Dati: [StatsBomb Open Data](https://github.com/statsbomb/open-data), uso non commerciale. Nessun logo di squadra:
solo nomi, colori e sigle.
