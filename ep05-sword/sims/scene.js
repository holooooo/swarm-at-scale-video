// EP05 · the whole 3D world in one place: peaks, clouds, sky, the two characters, 16,001 swords.
// pose(t), heroSword(t) and the sim are pure functions of film time t.
import * as THREE from 'three';
import { worldUniforms, makeSky, makeClouds, rockMaterial, makeLights } from './world.js';
import { Character, loadGLB, windUniforms, GESTURE, mixG } from './rig.js';
import { Swords, enemyPos, HERO_C, HN, H_EVERY } from './swords.js';
import { SwordView } from './swordgl.js';
import { T, motionTime } from './schedule.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
export { T, enemyPos, HERO_C };

export async function buildWorld(END) {
  const u = worldUniforms(); u.uLoop.value = END;
  const wind = windUniforms(END); wind.uWT = u.uTime;
  const base = new URL('../models/', import.meta.url);
  const [gH, gR, gS, gP] = await Promise.all(['heroine', 'rival', 'sword', 'peaks'].map(n => loadGLB(new URL(n + '.glb', base).href)));
  const scene = new THREE.Scene();
  scene.add(makeSky(u)); const clouds = makeClouds(u); scene.add(clouds);
  gP.scene.traverse(o => { if (o.isMesh) { const n = o.material.name; o.material = rockMaterial(u, n === 'pine' ? [0.08, 0.17, 0.13] : n === 'bark' ? [0.17, 0.12, 0.1] : n === 'farrock' ? [0.13, 0.15, 0.2] : [0.22, 0.22, 0.24],
    n === 'pine' ? [0.16, 0.3, 0.2] : n === 'bark' ? [0.24, 0.18, 0.14] : n === 'farrock' ? [0.3, 0.33, 0.36] : [0.42, 0.4, 0.36]); o.frustumCulled = false; } });
  scene.add(gP.scene);
  const lights = makeLights(scene);
  const windR = windUniforms(END); windR.uWT = u.uTime; windR.uWA.value = 0.1;
  const her = new Character(gH, 'heroine', wind), him = new Character(gR, 'rival', windR);
  scene.add(her.root, him.root);
  let swordGeo = null; gS.scene.traverse(o => { if (o.isMesh) swordGeo = o.geometry; });
  const sim = new Swords(T), view = new SwordView(sim, u, swordGeo);
  scene.add(view.group);
  const mount = new THREE.Mesh(swordGeo, new THREE.MeshStandardMaterial({ color: 0x2a2224, metalness: 0.9, roughness: 0.3, emissive: 0x3a0806 }));
  mount.scale.setScalar(3.2); scene.add(mount);
  return { u, wind, scene, clouds, lights, her, him, sim, view, mount, swordGeo, END };
}

