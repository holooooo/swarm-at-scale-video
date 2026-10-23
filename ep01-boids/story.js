// EP01 · 鸟群算法 Boids — three rules to sixty thousand birds.
// frame(t) is a pure function of t (sims are re-stepped deterministically), so the headless
// renderer can capture any frame in any order. The last frame equals the first one (loop).
import * as THREE from 'three';
import { TL, S, E, VE, L, LE, chunks, clamp, ease, ease2, lerp, ramp, win, loadSource } from '../core/film.js';
import { Boids2D, DT, rng } from '../core/sims/boids2d.js';
import { GpuFlock, makeBirds, makeField, makeSky, skyUniforms } from '../core/sims/gpuflock.js';
import * as D from './draw2d.js';

const W = 1920, H = 1080, END = TL.duration;
const CK = (id, k, j) => chunks(TL.scenes.find(s => s.id === id).lines[k])[j].start;
const glc = document.querySelector('#gl'), c2 = document.querySelector('#c2d'), ctx = c2.getContext('2d');
let renderer;

// ---------------------------------------------------------------- 3D flocks
const S0 = 45;                    // sim time of the loop frame (first == last frame)
const MURM = {
  tex: 256, G: 40, L: 320, seed: 2024, spread: 3.6,
  center: t => [Math.sin(t * 0.07) * 55, 80 + Math.sin(t * 0.13) * 12, Math.sin(t * 0.05 + 1) * 40],
  radii: [80, 22, 52],
  params: t => ({ radii: [80 * (1 + 0.35 * Math.sin(t * 0.21)), 22 * (1 + 0.4 * Math.sin(t * 0.17 + 2)), 52 * (1 + 0.35 * Math.sin(t * 0.23 + 4))], rho0: 110, wb: 0.9 }),
  predator: t => { const c = MURM.center(t); return { p: [c[0] + 100 * Math.sin(t * 0.29), c[1] + 6 * Math.sin(t * 0.61), c[2] + 70 * Math.sin(t * 0.41 + 1.3)], r: 30, s: 4.0 }; },
  init: () => ({ v: [11, 0, 2] }),
};
const HAWK = {
  tex: 128, G: 32, L: 200, seed: 99,
  center: t => [0, 60 + Math.sin(t * 0.2) * 4, 0],
  radii: [55, 18, 40],
  params: () => ({ maxS: 13, minS: 8 }),
  predator: t => ({ p: hawkPath(t), r: 30, s: 5.5 }),
  init: () => ({ v: [10, 0, 0] }),
};
function hawkPath(t) {
  // swoops through the flock every ~9 s
  const a = t * 0.7;
  return [Math.sin(a) * 120, 60 + Math.cos(a * 2) * 10 - 4, Math.sin(a * 0.5 + 0.6) * 35];
}
const flocks = {};
function flock(name, cfg) { return flocks[name] || (flocks[name] = new GpuFlock(renderer, cfg)); }

class View3D {
  constructor(fl, opts = {}) {
    this.fl = fl;
    this.sky = skyUniforms();
    this.scene = new THREE.Scene();
    this.scene.add(makeSky(this.sky));
    this.cam = new THREE.PerspectiveCamera(opts.fov || 38, W / H, 0.1, 20000);
    this.birds = makeBirds(fl, this.sky, { size: opts.size || 0.55 });
    this.scene.add(this.birds);
    // one highlighted bird + its 7 nearest neighbors
    this.pickF = makeBirds(fl, this.sky, { pick: true, size: 0.72 });
    this.pickN = makeBirds(fl, this.sky, { pick: true, size: 0.62 });
    for (const [m, c] of [[this.pickF, 0xffb35c], [this.pickN, 0x8fe3ff]]) { m.material.uniforms.tint.value.set(c); m.material.uniforms.tintA.value = 1; m.renderOrder = 5; this.scene.add(m); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 4; this.scene.add(this.lines);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300 * 6), 3));
    this.box = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x8fe3ff, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    this.box.frustumCulled = false; this.box.renderOrder = 4; this.scene.add(this.box);
    if (opts.field) { this.field = makeField(fl); this.field.renderOrder = 3; this.scene.add(this.field); }
    if (opts.hawk) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1.2, -2.6, 0, -0.6, 0, 0, -0.4, 0, 0, 1.2, 0, 0, -0.4, 2.6, 0, -0.6, 0, 0, -0.3, -0.5, 0, -1.4, 0.5, 0, -1.4]), 3));
      this.hawk = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff5a4a, side: THREE.DoubleSide }));
      this.hawk.scale.setScalar(1.7); this.scene.add(this.hawk);
      const sp = new THREE.SpriteMaterial({ map: glowTex(), color: 0xff6b5b, transparent: true, blending: THREE.AdditiveBlending, depthTest: false });
      this.hawkGlow = new THREE.Sprite(sp); this.hawkGlow.scale.setScalar(16); this.scene.add(this.hawkGlow);
    }
    this.set({});
  }
  set(o) {
    const u = this.birds.material.uniforms;
    u.morph.value = o.morph ?? 0; u.layout_.value = o.layout ?? 1; u.dim.value = o.dim ?? 0; u.fogD.value = o.fog ?? 0.0016;
    for (const m of [this.pickF, this.pickN]) { m.material.uniforms.morph.value = u.morph.value; m.material.uniforms.dim.value = 1 - (o.pick ?? 0); }
    this.sky.uWater.value = o.water ?? 0; this.sky.uNight.value = 0;
    this.lines.material.opacity = (o.lines ?? 0) * 0.9; this.lines.visible = (o.lines ?? 0) > 0.001;
    this.box.material.opacity = o.box ?? 0; this.box.visible = (o.box ?? 0) > 0.001;
    if (this.field) { this.field.material.uniforms.amp.value = (o.field ?? 0) * 0.32; this.field.visible = (o.field ?? 0) > 0.001; }
    if (o.plane) { u.planeO.value.copy(o.plane.o); u.planeU.value.copy(o.plane.u); u.planeV.value.copy(o.plane.v); }
    if (o.cc) { u.cCenter.value.copy(o.cc); }
  }
  // highlight bird i and its k nearest neighbors (CPU readback)
  focus(i, k = 7) {
    const nb = this.fl.nearest(i, k);
    this.pickF.material.uniforms.ids.value = new Array(8).fill(i);
    this.pickN.material.uniforms.ids.value = [...nb, nb[0]];
    const p = this.fl.position(i), a = this.lines.geometry.attributes.position;
    a.array.fill(0);
    nb.forEach((j, q) => { const pj = this.fl.position(j); a.array.set([p.x, p.y, p.z, pj.x, pj.y, pj.z], q * 6); });
    a.needsUpdate = true; this.lines.geometry.setDrawRange(0, nb.length * 2);
    return { p, nb };
  }
  // 3x3x3 grid cells around bird i + lines to every occupied cell's centroid
  cells(i) {
    const { origin, cell, G } = this.fl.gridInfo(), p = this.fl.position(i);
    const c0 = [0, 1, 2].map(k => Math.floor((p.getComponent(k) - origin.getComponent(k)) / cell));
    const a = this.box.geometry.attributes.position; a.array.fill(0);
    let q = 0;
    const seg = (x0, y0, z0, x1, y1, z1) => { a.array.set([x0, y0, z0, x1, y1, z1], q * 6); q++; };
    const mn = c0.map((c, k) => origin.getComponent(k) + (c - 1) * cell);
    for (let s = 0; s <= 3; s++) for (let r = 0; r <= 3; r++) {
      seg(mn[0], mn[1] + s * cell, mn[2] + r * cell, mn[0] + 3 * cell, mn[1] + s * cell, mn[2] + r * cell);
      seg(mn[0] + s * cell, mn[1], mn[2] + r * cell, mn[0] + s * cell, mn[1] + 3 * cell, mn[2] + r * cell);
      seg(mn[0] + s * cell, mn[1] + r * cell, mn[2], mn[0] + s * cell, mn[1] + r * cell, mn[2] + 3 * cell);
    }
    const g = this.fl.readGrid(), la = this.lines.geometry.attributes.position; la.array.fill(0);
    let m = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = [c0[0] + dx, c0[1] + dy, c0[2] + dz];
      if (c.some(v => v < 0 || v >= G)) continue;
      const px = c[0] + (c[2] % g.TX) * G, py = c[1] + Math.floor(c[2] / g.TX) * G, o = (py * g.w + px) * 4;
      const n = g.buf[o]; if (n < 0.5) continue;
      const w = [0, 1, 2].map(k => origin.getComponent(k) + (c[k] + 0.5 + g.buf[o + 1 + k] / n) * cell);
      la.array.set([p.x, p.y, p.z, ...w], m * 6); m++;
    }
    la.needsUpdate = true; this.lines.geometry.setDrawRange(0, m * 2);
    a.needsUpdate = true; this.box.geometry.setDrawRange(0, q * 2);
    this.pickF.material.uniforms.ids.value = new Array(8).fill(i);
    this.pickN.material.uniforms.ids.value = new Array(8).fill(i);
    return { p, cells: m };
  }
  draw(clip, time) {
    for (const m of [this.birds, this.pickF, this.pickN]) m.material.uniforms.time.value = time;
    this.sky.uTime.value = time;
    renderer.setScissorTest(true);
    renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
    renderer.render(this.scene, this.cam);
    renderer.setScissorTest(false);
  }
}
let glowT;
function glowTex() {
  if (glowT) return glowT;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (glowT = new THREE.CanvasTexture(c));
}

