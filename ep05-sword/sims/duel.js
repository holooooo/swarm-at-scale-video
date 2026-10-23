// EP05 · slow-motion lab: two swords, two clashes, drawn with the same shader as the 16,000.
// The bend accumulates (plastic) and rings (a decaying sine), exactly what clash() + bendBlade() do in the film.
import * as THREE from 'three';
import { makeSky, makeClouds } from './world.js';
import { SwordView } from './swordgl.js';
import { HN, H_EVERY } from './swords.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const DUEL_C = V3(0, 40, -160);
export const HITS = [3.0, 9.6];                  // film seconds after the shot starts
const BEND = [0.16, 0.3];                         // plastic bend after each hit

export function makeDuel(u, geo) {
  const scene = new THREE.Scene(); scene.add(makeSky(u), makeClouds(u));
  const v = new SwordView(null, u, geo);
  v.swords.geometry.instanceCount = 2; v.trails.geometry.instanceCount = 2; v.shield.visible = v.barrier.visible = false;
  v.sparkMat.uniforms.uTime = { value: 0 }; v.swordMat.uniforms.uFaceZ = { value: 1 };
  scene.add(v.group);
  return { scene, v };
}
// state of both swords at time u (seconds since the shot started)
export function duelState(u) {
  const out = [];
  const k = HITS.filter(h => u >= h).length, lastHit = k ? HITS[k - 1] : -9;
  const bend = k ? BEND[k - 1] : 0, age = u - lastHit;
  for (const s of [0, 1]) {
    const sg = s ? -1 : 1, dir = V3(sg, 0.22, 0.12 * sg).normalize();
    // each pass: approach slowly, strike mid-blade, drift apart; then come round again
    const next = HITS.find(h => h > u) ?? 99, prevH = lastHit;
    let off;
    if (next < 99 && next - u < 3.0) off = (next - u) * 0.55;            // approaching
    else off = -Math.min(u - prevH, 3.2) * 0.12;                         // rebounding
    if (!k && next - u >= 3.0) off = 1.65;
    const mid = DUEL_C.clone().add(V3(0, sg * 0.05, 0));
    const p = mid.clone().addScaledVector(dir, -0.6).addScaledVector(V3(sg, 0, 0), -off).add(V3(0, -sg * Math.max(0, off) * 0.15, 0));
    const B = V3(0, -sg, 0).addScaledVector(dir, sg * dir.y).normalize().multiplyScalar(bend);
    const amp = k ? Math.exp(-age * 0.55) : 0, ph = age * 2 * Math.PI * 1.1;
    out.push({ p, dir, B, amp, ph, vel: dir.clone().multiplyScalar(next - u < 3.0 ? 3 : -1) });
  }
  return { swords: out, bend, amp: k ? Math.exp(-age * 0.55) : 0, ph: k ? age * 2 * Math.PI * 1.1 : 0, k, age };
}
export function syncDuel(D, u) {
  const st = duelState(u), v = D.v, P = v.tP.image.data, Dd = v.tD.image.data, B = v.tB.image.data, Vv = v.tV.image.data;
  st.swords.forEach((s, i) => {
    const k = i * 4;
    P.set([s.p.x, s.p.y, s.p.z, 1], k); Dd.set([s.dir.x, s.dir.y, s.dir.z, i * 16 + 4], k);
    B.set([s.B.x, s.B.y, s.B.z, s.amp], k); Vv.set([s.vel.x, s.vel.y, s.vel.z, s.ph], k);
  });
  const Hd = v.tH.image.data;                       // trails from the same function, a few frames back
  for (let j = 0; j < HN; j++) duelState(u - (j + 1) * H_EVERY / 60).swords.forEach((s, i) => Hd.set([s.p.x, s.p.y, s.p.z], (i * HN + j) * 4));
  v.tP.needsUpdate = v.tD.needsUpdate = v.tB.needsUpdate = v.tV.needsUpdate = v.tH.needsUpdate = true;
  // sparks at each contact, on a slowed clock
  const pa = v.sparks.geometry.attributes.position.array, ia = v.sparks.geometry.attributes.aInfo.array; let n = 0;
  HITS.forEach((h, j) => { for (let q = 0; q < 400; q++, n++) { pa.set([DUEL_C.x, DUEL_C.y, DUEL_C.z], n * 3); ia.set([j * 10, 0], n * 2); } });
  const kk = HITS.filter(h => u >= h).length; v.sparkMat.uniforms.uTime.value = kk ? (kk - 1) * 10 + (u - HITS[kk - 1]) * 0.22 : -5;
  v.sparks.geometry.setDrawRange(0, n); v.sparks.geometry.attributes.position.needsUpdate = v.sparks.geometry.attributes.aInfo.needsUpdate = true;
  return st;
}