// ------------------------------------------------------------------ her poses
const AXX = V3(1, 0, 0), AXY = V3(0, 1, 0);
function heroPose(W, t) {
  const h = W.her, END = W.END, om = 2 * Math.PI / END;
  h.resetPose();
  const breath = Math.sin(t * om * 23);
  // timeline weights: seal (rest), summon (arm raised), circle, point, push, palm guard
  const mt = motionTime(t);
  const up = sm(5.0, 6.4, mt) * (1 - sm(15, 18, mt));
  const ik = 0; // removed only the tutorial target demo; narrative arm IK is retained
  const circ = sm(59.5, 61, mt) * (1 - sm(65.5, 67, mt));
  const point = Math.max(sm(68.6, 70, mt) * (1 - sm(76, 78, mt)), sm(80.8, 82, mt) * (1 - sm(91, 93, mt)), sm(118, 119.5, mt) * (1 - sm(126, 128, mt)));
  const push = sm(131.0, 132.3, mt) * (1 - sm(144.6, 146.4, mt));
  const guard = sm(85.5, 87, mt) * (1 - sm(90, 91.5, mt));
  const lean = 0.06 * push - 0.02 * up + 0.01 * breath;
  h.twist('spine', AXX, lean * 0.6); h.twist('chest', AXX, lean + 0.015 * breath);
  h.twist('chest', AXY, -0.12 * point - 0.18 * push + 0.08 * up);
  h.twist('head', AXX, -0.1 * up + 0.05 * point + 0.03 * Math.sin(t * om * 11));
  h.twist('head', AXY, -0.1 + 0.08 * Math.sin(t * om * 7) - 0.15 * point);
  // right hand: the sword seal in front of the chest
  const seal = { w: V3(-0.075, 1.3 + 0.004 * breath, 0.24), f: V3(0.05, 1, 0.12), p: V3(1, 0, 0.1), pole: V3(-0.55, 0.9, -0.1) };
  const summon = { w: V3(-0.12, 1.95, 0.12), f: V3(0, 1, 0.05), p: V3(0.9, 0, 0.3), pole: V3(-0.6, 1.6, -0.2) };
  const ca = t * 3.0;
  const circle = { w: V3(-0.12 + 0.12 * Math.cos(ca), 1.42 + 0.12 * Math.sin(ca), 0.38), f: V3(0.1, 0.6, 1), p: V3(0.9, -0.3, 0), pole: V3(-0.6, 0.9, 0) };
  const aim = W.aim || V3(0, 14, 78);
  const S = h.worldPos('upperarmR'), toA = aim.clone().sub(S).normalize();
  const pointP = { w: S.clone().addScaledVector(toA, 0.5), f: toA, p: V3(0.7, -0.7, 0), pole: V3(-0.6, 1.0, -0.3) };
  const pushR = { w: V3(-0.1, 1.38, 0.5), f: V3(0, 0.45, 1), p: V3(0.8, -0.5, 0), pole: V3(-0.6, 1.0, 0) };
  const ikP = W.ikTarget ? { w: W.ikTarget.clone(), f: W.ikTarget.clone().sub(S).normalize(), p: V3(0.8, -0.5, 0), pole: V3(-0.7, 0.8, -0.3) } : seal;
  const R = [[seal, 1], [summon, up], [circle, circ], [pointP, point], [pushR, push], [ikP, ik]];
  const mixP = key => { const acc = V3(); let ws = 0; for (const [p, w] of R) { if (w <= 0) continue; const ww = w > 0.999 ? 50 : w / (1 - w + 1e-3); acc.addScaledVector(p[key], ww); ws += ww; } return acc.multiplyScalar(1 / ws); };
  h.armIK('R', mixP('w'), mixP('pole'));
  h.handOrient('R', mixP('f').normalize(), mixP('p').normalize());
  h.fingers('R', mixG(GESTURE.jianzhi, GESTURE.relax, 0));
  // left hand: a fist behind her back; open palm forward when she pushes or guards
  const back = { w: V3(0.12, 1.0, -0.17), f: V3(-1, -0.2, 0), p: V3(0, 0, -1), pole: V3(0.6, 1.0, -0.4) };
  const palm = { w: V3(0.16, 1.4, 0.46), f: V3(0.05, 1, 0.15), p: V3(0, 0, -1), pole: V3(0.6, 0.9, 0) };
  const pw = Math.max(push, guard), L = pw > 0.5 ? palm : back, L2 = pw > 0.5 ? back : palm, k = pw > 0.5 ? 1 - pw : pw;
  h.armIK('L', L.w.clone().lerp(L2.w, k), L.pole.clone().lerp(L2.pole, k));
  h.handOrient('L', L.f.clone().lerp(L2.f, k).normalize(), L.p.clone().lerp(L2.p, k).normalize());
  h.fingers('L', mixG(GESTURE.fist, GESTURE.open, pw));
  return { up, point, push, circ, ik };
}
function rivalPose(W, t) {
  const m = W.him, E = enemyPos(T, t);
  m.root.position.set(E[0], E[1] - 1.25, E[2]); m.root.rotation.set(0, Math.PI, 0); m.root.updateMatrixWorld(true);
  m.resetPose();
  const k = sm(T.roles - 1, T.roles + 1, t) * (1 - sm(T.break, T.break + 1.5, t)), recoil = sm(T.break - 0.2, T.break + 0.6, t) * (1 - sm(T.break + 3, T.break + 6, t));
  m.twist('chest', AXX, -0.25 * recoil);
  const S = m.worldPos('upperarmR'), toH = V3(...HERO_C).sub(S).normalize();
  m.armIK('R', S.clone().addScaledVector(toH, 0.52 * k + 0.2 * (1 - k)).add(V3(0, -0.25 * (1 - k), 0)), S.clone().add(V3(0.6, 0.2, 0.5)));
  m.handOrient('R', toH, V3(0, -1, 0)); m.fingers('R', GESTURE.jianzhi);
  m.armIK('L', V3(E[0] - 0.12, E[1] - 0.25, E[2] + 0.2), V3(E[0] - 0.7, E[1], E[2] + 0.5)); m.fingers('L', GESTURE.fist);
  W.mount.position.set(E[0], E[1] - 1.32, E[2] + 0.6); W.mount.rotation.set(Math.PI / 2, 0, Math.PI);
  return { recoil };
}
// her own sword: rests before her hand, rises with the seal, guards her, comes home
export function heroSword(W, t) {
  const h = W.her, om = 2 * Math.PI / W.END;
  // at rest it lies level just past her fingertips, guard to her left, tip to her right
  const rest = { p: V3(0.33, 1.2 + 0.012 * Math.sin(t * om * 19), 0.46), d: V3(-1, 0.03, -0.12).normalize() };
  const rise = { p: V3(-0.25, 2.6 + 0.08 * Math.sin(t * 1.3), 0.55), d: V3(0, 1, 0) };
  const a = t * 1.9, orb = { p: V3(Math.cos(a) * 2.4, 1.8 + 0.4 * Math.sin(t * 0.9), Math.sin(a) * 2.4), d: V3(-Math.sin(a), 0.1, Math.cos(a)).normalize() };
  const front = { p: V3(0, 1.6, 1.4 + 0.05 * Math.sin(t)), d: V3(0, 0.05, 1).normalize() };
  const mt = motionTime(t);
  const st = [[rest, 1], [rise, sm(5.6, 7.6, mt) * (1 - sm(11.5, 13.5, mt))], [orb, sm(11.5, 13.5, mt) * (1 - sm(66, 67.5, mt)) + sm(81, 82.5, mt) * (1 - sm(155, 159, mt))],
    [front, sm(66, 67.5, mt) * (1 - sm(81, 82.5, mt))]];
  const P = V3(), D = V3(); let ws = 0;
  for (const [s, w] of st) { if (w <= 0) continue; const ww = w > 0.999 ? 50 : w / (1 - w + 1e-3); P.addScaledVector(s.p, ww); D.addScaledVector(s.d, ww); ws += ww; }
  P.multiplyScalar(1 / ws); D.normalize();
  return { p: P.toArray(), d: D.toArray(), vis: 1 };
}

