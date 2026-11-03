// La Riccia · Naviga — controller dell'interfaccia.
// Tutta la logica di dominio (zone, limiti, distanze, avvisi) sta in ../core e non dipende dal browser.
import './style.css';
import rulesData from '../data/rules.json';
import poisData from '../data/poi.json';
import configData from '../data/config.json';
import zonesRaw from '../data/zones.geojson?raw';
import seamarksRaw from '../data/seamarks.geojson?raw';
import obstaclesRaw from '../data/obstacles.geojson?raw';
import { formatDms, formatDecimal, type LonLat } from '../core/coords.ts';
import { bearingDeg, cardinal, courseDeg, distanceMeters, formatDistance, speedKnots } from '../core/geo.ts';
import { indexZones, situationAt, type Situation } from '../core/rules.ts';
import { createAlertTracker, type Alert } from '../core/alerts.ts';
import { createRouter, type Obstacles, type RouteResult } from '../core/route.ts';
import type { Config, Lang, Poi, Rules, Zones } from '../core/types.ts';
import { applyI18n, fmt, getLang, setLang, t } from './i18n.ts';
import { createMap } from './map.ts';
import { startDemo, startGeolocation, type AppFix } from './position.ts';
import { beep, keepScreenOn, startCompass, unlockAudio } from './device.ts';

const rules = rulesData as Rules;
const pois = poisData as Poi[];
const config = configData as Config;
const zones = JSON.parse(zonesRaw) as Zones;
const seamarks = JSON.parse(seamarksRaw);
const zoneIndex = indexZones(zones);
const caves = pois.filter((p) => p.tipo === 'grotta');
const port = pois.find((p) => p.id === config.portoRientroId)!;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';

// ——— Stato
const store = {
  get lang(): Lang | null { try { return localStorage.getItem('naviga-lang') as Lang | null; } catch { return null; } },
  set lang(v) { try { if (v) localStorage.setItem('naviga-lang', v); } catch { /* */ } },
  get accepted() { try { return localStorage.getItem('naviga-avvertenza') === '1'; } catch { return false; } },
  set accepted(v) { try { localStorage.setItem('naviga-avvertenza', v ? '1' : '0'); } catch { /* */ } },
};
let lastFix: AppFix | null = null;
let lastCourse: number | null = null;
let heading: number | null = null;
let situation: Situation | null = null;
let knots: number | null = null;
let target: Poi | null = null;
let activeAlerts: Alert[] = [];
const tracker = createAlertTracker({ caveMeters: config.avvisoGrottaMetri, toleranceKn: config.tolleranzaVelocitaNodi });
let mapApi: Awaited<ReturnType<typeof createMap>> | null = null;

// Rotta indicativa: il grafo si costruisce alla prima destinazione e si ricalcola ogni ~25 m o 5 s
let router: ReturnType<typeof createRouter> | null = null;
const getRouter = () => (router ??= createRouter(JSON.parse(obstaclesRaw) as Obstacles, { zonaBAutorizzata: config.zonaBAutorizzata }));
let routeCache: { key: string; from: LonLat; at: number; result: RouteResult } | null = null;
function routeFor(from: LonLat, p: Poi): RouteResult {
  const key = p.id;
  if (routeCache && routeCache.key === key && distanceMeters(routeCache.from, from) < 25 && Date.now() - routeCache.at < 5000) return routeCache.result;
  const result = getRouter().route(from, [p.lon, p.lat]);
  routeCache = { key, from, at: Date.now(), result };
  return result;
}
let currentRoute: RouteResult | null = null;

