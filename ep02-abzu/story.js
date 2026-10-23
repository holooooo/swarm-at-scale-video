// EP02 · 《ABZÛ》万鱼之海 — 10,240 fish without a single bone.
// frame(t) is a pure function of t; reef flocks are re-stepped deterministically. Frame END == frame 0.
import * as THREE from 'three';
import { TL, S, E, VE, L, LE, chunks, clamp, ease, ease2, lerp, ramp, win, loadSource } from '../core/film.js';
import { GpuFlock, ihash } from '../core/sims/gpuflock.js';
import { DT } from '../core/sims/boids2d.js';
import { SPECIES, makeSchool, makeSolo, seaUniforms } from './sims/fish.js';
import { makeSkeleton, swim } from './sims/skeleton.js';
import { fishGeometry } from './sims/fish.js';
import { makeSea } from './sea.js';

const W = 1920, H = 1080, END = TL.duration;
const CK = (id, k, j) => chunks(TL.scenes.find(s => s.id === id).lines[k])[j].start;
const glc = document.querySelector('#gl'), c2 = document.querySelector('#c2d'), ctx = c2.getContext('2d');
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let renderer;

// ------------------------------------------------------------------ reef
const S0 = 60;                     // reef sim time of the loop frame
const TORNADO = [0, 15, 0];
function sharkAt(st) {
  const a = st * 0.21, r = 21 + 5 * Math.sin(st * 0.13);
  return V3(TORNADO[0] + Math.cos(a) * r, 11 + 3 * Math.sin(st * 0.31), TORNADO[2] + Math.sin(a) * r * 0.85);
}
const SCHOOLS = [
  { kind: 'jack', tex: 64, c: TORNADO, r: [8, 12, 8], v: 3.0, swirl: 1.3, rho0: 70, pred: true },
  { kind: 'sardine', tex: 64, c: [-42, 11, -26], r: [9, 6, 9], v: 2.2, swirl: -0.9, rho0: 90, pred: false },
  { kind: 'fusilier', tex: 32, c: [34, 8, -30], r: [14, 3.5, 7], v: 2.4, swirl: 0, rho0: 40, pred: false },
  { kind: 'tang', tex: 16, c: [22, 3.2, 18], r: [7, 1.6, 6], v: 1.4, swirl: 0.3, rho0: 14, pred: false },
  { kind: 'sergeant', tex: 16, c: [-20, 3.0, 20], r: [6, 1.5, 6], v: 1.3, swirl: -0.3, rho0: 14, pred: false },
  { kind: 'snapper', tex: 16, c: [8, 5.5, -44], r: [8, 2.5, 6], v: 1.8, swirl: 0, rho0: 14, pred: false },
  { kind: 'parrot', tex: 16, c: [-44, 3.0, 26], r: [8, 1.5, 7], v: 1.5, swirl: 0.2, rho0: 10, pred: false },
];
const flockCfg = (sc, i) => ({
  tex: sc.tex, G: 40, L: 80, seed: 101 + i * 17, spread: SPECIES[sc.kind].size * 0.7, phaseBase: 3.5, phaseK: 9 / (SPECIES[sc.kind].size * 4 + 0.6),
  center: st => [sc.c[0] + Math.sin(st * 0.05 + i) * 2, sc.c[1] + Math.sin(st * 0.11 + i) * 0.8, sc.c[2] + Math.cos(st * 0.04 + i) * 2],
  radii: sc.r, init: () => ({ p: sc.c, spread: sc.r, v: [sc.v, 0, 0] }),
  params: () => ({ maxS: sc.v * 1.25, minS: sc.v * 0.6, maxF: sc.v * 1.7, rho0: sc.rho0, swirl: sc.swirl, wb: 1.3, noiseW: sc.v * 0.35, flatten: sc.swirl ? 0.12 : 0.3 }),
  predator: sc.pred ? st => { const p = sharkAt(st); return { p: [p.x, p.y, p.z], r: 7, s: 3.2 }; } : null,
});
let reef;
function buildReef() {
  const sea = seaUniforms(), scene = new THREE.Scene();
  scene.add(makeSea(sea));
  const flocks = SCHOOLS.map((sc, i) => new GpuFlock(renderer, flockCfg(sc, i)));
  const meshes = SCHOOLS.map((sc, i) => { const m = makeSchool(sc.kind, flocks[i], sea); scene.add(m); return m; });
  const shark = makeSolo('shark', sea); scene.add(shark);
  const skel = makeSkeleton(4); scene.add(skel);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.05, 6000);
  reef = { sea, scene, flocks, meshes, shark, skel, cam, st: -1 };
}
function reefAt(st) {
  for (const f of reef.flocks) f.advanceTo(st * 60);
  renderer.setRenderTarget(null);
  reef.sea.uTime.value = st;
  // shark: scripted path; curl from path curvature, tail phase from distance travelled
  const p = sharkAt(st), q = sharkAt(st + 0.05), q2 = sharkAt(st + 0.1), u = reef.shark.material.uniforms;
  const v1 = q.clone().sub(p), v2 = q2.clone().sub(q);
  const yaw = Math.atan2(v1.x * v2.z - v1.z * v2.x, v1.dot(v2)) / 0.05;
  u.soloPos.value.copy(p); u.soloFwd.value.copy(v1.normalize()); u.soloPhase.value = st * 5.2; u.soloCurl.value.set(clamp(-yaw * 1.6, -0.8, 0.8), 0);
  reef.st = st;
}
// hero fish: one jack chosen at the loop time, near the tornado surface on the camera side
let HERO = null;
function hero() {
  const f = reef.flocks[0];
  if (HERO == null) {
    f.advanceTo(S0 * 60);
    const { p } = f.read(); let best = 0, bd = 1e9;
    for (let i = 0; i < f.N; i++) { const d = Math.hypot(p[i * 4] - 7, p[i * 4 + 1] - 13, p[i * 4 + 2] - 7); if (d < bd) { bd = d; best = i; } }
    // camera outside the tornado, looking in at the fish's flank
    const P = f.position(best), rad = V3(P.x - TORNADO[0], 0, P.z - TORNADO[2]).normalize();
    HERO = { id: best, off: rad.multiplyScalar(2.2).add(V3(0, 0.3, 0)) };
  }
  const P = f.position(HERO.id), Vv = f.velocity(HERO.id), ph = f.read().p[HERO.id * 4 + 3];
  return { P, V: Vv, ph };
}
const closeCam = (cam, P) => { cam.position.copy(P).add(HERO.off); cam.lookAt(P.x, P.y + 0.05, P.z); };
function wideReef(cam, t, dist = 46, yaw = 0.8, y = 9, look = TORNADO) {
  const a = yaw + t * 0.02;
  cam.position.set(look[0] + Math.sin(a) * dist, y, look[2] + Math.cos(a) * dist);
  cam.lookAt(look[0], look[1] - 2, look[2]);
}
function heroSkel(alpha) {
  const h = hero(), s = SPECIES.jack, size = s.size * (1 + 0.3 * (ihash(HERO.id * 3 + 1) - 0.5));
  reef.skel.set([{ kind: 'jack', sp: s, P: h.P, V: h.V, ph: h.ph, size }], alpha);
  return h;
}
function drawReef(clip) {
  renderer.setScissorTest(true); renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
  renderer.render(reef.scene, reef.cam); renderer.setScissorTest(false);
}

