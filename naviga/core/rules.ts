// Dove mi trovo e che regole valgono qui: zona AMP, fascia dalla costa, limite di velocità.
// Le regole (testi e limiti) vengono da data/rules.json, le geometrie da data/zones.geojson.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { LonLat } from './coords.ts';
import type { Config, Rule, Rules, ZoneFeature, Zones } from './types.ts';

export type Situation = {
  zona: 'A' | 'B' | 'C' | 'fuori';
  fascia?: '0-300' | '300-600' | 'oltre-600';
  featureId?: string;
  /** navigazione non consentita alle unità a noleggio */
  vietato: boolean;
  /** limite in nodi, null se l'AMP non ne fissa uno in quel punto */
  limiteNodi: number | null;
  regole: Rule[];
};

type Indexed = { f: ZoneFeature & { geometry: Polygon | MultiPolygon }; bbox: [number, number, number, number] };

function bboxOf(g: Polygon | MultiPolygon): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const rings: Position[][] = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  for (const r of rings) for (const [x, y] of r) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}

/** Prepara le zone per ricerche veloci (da chiamare una volta all'avvio) */
export function indexZones(zones: Zones): Indexed[] {
  return zones.features
    .filter((f): f is Indexed['f'] => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    .map((f) => ({ f, bbox: bboxOf(f.geometry) }));
}

export function zoneAt(p: LonLat, index: Indexed[]): ZoneFeature | null {
  const [x, y] = p;
  for (const { f, bbox } of index) {
    if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) continue;
    if (booleanPointInPolygon(p, f)) return f;
  }
  return null;
}

export function ruleById(rules: Rules, id: string): Rule {
  const r = rules.regole.find((x) => x.id === id);
  if (!r) throw new Error(`Regola mancante in rules.json: ${id}`);
  return r;
}

export function situationAt(p: LonLat, index: Indexed[], rules: Rules, config: Config): Situation {
  const f = zoneAt(p, index);
  if (!f) return { zona: 'fuori', vietato: false, limiteNodi: null, regole: [] };
  const { zona, fascia, id } = f.properties;
  const base = { featureId: id };
  if (zona === 'A') return { ...base, zona, vietato: true, limiteNodi: null, regole: [ruleById(rules, 'zona-a-divieto')] };
  if (zona === 'B') {
    if (!config.zonaBAutorizzata) return { ...base, zona, vietato: true, limiteNodi: null, regole: [ruleById(rules, 'zona-b-autorizzazione')] };
    const r = ruleById(rules, 'zona-b-velocita');
    return { ...base, zona, vietato: false, limiteNodi: r.limiteNodi ?? null, regole: [r] };
  }
  if (zona === 'C' && fascia === '0-300') {
    const r = ruleById(rules, 'zona-c-300');
    return { ...base, zona, fascia, vietato: false, limiteNodi: r.limiteNodi ?? null, regole: [r] };
  }
  if (zona === 'C' && fascia === '300-600') {
    const r = ruleById(rules, 'zona-c-600');
    return { ...base, zona, fascia, vietato: false, limiteNodi: r.limiteNodi ?? null, regole: [r] };
  }
  return { ...base, zona: 'C', fascia, vietato: false, limiteNodi: null, regole: [] };
}

export function isOverSpeed(s: Situation, knots: number | null, toleranceKn: number): boolean {
  return knots != null && s.limiteNodi != null && knots > s.limiteNodi + toleranceKn;
}
