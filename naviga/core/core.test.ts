import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDms, formatDms } from './coords.ts';
import { distanceMeters, bearingDeg, speedKnots, courseDeg, cardinal, formatDistance } from './geo.ts';
import { indexZones, situationAt, isOverSpeed } from './rules.ts';
import { createAlertTracker } from './alerts.ts';
import { parseGpx, writeGpx } from './gpx.ts';
import type { Config, Poi, Rules, Zones } from './types.ts';
import type { LonLat } from './coords.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const zones: Zones = read('zones.geojson');
const rules: Rules = read('rules.json');
const config: Config = read('config.json');
const pois: Poi[] = read('poi.json');
const idx = indexZones(zones);
const at = (p: LonLat, cfg: Partial<Config> = {}) => situationAt(p, idx, rules, { ...config, ...cfg });

describe('coordinate', () => {
  it('converte gradi-primi-secondi in decimali', () => {
    expect(parseDms('42°08\'16"N')).toBeCloseTo(42 + 8 / 60 + 16 / 3600, 9);
    expect(parseDms('15°30\'00"E')).toBe(15.5);
    expect(parseDms('15°30\'00"W')).toBe(-15.5);
    expect(() => parseDms('42.1')).toThrow();
  });
  it('formatta e torna indietro senza perdite al secondo', () => {
    expect(formatDms(15.5, 'lon')).toBe('015°30\'00"E');
    expect(formatDms(42.137778, 'lat')).toBe('42°08\'16"N');
    expect(formatDms(-0.5, 'lat')).toBe('00°30\'00"S');
    expect(formatDms(42.1, 'lat', 1)).toBe('42°06\'00.0"N');
    for (const v of ['42°06\'21"N', '15°28\'37"E']) {
      const axis = v.endsWith('N') ? 'lat' : 'lon';
      expect(parseDms(formatDms(parseDms(v), axis))).toBeCloseTo(parseDms(v), 9);
    }
  });
  it('i vertici del decreto cadono dove ci si aspetta', () => {
    const dec = read('decreto-1989.json');
    expect(parseDms(dec.vertici.a.lat)).toBeCloseTo(42.137778, 5);
    expect(parseDms(dec.vertici.E.lon)).toBeCloseTo(15.733333, 5);
  });
});

describe('distanze e rilevamenti', () => {
  it('un primo di latitudine è circa un miglio nautico', () => {
    expect(distanceMeters([15.5, 42], [15.5, 42 + 1 / 60])).toBeCloseTo(1853, 0);
  });
  it('rilevamento vero 0–360', () => {
    expect(bearingDeg([15.5, 42.1], [15.5, 42.2])).toBeCloseTo(0, 6);
    expect(bearingDeg([15.5, 42.1], [15.6, 42.1])).toBeCloseTo(90, 0);
    expect(bearingDeg([15.5, 42.1], [15.5, 42.0])).toBeCloseTo(180, 6);
    expect(bearingDeg([15.5, 42.1], [15.4, 42.1])).toBeCloseTo(270, 0);
    expect(cardinal(359)).toBe('N');
    expect(cardinal(225)).toBe('SW');
  });
  it('formatta miglia e metri', () => {
    expect(formatDistance(926)).toEqual({ nm: '0,50 NM', m: '926 m' });
    expect(formatDistance(1852 * 2, 'en')).toEqual({ nm: '2.00 NM', m: '3.70 km' });
  });
  it('velocità: GPS se c\'è, altrimenti tra due fix', () => {
    const p0 = { lonLat: [15.5, 42] as LonLat, time: 0 };
    expect(speedKnots({ ...p0, speedMs: 5 })).toBeCloseTo(9.7192, 3);
    const p1 = { lonLat: [15.5, 42 + 1 / 60] as LonLat, time: 60_000 };
    expect(speedKnots(p1, p0)).toBeCloseTo(60 * 1853 / 1852, 0);
    expect(speedKnots(p1, null)).toBeNull();
    expect(speedKnots({ ...p1, time: 0.2 }, p0)).toBeNull();
    expect(courseDeg(p1, p0)).toBeCloseTo(0, 6);
    expect(courseDeg({ ...p1, headingDeg: 123 }, p0)).toBe(123);
  });
});