// ------------------------------------------------------------------ lab (viewport-style studio)
let lab;
function buildLab() {
  const sea = seaUniforms(); sea.uSun.value.set(0.35, 1, 0.55).normalize();
  const scene = new THREE.Scene();
  const bg = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }`,
    fragmentShader: `varying vec3 vD; void main(){ vec3 c = mix(vec3(0.035, 0.045, 0.06), vec3(0.12, 0.15, 0.19), smoothstep(-0.4, 0.8, vD.y)); gl_FragColor = vec4(c, 1.0); }` }));
  bg.renderOrder = -10; bg.frustumCulled = false; scene.add(bg);
  const grid = new THREE.GridHelper(80, 80, 0x2c3a4c, 0x1a2330); grid.position.y = -2.2; scene.add(grid);
  const mk = (kind, n) => Array.from({ length: n }, () => { const m = makeSolo(kind, sea); m.material.uniforms.fogK.value = 0; m.visible = false; scene.add(m); return m; });
  const jacks = mk('jack', 30), ghost = mk('jack', 1)[0], sharks = mk('shark', 5);
  ghost.material.uniforms.uGhost.value = 1; ghost.material.depthWrite = false; ghost.material.wireframe = true; ghost.renderOrder = 3;
  const skel = makeSkeleton(32); scene.add(skel);
  // instancing demo: the reef's jack flock, drawn a second time in the lab
  const grid4096 = makeSchool('jack', reef.flocks[0], sea); grid4096.material.uniforms.fogK.value = 0.004; grid4096.visible = false; scene.add(grid4096);
  // trails for the curl demo
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 200 * 3), 3));
  const trail = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.5 })); trail.frustumCulled = false; scene.add(trail);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 2000);
  lab = { sea, scene, jacks, ghost, sharks, skel, grid4096, trail, cam, grid };
}
function labReset() {
  for (const m of [...lab.jacks, lab.ghost, ...lab.sharks]) { m.visible = false; const u = m.material.uniforms; u.uComp.value.set(1, 1, 1, 1); u.uMask.value = 1; u.uCorr.value = 1; u.soloCurl.value.set(0, 0); u.soloOpen.value = 0; u.soloLunge.value = 0; u.uHL.value = 0; u.uGhost.value = 0; m.material.depthWrite = m !== lab.ghost; u.size.value = SPECIES[m === lab.ghost || lab.jacks.includes(m) ? 'jack' : 'shark'].size; }
  lab.grid4096.visible = false; lab.trail.visible = false; lab.skel.visible = false; lab.grid.visible = true;
}
function solo(m, P, F, ph, size) { const u = m.material.uniforms; m.visible = true; u.soloPos.value.copy(P); u.soloFwd.value.copy(F); u.soloPhase.value = ph; if (size) u.size.value = size; return u; }
function drawLab(clip, t) {
  lab.sea.uTime.value = t;
  renderer.setScissorTest(true); renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
  renderer.render(lab.scene, lab.cam); renderer.setScissorTest(false);
}
const GRID30 = i => V3(((i % 6) - 2.5) * 2.5, 1.5 - Math.floor(i / 6) * 1.15, -Math.floor(i / 6) * 0.9);

// ------------------------------------------------------------------ shots
const shots = [], events = [];
function shot(t0, draw, o = {}) { shots.push({ t0, draw, wipe: o.wipe || 0, labA: o.labA, labB: o.labB, dissolve: o.dissolve || 0 }); }
function activeShots(t) {
  let i = 0; while (i + 1 < shots.length && shots[i + 1].t0 <= t) i++;
  const cur = shots[i], prev = shots[i - 1];
  if (prev && cur.wipe && t < cur.t0 + cur.wipe) return { cur, prev, u: ease2((t - cur.t0) / cur.wipe) };
  if (prev && cur.dissolve && t < cur.t0 + cur.dissolve) return { cur, prev, a: ease((t - cur.t0) / cur.dissolve) };
  return { cur };
}
let FOOT = null;
const CLIP = (dir, count) => ({ dir: 'media/' + dir, fps: 30, count });
const CLIPS = { game: CLIP('game_school', 390), gdcA: CLIP('gdcA', 396), gdcB: CLIP('gdcB', 285),
  swim: CLIP('roll_swim', 540), bite: CLIP('roll_bite', 480), crab: CLIP('roll_crab', 600), curl: CLIP('roll_curl', 420), bspace: CLIP('roll_bspace', 360) };

function build() {
  const footIn = L('intro', 1) - 0.35;
  shot(0, (c, t) => hookShot(c, t));
  shot(footIn, (c, t) => { FOOT = { clip: CLIPS.game, t: t - footIn, clipX: c }; }, { wipe: 1.2, labA: ['我们的渲染', 'OUR RENDER'], labB: ['《ABZÛ》实机', 'ABZÛ GAMEPLAY'] });
  shot(S('gdcA'), (c, t) => { FOOT = { clip: CLIPS.gdcA, t: t - S('gdcA'), clipX: c }; }, { dissolve: 0.6 });
  shot(S('gdcB'), (c, t) => { FOOT = { clip: CLIPS.gdcB, t: t - S('gdcB'), clipX: c }; }, { dissolve: 0.5 });
  shot(S('title'), (c, t) => titleShot(c, t), { wipe: 1.1 });
  shot(S('skel'), (c, t) => skelShot(c, t), { wipe: 1.0 });
  shot(S('inst'), (c, t) => instShot(c, t), { wipe: 1.0, labA: ['骨骼动画', 'SKELETAL'], labB: ['静态网格实例化', 'STATIC MESH INSTANCING'] });
  shot(S('swim'), (c, t) => swimShot(c, t), { wipe: 1.0 });
  shot(S('phase'), (c, t) => phaseShot(c, t), { wipe: 1.0 });
  shot(S('bite'), (c, t) => biteShot(c, t), { wipe: 1.0 });
  shot(S('curl'), (c, t) => curlShot(c, t), { wipe: 1.0 });
  shot(L('curl', 2) - 0.3, (c, t) => diagShot(c, t), { wipe: 0.9, labA: ['卷曲插值', 'CURL BLEND'], labB: ['45° 叠加问题', 'THE 45° PROBLEM'] });
  shot(S('school'), (c, t) => schoolShot(c, t), { wipe: 1.2, labA: ['单条鱼', 'ONE FISH'], labB: ['一万条鱼', '10,240 FISH'] });
  for (const s of shots) if (s.t0 > 0.05 && (s.wipe || s.dissolve)) events.push({ t: +s.t0.toFixed(3), wipe: s.wipe || s.dissolve });
}

// reef: hook (forward from S0), title, school→final (backward-anchored to land on S0 at END)
function hookShot(clip, t) {
  reefAt(S0 + t);
  const h = heroSkel(1 - ramp(t, L('intro', 0) + 4.5, L('intro', 1) - 0.2));
  const k = ease2(ramp(t, CK('intro', 0, 1) + 0.6, L('intro', 1) + 0.6));
  const close = new THREE.PerspectiveCamera(); closeCam(close, h.P);
  wideReef(reef.cam, t, 44, 0.9);
  const wideP = reef.cam.position.clone(), wideL = V3(TORNADO[0], TORNADO[1] - 2, TORNADO[2]);
  reef.cam.position.lerpVectors(close.position, wideP, k);
  reef.cam.lookAt(V3(h.P.x, h.P.y + 0.05, h.P.z).lerp(wideL, Math.min(1, k * 1.3)));
  drawReef(clip);
  return {};
}
function titleShot(clip, t) {
  reefAt(S0 + t); reef.skel.set([], 0);
  wideReef(reef.cam, t - S('title'), 52, 2.2, 6, [0, 13, 0]);
  drawReef(clip);
  return {};
}
function schoolShot(clip, t) {
  const st = S0 - (END - t);
  reefAt(st);
  const s0 = S('school'), back = L('final', 1) - 0.6, fly0 = back, fly1 = END - 0.8;
  // wide orbit of the reef, then descend toward the tornado; at the very end fly into the hero fish
  const a = 0.3 + (t - s0) * 0.03;
  const dist = lerp(44, 34, ease(ramp(t, s0, E('school'))));
  reef.cam.position.set(Math.sin(a) * dist, lerp(14, 9, ease(ramp(t, s0, E('school')))), Math.cos(a) * dist);
  reef.cam.lookAt(0, 10, 0);
  let sk = 0;
  if (t > fly0) {
    const h = hero(), k = ease2(ramp(t, fly0, fly1));
    const far = reef.cam.position.clone(), farL = V3(0, 10, 0);
    const close = new THREE.PerspectiveCamera(); closeCam(close, h.P);
    reef.cam.position.lerpVectors(far, close.position, k);
    reef.cam.lookAt(farL.lerp(V3(h.P.x, h.P.y + 0.05, h.P.z), Math.min(1, k * 1.2)));
    if (k >= 1) closeCam(reef.cam, h.P);
    sk = ease(ramp(t, fly1 - 1.4, fly1));
  }
  heroSkel(sk);
  drawReef(clip);
  return {};
}

// lab shots
function skelShot(clip, t) {
  labReset();
  const s0 = S('skel'), l1 = L('skel', 1), l2 = L('skel', 2), sp = SPECIES.jack;
  const many = ease2(ramp(t, CK('skel', 1, 0) - 0.6, CK('skel', 1, 0) + 1.4));
  const n = many > 0.01 ? 30 : 1;
  const fish = [];
  for (let i = 0; i < n; i++) {
    const P = many > 0.01 ? GRID30(i) : V3(0, 0, 0), ph = (t - s0) * 9 + (i ? ihash(i * 11) * 6.28 : 0);
    const size = lerp(1.6, 0.85, many) * (i ? 1 : 1);
    const p0 = i === 0 ? V3(0, 0, 0).lerp(GRID30(0), many) : P;
    solo(lab.jacks[i], p0, V3(1, 0, 0), ph, size).uGhost.value = 0.55;
    lab.jacks[i].material.uniforms.uGhost.value = lerp(0.62, 0.45, many); lab.jacks[i].material.depthWrite = false;
    fish.push({ kind: 'jack', sp, P: p0, V: V3(1, 0, 0), ph, size });
  }
  const gone = ease(ramp(t, l2 - 0.2, l2 + 1.0));
  for (let i = 0; i < n; i++) lab.jacks[i].material.uniforms.uGhost.value *= 1 - gone;
  lab.skel.set(fish, 1 - gone);
  const camA = { p: V3(0.3, 0.9, 6.2), l: V3(0, 0, 0) }, camB = { p: V3(0, 2.2, 17.5), l: V3(0, -0.9, -1.8) };
  lab.cam.position.lerpVectors(camA.p, camB.p, many); lab.cam.lookAt(camA.l.clone().lerp(camB.l, many));
  drawLab(clip, t);
  return { n };
}
function instShot(clip, t) {
  labReset();
  const s0 = S('inst'), f = reef.flocks[0];
  reefAt(S0 + 8 + (t - s0));        // keeps the reef flocks moving (jack flock is drawn here)
  const g = lab.grid4096, u = g.material.uniforms;
  // 0: one wireframe mesh   1: grid of 4096 copies (instance data view)   2: copies fly to their flock positions
  const one = 1 - ease(ramp(t, CK('inst', 0, 1) - 0.4, CK('inst', 0, 1) + 0.6));
  const lay = ease2(ramp(t, CK('inst', 2, 1) - 0.2, CK('inst', 2, 1) + 3.2));
  const ph = (t - s0) * 9;
  const m = solo(lab.ghost, V3(0, 0, 0), V3(1, 0, 0), ph, 1.6); m.uGhost.value = 1; lab.ghost.visible = one > 0.01; lab.ghost.material.opacity = one;
  solo(lab.jacks[0], V3(0, 0, 0), V3(1, 0, 0), ph, 1.6).uGhost.value = 1 - one;
  lab.jacks[0].visible = one > 0.01;
  if (one < 0.99) {
    g.visible = true; u.layout_.value = lay; u.uGrid.value = 0; u.uGridGap.value = 0.62;
    u.uGhost.value = 0;
  }
  const camA = { p: V3(0.2, 0.6, 6.5), l: V3(0, 0, 0) }, camB = { p: V3(0, 0, 44), l: V3(0, 0, 0) }, camC = { p: V3(36, 18, 46), l: V3(0, 12, 0) };
  const kb = ease2(ramp(t, CK('inst', 0, 1) - 0.4, CK('inst', 0, 1) + 1.6)), kc = lay;
  const P = camA.p.clone().lerp(camB.p, kb).lerp(camC.p, kc), Lk = camA.l.clone().lerp(camB.l, kb).lerp(camC.l, kc);
  lab.cam.position.copy(P); lab.cam.lookAt(Lk);
  lab.grid.visible = lay < 0.5;
  drawLab(clip, t);
  return { data: lay < 0.9 && one < 0.5 ? f : null };
}
function swimShot(clip, t) {
  labReset();
  const s0 = S('swim'), sp = SPECIES.jack;
  const l1 = L('swim', 1), l2 = L('swim', 2), l3 = L('swim', 3);
  const on = [ramp(t, CK('swim', 1, 0) - 0.2, CK('swim', 1, 0) + 0.5), ramp(t, CK('swim', 1, 1) - 0.2, CK('swim', 1, 1) + 0.5),
              ramp(t, CK('swim', 2, 0) - 0.2, CK('swim', 2, 0) + 0.5), ramp(t, CK('swim', 2, 1) - 0.2, CK('swim', 2, 1) + 0.5)];
  const mask = ease(ramp(t, CK('swim', 3, 0) - 0.2, CK('swim', 3, 0) + 0.6));
  const ph = (t - s0) * 6.5, P = V3(0, 0, 0), F = V3(1, 0, 0);
  // exaggerate while a layer is introduced, settle once the mask is on
  const amp = lerp(2.4, 1.0, mask);
  const u = solo(lab.jacks[0], P, F, ph, 1.7);
  u.uComp.value.set(on[0] * amp, on[1] * amp, on[2] * amp, on[3] * amp); u.uMask.value = mask;
  const g = solo(lab.ghost, P, F, ph, 1.7); g.uComp.value.set(0, 0, 0, 0); g.uGhost.value = 1; lab.ghost.material.opacity = 0.6 * (1 - mask);
  // camera: from above-front so lateral motion reads
  const a = 0.25 + (t - s0) * 0.012;
  lab.cam.position.set(Math.sin(a) * 1.8 + 0.6, 5.6, Math.cos(a) * 5.8); lab.cam.lookAt(0.3, -0.4, 0);
  drawLab(clip, t);
  return { on, mask };
}
function phaseShot(clip, t) {
  labReset();
  const s0 = S('phase'), l1 = L('phase', 1);
  const rnd = ease(ramp(t, CK('phase', 0, 1) - 0.2, CK('phase', 0, 1) + 0.8));
  const acc = ease2(ramp(t, l1 - 0.4, l1 + 0.6));
  const out = {};
  if (acc < 1) for (let i = 0; i < 8; i++) {
    const ph = (t - s0) * 8 + rnd * ihash(i * 7 + 2) * 6.28;
    solo(lab.jacks[i], V3(((i % 4) - 1.5) * 2.0, i < 4 ? 0.65 : -0.65, 0), V3(1, 0, 0), ph, 0.8);
    lab.jacks[i].material.uniforms.uGhost.value = acc;
  }
  if (acc > 0) {
    // one fish: speed pulses, phase = integral of (base + k * speed)
    const tt = t - l1 + 0.4, spd = st => 1 + 2.2 * Math.pow(Math.max(0, Math.sin(st * 1.25)), 6);
    let ph = 0, x = -5.5; const n = Math.max(0, Math.round(tt * 60));
    for (let k = 0; k < n; k++) { const v = spd(k / 60); ph += (3 + 4.5 * v) / 60; x += v * 0.9 / 60; }
    solo(lab.jacks[10], V3(x, 0, 0), V3(1, 0, 0), ph, 1.0).uGhost.value = 1 - acc;
    out.speed = spd(tt); out.rate = 3 + 4.5 * out.speed;
  }
  lab.cam.position.set(0, 2.4, 9.4); lab.cam.lookAt(0, 0, 0);
  drawLab(clip, t);
  return out;
}
function biteCurve(u) {
  // one bite: open (0–0.35), lunge forward + close (0.45–0.7), relax (to 1)
  const open = ease(ramp(u, 0.0, 0.25)) * (1 - ease(ramp(u, 0.5, 0.64)));
  const lunge = ease(ramp(u, 0.42, 0.6)) * (1 - ease(ramp(u, 0.75, 1.0)));
  return { open, lunge };
}
function biteShot(clip, t) {
  labReset();
  const s0 = S('bite'), sp = SPECIES.shark;
  const u = solo(lab.sharks[0], V3(0, 0, 0), V3(1, 0, 0.0), (t - s0) * 4, 1.3);
  const cyc = ((t - L('bite', 1) + 0.5) / 2.3);
  const b = cyc > 0 ? biteCurve(cyc - Math.floor(cyc)) : { open: 0, lunge: 0 };
  u.soloOpen.value = b.open; u.soloLunge.value = b.lunge;
  const a = -0.45 + (t - s0) * 0.01;
  lab.cam.position.set(Math.sin(a) * 3.6 + 1.6, 0.6, Math.cos(a) * 4.4); lab.cam.lookAt(0.8, 0, 0);
  drawLab(clip, t);
  return b;
}
const LEM = (st, ox) => { const a = st * 0.5; return V3(ox + Math.sin(a) * 1.9, 0, Math.sin(a) * Math.cos(a) * 3.0); };
function curlShot(clip, t) {
  labReset();
  const s0 = S('curl'), st = t - s0 + 3;
  const trail = lab.trail.geometry.attributes.position.array; let nt = 0;
  [[0, -2.9, false], [1, 2.9, true]].forEach(([k, ox, curl]) => {
    const p = LEM(st, ox), q = LEM(st + 0.04, ox), q2 = LEM(st + 0.08, ox);
    const v1 = q.clone().sub(p), v2 = q2.clone().sub(q);
    const yaw = Math.atan2(v1.x * v2.z - v1.z * v2.x, v1.dot(v2)) / 0.04;
    const u = solo(lab.sharks[k], p, v1.clone().normalize(), st * 5, 1.0);
    u.soloCurl.value.set(curl ? clamp(-yaw * 0.9, -1, 1) : 0, 0);
    for (let j = 0; j < 100; j++) { const a = LEM(st - j * 0.03, ox), b = LEM(st - (j + 1) * 0.03, ox); trail.set([a.x, -0.3, a.z, b.x, -0.3, b.z], nt * 6); nt++; }
  });
  lab.trail.visible = true; lab.trail.geometry.setDrawRange(0, nt * 2); lab.trail.geometry.attributes.position.needsUpdate = true;
  lab.cam.position.set(0, 11.5, 2.6); lab.cam.lookAt(0, 0, 0.2);
  drawLab(clip, t);
  return {};
}
function diagShot(clip, t) {
  labReset();
  const s0 = L('curl', 2) - 0.3, w = ease(ramp(t, s0 + 0.6, s0 + 1.8));
  const fixAt = L('curl', 3) - 0.1;
  const cfg = [[1, 0, 1], [1, 1, 0], [1, 1, 1]];
  cfg.forEach(([x, y, c], k) => {
    const u = solo(lab.sharks[k], V3((k - 1) * 4.6, 0, 0), V3(0, 0, 1), (t - s0) * 3, 1.0);
    u.soloCurl.value.set(x * w, y * w); u.uCorr.value = c; u.side.value = 0.003; u.wave.value = 0.03;
    lab.sharks[k].visible = k < 2 || t > fixAt - 0.4;
    if (k === 2) u.uGhost.value = 1 - ease(ramp(t, fixAt - 0.4, fixAt + 0.4));
  });
  lab.cam.position.set(0, 7.5, -11.5); lab.cam.lookAt(0, 0.4, 0);
  drawLab(clip, t);
  return {};
}

// ------------------------------------------------------------------ overlay
const BRAND = ['万象成群 · 第二期', 'Swarms at Scale · EP02 · ABZÛ'];
const CH = [
  { id: 'skel', step: '01 / 06', zh: '骨骼动画的账单', en: 'The cost of skeletons' },
  { id: 'inst', step: '02 / 06', zh: '静态网格实例化', en: 'Static mesh instancing' },
  { id: 'swim', step: '03 / 06', zh: '材质里的游动', en: 'Swimming in the material' },
  { id: 'phase', step: '04 / 06', zh: '一个相位驱动一切', en: 'One phase drives it all' },
  { id: 'bite', step: '05 / 06', zh: '混合变形：咬合', en: 'Blendshapes: the bite' },
  { id: 'curl', step: '06 / 06', zh: '转弯卷曲', en: 'Turning curl' },
];
const DESC = {
  skel: ['每帧：每个关节算一次变换矩阵，再按权重蒙皮所有顶点。', 'Per frame: one transform per joint, then every vertex is skinned by weight.'],
  inst: ['一个网格 + 一次 draw call，GPU 画 N 份；第 i 份读取第 i 个纹素的数据。', 'One mesh, one draw call, N copies on the GPU; instance i reads texel i.'],
  swim: ['四层余弦运动全在顶点着色器里；蒙板让头部保持稳定。', 'Four layered cosine motions, all in the vertex shader; a mask keeps the head steady.'],
  phase: ['相位存在位置纹理的 w 分量，每步按游速积分。', 'The phase lives in pos.w and is integrated each step from the swim speed.'],
  bite: ['混合变形 = 每个顶点存一份偏移，按权重相加。', 'A blendshape is one stored offset per vertex, added by weight.'],
  curl: ['转向角速度 → 卷曲权重；斜向时需要额外的修正形状。', 'Turn rate → curl weight; diagonals need an extra corrective shape.'],
};
function panelFor(t) {
  const k = CH.findIndex(c => t >= S(c.id) && t < E(c.id));
  if (k < 0) return null;
  const c = CH[k], s0 = S(c.id), s1 = E(c.id);
  const P = { step: c.step, zh: c.zh, en: c.en, dots: { n: 6, cur: k, frac: (t - s0) / (s1 - s0) }, opacity: win(t, s0 + 0.5, s1 + 0.2, 0.6, 0.5), desc: DESC[c.id] };
  const q = (() => { const s = TL.scenes.find(x => x.id === c.id); let r = 0; s.lines.forEach((l, i) => { if (t >= l.start - 0.3) r = i; }); return r; })();
  if (c.id === 'inst' && q >= 0) P.code = { src: 'fish', region: 'instancing', file: 'fish.js · makeSchool()', since: L('inst', 0) + 0.3, hl: ['instanceCount', 'tPos.value = flock.posTex'] };
  if (c.id === 'swim' && q >= 1) {
    const hl = q === 1 ? ['1 side to side', '2 yaw pivot'] : q === 2 ? ['3 wave', '4 twist'] : ['float mask', 'mask * uComp.z'];
    P.code = { src: 'fish', region: 'swim', file: 'fish.js · FISH_VS', since: L('swim', 1), hl, lang: 'GLSL ES 3.0' };
  }
  if (c.id === 'phase') P.code = { src: 'gf', region: 'phase', file: 'gpuflock.js · position.frag', since: L('phase', 0) + 0.3, hl: q === 0 ? ['o = vec4'] : ['float rate'], lang: 'GLSL ES 3.0' };
  if (c.id === 'bite' && q <= 1) P.code = { src: 'fish', region: 'blend', file: 'fish.js · FISH_VS', since: L('bite', 0) + 0.3, hl: ['aOpen * soloOpen'], lang: 'GLSL ES 3.0' };
  if (c.id === 'curl') P.code = { src: 'fish', region: 'blend', file: 'fish.js · FISH_VS', since: L('curl', 1), hl: q < 3 ? ['aCurlX * curl.x'] : ['aCurlC'], lang: 'GLSL ES 3.0' };
  if (c.id === 'curl' && q < 1) P.code = null;
  if (c.id === 'skel') P.code = null;
  if (c.id === 'bite' && q === 2) P.opacity *= 1 - ramp(t, L('bite', 2) - 0.2, L('bite', 2) + 0.4);
  return P;
}
const fmt = n => Math.round(n).toLocaleString('en-US');
// instance data table drawn on the 2D canvas
function dataTable(f, t, o) {
  if (!f || o <= 0) return;
  const { p, v } = f.read(), x0 = 1180, y0 = 150, rowH = 30, cols = ['id', 'pos.x', 'pos.y', 'pos.z', 'phase', 'vel.x', 'vel.y', 'vel.z', 'yaw'];
  ctx.save(); ctx.globalAlpha = o;
  ctx.fillStyle = 'rgba(8,11,18,0.86)'; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.roundRect(x0, y0, 700, 64 + rowH * 9, 16); ctx.fill(); ctx.stroke();
  ctx.font = '600 15px "PingFang SC"'; ctx.fillStyle = '#dbe4ee'; ctx.fillText('每条鱼 = 8 个 float = 32 字节   per-instance data', x0 + 20, y0 + 28);
  ctx.font = '13px "SF Mono", Menlo, monospace';
  cols.forEach((c, k) => { ctx.fillStyle = k === 0 ? '#8fa1b6' : k <= 4 ? '#ffb35c' : '#5ad1ff'; ctx.fillText(c, x0 + 20 + k * 74, y0 + 56); });
  for (let r = 0; r < 8; r++) {
    const i = r < 7 ? r : f.N - 1, y = y0 + 56 + rowH * (r + 1);
    ctx.fillStyle = r % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(x0 + 12, y - 19, 676, rowH - 2);
    const vals = r === 6 ? ['⋮'] : [i, p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3] % 6.2832, v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]];
    vals.forEach((val, k) => { ctx.fillStyle = k === 0 ? '#8fa1b6' : '#e6edf5'; ctx.fillText(typeof val === 'number' ? (k === 0 ? String(val) : val.toFixed(2)) : val, x0 + 20 + k * 74, y); });
  }
  ctx.restore();
}
function phaseGraph(e, t, o) {
  if (!e || e.speed == null || o <= 0) return;
  const x0 = 1180, y0 = 150, w = 700, h = 220, l1 = L('phase', 1) - 0.4;
  ctx.save(); ctx.globalAlpha = o;
  ctx.fillStyle = 'rgba(8,11,18,0.86)'; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 16); ctx.fill();
  ctx.font = '600 15px "PingFang SC"'; ctx.fillStyle = '#dbe4ee'; ctx.fillText('游速 speed  →  尾巴摆动频率 tail-beat rate', x0 + 20, y0 + 28);
  const spd = st => 1 + 2.2 * Math.pow(Math.max(0, Math.sin(st * 1.25)), 6), tt = t - l1;
  for (const [f, col] of [[st => spd(st) / 3.4, '#5ad1ff'], [st => (3 + 4.5 * spd(st)) / 16, '#ffb35c']]) {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
    for (let q = 0; q <= 200; q++) { const st = tt - 6 + q / 200 * 6, X = x0 + 30 + q / 200 * (w - 60), Y = y0 + h - 24 - f(Math.max(0, st)) * (h - 70); q ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
  }
  ctx.font = '13px "SF Mono"'; ctx.fillStyle = '#5ad1ff'; ctx.fillText(`speed ${e.speed.toFixed(2)}`, x0 + 520, y0 + 56); ctx.fillStyle = '#ffb35c'; ctx.fillText(`rate  ${e.rate.toFixed(1)} rad/s`, x0 + 520, y0 + 76);
  ctx.restore();
}

async function frame(t) {
  FOOT = null;
  renderer.setScissorTest(false); renderer.setRenderTarget(null);
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
  } else if (act.a != null) {
    act.prev.draw([0, W], t);
    const fA = FOOT; FOOT = null;
    extra = act.cur.draw([0, W], t) || {};
    if (FOOT) FOOT.opacity = act.a; else if (fA) { fA.opacity = 1 - act.a; FOOT = fA; }
  } else extra = act.cur.draw([0, W], t) || {};
  const out = { foot: FOOT, wipe: act.u != null ? { u: act.u, labA: act.cur.labA, labB: act.cur.labB } : null, labels: [], cards: [] };
  const sid = TL.scenes.find(s => t >= s.start && t < s.end)?.id || 'final';
  out.brand = Math.min(ease(ramp(t, S('title') - 0.4, S('title') + 0.6)), 1 - ease(ramp(t, L('final', 1) - 0.4, L('final', 1) + 0.6)));
  out.panel = panelFor(t);
  const chip = (zh, en, real) => ({ zh, en, real, opacity: Math.max(out.brand, sid === 'intro' || sid.startsWith('gdc') ? 1 : 0) });
  const pip = (clip, a, b, label, rect = [1240, 130, 640, 360]) => {
    const o = win(t, a, b, 0.5, 0.5);
    if (o <= 0) return;
    out.frame = { clip, t: clamp(t - a, 0, clip.count / 30 - 0.05), opacity: o, rect };
    out.labels.push({ x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] + 26, zh: label[0], en: label[1], o, plain: true });
  };
  if (sid === 'intro') {
    if (t < L('intro', 1) - 0.35) {
      const o = win(t, 0.8, L('intro', 1) - 0.6, 0.6, 0.5);
      out.labels.push({ x: 960, y: 170, zh: '60 个关节', en: '60 JOINTS · ONE FISH', o, color: '#ffc46b' });
    } else {
      out.chip = chip('《ABZÛ》实机画面', 'ABZÛ gameplay', true);
      out.credit = { k: 'FOOTAGE', text: 'ABZÛ © Giant Squid / 505 Games · Bilibili @星影', o: win(t, L('intro', 1), E('intro') + 0.3, 0.5, 0.4) };
    }
  }
  if (sid === 'gdcA' || sid === 'gdcB') {
    out.chip = chip('GDC 2017 演讲', 'Talk excerpt', true);
    out.credit = { k: 'GDC 2017', text: 'Matt Nava (Giant Squid) · “Creating the Art of ABZÛ” · GDC Vault', o: 1 };
    out.subsFull = true; out.subsBox = true;
  }
  if (sid === 'title') {
    const tc = win(t, S('title') + 0.4, E('title') - 0.2, 0.7, 0.6);
    out.title = { opacity: tc, k: '万象成群 · 第二期 · EP02', h: '一万条鱼，没有一根骨头', e: 'ABZÛ — ten thousand fish, not a single bone', tags: ['静态网格实例化', '顶点动画', '混合变形'], top: 320, size: 80 };
    out.chip = chip('three.js · 10,240 条鱼', 'Our reef, 7 species');
  }
  if (sid === 'skel') {
    const n = extra.n || 1, big = t > CK('skel', 1, 0);
    out.chip = chip('骨骼动画', 'Skeletal animation');
    const fishN = big ? (t > CK('skel', 1, 0) + 1.8 ? 11000 : 30) : n;
    out.params = { head: 'CPU · JOINTS / FRAME', rows: [{ k: 'fish', v: fmt(fishN), c: 'hot' }, { k: 'joints / fish', v: '60 – 100' }, { k: 'joint updates', v: fmt(fishN * 100), c: fishN > 1000 ? 'bad' : '' }, { k: '× 60 fps', v: fmt(fishN * 100 * 60) + ' /s', c: fishN > 1000 ? 'bad' : '' }],
      opacity: win(t, S('skel') + 0.8, L('skel', 2) + 0.6, 0.5, 0.5) };
    if (n > 1) out.labels.push({ x: 960, y: 980 - 60, zh: '大约 30 条：骨骼方案的上限', en: '≈ 30 fish — the skeletal limit (per the GDC talk)', o: win(t, CK('skel', 1, 0) + 0.8, L('skel', 2) + 0.2, 0.5, 0.4), color: '#ffc46b' });
  }
  if (sid === 'inst') {
    out.chip = chip('一次 draw call', 'One instanced draw');
    const o = win(t, CK('inst', 2, 0) - 0.2, CK('inst', 2, 1) + 2.4, 0.5, 0.6);
    dataTable(extra.data || reef.flocks[0], t, o);
    out.cards.push({ x: 1240, y: 150, w: 600, y_: 'GDC 2017 · ABZÛ', zh: '同一套系统原本用于草地与植被', en: 'An instancing system usually used for grass and foliage', o: win(t, L('inst', 1) - 0.1, CK('inst', 2, 0) - 0.3, 0.5, 0.4) });
    out.labels.push({ x: 960, y: 140, zh: '4,096 个实例 · 1 次绘制', en: '4,096 INSTANCES · 1 DRAW CALL', o: win(t, CK('inst', 0, 1) + 0.6, L('inst', 1) + 0.4, 0.5, 0.5) });
    out.labels.push({ x: 960, y: 760, zh: '1 个静态网格', en: `1 STATIC MESH · ${fishGeometry('jack').userData.verts} VERTS`, o: win(t, S('inst') + 0.6, CK('inst', 0, 1) - 0.2, 0.5, 0.4), color: '#5ad1ff' });
  }
  if (sid === 'swim') {
    out.chip = chip('顶点动画', 'Vertex animation');
    pip(CLIPS.swim, S('swim') + 0.6, L('swim', 1) + 0.3, ['GDC 原片：虚幻引擎里的游动着色器', 'GDC 2017 · swim shader in UE4']);
    const on = extra.on || [0, 0, 0, 0];
    const names = [['① 左右平移', 'side to side'], ['② 偏航', 'yaw pivot'], ['③ 脊椎波', 'spine wave'], ['④ 扭转', 'twist'], ['蒙板 · 只动后半身', 'mask: back half']];
    if (t > L('swim', 1) - 0.3) out.params = { head: 'FISH_VS · LAYERS', rows: names.map((n, i) => ({ k: n[0], v: (i < 4 ? on[i] : extra.mask) > 0.5 ? 'ON' : 'off', c: (i < 4 ? on[i] : extra.mask) > 0.5 ? 'good' : '' })), opacity: win(t, L('swim', 1) - 0.3, E('swim'), 0.5, 0.5) };
    out.labels.push({ x: 1250, y: 760, zh: '静止姿态', en: 'rest pose (wireframe)', o: win(t, L('swim', 1), CK('swim', 3, 0), 0.5, 0.5) * 0.9, plain: true, color: '#9fb0c6' });
  }
  if (sid === 'phase') {
    out.chip = chip('相位', 'Phase');
    const rnd = t > CK('phase', 0, 1);
    if (t < L('phase', 1) - 0.4) out.labels.push({ x: 960, y: 150, zh: rnd ? '每条鱼的起始相位不同' : '相位相同：整齐划一', en: rnd ? 'random start phase per fish' : 'same phase: lockstep', o: win(t, S('phase') + 0.6, L('phase', 1) - 0.5, 0.4, 0.4), color: rnd ? '#7be3b5' : '#ff6b6b' });
    phaseGraph(extra, t, win(t, L('phase', 1) - 0.2, E('phase'), 0.5, 0.5));
  }
  if (sid === 'bite') {
    out.chip = chip('混合变形', 'Blendshapes');
    pip(CLIPS.bite, S('bite') + 0.6, L('bite', 2) - 0.4, ['GDC 原片：用混合变形做的咬合', 'GDC 2017 · bite blendshape sequence'], [1240, 190, 640, 360]);
    pip(CLIPS.crab, L('bite', 2) - 0.2, E('bite') + 0.3, ['GDC 原片：螃蟹 4 个腿部姿势', 'GDC 2017 · crab poses (would need 41 joints)'], [1000, 130, 880, 495]);
    if (t < L('bite', 2) - 0.3) out.params = { head: 'BLENDSHAPE WEIGHTS', rows: [{ k: 'aOpen   张嘴', v: (extra.open || 0).toFixed(2), c: (extra.open || 0) > 0.05 ? 'hot' : '' }, { k: 'aLunge  前伸', v: (extra.lunge || 0).toFixed(2), c: (extra.lunge || 0) > 0.05 ? 'hot' : '' }],
      opacity: win(t, L('bite', 1) - 0.4, L('bite', 2) - 0.3, 0.5, 0.4) };
    if (out.params) out.params.opacity *= 1 - win(t, S('bite') + 0.6, L('bite', 2) - 0.4, 0.5, 0.5) * 0;
  }
  if (sid === 'curl') {
    out.chip = chip('转弯卷曲', 'Turning curl');
    if (t < L('curl', 2) - 0.3) {
      pip(CLIPS.curl, S('curl') + 0.5, L('curl', 1) - 0.2, ['GDC 原片：鲨鱼转弯', 'GDC 2017 · shark turning']);
      pip(CLIPS.bspace, L('curl', 1), L('curl', 2) - 0.4, ['GDC 原片：四个卷曲姿态组成的混合空间', 'GDC 2017 · blendshape blendspace']);
      const o = win(t, S('curl') + 0.5, L('curl', 2) - 0.3, 0.5, 0.3);
      out.labels.push({ x: 540, y: 160, zh: '无卷曲：像木板', en: 'no curl: a rigid plank', o, color: '#ff6b6b' });
      out.labels.push({ x: 960 + 300, y: 560 + 380, zh: '按转向插值卷曲姿态', en: 'curl poses blended by turn rate', o: o * ramp(t, L('curl', 1), L('curl', 1) + 0.5), color: '#7be3b5' });
    } else {
      const o = win(t, L('curl', 2), E('curl') + 0.3, 0.5, 0.5);
      const xs = [1420, 960, 500];
      [['向左卷曲', 'curl X'], ['左 + 上 直接叠加', 'X + Y (additive)'], ['+ 修正形状', 'X + Y + correction']].forEach((l, k) =>
        out.labels.push({ x: xs[k], y: 300, zh: l[0], en: l[1], o: o * (k < 2 ? 1 : ramp(t, L('curl', 3) - 0.3, L('curl', 3) + 0.3)), color: k === 1 ? '#ff6b6b' : k === 2 ? '#7be3b5' : '#fff' }));
    }
  }
  if (sid === 'school' || sid === 'bridge') {
    out.chip = chip('7 种鱼 · 7 次绘制', '7 species, 7 draw calls');
    const rows = SCHOOLS.map(s => ({ k: `${SPECIES[s.kind].zh}`, v: fmt(s.tex * s.tex) }));
    out.params = { head: 'REEF · INSTANCES', rows: [...rows, { k: 'total', v: fmt(SCHOOLS.reduce((a, s) => a + s.tex * s.tex, 0)), c: 'hot' }, { k: 'draw calls', v: SCHOOLS.length + ' (+1 鲨鱼)', c: 'good' }], opacity: win(t, S('school') + 0.8, L('bridge', 0) + 0.2, 0.5, 0.6) };
    out.subsBox = true;
  }
  if (sid === 'bridge') {
    const o = win(t, S('bridge') + 0.4, E('bridge') + 0.2, 0.6, 0.6);
    out.cards.push({ x: 300, y: 330, w: 520, big: true, y_: 'DATA · 每个实例', zh: '32 字节 × 10,240', en: 'position · phase · velocity · yaw', o });
    out.cards.push({ x: 1100, y: 330, w: 520, big: true, y_: 'CODE · 所有实例共用', zh: '1 段顶点着色器', en: 'one shared vertex shader', o: o * ramp(t, CK('bridge', 0, 1) - 0.2, CK('bridge', 0, 1) + 0.4) });
    out.labels.push({ x: 960, y: 680, zh: '→ Entity · Component · System', en: 'next: ECS', o: o * ramp(t, L('bridge', 1) + 0.6, L('bridge', 1) + 1.2), color: '#ffb35c' });
  }
  if (sid === 'final') {
    const tc = win(t, S('final') + 0.1, L('final', 1) - 0.5, 0.7, 0.6);
    out.title = { opacity: tc, k: '下期预告 · NEXT · EP03', h: 'ECS：一万个敌人', e: 'From Overwatch to World War Z', tags: ['Entity', 'Component', 'System'], top: 320, size: 80 };
    out.subsBox = true;
  }
  return out;
}

export default {
  brand: BRAND,
  events,
  async init() {
    renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
    await loadSource('fish', new URL('./sims/fish.js', import.meta.url));
    await loadSource('gf', new URL('../core/sims/gpuflock.js', import.meta.url));
    buildReef(); buildLab(); build();
    hero();                        // pick the hero fish before any frame (picking re-simulates to S0)
    window.DBG = { reef, lab, hero, reefAt, THREE };
  },
  frame,
};