// ——— Primo avvio: lingua e avvertenza
function onboarding(): Promise<void> {
  return new Promise((resolve) => {
    const box = $('#onboard');
    const showDisclaimer = () => {
      applyI18n();
      $('#ob-lang').hidden = true;
      $('#ob-disclaimer').hidden = false;
      box.hidden = false;
    };
    $('#ob-accept').onclick = () => {
      store.accepted = true;
      unlockAudio();
      box.hidden = true;
      resolve();
    };
    box.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => (b.onclick = () => {
      setLang(b.dataset.lang as Lang);
      store.lang = getLang();
      showDisclaimer();
    }));
    const saved = store.lang;
    if (saved && store.accepted) { setLang(saved); applyI18n(); resolve(); return; }
    if (saved) { setLang(saved); showDisclaimer(); return; }
    box.hidden = false;
  });
}

// ——— Pannelli
function openSheet(id: string) {
  document.querySelectorAll<HTMLElement>('.sheet').forEach((s) => { s.hidden = s.id !== id; });
  if (id === 'sheet-poi') renderPoiList();
  if (id === 'sheet-sos') renderSos();
  if (id === 'sheet-info') renderInfo();
}
const closeSheets = () => document.querySelectorAll<HTMLElement>('.sheet').forEach((s) => { s.hidden = true; });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));

// ——— Testi dipendenti dallo stato
function zoneText(s: Situation | null): string {
  const L = t();
  if (!s) return L.waitingGps;
  if (s.zona === 'B' && s.vietato) return L.zoneBForbidden;
  const base = L.zone[s.zona];
  return s.zona === 'C' && s.fascia ? `${base} · ${L.band[s.fascia]}` : base;
}

function renderHud() {
  const L = t();
  $('#speed').textContent = knots == null ? '–' : knots.toFixed(1).replace('.', getLang() === 'it' ? ',' : '.');
  const limit = $('#limit');
  const over = activeAlerts.some((a) => a.kind === 'velocita');
  if (situation?.limiteNodi != null) {
    limit.hidden = false;
    $('#limit-val').textContent = `${situation.limiteNodi}`;
  } else if (situation && situation.zona !== 'fuori' && !situation.vietato) {
    limit.hidden = false;
    $('#limit-val').textContent = '—';
  } else limit.hidden = true;
  document.body.classList.toggle('is-over', over);
  document.body.classList.toggle('is-forbidden', !!situation?.vietato);
  $('#zone-label').textContent = zoneText(situation);
  $('#gps-acc').textContent = lastFix?.accuracy != null ? fmt(L.accuracy, { m: Math.round(lastFix.accuracy) }) : '';
}

function alertText(a: Alert): { title: string; rule?: string; ref?: string } {
  const L = t();
  const lang = getLang();
  if (a.kind === 'velocita') {
    const r = situation?.regole[0];
    return { title: fmt(L.alert.velocita, { kn: a.limiteNodi ?? '' }), rule: r?.testo[lang], ref: r?.riferimento };
  }
  if (a.kind === 'grotta') {
    const r = rules.regole.find((x) => x.id === 'grotte-divieto')!;
    const cave = pois.find((p) => p.id === a.poiId);
    return { title: `${fmt(L.alert.grotta, { m: config.avvisoGrottaMetri })}${cave ? ` · ${cave.nome[lang]}` : ''}`, rule: r.testo[lang], ref: r.riferimento };
  }
  const r = rules.regole.find((x) => x.id === (a.kind === 'zona-a' ? 'zona-a-divieto' : 'zona-b-autorizzazione'))!;
  return { title: L.alert[a.kind], rule: r.testo[lang], ref: r.riferimento };
}

function renderAlerts() {
  $('#alerts').innerHTML = activeAlerts.map((a) => {
    const x = alertText(a);
    const level = a.kind === 'velocita' ? 'warning' : 'danger';
    return `<div class="alert ${level}" data-alert="${a.kind}"${a.poiId ? ` data-poi="${a.poiId}"` : ''}>
      <b>${x.title}</b>${x.rule ? `<span>${x.rule}</span>` : ''}${x.ref ? `<small>${x.ref}</small>` : ''}
    </div>`;
  }).join('');
}

