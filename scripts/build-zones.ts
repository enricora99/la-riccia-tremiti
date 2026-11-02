// Costruisce naviga/data/zones.geojson dai vertici del D.I. 14/07/1989 e dalla costa OSM.
// Uso: node scripts/build-zones.ts
// - Zona A (Pianosa), zona B (Caprara, S. Domino), zona C = mare nel perimetro non in zona B
// - Fasce 0–300 m e 300–600 m dalla costa (Turf buffer sulla costa OSM), solo dentro la zona C
import { readFileSync, writeFileSync } from 'node:fs';
import { featureCollection, polygon, lineString, point } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import buffer from '@turf/buffer';
import union from '@turf/union';
import difference from '@turf/difference';
import intersect from '@turf/intersect';
import area from '@turf/area';
import kinks from '@turf/kinks';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { parseDms, type LonLat } from '../naviga/core/coords.ts';

type Area = Feature<Polygon | MultiPolygon>;
const decreto = JSON.parse(readFileSync('naviga/data/decreto-1989.json', 'utf8'));
const land = JSON.parse(readFileSync('naviga/data/land.geojson', 'utf8'));

const V: Record<string, LonLat> = Object.fromEntries(
  Object.entries(decreto.vertici as Record<string, { lat: string; lon: string }>).map(([k, v]) => [k, [parseDms(v.lon), parseDms(v.lat)]]),
);
function ring(keys: string[]): Area {
  const pts = keys.map((k) => V[k]);
  const p = polygon([[...pts, pts[0]]]);
  const k = kinks(p);
  if (k.features.length) throw new Error(`Il poligono ${keys.join('-')} si autointerseca`);
  return p;
}
const clean = (f: Area | null, what: string): Area => {
  if (!f) throw new Error(`Geometria vuota: ${what}`);
  return f;
};
const minus = (a: Area, b: Area | null, what: string) => (b ? clean(difference(featureCollection([a, b])), what) : a);
const and = (a: Area, b: Area, what: string) => clean(intersect(featureCollection([a, b])), what);
const unionAll = (fs: Area[]) => fs.reduce((acc, f) => clean(union(featureCollection([acc, f])), 'unione'));

const landAll = unionAll(land.features as Area[]);
const perimetro = ring(decreto.poligoni.perimetro.vertici);
const zonaA = ring(decreto.poligoni.zonaA.vertici);
const bCaprara = ring(decreto.poligoni.zonaB_caprara.vertici);
const bSanDomino = ring(decreto.poligoni.zonaB_sandomino.vertici);

// Solo mare: si toglie la terraferma (le isole) da ogni zona
const seaA = minus(zonaA, landAll, 'zona A');
const seaBCap = minus(and(bCaprara, perimetro, 'B Caprara ∩ perimetro'), landAll, 'zona B Caprara');
const seaBSD = minus(and(bSanDomino, perimetro, 'B S. Domino ∩ perimetro'), landAll, 'zona B S. Domino');
const zoneB = unionAll([seaBCap, seaBSD]);
const seaC = minus(minus(perimetro, zoneB, 'zona C − B'), landAll, 'zona C');

// Fasce dalla costa (tutte le isole e gli scogli della costa OSM)
const b300 = clean(buffer(landAll, 300, { units: 'meters', steps: 24 }) as Area, 'buffer 300');
const b600 = clean(buffer(landAll, 600, { units: 'meters', steps: 24 }) as Area, 'buffer 600');
const c300 = and(seaC, b300, 'C entro 300 m');
const c600 = minus(and(seaC, b600, 'C entro 600 m'), b300, 'C 300–600 m');
const cOltre = minus(seaC, b600, 'C oltre 600 m');

const STATO = 'provvisorio – da validare con cartografia ufficiale Ente Parco';
const FONTE = `${decreto.fonte} (${decreto.url})`;
const FONTE_FASCE = `${FONTE}; fasce calcolate con Turf.js dalla costa OpenStreetMap (© OpenStreetMap contributors, ODbL)`;
const f = (g: Area, props: { id: string } & Record<string, unknown>) => ({ type: 'Feature', properties: { ...props, stato: STATO }, geometry: g.geometry });

const out = {
  type: 'FeatureCollection',
  metadata: { generato: new Date().toISOString().slice(0, 10), script: 'scripts/build-zones.ts', stato: STATO },
  features: [
    f(seaA, { id: 'zona-a-pianosa', zona: 'A', nome: 'Zona A – Pianosa (riserva integrale)', fonte: FONTE }),
    f(seaBCap, { id: 'zona-b-caprara', zona: 'B', nome: 'Zona B – Caprara', fonte: FONTE }),
    f(seaBSD, { id: 'zona-b-sandomino', zona: 'B', nome: 'Zona B – San Domino (Punta Provvidenza – Punta Secca)', fonte: FONTE }),
    f(c300, { id: 'zona-c-0-300', zona: 'C', fascia: '0-300', nome: 'Zona C – entro 300 m dalla costa', fonte: FONTE_FASCE }),
    f(c600, { id: 'zona-c-300-600', zona: 'C', fascia: '300-600', nome: 'Zona C – tra 300 e 600 m dalla costa', fonte: FONTE_FASCE }),
    f(cOltre, { id: 'zona-c-oltre-600', zona: 'C', fascia: 'oltre-600', nome: 'Zona C – oltre 600 m dalla costa', fonte: FONTE_FASCE }),
    { type: 'Feature', properties: { id: 'perimetro-amp', zona: 'perimetro', nome: 'Perimetro AMP Isole Tremiti (vertici a–i)', fonte: FONTE, stato: STATO }, geometry: lineString([...decreto.poligoni.perimetro.vertici, 'a'].map((k: string) => V[k])).geometry },
  ],
};
// coordinate a 6 decimali (~10 cm): file più leggero
const json = JSON.stringify(out, (k, v) => (typeof v === 'number' && k !== 'zona' ? Math.round(v * 1e6) / 1e6 : v));
writeFileSync('naviga/data/zones.geojson', json);

// Controlli: dove cadono i vertici l, m, n, o rispetto alla costa, e aree risultanti
const onLand = (k: string) => booleanPointInPolygon(point(V[k]), landAll);
console.log('vertici l, m, n, o a terra?', ['l', 'm', 'n', 'o'].map((k) => `${k}:${onLand(k) ? 'sì' : 'no'}`).join(' '));
for (const ft of out.features.filter((x) => x.geometry.type !== 'LineString')) {
  console.log(`${ft.properties.id.padEnd(20)} ${(area(ft as Area) / 1e6).toFixed(3)} km²`);
}
console.log(`zones.geojson: ${(json.length / 1024).toFixed(0)} kB`);
