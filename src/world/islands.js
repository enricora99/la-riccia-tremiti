import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2, mulberry } from './noise.js';
import { ISLANDS, SHORE_BOUNDS, islandHeight, heightAt, coastXZ } from './terrain.js';
import { bakeStatic } from './bake.js';

export { ISLANDS, islandHeight, heightAt };

export function coastPoint(I, angleDeg, offset) {
  const { x, z } = coastXZ(I, angleDeg, offset);
  return new THREE.Vector3(x, 0, z);
}

function islandMesh({ pos, nrm, col, idx }, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
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

export function createArchipelago(terrain) {
  const group = new THREE.Group();
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#c2ab88', roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#e4d6b8', roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#b4613d', roughness: 0.8 });
  const rand = mulberry(7);

  const meshes = {};
  ISLANDS.forEach((I, i) => {
    const m = islandMesh(terrain.islands[i], landMat);
    meshes[I.key] = m;
    group.add(m);
  });
  const [SD, CR, SN, CA] = ISLANDS;

  // Maschera profondità per il mare (turchese vicino alle coste, schiuma sulla battigia)
  const N = terrain.shore.size;
  const bounds = new THREE.Vector4(...SHORE_BOUNDS);
  const shoreTex = new THREE.DataTexture(terrain.shore.data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  shoreTex.magFilter = THREE.LinearFilter;
  shoreTex.minFilter = THREE.LinearFilter;
  shoreTex.needsUpdate = true;

  // Pini d'Aleppo (posizioni calcolate nel worker)
  const T = terrain.trees;
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), T.count);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1, 5), new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1 }), T.count);
  canopy.instanceMatrix.array.set(T.canopy.subarray(0, T.count * 16));
  trunk.instanceMatrix.array.set(T.trunk.subarray(0, T.count * 16));
  canopy.instanceColor = new THREE.InstancedBufferAttribute(T.colors.slice(0, T.count * 3), 3);
  canopy.computeBoundingSphere(); trunk.computeBoundingSphere();
  group.add(canopy, trunk);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tc = new THREE.Color();
  let guard = 0;

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
  group.add(bakeStatic(fort));

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