function renderTarget() {
  const box = $('#target');
  if (!target) { box.hidden = true; currentRoute = null; mapApi?.setRoute(null); return; }
  const L = t();
  const lang = getLang();
  box.hidden = false;
  $('#target-name').textContent = target.nome[lang];
  const to: LonLat = [target.lon, target.lat];
  if (!lastFix) {
    $('#target-dist').textContent = '–';
    $('#target-bearing').textContent = '–';
    $('#target-note').textContent = L.noPosition;
    $('#target-warn').hidden = true;
    currentRoute = null;
    mapApi?.setRoute(null);
    return;
  }
  const r = routeFor(lastFix.lonLat, target);
  currentRoute = r;
  const blocked = r.issues.length > 0;
  const deg = (b: number) => `${Math.round(b).toString().padStart(3, '0')}° ${cardinal(b)}`;
  const fmtD = (m: number) => { const f = formatDistance(m, lang); return `${f.nm} · ${f.m}`; };
  const notes: string[] = [];
  if (!blocked) {
    $('#target-dist').textContent = fmtD(r.straightM);
    $('#target-bearing').textContent = deg(bearingDeg(lastFix.lonLat, to));
    notes.push(L.lineLabel);
  } else if (r.path && r.lengthM != null && r.firstLegBearing != null) {
    $('#target-dist').textContent = fmtD(r.lengthM);
    $('#target-bearing').textContent = `${L.steer} ${deg(r.firstLegBearing)}`;
    notes.push(fmt(L.straightVia, { d: formatDistance(r.straightM, lang).nm }));
  } else {
    $('#target-dist').textContent = fmtD(r.straightM);
    $('#target-bearing').textContent = deg(bearingDeg(lastFix.lonLat, to));
    notes.push(L.lineLabel);
  }
  const warn = $('#target-warn');
  if (blocked) {
    const first = r.issues[0];
    const msg = first.kind === 'zonaA' ? L.crossesZoneA : first.kind === 'zonaB' ? L.crossesZoneB : first.nome ? fmt(L.crossesLand, { nome: first.nome }) : L.crossesRock;
    const extra = !r.path ? L.noRoute : r.approach ? fmt(L.approachNote, { m: Math.round(r.approach.toGoalM) }) : '';
    warn.textContent = [msg, extra].filter(Boolean).join(' ');
    warn.classList.toggle('red', !r.path || first.kind !== 'terra');
    warn.hidden = false;
    if (r.path) notes.push(L.routeNote);
  } else warn.hidden = true;
  if (target.accessoNoleggio !== 'consentito') notes.push(L.access[target.accessoNoleggio]);
  if (!target.verificato) notes.push(L.unverified);
  $('#target-note').textContent = notes.join(' · ');
  mapApi?.setRoute({ from: lastFix.lonLat, to, blocked, path: r.path, approach: r.approach?.point ?? null });
}

function selectTarget(p: Poi | null) {
  target = p;
  closeSheets();
  renderTarget();
  if (p && lastFix) mapApi?.fitTo([lastFix.lonLat, [p.lon, p.lat], ...(currentRoute?.path ?? [])], $('#target').offsetHeight + 110);
  else if (p) mapApi?.map.easeTo({ center: [p.lon, p.lat], zoom: 14.5 });
}

