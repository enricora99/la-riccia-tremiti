# La Riccia delle Tremiti — sito immersivo 3D

Restyling del sito di **La Riccia delle Tremiti**: noleggio gommoni senza patente e tour guidati alle Isole Tremiti dal 2006.

- **Viaggio 3D in scroll**: arcipelago procedurale (San Domino, San Nicola con l'abbazia-fortezza, Capraia, Cretaccio), mare con shader custom, luce dal mattino all'ora dorata, 8 inquadrature cinematografiche. A Capraia la camera si tuffa fino alla statua sommersa di Padre Pio (caustiche, banco di pesci, bolle, raggi di luce).
- **Guarda il viaggio / Salta**: il viaggio parte da solo e dura al massimo 30 secondi; si può saltare in qualsiasi momento.
- **Riduci movimento**: pulsante nell'intestazione (rispetta anche `prefers-reduced-motion`, la scelta resta salvata). Niente carrellate né smooth scroll: le tappe cambiano con uno stacco.
- **La flotta**: le foto vere delle 13 barche (dal sito originale), animate in WebGL — dondolio, acqua increspata, riflessi, transizione a onda.
- Marchio originale (logo e rosa `#e94598`) in intestazione, caricamento, "Chi siamo" e footer.

## Prestazioni

- La pagina appare subito su un poster (`public/poster*.webp`, un fotogramma del 3D); il 3D entra in dissolvenza quando è pronto.
- Il terreno è generato in tre Web Worker paralleli (`src/world/terrain.worker.js`) mentre si scarica Three.js.
- Le barche sono fuse in poche draw call (`src/world/bake.js`); la risoluzione si adatta alla velocità del dispositivo.

## Stack

Vite · Three.js · GSAP ScrollTrigger · Lenis

```bash
npm install
npm run dev
npm run build
```

## Dove modificare

- `src/data.js` — contatti, flotta (con il nome della foto in `public/fleet/`), capitoli del viaggio, FAQ
- `src/world/terrain.js` — forma delle isole (senza Three.js, usata anche dalla mappa)
- `src/world/islands.js` — punti di interesse, rotta della barca
- `src/world/scene.js` — inquadrature della camera (il tuffo è `diveShot`)
- `src/world/underwater.js` — fondale, statua, pesci
- `src/fleet.js` — galleria animata della flotta

Se cambi isole o luce dell'apertura, rigenera i poster con `renderStill(w, h)` del mondo 3D (in sviluppo: `createWorld(...).renderStill(1920, 1080)`).
