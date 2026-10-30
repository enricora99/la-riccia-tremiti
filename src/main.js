import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { CHAPTERS, FAQ, CONTACT, waLink } from './data.js';
import { ISLANDS, coastPoint } from './world/islands.js';

gsap.registerPlugin(ScrollTrigger);

const mobile = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.add('is-loading');
if (reduced) document.documentElement.classList.add('reduced');

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ——— Loader: riccio di mare
{
  const g = $('#spikes');
  let html = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, r1 = 24, r2 = 40 + (i % 2) * 14;
    html += `<line x1="${60 + Math.cos(a) * r1}" y1="${60 + Math.sin(a) * r1}" x2="${60 + Math.cos(a) * r2}" y2="${60 + Math.sin(a) * r2}"/>`;
  }
  g.innerHTML = html;
}
const loaderBar = $('.loader-bar i');
const loaderStatus = $('.loader-status');
const setLoad = (pct, msg) => { loaderBar.style.width = `${pct}%`; if (msg) loaderStatus.textContent = msg; };

// ——— Contenuti dinamici
$('#chapters').innerHTML = CHAPTERS.map((c, i) => `
  <article class="chapter${i === 0 ? ' is-hero' : ''}" data-i="${i}">
    <p class="kicker">${c.kicker}</p>
    ${i === 0 ? `<h1>${c.title}</h1>` : `<h2>${c.title}</h2>`}
    <p class="text">${c.text}</p>
    ${i === 0 ? `<div class="hero-ctas"><a class="btn btn-cta" href="#flotta">Scegli la tua barca</a><a class="btn btn-ghost" data-wa="Ciao Angelica! Vorrei prenotare un gommone alle Tremiti." target="_blank" rel="noopener">Prenota su WhatsApp</a></div>` : ''}
  </article>`).join('');
document.documentElement.style.setProperty('--chapters', CHAPTERS.length);

$('#rail').innerHTML = CHAPTERS.map((c, i) => `<li><button data-i="${i}"><i></i><span>${i === 0 ? 'Inizio' : c.kicker.split('·')[1].trim()}</span></button></li>`).join('');

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
    for (let a = 0; a < 360; a += 6) { const [x, y] = P(coastPoint(I, a, off)); d += `${a ? 'L' : 'M'}${x},${y}`; }
    return `${d}Z`;
  };
  let html = ISLANDS.map((I) => `<path class="shallow" d="${outline(I, 110)}"/>`).join('');
  html += ISLANDS.map((I) => `<path class="isl${I.kind === 'pine' || I.kind === 'maquis' ? ' green' : ''}" d="${outline(I, 0)}"/>`).join('');
  const label = (I, dx, dy) => { const [x, y] = P({ x: I.cx, z: I.cz }); return `<text class="lbl" x="${+x + dx}" y="${+y + dy}" text-anchor="middle">${I.name}</text>`; };
  html += label(ISLANDS[0], -10, 8) + label(ISLANDS[2], 60, -40) + label(ISLANDS[3], 0, 8) + label(ISLANDS[1], 40, 34);
  const SD = ISLANDS[0], CA = ISLANDS[3], SN = ISLANDS[2];
  const pois = [
    [coastPoint(SD, -26, 30), 'Biglietteria 13', 'office', 14, -16],
    [coastPoint(SD, 8, 40), 'Cala Matano', '', 14, 6],
    [coastPoint(SD, 72, 30), 'Bue Marino', '', 14, 8],
    [coastPoint(SD, 112, 30), 'Architiello', '', -14, 26, 'end'],
    [coastPoint(SD, 172, 40), 'Elefante', '', -14, 6, 'end'],
    [coastPoint(CA, 75, 150), 'Padre Pio', '', 14, 6],
    [coastPoint(SN, 165, 60), 'Porto San Nicola', '', 14, 22],
  ];
  html += pois.map(([v, t, cls, dx, dy, anchor]) => {
    const [x, y] = P(v);
    return `<g class="poi ${cls}"><circle cx="${x}" cy="${y}" r="7"/><text x="${+x + dx}" y="${+y + dy}" text-anchor="${anchor || 'start'}">${t}</text></g>`;
  }).join('');
  svg.innerHTML = html;
}

// ——— Smooth scroll
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
const scrollTo = (target) => (lenis ? lenis.scrollTo(target, { duration: 1.8 }) : window.scrollTo({ top: typeof target === 'number' ? target : $(target).offsetTop, behavior: 'smooth' }));
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  if (id.length < 2) return;
  e.preventDefault();
  closeMenu();
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
let anchors = CHAPTERS.map((_, i) => i / (CHAPTERS.length - 0.5));
let progress = 0;

function journeyScrollFor(p) {
  const top = journey.offsetTop;
  return top + p * (journey.offsetHeight - innerHeight);
}
railBtns.forEach((b) => b.addEventListener('click', () => scrollTo(journeyScrollFor(anchors[+b.dataset.i]) + 2)));