function renderPoiList() {
  const L = t();
  const lang = getLang();
  const items = pois.map((p) => ({ p, d: lastFix ? distanceMeters(lastFix.lonLat, [p.lon, p.lat]) : null }));
  if (lastFix) items.sort((a, b) => a.d! - b.d!);
  $('#poi-list').innerHTML = items.map(({ p, d }) => {
    const fd = d != null ? formatDistance(d, lang) : null;
    const b = d != null && lastFix ? bearingDeg(lastFix.lonLat, [p.lon, p.lat]) : null;
    const access = p.accessoNoleggio !== 'consentito' ? `<em class="badge ${p.accessoNoleggio === 'vietato' ? 'red' : 'orange'}">${L.access[p.accessoNoleggio]}</em>` : '';
    const around = lastFix && getRouter().route(lastFix.lonLat, [p.lon, p.lat]).issues.length ? `<em class="badge grey">${L.aroundCoast}</em>` : '';
    return `<li><button data-poi="${p.id}">
      <span class="poi-type t-${p.tipo}">${L.type[p.tipo]}</span>
      <b>${p.nome[lang]}</b>${access}${around}
      <small>${p.descrizione[lang]}</small>
      <span class="poi-dist">${fd ? `${fd.nm} · ${fd.m} · ${Math.round(b!)}° ${cardinal(b!)}` : ''}</span>
    </button></li>`;
  }).join('');
}
$('#poi-list').addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-poi]')?.dataset.poi;
  if (id) selectTarget(pois.find((p) => p.id === id) ?? null);
});

function renderSos() {
  const L = t();
  const p = lastFix?.lonLat;
  $('#sos-dec').textContent = p ? formatDecimal(p) : L.waitingGps;
  $('#sos-dms').textContent = p ? `${formatDms(p[1], 'lat')}  ${formatDms(p[0], 'lon')}` : '';
  const text = p
    ? fmt(L.waText, { dec: formatDecimal(p), dms: `${formatDms(p[1], 'lat')} ${formatDms(p[0], 'lon')}`, lat: p[1].toFixed(5), lon: p[0].toFixed(5) })
    : fmt(L.waText, { dec: '?', dms: '?', lat: '', lon: '' }).replace(/ https:\S+$/, '');
  $<HTMLAnchorElement>('#sos-wa').href = `https://wa.me/${config.numeri.whatsappNoleggio}?text=${encodeURIComponent(text)}`;
  $<HTMLAnchorElement>('#sos-1530').href = `tel:${config.numeri.guardiaCostiera}`;
  $<HTMLAnchorElement>('#sos-112').href = `tel:${config.numeri.emergenza}`;
}

function renderInfo() {
  const L = t();
  const lang = getLang();
  const legend: [string, string][] = [['#d62828', L.legend.A], [config.zonaBAutorizzata ? '#f2b705' : '#e8590c', config.zonaBAutorizzata ? L.legend.Bok : L.legend.Bno], ['#1c7ed6', L.legend.c300], ['#20c997', L.legend.c600]];
  $('#legend').innerHTML = legend.map(([c, txt]) => `<span><i style="background:${c}"></i>${txt}</span>`).join('');
  const shown = rules.regole.filter((r) => (config.zonaBAutorizzata ? r.id !== 'zona-b-autorizzazione' : r.id !== 'zona-b-velocita'));
  $('#rules-list').innerHTML = shown.map((r) => `<li><span>${r.testo[lang]}</span><a href="${r.fonte}" target="_blank" rel="noopener">${r.riferimento}</a></li>`).join('');
  $('#zones-note').textContent = L.zonesNote;
  $('#btn-lang').textContent = lang === 'it' ? 'English' : 'Italiano';
}

// ——— Nuova posizione: velocità, zona, avvisi, mappa
let fixCount = 0;
let mapReady = false;
function onFix(fix: AppFix) {
  fixCount++;
  const kn = speedKnots(fix, lastFix);
  // media leggera per non far saltare il numero a ogni fix
  knots = kn == null ? knots : knots == null ? kn : knots * 0.4 + kn * 0.6;
  const c = courseDeg(fix, lastFix);
  if (c != null) lastCourse = c;
  lastFix = fix;
  situation = situationAt(fix.lonLat, zoneIndex, rules, config);
  const { active, newly } = tracker.update({ position: fix.lonLat, situation, knots, caves });
  activeAlerts = active;
  if (newly.length) beep(newly.some((a) => a.kind !== 'velocita') ? 'danger' : 'warning');
  renderHud();
  renderAlerts();
  renderTarget();
  mapApi?.setPosition(fix.lonLat, fix.accuracy, (knots ?? 0) > 0.8 ? lastCourse : null, heading);
  if (!$('#sheet-sos').hidden) renderSos();
}