// the loop shot: camera rides next to one bird, looking at it and its neighbors
const OFF = new THREE.Vector3(-4.6, -2.2, 7.4);
function closeCam(cam, p, k = 1) {
  cam.position.copy(p).addScaledVector(OFF, k);
  cam.lookAt(p.x, p.y + 0.9 * k, p.z);
}
function centroid(fl) {
  if (fl._cent && fl._cent.step === fl.stepN) return fl._cent.v;
  const { p } = fl.read(); let x = 0, y = 0, z = 0;
  for (let i = 0; i < fl.N; i++) { x += p[i * 4]; y += p[i * 4 + 1]; z += p[i * 4 + 2]; }
  fl._cent = { step: fl.stepN, v: new THREE.Vector3(x / fl.N, y / fl.N, z / fl.N) };
  return fl._cent.v;
}
// flock centroid smoothed over the last ~2 s (deterministic: re-reads states via a short history)
const cent = fl => { const c = centroid(fl); return [c.x, c.y, c.z]; };
// the focus bird is chosen from the loop state (step S0), identically for every instance
const focusOf = {};
function focusId(fl, key) {
  if (focusOf[key] != null) return focusOf[key];
  const { p } = fl.read(), c = centroid(fl);
  let best = 0, bd = 1e18;
  for (let i = 0; i < fl.N; i++) { const d = (p[i * 4] - c.x) ** 2 + (p[i * 4 + 1] - c.y) ** 2 * 4 + (p[i * 4 + 2] - c.z) ** 2; if (d < bd) { bd = d; best = i; } }
  return (focusOf[key] = best);
}
function wideCam(cam, c, t, dist = 235, yaw = 0) {
  const a = yaw + t * 0.025;
  cam.position.set(c[0] + Math.sin(a) * dist, 22, c[2] + Math.cos(a) * dist);
  cam.lookAt(c[0], c[1] - 6, c[2]);
}

