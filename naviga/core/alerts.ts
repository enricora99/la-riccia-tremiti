// Avvisi con isteresi: scattano una volta all'ingresso in una situazione e si spengono all'uscita,
// così il rumore del GPS non li fa lampeggiare. Logica pura, testabile senza browser.
import { distanceMeters } from './geo.ts';
import type { LonLat } from './coords.ts';
import type { Poi } from './types.ts';
import type { Situation } from './rules.ts';

export type AlertKind = 'zona-a' | 'zona-b' | 'velocita' | 'grotta';
export type Alert = { key: string; kind: AlertKind; poiId?: string; limiteNodi?: number };

export type AlertInput = { position: LonLat; situation: Situation; knots: number | null; caves: Poi[] };
export type AlertOptions = { caveMeters: number; caveReleaseMeters?: number; toleranceKn: number; confirmFixes?: number };

export function createAlertTracker(opts: AlertOptions) {
  const release = opts.caveReleaseMeters ?? opts.caveMeters * 1.3;
  const confirm = opts.confirmFixes ?? 2;
  let active = new Map<string, Alert>();
  let overCount = 0, underCount = 0, speeding = false;

  return {
    /** Restituisce gli avvisi attivi e quelli appena scattati (da segnalare con suono) */
    update({ position, situation, knots, caves }: AlertInput) {
      const next = new Map<string, Alert>();
      if (situation.zona === 'A') next.set('zona-a', { key: 'zona-a', kind: 'zona-a' });
      if (situation.zona === 'B' && situation.vietato) next.set('zona-b', { key: 'zona-b', kind: 'zona-b' });

      // velocità: servono più fix consecutivi oltre (o sotto) il limite per cambiare stato
      const over = knots != null && situation.limiteNodi != null && knots > situation.limiteNodi + opts.toleranceKn;
      if (over) { overCount++; underCount = 0; } else { underCount++; overCount = 0; }
      if (!speeding && overCount >= confirm) speeding = true;
      if (speeding && underCount >= confirm) speeding = false;
      if (speeding && situation.limiteNodi != null) next.set('velocita', { key: 'velocita', kind: 'velocita', limiteNodi: situation.limiteNodi });

      for (const c of caves) {
        const key = `grotta:${c.id}`;
        const d = distanceMeters(position, [c.lon, c.lat]);
        if (d < opts.caveMeters || (active.has(key) && d < release)) next.set(key, { key, kind: 'grotta', poiId: c.id });
      }

      const newly = [...next.values()].filter((a) => !active.has(a.key));
      active = next;
      return { active: [...next.values()], newly };
    },
    reset() { active = new Map(); overCount = underCount = 0; speeding = false; },
  };
}
