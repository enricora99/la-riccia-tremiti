import * as THREE from 'three';
import { noise2 } from './noise.js';

// La statua di Padre Pio nel parco marino di Capraia: fondale, caustiche, pesci, bolle e raggi di luce.

const CAUSTIC_GLSL = /* glsl */ `
float caustic(vec2 uv, float time){
  vec2 p = mod(uv * 6.2831, 6.2831) - 250.;
  vec2 i = p; float c = 1.; float inten = .005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.), 0., 1.);
}`;

function withCaustics(material, uniforms, strength = 1) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uCaustic = uniforms.uCaustic;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld; varying float vCUp;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 cw = vec4(transformed, 1.); vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
        #endif
        vCWorld = (modelMatrix * cw).xyz; vCUp = normalize(mat3(modelMatrix) * cn).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCWorld; varying float vCUp; uniform float uTime, uCaustic;\n${CAUSTIC_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float cs = caustic(vCWorld.xz * 0.11 + vCWorld.y * 0.02, uTime * 0.55) + caustic(vCWorld.xz * 0.23 + 3.1, uTime * 0.4) * 0.5;
        totalEmissiveRadiance += vec3(0.55, 0.9, 1.0) * cs * ${strength.toFixed(2)} * uCaustic * smoothstep(-0.3, 0.8, vCUp);`);
  };
  return material;
}

// Statua procedurale: saio, cordone, braccia aperte, volto barbuto rivolto alla superficie
function createStatue(mat) {
  const g = new THREE.Group();
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    g.add(m);
    return m;
  };
  // basamento di roccia
  add(new THREE.CylinderGeometry(0.85, 1.15, 0.6, 14), 0, 0.3, 0);
  // saio (profilo di rivoluzione, schiacciato davanti/dietro)
  const prof = [[0.64, 0.6], [0.6, 0.85], [0.53, 1.3], [0.45, 1.75], [0.4, 2.05], [0.4, 2.3], [0.43, 2.42], [0.33, 2.56], [0.16, 2.64], [0.01, 2.66]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(prof, 28), 0, 0, 0, 0, 0, 0, 1, 1, 0.74);
  // cordone francescano
  add(new THREE.TorusGeometry(0.47, 0.03, 6, 28), 0, 1.62, 0, Math.PI / 2, 0, 0, 1, 0.74, 1);
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 5), 0.16, 1.22, 0.34, 0.08);
  // cappuccio sulle spalle
  add(new THREE.TorusGeometry(0.24, 0.1, 8, 18), 0, 2.58, -0.04, Math.PI / 2 - 0.25, 0, 0, 1, 1, 0.8);
  // testa inclinata all'indietro, barba
  const head = new THREE.Group();
  head.position.set(0, 2.7, 0.02);
  head.rotation.x = -0.42;
  g.add(head);
  const hm = (geo, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); head.add(m); };
  hm(new THREE.SphereGeometry(0.16, 18, 14), 0, 0.17, 0, 1, 1.18, 1.05);
  hm(new THREE.SphereGeometry(0.15, 14, 12), 0, 0.03, 0.06, 0.92, 1.05, 0.8);
  hm(new THREE.SphereGeometry(0.03, 8, 6), 0, 0.15, 0.17, 1, 1.3, 1);
  hm(new THREE.SphereGeometry(0.07, 10, 8), 0, 0.27, -0.06, 2.1, 0.6, 1.9);
  // braccia aperte, maniche larghe, palmi verso l'alto
  for (const s of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.34, 2.38, 0.02);
    arm.rotation.set(0, -s * 0.32, s * 0.18);
    g.add(arm);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.86, 12, 1, true), mat);
    sleeve.rotation.z = s * Math.PI / 2;
    sleeve.position.x = s * 0.43;
    arm.add(sleeve);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.36, 8), mat);
    fore.rotation.z = s * Math.PI / 2;
    fore.position.x = s * 0.9;
    arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat);
    hand.scale.set(1.5, 0.45, 1.05);
    hand.position.set(s * 1.13, 0.02, 0.01);
    arm.add(hand);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.07, 2, 5), mat);
      finger.rotation.z = s * Math.PI / 2;
      finger.position.set(s * 1.26, 0.025, -0.045 + f * 0.03);
      arm.add(finger);
    }
  }
  return g;
}

function fishGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.5, 0);
  s.bezierCurveTo(0.35, 0.22, -0.1, 0.24, -0.3, 0.05);
  s.lineTo(-0.5, 0.2); s.lineTo(-0.44, 0); s.lineTo(-0.5, -0.2); s.lineTo(-0.3, -0.05);
  s.bezierCurveTo(-0.1, -0.22, 0.35, -0.2, 0.5, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateY(-Math.PI / 2); // muso verso +z
  return g;
}

export function createUnderwater({ statuePos, front, floorY = -12.5, mobile = false }) {
  const group = new THREE.Group();
  group.visible = false;
  const uniforms = { uTime: { value: 0 }, uCaustic: { value: 1 } };

  // Fondale sabbioso con increspature e chiazze di posidonia
  const R = 70;
  const floorGeo = new THREE.CircleGeometry(R, mobile ? 64 : 96, 0, Math.PI * 2);
  floorGeo.rotateX(-Math.PI / 2);
  {
    const p = floorGeo.attributes.position;
    const col = new Float32Array(p.count * 3);
    const sand = new THREE.Color('#d9c9a0'), weed = new THREE.Color('#3f5a3a'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const d = Math.hypot(x, z) / R;
      const y = 0.25 * Math.sin(x * 1.3 + noise2(x * 0.2, z * 0.2, 4) * 3) + 1.4 * noise2(x * 0.05, z * 0.05, 8) + d * d * 6;
      p.setY(i, y);
      const patch = noise2(x * 0.08 + 9, z * 0.08, 2);
      c.copy(sand).lerp(weed, THREE.MathUtils.smoothstep(patch, 0.1, 0.45) * 0.85);
      col.set([c.r, c.g, c.b], i * 3);
    }
    floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const floor = new THREE.Mesh(floorGeo, withCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), uniforms, 1.1));
  floor.position.set(statuePos.x, floorY, statuePos.z);
  group.add(floor);

  // Massi sul fondale
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rocks = new THREE.InstancedMesh(rockGeo, withCaustics(new THREE.MeshStandardMaterial({ color: '#8f8a78', roughness: 1, flatShading: true }), uniforms, 0.8), 26);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, r = 5 + (i * 7.3) % 30;
    const s = 0.4 + ((i * 3.7) % 1.6);
    ps.set(statuePos.x + Math.cos(a) * r, floorY + s * 0.3, statuePos.z + Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler(i, i * 0.7, 0));
    sc.set(s, s * 0.6, s * 0.9);
    rocks.setMatrixAt(i, m4.compose(ps, q, sc));
  }
  group.add(rocks);

  // Statua
  const statueMat = withCaustics(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, side: THREE.DoubleSide }), uniforms, 0.9);
  const statue = createStatue(statueMat);
  // patina di pietra e alghe: macchie più scure e verdi, più fitte in basso
  {
    const stone = new THREE.Color('#8d9a90'), algae = new THREE.Color('#566b4e'), dark = new THREE.Color('#5f6a66'), c = new THREE.Color(), v = new THREE.Vector3();
    statue.updateMatrixWorld(true);
    statue.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        const n = noise2(v.x * 3.1 + v.z * 2.3, v.y * 3.7, 5), n2 = noise2(v.x * 9, v.y * 9 + v.z * 7, 9);
        c.copy(stone).lerp(algae, THREE.MathUtils.clamp(0.25 + n * 0.6 - v.y * 0.12, 0, 0.85)).lerp(dark, Math.max(0, n2) * 0.5);
        col.set([c.r, c.g, c.b], i * 3);
      }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    });
  }
  statue.position.set(statuePos.x, floorY + 0.15, statuePos.z);
  statue.rotation.y = Math.atan2(front.x, front.z);
  statue.scale.setScalar(1.15);
  group.add(statue);
  const headY = floorY + 0.15 + 2.95 * 1.15;

  // Castagnole: un banco che gira intorno alla statua
  const nFish = mobile ? 70 : 140;
  const fish = new THREE.InstancedMesh(fishGeometry(), new THREE.MeshStandardMaterial({ color: '#22323d', roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide }), nFish);
  const fishData = Array.from({ length: nFish }, (_, i) => ({
    r: 1.4 + ((i * 0.618) % 1) * 4.6,
    y: floorY + 1.2 + ((i * 0.377) % 1) * 7.5,
    w: (0.25 + ((i * 0.13) % 1) * 0.35) * (i % 4 === 0 ? -1 : 1),
    ph: i * 1.7,
    s: 0.14 + ((i * 0.29) % 1) * 0.1,
  }));
  group.add(fish);

  // Bolle che salgono (animate nello shader)
  const nB = mobile ? 70 : 140;
  const bPos = new Float32Array(nB * 3), bSeed = new Float32Array(nB * 3);
  for (let i = 0; i < nB; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 7;
    bPos.set([statuePos.x + Math.cos(a) * r, floorY, statuePos.z + Math.sin(a) * r], i * 3);
    bSeed.set([Math.random(), 0.35 + Math.random() * 0.6, Math.random() * 6.28], i * 3);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('aSeed', new THREE.BufferAttribute(bSeed, 3));
  const bubbles = new THREE.Points(bGeo, new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uDepth: { value: -floorY }, uPx: { value: 1 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed; uniform float uTime, uDepth, uPx; varying float vA;
      void main(){
        vec3 p = position;
        float h = mod(aSeed.x * uDepth + uTime * aSeed.y, uDepth);
        p.y += h;
        p.x += sin(uTime * 2. + aSeed.z + h) * 0.12;
        p.z += cos(uTime * 1.7 + aSeed.z) * 0.12;
        vA = smoothstep(0., 1., h) * smoothstep(uDepth, uDepth - 2., h);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (0.05 + aSeed.x * 0.07) * uPx * 420. / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - .5; float d = length(c);
        float ring = smoothstep(.5, .38, d) * (0.35 + smoothstep(.22, .45, d) * 0.65);
        float hl = smoothstep(.16, 0., length(c - vec2(-.14, -.14)));
        gl_FragColor = vec4(vec3(0.85, 0.97, 1.), (ring * 0.5 + hl * 0.6) * vA);
      }`,
  }));
  bubbles.frustumCulled = false;
  group.add(bubbles);

  // Raggi di luce dalla superficie
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uColor: { value: new THREE.Color('#bfeaff') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float edge = smoothstep(0., .45, vUv.x) * smoothstep(1., .55, vUv.x);
        float fall = smoothstep(0., .7, vUv.y) * smoothstep(1., .9, vUv.y);
        float flick = .55 + .45 * sin(uTime * 1.3 + vUv.x * 9. + vUv.y * 3.);
        gl_FragColor = vec4(uColor, edge * fall * flick * .14);
      }`,
  });
  const rays = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + (i % 3) * 0.9, -floorY + 2), rayMat);
    const a = i * 2.1, r = 1 + (i % 4) * 2.3;
    m.position.set(statuePos.x + Math.cos(a) * r, floorY / 2, statuePos.z + Math.sin(a) * r);
    rays.add(m);
  }
  group.add(rays);

  const dummy = new THREE.Object3D();
  return {
    group,
    statue,
    headY,
    floorY,
    floorAt(x, z) {
      const d = Math.hypot(x - statuePos.x, z - statuePos.z);
      return d < R ? floorY + 1.4 + (d / R) * (d / R) * 6 : -60;
    },
    update(t, camera, sunDir, px) {
      uniforms.uTime.value = t;
      uniforms.uCaustic.value = THREE.MathUtils.clamp(sunDir.y * 2.5, 0.25, 1);
      bubbles.material.uniforms.uPx.value = px;
      for (let i = 0; i < nFish; i++) {
        const f = fishData[i];
        const a = t * f.w + f.ph;
        const wob = Math.sin(t * 0.6 + f.ph) * 0.6;
        dummy.position.set(statuePos.x + Math.cos(a) * (f.r + wob), f.y + Math.sin(t * 0.8 + f.ph) * 0.35, statuePos.z + Math.sin(a) * (f.r + wob));
        dummy.rotation.set(0, -a + (f.w > 0 ? Math.PI : 0) + Math.sin(t * 9 + f.ph) * 0.18, 0);
        dummy.scale.setScalar(f.s);
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
      }
      fish.instanceMatrix.needsUpdate = true;
      for (const m of rays.children) {
        m.rotation.set(0, Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z), 0);
      }
    },
  };
}
