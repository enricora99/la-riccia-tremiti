// Scarica UNA SOLA VOLTA da Overpass la costa OSM e i segnalamenti nautici dell'area,
// e li salva come GeoJSON in naviga/data/. Uso: node scripts/fetch-osm.ts
// Dati © OpenStreetMap contributors, licenza ODbL.
import { writeFileSync } from 'node:fs';
import dns from 'node:dns';

// alcune reti non instradano IPv6: si prova prima IPv4
dns.setDefaultResultOrder('ipv4first');

const BBOX = '42.04,15.40,42.25,15.80'; // sud, ovest, nord, est
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'LaRicciaNaviga/0.1 (prototipo informativo La Riccia delle Tremiti)';

type OsmNode = { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> };
type OsmWay = { type: 'way'; id: number; nodes: number[]; geometry: { lat: number; lon: number }[] };

async function overpass(query: string) {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA }, body: new URLSearchParams({ data: query }) });
      if (res.ok) return res.json();
      console.warn(`${url}: HTTP ${res.status}`);
    } catch (err) {
      console.warn(`${url}: ${(err as Error).cause ?? err}`);
    }
  }
  throw new Error('Overpass non raggiungibile');
}

// Unisce le way di costa in anelli chiusi (in OSM la terra è a sinistra: anelli antiorari, come vuole GeoJSON)
function stitch(ways: OsmWay[]) {
  const chains = ways.map((w) => ({ ids: [...w.nodes], pts: w.geometry.map((g) => [g.lon, g.lat]) }));
  let merged = true;
  while (merged) {
    merged = false;
    for (const a of chains) {
      if (a.ids[0] === a.ids.at(-1)) continue;
      const b = chains.find((c) => c !== a && c.ids[0] === a.ids.at(-1));
      if (!b) continue;
      a.ids.push(...b.ids.slice(1));
      a.pts.push(...b.pts.slice(1));
      chains.splice(chains.indexOf(b), 1);
      merged = true;
      break;
    }
  }
  const open = chains.filter((c) => c.ids[0] !== c.ids.at(-1));
  if (open.length) console.warn(`${open.length} tratti di costa non chiusi (escono dalla bbox?)`);
  return chains.filter((c) => c.ids[0] === c.ids.at(-1)).map((c) => c.pts);
}

const ATTR = '© OpenStreetMap contributors (ODbL)';
const today = new Date().toISOString().slice(0, 10);

const coast = await overpass(`[out:json][timeout:90];way["natural"="coastline"](${BBOX});out geom;`);
const rings = stitch(coast.elements as OsmWay[]);
writeFileSync('naviga/data/land.geojson', JSON.stringify({
  type: 'FeatureCollection',
  metadata: { fonte: 'OpenStreetMap natural=coastline', bbox: BBOX, scaricato: today, attribuzione: ATTR },
  features: rings.map((ring, i) => ({ type: 'Feature', properties: { id: `land-${i}` }, geometry: { type: 'Polygon', coordinates: [ring] } })),
}));
console.log(`costa: ${coast.elements.length} way → ${rings.length} anelli`);

const sea = await overpass(`[out:json][timeout:60];node[~"^seamark:"~"."](${BBOX});out;`);
const nodes = sea.elements as OsmNode[];
writeFileSync('naviga/data/seamarks.geojson', JSON.stringify({
  type: 'FeatureCollection',
  metadata: { fonte: 'OpenStreetMap / OpenSeaMap seamark:*', bbox: BBOX, scaricato: today, attribuzione: `${ATTR}, OpenSeaMap` },
  features: nodes.map((n) => ({
    type: 'Feature',
    properties: { osmId: n.id, tipo: n.tags?.['seamark:type'] ?? 'altro', nome: n.tags?.['seamark:name'] ?? n.tags?.name ?? null, tags: n.tags ?? {} },
    geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
  })),
}, null, 1));
console.log(`segnalamenti: ${nodes.length}`);
