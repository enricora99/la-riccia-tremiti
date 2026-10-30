// Geometria delle isole senza Three.js: usata dal worker, dalla mappa SVG e dalla scena.
import { fbm, noise2, mulberry } from './noise.js';

// Arcipelago stilizzato (metri; x = est, z = sud). Proporzioni ispirate alle isole reali.
export const ISLANDS = [
  { key: 'sanDomino', name: 'San Domino', cx: 0, cz: 0, rx: 1300, rz: 720, rot: -0.5, H: 92, cliff: 0.035, seed: 11, kind: 'pine' },
  { key: 'cretaccio', name: 'Cretaccio', cx: 1330, cz: -640, rx: 240, rz: 115, rot: 0.35, H: 26, cliff: 0.2, seed: 23, kind: 'clay' },
  { key: 'sanNicola', name: 'San Nicola', cx: 1980, cz: -1060, rx: 820, rz: 265, rot: -0.85, H: 72, cliff: 0.05, seed: 37, kind: 'rock' },
  { key: 'capraia', name: 'Capraia', cx: 1050, cz: -2380, rx: 920, rz: 460, rot: -0.22, H: 55, cliff: 0.045, seed: 51, kind: 'maquis' },
];

export const SHORE_BOUNDS = [-2300, -3700, 5600, 4700];

export const smooth = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

function local(I, x, z) {
  const dx = x - I.cx, dz = z - I.cz;
  const c = Math.cos(I.rot), s = Math.sin(I.rot);
  return [(dx * c + dz * s) / I.rx, (-dx * s + dz * c) / I.rz];
}

export function islandHeight(I, x, z) {
  const [u, v] = local(I, x, z);
  const r = Math.hypot(u, v);
  if (r > 2.2) return -60;
  const a = Math.atan2(v, u);
  const edge = 1 + 0.17 * fbm(Math.cos(a) * 1.5 + I.seed, Math.sin(a) * 1.5, I.seed, 3)
    + 0.07 * fbm(x * 0.0045, z * 0.0045, I.seed + 5, 3);
  const q = r / edge;
  if (q >= 1) return Math.max(-60, -3 - (q - 1) * I.rx * 0.22);
  const terrain = I.H * (0.72 + 0.3 * fbm(x * 0.0021, z * 0.0021, I.seed + 9, 4)) * (1 - 0.42 * q * q)
    + 5 * fbm(x * 0.02, z * 0.02, I.seed + 3, 2);
  const cliff = smooth(1.0, 1.0 - I.cliff, q);
  return -3 + (terrain + 3) * cliff;
}

export function heightAt(x, z) {
  let h = -60;
  for (const I of ISLANDS) h = Math.max(h, islandHeight(I, x, z));
  return h;
}

export function coastXZ(I, angleDeg, offset) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dz = Math.sin(a);
  for (let d = Math.max(I.rx, I.rz) * 1.7; d > 0; d -= 4) {
    if (islandHeight(I, I.cx + dx * d, I.cz + dz * d) > -1.5) return { x: I.cx + dx * (d + offset), z: I.cz + dz * (d + offset) };
  }
  return { x: I.cx, z: I.cz };
}

// Colori in spazio lineare (come THREE.Color con il color management attivo)
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = (h) => [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
const mix = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

const PAL = {
  pine: { veg: ['#34502a', '#4d6b2f', '#6b7a3a'], rock: ['#e8dbbd', '#a98d68'], vegAmt: 1 },
  maquis: { veg: ['#5d6d34', '#7a8041', '#8f8a52'], rock: ['#e2d4b4', '#a68c6a'], vegAmt: 0.85 },
  rock: { veg: ['#56693a', '#7a7c45', '#8b8550'], rock: ['#eadfc6', '#b09772'], vegAmt: 0.55 },
  clay: { veg: ['#a98352', '#b98f58', '#c59a60'], rock: ['#cfa46a', '#a8794a'], vegAmt: 0.0 },
};

// Griglia di altezze con normali e colori per vertice
export function buildIslandData(I, cell) {
  const E = Math.max(I.rx, I.rz) * 1.25;
  const n = Math.min(260, Math.round((2 * E) / cell));
  const s = (2 * E) / n;
  const verts = (n + 1) * (n + 1);
  const pos = new Float32Array(verts * 3);
  const hs = new Float32Array(verts);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const x = I.cx - E + i * s, z = I.cz - E + j * s;
      const h = islandHeight(I, x, z);
      hs[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = Math.max(h, -10); pos[k * 3 + 2] = z;
    }
  }
  const idx = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -2.5) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  // normali per differenze centrali sulla griglia
  const nrm = new Float32Array(verts * 3);
  const H = (i, j) => pos[(Math.min(n, Math.max(0, j)) * (n + 1) + Math.min(n, Math.max(0, i))) * 3 + 1];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * s;
      const l = Math.hypot(nx, ny, nz);
      nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
    }
  }
  const col = new Float32Array(verts * 3);
  const P = PAL[I.kind];
  const v0 = hex(P.veg[0]), v1 = hex(P.veg[1]), v2 = hex(P.veg[2]);
  const r0 = hex(P.rock[0]), r1 = hex(P.rock[1]);
  const sand = hex('#ece0c6'), wet = hex('#8d8070');
  const c = [0, 0, 0], tmp = [0, 0, 0];
  for (let k = 0; k < verts; k++) {
    const x = pos[k * 3], h = hs[k], z = pos[k * 3 + 2];
    const slope = 1 - nrm[k * 3 + 1];
    const nz = noise2(x * 0.03, z * 0.03, I.seed);
    // roccia calcarea a strati
    const streak = noise2(x * 0.09 + z * 0.09, h * 0.02, I.seed + 4);
    mix(c, r0, r1, Math.min(1, Math.max(0, 0.35 + 0.35 * Math.sin(h * 0.45 + nz * 2.5) + 0.3 * streak)));
    const br = 0.84 + 0.16 * nz;
    c[0] *= br; c[1] *= br; c[2] *= br;
    // fascia scura di roccia bagnata al piede della falesia
    if (h < 7 && h > -3) mix(c, c, wet, smooth(7, 1, h) * 0.7 * Math.min(1, slope * 2));
    // vegetazione sui pianori
    const patch = fbm(x * 0.008, z * 0.008, I.seed + 2, 3);
    const veg = P.vegAmt * smooth(0.34, 0.14, slope) * smooth(3, 12, h) * smooth(-0.62, -0.25, patch);
    mix(tmp, v0, v1, 0.5 + 0.5 * patch);
    mix(tmp, tmp, v2, Math.max(0, nz) * 0.6);
    mix(c, c, tmp, veg);
    // battigia
    if (h < 2.5) mix(c, c, slope < 0.25 ? sand : wet, smooth(2.5, -0.5, h) * 0.8);
    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
  }
  return { pos, nrm, col, idx: new Uint32Array(idx) };
}

