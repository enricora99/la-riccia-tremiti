// Percorre il giro della demo con la geolocalizzazione simulata del browser e verifica che
// gli avvisi compaiano nei punti in cui il core li prevede (e che non ne compaiano altri).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseGpx } from '../core/gpx.ts';
import { distanceMeters } from '../core/geo.ts';
import { indexZones, situationAt } from '../core/rules.ts';
import { createAlertTracker } from '../core/alerts.ts';
import type { Config, Poi, Rules, Zones } from '../core/types.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const points = parseGpx(read('../public/demo/giro-demo.gpx'));
const zones = JSON.parse(read('../data/zones.geojson')) as Zones;
const rules = JSON.parse(read('../data/rules.json')) as Rules;
const config = JSON.parse(read('../data/config.json')) as Config;
const caves = (JSON.parse(read('../data/poi.json')) as Poi[]).filter((p) => p.tipo === 'grotta');

// Dove il core prevede che ogni avviso cominci
function expectedOnsets() {
  const idx = indexZones(zones);
  const tracker = createAlertTracker({ caveMeters: config.avvisoGrottaMetri, toleranceKn: config.tolleranzaVelocitaNodi });
  const out: { key: string; i: number }[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const kn = prev ? (distanceMeters(prev.lonLat, p.lonLat) / ((p.time - prev.time) / 1000)) * 1.94384 : null;
    const s = situationAt(p.lonLat, idx, rules, config);
    for (const a of tracker.update({ position: p.lonLat, situation: s, knots: kn, caves }).newly) out.push({ key: a.key, i });
  });
  return out;
}

test.describe(() => {
// la mappa in headless è disegnata in software: a densità 1 il test resta veloce
test.use({ deviceScaleFactor: 1 });
test('gli avvisi scattano nei punti giusti lungo il giro della demo', async ({ page, context }) => {
  test.setTimeout(600_000);
  const expected = expectedOnsets();
  expect(expected.map((e) => e.key).sort()).toEqual(['grotta:grotta-viole', 'velocita', 'zona-b']);

  await context.addInitScript(() => {
    localStorage.setItem('naviga-lang', 'it');
    localStorage.setItem('naviga-avvertenza', '1');
  });
  // l'app calcola la velocità con l'orario di ricezione: lo facciamo coincidere con quello della traccia
  await page.clock.setFixedTime(points[0].time);
  await context.setGeolocation({ latitude: points[0].lonLat[1], longitude: points[0].lonLat[0], accuracy: 5 });
  await page.goto('/naviga/');
  await page.waitForFunction(() => (window as any).__naviga?.fixCount >= 1);

  const seen = new Map<string, number>();
  let shown = new Set<string>();
  // un punto ogni 4 secondi di navigazione: la velocità calcolata resta la stessa, il test dura la metà
  const STEP = 2;
  for (let i = STEP; i < points.length; i += STEP) {
    const p = points[i];
    await page.clock.setFixedTime(p.time);
    await context.setGeolocation({ latitude: p.lonLat[1], longitude: p.lonLat[0], accuracy: 5 });
    // aspetta che l'app abbia elaborato il fix, poi legge gli avvisi visibili nell'interfaccia
    const now = new Set(await page.evaluate(async (n) => {
      const w = window as any;
      for (let k = 0; k < 400 && w.__naviga.fixCount < n; k++) await new Promise((r) => setTimeout(r, 5));
      if (w.__naviga.fixCount < n) throw new Error(`fix ${n} non elaborato`);
      return [...document.querySelectorAll<HTMLElement>('#alerts [data-alert]')].map((el) => (el.dataset.alert === 'grotta' ? `grotta:${el.dataset.poi}` : el.dataset.alert!));
    }, 1 + i / STEP));
    for (const k of now) if (!shown.has(k) && !seen.has(k)) seen.set(k, i);
    shown = now;
  }

  for (const e of expected) {
    const at = seen.get(e.key);
    expect(at, `avviso ${e.key} mai comparso`).toBeDefined();
    // posizione: stesso punto; velocità: la media mobile dell'app può ritardare di qualche fix
    const tolerance = e.key === 'velocita' ? 4 * STEP : STEP;
    expect(Math.abs(at! - e.i), `avviso ${e.key}: atteso al punto ${e.i}, comparso al ${at}`).toBeLessThanOrEqual(tolerance);
  }
  expect([...seen.keys()].sort(), 'avvisi inattesi').toEqual(expected.map((e) => e.key).sort());
  await page.screenshot({ path: 'naviga/e2e/ultimo-stato.png' });
});
});

