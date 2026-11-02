// Controlla in che zona e a che distanza dalla costa cade ogni attrazione di poi.json.
// Uso: node scripts/check-poi.ts
import { readFileSync } from 'node:fs';
import { indexZones, situationAt } from '../naviga/core/rules.ts';
import type { Config, Poi, Rules, Zones } from '../naviga/core/types.ts';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const zones: Zones = read('naviga/data/zones.geojson');
const rules: Rules = read('naviga/data/rules.json');
const config: Config = read('naviga/data/config.json');
const pois: Poi[] = read('naviga/data/poi.json');
const idx = indexZones(zones);
for (const p of pois) {
  const s = situationAt([p.lon, p.lat], idx, rules, config);
  const where = s.zona === 'fuori' ? 'fuori dalle zone (a terra o fuori AMP)' : `zona ${s.zona}${s.fascia ? ` ${s.fascia} m` : ''}`;
  console.log(`${p.id.padEnd(20)} ${where}${s.vietato ? '  ⚠ vietato al noleggio' : ''}`);
}
