import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, noise2, mulberry } from './noise.js';

// Arcipelago stilizzato (metri; x = est, z = sud). Proporzioni ispirate alle isole reali.
export const ISLANDS = [
  { key: 'sanDomino', name: 'San Domino', cx: 0, cz: 0, rx: 1300, rz: 720, rot: -0.5, H: 92, cliff: 0.035, seed: 11, kind: 'pine' },
  { key: 'cretaccio', name: 'Cretaccio', cx: 1330, cz: -640, rx: 240, rz: 115, rot: 0.35, H: 26, cliff: 0.2, seed: 23, kind: 'clay' },
  { key: 'sanNicola', name: 'San Nicola', cx: 1980, cz: -1060, rx: 820, rz: 265, rot: -0.85, H: 72, cliff: 0.05, seed: 37, kind: 'rock' },
  { key: 'capraia', name: 'Capraia', cx: 1050, cz: -2380, rx: 920, rz: 460, rot: -0.22, H: 55, cliff: 0.045, seed: 51, kind: 'maquis' },
];

const smooth = (e0, e1, x) => {
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

export function coastPoint(I, angleDeg, offset) {
  const a = THREE.MathUtils.degToRad(angleDeg);
  const dx = Math.cos(a), dz = Math.sin(a);
  for (let d = Math.max(I.rx, I.rz) * 1.7; d > 0; d -= 4) {
    if (islandHeight(I, I.cx + dx * d, I.cz + dz * d) > -1.5) {
      return new THREE.Vector3(I.cx + dx * (d + offset), 0, I.cz + dz * (d + offset));
    }
  }
  return new THREE.Vector3(I.cx, 0, I.cz);
}

const PAL = {
  pine: { veg: ['#34502a', '#4d6b2f', '#6b7a3a'], rock: ['#e8dbbd', '#a98d68'], vegAmt: 1 },
  maquis: { veg: ['#5d6d34', '#7a8041', '#8f8a52'], rock: ['#e2d4b4', '#a68c6a'], vegAmt: 0.85 },
  rock: { veg: ['#56693a', '#7a7c45', '#8b8550'], rock: ['#eadfc6', '#b09772'], vegAmt: 0.55 },
  clay: { veg: ['#a98352', '#b98f58', '#c59a60'], rock: ['#cfa46a', '#a8794a'], vegAmt: 0.0 },
};

function buildIslandMesh(I, cell, mat) {
  const E = Math.max(I.rx, I.rz) * 1.25;
  const n = Math.min(300, Math.round((2 * E) / cell));
  const verts = (n + 1) * (n + 1);
  const pos = new Float32Array(verts * 3);
  const hs = new Float32Array(verts);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const x = I.cx - E + (2 * E * i) / n, z = I.cz - E + (2 * E * j) / n;
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  const col = new Float32Array(verts * 3);
  const P = PAL[I.kind];
  const v0 = new THREE.Color(P.veg[0]), v1 = new THREE.Color(P.veg[1]), v2 = new THREE.Color(P.veg[2]);
  const r0 = new THREE.Color(P.rock[0]), r1 = new THREE.Color(P.rock[1]);
  const sand = new THREE.Color('#ece0c6'), wet = new THREE.Color('#8d8070');
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let k = 0; k < verts; k++) {
    const x = pos[k * 3], h = hs[k], z = pos[k * 3 + 2];
    const slope = 1 - nrm[k * 3 + 1];
    const nz = noise2(x * 0.03, z * 0.03, I.seed);
    // roccia calcarea a strati
    const streak = noise2(x * 0.09 + z * 0.09, h * 0.02, I.seed + 4);
    c.copy(r0).lerp(r1, THREE.MathUtils.clamp(0.35 + 0.35 * Math.sin(h * 0.45 + nz * 2.5) + 0.3 * streak, 0, 1));
    c.multiplyScalar(0.84 + 0.16 * nz);
    // fascia scura di roccia bagnata e alghe al piede della falesia
    if (h < 7 && h > -3) c.lerp(wet, smooth(7, 1, h) * 0.7 * Math.min(1, slope * 2));
    // vegetazione sui pianori
    const patch = fbm(x * 0.008, z * 0.008, I.seed + 2, 3);
    const veg = P.vegAmt * smooth(0.34, 0.14, slope) * smooth(3, 12, h) * smooth(-0.62, -0.25, patch);
    tmp.copy(v0).lerp(v1, 0.5 + 0.5 * patch).lerp(v2, Math.max(0, nz) * 0.6);
    c.lerp(tmp, veg);
    // battigia
    if (h < 2.5) c.lerp(slope < 0.25 ? sand : wet, smooth(2.5, -0.5, h) * 0.8);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, mat);
}

