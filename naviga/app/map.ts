// Mappa MapLibre offline: estratto PMTiles Protomaps letto tutto in memoria (niente richieste Range,
// così funziona anche dal precache del service worker), zone AMP, attrazioni, segnalamenti.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carica il motore della mappa in un worker separato: lo includiamo nella build (e nel precache)
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { PMTiles, Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { FeatureCollection } from 'geojson';
import type { LonLat } from '../core/coords.ts';
import type { Config, Lang, Poi, Zones } from '../core/types.ts';

const BASE = `${location.origin}/naviga`;
export const BOUNDS: [number, number, number, number] = [15.4, 42.04, 15.8, 42.25];
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

let protocolReady: Promise<void> | null = null;
function registerTiles() {
  protocolReady ??= (async () => {
    const buf = await fetch(`${BASE}/tiles/tremiti.pmtiles`).then((r) => {
      if (!r.ok) throw new Error(`Mappa offline non trovata (${r.status})`);
      return r.arrayBuffer();
    });
    const protocol = new Protocol();
    protocol.add(new PMTiles({ getKey: () => 'tremiti', getBytes: async (offset: number, length: number) => ({ data: buf.slice(offset, offset + length) }) }));
    maplibregl.addProtocol('pmtiles', protocol.tile);
  })();
  return protocolReady;
}

const empty = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export type MapData = { zones: Zones; pois: Poi[]; seamarks: FeatureCollection; config: Config };

export async function createMap(container: HTMLElement, lang: Lang, data: MapData) {
  await registerTiles();
  const bAllowed = data.config.zonaBAutorizzata;
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      glyphs: `${BASE}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${BASE}/sprites/light`,
      sources: { protomaps: { type: 'vector', url: 'pmtiles://tremiti', attribution: ATTRIBUTION } },
      layers: layers('protomaps', namedFlavor('light'), { lang }),
    },
    center: [15.497, 42.118],
    zoom: 12.6,
    minZoom: 9.5,
    maxZoom: 17.5,
    maxBounds: [[BOUNDS[0] - 0.05, BOUNDS[1] - 0.03], [BOUNDS[2] + 0.05, BOUNDS[3] + 0.03]],
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'nautical' }), 'bottom-left');

  await new Promise<void>((res) => map.once('load', () => res()));

  // Zone dell'area marina protetta
  map.addSource('nav-zones', { type: 'geojson', data: data.zones });
  const zoneColor: maplibregl.ExpressionSpecification = ['case',
    ['==', ['get', 'zona'], 'A'], '#d62828',
    ['==', ['get', 'zona'], 'B'], bAllowed ? '#f2b705' : '#e8590c',
    ['==', ['get', 'fascia'], '0-300'], '#1c7ed6',
    ['==', ['get', 'fascia'], '300-600'], '#20c997',
    '#868e96'];
  map.addLayer({
    id: 'nav-zones-fill', type: 'fill', source: 'nav-zones', filter: ['!=', ['get', 'zona'], 'perimetro'],
    paint: {
      'fill-color': zoneColor,
      'fill-opacity': ['case', ['==', ['get', 'zona'], 'A'], 0.35, ['==', ['get', 'zona'], 'B'], bAllowed ? 0.3 : 0.38, ['==', ['get', 'fascia'], '0-300'], 0.16, ['==', ['get', 'fascia'], '300-600'], 0.12, 0],
    },
  });
  map.addLayer({
    id: 'nav-zones-line', type: 'line', source: 'nav-zones', filter: ['in', ['get', 'zona'], ['literal', ['A', 'B']]],
    paint: { 'line-color': zoneColor, 'line-width': 2.2 },
  });
  map.addLayer({
    id: 'nav-perimeter', type: 'line', source: 'nav-zones', filter: ['==', ['get', 'zona'], 'perimetro'],
    paint: { 'line-color': '#2b8a3e', 'line-width': 1.6, 'line-dasharray': [3, 2] },
  });

  // Segnalamenti nautici (OSM/OpenSeaMap)
  map.addSource('nav-seamarks', { type: 'geojson', data: data.seamarks });
  map.addLayer({
    id: 'nav-seamarks', type: 'circle', source: 'nav-seamarks',
    paint: { 'circle-radius': 4.5, 'circle-color': ['match', ['get', 'tipo'], 'rock', '#495057', 'harbour', '#1864ab', '#7048e8'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
  });

  // Linea retta verso la destinazione
  map.addSource('nav-route', { type: 'geojson', data: empty() });
  map.addLayer({ id: 'nav-route-casing', type: 'line', source: 'nav-route', paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'nav-route', type: 'line', source: 'nav-route', paint: { 'line-color': '#e94598', 'line-width': 3, 'line-dasharray': [2, 1.2] } });

  // Precisione del GPS
  map.addSource('nav-accuracy', { type: 'geojson', data: empty() });
  map.addLayer({ id: 'nav-accuracy', type: 'fill', source: 'nav-accuracy', paint: { 'fill-color': '#1c7ed6', 'fill-opacity': 0.12 } });

  // Attrazioni
  map.addSource('nav-pois', { type: 'geojson', data: poisToGeojson(data.pois, lang) });
  map.addLayer({
    id: 'nav-pois', type: 'circle', source: 'nav-pois',
    paint: {
      'circle-radius': ['case', ['==', ['get', 'tipo'], 'porto'], 9, 7.5],
      'circle-color': ['match', ['get', 'tipo'], 'porto', '#e94598', 'grotta', '#e8590c', '#0b7285'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'nav-pois-label', type: 'symbol', source: 'nav-pois',
    layout: {
      'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 13,
      'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9,
    },
    paint: { 'text-color': '#102a35', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  });

  // Barca: marker DOM con freccia di direzione e, se c'è, cono della bussola
  const el = document.createElement('div');
  el.className = 'me';
  el.innerHTML = '<i class="me-cone"></i><i class="me-dot"></i><svg viewBox="0 0 40 40" class="me-arrow" aria-hidden="true"><path d="M20 4 L31 33 L20 26 L9 33 Z"/></svg>';
  const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat([15.4995, 42.1201]);
  let markerAdded = false;

  let follow = true;
  map.on('dragstart', () => { follow = false; });

  return {
    map,
    onPoiClick(cb: (id: string) => void) {
      map.on('click', 'nav-pois', (e) => { const id = e.features?.[0]?.properties?.id; if (id) cb(String(id)); });
      map.on('mouseenter', 'nav-pois', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'nav-pois', () => { map.getCanvas().style.cursor = ''; });
    },
    setPosition(p: LonLat, accuracyM: number | null, courseDeg: number | null, headingDeg: number | null) {
      marker.setLngLat(p);
      if (!markerAdded) { marker.addTo(map); markerAdded = true; }
      el.classList.toggle('has-course', courseDeg != null);
      el.style.setProperty('--course', `${courseDeg ?? 0}deg`);
      el.classList.toggle('has-heading', headingDeg != null);
      el.style.setProperty('--heading', `${headingDeg ?? 0}deg`);
      (map.getSource('nav-accuracy') as maplibregl.GeoJSONSource).setData(accuracyM ? circle(p, accuracyM) : empty());
      if (follow) map.easeTo({ center: p, duration: 600 });
    },
    setRoute(from: LonLat | null, to: LonLat | null) {
      (map.getSource('nav-route') as maplibregl.GeoJSONSource).setData(from && to
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [from, to] } }] }
        : empty());
    },
    fitTo(a: LonLat, b: LonLat) {
      follow = false;
      map.fitBounds([[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]], { padding: { top: 190, bottom: 200, left: 50, right: 50 }, maxZoom: 15.5, duration: 800 });
    },
    recenter(p: LonLat | null) {
      follow = true;
      if (p) map.easeTo({ center: p, zoom: Math.max(map.getZoom(), 14), duration: 600 });
    },
    setLang(l: Lang, pois: Poi[]) {
      (map.getSource('nav-pois') as maplibregl.GeoJSONSource).setData(poisToGeojson(pois, l));
    },
  };
}

function poisToGeojson(pois: Poi[], lang: Lang): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({ type: 'Feature', properties: { id: p.id, tipo: p.tipo, label: p.nome[lang] }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
  };
}

function circle([lon, lat]: LonLat, r: number): FeatureCollection {
  const pts: [number, number][] = [];
  const dLat = r / 111_320, dLon = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]); }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }] };
}