// ------------------------------------------------------------------ one frame of the world
export function updateWorld(W, t, o = {}) {
  W.u.uTime.value = t; W.u.uDim.value = o.dim ?? 0;
  W.sim.advanceTo(Math.round(t * 60));
  const poseInfo = heroPose(W, t), rv = rivalPose(W, t);
  const hs0 = heroSword(W, Math.max(0, t - 1 / 60)), hs = heroSword(W, t);
  hs.v = hs.p.map((x, i) => (x - hs0.p[i]) * 60);
  hs.hist = Array.from({ length: HN }, (_, j) => heroSword(W, Math.max(0, t - (j + 1) * H_EVERY / 60)).p);   // her trail, from the path itself
  const info = W.view.sync(t, hs);
  const show = T.foe - 2 < t && t < T.break + 9;
  W.him.root.visible = W.mount.visible = show;
  const vm = W.view;
  vm.swordMat.uniforms.uRoleTint.value = o.roleTint ?? 0;
  vm.trailMat.uniforms.uTrail.value = o.trail ?? 1;
  vm.shield.position.set(...HERO_C); vm.shield.material.uniforms.uCen.value.set(...HERO_C);
  vm.shield.material.uniforms.uOn.value = sm(T.roles - 0.5, T.roles + 1.5, t) * (1 - sm(T.climax, T.climax + 1.5, t));
  const E = enemyPos(T, t); vm.barrier.position.set(...E); vm.barrier.material.uniforms.uCen.value.set(...E);
  vm.barrier.material.uniforms.uOn.value = sm(T.roles - 0.5, T.roles + 1.5, t) * (1 - sm(T.break, T.break + 0.15, t));
  const br = Math.max(0, t - T.break); vm.barrier.material.uniforms.uBreak.value = br > 0 && br < 1.2 ? (1 - br / 1.2) * 1.5 : 0;
  vm.barrier.scale.setScalar(1 + (br > 0 && br < 1.2 ? br * 2.5 : 0)); vm.barrier.visible = t > T.roles - 1 && t < T.break + 1.3;
  vm.shield.visible = t > T.roles - 1 && t < T.climax + 2;
  return { ...poseInfo, ...rv, ...info };
}
