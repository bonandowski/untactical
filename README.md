# Untactical

> Il Televideo della tattica. Mille gol veri, ricostruiti passaggio per passaggio, con dati open StatsBomb.

Sito statico (Vite + React + SVG) su **Serie A 2015/16** e **finali di Champions League 1999–2019**.
La specifica completa è in [`PLAN.md`](PLAN.md).

| Pagina | Route | Stato |
|---|---|---|
| P.101 Gol replay | `#/gol`, `#/gol/{goal_id}` | ✅ |
| P.201 Pass network + sonar | `#/rete` | 🚧 in allestimento |
| P.301 Pressing / territorio | `#/pressing` | 🚧 in allestimento |
| P.888 Dati e metodo | `#/dati` | ✅ |

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
- **Tema**: Televideo (scuro) di default, sempre. Il tema chiaro "carta rosa" è opzionale (toggle, salvato in
  localStorage). `prefers-color-scheme` è ignorato di proposito: il nero è l'identità del sito.
- **Il campo resta scuro in entrambi i temi** (è lo "schermo TV"). Compagni ciano, avversari rossi, portiere con
  bordo giallo, tiratore magenta: colori teletext invece dei colori squadra, per contrasto garantito su qualsiasi
  maglia. I colori squadra restano in `pipeline/common.py` per le prossime sezioni.
- **Catena del gol**: tengo solo Pass, Carry e Dribble (i Ball Receipt non aggiungono movimento). Il tiratore è
  aggiunto al freeze frame con flag `sh`.
- **Durate del replay stilizzate**: ogni azione dura 0.35 s + 0.22 × durata reale (max 3 s), così un'azione da
  47 s non dura 47 s.
- **Palla inattiva**: tiro su punizione/corner, oppure possesso nato da corner/punizione e tiro entro 10 s
  (altrimenti un possesso da 40 s nato da una punizione verrebbe etichettato come palla inattiva).
- **Commenti e badge** generati a template in `build_goals.py` (regole su xG, durata, passaggi, minuto, distanza);
  la frase è scelta in modo deterministico con un hash dell'id del gol.
- **Nomi giocatori**: uso `player_nickname` dai lineups quando c'è (Jorginho, non Jorge Luiz Frello Filho).
- **Champions**: la stagione 1999/2000 di StatsBomb contiene Fiorentina–Manchester United (fase a gironi), non la
  finale. Lasciata e dichiarata nella pagina Dati.
- **Lotteria dei rigori** (period 5) esclusa dai gol.
- **Zoom automatico** sulla metà offensiva quando tutta la catena sta oltre x = 58.
- **DEFAULT_GOAL**: Dybala, Lazio–Juventus 0-2 del 04.12.2015: 11 passaggi, xG 0.022.

## Crediti

Dati: [StatsBomb Open Data](https://github.com/statsbomb/open-data), uso non commerciale. Nessun logo di squadra:
solo nomi, colori e sigle.
