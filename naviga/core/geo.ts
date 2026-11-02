// Distanze e rilevamenti in linea retta (ortodromia sferica). Nessuna dipendenza dal browser.
import turfDistance from '@turf/distance';
import turfBearing from '@turf/bearing';
import type { LonLat } from './coords.ts';

export const METERS_PER_NM = 1852;
export const MS_TO_KNOTS = 1.94384;

export function distanceMeters(a: LonLat, b: LonLat): number {
  return turfDistance(a, b, { units: 'meters' });
}

/** Rilevamento vero da a verso b, 0–360° (0 = nord, 90 = est) */
export function bearingDeg(a: LonLat, b: LonLat): number {
  return (turfBearing(a, b) + 360) % 360;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function formatDistance(m: number, lang: 'it' | 'en' = 'it'): { nm: string; m: string } {
  const nm = m / METERS_PER_NM;
  const dec = lang === 'it' ? ',' : '.';
  return {
    nm: `${nm.toFixed(nm < 10 ? 2 : 1).replace('.', dec)} NM`,
    m: m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', dec)} km`,
  };
}

export type Fix = { lonLat: LonLat; time: number; speedMs?: number | null; headingDeg?: number | null };

/** Velocità in nodi: quella del GPS se presente, altrimenti calcolata tra due fix */
export function speedKnots(cur: Fix, prev?: Fix | null): number | null {
  if (cur.speedMs != null && Number.isFinite(cur.speedMs) && cur.speedMs >= 0) return cur.speedMs * MS_TO_KNOTS;
  if (!prev) return null;
  const dt = (cur.time - prev.time) / 1000;
  if (dt <= 0.5 || dt > 60) return null;
  return (distanceMeters(prev.lonLat, cur.lonLat) / dt) * MS_TO_KNOTS;
}

/** Direzione di moto: quella del GPS se presente, altrimenti calcolata tra due fix distanti almeno 3 m */
export function courseDeg(cur: Fix, prev?: Fix | null): number | null {
  if (cur.headingDeg != null && Number.isFinite(cur.headingDeg)) return cur.headingDeg;
  if (!prev || distanceMeters(prev.lonLat, cur.lonLat) < 3) return null;
  return bearingDeg(prev.lonLat, cur.lonLat);
}
