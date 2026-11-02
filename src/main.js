import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { CHAPTERS, FAQ, CONTACT, waLink } from './data.js';
import { ISLANDS, coastXZ } from './world/terrain.js';
import { loadTerrain } from './world/terrain-loader.js';

gsap.registerPlugin(ScrollTrigger);

const mobile = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
document.body.classList.add('is-loading');

// Il terreno si genera in un worker mentre si scarica il resto
const terrainReady = loadTerrain({ mobile });
const sceneModule = import('./world/scene.js');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ——— Movimento ridotto: preferenza di sistema, poi la scelta del visitatore
const MOTION_KEY = 'riccia-motion';
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  const saved = localStorage.getItem(MOTION_KEY);
  if (saved) reduced = saved === 'reduced';
} catch { /* storage non disponibile */ }
document.documentElement.classList.toggle('reduced', reduced);

const loaderBar = $('.loader-bar i');
const loaderStatus = $('.loader-status');
const setLoad = (pct, msg) => { loaderBar.style.width = `${pct}%`; if (msg) loaderStatus.textContent = msg; };

// ——— Contenuti dinamici
$('#chapters').innerHTML = CHAPTERS.map((c, i) => `
  <article class="chapter${i === 0 ? ' is-hero' : ''}" data-i="${i}">
    ${i === 0 ? `<h1>${c.title}</h1>` : `<h2>${c.title}</h2>`}
    <p class="text">${c.text}</p>
    ${i === 0 ? `<div class="hero-ctas"><a class="btn btn-cta" href="#flotta">Scegli la tua barca</a><a class="btn btn-ghost" data-wa="Ciao Angelica! Vorrei prenotare un gommone alle Tremiti." target="_blank" rel="noopener">Prenota su WhatsApp</a></div><a class="hero-app" href="#app"><span class="tag-preview">anteprima</span> Novità: l’app per orientarti in mare <span aria-hidden="true">→</span></a>` : ''}
  </article>`).join('');
document.documentElement.style.setProperty('--chapters', CHAPTERS.length);

$('#rail').innerHTML = CHAPTERS.map((c, i) => `<li><button data-i="${i}"><i></i><span>${c.label}</span></button></li>`).join('');

$('#faq-list').innerHTML = FAQ.map(([q, a]) => `<details><summary>${q}</summary><div class="answer"><p>${a}</p></div></details>`).join('');

$$('[data-wa]').forEach((a) => { a.href = waLink(a.dataset.wa); });
$$('[data-wa-plain]').forEach((a) => { a.href = waLink('Ciao Angelica!'); a.target = '_blank'; a.rel = 'noopener'; });
Object.assign($('#f-phone'), { href: `tel:+${CONTACT.phoneRaw}`, textContent: CONTACT.phone });
Object.assign($('#f-mail'), { href: `mailto:${CONTACT.email}`, textContent: CONTACT.email });
Object.assign($('#f-ig'), { href: CONTACT.instagram });
Object.assign($('#f-fb'), { href: CONTACT.facebook });
$('#f-office').textContent = CONTACT.office;
$('#f-address').textContent = CONTACT.address;
$('#f-piva').textContent = CONTACT.piva;
$('#f-cin').textContent = CONTACT.cin;
$('#year').textContent = new Date().getFullYear();

