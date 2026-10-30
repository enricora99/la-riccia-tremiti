import { generateTerrain } from './terrain.js';

self.onmessage = ({ data }) => {
  const t = generateTerrain(data, data.parts);
  const buffers = [];
  if (t.shore) buffers.push(t.shore.data.buffer);
  if (t.trees) buffers.push(t.trees.canopy.buffer, t.trees.trunk.buffer, t.trees.colors.buffer);
  for (const d of t.islands) if (d) buffers.push(d.pos.buffer, d.nrm.buffer, d.col.buffer, d.idx.buffer);
  self.postMessage(t, buffers);
};