describe('zone e limiti di velocità', () => {
  it('ogni zona ha zona, fonte e stato provvisorio', () => {
    for (const f of zones.features) {
      expect(f.properties.zona).toMatch(/^(A|B|C|perimetro)$/);
      expect(f.properties.fonte).toContain('D.I. 14/07/1989');
      expect(f.properties.stato).toBe('provvisorio – da validare con cartografia ufficiale Ente Parco');
    }
  });
  it('zona A (Pianosa): vietato', () => {
    const s = at([15.7434, 42.2223]);
    expect(s.zona).toBe('A');
    expect(s.vietato).toBe(true);
    expect(s.regole[0].id).toBe('zona-a-divieto');
  });
  it('zona B: interdetta di default, 5 nodi se autorizzata', () => {
    const p: LonLat = [15.525, 42.135]; // al largo di Caprara, verso est
    expect(at(p).zona).toBe('B');
    expect(at(p).vietato).toBe(true);
    expect(at(p).limiteNodi).toBeNull();
    expect(at(p, { zonaBAutorizzata: true })).toMatchObject({ zona: 'B', vietato: false, limiteNodi: 5 });
  });
  it('zona C: 5 nodi entro 300 m, 10 nodi tra 300 e 600 m, nessun limite AMP oltre', () => {
    expect(at([15.4974, 42.1204])).toMatchObject({ zona: 'C', fascia: '0-300', limiteNodi: 5 }); // porto di San Domino
    expect(at([15.4823, 42.0995])).toMatchObject({ zona: 'C', fascia: '300-600', limiteNodi: 10 }); // ~450 m a sud di San Domino
    expect(at([15.4823, 42.0955])).toMatchObject({ zona: 'C', fascia: 'oltre-600', limiteNodi: null });
  });
  it('fuori dalla riserva: nessun limite dell\'AMP', () => {
    expect(at([15.42, 42.2])).toMatchObject({ zona: 'fuori', vietato: false, limiteNodi: null });
  });
  it('superamento del limite con tolleranza', () => {
    const s = at([15.4974, 42.1204]);
    expect(isOverSpeed(s, 5.4, 0.5)).toBe(false);
    expect(isOverSpeed(s, 5.6, 0.5)).toBe(true);
    expect(isOverSpeed(at([15.42, 42.2]), 30, 0.5)).toBe(false);
  });
  it('i testi delle regole sono bilingui e citano l\'articolo', () => {
    for (const r of rules.regole) {
      expect(r.testo.it.length).toBeGreaterThan(10);
      expect(r.testo.en.length).toBeGreaterThan(10);
      expect(r.riferimento).toMatch(/art/);
      expect(r.fonte).toMatch(/^https:\/\//);
    }
  });
});

describe('avvisi', () => {
  const caves = pois.filter((p) => p.tipo === 'grotta');
  it('velocità: scatta dopo due fix oltre il limite e si spegne dopo due sotto', () => {
    const t = createAlertTracker({ caveMeters: 100, toleranceKn: 0.5 });
    const s = at([15.4974, 42.1204]);
    const step = (kn: number) => t.update({ position: [15.4974, 42.1204], situation: s, knots: kn, caves: [] });
    expect(step(8).active).toHaveLength(0);
    expect(step(8).newly.map((a) => a.kind)).toEqual(['velocita']);
    expect(step(8).newly).toHaveLength(0);
    expect(step(3).active).toHaveLength(1);
    expect(step(3).active).toHaveLength(0);
  });
  it('grotta entro 100 m: un solo avviso finché non ci si allontana', () => {
    const t = createAlertTracker({ caveMeters: 100, toleranceKn: 0.5 });
    const cave = caves.find((c) => c.id === 'grotta-viole')!;
    const near: LonLat = [cave.lon, cave.lat - 0.0006]; // ~67 m
    const mid: LonLat = [cave.lon, cave.lat - 0.0011]; // ~122 m: dentro la soglia di rilascio
    const far: LonLat = [cave.lon, cave.lat - 0.003];
    const step = (p: LonLat) => t.update({ position: p, situation: at(p), knots: 2, caves });
    expect(step(far).active).toHaveLength(0);
    expect(step(near).newly.map((a) => a.poiId)).toEqual(['grotta-viole']);
    expect(step(mid).newly).toHaveLength(0);
    expect(step(mid).active).toHaveLength(1);
    expect(step(far).active).toHaveLength(0);
    expect(step(near).newly).toHaveLength(1);
  });
  it('ingresso in zona B non autorizzata', () => {
    const t = createAlertTracker({ caveMeters: 100, toleranceKn: 0.5 });
    const step = (p: LonLat) => t.update({ position: p, situation: at(p), knots: 3, caves: [] });
    expect(step([15.4974, 42.1204]).newly).toHaveLength(0);
    expect(step([15.525, 42.135]).newly.map((a) => a.kind)).toEqual(['zona-b']);
  });
});

describe('attrazioni', () => {
  it('le grotte non sono mai una destinazione in cui entrare', () => {
    for (const p of pois.filter((x) => x.tipo === 'grotta')) expect(p.accessoNoleggio).toBe('solo esterno');
  });
  it('tutte da verificare, con nome e descrizione bilingui', () => {
    for (const p of pois) {
      expect(p.verificato).toBe(false);
      expect(p.nome.it && p.nome.en && p.descrizione.it && p.descrizione.en).toBeTruthy();
    }
    expect(pois.some((p) => p.id === config.portoRientroId)).toBe(true);
  });
});

describe('GPX', () => {
  it('scrive e rilegge una traccia senza perdite', () => {
    const pts = [
      { lonLat: [15.4995, 42.1201] as LonLat, time: Date.parse('2026-07-15T09:30:00Z'), name: 'Porto & partenza' },
      { lonLat: [15.4991, 42.11728] as LonLat, time: Date.parse('2026-07-15T09:30:02Z') },
    ];
    const back = parseGpx(writeGpx(pts, 'prova'));
    expect(back).toHaveLength(2);
    expect(back[0].name).toBe('Porto & partenza');
    expect(back[1].lonLat[1]).toBeCloseTo(42.11728, 6);
    expect(back[1].time - back[0].time).toBe(2000);
  });
  it('la traccia della demo è leggibile e regolare', () => {
    const pts = parseGpx(readFileSync(new URL('../public/demo/giro-demo.gpx', import.meta.url), 'utf8'));
    expect(pts.length).toBeGreaterThan(500);
    for (let i = 1; i < pts.length; i++) expect(pts[i].time).toBeGreaterThan(pts[i - 1].time);
  });
});
