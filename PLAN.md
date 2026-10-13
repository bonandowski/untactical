# Calcio Open Viz — Piano di progetto

Minisito statico con tre visualizzazioni interattive sul calcio, costruite su dati open StatsBomb.
Perimetro dati: **Serie A 2015/16 (380 partite)** + **finali di Champions League 2004–2019**.

Questo file è la specifica di riferimento. Leggilo tutto prima di iniziare, poi procedi fase per fase
(sezione 9). Non saltare la fase 1: tutto il resto dipende dai JSON pre-calcolati.

---

## 1. Obiettivo e principi

- Un sito "vetrina", pubblico, bello da guardare, pochi grafici ma molto interattivi.
- Nessun backend: tutta la pipeline dati gira offline in Python e produce JSON statici; il frontend
  li carica e disegna tutto nel browser.
- Tre visualizzazioni, ognuna una pagina/sezione a tutto schermo:
  1. **Gol replay** — scegli un gol, lo vedi ricostruito sul campo.
  2. **Pass network + pass sonar** — scegli una squadra e scorri le partite.
  3. **Mappa pressing / territorio** — confronta due squadre.
- Racconto, non dashboard: ogni sezione ha un titolo, un sottotitolo di una riga che spiega cosa si
  sta guardando e al massimo 3 controlli.
- Mobile-first ma pensato per desktop: il campo deve restare leggibile a 380px di larghezza.

## 2. Dati

### 2.1 Sorgente
- Repository: `https://github.com/statsbomb/open-data` (licenza non commerciale, citare StatsBomb
  con logo in footer e pagina "Dati").
- Struttura: `data/competitions.json`, `data/matches/{competition_id}/{season_id}.json`,
  `data/events/{match_id}.json`, `data/lineups/{match_id}.json`.
- Nessun dato 360 per il nostro perimetro: le posizioni dei giocatori vengono dal campo
  `shot.freeze_frame` presente in ogni evento di tipo Shot.

### 2.2 ID da usare
| Dataset | competition_id | season_id | Note |
|---|---|---|---|
| Serie A 2015/16 | 12 | 27 | 380 partite, 20 squadre |
| Champions League finali | 16 | 1, 2, 4, 21, 22, 23, 24, 25, 26, 27, 37, 39, 41, 44, 76 | una partita per stagione, 1999/00 → 2018/19 |

Le stagioni CL 1970–73 (season_id 71, 276, 277) sono escluse: dati troppo vecchi e parziali.

### 2.3 Download
- Script `pipeline/download.py`: scarica solo i file necessari via raw.githubusercontent.com
  (competitions, matches delle stagioni sopra, events + lineups di ogni match_id trovato).
