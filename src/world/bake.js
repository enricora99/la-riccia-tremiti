import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Fonde le mesh statiche di un gruppo in una mesh per materiale:
// un gommone passa da ~40 draw call a ~10. Gli oggetti in `keep` restano animabili.
export function bakeStatic(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const kept = new Set();
  keep.forEach((k) => k?.traverse((o) => kept.add(o)));
  const byMat = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || kept.has(o) || o.isInstancedMesh) return;
    const g = o.geometry.clone();
    if (!g.index) {
      // indice banale: più economico che de-indicizzare tutte le altre geometrie
      const n = g.attributes.position.count;
      g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(n).map((_, i) => i) : new Uint16Array(n).map((_, i) => i), 1));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const needUv = !!o.material.map;
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && !(needUv && name === 'uv')) g.deleteAttribute(name);
    }
    g.morphAttributes = {};
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  victims.forEach((o) => o.parent.remove(o));
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.renderOrder = mat.transparent ? 1 : 0;
    root.add(mesh);
  }
  return root;
}
