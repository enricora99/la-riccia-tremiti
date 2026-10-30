import * as THREE from 'three';
import { U, applyTimeOfDay, createSky } from './atmosphere.js';
import { createOcean, waveHeight } from './ocean.js';
import { createArchipelago, heightAt, ISLANDS } from './islands.js';
import { createBoat } from './boat.js';
import { createWake } from './wake.js';
import { FLEET } from '../data.js';

const UP = new THREE.Vector3(0, 1, 0);
const v = () => new THREE.Vector3();

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function createGulls(n) {
  const group = new THREE.Group();
  const matW = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.8, side: THREE.DoubleSide });
  const matB = new THREE.MeshStandardMaterial({ color: '#3a3f44', roughness: 0.8, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.12, 0.85, 0.05, -0.02, 0.85, 0.05, -0.02, 0, 0, -0.12, 1.45, -0.08, -0.22], 3));
  wingGeo.computeVertexNormals();
  const birds = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.45, 3, 6), matW);
    body.rotation.x = Math.PI / 2;
    const l = new THREE.Mesh(wingGeo, i % 3 ? matW : matB), r = new THREE.Mesh(wingGeo, i % 3 ? matW : matB);
    r.scale.x = -1;
    b.add(body, l, r);
    b.userData = { l, r, phase: Math.random() * 6.28, rad: 25 + Math.random() * 45, h: 14 + Math.random() * 26, sp: 0.18 + Math.random() * 0.15, dir: Math.random() > 0.5 ? 1 : -1 };
    b.scale.setScalar(1.4);
    group.add(b);
    birds.push(b);
  }
  const center = new THREE.Vector3();
  return {
    group,
    update(t, follow) {
      center.lerp(follow, 0.01);
      if (center.lengthSq() === 0) center.copy(follow);
      for (const b of birds) {
        const d = b.userData;
        const a = t * d.sp * d.dir + d.phase;
        b.position.set(center.x + Math.cos(a) * d.rad, d.h + Math.sin(t * 0.4 + d.phase) * 3, center.z + Math.sin(a) * d.rad);
        b.rotation.y = -a * d.dir + (d.dir > 0 ? Math.PI : 0);
        b.rotation.z = Math.sin(t + d.phase) * 0.25 * d.dir;
        const flap = Math.sin(t * 7 + d.phase) * 0.55 * (0.5 + 0.5 * Math.sin(t * 0.7 + d.phase));
        d.l.rotation.z = flap; d.r.rotation.z = -flap;
      }
    },
  };
}