function rockGeometry(seed, detail = 2) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise2(v.x * 1.7 + v.z * 1.3 + seed, v.y * 1.9 + seed * 0.3, seed);
    v.multiplyScalar(1 + 0.28 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createArchipelago({ mobile = false } = {}) {
  const group = new THREE.Group();
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#c2ab88', roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#e4d6b8', roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#b4613d', roughness: 0.8 });
  const rand = mulberry(7);

  const meshes = {};
  for (const I of ISLANDS) {
    const m = buildIslandMesh(I, mobile ? 15 : 9, landMat);
    meshes[I.key] = m;
    group.add(m);
  }
  const [SD, CR, SN, CA] = ISLANDS;

  // Maschera profondità per il mare (turchese vicino alle coste, schiuma sulla battigia)
  const N = mobile ? 256 : 512;
  const bounds = new THREE.Vector4(-2300, -3700, 5600, 4700);
  const data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = bounds.x + ((i + 0.5) / N) * bounds.z;
      const z = bounds.y + ((j + 0.5) / N) * bounds.w;
      const h = heightAt(x, z);
      data[j * N + i] = Math.round(THREE.MathUtils.clamp((h + 60) / 80, 0, 1) * 255);
    }
  }
  const shoreTex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  shoreTex.magFilter = THREE.LinearFilter;
  shoreTex.minFilter = THREE.LinearFilter;
  shoreTex.needsUpdate = true;

  // Pini d'Aleppo
  const treeCount = mobile ? 900 : 2600;
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), treeCount);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 5), new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1 }), treeCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tc = new THREE.Color();
  const treeIslands = [[SD, 0.72], [CA, 0.16], [SN, 0.12]];
  let placed = 0, guard = 0;
  while (placed < treeCount && guard++ < treeCount * 40) {
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
    p.set(x, h + th * 0.5 - 0.4, z); s.set(1, th, 1);
    trunk.setMatrixAt(placed, m4.compose(p, q.identity(), s));
    p.set(x, h + th + cr * 0.25, z); s.set(cr, cr * (0.42 + rand() * 0.2), cr);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    canopy.setMatrixAt(placed, m4.compose(p, q, s));
    tc.set(I.kind === 'pine' ? '#2f4a26' : '#4d5d2e').offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    canopy.setColorAt(placed, tc);
    placed++;
  }
  canopy.count = trunk.count = placed;
  group.add(canopy, trunk);

  // Abbazia-fortezza di San Nicola
  const fort = new THREE.Group();
  let best = null;
  for (let i = 0; i < 400; i++) {
    const t = (i / 400) * 2 - 1;
    const x = SN.cx + Math.cos(SN.rot) * t * SN.rx * 0.5, z = SN.cz + Math.sin(SN.rot) * t * SN.rx * 0.5;
    const h = islandHeight(SN, x, z);
    if (!best || h > best.h) best = { x, z, h, t };
  }
  const along = new THREE.Vector3(Math.cos(SN.rot), 0, Math.sin(SN.rot));
  const across = new THREE.Vector3(-along.z, 0, along.x);
  const yaw = Math.atan2(-along.z, along.x);
  const place = (mesh, a, b, lift = 0) => {
    const x = best.x + along.x * a + across.x * b, z = best.z + along.z * a + across.z * b;
    mesh.position.set(x, islandHeight(SN, x, z) + lift, z);
    mesh.rotation.y = yaw;
    fort.add(mesh);
    return mesh;
  };
  const church = place(new THREE.Mesh(new THREE.BoxGeometry(38, 16, 15), stoneMat), 0, 0, 6);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 38, 3, 1), roofMat);
  roof.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  const roofHolder = new THREE.Group(); roofHolder.add(roof); roof.scale.set(1, 1, 0.9);
  roofHolder.position.y = 10; church.add(roofHolder);
  place(new THREE.Mesh(new THREE.BoxGeometry(8, 34, 8), stoneMat), -24, 6, 12);
  for (let i = 0; i < 26; i++) {
    const t = (i / 26) * Math.PI * 2;
    const a = Math.cos(t) * 120, b = Math.sin(t) * 42;
    const w = new THREE.Mesh(new THREE.BoxGeometry(30, 11, 3.5), stoneMat);
    place(w, a, b, 2);
    w.rotation.y = yaw - t - Math.PI / 2 + 0.0;
    if (i % 6 === 0) place(new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 18, 10), stoneMat), a, b, 4);
  }
  group.add(fort);

  // Casette bianche di San Nicola e San Domino
  const houseCount = 70;
  const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), houseCount);
  const sdPort = coastPoint(SD, -26, 0);
  let hp = 0; guard = 0;
  while (hp < houseCount && guard++ < 4000) {
    const onSN = hp < 30;
    const cx = onSN ? best.x + along.x * 170 : sdPort.x - 160, cz = onSN ? best.z + along.z * 170 : sdPort.z + 120;
    const x = cx + (rand() - 0.5) * 220, z = cz + (rand() - 0.5) * 220;
    const h = heightAt(x, z);
    if (h < 4) continue;
    const w = 7 + rand() * 8, d = 6 + rand() * 7, ht = 5 + rand() * 4;
    p.set(x, h + ht / 2 - 1, z); s.set(w, ht, d);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (rand() > 0.5 ? 0 : Math.PI / 2));
    houses.setMatrixAt(hp, m4.compose(p, q, s));
    tc.set(['#f4efe4', '#efe3cc', '#f6f1ea', '#e9d9bd'][Math.floor(rand() * 4)]);
    houses.setColorAt(hp, tc);
    hp++;
  }
  houses.count = hp;
  group.add(houses);

  // Scogli e faraglioni lungo le coste
  const rockGeo = rockGeometry(3, 4);
  const stacks = new THREE.InstancedMesh(rockGeo, rockMat, 46);
  for (let i = 0; i < 46; i++) {
    const I = i < 26 ? SD : i < 34 ? SN : i < 42 ? CA : CR;
    const c = coastPoint(I, rand() * 360, -6 + rand() * 30);
    const sc = 3 + rand() * 9;
    p.set(c.x, sc * 0.25 - 1, c.z); s.set(sc, sc * (0.8 + rand()), sc * (0.7 + rand() * 0.6));
    q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * 6, rand() * 0.4));
    stacks.setMatrixAt(i, m4.compose(p, q, s));
  }
  group.add(stacks);

  // L'Architiello: arco di roccia
  const archPos = coastPoint(SD, 110, 42);
  const archGeo = new THREE.TorusGeometry(15, 7, 10, 28, Math.PI);
  {
    const pa = archGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = noise2(v.x * 0.15, v.y * 0.15 + v.z * 0.2, 9);
      v.multiplyScalar(1 + 0.12 * n);
      pa.setXYZ(i, v.x, v.y, v.z * (1.3 + 0.2 * n));
    }
    archGeo.computeVertexNormals();
  }
  const arch = new THREE.Mesh(archGeo, rockMat);
  arch.position.set(archPos.x, -3, archPos.z);
  arch.lookAt(SD.cx, -3, SD.cz);
  arch.rotateY(Math.PI / 2);
  arch.scale.set(1.1, 1.3, 1);
  group.add(arch);

  // Scoglio dell'Elefante: corpo + proboscide nell'acqua
  const elePos = coastPoint(SD, 172, 34);
  const ele = new THREE.Group();
  const body = new THREE.Mesh(rockGeometry(12, 3), rockMat);
  body.scale.set(26, 30, 20); body.position.y = 6;
  const trunkR = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 34, 10, 4), rockMat);
  trunkR.position.set(-20, -2, 0); trunkR.rotation.z = -0.35;
  const head = new THREE.Mesh(rockGeometry(4, 2), rockMat);
  head.scale.set(13, 14, 12); head.position.set(-14, 22, 0);
  ele.add(body, trunkR, head);
  ele.position.set(elePos.x, 0, elePos.z);
  ele.scale.setScalar(0.75);
  ele.lookAt(SD.cx, 0, SD.cz); ele.rotateY(-Math.PI / 2);
  group.add(ele);

  // Pontile di San Domino + biglietteria
  const pierStart = coastPoint(SD, -26, -6);
  const pierDir = new THREE.Vector3(pierStart.x - SD.cx, 0, pierStart.z - SD.cz).normalize();
  const pierLen = 70;
  const pier = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, pierLen), new THREE.MeshStandardMaterial({ color: '#bdb5a6', roughness: 0.9 }));
  pier.position.copy(pierStart).addScaledVector(pierDir, pierLen / 2).setY(0.6);
  pier.lookAt(pier.position.clone().add(pierDir));
  group.add(pier);
  const kiosk = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 4), new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.7 }));
  kiosk.position.copy(pierStart).addScaledVector(pierDir, -8);
  kiosk.position.y = Math.max(heightAt(kiosk.position.x, kiosk.position.z), 1) + 1.6;
  group.add(kiosk);
  const pierSide = new THREE.Vector3(-pierDir.z, 0, pierDir.x);
  const moorings = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const pos = pierStart.clone().addScaledVector(pierDir, 14 + Math.floor(i / 2) * 18).addScaledVector(pierSide, side * 4.6);
    moorings.push({ pos, yaw: Math.atan2(pierDir.x, pierDir.z) + Math.PI });
  }

  // Tappe del viaggio (waypoint della barca) — offshore per evitare la costa
  const route = [
    pierStart.clone().addScaledVector(pierDir, pierLen + 22).addScaledVector(pierSide, 8),
    coastPoint(SD, 8, 120),
    coastPoint(SD, 38, 120),
    coastPoint(SD, 72, 110),
    coastPoint(SD, 112, 95),
    coastPoint(SD, 150, 130),
    coastPoint(SD, 172, 120),
    coastPoint(SD, 212, 150),
    coastPoint(CA, 120, 260),
    coastPoint(CA, 75, 95),
    coastPoint(SN, 200, 190),
    coastPoint(SN, 165, 150),
  ];
  // indice del waypoint per ciascun capitolo (hero, porto, matano, bue, architiello, elefante, capraia, nicola)
  const chapterWaypoints = [0, 0, 1, 3, 4, 6, 9, 11];

  const padrePio = coastPoint(CA, 75, 75);
  const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff6a2a', roughness: 0.5 }));
  buoy.position.copy(padrePio).setY(0.2);
  group.add(buoy);

  return {
    group, meshes, shoreTex, shoreBounds: bounds, route, chapterWaypoints, moorings,
    fortress: new THREE.Vector3(best.x, best.h + 20, best.z),
    pois: { arch: archPos, elephant: elePos, padrePio, buoy },
    center: new THREE.Vector3(900, 0, -1100),
  };
}
