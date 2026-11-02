# La Riccia · Naviga — web app per i clienti del noleggio (fase 1, prototipo PWA)

Supporto informativo per chi noleggia un gommone alle Isole Tremiti: posizione e direzione, velocità
confrontata con il limite del punto in cui ci si trova, zone dell'Area Marina Protetta, attrazioni con distanza
e rilevamento in linea retta, rientro al porto, SOS. Funziona offline dopo la prima apertura.

**Non è uno strumento di navigazione.** Le zone sono provvisorie (vedi "Da verificare").

- Indirizzo: `/naviga/` accanto al sito (es. `https://la-riccia-tremiti.vercel.app/naviga/`)
- Demo da terra: `/naviga/?demo=1` (giro registrato attorno a San Domino e Caprara, velocità ×20 regolabile)
- Privacy: `/naviga/privacy.html`

## Struttura

```
naviga/
  core/        logica di dominio in TypeScript puro, senza browser (riusabile in React Native)
    coords.ts    gradi-primi-secondi ⇄ decimali
    geo.ts       distanza, rilevamento, velocità in nodi (GPS o calcolata tra due fix), direzione di moto
    rules.ts     in che zona sono, che regole valgono, limite di velocità del punto
    alerts.ts    avvisi con isteresi (velocità, zona A, zona B, grotte entro 100 m)
    gpx.ts       lettura/scrittura GPX senza DOMParser
    types.ts     tipi dei file di data/
    core.test.ts test Vitest
  data/        dati (JSON/GeoJSON), letti dall'app e dal core
  app/         interfaccia web (MapLibre, sorgenti di posizione, suono, wake lock, bussola, i18n)
  public/      file statici serviti così come sono: estratto PMTiles, font, icone mappa, icone app, GPX demo
  e2e/         test Playwright
  docs/        anteprime delle zone e cartografia ufficiale di confronto (Allegato 1 del Disciplinare)
scripts/       script una tantum (download OSM, costruzione zone, controllo POI, GPX demo)
```

## Dati (`naviga/data/`)

| File | Contenuto | Origine |
|---|---|---|
| `rules.json` | Regole mostrate all'utente: `id`, `testo.it`, `testo.en`, `riferimento` (articolo), `fonte` (URL), eventuali `limiteNodi` e `distanzaMetri`. **Tutti i testi delle regole nell'app vengono da qui.** | Disciplinare AMP Tremiti 2026 |
| `config.json` | `zonaBAutorizzata` (default `false`), porto di rientro, soglia grotte (100 m), tolleranza velocità (0,5 nodi), numeri SOS | La Riccia |
| `zones.geojson` | Zona A, zona B (Caprara, San Domino), zona C divisa in fasce 0–300 m, 300–600 m, oltre 600 m, perimetro. Ogni feature: `id`, `zona`, `fascia`, `nome`, `fonte`, `stato` | Generato da `scripts/build-zones.ts` |
| `decreto-1989.json` | Vertici del D.I. 14/07/1989 art. 4 (in gradi-primi-secondi, come nel testo) e costruzione dei poligoni | Trascritto e ricontrollato a mano |
| `poi.json` | Attrazioni: `id`, `nome`/`descrizione` IT/EN, `tipo`, `lat`, `lon`, `accessoNoleggio` (`consentito` / `solo esterno` / `vietato`), `verificato`, `fonteCoordinate` | OSM, da sostituire con le coordinate della cliente |
| `land.geojson` | Costa (anelli chiusi di `natural=coastline`) | OSM, `scripts/fetch-osm.ts` |
| `seamarks.geojson` | Segnalamenti nautici `seamark:*` | OSM/OpenSeaMap, `scripts/fetch-osm.ts` |

