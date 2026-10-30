import * as THREE from 'three';
import { U, NOISE_GLSL } from './atmosphere.js';

// Onde sinusoidali: stessa formula in GLSL e in JS, così le barche galleggiano davvero.
// [dirX, dirZ, ampiezza (m), lunghezza d'onda (m)]
const WAVES = [
  [1.0, 0.35, 0.32, 58],
  [0.55, 1.0, 0.2, 31],
  [-0.45, 1.0, 0.11, 17],
  [1.0, -0.7, 0.06, 9.5],
].map(([x, z, a, l]) => {
  const len = Math.hypot(x, z);
  const k = (Math.PI * 2) / l;
  return { dx: x / len, dz: z / len, a, k, w: Math.sqrt(9.81 * k) };
});

export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVES) h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t);
  return h;
}

const fl = (n) => n.toFixed(5);
const WAVES_GLSL = WAVES.map(
  (w) => `{ float ph = ${fl(w.k)} * dot(vec2(${fl(w.dx)}, ${fl(w.dz)}), p) - ${fl(w.w)} * t;
    h += ${fl(w.a)} * sin(ph); g += vec2(${fl(w.dx)}, ${fl(w.dz)}) * ${fl(w.a * w.k)} * cos(ph); }`
).join('\n');

function polarGrid(rings, segs, maxR) {
  const pos = [];
  const idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = maxR * Math.pow(i / rings, 2.4);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function createOcean({ shoreTex, shoreBounds, mobile = false }) {
  const geo = polarGrid(mobile ? 110 : 170, mobile ? 96 : 160, 16000);
  const uniforms = {
    ...U,
    uShore: { value: shoreTex },
    uShoreBounds: { value: shoreBounds },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld; varying vec2 vGrad;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.);
        vec2 p = wp.xz; float t = uTime; float h = 0.; vec2 g = vec2(0.);
        ${WAVES_GLSL}
        wp.y += h; vWorld = wp.xyz; vGrad = g;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFogDensity;
      uniform vec3 uSunDir, uSunColor, uZenith, uHorizon, uDeep, uShallow;
      uniform sampler2D uShore; uniform vec4 uShoreBounds;
      varying vec3 vWorld; varying vec2 vGrad;
      ${NOISE_GLSL}
      vec2 detail(vec2 p, float t){
        vec2 g = vec2(0.);
        float a = 0.05, k = 0.9;
        for(int i=0;i<7;i++){
          float ang = float(i) * 2.399;
          vec2 d = vec2(cos(ang), sin(ang));
          float w = sqrt(9.81 * k);
          g += d * a * k * cos(k * dot(d, p) - w * t + float(i));
          k *= 1.55; a *= 0.72;
        }
        return g;
      }
      void main(){
        vec3 V = vWorld - cameraPosition; float dist = length(V); V /= dist;
        float fall = 1. / (1. + dist * 0.006);
        vec2 g = vGrad + detail(vWorld.xz, uTime) * (0.25 + 0.75 * fall);
        vec3 N = normalize(vec3(-g.x, 1., -g.y));
        N = normalize(mix(N, vec3(0,1,0), smoothstep(800., 9000., dist) * 0.8));
        vec3 E = -V;
        float fres = 0.02 + 0.98 * pow(1. - max(dot(N, E), 0.), 5.);
        vec3 R = reflect(V, N); R.y = abs(R.y);
        vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.45));

        // Profondità dalla mappa delle coste (0 = -60m, 1 = +20m)
        vec2 suv = (vWorld.xz - uShoreBounds.xy) / uShoreBounds.zw;
        float depth = -60.;
        if (suv.x > 0. && suv.x < 1. && suv.y > 0. && suv.y < 1.) depth = texture2D(uShore, suv).r * 80. - 60.;
        float shallow = smoothstep(-34., -3., depth);
        float sunUp = clamp(uSunDir.y * 3., 0.25, 1.);
        vec3 deep = uDeep * (0.55 + 0.45 * sunUp);
        vec3 water = mix(deep, uShallow * (0.65 + 0.35 * sunUp), shallow * 0.9);
        // Scattering sotto la cresta delle onde
        water += uShallow * 0.08 * max(dot(N, uSunDir), 0.) * (1. - fres);

        vec3 col = mix(water, sky, fres * (0.75 - 0.35 * shallow));
        float spec = pow(max(dot(R, uSunDir), 0.), 900.) * 14. + pow(max(dot(R, uSunDir), 0.), 90.) * 0.4;
        col += uSunColor * spec;

        // Schiuma sulla battigia
        float n = fbm3(vWorld.xz * 0.12 + vec2(uTime * 0.15, 0.)) ;
        float foam = smoothstep(-4.5, -0.8, depth) * smoothstep(0.35, 0.7, n + 0.25 * sin(uTime * 1.3 + depth * 2.));
        col = mix(col, vec3(0.96) * (0.6 + 0.4 * sunUp) + uSunColor * 0.1, foam * 0.85);

        float fog = 1. - exp(-dist * uFogDensity);
        col = mix(col, uHorizon, clamp(fog, 0., 1.));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => {
    mesh.position.set(cam.position.x, 0, cam.position.z);
    mesh.updateMatrixWorld();
  };
  return mesh;
}
