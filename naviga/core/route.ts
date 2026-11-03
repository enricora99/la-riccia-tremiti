// Rotta indicativa: se la linea retta tocca terra o una zona vietata, cerca la spezzata più corta
// che gira intorno alle isole (a MARGINE_ROTTA dalla costa) e alle zone vietate.
// Grafo di visibilità sui vertici dei margini + Dijkstra. Geometria in metri su un piano locale.
// Non conosce fondali, secche e scogli sommersi: resta un'indicazione, da verificare a vista.
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { LonLat } from './coords.ts';

export type ObstacleKind = 'costa' | 'costa-margine' | 'zonaA' | 'zonaA-margine' | 'zonaB' | 'zonaB-margine';
export type Obstacles = FeatureCollection<Polygon | MultiPolygon, { kind: ObstacleKind; nome?: string | null }>;

export type Issue = { kind: 'terra' | 'zonaA' | 'zonaB'; nome: string | null };
export type RouteResult = {
  /** problemi della linea retta (vuoto = la linea retta va bene) */
  issues: Issue[];
  /** la rotta da mostrare: linea retta se non ci sono problemi, altrimenti la spezzata; null se non trovata */
  path: LonLat[] | null;
  lengthM: number | null;
  /** rotta da tenere adesso: rilevamento del primo tratto */
  firstLegBearing: number | null;
  straightM: number;
  /** se la destinazione non si raggiunge senza entrare in zone vietate: il punto più vicino da cui guardarla */
  approach: { point: LonLat; toGoalM: number } | null;
};

type P = { x: number; y: number };
type Poly = { kind: ObstacleKind; nome: string | null; ring: P[]; minX: number; minY: number; maxX: number; maxY: number };

const LAT0 = 42.12, LON0 = 15.5;
const KX = 111_320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110_574;
const proj = ([lon, lat]: LonLat): P => ({ x: (lon - LON0) * KX, y: (lat - LAT0) * KY });
const unproj = (p: P): LonLat => [p.x / KX + LON0, p.y / KY + LAT0];
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const bearing = (a: P, b: P) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;

function toPolys(obstacles: Obstacles): Poly[] {
  const out: Poly[] = [];
  for (const f of obstacles.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      const ring = rings[0].slice(0, -1).map((c) => proj(c as LonLat));
      const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y);
      out.push({ kind: f.properties.kind, nome: f.properties.nome ?? null, ring, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) });
    }
  }
  return out;
}

function inside(p: P, poly: Poly): boolean {
  if (p.x < poly.minX || p.x > poly.maxX || p.y < poly.minY || p.y > poly.maxY) return false;
  let c = false;
  const r = poly.ring;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i].y > p.y) !== (r[j].y > p.y) && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c;
  }
  return c;
}

const orient = (a: P, b: P, c: P) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
/** intersezione propria (non conta il toccarsi negli estremi o lungo un lato) */
function crosses(a: P, b: P, c: P, d: P): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  const e = 1e-6;
  return ((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e));
}

/** il segmento a–b entra nel poligono? */
function hits(a: P, b: P, poly: Poly): boolean {
  if (Math.max(a.x, b.x) < poly.minX || Math.min(a.x, b.x) > poly.maxX || Math.max(a.y, b.y) < poly.minY || Math.min(a.y, b.y) > poly.maxY) return false;
  const r = poly.ring;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (crosses(a, b, r[j], r[i])) return true;
  return inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, poly);
}

/** accorcia il segmento di `s` metri all'inizio e `e` metri alla fine */
function trim(a: P, b: P, s: number, e: number): [P, P] | null {
  const L = dist(a, b);
  if (L <= s + e + 1) return null;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  return [{ x: a.x + ux * s, y: a.y + uy * s }, { x: b.x - ux * e, y: b.y - uy * e }];
}

export type RouterOptions = {
  zonaBAutorizzata: boolean;
  /** metri ignorati vicino alla partenza (il GPS al pontile può cadere "a terra") */
  startToleranceM?: number;
  /** metri ignorati vicino all'arrivo (le attrazioni stanno sulla costa) */
  goalToleranceM?: number;
};

