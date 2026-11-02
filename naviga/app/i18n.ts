// Testi dell'interfaccia. I testi delle regole NON stanno qui: vengono da data/rules.json.
import type { Lang } from '../core/types.ts';

const T = {
  it: {
    knots: 'nodi',
    limit: 'limite',
    waitingGps: 'In attesa del GPS…',
    gpsDenied: 'Posizione non disponibile: consenti l’accesso alla posizione nelle impostazioni.',
    gpsUnsupported: 'Questo browser non fornisce la posizione.',
    accuracy: 'precisione ±{m} m',
    keepScreenOn: 'Tieni lo schermo acceso: questo telefono non permette all’app di farlo da sola.',
    clearTarget: 'Annulla destinazione',
    compass: 'Bussola',
    center: 'Centra sulla mia posizione',
    info: 'Regole e informazioni',
    attractions: 'Attrazioni',
    backToPort: 'Rientra al porto',
    straightLineNote: 'Distanze e rotte in linea retta: ostacoli, scogli e bagnanti vanno verificati a vista.',
    sosTitle: 'Emergenza',
    yourPosition: 'La tua posizione',
    coastGuard: 'Guardia Costiera',
    emergency: 'Numero unico di emergenza',
    writeRiccia: 'Scrivi a La Riccia con la tua posizione',
    sosPrivacy: 'La posizione lascia il telefono solo se premi WhatsApp e invii il messaggio.',
    rulesTitle: 'Regole dell’area marina',
    privacy: 'Privacy',
    disclaimerAgain: 'Avvertenze',
    disclaimerTitle: 'Prima di partire',
    previewTag: 'Anteprima',
    previewNote: 'Anteprima: è una versione di prova che stiamo collaudando in mare. Zone e posizioni delle attrazioni sono provvisorie. Segnalaci a terra qualsiasi errore.',
    disclaimerText: '<p><b>Versione di prova (anteprima).</b> La stiamo collaudando in mare: zone e posizioni possono contenere errori.</p><p>Questa app è un <b>supporto informativo</b>, non uno strumento di navigazione.</p><p>Non sostituisce le carte nautiche, le istruzioni di La Riccia e l’osservazione diretta del mare.</p><p>Le rotte sono <b>in linea retta</b>: ostacoli, scogli, altre barche e bagnanti vanno verificati a vista.</p><p>Zone e coordinate sono provvisorie. In caso di dubbio vale quello che vedi e quello che ti dice il noleggiatore.</p>',
    accept: 'Ho capito, accetto',
    zone: { A: 'Zona A · navigazione vietata', B: 'Zona B', C: 'Zona C', fuori: 'Fuori dall’area marina protetta' },
    zoneBForbidden: 'Zona B · vietata al noleggio',
    band: { '0-300': 'entro 300 m dalla costa', '300-600': 'tra 300 e 600 m dalla costa', 'oltre-600': 'oltre 600 m dalla costa' },
    noLimit: 'nessun limite AMP',
    alert: {
      velocita: 'Rallenta: limite {kn} nodi',
      'zona-a': 'Sei in zona A: esci subito',
      'zona-b': 'Sei in zona B: non consentita al noleggio',
      grotta: 'Grotta a meno di {m} m: non entrare',
    },
    access: { consentito: '', 'solo esterno': 'solo dall’esterno', vietato: 'vietato' },
    type: { grotta: 'Grotta', scoglio: 'Scoglio', cala: 'Cala', porto: 'Porto', altro: 'Attrazione' },
    unverified: 'posizione da verificare',
    noPosition: 'Serve la posizione GPS per calcolare distanza e rotta.',
    compassDenied: 'Bussola non disponibile: uso la direzione del GPS.',
    lineLabel: 'linea retta',
    legend: { A: 'Zona A – vietata', Bno: 'Zona B – vietata al noleggio', Bok: 'Zona B – max 5 nodi', c300: 'Zona C – max 5 nodi (entro 300 m)', c600: 'Zona C – max 10 nodi (300–600 m)' },
    zonesNote: 'Zone ricostruite dal D.I. 14/07/1989 e dalla costa OpenStreetMap: provvisorie, da validare con la cartografia ufficiale dell’Ente Parco.',
    waText: 'Ciao La Riccia, ho bisogno di aiuto. Posizione: {dec} ({dms}) https://maps.google.com/?q={lat},{lon}',
    demoOn: 'Modalità demo: posizione simulata',
    soundOn: 'Avvisi sonori attivi',
  },
  en: {
    knots: 'knots',
    limit: 'limit',
    waitingGps: 'Waiting for GPS…',
    gpsDenied: 'Location unavailable: allow location access in your settings.',
    gpsUnsupported: 'This browser does not provide your location.',
    accuracy: 'accuracy ±{m} m',
    keepScreenOn: 'Keep the screen on: this phone does not let the app do it.',
    clearTarget: 'Clear destination',
    compass: 'Compass',
    center: 'Center on my position',
    info: 'Rules and information',
    attractions: 'Places',
    backToPort: 'Back to harbour',
    straightLineNote: 'Distances and routes are straight lines: check obstacles, rocks and swimmers with your own eyes.',
    sosTitle: 'Emergency',
    yourPosition: 'Your position',
    coastGuard: 'Coast Guard',
    emergency: 'European emergency number',
    writeRiccia: 'Message La Riccia with your position',
    sosPrivacy: 'Your position leaves the phone only if you tap WhatsApp and send the message.',
    rulesTitle: 'Marine protected area rules',
    privacy: 'Privacy',
    disclaimerAgain: 'Disclaimer',
    disclaimerTitle: 'Before you set off',
    previewTag: 'Preview',
    previewNote: 'Preview: this is a trial version we are testing at sea. Zones and place positions are provisional. Please tell us about any mistake back at the harbour.',
    disclaimerText: '<p><b>Trial version (preview).</b> We are testing it at sea: zones and positions may contain mistakes.</p><p>This app is an <b>information aid</b>, not a navigation instrument.</p><p>It does not replace nautical charts, La Riccia’s instructions or your own observation of the sea.</p><p>Routes are <b>straight lines</b>: check obstacles, rocks, other boats and swimmers with your own eyes.</p><p>Zones and coordinates are provisional. When in doubt, follow what you see and what the rental staff tell you.</p>',
    accept: 'I understand and accept',
    zone: { A: 'Zone A · no navigation', B: 'Zone B', C: 'Zone C', fuori: 'Outside the marine protected area' },
    zoneBForbidden: 'Zone B · not allowed for rentals',
    band: { '0-300': 'within 300 m of the coast', '300-600': '300–600 m from the coast', 'oltre-600': 'more than 600 m from the coast' },
    noLimit: 'no MPA limit',
    alert: {
      velocita: 'Slow down: limit {kn} knots',
      'zona-a': 'You are in zone A: leave now',
      'zona-b': 'You are in zone B: not allowed for rentals',
      grotta: 'Cave within {m} m: do not enter',
    },
    access: { consentito: '', 'solo esterno': 'outside only', vietato: 'forbidden' },
    type: { grotta: 'Cave', scoglio: 'Rock', cala: 'Cove', porto: 'Harbour', altro: 'Place' },
    unverified: 'position to be verified',
    noPosition: 'A GPS position is needed to compute distance and course.',
    compassDenied: 'Compass unavailable: using GPS direction.',
    lineLabel: 'straight line',
    legend: { A: 'Zone A – forbidden', Bno: 'Zone B – not allowed for rentals', Bok: 'Zone B – max 5 knots', c300: 'Zone C – max 5 knots (within 300 m)', c600: 'Zone C – max 10 knots (300–600 m)' },
    zonesNote: 'Zones rebuilt from the decree of 14/07/1989 and the OpenStreetMap coastline: provisional, to be validated against the Park Authority’s official maps.',
    waText: 'Hi La Riccia, I need help. Position: {dec} ({dms}) https://maps.google.com/?q={lat},{lon}',
    demoOn: 'Demo mode: simulated position',
    soundOn: 'Sound alerts on',
  },
};

export type Strings = (typeof T)['it'];
let lang: Lang = 'it';
export const setLang = (l: Lang) => { lang = l; };
export const getLang = () => lang;
export const t = (): Strings => T[lang] as Strings;
export const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** Applica i testi agli elementi con data-i18n / data-i18n-aria / data-i18n-html */
export function applyI18n(root: ParentNode = document) {
  const s = t() as unknown as Record<string, string>;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { const v = s[el.dataset.i18n!]; if (typeof v === 'string') el.textContent = v; });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => { const v = s[el.dataset.i18nHtml!]; if (typeof v === 'string') el.innerHTML = v; });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => { const v = s[el.dataset.i18nAria!]; if (typeof v === 'string') el.setAttribute('aria-label', v); });
  document.documentElement.lang = lang;
}
