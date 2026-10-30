import * as THREE from 'three';
import { FLEET, CATEGORIES, waLink } from './data.js';

// Le foto vere della flotta, animate in WebGL: dondolio sull'onda, acqua che si increspa
// in primo piano, riflessi del sole e un'onda che porta via una barca e ne porta un'altra.

const photoUrl = (b) => `/fleet/${b.photo}.webp`;
const thumbUrl = (b) => `/fleet/${b.photo}-thumb.webp`;

const FRAG = /* glsl */ `
  uniform sampler2D tA, tB;
  uniform float uMix, uTime, uDir, uAspect, uMotion;
  uniform vec2 uMouse;
  varying vec2 vUv;

  float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }

  // la foto è quadrata: la ritaglio a "cover" sul formato del riquadro
  vec2 cover(vec2 uv, float zoom){
    vec2 p = uv - .5;
    if (uAspect > 1.) p.y /= uAspect; else p.x *= uAspect;
    return p * zoom + .5;
  }

  vec3 photo(sampler2D t, vec2 uv, float zoom, float seed){
    vec2 p = cover(uv, zoom);
    // dondolio: rollio e beccheggio lenti come su un gommone all'ancora
    float a = sin(uTime * .62 + seed) * .006 * uMotion;
    p -= vec2(.5, .42);
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
    p += vec2(.5, .42);
    p.y += sin(uTime * 1.05 + seed) * .0045 * uMotion;
    // parallasse: il primo piano si sposta più dello sfondo
    p += uMouse * .012 * (1.2 - p.y) * uMotion;
    // increspature solo sull'acqua in primo piano
    float water = smoothstep(.36, .1, p.y) * uMotion;
    vec2 q = p * vec2(7., 30.) + vec2(uTime * .25, uTime * .9);
    vec2 d = vec2(noise(q) - .5, noise(q + 7.3) - .5) * .014 * water;
    vec3 col = texture2D(t, p + d).rgb;
    // scintillii del sole sull'acqua
    float sp = pow(noise(p * vec2(70., 190.) + vec2(uTime * .6, uTime * 2.2)), 14.);
    float luma = dot(col, vec3(.3, .6, .1));
    col += vec3(1.) * sp * water * smoothstep(.35, .8, luma) * 1.6;
    return col;
  }

  void main(){
    vec2 uv = vUv;
    float x = uDir > 0. ? 1. - uv.x : uv.x;
    // fronte d'onda che attraversa il riquadro
    float edge = uMix * 1.5 - .25 + .05 * sin(uv.y * 11. + uTime * 3.) + .035 * (noise(uv * vec2(3., 9.) + uTime) - .5);
    float band = smoothstep(.16, 0., abs(x - edge)) * step(.001, uMix) * step(uMix, .999);
    vec2 push = vec2(uDir > 0. ? -1. : 1., 0.) * band * .05;
    vec3 a = photo(tA, uv + push, .95 - uMix * .04, 0.);
    vec3 b = photo(tB, uv + push * .6, .91 + uMix * .04, 1.7);
    float m = smoothstep(edge + .02, edge - .02, x);
    vec3 col = mix(a, b, m);
    // cresta di schiuma sul fronte d'onda
    col = mix(col, vec3(.96, .99, 1.), pow(band, 3.) * .55);
    // vignettatura morbida
    col *= 1. - .22 * pow(length((vUv - .5) * vec2(1.1, 1.3)), 2.2);
    gl_FragColor = vec4(col, 1.);
    #include <colorspace_fragment>
  }`;

