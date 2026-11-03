import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRouter, type Obstacles } from './route.ts';
import { distanceMeters } from './geo.ts';
import { indexZones, situationAt } from './rules.ts';
import type { LonLat } from './coords.ts';
import type { Config, Poi, Rules, Zones } from './types.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const obstacles: Obstacles = read('obstacles.geojson');
const pois: Poi[] = read('poi.json');
const config: Config = read('config.json');
const rules: Rules = read('rules.json');
const idx = indexZones(read('zones.geojson') as Zones);
const poi = (id: string): LonLat => { const p = pois.find((x) => x.id === id)!; return [p.lon, p.lat]; };
const PORT: LonLat = [15.4995, 42.1201];

const router = createRouter(obstacles, { zonaBAutorizzata: false });
const routerB = createRouter(obstacles, { zonaBAutorizzata: true });

// campiona il percorso ogni 10 m e restituisce le zone attraversate
function zonesAlong(path: LonLat[]) {
  const seen = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const d = distanceMeters(path[i - 1], path[i]);
    for (let s = 0; s <= d; s += 10) {
      const t = s / d;
      const p: LonLat = [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
      seen.add(situationAt(p, idx, rules, config).zona);
    }
  }
  return seen;
}

describe('rotta indicativa', () => {
  it('il grafo si costruisce in fretta e ha nodi', () => {
    const t0 = performance.now();
    const r = createRouter(obstacles, { zonaBAutorizzata: false });
    expect(r.nodeCount).toBeGreaterThan(50);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('linea retta libera: nessun avviso, la rotta è la linea retta', () => {
    const r = router.route(PORT, [15.4991, 42.11728]); // canale tra San Domino e San Nicola
    expect(r.issues).toEqual([]);
    expect(r.path).toHaveLength(2);
    expect(r.approach).toBeNull();
    expect(router.route(PORT, poi('bagno-padre-pio')).issues).toEqual([]);
  });

  it('grotta affacciata sulla zona B: rotta fino al punto più vicino fuori dalla zona', () => {
    const r = router.route(PORT, poi('grotta-bue-marino'));
    expect(r.issues).toContainEqual({ kind: 'terra', nome: 'San Domino' });
    expect(r.path).not.toBeNull();
    expect(r.approach).not.toBeNull();
    expect(r.approach!.toGoalM).toBeLessThan(450);
    expect(zonesAlong(r.path!).has('B')).toBe(false);
    expect(router.touchesLand(r.path!, 0)).toBe(false);
  });

  it('dal porto alla Grotta delle Viole la linea retta passa sopra San Domino: rotta che la aggira', () => {
    const r = router.route(PORT, poi('grotta-viole'));
    expect(r.issues).toContainEqual({ kind: 'terra', nome: 'San Domino' });
    expect(r.path!.length).toBeGreaterThan(2);
    expect(router.touchesLand(r.path!)).toBe(false);
    expect(r.lengthM!).toBeGreaterThan(r.straightM);
    expect(r.lengthM!).toBeLessThan(r.straightM * 3);
    expect(zonesAlong(r.path!).has('B')).toBe(false);
  });

  it('la zona B non autorizzata si aggira; se autorizzata si attraversa', () => {
    const from: LonLat = [15.4705, 42.1035], to: LonLat = [15.4712, 42.1150]; // a sud e a nord della zona B di San Domino
    const r = router.route(from, to);
    expect(r.issues.map((i) => i.kind)).toContain('zonaB');
    expect(r.path).not.toBeNull();
    expect(zonesAlong(r.path!).has('B')).toBe(false);
    const rb = routerB.route(from, to);
    expect(rb.issues).toEqual([]);
    expect(rb.path).toHaveLength(2);
  });

  it('dal porto a Padre Pio e ritorno: mai sopra terra', () => {
    for (const [a, b] of [[PORT, poi('bagno-padre-pio')], [poi('bagno-padre-pio'), PORT]] as [LonLat, LonLat][]) {
      const r = router.route(a, b);
      expect(r.path).not.toBeNull();
      expect(router.touchesLand(r.path!)).toBe(false);
    }
  });

  it('il primo tratto dà la rotta da tenere adesso', () => {
    const r = router.route(PORT, poi('grotta-viole'));
    expect(r.firstLegBearing).toBeGreaterThanOrEqual(0);
    expect(r.firstLegBearing).toBeLessThan(360);
  });
});
