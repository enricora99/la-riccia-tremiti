// Sorgenti di posizione: GPS del telefono oppure traccia GPX della demo.
// Entrambe producono Fix (core/geo.ts): il resto dell'app non sa da dove arrivano.
import type { Fix } from '../core/geo.ts';
import { parseGpx } from '../core/gpx.ts';

export type AppFix = Fix & { accuracy: number | null };
export type FixHandler = (f: AppFix) => void;

export function startGeolocation(onFix: FixHandler, onError: (code: 'denied' | 'unsupported' | 'unavailable') => void) {
  if (!('geolocation' in navigator)) { onError('unsupported'); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix({
      lonLat: [p.coords.longitude, p.coords.latitude],
      // orario di ricezione: alcuni telefoni restituiscono timestamp GPS non monotoni
      time: Date.now(),
      speedMs: p.coords.speed,
      headingDeg: p.coords.heading != null && Number.isFinite(p.coords.heading) && (p.coords.speed ?? 0) > 0.5 ? p.coords.heading : null,
      accuracy: p.coords.accuracy ?? null,
    }),
    (e) => onError(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Riproduce la traccia GPX della demo con il suo orario, accelerato di `rate` volte */
export function startDemo(gpxText: string, onFix: FixHandler, onProgress: (done: number) => void) {
  const pts = parseGpx(gpxText);
  const t0 = pts[0].time, t1 = pts.at(-1)!.time;
  let rate = 20, playing = true, sim = t0, i = 0, emitted = -1, last = performance.now(), raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(now - last, 250);
    last = now;
    if (!playing) return;
    sim += dt * rate;
    let j = i;
    while (j + 1 < pts.length && pts[j + 1].time <= sim) j++;
    i = j;
    if (i !== emitted) {
      emitted = i;
      const p = pts[i];
      onFix({ lonLat: p.lonLat, time: p.time, speedMs: null, headingDeg: null, accuracy: 5 });
      onProgress((p.time - t0) / (t1 - t0));
    }
    if (i >= pts.length - 1) { sim = t0; i = 0; emitted = -1; }
  };
  raf = requestAnimationFrame(tick);
  return {
    toggle() { playing = !playing; return playing; },
    cycleRate() { rate = rate === 20 ? 60 : rate === 60 ? 5 : 20; return rate; },
    stop() { cancelAnimationFrame(raf); },
  };
}
