import * as THREE from 'three';
import { U, applyTimeOfDay, createSky } from './world/atmosphere.js';
import { createOcean, waveHeight } from './world/ocean.js';
import { createBoat, disposeBoat } from './world/boat.js';
import { FLEET, CATEGORIES, waLink } from './data.js';

export function createFleetViewer({ canvas, gsap, mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40000);
  scene.add(createSky());
  const sun = new THREE.DirectionalLight('#ffffff', 2.6);
  const hemi = new THREE.HemisphereLight('#cfe3f2', '#2f6b75', 0.9);
  scene.add(sun, hemi);

  // Fondale di sabbia chiara: l'acqua resta turchese come a Cala Matano
  const shallow = new THREE.DataTexture(new Uint8Array([Math.round(((-7 + 60) / 80) * 255)]), 1, 1, THREE.RedFormat);
  shallow.needsUpdate = true;
  const ocean = createOcean({ shoreTex: shallow, shoreBounds: new THREE.Vector4(-1e5, -1e5, 2e5, 2e5), mobile: true });
  scene.add(ocean);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const TOD = 0.4;
  applyTimeOfDay(TOD);
  const envScene = new THREE.Scene();
  envScene.add(createSky());
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100).texture;

  let current = null;
  let index = 0;
  let angle = 0.9, angleVel = 0, dragging = false, lastX = 0, idle = 0;
  let camDist = 10;

  function holderFor(spec) {
    const h = new THREE.Group();
    const boat = createBoat(spec);
    h.add(boat);
    h.userData.boat = boat;
    scene.add(h);
    return h;
  }

  function show(i, dir = 1) {
    index = (i + FLEET.length) % FLEET.length;
    const spec = FLEET[index];
    const prev = current;
    current = holderFor(spec);
    const L = spec.length;
    gsap.to({ d: camDist }, { d: L * 1.1 + 3, duration: 1.4, ease: 'power3.inOut', onUpdate() { camDist = this.targets()[0].d; } });
    current.position.z = -dir * 34;
    gsap.to(current.position, { z: 0, duration: 1.7, ease: 'power3.out' });
    if (prev) {
      gsap.to(prev.position, {
        z: dir * 46, duration: 1.2, ease: 'power2.in',
        onComplete: () => { scene.remove(prev); disposeBoat(prev.userData.boat); },
      });
    }
    return spec;
  }

  // Trascinamento orizzontale (lo scroll verticale su touch resta libero)
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; idle = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    angleVel = -dx * 0.006;
    angle += angleVel;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  let active = false, time = 0;
  const timer = new THREE.Timer();
  const tmp = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    if (!active) return;
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    U.uTime.value = time + 1000;
    applyTimeOfDay(TOD);
    sun.position.copy(U.uSunDir.value).multiplyScalar(50);
    sun.color.copy(U.uSunColor.value);

    if (!dragging) {
      idle += dt;
      angleVel *= 0.94;
      angle += angleVel + (idle > 1.5 ? dt * 0.12 : 0);
    }
    scene.traverse((o) => {
      if (!o.userData.boat || !o.parent) return;
      const b = o.userData.boat;
      const L = b.userData.length;
      const x = o.position.x, z = o.position.z, t = time + 1000;
      const hc = waveHeight(x, z, t), hb = waveHeight(x, z + L / 2, t), hs = waveHeight(x, z - L / 2, t);
      const hl = waveHeight(x + 1, z, t), hr = waveHeight(x - 1, z, t);
      b.position.y = hc * 0.9;
      b.rotation.set(-Math.atan2(hb - hs, L), 0, Math.atan2(hl - hr, 2) * 0.8);
      b.userData.propeller.rotation.z += dt * 10;
    });

    const tgtY = 0.9;
    const d = camDist * (camera.aspect < 1.3 ? 1.35 : 1);
    camera.position.set(Math.sin(angle) * d, 2.4 + d * 0.18, Math.cos(angle) * d);
    tmp.set(0, tgtY, 0);
    camera.lookAt(tmp);
    renderer.render(scene, camera);
  }
  frame();

  return {
    show,
    get index() { return index; },
    setActive(a) { if (a && !active) timer.reset?.(); active = a; if (a) resize(); },
  };
}

export function mountFleetUI({ viewer, gsap }) {
  const list = document.getElementById('boat-list');
  const els = {
    cat: document.getElementById('boat-cat'), name: document.getElementById('boat-name'), desc: document.getElementById('boat-desc'),
    len: document.getElementById('spec-len'), hp: document.getElementById('spec-hp'), seats: document.getElementById('spec-seats'),
    book: document.getElementById('boat-book'),
  };
  list.innerHTML = FLEET.map((b, i) => `
    <li data-cat="${b.cat}"><button data-i="${i}" aria-label="${b.name} ${b.length.toFixed(2)} metri">
      <span class="sw" style="background:${b.tube}"></span>
      <span><b>${b.name}</b> <small>${b.length.toFixed(2).replace('.', ',')} m</small></span>
      <small>${b.seats} posti</small>
    </button></li>`).join('');

  const counter = (el, to, dec = 0) => {
    const o = { v: parseFloat(el.textContent.replace(',', '.')) || 0 };
    gsap.to(o, { v: to, duration: 0.9, ease: 'power3.out', onUpdate: () => { el.textContent = o.v.toFixed(dec).replace('.', ','); } });
  };

  function select(i, dir = 1) {
    const spec = viewer.show(i, dir);
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', +b.dataset.i === viewer.index));
    gsap.fromTo([els.cat, els.name, els.desc], { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' });
    els.cat.textContent = spec.cat;
    els.name.textContent = spec.name;
    els.desc.textContent = CATEGORIES[spec.cat];
    counter(els.len, spec.length, 2);
    counter(els.hp, spec.hp);
    els.seats.textContent = `fino a ${spec.seats}`;
    els.book.href = waLink(`Ciao Angelica! Vorrei prenotare il gommone ${spec.name} (${spec.length.toFixed(2).replace('.', ',')} m, ${spec.hp} cv). Persone: … Data: …`);
    els.book.textContent = `Prenota ${spec.name} su WhatsApp`;
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    if (i !== viewer.index) select(i, i > viewer.index ? 1 : -1);
  });
  document.querySelectorAll('.fleet-nav [data-step]').forEach((btn) => btn.addEventListener('click', () => {
    const step = +btn.dataset.step;
    const visible = [...list.querySelectorAll('li:not([hidden]) button')].map((b) => +b.dataset.i);
    const pos = visible.indexOf(viewer.index);
    const next = visible[(pos + step + visible.length) % visible.length] ?? (viewer.index + step);
    select(next, step);
  }));
  document.querySelectorAll('.filters .chip').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.filters .chip').forEach((c) => { c.classList.toggle('is-active', c === chip); c.setAttribute('aria-selected', c === chip); });
    const f = chip.dataset.filter;
    let first = null;
    list.querySelectorAll('li').forEach((li) => {
      const show = f === 'all' || li.dataset.cat === f;
      li.hidden = !show;
      if (show && first === null) first = +li.querySelector('button').dataset.i;
    });
    if (first !== null && FLEET[viewer.index].cat !== f && f !== 'all') select(first, 1);
  }));

  select(0);
}
