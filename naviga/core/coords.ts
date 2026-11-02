// Conversioni di coordinate: gradi-primi-secondi ⇄ decimali. Nessuna dipendenza dal browser.

export type LonLat = [lon: number, lat: number];

/** "42°08'16\"N" → 42.137777… (S e W negativi) */
export function parseDms(s: string): number {
  const m = s.trim().match(/^(\d+)°\s*(\d+)'\s*(\d+(?:[.,]\d+)?)"?\s*([NSEW])$/i);
  if (!m) throw new Error(`Coordinata non valida: ${s}`);
  const [, d, p, sec, h] = m;
  const v = +d + +p / 60 + +sec.replace(',', '.') / 3600;
  return /[SW]/i.test(h) ? -v : v;
}

/** 42.1377 → "42°08'16\"N" (secondi arrotondati, o con decimali se richiesti) */
export function formatDms(value: number, axis: 'lat' | 'lon', secDecimals = 0): string {
  const h = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  const factor = 10 ** secDecimals;
  let total = Math.round(Math.abs(value) * 3600 * factor);
  const d = Math.floor(total / (3600 * factor));
  total -= d * 3600 * factor;
  const p = Math.floor(total / (60 * factor));
  const sec = (total - p * 60 * factor) / factor;
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  const secStr = secDecimals ? sec.toFixed(secDecimals).padStart(3 + secDecimals, '0') : pad(sec, 2);
  return `${pad(d, axis === 'lat' ? 2 : 3)}°${pad(p, 2)}'${secStr}"${h}`;
}

export function formatDecimal([lon, lat]: LonLat, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}
