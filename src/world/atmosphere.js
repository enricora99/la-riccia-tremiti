import * as THREE from 'three';

// Uniform condivisi tra cielo, mare e scia: un solo aggiornamento per frame.
export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.4, -0.8).normalize() },
  uSunColor: { value: new THREE.Color('#fff2dc') },
  uZenith: { value: new THREE.Color('#3b78b8') },
  uHorizon: { value: new THREE.Color('#cfe2ee') },
  uDeep: { value: new THREE.Color('#0b4a66') },
  uShallow: { value: new THREE.Color('#33c6c0') },
  uFogDensity: { value: 0.00004 },
};

// Momenti della giornata: 0 mattino, 0.45 mezzogiorno, 0.75 pomeriggio, 1 ora dorata
const KEYS = [
  { t: 0.0, elev: 13, azim: 105, sun: '#ffd2a1', zen: '#3f7fc6', hor: '#dfe2e2', deep: '#0b5478', shal: '#39c4bc', fog: 0.000045 },
  { t: 0.45, elev: 58, azim: 160, sun: '#fff7ea', zen: '#2a6fc2', hor: '#cfe3f1', deep: '#06587f', shal: '#2fd3c8', fog: 0.00003 },
  { t: 0.75, elev: 28, azim: 220, sun: '#ffe7c4', zen: '#3572bb', hor: '#e2e0d6', deep: '#0a5275', shal: '#33c6bb', fog: 0.00004 },
  { t: 1.0, elev: 5, azim: 252, sun: '#ff9a52', zen: '#2c4677', hor: '#ffb27a', deep: '#1a3f62', shal: '#3a9f9f', fog: 0.00006 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpColor(target, a, b, f) {
  tmpA.set(a); tmpB.set(b);
  target.copy(tmpA).lerp(tmpB, f);
}

export function applyTimeOfDay(tod, extra = {}) {
  tod = THREE.MathUtils.clamp(tod, 0, 1);
  let i = 0;
  while (i < KEYS.length - 2 && tod > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = THREE.MathUtils.smoothstep(tod, a.t, b.t);
  const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.elev, b.elev, f));
  const azim = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.azim, b.azim, f));
  U.uSunDir.value.set(Math.cos(elev) * Math.sin(azim), Math.sin(elev), -Math.cos(elev) * Math.cos(azim)).normalize();
  lerpColor(U.uSunColor.value, a.sun, b.sun, f);
  lerpColor(U.uZenith.value, a.zen, b.zen, f);
  lerpColor(U.uHorizon.value, a.hor, b.hor, f);
  lerpColor(U.uDeep.value, a.deep, b.deep, f);
  lerpColor(U.uShallow.value, a.shal, b.shal, f);
  U.uFogDensity.value = THREE.MathUtils.lerp(a.fog, b.fog, f) * (extra.fogScale ?? 1);
  return { elev };
}

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return s; }
`;
export { NOISE_GLSL };

export function createSky() {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uSunColor, uZenith, uHorizon; uniform float uTime;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
        float sd = max(dot(d, uSunDir), 0.);
        col += uSunColor * (pow(sd, 6.) * 0.32 + pow(sd, 64.) * 0.45);
        col += uSunColor * smoothstep(0.9993, 0.9998, sd) * 6.;
        // Velature di nuvole alte
        vec2 uv = d.xz / max(d.y + 0.08, 0.04);
        float c = fbm3(uv * 1.3 + vec2(uTime * 0.006, uTime * 0.002));
        c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.22, d.y);
        vec3 cloud = mix(uHorizon * 1.08, uSunColor, 0.35 + 0.5 * pow(sd, 3.));
        col = mix(col, cloud, c * 0.75);
        // Foschia sotto l'orizzonte
        col = mix(col, uHorizon, smoothstep(0.02, -0.04, d.y));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(30000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