// ——— Mappa SVG generata dalle stesse coste del mondo 3D
{
  const svg = $('#map-svg');
  const minX = -1700, minZ = -3200, scale = 1000 / 4600;
  const P = (v) => [((v.x - minX) * scale).toFixed(1), ((v.z - minZ) * scale).toFixed(1)];
  const outline = (I, off) => {
    let d = '';
    for (let a = 0; a < 360; a += 6) { const [x, y] = P(coastXZ(I, a, off)); d += `${a ? 'L' : 'M'}${x},${y}`; }
    return `${d}Z`;
  };
  let html = ISLANDS.map((I) => `<path class="shallow" d="${outline(I, 110)}"/>`).join('');
  html += ISLANDS.map((I) => `<path class="isl${I.kind === 'pine' || I.kind === 'maquis' ? ' green' : ''}" d="${outline(I, 0)}"/>`).join('');
  const label = (I, dx, dy) => { const [x, y] = P({ x: I.cx, z: I.cz }); return `<text class="lbl" x="${+x + dx}" y="${+y + dy}" text-anchor="middle">${I.name}</text>`; };
  html += label(ISLANDS[0], -10, 8) + label(ISLANDS[2], 60, -40) + label(ISLANDS[3], 0, 8) + label(ISLANDS[1], 40, 34);
  const SD = ISLANDS[0], CA = ISLANDS[3], SN = ISLANDS[2];
  const pois = [
    [coastXZ(SD, -26, 30), 'Biglietteria 13', 'office', 14, -16],
    [coastXZ(SD, 8, 40), 'Cala Matano', '', 14, 6],
    [coastXZ(SD, 72, 30), 'Bue Marino', '', 14, 8],
    [coastXZ(SD, 112, 30), 'Architiello', '', -14, 26, 'end'],
    [coastXZ(SD, 172, 40), 'Elefante', '', -14, 6, 'end'],
    [coastXZ(CA, 75, 150), 'Padre Pio', '', 14, 6],
    [coastXZ(SN, 165, 60), 'Porto San Nicola', '', 14, 22],
  ];
  html += pois.map(([v, t, cls, dx, dy, anchor]) => {
    const [x, y] = P(v);
    return `<g class="poi ${cls}"><circle cx="${x}" cy="${y}" r="7"/><text x="${+x + dx}" y="${+y + dy}" text-anchor="${anchor || 'start'}">${t}</text></g>`;
  }).join('');
  svg.innerHTML = html;
}

// ——— Smooth scroll (spento con il movimento ridotto)
let lenis = null;
let loading = true;
gsap.ticker.lagSmoothing(0);
gsap.ticker.add((t) => lenis?.raf(t * 1000));
function setSmooth(on) {
  if (on && !lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    if (loading) lenis.stop();
  } else if (!on && lenis) {
    lenis.destroy();
    lenis = null;
  }
}
setSmooth(!reduced);

const docTop = (target) => (typeof target === 'number' ? target : $(target).getBoundingClientRect().top + scrollY);
const scrollTo = (target, opts = {}) => {
  if (lenis) lenis.scrollTo(target, { duration: 1.8, ...opts });
  else window.scrollTo({ top: docTop(target), behavior: reduced || opts.immediate ? 'auto' : 'smooth' });
};
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  if (id.length < 2) return;
  e.preventDefault();
  closeMenu();
  stopAutoplay();
  scrollTo(id);
}));