export function createRouter(obstacles: Obstacles, opts: RouterOptions) {
  const startTol = opts.startToleranceM ?? 30, goalTol = opts.goalToleranceM ?? 60;
  const all = toPolys(obstacles).filter((p) => !(opts.zonaBAutorizzata && (p.kind === 'zonaB' || p.kind === 'zonaB-margine')));
  const hard = all.filter((p) => p.kind === 'costa' || p.kind === 'zonaA' || p.kind === 'zonaB');
  const soft = all.filter((p) => p.kind.endsWith('-margine'));

  // nodi del grafo: vertici dei margini che non stanno dentro altri ostacoli
  const nodes: P[] = [];
  soft.forEach((poly, pi) => {
    for (const v of poly.ring) {
      if (soft.some((q, qi) => qi !== pi && inside(v, q))) continue;
      if (hard.some((q) => inside(v, q))) continue;
      nodes.push(v);
    }
  });
  // visibilità tra i nodi (una volta sola)
  const adj: { j: number; w: number }[][] = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (soft.some((q) => hits(a, b, q))) continue;
      const w = dist(a, b);
      adj[i].push({ j, w });
      adj[j].push({ j: i, w });
    }
  }

  const blockedBy = (a: P, b: P, set: Poly[], s: number, e: number, skip: (q: Poly) => boolean = () => false) => {
    const t = trim(a, b, s, e);
    if (!t) return [];
    return set.filter((q) => !skip(q) && hits(t[0], t[1], q));
  };

  function issuesOf(polys: Poly[]): Issue[] {
    const seen = new Set<string>();
    const out: Issue[] = [];
    for (const q of polys) {
      const kind = q.kind === 'costa' ? 'terra' : (q.kind as 'zonaA' | 'zonaB');
      const key = `${kind}:${q.nome}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, nome: q.nome });
    }
    return out;
  }

  function routeTo(fromLL: LonLat, toLL: LonLat, goalTolM: number): RouteResult {
    const a = proj(fromLL), b = proj(toLL);
    const straightM = dist(a, b);
    // se si parte (o si arriva) dentro una zona vietata, quella zona non blocca il primo (o l'ultimo) tratto
    const startZones = new Set(hard.filter((q) => q.kind !== 'costa' && inside(a, q)));
    const goalZones = new Set(hard.filter((q) => q.kind !== 'costa' && inside(b, q)));
    const direct = blockedBy(a, b, hard, startTol, goalTolM, (q) => startZones.has(q) || goalZones.has(q));
    const issues = issuesOf(direct);
    if (!direct.length) return { issues, path: [fromLL, toLL], lengthM: straightM, firstLegBearing: bearing(a, b), straightM, approach: null };

    // Dijkstra: 0..n-1 nodi, n = partenza, n+1 = arrivo
    const n = nodes.length, S = n, G = n + 1;
    const d = new Float64Array(n + 2).fill(Infinity);
    const prev = new Int32Array(n + 2).fill(-1);
    const done = new Uint8Array(n + 2);
    const fromStart = nodes.map((v) => (blockedBy(a, v, hard, startTol, 0, (q) => startZones.has(q)).length ? Infinity : dist(a, v)));
    const toGoal = nodes.map((v) => (blockedBy(v, b, hard, 0, goalTolM, (q) => goalZones.has(q)).length ? Infinity : dist(v, b)));
    d[S] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n + 2; i++) if (!done[i] && d[i] < best) { best = d[i]; u = i; }
      if (u < 0 || u === G) break;
      done[u] = 1;
      if (u === S) {
        fromStart.forEach((w, i) => { if (w < Infinity && d[S] + w < d[i]) { d[i] = d[S] + w; prev[i] = S; } });
        continue;
      }
      for (const { j, w } of adj[u]) if (d[u] + w < d[j]) { d[j] = d[u] + w; prev[j] = u; }
      if (toGoal[u] < Infinity && d[u] + toGoal[u] < d[G]) { d[G] = d[u] + toGoal[u]; prev[G] = u; }
    }
    if (d[G] === Infinity) return { issues, path: null, lengthM: null, firstLegBearing: null, straightM, approach: null };
    const seq: P[] = [];
    for (let k = G; k !== -1; k = prev[k]) seq.push(k === S ? a : k === G ? b : nodes[k]);
    seq.reverse();
    return { issues, path: seq.map(unproj), lengthM: d[G], firstLegBearing: bearing(seq[0], seq[1]), straightM, approach: null };
  }

  return {
    nodeCount: nodes.length,
    route(fromLL: LonLat, toLL: LonLat): RouteResult {
      const r = routeTo(fromLL, toLL, goalTol);
      if (r.path) return r;
      // destinazione irraggiungibile (es. una grotta affacciata sulla zona B): punto d'osservazione più vicino
      const b = proj(toLL);
      const candidates: P[] = [];
      for (let rad = 60; rad <= 420; rad += 30) {
        for (let k = 0; k < 24; k++) {
          const ang = (k / 24) * Math.PI * 2;
          const c = { x: b.x + Math.cos(ang) * rad, y: b.y + Math.sin(ang) * rad };
          if (!hard.some((q) => inside(c, q))) candidates.push(c);
        }
      }
      for (const c of candidates) {
        const alt = routeTo(fromLL, unproj(c), 0);
        if (alt.path) return { ...alt, issues: r.issues, straightM: r.straightM, approach: { point: unproj(c), toGoalM: dist(c, b) } };
      }
      return r;
    },
    /** per i test: il percorso tocca terra (oltre le tolleranze)? */
    touchesLand(path: LonLat[], goalTolM = goalTol): boolean {
      const pts = path.map(proj);
      return pts.slice(1).some((p, i) => blockedBy(pts[i], p, hard.filter((q) => q.kind === 'costa'), i === 0 ? startTol : 0, i === pts.length - 2 ? goalTolM : 0).length > 0);
    },
  };
}
