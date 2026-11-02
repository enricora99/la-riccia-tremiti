// Genera il giro dimostrativo (modalità ?demo=1): San Domino e Caprara, con passaggi
// scelti apposta per far scattare gli avvisi: oltre 5 nodi sotto costa, entro 100 m da una grotta,
// dentro la zona B. Controlla che la rotta non attraversi la terra.
// Uso: node scripts/make-demo-gpx.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { distanceMeters } from '../naviga/core/geo.ts';
import { writeGpx, type TrackPoint } from '../naviga/core/gpx.ts';
import { indexZones, situationAt } from '../naviga/core/rules.ts';
import { createAlertTracker } from '../naviga/core/alerts.ts';
import type { LonLat } from '../naviga/core/coords.ts';

// [nome, lon, lat, nodi sul tratto che arriva qui]
const WAYPOINTS: [string, number, number, number][] = [
  ['Porto di San Domino', 15.4995, 42.1201, 0],
  ['Canale San Domino – San Nicola', 15.4991, 42.11728, 14],
  ['Cala Matano', 15.4967, 42.11416, 14],
  ['Scoglio dell\'Elefante', 15.49412, 42.11051, 14],
  ['Costa sud-est', 15.49172, 42.10771, 12],
  ['Grotta delle Viole', 15.48482, 42.10455, 4.5],
  ['Punta sud', 15.4814, 42.10268, 4.5],
  ['Costa sud-ovest', 15.4778, 42.10414, 4.5],
  ['Zona B', 15.47492, 42.10659, 4.5],
  ['Grotta del Bue Marino', 15.476, 42.10771, 4.5],
  ['Zona B nord', 15.4745, 42.11082, 4.5],
  ['Architiello', 15.4745, 42.1124, 4.5],
  ['Grotta delle Rondinelle', 15.4772, 42.1142, 4.5],
  ['Costa ovest', 15.47804, 42.11683, 4.5],
  ['Costa ovest 2', 15.48092, 42.11951, 4.5],
  ['Nord-ovest', 15.48392, 42.12307, 4.5],
  ['Punta nord', 15.49088, 42.12716, 4.5],
  ['Traversata', 15.4982, 42.12841, 4.5],
  ['Caprara sud', 15.5066, 42.12886, 4.5],
  ['Caprara sud-est', 15.508, 42.1285, 4.5],
  ['Verso Padre Pio', 15.5126, 42.13, 4.5],
  ['Sopra Padre Pio', 15.51248, 42.13117, 4.5],
  ['Rientro', 15.5108, 42.12886, 4.5],
  ['Rientro 2', 15.5048, 42.12552, 4.5],
  ['Rientro 3', 15.5006, 42.12106, 4.5],
  ['Porto di San Domino', 15.4995, 42.1201, 4.5],
];
const STEP_S = 2; // un punto ogni 2 secondi di navigazione
const START = Date.parse('2026-07-15T09:30:00Z');

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const land = read('naviga/data/land.geojson');
const idx = indexZones(read('naviga/data/zones.geojson'));
const rules = read('naviga/data/rules.json'), config = read('naviga/data/config.json');
const caves = read('naviga/data/poi.json').filter((p: { tipo: string }) => p.tipo === 'grotta');
const onLand = (p: LonLat) => land.features.some((f: never) => booleanPointInPolygon(p, f));
const lerp = (a: LonLat, b: LonLat, t: number): LonLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const points: TrackPoint[] = [];
let time = START;
const problems: string[] = [];
for (let i = 0; i < WAYPOINTS.length - 1; i++) {
  const [nameA, ax, ay] = WAYPOINTS[i];
  const [nameB, bx, by, kn] = WAYPOINTS[i + 1];
  const a: LonLat = [ax, ay], b: LonLat = [bx, by];
  const d = distanceMeters(a, b);
  for (let s = 0; s <= d; s += 10) if (onLand(lerp(a, b, s / d))) { problems.push(`${nameA} → ${nameB}: terra a ${Math.round(s)} m`); break; }
  const ms = kn / 1.94384;
  const n = Math.max(1, Math.round(d / ms / STEP_S));
  for (let k = 0; k < n; k++) {
    points.push({ lonLat: lerp(a, b, k / n), time, ...(k === 0 ? { name: nameA } : {}) });
    time += (d / ms / n) * 1000;
  }
}
const last = WAYPOINTS.at(-1)!;
points.push({ lonLat: [last[1], last[2]], time, name: last[0] });
if (problems.length) { console.error('La rotta tocca terra:\n' + problems.join('\n')); process.exit(1); }

// Quali avvisi scatterebbero, e dove (con il flag zona B a false)
const tracker = createAlertTracker({ caveMeters: config.avvisoGrottaMetri, toleranceKn: config.tolleranzaVelocitaNodi });
let prev: TrackPoint | null = null;
const events: string[] = [];
points.forEach((p, i) => {
  const kn = prev ? (distanceMeters(prev.lonLat, p.lonLat) / ((p.time - prev.time) / 1000)) * 1.94384 : null;
  const s = situationAt(p.lonLat, idx, rules, config);
  for (const a of tracker.update({ position: p.lonLat, situation: s, knots: kn, caves }).newly) {
    events.push(`#${i} ${a.kind}${a.poiId ? ' ' + a.poiId : ''}${a.limiteNodi ? ` (limite ${a.limiteNodi} kn, ${kn?.toFixed(1)} kn)` : ''}`);
  }
  prev = p;
});

mkdirSync('naviga/public/demo', { recursive: true });
writeFileSync('naviga/public/demo/giro-demo.gpx', writeGpx(points, 'La Riccia – giro dimostrativo San Domino e Caprara'));
console.log(`${points.length} punti, ${((time - START) / 60000).toFixed(1)} minuti di navigazione`);
console.log('avvisi previsti:\n  ' + events.join('\n  '));