// ——— Menu mobile
const burger = $('.burger'), nav = $('#nav');
function closeMenu() { burger.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
burger.addEventListener('click', () => {
  const open = burger.getAttribute('aria-expanded') !== 'true';
  burger.setAttribute('aria-expanded', open);
  nav.classList.toggle('is-open', open);
});

// ——— Mondo 3D
const journey = $('#journey');
const chapterEls = $$('.chapter');
const railBtns = $$('#rail button');
const header = $('.site-header');
let world = null;
let fleetViewer = null;
let anchors = CHAPTERS.map((_, i) => i / (CHAPTERS.length - 0.5));
let progress = 0;
let lastActive = 0;

const journeyScrollFor = (p) => journey.offsetTop + p * (journey.offsetHeight - innerHeight);
railBtns.forEach((b) => b.addEventListener('click', () => { stopAutoplay(); scrollTo(journeyScrollFor(anchors[+b.dataset.i]) + 2); }));

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function updateOverlay(p) {
  const step = anchors[1] - anchors[0];
  let activeI = 0;
  chapterEls.forEach((el, i) => {
    const d = (p - anchors[i]) / step;
    const span = i === 0 ? 0.42 : 0.3;
    let o = 1 - clamp((Math.abs(d) - span) / 0.14, 0, 1);
    if (i === 0 && d < 0) o = 1;
    if (i === CHAPTERS.length - 1 && d > 0) o = 1 - clamp((d - 0.62) / 0.2, 0, 1);
    if (reduced) o = Math.abs(d) < 0.5 || (i === CHAPTERS.length - 1 && d > 0 && d < 0.8) ? 1 : 0;
    el.style.opacity = o;
    el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    const y = reduced ? 0 : d * -40;
    if (i === 0) el.style.transform = innerWidth > 600 ? `translateY(calc(-46% + ${y}px))` : `translateY(${y}px)`;
    else el.style.transform = `translateY(${y}px)`;
    if (Math.abs(d) < 0.5) activeI = i;
  });
  railBtns.forEach((b, i) => b.classList.toggle('is-active', i === activeI));
  // con il movimento ridotto il cambio di tappa è uno stacco in dissolvenza, non una carrellata
  if (reduced && activeI !== lastActive && world) gsap.fromTo('.cut-fade', { opacity: 0.85 }, { opacity: 0, duration: 0.45, ease: 'power1.out' });
  lastActive = activeI;
  const bar = p > 0.035 && p < 0.985 ? Math.min(1, (p - 0.035) / 0.04) : 0;
  document.documentElement.style.setProperty('--bar', `${bar * (innerWidth < 600 ? 5 : 7)}vh`);
}

ScrollTrigger.create({
  trigger: journey, start: 'top top', end: 'bottom bottom',
  onUpdate: (self) => { progress = self.progress; world?.setProgress(progress); updateOverlay(progress); },
});
ScrollTrigger.create({
  trigger: journey, start: 'bottom 80%', end: 'max',
  onToggle: (self) => header.classList.toggle('is-solid', self.isActive),
});
ScrollTrigger.create({
  trigger: '#storia', start: 'top 60%', end: 'max',
  onToggle: (self) => $('.wa-float').classList.toggle('is-visible', self.isActive),
});

// ——— Guarda il viaggio (al massimo 30 secondi) / Salta
const playBtn = $('.ctrl-play'), playLabel = $('.ctrl-label'), playBar = $('.ctrl-progress');
const MAX_AUTOPLAY = 30;
let autoplay = null;
function stopAutoplay() {
  if (!autoplay) return;
  autoplay.kill();
  autoplay = null;
  playBtn.setAttribute('aria-pressed', 'false');
  playLabel.textContent = 'Guarda il viaggio';
  gsap.to(playBar, { scaleX: 0, duration: 0.3 });
}
function startAutoplay() {
  const n = CHAPTERS.length;
  let from = Math.min(Math.round(progress / (anchors[1] - anchors[0])), n - 1);
  if (progress > 0.97) { from = 0; scrollTo(journey.offsetTop, { immediate: true }); }
  const end = journeyScrollFor(1);
  const stops = [...anchors.slice(from + 1).map((a) => journeyScrollFor(a) + 2), end];
  const per = Math.min(4, (MAX_AUTOPLAY - 1) / (stops.length + 0.4));
  const proxy = { y: scrollY };
  const apply = () => (lenis ? lenis.scrollTo(proxy.y, { immediate: true, force: true }) : window.scrollTo(0, proxy.y));
  const tl = gsap.timeline({ onComplete: () => { stopAutoplay(); }, onUpdate: () => { playBar.style.transform = `scaleX(${tl.progress()})`; } });
  stops.forEach((y, i) => {
    // il movimento occupa ~60% di ogni tappa, il resto è una pausa per leggere
    if (reduced) tl.call(() => { proxy.y = y; apply(); }, null, i * per);
    else tl.to(proxy, { y, duration: per * 0.6, ease: 'power2.inOut', onUpdate: apply }, i * per);
  });
  tl.to({}, { duration: reduced ? per : per * 0.4 });
  autoplay = tl;
  playBtn.setAttribute('aria-pressed', 'true');
  playLabel.textContent = 'Pausa';
}
playBtn.addEventListener('click', () => (autoplay ? stopAutoplay() : startAutoplay()));
$('.ctrl-skip').addEventListener('click', () => { stopAutoplay(); scrollTo('#storia'); });
// qualsiasi gesto del visitatore riprende il controllo
['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, (e) => {
  if (autoplay && !(ev === 'keydown' && (e.key === 'Tab' || e.key === 'Shift' || e.target === playBtn))) stopAutoplay();
}, { passive: true }));

