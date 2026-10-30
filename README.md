# La Riccia delle Tremiti — sito immersivo 3D

Restyling del sito di **La Riccia delle Tremiti**: noleggio gommoni senza patente e tour guidati alle Isole Tremiti dal 2006.

- **Viaggio 3D in scroll**: arcipelago procedurale (San Domino, San Nicola con l'abbazia-fortezza, Capraia, Cretaccio), mare con shader custom (turchese sulle coste, schiuma, riflessi del sole), cielo e luce che passano dal mattino all'ora dorata, 8 inquadrature cinematografiche che seguono il gommone tra Cala Matano, Bue Marino, Architiello, Elefante, Padre Pio e San Nicola.
- **La flotta in 3D**: i 13 gommoni generati proceduralmente (lunghezza, tubolari, tendalino, fuoribordo Honda 20/30/40 cv), filtrabili per categoria e prenotabili su WhatsApp.
- Responsive, `prefers-reduced-motion`, nessuna immagine esterna.

## Stack

Vite · Three.js · GSAP ScrollTrigger · Lenis

```bash
npm install
npm run dev
npm run build
```

## Dove modificare

- `src/data.js` — contatti, flotta (colori dei tubolari indicativi: allinearli alle foto reali), capitoli del viaggio, FAQ
- `src/world/islands.js` — forma delle isole, punti di interesse, rotta della barca
- `src/world/scene.js` — inquadrature della camera
- `src/world/boat.js` — modello procedurale del gommone