Come l'app decide il limite in un punto (`core/rules.ts`): zona A → vietato; zona B → vietato se
`zonaBAutorizzata` è `false`, altrimenti 5 nodi; zona C entro 300 m → 5 nodi; tra 300 e 600 m → 10 nodi;
oltre 600 m o fuori dall'AMP → nessun limite dell'AMP (l'app lo dice esplicitamente).

## Aggiornare le regole a ogni nuova annualità del Disciplinare

1. Scarica il nuovo Disciplinare dal sito dell'Ente Parco (parcogargano.it, sezione AMP Isole Tremiti).
2. Per ogni voce di `rules.json` ricontrolla **sul PDF** numero di articolo, comma e lettera, e i valori
   (nodi, metri). Aggiorna `riferimento`, `fonte`, `annualita`, `documento`, `fonteUrl` e `verificato`.
3. Se cambia un limite, aggiorna `limiteNodi`; se cambiano le fasce di distanza (300/600 m), aggiorna anche
   `scripts/build-zones.ts` e rigenera le zone (`npm run naviga:zones`).
4. Non aggiungere regole che non sono nel testo. Se ne serve una nuova, aggiungila con un `id` nuovo e
   collegala in `core/rules.ts` (e nei test).
5. Se l'Ente Parco pubblica una nuova zonazione o coordinate ufficiali, aggiorna `decreto-1989.json` (o
   sostituisci `zones.geojson` con la cartografia ufficiale) e rigenera.
6. `npm run naviga:test` e `npm run naviga:e2e`, poi pubblica: il service worker aggiorna l'app dei clienti
   alla prima apertura con rete.

Il flag `zonaBAutorizzata` in `config.json` va messo a `true` solo con l'autorizzazione dell'Ente Parco
(art. 17 c. 2) in mano.

## Comandi

```bash
npm run naviga:dev        # sviluppo su http://localhost:5180/naviga/ (service worker spento)
npm run build             # sito + app (Vercel usa questo)
npm run naviga:preview    # anteprima della build su http://localhost:4180/naviga/
npm run naviga:test       # test Vitest del core
npm run naviga:e2e        # test Playwright (build + preview automatici; ~5 minuti)
npm run naviga:typecheck
npm run naviga:osm        # riscarica costa e segnalamenti da Overpass (solo se serve davvero)
npm run naviga:zones      # ricostruisce zones.geojson e controlla in che zona cadono le attrazioni
npm run naviga:demo-gpx   # rigenera il giro della demo (controlla che non tocchi terra)
```

