// Lettura e scrittura minima di tracce GPX (trkpt con lat, lon, time).
// Senza DOMParser, così funziona anche fuori dal browser (Node, React Native).
import type { LonLat } from './coords.ts';

export type TrackPoint = { lonLat: LonLat; time: number; name?: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseGpx(xml: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? m[3] ?? '';
    const body = m[2] ?? '';
    const lat = Number(attrs.match(/\blat="([^"]+)"/)?.[1]);
    const lon = Number(attrs.match(/\blon="([^"]+)"/)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const t = body.match(/<time>([^<]+)<\/time>/)?.[1];
    const rawName = body.match(/<name>([^<]*)<\/name>/)?.[1];
    const name = rawName != null ? unesc(rawName) : undefined;
    out.push({ lonLat: [lon, lat], time: t ? Date.parse(t) : NaN, ...(name ? { name } : {}) });
  }
  return out;
}

export function writeGpx(points: TrackPoint[], name: string): string {
  const pts = points.map((p) => `      <trkpt lat="${p.lonLat[1].toFixed(6)}" lon="${p.lonLat[0].toFixed(6)}"><time>${new Date(p.time).toISOString()}</time>${p.name ? `<name>${esc(p.name)}</name>` : ''}</trkpt>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="La Riccia Naviga" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts.join('\n')}
    </trkseg>
  </trk>
</gpx>
`;
}