export function createWorld(canvas, { mobile = false, reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(U.uHorizon.value.clone(), U.uFogDensity.value);
  const camera = new THREE.PerspectiveCamera(mobile ? 58 : 42, 1, 0.4, 40000);

  const sky = createSky();
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  const hemi = new THREE.HemisphereLight('#bcd6ec', '#6b5a45', 0.85);
  scene.add(sun, sun.target, hemi);

  const world = createArchipelago({ mobile });
  scene.add(world.group);
  const ocean = createOcean({ shoreTex: world.shoreTex, shoreBounds: world.shoreBounds, mobile });
  scene.add(ocean);

  // Ambiente PBR generato dal cielo procedurale
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(createSky());
  let envRT = null, envTod = -1;
  function refreshEnv(tod) {
    if (Math.abs(tod - envTod) < 0.025) return;
    envTod = tod;
    const next = pmrem.fromScene(envScene, 0, 0.1, 100);
    if (envRT) envRT.dispose();
    envRT = next;
    scene.environment = envRT.texture;
  }

  // Barca protagonista + flotta ormeggiata al pontile
  const hero = createBoat(FLEET[0]);
  scene.add(hero);
  const moored = world.moorings.map((m, i) => {
    const b = createBoat(FLEET[(i * 2 + 1) % FLEET.length], { detail: 0 });
    b.position.copy(m.pos);
    b.userData.yaw = m.yaw;
    scene.add(b);
    return b;
  });
  const wake = createWake(mobile ? 60 : 90);
  scene.add(wake.mesh);
  const gulls = createGulls(mobile ? 7 : 14);
  scene.add(gulls.group);

  // Rotta del viaggio
  const curve = new THREE.CatmullRomCurve3(world.route, false, 'catmullrom', 0.5);
  const nWp = world.route.length - 1;
  const chapterT = world.chapterWaypoints.map((w) => w / nWp);
  const N = chapterT.length;
  // l'ultimo capitolo ha mezzo segmento in più per chiudere il movimento di camera
  const step = 1 / (N - 0.5);
  const anchors = chapterT.map((_, i) => i * step);
  const segOf = (p) => Math.min(Math.floor(p / step), N - 1);

  function boatTargetT(p) {
    const seg = segOf(p);
    if (seg >= N - 1) return chapterT[N - 1];
    const f = (p - anchors[seg]) / step;
    const e = f - (Math.sin(f * Math.PI * 2) / (Math.PI * 2)) * 0.85;
    return THREE.MathUtils.lerp(chapterT[seg], chapterT[seg + 1], e);
  }

  const state = {
    p: 0, t: chapterT[0], pos: curve.getPoint(chapterT[0]), fwd: curve.getTangent(chapterT[0]).setY(0).normalize(),
    right: v(), yaw: 0, speed: 0, yawRate: 0, side: 1,
  };
  state.yaw = Math.atan2(state.fwd.x, state.fwd.z);

  // Inquadrature cinematografiche
  const C = world.center;
  const shotHero = (lt, time) => {
    const a = 2.2 + (reducedMotion ? 0 : time * 0.01) + lt * 0.35;
    const R = (mobile ? 5600 : 4700) - lt * 600;
    return [C.clone().add(new THREE.Vector3(Math.cos(a) * R, 1300 - lt * 250, Math.sin(a) * R)), C.clone().add(new THREE.Vector3(0, -200, 0))];
  };
  const B = () => state.pos.clone();
  function poiShot(poi, lt, dist, h, poiH) {
    const away = B().sub(poi).setY(0).normalize();
    const a = (lt - 0.5) * 1.1;
    away.applyAxisAngle(UP, a);
    const pos = B().addScaledVector(away, dist).addScaledVector(UP, h + 2 * Math.sin(lt * Math.PI));
    return [pos, B().lerp(poi, 0.4).setY(poiH * 0.5)];
  }
  const shots = [
    shotHero,
    (lt) => [B().addScaledVector(state.right, -state.side * (17 - lt * 4)).addScaledVector(state.fwd, -12 + lt * 6).addScaledVector(UP, 6.5 - lt * 3), B().addScaledVector(state.right, state.side * 14).addScaledVector(state.fwd, 4).addScaledVector(UP, 2.5)],
    (lt) => [B().addScaledVector(state.fwd, -13).addScaledVector(state.right, -state.side * (4 + 3 * Math.sin(lt * Math.PI))).addScaledVector(UP, 4.2), B().addScaledVector(state.fwd, 35).addScaledVector(state.right, state.side * 22).addScaledVector(UP, 1.5)],
    (lt) => [B().addScaledVector(state.right, -state.side * 12).addScaledVector(UP, 1.5).addScaledVector(state.fwd, 5 - lt * 10), B().addScaledVector(state.right, state.side * 40).addScaledVector(UP, 7).addScaledVector(state.fwd, 12)],
    // la barca in primo piano, il punto d'interesse sullo sfondo, con una lenta carrellata laterale
    (lt) => poiShot(world.pois.arch, lt, 24, 4, 5),
    (lt) => poiShot(world.pois.elephant, lt, 17, 3, 14),
    (lt) => [B().addScaledVector(UP, 48 + lt * 40).addScaledVector(state.right, -state.side * (30 + lt * 20)), B().addScaledVector(state.right, state.side * 45)],
    (lt) => {
      const away = B().sub(world.fortress).setY(0).normalize();
      const pos = B().addScaledVector(away, 38 + lt * 110).addScaledVector(state.right, 10).addScaledVector(UP, 9 + lt * 45);
      return [pos, B().lerp(world.fortress, 0.35 + lt * 0.35).setY(10 + lt * 20)];
    },
  ];

  const camPos = v(), camTgt = v();
  let camInit = false;
  let introK = 1;

  function desiredCamera(p, time) {
    const seg = segOf(p);
    if (seg >= N - 1) return shots[N - 1](0.5 + THREE.MathUtils.clamp((p - anchors[N - 1]) / (step * 0.5), 0, 1) * 0.5, time);
    const f = THREE.MathUtils.clamp((p - anchors[seg]) / step, 0, 1);
    const bw = seg === 0 ? 0.5 : 0.22;
    const w = THREE.MathUtils.smoothstep(f, 0.5 - bw, 0.5 + bw);
    const ltA = 0.5 + f * 0.5, ltB = f * 0.5;
    const [pa, ta] = shots[seg](ltA, time);
    if (w <= 0) return [pa, ta];
    const [pb, tb] = shots[seg + 1](ltB, time);
    // la gru dall'alto scende con una curva più morbida
    const wp = seg === 0 ? 1 - Math.pow(1 - w, 2.4) : w;
    return [pa.lerp(pb, wp), ta.lerp(tb, w)];
  }

  // da che lato della barca c'è la costa? campiona il terreno a destra e a sinistra
  let sideAcc = 0;
  function nearestIslandSide() {
    let s = 0;
    for (const d of [40, 110, 260]) {
      const r = heightAt(state.pos.x + state.right.x * d, state.pos.z + state.right.z * d);
      const l = heightAt(state.pos.x - state.right.x * d, state.pos.z - state.right.z * d);
      s += Math.sign(r - l) / (1 + d / 100);
    }
    sideAcc = sideAcc * 0.97 + s * 0.03;
    return sideAcc >= 0 ? 1 : -1;
  }

  let width = 1, height = 1;
  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width / height < 0.8 ? 62 : mobile ? 55 : 42;
    camera.updateProjectionMatrix();
  }
  resize();

  const timer = new THREE.Timer();
  let active = true, raf = 0, time = 0;
  const tmpF = v();

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!active) return;
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    time += dt;
    U.uTime.value = time;

    const tod = THREE.MathUtils.clamp(state.p * 1.02, 0, 1);
    applyTimeOfDay(tod);
    scene.fog.color.copy(U.uHorizon.value);
    scene.fog.density = U.uFogDensity.value * 0.9;
    sun.position.copy(U.uSunDir.value).multiplyScalar(1000).add(camera.position);
    sun.target.position.copy(camera.position);
    sun.color.copy(U.uSunColor.value);
    sun.intensity = 1.2 + 1.6 * Math.min(1, U.uSunDir.value.y * 2.5);
    hemi.color.copy(U.uZenith.value).lerp(U.uHorizon.value, 0.4);
    refreshEnv(tod);

    // Simulazione barca
    const target = boatTargetT(state.p);
    const prev = state.pos.clone();
    state.t += (target - state.t) * (1 - Math.exp(-dt * 0.9));
    state.pos.copy(curve.getPoint(THREE.MathUtils.clamp(state.t, 0, 1)));
    const instSpeed = prev.distanceTo(state.pos) / Math.max(dt, 1e-3);
    state.speed += (instSpeed - state.speed) * (1 - Math.exp(-dt * 3));
    if (state.speed > 0.3) {
      tmpF.copy(curve.getTangent(THREE.MathUtils.clamp(state.t, 0, 1))).setY(0).normalize();
      if (target < state.t) tmpF.negate();
      const newYaw = lerpAngle(state.yaw, Math.atan2(tmpF.x, tmpF.z), 1 - Math.exp(-dt * 2.5));
      state.yawRate = (newYaw - state.yaw) / Math.max(dt, 1e-3);
      state.yaw = newYaw;
    } else state.yawRate *= 0.9;
    state.fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    state.right.set(-state.fwd.z, 0, state.fwd.x);
    state.side = nearestIslandSide();

    const L = hero.userData.length, Bm = hero.userData.beam;
    const hc = waveHeight(state.pos.x, state.pos.z, time);
    const hb = waveHeight(state.pos.x + state.fwd.x * L / 2, state.pos.z + state.fwd.z * L / 2, time);
    const hs = waveHeight(state.pos.x - state.fwd.x * L / 2, state.pos.z - state.fwd.z * L / 2, time);
    const hp = waveHeight(state.pos.x - state.right.x * Bm / 2, state.pos.z - state.right.z * Bm / 2, time);
    const hst = waveHeight(state.pos.x + state.right.x * Bm / 2, state.pos.z + state.right.z * Bm / 2, time);
    const plane = Math.min(state.speed / 14, 1);
    hero.position.set(state.pos.x, hc * 0.9 + plane * 0.12 - 0.02, state.pos.z);
    hero.rotation.set(-Math.atan2(hb - hs, L) - plane * 0.07, state.yaw, Math.atan2(hp - hst, Bm) - THREE.MathUtils.clamp(state.yawRate * plane * 0.25, -0.12, 0.12), 'YXZ');
    hero.userData.propeller.rotation.z += dt * (6 + state.speed * 6);
    wake.update(state.pos, state.fwd, Bm, state.speed, time);

    for (const b of moored) {
      const p = b.position;
      const h = waveHeight(p.x, p.z, time);
      b.position.y = h * 0.85;
      b.rotation.set(Math.sin(time * 0.8 + p.x) * 0.03, b.userData.yaw, Math.sin(time * 1.1 + p.z) * 0.04, 'YXZ');
    }
    world.pois.buoy.position.y = waveHeight(world.pois.buoy.position.x, world.pois.buoy.position.z, time) + 0.15;
    gulls.update(time, state.pos);

    // Camera
    const [dp, dtg] = desiredCamera(state.p, time);
    if (introK < 1) {
      const [hp0, ht0] = shotHero(0, time);
      const high = hp0.clone().sub(C).multiplyScalar(1.5).add(C).setY(3200);
      const k = 1 - Math.pow(1 - introK, 3);
      dp.copy(high.lerp(dp, k));
      dtg.copy(ht0.lerp(dtg, k));
    }
    // Composizione: la barca a destra (desktop) o in alto (mobile), il testo resta libero
    const framing = THREE.MathUtils.smoothstep(state.p, 0.06, 0.13) * (1 - THREE.MathUtils.smoothstep(state.p, 0.86, 0.95));
    if (framing > 0) {
      const look = tmpF.copy(dtg).sub(dp);
      const dist = look.length();
      look.normalize();
      const camRight = new THREE.Vector3().crossVectors(look, UP).normalize();
      if (width / height > 1) dtg.addScaledVector(camRight, -dist * 0.2 * framing);
      else dtg.addScaledVector(UP, -dist * 0.14 * framing);
    }
    if (!camInit) { camPos.copy(dp); camTgt.copy(dtg); camInit = true; }
    const k = 1 - Math.exp(-dt * (reducedMotion ? 6 : 3.2));
    camPos.lerp(dp, k);
    camTgt.lerp(dtg, k);
    camera.position.copy(camPos);
    if (!reducedMotion) {
      camera.position.x += Math.sin(time * 0.9) * 0.12;
      camera.position.y += Math.sin(time * 1.3) * 0.08;
    }
    const minY = Math.max(waveHeight(camera.position.x, camera.position.z, time) + 0.9, heightAt(camera.position.x, camera.position.z) + 8);
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(camTgt);

    renderer.render(scene, camera);
  }

  if (import.meta.env.DEV) window.__riccia = { state, camera, world, camPos, camTgt };

  return {
    renderer,
    start() { frame(); },
    setProgress(p) { state.p = THREE.MathUtils.clamp(p, 0, 1); },
    setActive(a) { if (a && !active) timer.reset?.(); active = a; },
    playIntro(gsap, duration = 4.2) {
      introK = 0;
      const o = { k: 0 };
      gsap.to(o, { k: 1, duration, ease: 'power2.inOut', onUpdate: () => { introK = o.k; } });
    },
    resize,
    anchors,
  };
}