// ——— Avvio
async function main() {
  if (DEMO) document.body.classList.add('is-demo');
  await onboarding();
  applyI18n();
  renderHud();

  // la posizione parte subito, anche prima che la mappa sia pronta
  keepScreenOn(() => toast(t().keepScreenOn, 8000));
  $('#wake-banner').onclick = () => { $('#wake-banner').hidden = true; };

  if (DEMO) {
    $('#demo').hidden = false;
    const gpx = await fetch('/naviga/demo/giro-demo.gpx').then((r) => r.text());
    const demo = startDemo(gpx, onFix, (done) => { $('#demo-progress').textContent = `${Math.round(done * 100)}%`; });
    $('#demo-play').onclick = () => { $('#demo-play').textContent = demo.toggle() ? '⏸' : '▶'; };
    $('#demo-rate').onclick = () => { $('#demo-rate').textContent = `×${demo.cycleRate()}`; };
  } else {
    startGeolocation(onFix, (code) => {
      const L = t();
      $('#zone-label').textContent = code === 'denied' ? L.gpsDenied : code === 'unsupported' ? L.gpsUnsupported : L.waitingGps;
    });
  }

  $('#btn-poi').onclick = () => { unlockAudio(); openSheet('sheet-poi'); };
  $('#btn-port').onclick = () => { unlockAudio(); selectTarget(port); };
  $('#btn-sos').onclick = () => openSheet('sheet-sos');
  $('#btn-info').onclick = () => openSheet('sheet-info');
  $('#btn-center').onclick = () => mapApi?.recenter(lastFix?.lonLat ?? null);
  $('#target-clear').onclick = () => selectTarget(null);
  $('#btn-lang').onclick = () => {
    setLang(getLang() === 'it' ? 'en' : 'it');
    store.lang = getLang();
    applyI18n();
    mapApi?.setLang(getLang(), pois);
    renderInfo(); renderHud(); renderAlerts(); renderTarget();
  };
  $('#btn-disclaimer').onclick = () => {
    closeSheets();
    store.accepted = false;
    void onboarding();
  };
  $('#btn-compass').onclick = async () => {
    unlockAudio();
    const btn = $('#btn-compass');
    if (btn.getAttribute('aria-pressed') === 'true') return;
    const ok = await startCompass((h) => {
      heading = h;
      if (lastFix) mapApi?.setPosition(lastFix.lonLat, lastFix.accuracy, (knots ?? 0) > 0.8 ? lastCourse : null, heading);
    });
    btn.setAttribute('aria-pressed', String(ok));
    if (!ok) toast(t().compassDenied);
  };

  // la mappa arriva per ultima: SOS, velocità, zone e avvisi funzionano anche se non parte
  try {
    mapApi = await createMap($('#map'), getLang(), { zones, pois, seamarks, config });
    mapApi.onPoiClick((id) => selectTarget(pois.find((p) => p.id === id) ?? null));
    if (lastFix) mapApi.setPosition(lastFix.lonLat, lastFix.accuracy, lastCourse, heading);
    renderTarget();
    mapApi.map.once('idle', () => { mapReady = true; });
  } catch (err) {
    console.error(err);
    document.body.classList.add('no-map');
  }
  registerServiceWorker();
}

let toastTimer = 0;
function toast(msg: string, ms = 4000) {
  const el = $('#wake-banner');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.hidden = true; }, ms);
}

async function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

// usato dai test end-to-end per leggere lo stato senza dipendere dal disegno della mappa
Object.defineProperty(window, '__naviga', { value: { get situation() { return situation; }, get knots() { return knots; }, get alerts() { return activeAlerts; }, get fixCount() { return fixCount; }, get mapReady() { return mapReady; }, get route() { return currentRoute; } } });

void main();
