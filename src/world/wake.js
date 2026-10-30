import * as THREE from 'three';
import { U, NOISE_GLSL } from './atmosphere.js';
import { waveHeight } from './ocean.js';

// Scia di schiuma: un nastro che segue la storia delle posizioni della barca.
export function createWake(max = 90) {
  const pts = [];
  const pos = new Float32Array(max * 2 * 3);
  const age = new Float32Array(max * 2);
  const side = new Float32Array(max * 2);
  const idx = [];
  for (let i = 0; i < max - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < max; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAge', new THREE.BufferAttribute(age, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uSunColor: U.uSunColor },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aAge; attribute float aSide; varying float vAge; varying float vSide; varying vec2 vP;
      void main(){ vAge = aAge; vSide = aSide; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSunColor; varying float vAge; varying float vSide; varying vec2 vP;
      ${NOISE_GLSL}
      void main(){
        float n = fbm3(vP * 0.35 + vec2(uTime * 0.3, 0.));
        float edge = smoothstep(1., 0.55, abs(vSide)) ;
        float center = 0.35 + 0.65 * smoothstep(0.0, 0.7, abs(vSide));
        float a = (1. - vAge) * edge * center * smoothstep(0.3, 0.75, n + (1. - vAge) * 0.35);
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(vec3(0.92, 0.97, 1.), uSunColor, 0.15), a * 0.85);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  const life = 9;
  function update(boatPos, forward, beam, speed, t) {
    const stern = boatPos.clone().addScaledVector(forward, -1.2);
    const last = pts[0];
    if (speed > 0.6 && (!last || last.p.distanceTo(stern) > 1.4)) {
      pts.unshift({ p: stern.clone(), dir: forward.clone(), t0: t, w: beam * 0.45, k: THREE.MathUtils.clamp(speed / 12, 0.2, 1) });
      if (pts.length > max) pts.pop();
    }
    while (pts.length && t - pts[pts.length - 1].t0 > life) pts.pop();
    for (let i = 0; i < max; i++) {
      const pt = pts[Math.min(i, pts.length - 1)];
      if (!pt) { age[i * 2] = age[i * 2 + 1] = 1; continue; }
      const a = i < pts.length ? Math.min((t - pt.t0) / life / pt.k, 1) : 1;
      const w = pt.w + (t - pt.t0) * 1.6;
      const rx = -pt.dir.z, rz = pt.dir.x;
      for (const s of [0, 1]) {
        const sg = s ? 1 : -1;
        const x = pt.p.x + rx * w * sg, z = pt.p.z + rz * w * sg;
        const k = (i * 2 + s) * 3;
        pos[k] = x; pos[k + 1] = waveHeight(x, z, t) + 0.06; pos[k + 2] = z;
        age[i * 2 + s] = a;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aAge.needsUpdate = true;
  }
  return { mesh, update };
}