function updateOverlay(p) {
  const step = anchors[1] - anchors[0];
  let activeI = 0;
  chapterEls.forEach((el, i) => {
    const d = (p - anchors[i]) / step;
    const span = i === 0 ? 0.42 : 0.3;
    let o = 1 - THREE_clamp((Math.abs(d) - span) / 0.14, 0, 1);
    if (i === 0 && d < 0) o = 1;
    if (i === CHAPTERS.length - 1 && d > 0) o = 1 - THREE_clamp((d - 0.62) / 0.2, 0, 1);
    el.style.opacity = o;
    el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    const y = d * -40;
    if (i === 0) el.style.transform = innerWidth > 600 ? `translateY(calc(-46% + ${y}px))` : `translateY(${y}px)`;
    else el.style.transform = `translateY(${y}px)`;
    if (Math.abs(d) < 0.5) activeI = i;
  });
  railBtns.forEach((b, i) => b.classList.toggle('is-active', i === activeI));
  const bar = p > 0.035 && p < 0.985 ? Math.min(1, (p - 0.035) / 0.04) : 0;
  document.documentElement.style.setProperty('--bar', `${bar * (innerWidth < 600 ? 5 : 7)}vh`);
  $('.scroll-hint').style.opacity = p < 0.02 ? 1 : 0;
}
function THREE_clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

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

function boot3D() {
  return import('./world/scene.js').then(({ createWorld }) => {
    setLoad(55, 'Disegniamo le isole…');
    return new Promise((res) => setTimeout(() => {
      try {
        world = createWorld($('#world'), { mobile, reducedMotion: reduced });
        anchors = world.anchors;
        world.setProgress(progress);
        world.start();
        addEventListener('resize', () => world.resize());
        new IntersectionObserver(([e]) => world.setActive(e.isIntersecting), { rootMargin: '0px 0px 0px 0px' }).observe(journey);
      } catch (err) {
        console.error(err);
        document.documentElement.classList.add('no-webgl');
      }
      res();
    }, 60));
  });
}

function bootFleet() {
  const canvas = $('#fleet-canvas');
  let viewer = null;
  const io = new IntersectionObserver(async ([e]) => {
    if (e.isIntersecting && !viewer) {
      const { createFleetViewer, mountFleetUI } = await import('./fleet.js');
      try {
        viewer = createFleetViewer({ canvas, gsap, mobile });
        mountFleetUI({ viewer, gsap });
      } catch (err) { console.error(err); }
    }
    viewer?.setActive(e.isIntersecting);
  }, { rootMargin: '200px 0px' });
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
  $$('[data-split]').forEach((el) => {
    splitWords(el);
    gsap.from(el.querySelectorAll('.w > span'), {
      yPercent: 110, rotate: 4, duration: 1.1, ease: 'power4.out', stagger: 0.05,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });
  $$('[data-reveal]').forEach((el) => gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } }));
  $$('[data-reveal-group]').forEach((el) => gsap.from(el.children, {
    opacity: 0, y: 40, duration: 0.9, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 85%' },
  }));
  $$('[data-count]').forEach((el) => {
    const to = +el.dataset.count, from = to > 1000 ? to - 40 : 0, o = { v: from };
    gsap.to(o, { v: to, duration: 1.8, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); }, scrollTrigger: { trigger: el, start: 'top 90%' } });
  });
  gsap.fromTo('.guest-art', { scale: 0.9, rotate: -2 }, { scale: 1, rotate: 0, ease: 'none', scrollTrigger: { trigger: '.guest', start: 'top bottom', end: 'center center', scrub: true } });
  gsap.to('.marquee-track', { xPercent: -8, ease: 'none', scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('#map-svg .poi', { scale: 0, transformOrigin: 'center', stagger: 0.1, duration: 0.6, ease: 'back.out(2)', scrollTrigger: { trigger: '#map-svg', start: 'top 75%' } });
  gsap.from('.fleet-canvas-wrap', { clipPath: 'inset(12% 8% 12% 8% round 40px)', duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: '.fleet-canvas-wrap', start: 'top 85%' } });
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

// ——— Avvio
setLoad(20, 'Prepariamo il mare…');
boot3D().then(() => {
  setLoad(100, 'Si salpa');
  setupReveals();
  bootFleet();
  updateOverlay(progress);
  ScrollTrigger.refresh();
  const tl = gsap.timeline({ delay: 0.25 });
  tl.to('#loader', { opacity: 0, duration: 0.9, ease: 'power2.out', onComplete: () => { $('#loader').remove(); document.body.classList.remove('is-loading'); lenis?.start(); } });
  if (world && !reduced && progress < 0.01) world.playIntro(gsap, 4.4);
  const hero = chapterEls[0];
  tl.from(hero.querySelectorAll('.kicker, h1, .text, .hero-ctas'), { opacity: 0, y: 40, duration: 1.4, stagger: 0.12, ease: 'power4.out' }, 0.9);
  tl.from('.site-header', { opacity: 0, y: -20, duration: 1, ease: 'power3.out', clearProps: 'opacity,transform' }, 1.1);
}).catch((err) => {
  console.error(err);
  $('#loader')?.remove();
  document.body.classList.remove('is-loading');
  lenis?.start();
});
