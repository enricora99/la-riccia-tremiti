import { TERRAIN_PARTS, generateTerrain } from './terrain.js';

// Avvia la generazione del terreno in tre worker paralleli appena la pagina parte,
// mentre si scarica Three.js. Se i worker non sono disponibili si calcola qui.
function runPart(mobile, part) {
  return new Promise((resolve, reject) => {
    const fallback = () => { try { resolve(generateTerrain({ mobile }, [part])); } catch (err) { reject(err); } };
    let worker;
    try {
      worker = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
    } catch {
      fallback();
      return;
    }
    worker.onmessage = ({ data }) => { resolve(data); worker.terminate(); };
    worker.onerror = (e) => { e.preventDefault?.(); worker.terminate(); fallback(); };
    worker.postMessage({ mobile, parts: [part] });
  });
}

export async function loadTerrain({ mobile }) {
  const results = await Promise.all(TERRAIN_PARTS.map((p) => runPart(mobile, p)));
  const t = { islands: [] };
  for (const r of results) {
    r.islands.forEach((d, i) => { if (d) t.islands[i] = d; });
    if (r.trees) t.trees = r.trees;
    if (r.shore) t.shore = r.shore;
  }
  return t;
}