test('SOS: chiamate e messaggio WhatsApp con la posizione', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('naviga-lang', 'it');
    localStorage.setItem('naviga-avvertenza', '1');
  });
  await context.setGeolocation({ latitude: 42.11, longitude: 15.5, accuracy: 8 });
  await page.goto('/naviga/');
  await page.waitForFunction(() => (window as any).__naviga?.fixCount >= 1);
  await page.click('#btn-sos');
  await expect(page.locator('#sos-1530')).toHaveAttribute('href', 'tel:1530');
  await expect(page.locator('#sos-112')).toHaveAttribute('href', 'tel:112');
  const wa = decodeURIComponent((await page.locator('#sos-wa').getAttribute('href'))!);
  expect(wa).toContain('https://wa.me/393489171971?text=');
  expect(wa).toContain('42.11000, 15.50000');
  expect(wa).toContain('42°06\'36"N 015°30\'00"E');
});

test('primo avvio: lingua e avvertenza da accettare', async ({ page }) => {
  await page.goto('/naviga/');
  await expect(page.locator('#onboard')).toBeVisible();
  await page.click('[data-lang="en"]');
  await expect(page.locator('#ob-disclaimer')).toContainText('not a navigation instrument');
  await page.click('#ob-accept');
  await expect(page.locator('#onboard')).toBeHidden();
  await expect(page.locator('#btn-port')).toContainText('Back to harbour');
});

test('dopo la prima apertura funziona in modalità aereo', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => {
    localStorage.setItem('naviga-lang', 'it');
    localStorage.setItem('naviga-avvertenza', '1');
  });
  await context.setGeolocation({ latitude: 42.1158, longitude: 15.4985, accuracy: 8 });
  await page.goto('/naviga/');
  // il service worker deve aver finito di mettere tutto in cache
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
  await context.setOffline(true);
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.reload();
  await page.waitForFunction(() => (window as any).__naviga?.fixCount >= 1 && (window as any).__naviga?.mapReady, null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window as any).__naviga.situation.zona)).toBe('C');
  await page.click('#btn-poi');
  await expect(page.locator('#poi-list li')).toHaveCount(8);
  expect(failed, 'richieste fallite offline').toEqual([]);
  await context.setOffline(false);
});

test('se la linea retta attraversa un’isola: avviso e rotta indicativa che la aggira', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('naviga-lang', 'it');
    localStorage.setItem('naviga-avvertenza', '1');
  });
  await context.setGeolocation({ latitude: 42.1201, longitude: 15.4995, accuracy: 5 }); // davanti al porto
  await page.goto('/naviga/');
  await page.waitForFunction(() => (window as any).__naviga?.fixCount >= 1);
  await page.click('#btn-poi');
  await expect(page.locator('[data-poi="grotta-viole"] .badge.grey')).toBeVisible();
  await page.click('[data-poi="grotta-viole"]');
  await expect(page.locator('#target-warn')).toContainText('attraversa San Domino');
  await expect(page.locator('#target-bearing')).toContainText('tieni');
  const path = await page.evaluate(() => (window as any).__naviga.route.path.length);
  expect(path).toBeGreaterThan(2);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  // grotta affacciata sulla zona B: la rotta si ferma al punto consentito più vicino
  await page.click('#target-clear');
  await page.click('#btn-poi');
  await page.click('[data-poi="grotta-bue-marino"]');
  await expect(page.locator('#target-warn')).toContainText('si arriva al massimo a');
  expect(await page.evaluate(() => (window as any).__naviga.route.approach.toGoalM)).toBeLessThan(450);

  // linea retta libera: nessun avviso
  await page.click('#target-clear');
  await page.click('#btn-poi');
  await page.click('[data-poi="bagno-padre-pio"]');
  await expect(page.locator('#target-warn')).toBeHidden();
  await expect(page.locator('#target-note')).toContainText('linea retta');
});