// ——— Pulsante "Riduci movimento"
const motionBtn = $('.motion-toggle');
let revealTweens = [];
function applyMotion() {
  document.documentElement.classList.toggle('reduced', reduced);
  motionBtn.setAttribute('aria-pressed', String(reduced));
  motionBtn.title = reduced ? 'Riattiva le animazioni' : 'Riduci il movimento';
  $('.mt-label').textContent = reduced ? 'Movimento ridotto' : 'Riduci movimento';
  setSmooth(!reduced);
  world?.setReducedMotion(reduced);
  fleetViewer?.setReducedMotion(reduced);
  if (reduced) {
    // le animazioni d'ingresso vanno subito allo stato finale
    revealTweens.forEach((t) => { t.scrollTrigger?.kill(); t.progress(1).kill(); });
    revealTweens = [];
    gsap.set('[data-reveal]', { opacity: 1, y: 0 });
  }
  updateOverlay(progress);
  ScrollTrigger.refresh();
}
motionBtn.addEventListener('click', () => {
  reduced = !reduced;
  try { localStorage.setItem(MOTION_KEY, reduced ? 'reduced' : 'full'); } catch { /* ignora */ }
  if (autoplay) { stopAutoplay(); startAutoplay(); }
  applyMotion();
});
motionBtn.setAttribute('aria-pressed', String(reduced));
$('.mt-label').textContent = reduced ? 'Movimento ridotto' : 'Riduci movimento';

async function boot3D() {
  const [{ createWorld }, terrain] = await Promise.all([
    sceneModule.then((m) => { performance.mark('riccia:scene-module'); setLoad(45, 'Disegniamo le isole…'); return m; }),
    terrainReady.then((t) => { performance.mark('riccia:terrain'); setLoad(60, 'Riempiamo il mare…'); return t; }),
  ]);
  try {
    world = createWorld($('#world'), {
      mobile, reducedMotion: reduced, terrain,
      onUnderwater: (u) => document.documentElement.classList.toggle('is-underwater', u),
    });
    performance.mark('riccia:world');
    setLoad(80, 'Accendiamo il sole…');
    anchors = world.anchors;
    world.setProgress(progress);
    await world.prepare();
    performance.mark('riccia:compiled');
    world.start();
    requestAnimationFrame(() => document.documentElement.classList.add('world-ready'));
    addEventListener('resize', () => world.resize());
    new IntersectionObserver(([e]) => world.setActive(e.isIntersecting)).observe(journey);
  } catch (err) {
    console.error(err);
    document.documentElement.classList.add('no-webgl');
  }
}

function bootFleet() {
  const canvas = $('#fleet-canvas');
  let mounted = false;
  const io = new IntersectionObserver(async ([e]) => {
    if (e.isIntersecting && !mounted) {
      mounted = true;
      const { createFleetViewer, mountFleetUI } = await import('./fleet.js');
      try {
        fleetViewer = createFleetViewer({ canvas, gsap, mobile, reducedMotion: reduced });
      } catch (err) {
        console.error(err);
        canvas.hidden = true;
        $('#fleet-fallback').hidden = false;
      }
      mountFleetUI({ viewer: fleetViewer, gsap, fallbackImg: $('#fleet-fallback') });
    }
    fleetViewer?.setActive(e.isIntersecting);
  }, { rootMargin: '300px 0px' });
  io.observe(canvas);
}