export function createFleetViewer({ canvas, gsap, mobile, reducedMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blank = new THREE.DataTexture(new Uint8Array([10, 58, 80, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = {
    tA: { value: blank }, tB: { value: blank }, uMix: { value: 0 }, uTime: { value: 0 }, uDir: { value: 1 },
    uAspect: { value: 1 }, uMotion: { value: reducedMotion ? 0 : 1 }, uMouse: { value: new THREE.Vector2() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: FRAG,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  const loader = new THREE.TextureLoader();
  const cache = new Map();
  function texture(i) {
    if (!cache.has(i)) {
      cache.set(i, new Promise((res, rej) => loader.load(photoUrl(FLEET[i]), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        res(t);
      }, undefined, rej)));
    }
    return cache.get(i);
  }

  let index = -1, motion = reducedMotion ? 0 : 1, tween = null, dirty = true, req = 0;
  async function show(i, dir = 1) {
    i = (i + FLEET.length) % FLEET.length;
    const first = index < 0;
    index = i;
    const tex = await texture(i);
    if (index !== i) return;
    texture((i + 1) % FLEET.length); texture((i - 1 + FLEET.length) % FLEET.length);
    tween?.kill();
    if (first) { uniforms.tA.value = tex; uniforms.uMix.value = 0; dirty = true; return; }
    uniforms.tB.value = tex;
    uniforms.uDir.value = dir;
    uniforms.uMix.value = 0;
    tween = gsap.to(uniforms.uMix, {
      value: 1, duration: motion ? 1.25 : 0.01, ease: 'power2.inOut',
      onUpdate: () => { dirty = true; },
      onComplete: () => { uniforms.tA.value = tex; uniforms.uMix.value = 0; dirty = true; },
    });
  }

  // Parallasse con il puntatore (desktop) e swipe per cambiare barca
  const mouse = new THREE.Vector2(), mouseT = new THREE.Vector2();
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseT.set((e.clientX - r.left) / r.width - 0.5, -((e.clientY - r.top) / r.height - 0.5));
  });
  canvas.addEventListener('pointerleave', () => mouseT.set(0, 0));
  let swipeX = null;
  const swipeHandlers = [];
  canvas.addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
  canvas.addEventListener('pointerup', (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 40) swipeHandlers.forEach((h) => h(dx < 0 ? 1 : -1));
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    uniforms.uAspect.value = w / h;
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let active = false;
  const timer = new THREE.Timer();
  function frame() {
    req = requestAnimationFrame(frame);
    if (!active) return;
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    if (motion) {
      uniforms.uTime.value += dt;
      mouse.lerp(mouseT, 1 - Math.exp(-dt * 4));
      uniforms.uMouse.value.copy(mouse);
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  }
  frame();

  return {
    show,
    get index() { return index; },
    onSwipe(h) { swipeHandlers.push(h); },
    setActive(a) { if (a && !active) timer.reset?.(); active = a; dirty = true; },
    setReducedMotion(r) { motion = r ? 0 : 1; uniforms.uMotion.value = motion; dirty = true; },
    dispose() { cancelAnimationFrame(req); renderer.dispose(); },
  };
}

// Interfaccia della flotta: funziona anche senza WebGL (foto statica al posto del canvas)
export function mountFleetUI({ viewer, gsap, fallbackImg }) {
  const list = document.getElementById('boat-list');
  const els = {
    cat: document.getElementById('boat-cat'), name: document.getElementById('boat-name'), desc: document.getElementById('boat-desc'),
    len: document.getElementById('spec-len'), hp: document.getElementById('spec-hp'), seats: document.getElementById('spec-seats'),
    book: document.getElementById('boat-book'),
  };
  const fmt = (n) => n.toFixed(2).replace('.', ',');
  list.innerHTML = FLEET.map((b, i) => `
    <li data-cat="${b.cat}"><button data-i="${i}" aria-label="${b.name}, ${fmt(b.length)} metri, ${b.seats} posti">
      <img src="${thumbUrl(b)}" alt="" width="56" height="56" loading="lazy" decoding="async">
      <span><b>${b.name}</b><small>${fmt(b.length)} m · ${b.seats} posti</small></span>
    </button></li>`).join('');

  let current = -1;
  function select(i, dir = 1) {
    i = (i + FLEET.length) % FLEET.length;
    current = i;
    const spec = FLEET[i];
    if (viewer) viewer.show(i, dir);
    else if (fallbackImg) { fallbackImg.src = photoUrl(spec); fallbackImg.alt = `Gommone ${spec.name}`; }
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', +b.dataset.i === i));
    const active = list.querySelector(`button[data-i="${i}"]`);
    if (active && list.scrollWidth > list.clientWidth) list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.clientWidth / 2, behavior: 'smooth' });
    if (!document.documentElement.classList.contains('reduced')) {
      gsap.fromTo([els.cat, els.name, els.desc, '.boat-specs'], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' });
    }
    els.cat.textContent = spec.cat;
    els.name.textContent = spec.name;
    els.desc.textContent = CATEGORIES[spec.cat];
    els.len.textContent = fmt(spec.length);
    els.hp.textContent = spec.hp;
    els.seats.textContent = `fino a ${spec.seats}`;
    els.book.href = waLink(`Ciao Angelica! Vorrei prenotare il gommone ${spec.name} (${fmt(spec.length)} m, ${spec.hp} cv). Persone: … Data: …`);
    els.book.textContent = `Prenota ${spec.name} su WhatsApp`;
  }

  const visible = () => [...list.querySelectorAll('li:not([hidden]) button')].map((b) => +b.dataset.i);
  const stepBy = (step) => {
    const v = visible();
    const pos = v.indexOf(current);
    select(v[(pos + step + v.length) % v.length] ?? current + step, step);
  };

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    if (i !== current) select(i, i > current ? 1 : -1);
  });
  document.querySelectorAll('.fleet-nav [data-step]').forEach((btn) => btn.addEventListener('click', () => stepBy(+btn.dataset.step)));
  viewer?.onSwipe(stepBy);
  document.querySelector('.fleet-canvas-wrap')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') stepBy(1);
    if (e.key === 'ArrowLeft') stepBy(-1);
  });
  document.querySelectorAll('.filters .chip').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.filters .chip').forEach((c) => { c.classList.toggle('is-active', c === chip); c.setAttribute('aria-selected', c === chip); });
    const f = chip.dataset.filter;
    let first = null;
    list.querySelectorAll('li').forEach((li) => {
      const show = f === 'all' || li.dataset.cat === f;
      li.hidden = !show;
      if (show && first === null) first = +li.querySelector('button').dataset.i;
    });
    if (first !== null && f !== 'all' && FLEET[current].cat !== f) select(first, 1);
  }));

  select(0);
}