// Maschera di profondità per il mare (0 = -60 m, 1 = +20 m)
export function buildShore(N) {
  const [bx, bz, bw, bh] = SHORE_BOUNDS;
  const data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = heightAt(bx + ((i + 0.5) / N) * bw, bz + ((j + 0.5) / N) * bh);
      data[j * N + i] = Math.round(Math.min(1, Math.max(0, (h + 60) / 80)) * 255);
    }
  }
  return data;
}

// Pini d'Aleppo: matrici (colonna) e colori per due InstancedMesh
export function placeTrees(count) {
  const rand = mulberry(7);
  const [SD, , SN, CA] = ISLANDS;
  const canopy = new Float32Array(count * 16), trunk = new Float32Array(count * 16), colors = new Float32Array(count * 3);
  const treeIslands = [[SD, 0.72], [CA, 0.16], [SN, 0.12]];
  const pineCol = hex('#2f4a26'), maqCol = hex('#4d5d2e');
  const setM = (arr, o, x, y, z, sx, sy, sz, yaw) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    arr.set([c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, x, y, z, 1], o * 16);
  };
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 40) {
    const r = rand();
    let acc = 0, I = SD;
    for (const [isl, w] of treeIslands) { acc += w; if (r <= acc) { I = isl; break; } }
    const E = Math.max(I.rx, I.rz);
    const x = I.cx + (rand() * 2 - 1) * E, z = I.cz + (rand() * 2 - 1) * E;
    const h = islandHeight(I, x, z);
    if (h < 14) continue;
    const slope = Math.abs(islandHeight(I, x + 6, z) - h) + Math.abs(islandHeight(I, x, z + 6) - h);
    if (slope > 4.5) continue;
    if (fbm(x * 0.008, z * 0.008, I.seed + 2, 3) < -0.15) continue;
    const th = 3 + rand() * 4.5, cr = 2.6 + rand() * 3;
    setM(trunk, placed, x, h + th * 0.5 - 0.4, z, 1, th, 1, 0);
    setM(canopy, placed, x, h + th + cr * 0.25, z, cr, cr * (0.42 + rand() * 0.2), cr, rand() * 6.28);
    const base = I.kind === 'pine' ? pineCol : maqCol, l = 1 + (rand() - 0.5) * 0.25;
    colors.set([base[0] * l, base[1] * l, base[2] * l], placed * 3);
    placed++;
  }
  return { canopy, trunk, colors, count: placed };
}

// Il lavoro è diviso in parti indipendenti, così più worker lo fanno in parallelo
export const TERRAIN_PARTS = ['main', 'rest', 'shore'];
export function generateTerrain({ mobile }, parts = TERRAIN_PARTS) {
  const cell = mobile ? 17 : 11;
  const out = { islands: [] };
  if (parts.includes('main')) out.islands[0] = buildIslandData(ISLANDS[0], cell);
  if (parts.includes('rest')) {
    for (let i = 1; i < ISLANDS.length; i++) out.islands[i] = buildIslandData(ISLANDS[i], cell);
    out.trees = placeTrees(mobile ? 900 : 2000);
  }
  if (parts.includes('shore')) out.shore = { data: buildShore(mobile ? 256 : 384), size: mobile ? 256 : 384 };
  return out;
}