// ——— Animazioni di sezione
function splitWords(el) {
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.append(w); return; }
          const o = document.createElement('span'); o.className = 'w';
          const i = document.createElement('span'); i.textContent = w;
          o.append(i); frag.append(o);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
  };
  walk(el);
}

function setupReveals() {
  if (reduced) return;
  const add = (t) => revealTweens.push(t);
  $$('[data-split]').forEach((el) => {
    splitWords(el);
    add(gsap.from(el.querySelectorAll('.w > span'), {
      yPercent: 110, rotate: 4, duration: 1.1, ease: 'power4.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    }));
  });
  $$('[data-reveal]').forEach((el) => add(gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } })));
  $$('[data-reveal-group]').forEach((el) => add(gsap.from(el.children, {
    opacity: 0, y: 40, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 85%' },
  })));
  add(gsap.fromTo('.guest-art', { scale: 0.9, rotate: -2 }, { scale: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: '.guest', start: 'top bottom', end: 'center center', scrub: true } }));
  add(gsap.fromTo('.brand-card', { rotate: 3, y: 40 }, { rotate: -1.5, y: 0, ease: 'none', scrollTrigger: { trigger: '.story', start: 'top bottom', end: 'center center', scrub: true } }));
  add(gsap.to('.marquee-track', { xPercent: -8, ease: 'none', scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: true } }));
  add(gsap.from('#map-svg .poi', { scale: 0, transformOrigin: 'center', stagger: 0.1, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: '#map-svg', start: 'top 75%' } }));
  add(gsap.from('.fleet-canvas-wrap', { clipPath: 'inset(12% 8% 12% 8% round 40px)', duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '.fleet-canvas-wrap', start: 'top 85%' } }));
}

// FAQ con apertura animata
$$('#faq-list details').forEach((d) => {
  const s = d.querySelector('summary'), a = d.querySelector('.answer');
  s.addEventListener('click', (e) => {
    if (reduced) return;
    e.preventDefault();
    if (d.open) gsap.to(a, { height: 0, duration: 0.45, ease: 'power3.inOut', onComplete: () => { d.open = false; a.style.height = ''; } });
    else { d.open = true; gsap.fromTo(a, { height: 0 }, { height: 'auto', duration: 0.6, ease: 'power3.out' }); }
  });
});

// ——— Avvio: la pagina appare appena il poster è pronto, il 3D arriva dopo
setLoad(30, 'Prepariamo il mare…');
function revealPage() {
  performance.mark('riccia:ready');
  loading = false;
  setLoad(100, 'Si salpa');
  setupReveals();
  bootFleet();
  updateOverlay(progress);
  ScrollTrigger.refresh();
  const tl = gsap.timeline();
  tl.to('#loader', { opacity: 0, duration: reduced ? 0.2 : 0.6, ease: 'power2.out', onComplete: () => { $('#loader').remove(); document.body.classList.remove('is-loading'); lenis?.start(); } });
  if (reduced) return;
  tl.from(chapterEls[0].querySelectorAll('h1, .text, .hero-ctas, .hero-app'), { opacity: 0, y: 40, duration: 1.3, stagger: 0.12, ease: 'power4.out' }, 0.25);
  tl.from(['.site-header', '.journey-ctrl'], { opacity: 0, y: -16, duration: 1, ease: 'power3.out', clearProps: 'opacity,transform' }, 0.45);
}
const posterReady = new Promise((res) => {
  const img = new Image();
  img.onload = img.onerror = res;
  img.src = matchMedia('(max-aspect-ratio: 4/5)').matches ? '/poster-mobile.webp' : '/poster.webp';
  img.decode?.().then(res, res);
});
Promise.race([Promise.all([posterReady, document.fonts?.ready]), new Promise((r) => setTimeout(r, 1800))]).then(revealPage);
boot3D().catch((err) => {
  console.error(err);
  document.documentElement.classList.add('no-webgl');
});