- Salva in `data/raw/` (gitignored). Idempotente: non riscarica file già presenti.
- Non usare `statsbombpy` come dipendenza obbligatoria (chiama l'API e pesa): lettura diretta dei JSON.

### 2.4 Sistema di coordinate StatsBomb
- Campo 120 × 80, origine in alto a sinistra, attacco sempre da sinistra a destra per la squadra
  che esegue l'evento.
- `location = [x, y]`; per i passaggi `pass.end_location`; per i tiri `shot.end_location` ha 3
  componenti (x, y, z).
- `shot.freeze_frame`: lista di `{location, player, position, teammate}`; coordinate già nel
  sistema del tiratore. Il tiratore non è incluso nella lista: va aggiunto da `location` dell'evento.
- Il frontend disegna sempre un campo 120×80 e non fa conversioni: ogni normalizzazione avviene
  in pipeline.

## 3. Architettura

```
calcio-open-viz/
├── PLAN.md                  # questo file
├── README.md
├── pipeline/                # Python 3.11+, solo stdlib + pandas (opzionale)
│   ├── download.py
│   ├── common.py            # loader JSON, mapping squadre/giocatori, utilità
│   ├── build_goals.py       # → public/data/goals/*.json
│   ├── build_networks.py    # → public/data/networks/*.json
│   ├── build_pressing.py    # → public/data/pressing/*.json
│   ├── build_index.py       # → public/data/index.json (cataloghi per i selettori)
│   └── run_all.py
├── data/raw/                # gitignored
├── public/
│   ├── data/                # JSON pre-calcolati, committati (budget: < 25 MB totali)
│   └── logos/               # NON includere loghi delle squadre (marchi): usare colori + sigla
└── src/                     # Vite + React 18 + D3 (solo moduli d3-scale, d3-shape, d3-selection)
    ├── main.jsx
    ├── App.jsx              # routing a hash: #/gol, #/rete, #/pressing, #/dati
    ├── lib/
    │   ├── pitch.js         # disegno campo SVG 120×80, scale, helper
    │   ├── theme.js         # token colori, light/dark
    │   └── data.js          # fetch + cache dei JSON
    ├── components/
    │   ├── Pitch.jsx
    │   ├── Selector.jsx     # select accessibile riusabile (squadra/partita/gol)
    │   ├── Scrubber.jsx     # play/pausa + slider temporale
    │   └── Legend.jsx
    └── sections/
        ├── GoalReplay.jsx
        ├── PassNetwork.jsx
        ├── PassSonar.jsx
        ├── Pressing.jsx
        └── About.jsx
```

Stack frontend: Vite + React + D3 per calcolo scale/path, rendering in SVG (non Canvas: pochi
elementi, serve l'interattività su hover). Animazioni con `requestAnimationFrame` controllato da
uno stato `t` (0→1) nello Scrubber, non con librerie di tweening.

Deploy: build statica (`vite build`) pubblicabile su GitHub Pages o qualsiasi hosting statico.
Nessuna chiamata di rete a runtime oltre ai propri JSON.

## 4. Specifica — Gol replay

### 4.1 Perimetro
Tutti i gol (escluse autoreti, incluse le reti su rigore con flag) di Serie A 2015/16 e delle
finali di Champions. Stima: ~980 gol Serie A + ~50 CL.

### 4.2 Pipeline (`build_goals.py`)
Per ogni evento Shot con `shot.outcome.name == "Goal"`:
1. Risali la **catena di possesso**: tutti gli eventi con lo stesso `possession` della squadra
   che segna, in ordine di `index`, fermandoti al tiro. Tieni solo Pass, Carry, Dribble, Shot,
   Ball Receipt. Taglia a massimo 8 azioni precedenti il tiro (le ultime 8).
2. Per ogni azione salva: tipo, giocatore (nome + id), `location`, `end_location` (per Pass/Carry),
   esito, `timestamp`, durata (`duration` o stimata).
3. Dal tiro salva: `location`, `end_location` (x,y,z), xG (`shot.statsbomb_xg`), parte del corpo,
   tipo di gioco (`shot.type`: Open Play, Penalty, Free Kick, Corner…), tecnica, e il
   `freeze_frame` completo (+ il tiratore stesso).
4. Metadati: competizione, stagione, partita (squadre, risultato, data), minuto, marcatore,
   assistman (dall'evento Pass con `pass.goal_assist == true` nella catena), punteggio prima e
   dopo il gol.
5. Calcola un **tag narrativo** automatico per il catalogo: "contropiede" (catena < 15 s e parte
   dalla metà difensiva), "palla inattiva", "rigore", "azione manovrata" (≥ 6 passaggi), "assolo"
   (≥ 1 Dribble o Carry > 20 m del marcatore), altrimenti "azione".

Output: un file per partita `public/data/goals/{match_id}.json` (lista di gol) + indice in
`index.json` con, per ogni gol, solo i campi necessari al selettore (match_id, goal_id, minuto,
marcatore, squadre, risultato, xG, tag). Questo evita di caricare 1000 gol all'avvio.

### 4.3 Interazione
- Selettori in cascata: Competizione → Squadra che segna → Partita → Gol. Più un filtro rapido
  per tag e un campo di ricerca per nome marcatore.
- Default all'apertura: un gol "bello" pre-scelto (hardcodato in `src/sections/GoalReplay.jsx`
  come `DEFAULT_GOAL`; sceglierlo dopo aver guardato i dati, criterio: catena lunga + xG basso).
- Scrubber play/pausa, slider, velocità 0.5×/1×/2×. Tasto spazio = play/pausa.
- Animazione:
  1. Fase 0: campo vuoto, appare la catena di passaggi come percorso tratteggiato grigio.
  2. Il pallone (cerchio) percorre la catena azione per azione; ogni passaggio disegna una
     freccia che resta visibile; i Carry sono linee ondulate.
  3. All'arrivo al tiro appaiono i 22 giocatori del freeze-frame (fade-in, cerchi: compagni colore
     squadra, avversari grigio, portiere con bordo), il tiratore evidenziato.
  4. Il tiro: linea dal tiratore a `end_location`, la porta si illumina, overlay con "xG 0.08".
- Hover su un giocatore del freeze-frame: tooltip nome + ruolo. Hover su una freccia: tipo di
  passaggio e giocatore.
- Pannello laterale (sotto su mobile): marcatore, assist, minuto, risultato, xG, tag, e una riga
  generata in pipeline tipo "7 passaggi in 14 secondi, dalla propria area".

### 4.4 Dettagli visivi
- Campo verde scuro desaturato, linee bianche 60% di opacità; in dark mode sfondo quasi nero con
  linee più tenui.
- Il tiro sempre da sinistra verso destra; mostra solo la metà campo offensiva ingrandita quando
  la catena inizia oltre il centrocampo (zoom automatico con transizione), altrimenti campo intero.

## 5. Specifica — Pass network + Pass sonar

### 5.1 Pipeline (`build_networks.py`)
Per ogni partita e per ciascuna delle due squadre:
1. Considera solo il periodo **fino alla prima sostituzione o primo cartellino rosso** della
   squadra (standard di settore per avere 11 giocatori fissi). Salva il minuto di taglio.
2. Nodi: per ogni titolare, posizione media di tutti i tocchi (eventi con `location` e
   `player`), numero di tocchi, numero di passaggi riusciti.
3. Archi: coppie (passatore → ricevitore) con conteggio passaggi completati
   (`pass.outcome` assente = riuscito; ricevitore = `pass.recipient`). Salva solo archi ≥ 2.
4. Sonar per giocatore: 24 settori angolari da 15°, per ciascuno conteggio passaggi, lunghezza
   media, % riusciti. Angolo calcolato da `location` a `end_location`.
5. Metriche squadra per la partita: possesso %, passaggi totali, % riusciti, lunghezza media,
   direzione media (quota di passaggi in avanti), "centralità" (share del giocatore più coinvolto).

Output: `public/data/networks/{team_slug}.json` contenente tutte le partite della squadra in
ordine cronologico (Serie A: 38 voci; squadre CL: 1 voce per finale). Un file per squadra
mantiene il payload contenuto e carica tutto quando si sceglie la squadra.

### 5.2 Interazione
- Selettore Squadra (le 20 di Serie A + le finaliste CL, raggruppate per competizione).
- Timeline orizzontale delle partite: un punto per giornata con risultato (V/N/P colorato).
  Clic o frecce ← → per cambiare partita. **Animazione**: i nodi si spostano con transizione
  600 ms verso le nuove posizioni e gli archi cambiano spessore. Questo è l'effetto chiave.
- Slider "minimo passaggi per arco" (2–10, default 4).
- Toggle "Metti in evidenza": nessuno / giocatore più coinvolto / archi più forti.
- Clic su un nodo → si apre il **Pass sonar** di quel giocatore nel pannello laterale (radar polare,
  raggio = numero passaggi, colore = % riusciti). Freccia per passare al giocatore successivo.
  Un secondo clic chiude.
- Pulsante "Confronta" (opzionale fase 5): mostra due partite affiancate della stessa squadra.

### 5.3 Dettagli visivi
- Nodi: raggio ∝ √tocchi, colore primario della squadra, bordo bianco, numero di maglia dentro il
  cerchio e cognome in etichetta esterna.
- Archi: spessore ∝ passaggi, opacità ∝ passaggi, curvi leggermente (quadratica) per distinguere
  A→B da B→A.
- In testa alla sezione: 4 numeri (possesso, passaggi, % riusciti, giocatore più coinvolto) che si
  aggiornano con count-up quando cambia partita.

## 6. Specifica — Mappa pressing / territorio

### 6.1 Pipeline (`build_pressing.py`)
Per ogni squadra, aggregato su tutta la stagione (Serie A) o sulla finale (CL), con split
primo/secondo tempo e in casa/trasferta:
1. **Recuperi palla**: eventi `Ball Recovery`, `Interception`, `Duel` vinto, `Pressure` seguita
   entro 5 s da un cambio di possesso. Griglia 12×8 (celle 10×10) con conteggi normalizzati per
   90 minuti.
2. **Altezza media delle azioni difensive**: media della x di tutti gli eventi difensivi
   (Pressure, Interception, Ball Recovery, Block, Clearance, Duel).
3. **PPDA**: passaggi avversari consentiti nei 60 m offensivi dell'avversario (x avversario < 60)
   diviso le azioni difensive della squadra nella stessa zona. Più basso = pressa di più.
4. **Linea difensiva media**: x media dei difensori (posizione dai `tactics.lineup` + posizioni
   medie dei tocchi dei 4/3 difensori) quando l'avversario ha il possesso.
5. **Territorio**: griglia 12×8 dei tocchi della squadra, normalizzati, per la heatmap di
   possesso (dove gioca).
6. Classifica di tutte le squadre su PPDA, altezza difensiva, recuperi nel terzo offensivo.

Output: `public/data/pressing/{team_slug}.json` + `pressing/league.json` con la classifica.

### 6.2 Interazione
- Due selettori squadra affiancati (A e B); default: Napoli vs Juventus 2015/16.
- Toggle metrica: Recuperi / Territorio. Toggle tempo: Tutto / 1° / 2°. Toggle: Casa / Trasferta.
- Due campi affiancati (impilati su mobile) con heatmap a celle (non kernel density: le celle
  rendono meglio il confronto quantitativo), stessa scala colore per A e B.
- Sopra ogni campo: una linea verticale "altezza media difensiva" e un badge PPDA. Un piccolo
  strip-plot in fondo mostra dove A e B si collocano rispetto alle altre 18 squadre su PPDA e
  altezza.
- Hover su una cella: numero di recuperi/90 e percentile nella lega.

## 7. Design system

- Font: titoli con una display geometrica (Google Fonts: "Sora" o "Space Grotesk"), testo con
  "Inter"; numeri in `font-variant-numeric: tabular-nums`.
- Palette: sfondo chiaro `#f6f5f1` / scuro `#0e0f12`; accento unico `#e63c5a` per gol, tiri,
  evidenziazioni; grigi neutri per tutto il resto. Colori squadre definiti in `theme.js`
  (primario + secondario per ciascuna delle 20 + finaliste CL), scelti per contrasto su campo.
- Light/dark con toggle, token CSS su `:root` e `[data-theme=dark]`, rispetto di
  `prefers-color-scheme`.
- Ogni sezione: titolo grande, sottotitolo di una riga che spiega la visualizzazione in parole
  semplici, controlli in una barra compatta, grafico, pannello laterale, nota metodologica
  espandibile in fondo ("Come lo calcoliamo").
- Niente loghi, nomi di sponsor, foto o marchi: solo nome squadra, colori e sigla a 3 lettere.

## 8. Qualità e vincoli

- Budget JSON totale < 25 MB; singolo file < 1,5 MB. Se `goals/{match_id}.json` supera il budget
  ridurre i decimali (1 cifra) e togliere campi non usati.
- Numeri a 1 decimale nelle coordinate, 3 nello xG.
- Test pipeline (`pytest`): su una partita nota (es. Juventus–Napoli 2016-02-13, gol di Zaza)
  verificare che il gol esista, che la catena sia non vuota, che il freeze-frame contenga 11+ punti,
  che la pass network abbia 11 nodi.
- Lighthouse: performance ≥ 90 su mobile, accessibilità ≥ 90. Ogni controllo deve essere
  raggiungibile da tastiera e avere `aria-label`.
- Nessuna dipendenza da CDN a runtime: tutto in bundle.
- Pagina "Dati e metodo": fonte, licenza, ID competizioni, come sono calcolate le metriche,
  limiti (no 360, una sola stagione, freeze-frame solo dei giocatori inquadrati).

## 9. Fasi di lavoro

Eseguire in ordine, con commit alla fine di ogni fase. Mostrare sempre un'anteprima prima di
passare alla fase successiva.

**Fase 1 — Dati (pipeline)**
1. `download.py` + verifica conteggi (380 partite Serie A, 15 finali CL).
2. `common.py` con loader, slug squadre, tabella colori.
3. `build_index.py`: cataloghi per i selettori.
4. `build_goals.py` + test. Stampare 10 gol a caso per controllo manuale.
5. `build_networks.py` + test.
6. `build_pressing.py` + test.
7. `run_all.py`, misura dimensione output, ottimizza se oltre budget.

**Fase 2 — Scheletro frontend**
1. Vite + React, routing hash, layout, tema light/dark, `Pitch.jsx` con campo 120×80 responsive.
2. `data.js` con fetch + cache e stato di caricamento.
3. Pagina "Dati e metodo".

**Fase 3 — Gol replay** (sezione più complessa: farla per prima per scoprire problemi sui dati)
1. Selettori a cascata + ricerca.
2. Rendering statico: catena + freeze-frame + tiro.
3. Scrubber e animazione.
4. Zoom automatico, tooltip, pannello laterale.

**Fase 4 — Pass network + sonar**
1. Rendering statico della rete per una partita.
2. Timeline partite e transizione animata.
3. Sonar nel pannello laterale.
4. KPI con count-up.

**Fase 5 — Pressing**
1. Heatmap a celle con scala condivisa.
2. Linea difensiva, PPDA, strip-plot di lega.
3. Toggle tempo e casa/trasferta.

**Fase 6 — Rifinitura**
1. Scelta dei default "belli" per ogni sezione (DEFAULT_GOAL, squadra default, confronto default).
2. Pass su mobile, tastiera, contrasti.
3. Lighthouse, pulizia bundle, README con istruzioni per rigenerare i dati.

## 10. Convenzioni per Claude Code

- Lingua: codice e commenti in inglese, UI e testi in italiano.
- Prima di scrivere ogni `build_*.py`, ispezionare un file evento reale e stampare la struttura
  dei campi usati: non assumere i nomi dei campi a memoria.
- Quando una scelta di design non è coperta da questo piano, scegliere l'opzione più semplice e
  annotarla in `README.md` sotto "Decisioni".
- Non introdurre librerie di grafici (Recharts, Plotly, Chart.js): tutto in SVG con D3 per scale e
  path. L'unica eccezione ammessa è `d3-geo` se servisse, ma non dovrebbe.
- Non aggiungere backend, database, autenticazione o analytics.
