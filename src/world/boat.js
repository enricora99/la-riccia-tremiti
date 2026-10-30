import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Gommone procedurale: prua verso +z, linea di galleggiamento a y = 0.

const matCache = new Map();
function mat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}
const std = (color, roughness = 0.6, metalness = 0, extra = {}) =>
  mat(`${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));

let decalCache = new Map();
function engineDecal(hp) {
  if (decalCache.has(hp)) return decalCache.get(hp);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#c8102e';
  g.font = '700 92px Manrope, Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('HONDA', 18, 62);
  g.fillStyle = '#2b2f33';
  g.fillRect(18, 112, 476, 6);
  g.font = '700 40px Manrope, Arial, sans-serif';
  g.fillText(`${hp}`, 420, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  decalCache.set(hp, m);
  return m;
}

let shadowTex;
function contactShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,20,30,0.55)');
    gr.addColorStop(1, 'rgba(0,20,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
}

export function createBoat(spec, { detail = 1 } = {}) {
  const L = spec.length;
  const B = THREE.MathUtils.clamp(L * 0.41, 1.75, 2.5);
  const r = 0.11 * B + 0.02;
  const ty = 0.36;
  const xs = B / 2 - r;
  const boat = new THREE.Group();
  const body = new THREE.Group();
  boat.add(body);
  const tubeMat = std(spec.tube, 0.55, 0.0, { envMapIntensity: 0.8 });
  const hullMat = std(spec.hull, 0.28, 0.0);
  const darkMat = std('#24282c', 0.7);
  const steel = std('#d9dee3', 0.22, 1.0);
  const cushion = std('#efe9dc', 0.85);
  const tubeSeg = detail > 0.5 ? 140 : 60, radial = detail > 0.5 ? 16 : 10;

  // Tubolari
  const tubePts = (dx = 0, dy = 0) => {
    const side = (sx) => [
      new THREE.Vector3(sx * (xs + dx), ty + dy, -L / 2 - 0.22),
      new THREE.Vector3(sx * (xs + dx), ty + dy, -L * 0.1),
      new THREE.Vector3(sx * (xs * 0.97 + dx), ty + dy + 0.03, L * 0.18),
      new THREE.Vector3(sx * (xs * 0.7 + dx * 0.8), ty + dy + 0.13, L * 0.37),
    ];
    const port = side(1), stbd = side(-1).reverse();
    return [...port, new THREE.Vector3(0, ty + dy + 0.25, L / 2 - r * 0.7 + dx * 0.6), ...stbd];
  };
  const tubeCurve = new THREE.CatmullRomCurve3(tubePts(), false, 'centripetal');
  body.add(new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, tubeSeg, r, radial, false), tubeMat));
  // Bottazzi di poppa
  for (const sx of [1, -1]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.5, radial), tubeMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(sx * xs, ty, -L / 2 - 0.22 - r * 0.74);
    body.add(cone);
  }
  // Bottazzo paracolpi e cima tientibene
  const strake = new THREE.CatmullRomCurve3(tubePts(r * 0.82, -r * 0.5), false, 'centripetal');
  body.add(new THREE.Mesh(new THREE.TubeGeometry(strake, tubeSeg, r * 0.17, 8, false), darkMat));
  if (detail > 0.5) {
    const rope = new THREE.CatmullRomCurve3(tubePts(0, r * 0.93), false, 'centripetal');
    body.add(new THREE.Mesh(new THREE.TubeGeometry(rope, tubeSeg, 0.014, 5, false), darkMat));
  }

  // Carena a V
  const halfW = (s) => {
    const base = xs - r * 0.15;
    if (s < 0.55) return base;
    return base * Math.pow(Math.cos(((s - 0.55) / 0.45) * Math.PI * 0.5), 0.8);
  };
  const stations = 28;
  const hp = [], hi = [];
  for (let i = 0; i <= stations; i++) {
    const s = i / stations;
    const z = -L / 2 + s * (L - r * 0.3);
    const w = halfW(s);
    const rise = Math.pow(Math.max(0, s - 0.6) / 0.4, 2) * 0.45;
    const keel = -0.28 + rise;
    hp.push(w, 0.22, z, w * 0.94, 0.02 + rise * 0.5, z, 0, keel, z, -w * 0.94, 0.02 + rise * 0.5, z, -w, 0.22, z);
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * 5 + k, b = a + 1, c = a + 5, d = c + 1;
      hi.push(a, c, b, b, c, d);
    }
  }
  // specchio di poppa
  hi.push(0, 1, 2, 0, 2, 3, 0, 3, 4);
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  hullGeo.setIndex(hi);
  hullGeo.computeVertexNormals();
  body.add(new THREE.Mesh(hullGeo, std(spec.hull, 0.3, 0, { side: THREE.DoubleSide })));

  // Pagliolato
  const shape = new THREE.Shape();
  for (let i = 0; i <= stations; i++) {
    const s = i / stations, z = -L / 2 + s * (L - r * 0.3);
    const w = halfW(s) * 0.98;
    i === 0 ? shape.moveTo(w, -z) : shape.lineTo(w, -z);
  }
  for (let i = stations; i >= 0; i--) {
    const s = i / stations, z = -L / 2 + s * (L - r * 0.3);
    shape.lineTo(-halfW(s) * 0.98, -z);
  }
  const deck = new THREE.Mesh(new THREE.ShapeGeometry(shape), std('#d8d2c4', 0.9));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.23;
  body.add(deck);

  // Consolle centrale con parabrezza e timone
  const cz = L * 0.03;
  const cons = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.86, 0.62, 3, 0.07), hullMat);
  cons.position.set(0, 0.23 + 0.43, cz);
  body.add(cons);
  const dash = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.08, 0.42, 2, 0.03), darkMat);
  dash.position.set(0, 0.23 + 0.88, cz - 0.08);
  dash.rotation.x = -0.35;
  body.add(dash);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.74, 0.34),
    mat('glass', () => new THREE.MeshPhysicalMaterial({ color: '#9ec9d6', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
  );
  glass.position.set(0, 0.23 + 1.05, cz + 0.2);
  glass.rotation.x = -0.45;
  body.add(glass);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 24), darkMat);
  wheel.position.set(0, 0.23 + 0.98, cz - 0.27);
  wheel.rotation.x = -0.6;
  body.add(wheel);
  // Seduta pilota e panca di poppa
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.55, 3, 0.1), cushion);
  seat.position.set(0, 0.23 + 0.25, cz - 0.85);
  body.add(seat);
  const backrest = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.4, 0.14, 3, 0.06), cushion);
  backrest.position.set(0, 0.23 + 0.68, cz - 1.08);
  backrest.rotation.x = 0.15;
  body.add(backrest);
  const bench = new THREE.Mesh(new RoundedBoxGeometry(xs * 2 - 0.15, 0.42, 0.5, 3, 0.09), cushion);
  bench.position.set(0, 0.23 + 0.21, -L / 2 + 0.4);
  body.add(bench);
  // Prendisole di prua (modelli da 5 m in su)
  if (L >= 5) {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(xs * 1.45, 0.2, L * 0.2, 3, 0.08), cushion);
    pad.position.set(0, 0.23 + 0.34, L * 0.25);
    body.add(pad);
    const base = new THREE.Mesh(new THREE.BoxGeometry(xs * 1.4, 0.24, L * 0.19), hullMat);
    base.position.set(0, 0.23 + 0.12, L * 0.25);
    body.add(base);
  }

  // Tendalino parasole
  const zA = -L * 0.34, zB = L * 0.06;
  const topY = ty + r + 1.62;
  for (const z of [zA, zB]) {
    const arch = new THREE.CatmullRomCurve3([
      new THREE.Vector3(xs, ty + r * 0.8, z), new THREE.Vector3(xs * 0.95, topY - 0.25, z),
      new THREE.Vector3(xs * 0.7, topY, z), new THREE.Vector3(-xs * 0.7, topY, z),
      new THREE.Vector3(-xs * 0.95, topY - 0.25, z), new THREE.Vector3(-xs, ty + r * 0.8, z),
    ]);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(arch, 40, 0.017, 6, false), steel));
  }
  const fabricGeo = new THREE.PlaneGeometry(xs * 2.02, zB - zA + 0.25, 10, 6);
  {
    const p = fabricGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / xs, y = p.getY(i) / ((zB - zA) / 2);
      p.setZ(i, -0.24 * x * x * x * x + 0.04 * (1 - y * y));
    }
    fabricGeo.computeVertexNormals();
  }
  const fabric = new THREE.Mesh(fabricGeo, std(spec.canopy, 0.92, 0, { side: THREE.DoubleSide }));
  fabric.rotation.x = -Math.PI / 2;
  fabric.position.set(0, topY + 0.02, (zA + zB) / 2);
  body.add(fabric);

  // Fuoribordo Honda
  const f = spec.hp >= 40 ? 1 : spec.hp >= 30 ? 0.9 : 0.8;
  const engine = new THREE.Group();
  engine.position.set(0, 0.3, -L / 2 - 0.16);
  engine.rotation.x = 0.08;
  const cowl = new THREE.Mesh(new RoundedBoxGeometry(0.42 * f, 0.5 * f, 0.62 * f, 4, 0.12 * f), std('#e8ebee', 0.3, 0.15));
  cowl.position.set(0, 0.52 * f, -0.12);
  engine.add(cowl);
  const band = new THREE.Mesh(new RoundedBoxGeometry(0.43 * f, 0.09 * f, 0.63 * f, 2, 0.03), darkMat);
  band.position.set(0, 0.29 * f, -0.12);
  engine.add(band);
  for (const sx of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.46 * f, 0.145 * f), engineDecal(spec.hp));
    d.position.set(sx * (0.211 * f + 0.003), 0.56 * f, -0.12);
    d.rotation.y = sx * Math.PI / 2;
    if (sx < 0) d.scale.x = 1;
    engine.add(d);
  }
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.2 * f, 0.72, 0.24 * f), std('#d6dadd', 0.4, 0.1));
  mid.position.set(0, -0.08, -0.08);
  engine.add(mid);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34 * f, 0.025, 0.36), std('#d6dadd', 0.4, 0.1));
  plate.position.set(0, -0.4, -0.12);
  engine.add(plate);
  const lower = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.32, 0.36, 2, 0.04), std('#d6dadd', 0.4, 0.1));
  lower.position.set(0, -0.56, -0.1);
  engine.add(lower);
  const prop = new THREE.Group();
  prop.position.set(0, -0.6, -0.31);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 10), darkMat);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.012), darkMat);
    blade.position.y = 0.085;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 3) * Math.PI * 2;
    blade.rotation.y = 0.5;
    holder.add(blade);
    prop.add(holder);
  }
  engine.add(prop);
  body.add(engine);

  // Fanale di via
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 6), steel);
  pole.position.set(xs * 0.6, 0.23 + 0.5 + 0.4, -L / 2 + 0.15);
  body.add(pole);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), std('#ffffff', 0.2, 0, { emissive: '#ffffff', emissiveIntensity: 0.6 }));
  light.position.copy(pole.position).setY(pole.position.y + 0.52);
  body.add(light);

  // Ombra di contatto sull'acqua
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(B * 2.2, L * 1.5), contactShadow());
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.04;
  sh.renderOrder = 1;
  boat.add(sh);

  boat.userData = { propeller: prop, length: L, beam: B, body, spec };
  return boat;
}

export function disposeBoat(boat) {
  boat.traverse((o) => {
    if (o.isMesh) o.geometry.dispose();
  });
}