// ---------------------------------------------------------------- 2D sims
const B_RULES = [770, 120, 1880, 910];
const sims = {};
function sim(name, mk) { return sims[name] || (sims[name] = mk()); }
const nearestTo = (s, x, y) => { let b = 0, bd = 1e18; for (let i = 0; i < s.n; i++) { const d = (s.x[i] - x) ** 2 + (s.y[i] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
const R1 = () => sim('r1', () => new Boids2D({ n: 110, seed: 31, bounds: B_RULES, base: { r: 74, sepR: 30, maxSpeed: 120, minSpeed: 70 } }));
const R2 = () => sim('r2', () => new Boids2D({ n: 260, seed: 5, bounds: B_RULES, base: { r: 70, sepR: 26, maxSpeed: 130, minSpeed: 60 } }));
const SC1 = () => sim('sc1', () => new Boids2D({ n: 300, seed: 77, bounds: B_RULES, base: { r: 64, sepR: 40, ws: 2.2, wc: 0.25, wa: 0.6, maxSpeed: 110, minSpeed: 70 } }));
const SC2 = () => sim('sc2', () => new Boids2D({ n: 300, cap: 15000, seed: 78, bounds: [770, 110, 1890, 930], base: { r: 18, sepR: 7, maxSpeed: 95, minSpeed: 50, maxForce: 220, margin: 70 },
  nAt: t => 300 + 14700 * ease(t / 5.5) }));
const HALF = [0, 0, 880, 720];
const TOPO_WARM = 5;
// predator passes (sim time) during the split-screen: one sweep, then a second one back
const predHalf = st => {
  const p1 = L('topo', 1) + 1.2 - S('topo') + TOPO_WARM, out = [];
  for (const [t0, dir] of [[p1, 1], [p1 + 4.2, -1]]) { const u = (st - t0) / 2.0; if (u > 0 && u < 1) out.push({ x: dir > 0 ? -100 + u * 1080 : 980 - u * 1080, y: 360 + Math.sin(u * 6) * 170, r: 220 }); }
  return out;
};
const mkTopo = topo => new Boids2D({ n: 300, seed: 404, bounds: HALF, base: { mode: 'naive', topo, sepMetric: true, k: 7, r: 55, sepR: 24, maxSpeed: 120, minSpeed: 70, margin: 90, pw: 7 },
  params: st => ({ predators: predHalf(st) }),
  init: (R, i) => { const a = R() * 6.283, rr = Math.sqrt(R()) * 150; return [440 + Math.cos(a) * rr * 1.5, 360 + Math.sin(a) * rr, 110 + R() * 20, (R() - 0.5) * 40]; } });
const TM = () => sim('tm', () => mkTopo(false));
const TT = () => sim('tt', () => mkTopo(true));

// steering vignettes (tiny deterministic agents)
const CELLS = [[800, 120, 520, 375], [1350, 120, 520, 375], [800, 515, 520, 375], [1350, 515, 520, 375]];
const LAB4 = [['寻找', 'SEEK'], ['逃离', 'FLEE'], ['徘徊', 'WANDER'], ['避障', 'AVOID']];
const OBST = [[150, 120, 42], [330, 230, 50], [230, 300, 28], [420, 100, 30]];
function steerTo(vx, vy, dx, dy, ms, mf) {
  const d = Math.hypot(dx, dy) || 1; let fx = dx / d * ms - vx, fy = dy / d * ms - vy; const f = Math.hypot(fx, fy);
  if (f > mf) { fx *= mf / f; fy *= mf / f; } return [fx, fy];
}
function agents(kind, tt) {
  const R = rng(kind * 13 + 3), ms = 150, mf = 200;
  let x = 260, y = 190, vx = 90, vy = -30, wa = 0;
  const trail = [];
  const target = t => [260 + Math.cos(t * 0.9) * 170, 190 + Math.sin(t * 1.7) * 110];
  const steps = Math.round(tt * 60);
  let F = [0, 0], tg = target(0);
  for (let s = 0; s <= steps; s++) {
    const t = s * DT;
    tg = target(t);
    if (kind === 0) F = steerTo(vx, vy, tg[0] - x, tg[1] - y, ms, mf);
    if (kind === 1) { F = steerTo(vx, vy, x - tg[0], y - tg[1], ms, mf * 1.2); }
    if (kind === 2) { wa += (R() - 0.5) * 0.9; const d = Math.hypot(vx, vy) || 1, cx = x + vx / d * 60, cy = y + vy / d * 60; tg = [cx + Math.cos(wa) * 32, cy + Math.sin(wa) * 32]; F = steerTo(vx, vy, tg[0] - x, tg[1] - y, ms * 0.8, mf * 0.6); }
    if (kind === 3) {
      tg = [260 + Math.cos(t * 0.6) * 200, 190 + Math.sin(t * 0.6) * 130];
      F = steerTo(vx, vy, tg[0] - x, tg[1] - y, ms, mf * 0.6);
      const d = Math.hypot(vx, vy) || 1;
      for (const [ox, oy, orr] of OBST) {
        const ax = ox - x, ay = oy - y, along = (ax * vx + ay * vy) / d, side = (ax * -vy + ay * vx) / d;
        if (along > 0 && along < 110 && Math.abs(side) < orr + 18) { const k = (1 - along / 110) * 520 * (side > 0 ? -1 : 1); F[0] += -vy / d * k; F[1] += vx / d * k; }
      }
    }
    // walls of the vignette
    const m = 50, wl = 420;
    if (x < m) F[0] += wl * (1 - x / m); if (x > 520 - m) F[0] -= wl * (1 - (520 - x) / m);
    if (y < m) F[1] += wl * (1 - y / m); if (y > 375 - m) F[1] -= wl * (1 - (375 - y) / m);
    vx += F[0] * DT; vy += F[1] * DT;
    const sp = Math.hypot(vx, vy), cs = Math.min(ms, Math.max(60, sp)); vx *= cs / sp; vy *= cs / sp;
    x += vx * DT; y += vy * DT;
    if (s % 3 === 0) trail.push([x, y]);
  }
  return { x, y, vx, vy, tg, F, trail: trail.slice(-70), wa };
}

// ---------------------------------------------------------------- shots & transitions
// Each shot draws itself inside a horizontal clip [x0, x1]; a wipe shows the new shot on the left.
const shots = [];
const events = [];
function shot(t0, draw, o = {}) { shots.push({ t0, draw, wipe: o.wipe || 0, labA: o.labA, labB: o.labB, dissolve: o.dissolve || 0 }); }
function activeShots(t) {
  let i = 0; while (i + 1 < shots.length && shots[i + 1].t0 <= t) i++;
  const cur = shots[i], prev = shots[i - 1];
  if (prev && cur.wipe && t < cur.t0 + cur.wipe) return { cur, prev, u: ease2((t - cur.t0) / cur.wipe) };
  if (prev && cur.dissolve && t < cur.t0 + cur.dissolve) return { cur, prev, a: ease((t - cur.t0) / cur.dissolve) };
  return { cur };
}

let FOOT = null, FRAME = null;
const CLIPS = { a: { dir: 'media/starling_a', fps: 30, count: 420 }, b: { dir: 'media/starling_b', fps: 30, count: 300 }, gdc: { dir: 'media/gdc_abzu', fps: 30, count: 325 } };

let V = {};   // 3D views
function build() {
  V.hero = new View3D(flock('hero', MURM), { size: 0.75 });
  V.hawk = new View3D(flock('hawk', HAWK), { hawk: true, size: 0.6 });
  V.main = new View3D(flock('main', MURM), { field: true, size: 0.75 });
  V.fin = new View3D(flock('fin', MURM), { size: 0.75 });
  const iS = S('intro'), fS = S('bridge');

  // ---- intro: one bird → real murmuration → simulated murmuration
  const footIn = L('intro', 1) - 0.5, simIn = CK('intro', 2, 1) - 0.35;
  shot(0, (clip, t) => heroShot(V.hero, t, clip));
  shot(footIn, (clip, t) => { FOOT = { clip: CLIPS.a, t: t - footIn + 0.0, clipX: clip }; }, { dissolve: 1.0 });
  shot(simIn, (clip, t) => heroShot(V.hero, t, clip), { wipe: 1.3, labA: ['实拍 · 土耳其', 'REAL FOOTAGE'], labB: ['模拟 · 三条规则', 'SIMULATION · 3 RULES'] });
  // ---- rules
  shot(S('rules'), (clip, t) => rulesA(t, clip), { wipe: 1.0 });
  shot(CK('rules', 5, 1) - 0.2, (clip, t) => rulesB(t, clip), { wipe: 0.9, labA: ['一只鸟的视角', 'ONE BOID'], labB: ['随机起点', 'FROM NOISE'] });
  // ---- steering
  shot(S('steer'), (clip, t) => steerA(t, clip), { wipe: 1.0 });
  shot(L('steer', 2) - 0.3, (clip, t) => hawkShot(t, clip), { wipe: 1.1, labA: ['转向向量', 'STEERING'], labB: ['加入一只鹰', '+ FLEE'] });
  // ---- scale
  shot(S('scale'), (clip, t) => scaleA(t, clip), { wipe: 1.0 });
  shot(L('scale', 3) - 0.2, (clip, t) => scaleB(t, clip), { wipe: 0.9, labA: ['300 只', '300 BOIDS'], labB: ['15,000 只', 'SPATIAL GRID'] });
  // ---- topology
  shot(S('topo'), (clip, t) => { FOOT = { clip: CLIPS.b, t: t - S('topo'), clipX: clip }; }, { wipe: 1.0 });
  shot(L('topo', 1) - 0.4, (clip, t) => topoShot(t, clip), { wipe: 1.0, labA: ['真实椋鸟', 'REAL STARLINGS'], labB: ['距离 vs 拓扑', 'METRIC vs TOPOLOGICAL'] });
  // ---- gpu
  shot(S('gpu'), (clip, t) => gpuShot(t, clip), { wipe: 1.0 });
  // ---- bridge → gdc → final (one continuous sim that ends on the loop state)
  shot(fS, (clip, t) => finShot(t, clip), { wipe: 1.2, labA: ['GPU 场', 'GPU FIELD'], labB: ['下一站', 'NEXT'] });
  for (const s of shots) if (s.t0 > 0.05 && (s.wipe || s.dissolve)) events.push({ t: +s.t0.toFixed(3), wipe: s.wipe || s.dissolve * 0.6 });
  events.push({ t: +(S('gdc') - 0.3).toFixed(3), wipe: 0.8 }, { t: +(E('gdc') - 0.2).toFixed(3), wipe: 0.8 });
}

// ---------------------------------------------------------------- 3D shots
function heroShot(v, t, clip) {
  const fl = v.fl;
  fl.advanceTo((S0 + t) * 60);
  const id = focusId(fl, 'loop');
  const f = v.focus(id);
  const pull = ease(ramp(t, 0.6, L('intro', 1) + 0.6)) ;
  // close on one bird → pull back; later (wide) orbit the murmuration
  const wideT = CK('intro', 2, 1) - 0.4;
  if (t < wideT) {
    closeCam(v.cam, f.p, 1 + pull * pull * 4.5);
    v.set({ lines: 1 - ramp(t, L('intro', 1) - 0.4, L('intro', 1) + 0.6), pick: 1 - ramp(t, L('intro', 1), L('intro', 1) + 1.0) });
  } else {
    wideCam(v.cam, cent(fl), t - wideT, 240, -0.4);
    v.set({});
  }
  v.draw(clip, S0 + t);
}
function hawkShot(t, clip) {
  const v = V.hawk, fl = v.fl, t0 = L('steer', 2) - 0.3, st = 20 + (t - t0);
  fl.advanceTo(st * 60);
  const c = cent(fl);
  const a = 0.5 + (t - t0) * 0.03;
  v.cam.position.set(Math.sin(a) * 150, 40, Math.cos(a) * 150); v.cam.lookAt(c[0], c[1], c[2]);
  const hp = hawkPath(st), hn = hawkPath(st + 0.05);
  v.hawk.position.set(...hp); v.hawk.lookAt(...hn); v.hawkGlow.position.set(...hp);
  v.set({ fog: 0.0022 });
  v.draw(clip, st);
}
function gpuShot(t, clip) {
  const v = V.main, fl = v.fl, t0 = S('gpu'), st = 32 + (t - t0);
  fl.advanceTo(st * 60);
  const c = cent(fl), cv = new THREE.Vector3(...c);
  const l1 = L('gpu', 1), l2 = L('gpu', 2), l3 = L('gpu', 3);
  // texture plane: one texel per bird, facing a fixed camera
  const plane = { o: new THREE.Vector3(c[0] - 48, c[1] + 4, c[2]), u: new THREE.Vector3(84, 0, 0), v: new THREE.Vector3(0, 84, 0) };
  const lay = ease(ramp(t, CK('gpu', 0, 1) + 1.6, l1 + 0.8));
  const field = win(t, l1 + 0.3, l2 + 0.6, 1.0, 0.8);
  const box = win(t, l2 + 0.2, l3 + 0.2, 0.6, 0.6);
  const camA = { p: new THREE.Vector3(c[0] - 10, c[1] + 2, c[2] + 175), l: new THREE.Vector3(c[0] - 10, c[1] + 2, c[2]) };
  const a = (t - t0) * 0.05;
  const camB = { p: new THREE.Vector3(c[0] + Math.sin(a + 0.6) * 230, 26, c[2] + Math.cos(a + 0.6) * 230), l: new THREE.Vector3(c[0], c[1] - 4, c[2]) };
  let cam = camA;
  const bl = ease(ramp(t, CK('gpu', 0, 1) + 1.8, l1 + 1.4));
  cam = { p: camA.p.clone().lerp(camB.p, bl), l: camA.l.clone().lerp(camB.l, bl) };
  let focus = null;
  if (box > 0.001) {
    const id = focusId(fl, 'gpu-' + Math.floor(l2));
    focus = v.cells(id);
    const near = { p: focus.p.clone().add(new THREE.Vector3(-46, -20, 62)), l: focus.p.clone().add(new THREE.Vector3(0, 6, 0)) };
    const k = ease(ramp(t, l2 - 0.2, l2 + 1.2)) * (1 - ease(ramp(t, l3 - 0.4, l3 + 1.0)));
    cam = { p: cam.p.clone().lerp(near.p, k), l: cam.l.clone().lerp(near.l, k) };
  }
  v.cam.position.copy(cam.p); v.cam.lookAt(cam.l);
  v.set({ layout: lay, plane, cc: cv, field, box: box * 0.85, lines: box, pick: box, dim: Math.max(field * 0.6, box * 0.5) });
  v.draw(clip, st);
  return { focus };
}
function finShot(t, clip) {
  const v = V.fin, fl = v.fl, st = S0 - (END - t);
  fl.advanceTo(st * 60);
  const c = cent(fl);
  const fS = S('bridge'), mIn = L('bridge', 1), back = L('final', 1) - 0.8;
  const water = ease(ramp(t, mIn - 0.2, mIn + 2.6)) * (1 - ease(ramp(t, back, back + 2.2)));
  const morph = ease(ramp(t, mIn + 0.2, mIn + 2.4)) * (1 - ease(ramp(t, back - 0.2, back + 1.8)));
  // wide orbit → dive inside the school → back out to the single bird of frame 0
  const a = -1.2 + (t - fS) * 0.035;
  const dist = lerp(240, 120, ease(ramp(t, mIn, mIn + 4)));
  v.cam.position.set(c[0] + Math.sin(a) * dist, lerp(22, c[1] - 10, ease(ramp(t, mIn, mIn + 4))), c[2] + Math.cos(a) * dist);
  v.cam.lookAt(c[0], c[1] - 6, c[2]);
  const id = focusId(fl, 'loop');
  let lines = 0, pick = 0;
  const fly0 = back + 0.4, fly1 = END - 0.7;
  if (t > fly0 - 0.1) {
    const f = v.focus(id);
    const k = ease2(ramp(t, fly0, fly1));
    const far = v.cam.position.clone(), farL = new THREE.Vector3(c[0], c[1] - 6, c[2]);
    const tmp = new THREE.PerspectiveCamera(); closeCam(tmp, f.p, 1);
    v.cam.position.lerpVectors(far, tmp.position, k);
    const look = farL.clone().lerp(new THREE.Vector3(f.p.x, f.p.y + 0.9, f.p.z), Math.min(1, k * 1.15));
    v.cam.lookAt(look);
    if (k >= 1) closeCam(v.cam, f.p, 1);
    lines = ease(ramp(t, fly1 - 1.6, fly1)); pick = ease(ramp(t, fly1 - 2.2, fly1 - 0.6));
  }
  v.set({ morph, water, fog: lerp(0.0016, 0.0055, water), lines, pick, dim: S('gdc') <= t && t < E('gdc') ? 0.15 : 0 });
  v.draw(clip, st);
}

// ---------------------------------------------------------------- 2D shots
function rulesA(t, clip) {
  const s = R1(), t0 = S('rules');
  s.advanceTo((t - t0 + 8) * 60);
  if (sims.r1focus == null) { s.advanceTo(8 * 60); sims.r1focus = nearestTo(s, 1330, 500); s.advanceTo((t - t0 + 8) * 60); }
  const i = sims.r1focus;
  D.bg(ctx, clip, 'night');
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  const z = ease(ramp(t, L('rules', 1) - 0.2, L('rules', 1) + 1.2)) * (1 - ease(ramp(t, L('rules', 5) - 0.1, L('rules', 5) + 1.0)));
  const fv = D.focusView(s.x[i], s.y[i], 1330, 500, 2.1);
  const v = D.view(lerp(0, fv.ox, z), lerp(0, fv.oy, z), lerp(1, 2.1, z));
  const info = s.inspect(i), nbs = new Set(info.nb);
  const showNb = z > 0.02;
  D.boids(ctx, s, v, { alpha: showNb ? lerp(0.85, 0.35, z) : 0.85, skip: showNb ? new Set([i, ...nbs]) : null });
  if (showNb) {
    const X = s.x[i] * v.s + v.ox, Y = s.y[i] * v.s + v.oy, p = s.p;
    D.circle(ctx, X, Y, p.r * v.s, { stroke: 'rgba(255,255,255,0.55)', w: 2, dash: [8, 8], alpha: z, fill: 'rgba(90,209,255,0.05)' });
    D.lines(ctx, info.nb.map(j => [X, Y, v.X(s.x[j]), v.Y(s.y[j])]), 'rgba(160,220,255,0.6)', 1.2, z * 0.7);
    for (const j of info.nb) D.boid(ctx, v.X(s.x[j]), v.Y(s.y[j]), Math.atan2(s.vy[j], s.vx[j]), 9 * Math.sqrt(v.s), '#cfeaff');
    const k = 0.22 * v.s, f = info.f;
    const a2 = win(t, L('rules', 2) - 0.1, L('rules', 5) + 0.3, 0.5, 0.5), a3 = win(t, L('rules', 3) - 0.1, L('rules', 5) + 0.3, 0.5, 0.5), a4 = win(t, L('rules', 4) - 0.1, L('rules', 5) + 0.3, 0.5, 0.5);
    if (a2 > 0) {
      D.circle(ctx, X, Y, p.sepR * v.s, { stroke: D.COL.sep, w: 2, dash: [5, 6], alpha: a2 * 0.8 });
      for (const j of info.nb) { const dx = s.x[i] - s.x[j], dy = s.y[i] - s.y[j], d = Math.hypot(dx, dy); if (d < p.sepR) D.arrow(ctx, X, Y, X + dx / d * 46, Y + dy / d * 46, D.COL.sep, 2, 9, a2 * 0.7); }
      D.arrow(ctx, X, Y, X + f.sep[0] * k, Y + f.sep[1] * k, D.COL.sep, 4.5, 15, a2);
    }
    if (a3 > 0) {
      for (const j of info.nb) D.arrow(ctx, v.X(s.x[j]), v.Y(s.y[j]), v.X(s.x[j]) + s.vx[j] * 0.28, v.Y(s.y[j]) + s.vy[j] * 0.28, D.COL.ali, 2, 8, a3 * 0.65);
      D.arrow(ctx, X, Y, X + f.ali[0] * k, Y + f.ali[1] * k, D.COL.ali, 4.5, 15, a3);
    }
    if (a4 > 0 && info.nb.length) {
      const cx = info.nb.reduce((a, j) => a + s.x[j], 0) / info.nb.length, cy = info.nb.reduce((a, j) => a + s.y[j], 0) / info.nb.length;
      const CX = v.X(cx), CY = v.Y(cy);
      D.circle(ctx, CX, CY, 9, { fill: D.COL.coh, alpha: a4 }); D.circle(ctx, CX, CY, 18, { stroke: D.COL.coh, w: 2, alpha: a4 * 0.6 });
      D.lines(ctx, [[X, Y, CX, CY]], D.COL.coh, 1.5, a4 * 0.5);
      D.arrow(ctx, X, Y, X + f.coh[0] * k, Y + f.coh[1] * k, D.COL.coh, 4.5, 15, a4);
    }
    const a5 = win(t, CK('rules', 5, 0) - 0.1, CK('rules', 5, 1) + 0.2, 0.4, 0.3);
    if (a5 > 0) D.arrow(ctx, X, Y, X + f.ax * k * 0.55, Y + f.ay * k * 0.55, '#ffffff', 5, 17, a5);
    D.boid(ctx, X, Y, Math.atan2(s.vy[i], s.vx[i]), 11 * Math.sqrt(v.s), '#ffb35c', 18);
  }
  ctx.restore();
  // rule labels near the focus boid
  const lab = [];
  const rl = [[2, '分离', 'SEPARATION', D.COL.sep], [3, '对齐', 'ALIGNMENT', D.COL.ali], [4, '聚合', 'COHESION', D.COL.coh]];
  rl.forEach(([k, zh, en, c], q) => lab.push({ x: 1700, y: 300 + q * 70, zh, en, color: c, o: win(t, L('rules', k) - 0.1, L('rules', 5) + 0.3, 0.4, 0.4) * (t >= L('rules', k) - 0.1 ? 1 : 0) }));
  lab.push({ x: 1700, y: 510, zh: '= 转向', en: 'STEERING', color: '#fff', o: win(t, CK('rules', 5, 0) - 0.1, CK('rules', 5, 1), 0.4, 0.3) });
  lab.push({ x: 1330, y: 500 - 78 * 2.1 - 26, zh: '感知半径', en: 'PERCEPTION RADIUS', plain: true, o: win(t, L('rules', 1) + 0.6, L('rules', 2) + 0.2, 0.5, 0.5) });
  return { labels: lab };
}
function rulesB(t, clip) {
  const s = R2(), t0 = CK('rules', 5, 1) - 0.2;
  s.advanceTo((t - t0) * 60);
  const bat = ease(ramp(t, L('rules', 6) - 0.3, L('rules', 6) + 0.9));
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  D.bg(ctx, clip, 'night');
  if (bat > 0) { ctx.globalAlpha = bat; D.bg(ctx, clip, 'bats'); ctx.globalAlpha = 1; }
  const v = D.view();
  if (bat < 1) D.boids(ctx, s, v, { alpha: 0.88 * (1 - bat) });
  if (bat > 0) D.bats(ctx, s, v, t, { alpha: bat, size: 13 });
  ctx.restore();
  return {};
}
function steerA(t, clip) {
  const t0 = S('steer'), tt = Math.min(t, L('steer', 1) + 0.6) - t0;
  D.bg(ctx, clip, 'night');
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  const z = ease(ramp(t, L('steer', 1) - 0.4, L('steer', 1) + 0.8));
  const labels = [];
  CELLS.forEach(([cx, cy, cw, ch], k) => {
    const big = [800, 120, 1080, 780];
    let rx = cx, ry = cy, s = 1, o = 1;
    if (k === 0) { rx = lerp(cx, big[0], z); ry = lerp(cy, big[1], z); s = lerp(1, big[2] / cw, z); }
    else o = 1 - z;
    if (o <= 0.01) return;
    const ag = agents(k, tt + 2);
    ctx.save(); ctx.globalAlpha = o;
    D.panel(ctx, rx, ry, cw * s, ch * s * (k === 0 ? lerp(1, 780 / 375 / s, z) : 1), 0.55);
    ctx.beginPath(); ctx.rect(rx, ry, cw * s, k === 0 ? lerp(ch, 780, z) : ch); ctx.clip();
    const X = x => rx + x * s, Y = y => ry + y * s;
    if (k === 3) for (const [ox, oy, orr] of OBST) D.circle(ctx, X(ox), Y(oy), orr * s, { fill: 'rgba(255,107,107,0.18)', stroke: 'rgba(255,107,107,0.7)', w: 2 });
    ctx.globalAlpha = o * 0.5;
    D.lines(ctx, ag.trail.slice(1).map((p, q) => [X(ag.trail[q][0]), Y(ag.trail[q][1]), X(p[0]), Y(p[1])]), '#5ad1ff', 2, 1);
    ctx.globalAlpha = o;
    if (k === 0) { D.circle(ctx, X(ag.tg[0]), Y(ag.tg[1]), 9 * Math.sqrt(s), { fill: '#7be3b5' }); D.circle(ctx, X(ag.tg[0]), Y(ag.tg[1]), 20 * Math.sqrt(s), { stroke: '#7be3b5', w: 2, alpha: 0.5 }); }
    if (k === 1) { D.circle(ctx, X(ag.tg[0]), Y(ag.tg[1]), 10, { fill: '#ff6b6b' }); D.circle(ctx, X(ag.tg[0]), Y(ag.tg[1]), 60, { stroke: '#ff6b6b', w: 1.5, dash: [5, 6], alpha: 0.5 }); }
    if (k === 2) { const d = Math.hypot(ag.vx, ag.vy), cx2 = ag.x + ag.vx / d * 60, cy2 = ag.y + ag.vy / d * 60; D.circle(ctx, X(cx2), Y(cy2), 32, { stroke: 'rgba(255,255,255,0.5)', w: 1.5, dash: [4, 5] }); D.circle(ctx, X(ag.tg[0]), Y(ag.tg[1]), 5, { fill: '#ffb35c' }); }
    if (k === 3) { const d = Math.hypot(ag.vx, ag.vy); D.lines(ctx, [[X(ag.x), Y(ag.y), X(ag.x + ag.vx / d * 110), Y(ag.y + ag.vy / d * 110)]], '#ffffff', 1.5, 0.5); }
    D.boid(ctx, X(ag.x), Y(ag.y), Math.atan2(ag.vy, ag.vx), 13 * Math.sqrt(s), '#ffb35c', 14);
    if (k === 0 && z > 0.02) {
      // frozen moment: velocity (cyan), desired toward the target (white), steering = desired - velocity (amber)
      const fz = agents(0, L('steer', 1) - 0.4 - t0 + 2), ax = 1240, ay = 560;
      const sp = Math.hypot(fz.vx, fz.vy), ux = fz.vx / sp, uy = fz.vy / sp, an = -1.25;
      const dx = Math.cos(an) * ux - Math.sin(an) * uy, dy = Math.sin(an) * ux + Math.cos(an) * uy;
      const L0 = 240, tx = ax + dx * 470, ty = ay + dy * 470;
      ctx.save(); ctx.globalAlpha = z;
      ctx.fillStyle = 'rgba(7,10,18,0.9)'; ctx.fillRect(800, 120, 1080, 780);
      D.circle(ctx, tx, ty, 13, { fill: '#7be3b5' }); D.circle(ctx, tx, ty, 30, { stroke: '#7be3b5', w: 2, alpha: 0.5 });
      D.text(ctx, '目标 target', tx + 40, ty, { font: '600 18px "PingFang SC"', color: '#7be3b5' });
      // predicted path bending toward the target
      const g = ease(ramp(t, L('steer', 1) + 1.2, L('steer', 1) + 3.2));
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,179,92,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
      let px = ax, py = ay, vx = ux * 150, vy = uy * 150;
      ctx.moveTo(px, py);
      for (let q = 0; q < 90 * g; q++) { const f = steerTo(vx, vy, tx - px, ty - py, 150, 160); vx += f[0] / 60; vy += f[1] / 60; px += vx / 60 * 1.6; py += vy / 60 * 1.6; ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
      const a1 = ease(ramp(t, L('steer', 1) - 0.2, L('steer', 1) + 0.4)), a2 = ease(ramp(t, L('steer', 1) + 0.4, L('steer', 1) + 1.0)), a3 = ease(ramp(t, L('steer', 1) + 1.0, L('steer', 1) + 1.6));
      D.arrow(ctx, ax, ay, ax + ux * L0, ay + uy * L0, D.COL.vel, 5, 18, a1);
      D.arrow(ctx, ax, ay, ax + dx * L0, ay + dy * L0, '#ffffff', 4, 18, a2);
      D.arrow(ctx, ax + ux * L0, ay + uy * L0, ax + dx * L0, ay + dy * L0, D.COL.str, 6, 20, a3);
      D.boid(ctx, ax, ay, Math.atan2(uy, ux), 26, '#ffb35c', 20);
      ctx.restore();
      labels.push({ x: ax + ux * L0 * 1.28, y: ay + uy * L0 * 1.28, zh: '当前速度', en: 'velocity', color: D.COL.vel, plain: true, o: a1 * z });
      labels.push({ x: ax + dx * L0 * 1.05 - dy * 95, y: ay + dy * L0 * 1.05 + dx * 95, zh: '期望速度', en: 'desired = 指向目标 × 最大速度', color: '#fff', plain: true, o: a2 * z });
      labels.push({ x: ax + (ux + dx) * L0 * 0.5 + (ux - dx) * 0 + 150, y: ay + (uy + dy) * L0 * 0.5 + 40, zh: '转向 = 期望 − 当前', en: 'steering force', color: D.COL.str, plain: true, o: a3 * z });
    }
    ctx.restore();
    labels.push({ x: rx + 70 + (k === 0 ? 0 : 0), y: ry + 30, zh: LAB4[k][0], en: LAB4[k][1], plain: true, o: o * (k === 0 ? 1 - z * 0.4 : 1) });
  });
  ctx.restore();
  return { labels };
}
function scaleA(t, clip) {
  const s = SC1(), t0 = S('scale');
  s.advanceTo((t - t0 + 6) * 60);
  if (sims.scfocus == null) { const st = s.stepN; s.advanceTo(6 * 60); sims.scfocus = nearestTo(s, 1320, 520); s.advanceTo(st); }
  const i = sims.scfocus, v = D.view();
  D.bg(ctx, clip, 'night');
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  const l1 = L('scale', 1), l2 = L('scale', 2);
  const all = win(t, S('scale') + 0.6, l1 + 0.4, 0.6, 0.6);
  const web = win(t, l1 - 0.1, l2 + 0.2, 0.8, 0.6);
  const grid = ease(ramp(t, l2 - 0.1, l2 + 0.8));
  if (web > 0) {
    const segs = []; const m = Math.min(s.n, 150);
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) segs.push([s.x[a], s.y[a], s.x[b], s.y[b]]);
    D.lines(ctx, segs, '#ff6b6b', 0.6, web * 0.10);
  }
  if (grid > 0) {
    const cell = s.p.r, gx0 = Math.ceil(770 / cell) * cell;
    ctx.save(); ctx.globalAlpha = grid * 0.32; ctx.strokeStyle = '#8fb4ff'; ctx.lineWidth = 1; ctx.beginPath();
    const g0x = s.grid ? s.grid.gx0 : 0, g0y = s.grid ? s.grid.gy0 : 0;
    for (let x = g0x; x < 1920; x += cell) if (x > 760) { ctx.moveTo(x, 110); ctx.lineTo(x, 920); }
    for (let y = g0y; y < 1080; y += cell) if (y > 100 && y < 930) { ctx.moveTo(770, y); ctx.lineTo(1890, y); }
    ctx.stroke(); ctx.restore();
    if (s.grid) {
      const { cell: c, gx0: ox, gy0: oy } = s.grid, cx = Math.floor((s.x[i] - ox) / c), cy = Math.floor((s.y[i] - oy) / c);
      ctx.save(); ctx.globalAlpha = grid; ctx.fillStyle = 'rgba(123,227,181,0.13)'; ctx.strokeStyle = '#7be3b5'; ctx.lineWidth = 2;
      ctx.fillRect(ox + (cx - 1) * c, oy + (cy - 1) * c, 3 * c, 3 * c); ctx.strokeRect(ox + (cx - 1) * c, oy + (cy - 1) * c, 3 * c, 3 * c); ctx.restore();
    }
  }
  const info = s.inspect(i);
  const X = s.x[i], Y = s.y[i];
  if (all > 0) {
    const segs = []; for (let j = 0; j < s.n; j++) if (j !== i) segs.push([X, Y, s.x[j], s.y[j]]);
    D.lines(ctx, segs, '#ffb35c', 1, all * 0.32);
  }
  if (grid > 0) {
    s.p.mode = 'grid'; const gi = s.inspect(i);
    D.lines(ctx, gi.cand.filter(j => j !== i).map(j => [X, Y, s.x[j], s.y[j]]), '#7be3b5', 1.4, grid * 0.8);
  }
  D.boids(ctx, s, v, { alpha: 0.85, skip: new Set([i]) });
  D.boid(ctx, X, Y, Math.atan2(s.vy[i], s.vx[i]), 12, '#ffb35c', 18);
  ctx.restore();
  // chart: checks per frame vs N (log-log)
  const ch = win(t, l1 + 0.3, VE('scale') + 1, 0.6, 0.6);
  if (ch > 0) chart(t, ch, grid);
  return {};
}
function chart(t, o, grid) {
  const x0 = 1300, y0 = 140, w = 560, h = 340;
  D.panel(ctx, x0, y0, w, h, o);
  const px = n => x0 + 70 + (Math.log10(n) - 1) / 4 * (w - 110), py = c => y0 + h - 50 - (Math.log10(c) - 1) / 8 * (h - 90);
  ctx.save(); ctx.globalAlpha = o;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let e = 1; e <= 5; e++) { ctx.moveTo(px(10 ** e), y0 + 40); ctx.lineTo(px(10 ** e), y0 + h - 50); }
  for (let e = 1; e <= 9; e += 2) { ctx.moveTo(x0 + 70, py(10 ** e)); ctx.lineTo(x0 + w - 40, py(10 ** e)); }
  ctx.stroke();
  for (let e = 1; e <= 5; e++) D.text(ctx, e === 1 ? '10' : e === 2 ? '100' : e === 3 ? '1k' : e === 4 ? '10k' : '100k', px(10 ** e), y0 + h - 30, { font: '13px "SF Mono", Menlo', color: '#8fa1b6', align: 'center' });
  for (let e = 1; e <= 9; e += 2) D.text(ctx, '1e' + e, x0 + 58, py(10 ** e), { font: '12px "SF Mono", Menlo', color: '#8fa1b6', align: 'right' });
  D.text(ctx, '每帧比较次数  checks / frame', x0 + 24, y0 + 22, { font: '600 15px "PingFang SC"', color: '#dbe4ee' });
  D.text(ctx, 'N', x0 + w - 28, y0 + h - 30, { font: '13px "SF Mono"', color: '#8fa1b6' });
  const u = ease(ramp(t, L('scale', 1), L('scale', 1) + 2.4));
  const curve = (f, col, uu) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath(); for (let q = 0; q <= 60 * uu; q++) { const n = 10 ** (1 + q / 60 * 4); const y = py(Math.max(10, f(n))); q ? ctx.lineTo(px(n), y) : ctx.moveTo(px(n), y); } ctx.stroke(); ctx.shadowBlur = 0; };
  curve(n => n * n, '#ff6b6b', u);
  D.text(ctx, 'n²  逐一比较', px(1e5) - 30, py(1e9) - 4, { font: '600 15px "PingFang SC"', color: '#ff6b6b', align: 'right', alpha: u });
  const m1 = win(t, CK('scale', 1, 0) + 1.0, 1e9, 0.4, 0.1), m2 = win(t, CK('scale', 1, 1), 1e9, 0.4, 0.1);
  for (const [n, a, txt] of [[1000, m1, '1,000 → 1,000,000'], [10000, m2, '10,000 → 100,000,000']]) {
    if (a <= 0) continue;
    D.circle(ctx, px(n), py(n * n), 7, { fill: '#fff', alpha: a });
    D.text(ctx, txt, px(n) - 14, py(n * n) - 20, { font: '600 14px "SF Mono"', color: '#fff', align: 'right', alpha: a });
  }
  if (grid > 0) {
    curve(n => n * 27, '#7be3b5', grid);
    D.text(ctx, '≈ n  空间网格', px(1e5) - 30, py(27e5) + 22, { font: '600 15px "PingFang SC"', color: '#7be3b5', align: 'right', alpha: grid });
  }
  ctx.restore();
}
function scaleB(t, clip) {
  const s = SC2(), t0 = L('scale', 3) - 0.2;
  s.advanceTo((t - t0) * 60);
  D.bg(ctx, clip, 'night');
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  D.boids(ctx, s, D.view(), { size: 4.2, alpha: 0.85 });
  ctx.restore();
  return { n: s.n, checks: s.checks };
}
const NCOL = c => c === 0 ? '#ff4d4d' : c < 5 ? '#ff9a52' : c < 10 ? '#e6eefa' : c < 20 ? '#8fd0ff' : '#3f8cff';
function topoShot(t, clip) {
  const st = (t - S('topo') + TOPO_WARM) * 60;
  const A = TM(), B = TT();
  A.advanceTo(st); B.advanceTo(st);
  D.bg(ctx, clip, 'night');
  ctx.save(); ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip();
  const out = {};
  [[A, 40, 'm'], [B, 1000, 't']].forEach(([s, ox, key]) => {
    const v = D.view(ox, 190, 1);
    if (sims['f' + key] == null) sims['f' + key] = nearestTo(s, 440, 360);
    const i = sims['f' + key];
    const info = s.inspect(i), X = v.X(s.x[i]), Y = v.Y(s.y[i]);
    for (const pr of s.p.predators) { D.circle(ctx, v.X(pr.x), v.Y(pr.y), pr.r, { fill: 'rgba(255,90,74,0.06)', stroke: 'rgba(255,90,74,0.4)', w: 1.5, dash: [6, 6] }); D.circle(ctx, v.X(pr.x), v.Y(pr.y), 13, { fill: '#ff5a4a' }); }
    // neighbor count of every bird: metric varies with density, topological is always k
    const cnt = new Int32Array(s.n), r2 = s.p.r * s.p.r;
    if (key === 'm') for (let a = 0; a < s.n; a++) for (let b = a + 1; b < s.n; b++) { const dx = s.x[a] - s.x[b], dy = s.y[a] - s.y[b]; if (dx * dx + dy * dy < r2) { cnt[a]++; cnt[b]++; } }
    else cnt.fill(7);
    const buckets = new Map();
    for (let q = 0; q < s.n; q++) { if (q === i) continue; const c = NCOL(cnt[q]); if (!buckets.has(c)) buckets.set(c, new Set()); buckets.get(c).add(q); }
    for (const [c, set] of buckets) { const skip = new Set(); for (let q = 0; q < s.n; q++) if (!set.has(q)) skip.add(q); D.boids(ctx, s, v, { alpha: 0.92, color: c, skip }); }
    if (key === 'm') D.circle(ctx, X, Y, s.p.r, { stroke: 'rgba(255,255,255,0.6)', w: 2, dash: [7, 7] });
    D.lines(ctx, info.nb.map(j => [X, Y, v.X(s.x[j]), v.Y(s.y[j])]), '#ffc46b', 1.6, 0.85);
    D.boid(ctx, X, Y, Math.atan2(s.vy[i], s.vx[i]), 12, '#ffb35c', 16);
    let mn = 1e9, mx = 0, lost = 0; for (let q = 0; q < s.n; q++) { mn = Math.min(mn, cnt[q]); mx = Math.max(mx, cnt[q]); if (!cnt[q]) lost++; }
    out[key] = { mn, mx, lost, nb: info.nb.length };
  });
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(959, 150, 2, 760);
  // legend
  const lg = [['#ff4d4d', '0 孤立'], ['#ff9a52', '1–4'], ['#e6eefa', '5–9'], ['#8fd0ff', '10–19'], ['#3f8cff', '20+ 拥挤']];
  D.text(ctx, '邻居数 neighbors', 120, 925, { font: '600 15px "PingFang SC"', color: '#c9d4e2' });
  lg.forEach(([c, s2], k) => { D.circle(ctx, 290 + k * 112, 925, 7, { fill: c }); D.text(ctx, s2, 304 + k * 112, 925, { font: '15px "PingFang SC"', color: '#c9d4e2' }); });
  ctx.restore();
  return out;
}

// ---------------------------------------------------------------- overlay content per scene
const BRAND = ['万象成群 · 第一期', 'Swarms at Scale · EP01 · Boids'];
const CH = [
  { id: 'rules', step: '01 / 05', zh: '三条规则', en: 'Three local rules' },
  { id: 'steer', step: '02 / 05', zh: '转向行为', en: 'Steering behaviors' },
  { id: 'scale', step: '03 / 05', zh: '邻居查询与空间网格', en: 'Neighbor search & spatial grid' },
  { id: 'topo', step: '04 / 05', zh: '拓扑邻居', en: 'Topological neighbors' },
  { id: 'gpu', step: '05 / 05', zh: 'GPU 上的六万只鸟', en: 'Sixty thousand birds on the GPU' },
];
const DESC = {
  rules: [['每只 boid 只看感知半径内的邻居，没有任何全局信息。', 'Each boid sees only neighbors inside its perception radius; there is no global information.'],
    [`<b style="color:#ff6b6b">分离</b>躲开太近的、<b style="color:#5ad1ff">对齐</b>邻居的方向、<b style="color:#ffc35a">聚合</b>到邻居中心。`, 'Separation, alignment, cohesion: three steering forces, weighted and summed.']],
  steer: [['所有行为都归结为同一个公式：转向 = 期望速度 − 当前速度。', 'Every behavior reduces to one formula: steering = desired velocity − current velocity.'],
    ['给每只鸟加一条“逃离”规则：鹰附近的期望速度指向远离它的方向。', 'One extra flee rule per bird: near the hawk, desired velocity points away from it.']],
  scale: [['逐一比较：每只鸟和其余 n − 1 只都算一次距离，开销 O(n²)。', 'Brute force: every boid measures its distance to the other n − 1. Cost O(n²).'],
    ['空间网格：格子边长 = 感知半径，只查 3 × 3 个格子，开销接近 O(n)。', 'Spatial grid: cell size = perception radius; check only 3 × 3 cells. Cost ≈ O(n).']],
  topo: [['距离邻居：半径内有谁算谁。拓扑邻居：永远是最近的 k = 7 只。', 'Metric: whoever is inside the radius. Topological: always the nearest k = 7.']],
  gpu: [['位置、速度各存一张 256 × 256 浮点纹理：一个像素就是一只鸟。', 'Position and velocity live in two 256 × 256 float textures: one pixel per bird.'],
    ['所有鸟先叠加进 40³ 网格（数量 / 质心 / 速度和），再各自读取 27 个格子。', 'Birds are splatted into a 40³ grid (count / centroid / velocity sum); each then reads 27 cells.']],
};
function panelFor(t) {
  const k = CH.findIndex(c => t >= S(c.id) && t < E(c.id));
  if (k < 0) return null;
  const c = CH[k], s0 = S(c.id), s1 = E(c.id);
  let o = win(t, s0 + 0.5, s1 + 0.2, 0.6, 0.5);
  const P = { step: c.step, zh: c.zh, en: c.en, dots: { n: 5, cur: k, frac: (t - s0) / (s1 - s0) }, opacity: o };
  const d = DESC[c.id];
  const line = id => { const s = TL.scenes.find(x => x.id === id); let q = 0; s.lines.forEach((l, i) => { if (t >= l.start - 0.3) q = i; }); return q; };
  const q = line(c.id);
  if (c.id === 'rules') {
    P.desc = q < 2 ? d[0] : d[1];
    const hl = { 1: ['for (let q'], 2: ['sx += dx / d2'], 3: ['ax += vx[j]'], 4: ['cx += x[j]'], 5: ['f.ax = p.ws', 'f.ay = p.ws'] }[q];
    if (q >= 1 && q <= 5) P.code = { src: 'b2', region: 'rules', file: 'boids2d.js · forces()', since: L('rules', 1), hl };
    if (q === 6) P.opacity = o * 0.0 + Math.max(0, 1 - ramp(t, L('rules', 6) - 0.2, L('rules', 6) + 0.6)) * o;
  }
  if (c.id === 'steer') {
    P.desc = q < 2 ? d[0] : d[1];
    if (q === 1) P.code = { src: 'b2', region: 'steer', file: 'boids2d.js · steer()', since: L('steer', 1), hl: ['desired - velocity', 'limit(maxForce)'] };
    if (q === 0) P.opacity = o * 0.0 + ramp(t, L('steer', 1) - 0.6, L('steer', 1)) * o;
  }
  if (c.id === 'scale') {
    P.desc = q < 2 ? d[0] : d[1];
    if (q <= 1) P.code = { src: 'b2', region: 'naive', file: 'boids2d.js · candidates()', since: L('scale', 0) + 0.4, hl: ['for (let j'] };
    else P.code = { src: 'b2', region: 'grid', file: 'boids2d.js · candidates()', since: L('scale', 2), hl: ['for (let gy', 'for (let gx'] };
    if (q === 3) P.code = null;
  }
  if (c.id === 'topo') {
    P.desc = d[0];
    P.code = { src: 'b2', region: 'topo', file: 'boids2d.js · neighbors()', since: L('topo', 1), hl: ['if (have < K)', 'else if (d2 < bd'] };
    P.opacity = 0;
  }
  if (c.id === 'gpu') {
    P.desc = q < 1 ? d[0] : d[1];
    if (q === 1) P.code = { src: 'gf', region: 'splat', file: 'gpuflock.js · splat.vert', since: L('gpu', 1), hl: ['vec2 px', 'vData = which'], lang: 'GLSL ES 3.0' };
    if (q === 2) P.code = { src: 'gf', region: 'field', file: 'gpuflock.js · velocity.frag', since: L('gpu', 2), hl: ['texelFetch(tGA', 'coh += d * A.x', 'float crowd', 'wa * steer', 'wc * steer', 'ws * steer'], lang: 'GLSL ES 3.0' };
    if (q === 3) P.opacity = o * (1 - ramp(t, L('gpu', 3) - 0.2, L('gpu', 3) + 0.6));
  }
  return P;
}
const fmt = n => Math.round(n).toLocaleString('en-US');
function cardsFor(t) {
  const c = [];
  const card = (a, b, o) => c.push({ ...o, o: win(t, a, b, 0.5, 0.5) * (o.o ?? 1) });
  card(L('rules', 0) - 0.2, L('rules', 1) + 0.2, { x: 1300, y: 150, w: 560, y_: '1986 · CRAIG REYNOLDS', zh: 'Boids = bird-oid objects<br>“类鸟体”', sub: 'Flocks, Herds, and Schools:<br>A Distributed Behavioral Model · SIGGRAPH 1987' });
  card(L('rules', 6) + 0.2, E('rules') + 0.3, { x: 1300, y: 150, w: 560, y_: '1992 · BATMAN RETURNS', zh: '电影里的蝙蝠群与企鹅大军', en: 'Bat swarms and the penguin army', sub: '示意画面（自制渲染，非电影原片）<br>illustration — not film footage' });
  card(L('steer', 3) - 0.1, E('steer') + 0.3, { x: 1300, y: 150, w: 560, y_: '1998 · HALF-LIFE', zh: 'Xen 的异星飞行生物就叫 Boid', en: 'The alien flyers of Xen are named “Boid”', sub: 'monster_flyer_flock · aflock.cpp · Half-Life SDK' });
  card(L('scale', 3) + 0.2, E('scale') + 0.3, { x: 40, y: 170, w: 600, y_: '2006 · PSCROWD · PLAYSTATION 3', zh: '15,000 个个体 · 60 fps', en: 'Spatial hashing mapped onto the Cell processor', sub: 'Reynolds, “Big Fast Crowds on PS3” · Sandbox 2006' });
  card(L('topo', 0) + 0.6, L('topo', 1) - 0.3, { x: 1300, y: 150, w: 560, y_: '2008 · STARFLAG · ROME', zh: '每只椋鸟只与最近的 6–7 只互动', en: 'Each starling interacts with its 6–7 nearest neighbors', sub: 'Ballerini et al., PNAS 105(4) 1232–1237<br>多机位同步拍摄，重建每只鸟的三维位置' });
  return c;
}
function stepCard(t) {
  // GDC 1999 badge under the steering vignettes
  const o = win(t, L('steer', 0) + 0.3, L('steer', 1) - 0.1, 0.5, 0.4);
  return o > 0 ? [{ x: 40, y: 170, w: 640, o, y_: 'GDC 1999 · CRAIG REYNOLDS', zh: 'Steering Behaviors For Autonomous Characters', en: '寻找 · 逃离 · 徘徊 · 避障 · 跟随 · 路径 …', sub: 'red3d.com/cwr/steer' }] : [];
}

// ---------------------------------------------------------------- frame
async function frame(t) {
  FOOT = null; FRAME = null;
  renderer.setScissorTest(false);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x05070b, 1); renderer.clear();
  ctx.clearRect(0, 0, W, H);
  const act = activeShots(t);
  let extra = {};
  if (act.u != null) {
    const x = Math.round(act.u * W);
    extra = { ...(act.prev.draw([x, W], t) || {}) };
    const fA = FOOT; FOOT = null;
    extra = { ...extra, ...(act.cur.draw([0, x], t) || {}) };
    if (fA && !FOOT) FOOT = fA;
    else if (fA && FOOT) { FRAME = null; FOOT = FOOT; }
  } else if (act.a != null) {
    extra = { ...(act.prev.draw([0, W], t) || {}) };
    const fA = FOOT; FOOT = null;
    act.cur.draw([0, W], t);
    if (FOOT) FOOT.opacity = act.a; else if (fA) fA.opacity = 1 - act.a, FOOT = fA;
  } else extra = act.cur.draw([0, W], t) || {};

  const out = { foot: FOOT, wipe: act.u != null ? { u: act.u, labA: act.cur.labA, labB: act.cur.labB } : null };
  const sid = TL.scenes.find(s => t >= s.start && t < s.end)?.id || 'final';
  // brand / progress: hidden in the loop frames at both ends
  out.brand = Math.min(ease(ramp(t, CK('intro', 3, 0) - 0.5, CK('intro', 3, 0) + 0.5)), 1 - ease(ramp(t, L('final', 1) - 0.4, L('final', 1) + 0.6)));
  out.panel = panelFor(t);
  out.labels = extra.labels || [];
  out.cards = [...cardsFor(t), ...stepCard(t)];
  // chips
  const chip = (zh, en, real) => ({ zh, en, real });
  if (sid === 'intro') {
    if (t < L('intro', 1) - 0.3) out.chip = null;
    else if (t < CK('intro', 2, 1)) out.chip = chip('实拍 · 土耳其 2024', 'Real starling murmuration', true);
    else out.chip = chip('模拟 · 65,536 只 boids', 'GPU simulation');
    if (out.chip) out.chip.opacity = out.brand;
    if (t >= L('intro', 1) - 0.4 && t < CK('intro', 2, 1) + 1) out.credit = { k: 'FOOTAGE', text: 'Bilibili @Bobo字幕组 · 土耳其泰基尔达椋鸟群飞', o: win(t, L('intro', 1), CK('intro', 2, 1) + 0.6, 0.6, 0.5) };
    const tc = win(t, CK('intro', 3, 0) - 0.1, E('intro') - 0.2, 0.7, 0.6);
    out.title = { opacity: tc, k: '万象成群 · 第一期 · EP01', h: '三条规则，六万只鸟', e: 'Boids — from three rules to sixty thousand birds', tags: ['分离 Separation', '对齐 Alignment', '聚合 Cohesion'], top: 330 };
  }
  if (sid === 'rules') out.chip = t < L('rules', 6) ? chip('Canvas · 2D boids', 'Reynolds 1986 rules') : chip('示意 · 蝙蝠群', 'Illustration · bat swarm');
  if (sid === 'steer') out.chip = t < L('steer', 2) ? chip('转向行为', 'Steering behaviors') : chip('three.js · 16,384 只 + 1 只鹰', 'Flee from a predator');
  if (sid === 'scale') {
    out.chip = chip('邻居查询', 'Neighbor queries');
    const s = t < L('scale', 3) - 0.2 ? SC1() : SC2();
    const n = t < L('scale', 3) - 0.2 ? s.n : extra.n || s.n;
    const naive = n * (n - 1), grid = s.checks || 0;
    const showGrid = t > L('scale', 2);
    out.params = { head: 'LIVE · CHECKS / STEP', rows: [{ k: 'boids', v: fmt(n), c: 'hot' }, { k: 'naive  n·(n−1)', v: fmt(naive), c: 'bad' }, ...(showGrid ? [{ k: 'grid  3×3 cells', v: fmt(grid), c: 'good' }, { k: 'saving', v: (naive / Math.max(1, grid)).toFixed(1) + '×' }] : [])], opacity: win(t, S('scale') + 0.5, E('scale'), 0.5, 0.5) };
    if (t > L('scale', 1) + 0.3 && t < VE('scale') + 1 && t < L('scale', 3) - 0.2) out.params.opacity = 0;   // chart takes the corner
  }
  if (sid === 'topo') {
    if (t < L('topo', 1) - 0.4) {
      out.chip = chip('实拍 · 椋鸟群', 'Real starlings', true);
      out.credit = { k: 'FOOTAGE', text: 'Bilibili @Bobo字幕组 · 土耳其泰基尔达椋鸟群飞', o: win(t, S('topo') + 0.3, L('topo', 1) - 0.4, 0.5, 0.4), top: 520 };
    } else {
      out.chip = chip('同一群鸟 · 同一只捕食者', 'Same flock, same predator');
      const m = extra.m || {};
      const o = ramp(t, L('topo', 1) - 0.2, L('topo', 1) + 0.5);
      out.labels.push({ x: 480, y: 172, zh: `距离邻居 · 半径内有几只算几只`, en: `METRIC · NEIGHBORS ${m.mn ?? 0}–${m.mx ?? 0} · ISOLATED ${m.lost ?? 0}`, o, color: '#fff' });
      out.labels.push({ x: 1440, y: 172, zh: `拓扑邻居 · 永远是最近的 7 只`, en: `TOPOLOGICAL · NEIGHBORS 7 · ISOLATED 0`, o, color: '#ffc46b' });
    }
    out.subsFull = t >= L('topo', 1) - 0.4;
  }
  if (sid === 'gpu') {
    out.chip = chip('three.js · GPGPU', 'WebGL2 float textures');
    const l1 = L('gpu', 1);
    out.params = { head: 'LIVE · GPU FLOCK', rows: [{ k: 'boids', v: '65,536', c: 'hot' }, { k: 'posTex / velTex', v: '256² RGBA32F' }, { k: 'grid', v: '40³ = 64,000 cells' }, { k: 'reads / boid', v: '27 cells' }, { k: 'sim rate', v: '60 Hz' }], opacity: win(t, S('gpu') + 0.6, E('gpu'), 0.6, 0.6) };
    out.labels.push({ x: 920, y: 860, zh: 'posTex · 256 × 256 = 65,536 个像素', en: 'one texel = one bird', o: win(t, S('gpu') + 1.0, CK('gpu', 0, 1) + 2.4, 0.6, 0.5) });
    out.labels.push({ x: 960, y: 140, zh: '每格：数量 · 质心 · 速度和', en: 'per cell: count · centroid · Σ velocity', o: win(t, l1 + 0.8, L('gpu', 2) + 0.2, 0.6, 0.4) });
    out.labels.push({ x: 960, y: 140, zh: '3 × 3 × 3 = 27 个格子', en: 'one bird reads 27 cells', o: win(t, L('gpu', 2) + 0.6, L('gpu', 3), 0.6, 0.4) });
  }
  if (sid === 'bridge') {
    const steps = [['三条规则', '3 rules'], ['转向行为', 'steering'], ['空间网格', 'grid'], ['拓扑邻居', 'topological'], ['GPU 场', 'GPU field']];
    steps.forEach((s, k) => out.labels.push({ x: 960 + (k - 2) * 250, y: 150, zh: s[0], en: s[1], o: win(t, S('bridge') + 0.6 + k * 0.35, L('bridge', 1) - 0.1, 0.4, 0.5) }));
    out.chip = chip('同一套规则', 'Same three rules');
    out.subsBox = true;
  }
  if (sid === 'gdc') {
    const g0 = S('gdc'), g1 = E('gdc');
    const o = win(t, g0 - 0.2, g1 + 0.1, 0.5, 0.45);
    const sc = lerp(0.92, 1, ease(ramp(t, g0 - 0.2, g0 + 0.4)));
    const w = 1280 * sc, h = 720 * sc;
    out.frame = { clip: CLIPS.gdc, t: clamp(t - g0, 0, 10.75), opacity: o, rect: [960 - w / 2, 120 + (720 - h) / 2, w, h] };
    out.credit = { k: 'GDC 2017', text: 'Matt Nava (Giant Squid) · “Creating the Art of ABZÛ” · GDC Vault', o, top: 862 - 0 };
    out.chip = chip('演讲片段', 'Talk excerpt'); out.chip.opacity = o;
    out.subsFull = true;
  }
  if (sid === 'final') {
    const tc = win(t, S('final') + 0.1, L('final', 1) - 0.5, 0.7, 0.6);
    out.title = { opacity: tc, k: '下期预告 · NEXT · EP02', h: '《ABZÛ》万鱼之海', e: 'How ten thousand fish come alive', tags: ['静态网格实例化', '顶点动画', '一万条鱼'], top: 320, size: 80 };
    out.subsBox = true;
  }
  if (out.chip && out.chip.opacity == null) out.chip.opacity = out.brand;
  return out;
}

export default {
  brand: BRAND,
  events,
  async init() {
    renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float missing');
    await loadSource('b2', new URL('../core/sims/boids2d.js', import.meta.url));
    await loadSource('gf', new URL('../core/sims/gpuflock.js', import.meta.url));
    build();
    window.DBG = { flocks, V, sims, MURM, S0, flock, THREE, centroid };
  },
  frame,
};