Estratto mappa (una tantum, con il CLI ufficiale [go-pmtiles](https://github.com/protomaps/go-pmtiles)):

```bash
pmtiles extract https://build.protomaps.com/AAAAMMGG.pmtiles naviga/public/tiles/tremiti.pmtiles --bbox=15.40,42.04,15.80,42.25
```

Font e icone della mappa vengono da [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets)
(Noto Sans Regular/Medium/Italic, intervalli 0-255, 256-511, 8192-8447; sprite `v4/light`).

## Offline e PWA

Build separata (`naviga/vite.config.ts`, base `/naviga/`) con `vite-plugin-pwa` (Workbox). Il service worker
sta in `/naviga/sw.js` e controlla solo `/naviga/`: il sito resta com'è. In precache **27 file, circa 3,9 MB**:

| Voce | Peso |
|---|---|
| App (JS con MapLibre e dati) | 1,3 MB |
| Worker di MapLibre | 0,5 MB |
| Estratto PMTiles | 1,0 MB |
| Font della mappa | 0,8 MB |
| Traccia demo | 0,17 MB |
| CSS, icone, sprite, HTML | 0,2 MB |

L'estratto PMTiles viene letto per intero in memoria (1 MB) invece che a richieste HTTP Range: così funziona
anche quando arriva dalla cache del service worker. Nessuna tile online.

## Privacy

Nessun dato di posizione inviato a server, nessuna analytics, nessun login. La posizione lascia il telefono
solo se l'utente, nel pannello SOS, apre WhatsApp e invia il messaggio. In memoria del browser restano solo
lingua e accettazione dell'avvertenza.

## Limiti noti del web su telefono

- iOS: niente vibrazione dal web (avviso visivo + suono). Con l'interruttore silenzioso attivo il suono
  di Web Audio può non sentirsi.
- Bussola: su iOS il permesso si chiede con un tocco sul pulsante; senza permesso si usa la direzione del GPS.
- Schermo acceso (Screen Wake Lock): se il browser non lo supporta compare l'avviso "tieni lo schermo acceso".
- Il GPS del telefono in mare aperto è preciso a qualche metro, ma i confini delle zone sono provvisori:
  vicino a un confine l'app può sbagliare di decine di metri.

## Test

- `core/core.test.ts` (Vitest, 21 test): conversioni di coordinate, distanze e rilevamenti, velocità,
  punto-in-poligono sulle zone, limite di velocità per posizione (anche con zona B autorizzata), avvisi con
  isteresi, GPX, coerenza dei dati.
- `e2e/demo-route.spec.ts` (Playwright, Chromium): percorre tutto il giro della demo con la geolocalizzazione
  simulata del browser e verifica che gli avvisi (velocità sotto costa, grotta delle Viole, zona B) compaiano
  nei punti previsti dal core e che non ne compaiano altri; SOS; primo avvio; funzionamento in modalità aereo
  dopo la prima apertura.

## Attribuzioni

- Dati cartografici © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licenza ODbL
- Segnalamenti nautici: [OpenSeaMap](https://www.openseamap.org) (dati OSM `seamark:*`)
- Mappa di base: [Protomaps](https://protomaps.com) (basemap da OSM e Natural Earth), font Noto Sans (OFL)
- Zone: D.I. 14/07/1989 "Isole Tremiti"; regole: Disciplinare provvisorio AMP Isole Tremiti, annualità 2026
  (Ente Parco Nazionale del Gargano)

L'attribuzione è sempre visibile in basso a sinistra sulla mappa.

## Da verificare

- **Coordinate delle attrazioni**: tutte da OSM (`verificato: false`). Elefante, Bue Marino, Rondinelle,
  Architiello cadono sulla linea di costa; la statua di Padre Pio cade quasi sul confine zona B/C.
  Esistono due "Architiello" in OSM (San Domino, usato, e Caprara).
- **Poligoni delle zone**: ricostruiti dal testo del D.I. 1989 e confrontati a occhio con l'Allegato 1 del
  Disciplinare 2026. Il decreto non dice in che sistema di riferimento sono le coordinate: trattate come
  WGS84; se fossero ED50/Roma40 i confini si sposterebbero di circa 100 m (Pianosa tocca il bordo nord della
  zona A, indizio da controllare).
- **Fasce 300/600 m**: calcolate dalla costa OSM (scogli compresi). La "costa" del Disciplinare potrebbe
  essere intesa diversamente (es. solo isole maggiori).
- **Autorizzazione zona B** di La Riccia (oggi `zonaBAutorizzata: false`).
- **Posizione dei gavitelli** per il noleggio (24 gavitelli fino a 4 gommoni, art. 12): nell'Allegato 1 ci
  sono solo come disegno, senza coordinate. Per ora l'app non li mostra.
- **Coordinate del porto / biglietteria 13** e punto di rientro esatto.
- **Segnalamenti**: in OSM ce ne sono solo 11 nell'area.

## Domande per la cliente

1. La Riccia ha l'autorizzazione per la zona B (art. 17 c. 2)? Per quali barche e fino a quando?
2. Coordinate esatte (o un punto sulla mappa) di ogni attrazione e del punto da cui guardarla: le grotte si
   vedono dall'esterno, a che distanza fate fermare i clienti?
3. Dove sono i gavitelli assegnati a La Riccia e quali usate di solito (Cala delle Arene, Canale San Nicola)?
4. Punto esatto di partenza e rientro (biglietteria 13, pontile)? Anche un pontile a San Nicola?
5. Altre attrazioni da aggiungere (Cala delle Arene, Cala Spido, Grotta del Sale, Cala Tamariello…)? Testi
   brevi IT/EN già pronti?
6. Il messaggio SOS su WhatsApp va al 348 917 1971 o a un altro numero di reperibilità in mare?
7. Va bene il testo dell'avvertenza? Va fatto rivedere da un legale?
8. Raccomandazioni che date a voce (es. "non passate tra San Domino e il Cretaccio", orari, meteo) da mettere
   nell'app — solo se hanno una fonte da citare o sono istruzioni del noleggio.
9. Quali telefoni usano di solito i clienti (iPhone/Android)? Ci serve per la prova in mare.
10. L'app va proposta con un QR al momento del noleggio? Serve un nome diverso da "La Riccia · Naviga"?
