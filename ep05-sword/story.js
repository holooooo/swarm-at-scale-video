// EP05 · 御剑术：万剑剑阵 — the finale. A Blender-built swordswoman, 10,000 swords of hers, 6,000 of his.
// Everything is a pure function of film time t: the sword ECS steps at 60 Hz with snapshots, her pose is IK
// from t, the clouds and wind loop over the film, and at T.rest every sword is home again, so the last frame
// equals frame 0 (a close-up of her seal and the one sword resting before it).
import * as THREE from 'three';
import { TL, S, E, L, LE, chunks, clamp, ease, ease2, lerp, ramp, win, loadSource } from '../core/film.js';
import { buildWorld, updateWorld, T, enemyPos, HERO_C } from './sims/scene.js';
import { makeDuel, syncDuel, DUEL_C, HITS } from './sims/duel.js';
import { N, N_OWN, R } from './sims/swords.js';
import BENCH from './bench.json' with { type: 'json' };

const W_ = 1920, H = 1080, END = TL.duration, OM = 2 * Math.PI / END;
const CK = (id, k, j) => chunks(TL.scenes.find(s => s.id === id).lines[k])[j].start;
const glc = document.querySelector('#gl'), c2 = document.querySelector('#c2d'), ctx = c2.getContext('2d');
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let renderer, WR, DU, cam, FOCUS = 0;
const SNAP = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }).getContext('2d');
const RN = Object.fromEntries(Object.entries(R).map(([k, v]) => [v, k]));

// ------------------------------------------------------------------ 3D helpers
function look(p, l, up = V3(0, 1, 0)) { cam.up.copy(up); cam.position.copy(p); cam.lookAt(l); cam.updateMatrixWorld(); }
function render3D(clip, o = {}) {
  cam.fov = o.fov ?? 40; cam.near = o.near ?? 0.03; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  WR.u.uDim.value = o.dim ?? 0; WR.view.swordMat.uniforms.uRoleTint.value = o.tint ?? 0;
  renderer.setScissorTest(true); renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
  renderer.render(o.scene || WR.scene, cam); renderer.setScissorTest(false);
}
const proj = p => { const v = p.clone().project(cam); return v.z > 1 || v.z < -1 ? null : [(v.x + 1) / 2 * W_, (1 - v.y) / 2 * H]; };
const spos = i => V3(WR.sim.pos.x[i], WR.sim.pos.y[i], WR.sim.pos.z[i]);
// the loop shot: close on her seal and the resting sword (periodic, so closeCam(END) == closeCam(0))
function closeCam(t) {
  return [V3(-0.78 + 0.05 * Math.sin(t * OM * 2), 1.52 + 0.015 * Math.sin(t * OM * 5), 1.78 + 0.05 * Math.sin(t * OM * 3)), V3(-0.02, 1.38, 0.2)];
}
const WIDE = t => { const a = 2.35 + t * 0.012; return [V3(Math.sin(a) * 44, 4, Math.cos(a) * 44), V3(0, 19, 0)]; };
const TITLE = t => [V3(-22 + t * 0.05, 15, -128), V3(0, 21, 0)];

// ------------------------------------------------------------------ 2D helpers
const C = { txt: '#dbe4ee', dim: '#8fa1b6', hot: '#ff6b6b', good: '#7be3b5', amber: '#ffb35c', cyan: '#5ad1ff', bone: '#ff9a3c' };
function text(s, x, y, o = {}) { ctx.save(); ctx.font = o.font || '600 18px "PingFang SC"'; ctx.fillStyle = o.color || C.txt; ctx.globalAlpha *= o.alpha ?? 1; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); ctx.restore(); }
function rrect(x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function clipTo(clip) { ctx.beginPath(); ctx.rect(clip[0], 0, clip[1] - clip[0], H); ctx.clip(); }
const fmt = n => Math.round(n).toLocaleString('en-US');
const ROLE_C = { [R.ATTACK]: C.amber, [R.GUARD]: C.cyan, [R.SHIELD]: '#f2f4f8', [R.STUN]: '#ff7ab0', [R.FORM]: '#9aa6b5', [R.FALL]: C.hot };
// skeleton overlay: her 33 bones, read from the live three.js skeleton
function skeleton(clip, a) {
  if (a <= 0) return 0;
  ctx.save(); clipTo(clip); ctx.globalAlpha = a; let n = 0;
  for (const k of WR.her.humanoid) {
    const b = WR.her.bones[k]; n++; const p = proj(b.getWorldPosition(V3())); if (!p) continue;
    if (b.parent?.isBone && WR.her.humanoid.includes(b.parent.name.replace(/[^A-Za-z0-9]/g, ''))) { const q = proj(b.parent.getWorldPosition(V3())); if (q) { ctx.strokeStyle = C.bone; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...q); ctx.lineTo(...p); ctx.stroke(); } }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(...p, 3.5, 0, 7); ctx.fill(); ctx.strokeStyle = C.bone; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore(); return n;
}
// IK overlay: shoulder, solved elbow, wrist, and the target
function ikOverlay(clip, a, target) {
  if (a <= 0) return;
  ctx.save(); clipTo(clip); ctx.globalAlpha = a;
  const P = ['upperarmR', 'forearmR', 'handR'].map(n => proj(WR.her.worldPos(n))), tg = proj(target);
  if (P.every(Boolean)) {
    ctx.strokeStyle = C.amber; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...P[0]); ctx.lineTo(...P[1]); ctx.lineTo(...P[2]); ctx.stroke();
    P.forEach((p, i) => { ctx.fillStyle = i === 1 ? C.amber : '#fff'; ctx.beginPath(); ctx.arc(...p, i === 1 ? 9 : 7, 0, 7); ctx.fill(); });
    text('肩 shoulder', P[0][0] + 16, P[0][1] - 18, { font: '600 17px "PingFang SC"' });
    text('肘：自动解出  elbow: solved', P[1][0] + 18, P[1][1] + 22, { font: '600 17px "PingFang SC"', color: C.amber });
  }
  if (tg) {
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(...tg, 16, 0, 7); ctx.moveTo(tg[0] - 26, tg[1]); ctx.lineTo(tg[0] + 26, tg[1]); ctx.moveTo(tg[0], tg[1] - 26); ctx.lineTo(tg[0], tg[1] + 26); ctx.stroke();
    text('目标 target', tg[0] + 24, tg[1] - 26, { font: '600 17px "PingFang SC"', color: C.cyan });
  }
  ctx.restore();
}
// neighbours of the focus sword within the separation / neighbour radius of the sim
function neighbourOverlay(clip, a, grid) {
  if (a <= 0) return 0;
  const s = WR.sim, p0 = spos(FOCUS), near = [];
  for (let j = 0; j < N_OWN; j++) { if (j === FOCUS || s.sword.role[j] === R.REST) continue; const d = spos(j).distanceTo(p0); if (d < 1.6) near.push([d, j]); }
  near.sort((x, y) => x[0] - y[0]);
  ctx.save(); clipTo(clip); ctx.globalAlpha = a;
  const c0 = proj(p0);
  if (grid > 0 && c0) {                             // the 27 cells it reads
    const cs = 1.6, b = [Math.floor(p0.x / cs) - 1, Math.floor(p0.y / cs) - 1, Math.floor(p0.z / cs) - 1];
    ctx.globalAlpha = a * grid; ctx.strokeStyle = 'rgba(255,179,92,0.55)'; ctx.lineWidth = 1.2;
    for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) for (const ax of [0, 1, 2]) {
      const q0 = [0, 0, 0], q1 = [0, 0, 0]; const o = [i, j]; let k = 0;
      for (let d = 0; d < 3; d++) if (d !== ax) { q0[d] = q1[d] = o[k++]; } q0[ax] = 0; q1[ax] = 3;
      const A = proj(V3((b[0] + q0[0]) * cs, (b[1] + q0[1]) * cs, (b[2] + q0[2]) * cs)), B = proj(V3((b[0] + q1[0]) * cs, (b[1] + q1[1]) * cs, (b[2] + q1[2]) * cs));
      if (A && B) { ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke(); }
    }
    ctx.globalAlpha = a;
  }
  for (const [d, j] of near.slice(0, 8)) {
    const q = proj(spos(j)); if (!q || !c0) continue;
    ctx.strokeStyle = d < 1.25 ? C.hot : C.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...c0); ctx.lineTo(...q); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(...q, 4, 0, 7); ctx.fill();
  }
  if (c0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(...c0, 12, 0, 7); ctx.stroke(); }
  ctx.restore(); return Math.min(8, near.length);
}
// the ECS columns of six live swords
const PICK = [];
function pickRows() {
  if (PICK.length) return;
  const s = WR.sim;
  for (const [job, n] of [[R.ATTACK, 2], [R.GUARD, 1], [R.SHIELD, 1]]) for (let i = 0, c = 0; i < N_OWN && c < n; i += 37) if (s.slot.job[i] === job) { PICK.push(i); c++; }
  for (const [job, n] of [[R.ATTACK, 1], [R.GUARD, 1]]) for (let i = N_OWN + 11, c = 0; i < N && c < n; i += 41) if (s.slot.job[i] === job) { PICK.push(i); c++; }
}
function ecsTable(a, x0 = 1060, y0 = 132) {
  if (a <= 0) return;
  pickRows(); const s = WR.sim, w = 820, rh = 40;
  ctx.save(); ctx.globalAlpha = a;
  rrect(x0, y0, w, 64 + PICK.length * rh + 18, 16, 'rgba(8,11,18,0.88)', 'rgba(255,255,255,0.1)');
  const cols = [['id', 0], ['position', 90], ['velocity', 300], ['role', 450], ['target', 590], ['bend', 700]];
  text('COMPONENT COLUMNS · 每列一个 Float32Array', x0 + 22, y0 + 24, { font: '600 13px "SF Mono"', color: C.amber });
  cols.forEach(([c, x]) => text(c, x0 + 22 + x, y0 + 52, { font: '600 14px "SF Mono"', color: C.dim }));
  PICK.forEach((i, r) => {
    const y = y0 + 84 + r * rh, role = s.sword.role[i], rr = role === R.STUN ? s.sword.prev[i] : role, own = i < N_OWN;
    const v = Math.hypot(s.vel.x[i], s.vel.y[i], s.vel.z[i]), bd = Math.hypot(s.bend.x[i], s.bend.y[i], s.bend.z[i]);
    text(String(i), x0 + 22, y, { font: '15px "SF Mono"', color: own ? '#e8f6ff' : '#ff9a8a' });
    text(`${s.pos.x[i].toFixed(1)}, ${s.pos.y[i].toFixed(1)}, ${s.pos.z[i].toFixed(1)}`, x0 + 112, y, { font: '15px "SF Mono"' });
    text(`${v.toFixed(1)} m/s`, x0 + 322, y, { font: '15px "SF Mono"' });
    text((role === R.STUN ? 'STUN·' : '') + (RN[rr] || ''), x0 + 472, y, { font: '600 15px "SF Mono"', color: ROLE_C[role === R.STUN ? R.STUN : rr] || C.txt });
    const tg = s.sword.target[i]; text(rr === R.GUARD && tg >= 0 ? '#' + tg : rr === R.ATTACK ? (own ? 'him' : 'her') : '—', x0 + 612, y, { font: '15px "SF Mono"', color: C.dim });
    rrect(x0 + 722, y - 7, 70, 14, 4, 'rgba(255,255,255,0.08)'); rrect(x0 + 722, y - 7, Math.max(2, 70 * Math.min(1, bd / 0.5)), 14, 4, bd > 0.2 ? C.hot : C.amber);
  });
  ctx.restore();
}
// one tick = five systems, each a loop over the columns it needs
function systemsRow(t, a, y = 150) {
  if (a <= 0) return;
  const sys = [['roleSystem', 'role · prev · until'], ['gridSystem', 'pos → cell'], ['moveSystem', 'pos · vel · target'], ['contactSystem', 'vel · bend'], ['integrateSystem', 'pos · dir']];
  const x0 = 470, w = 230, g = 22, cur = Math.floor((t * 2.4) % sys.length);
  ctx.save(); ctx.globalAlpha = a;
  text('step()  ·  60 次/秒  60 Hz  ·  ' + `${BENCH.battle.msPerStep}–${BENCH.river.msPerStep} ms / step (${BENCH.cpu.replace("Apple ", "")})`, 960, y - 30, { font: '600 15px "SF Mono"', color: C.dim, align: 'center' });
  sys.forEach(([n, c], i) => {
    const x = x0 + i * (w + g), on = i === cur;
    rrect(x, y, w, 76, 12, on ? 'rgba(92,58,20,0.95)' : 'rgba(8,11,18,0.85)', on ? C.amber : 'rgba(255,255,255,0.12)', on ? 2 : 1);
    text(n, x + w / 2, y + 28, { font: '600 17px "SF Mono"', color: on ? '#fff' : C.txt, align: 'center' });
    text(c, x + w / 2, y + 54, { font: '13px "SF Mono"', color: C.dim, align: 'center' });
    if (i < sys.length - 1) text('→', x + w + g / 2, y + 38, { font: '700 18px "SF Mono"', color: C.dim, align: 'center' });
  });
  ctx.restore();
}
// CPU -> GPU: four float textures, then the vertex shader aims and bends
function gpuDiagram(t, a, x0 = 1050, y0 = 140) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  rrect(x0, y0, 830, 330, 18, 'rgba(8,11,18,0.9)', 'rgba(255,255,255,0.1)');
  text('CPU · 每帧上传  per frame', x0 + 24, y0 + 32, { font: '700 17px "PingFang SC"', color: C.amber });
  [['tP', 'x y z · visible'], ['tD', 'tip dir · team·role'], ['tB', 'bend xyz · ring amp'], ['tV', 'velocity · ring phase']].forEach(([n, d], i) => {
    const y = y0 + 64 + i * 52; rrect(x0 + 24, y, 300, 40, 8, 'rgba(90,209,255,0.1)', 'rgba(90,209,255,0.35)');
    text(n, x0 + 40, y + 20, { font: '700 16px "SF Mono"', color: C.cyan }); text(d, x0 + 90, y + 20, { font: '14px "SF Mono"' });
  });
  text('4 × vec4 = 64 B × 16,001 = 1.0 MB  · + trail history', x0 + 24, y0 + 290, { font: '600 15px "SF Mono"', color: C.txt });
  const k = (t * 0.8) % 1; for (let i = 0; i < 5; i++) { const x = lerp(x0 + 340, x0 + 470, (k + i / 5) % 1); rrect(x, y0 + 158, 18, 12, 3, 'rgba(90,209,255,0.85)'); }
  text('GPU · 顶点着色器  vertex shader', x0 + 500, y0 + 32, { font: '700 17px "PingFang SC"', color: C.good });
  ['fwd = normalize(D.xyz)', 'side = cross(fwd, up)', 'κ = 2|B| + amp · sin(φ)', 'p = arc(y, κ) · hilt rigid', '→ 1 draw · 16,001 swords', '+ 1 trails · + 1 sparks'].forEach((s, i) =>
    text(s, x0 + 500, y0 + 76 + i * 36, { font: '15px "SF Mono"', color: i >= 4 ? C.good : C.txt }));
  ctx.restore();
}
// the bend curve: offset grows with y², and a decaying sine rings on top
function bendGraph(st, a, x0 = 1180, y0 = 150) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  rrect(x0, y0, 700, 470, 18, 'rgba(8,11,18,0.88)', 'rgba(255,255,255,0.1)');
  text('剑身偏移  blade offset = κ · y² / 2，κ = 弯曲 + 颤动', x0 + 24, y0 + 30, { font: '700 16px "PingFang SC"', color: C.amber });
  const gx = x0 + 60, gy = y0 + 250, gw = 580, gh = 180;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - gh); ctx.stroke();
  text('护手 guard', gx, gy + 18, { font: '13px "PingFang SC"', color: C.dim }); text('剑尖 tip  y = 1', gx + gw, gy + 18, { font: '13px "PingFang SC"', color: C.dim, align: 'right' });
  const kap = (2 * st.bend + 0.6 * st.amp * Math.sin(st.ph)), off = y => y * y * 0.5 * kap / 0.6;
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 3.5; ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const y = i / 40; ctx.lineTo(gx + y * gw, gy - off(y) * gh); } ctx.stroke();
  ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(255,179,92,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const y = i / 40; ctx.lineTo(gx + y * gw, gy - y * y * st.bend / 0.6 * gh); } ctx.stroke(); ctx.setLineDash([]);
  text('剑柄不弯，随剑根转  hilt stays straight', gx + gw / 2, gy + 18, { font: '13px "PingFang SC"', color: C.dim, align: 'center' });
  text('塑性弯曲（撞几次，弯几分）plastic bend', gx + 10, gy - gh - 6, { font: '13px "PingFang SC"', color: C.amber });
  // ring amplitude over time
  const ty = y0 + 300, th = 120;
  text('颤动  ring = amp · e^(−t/τ) · sin(ωt)', x0 + 24, ty + 10, { font: '600 14px "SF Mono"', color: C.dim });
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(gx, ty + 30 + th / 2); ctx.lineTo(gx + gw, ty + 30 + th / 2); ctx.stroke();
  ctx.strokeStyle = C.hot; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i <= 120; i++) { const u = i / 120 * 6; const v = st.k ? (u <= st.age ? Math.exp(-u * 0.55) * Math.sin(u * 2 * Math.PI * 1.1) : NaN) : 0; if (!isNaN(v)) ctx.lineTo(gx + i / 120 * gw, ty + 30 + th / 2 - v * th * 0.45); }
  ctx.stroke(); ctx.restore();
}
function outroCards(t, a) {
  const cs = [['EP01', '鸟群 · 局部规则', 'boids · spatial grid'], ['EP02', '鱼群 · 顶点动画', 'instancing · vertex anim'], ['EP03', '尸潮 · ECS', 'data apart from logic'],
    ['EP04', '万板 · 交给 GPU', 'stateless GPU'], ['EP05', '万剑 · 合在一起', 'all of the above']];
  return cs.map((c, i) => ({ x: 92 + i * 352, y: 330, w: 330, y_: c[0], zh: c[1], en: c[2], o: a * ramp(t, S('outro') + 0.4 + i * 0.7, S('outro') + 1.0 + i * 0.7) }));
}
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
let FOOT = null, X = {};
const CLIP = (dir, count) => ({ dir: 'media/' + dir, fps: 30, count });
const CLIPS = { swim: CLIP('abzu_swim', 540) };
const LOW = t => { const a = -0.55 + (t - (L('recall', 1) - 0.353)) * 0.03; return [V3(Math.sin(a) * 30, 0.5, Math.cos(a) * 30), V3(0, 9, 0)]; };

function build() {
  // intro: the loop frame, then she raises the seal and the camera cranes back as the swords come up
  shot(0, (c, t) => {
    const k = ease2(ramp(t, 6.0, 12.5)), k2 = ease2(ramp(t, 12.5, E('intro') + 0.6));
    const [p0, l0] = closeCam(t), p1 = V3(-9, 1.5, 15), l1 = V3(0, 6, 0), [p2, l2] = WIDE(t);
    const p = p0.clone().lerp(p1, k).lerp(p2, k2), l = l0.clone().lerp(l1, k).lerp(l2, k2);
    look(p, l); render3D(c, { fov: lerp(36, 52, k) });
  });
  shot(S('title') - 0.4, (c, t) => { const [p, l] = TITLE(t); look(p, l); render3D(c, { fov: 46 }); }, { dissolve: 1.2 });
  // flock: the vortex, then ride along with one sword and show who it listens to
  shot(S('flock'), (c, t) => { const [p, l] = WIDE(t); look(p, l); render3D(c, { fov: 50 }); }, { wipe: 1.1 });
  shot(L('flock', 1) - 0.3, (c, t) => {
    const s = WR.sim, p = spos(FOCUS), v = V3(s.vel.x[FOCUS], s.vel.y[FOCUS], s.vel.z[FOCUS]).normalize();
    const out = V3(p.x, 0, p.z).normalize(), k = ease2(ramp(t, LE('flock', 2) - 2.8, E('flock') + 0.2));
    const chase = p.clone().addScaledVector(v, -3.2).addScaledVector(out, 1.6).add(V3(0, 1.1, 0)), cl = p.clone().addScaledVector(v, 2);
    const aer = V3(-16, 50, -38), al = V3(0, 14, 16);
    look(chase.lerp(aer, k), cl.lerp(al, k)); render3D(c, { fov: lerp(52, 50, k) });
    const g = win(t, CK('flock', 2, 1) - 0.3, E('flock') - 3, 0.5, 0.6);
    X.nb = neighbourOverlay(c, win(t, L('flock', 1) + 0.6, E('flock') - 3, 0.5, 0.6), g);
  }, { wipe: 1.0 });
  // ecs: the rival arrives; the columns; roles in colour; the five systems
  shot(S('ecs'), (c, t) => { look(V3(-1.6, 4.2, -6.5).lerp(V3(-3, 6, -9), ramp(t, S('ecs'), L('ecs', 1))), V3(0, 13, 50)); render3D(c, { fov: 44 }); }, { wipe: 1.0 });
  shot(L('ecs', 1) - 0.3, (c, t) => { const u = t - L('ecs', 1); look(V3(-62 + u * 0.4, 20, 40), V3(0, 13, 44)); render3D(c, { fov: 46 }); ecsTable(win(t, L('ecs', 1) + 0.6, E('ecs') + 0.3, 0.5, 0.4)); }, { wipe: 1.0 });
  shot(L('ecs', 2) - 0.3, (c, t) => { const u = t - L('ecs', 2); look(V3(-26 + u * 0.3, 72, 4), V3(0, 6, 44)); render3D(c, { fov: 50, tint: win(t, L('ecs', 2), E('ecs') + 1.2, 0.8, 0.6) }); },
    { wipe: 1.0, labA: ['原色', 'AS SEEN'], labB: ['按角色着色', 'COLOURED BY ROLE'] });
  shot(L('ecs', 3) - 0.3, (c, t) => { const u = t - L('ecs', 3); look(V3(22 - u * 0.5, 16, 12), V3(0, 9, 46)); render3D(c, { fov: 48, tint: win(t, S('ecs'), E('ecs') + 0.4, 0.5, 0.6) }); systemsRow(t, win(t, L('ecs', 3) + 0.2, E('ecs') + 0.2, 0.4, 0.4)); }, { wipe: 0.9 });
  // bend: in the clash zone, then the slow-motion lab, then her shield taking hits
  shot(S('bend'), (c, t) => { const u = t - S('bend'); look(V3(9 - u * 0.25, 13, 30 + u * 0.3), V3(-1, 10, 46)); render3D(c, { fov: 50 }); }, { wipe: 1.0 });
  shot(L('bend', 1) - 0.4, (c, t) => {
    const u = t - (L('bend', 1) - 0.4), st = syncDuel(DU, u); X.duel = st;
    look(DUEL_C.clone().add(V3(-0.5 + u * 0.02, 0.45, 3.3)), DUEL_C.clone().add(V3(-0.25, 0.1, 0))); render3D(c, { scene: DU.scene, fov: 40 });
    bendGraph(st, win(t, L('bend', 1) + 0.6, E('bend') - 3.6, 0.5, 0.5));
  }, { wipe: 1.0, labA: ['战场', 'BATTLE'], labB: ['慢动作 · 两把剑', 'SLOW MOTION · TWO SWORDS'] });
  shot(L('bend', 2) - 0.4, (c, t) => { look(V3(1.3, 1.9, -2.2), V3(-0.4, 2.2, 10)); render3D(c, { fov: 62 }); }, { wipe: 1.0 });
  // gpu: the whole battle from outside, then near him
  shot(S('gpu'), (c, t) => { const a = 1.0 + (t - S('gpu')) * 0.03; look(V3(Math.sin(a) * 95, 34, 40 + Math.cos(a) * 95), V3(0, 8, 40)); render3D(c, { fov: 42 }); gpuDiagram(t, win(t, S('gpu') + 0.5, L('gpu', 2) - 0.2, 0.5, 0.5)); }, { wipe: 1.1 });
  shot(L('gpu', 2) - 0.4, (c, t) => { const E_ = enemyPos(T, t), u = t - L('gpu', 2); look(V3(E_[0] - 9 + u * 0.3, E_[1] + 2.5, E_[2] - 15), V3(E_[0], E_[1] - 1, E_[2])); render3D(c, { fov: 50 }); }, { wipe: 1.0 });
  // climax: the push, the river, the break, the fall
  shot(S('climax') - 0.2, (c, t) => { look(V3(-0.9, 1.25, 2.3), V3(0, 1.45, 0)); render3D(c, { fov: 42 }); }, { wipe: 0.8 });
  shot(L('climax', 1) - 0.1, (c, t) => { const u = t - L('climax', 1); look(V3(1.2, 2.4 + u * 0.4, -4.5 - u * 0.4), V3(0, 6, 40)); render3D(c, { fov: 56 }); }, { dissolve: 0.5 });
  shot(CK('climax', 1, 1) - 0.25, (c, t) => { const E_ = enemyPos(T, t), Eb = WR.sim.Eb, u = t - CK('climax', 1, 1); look(V3(Eb[0] + 14, Eb[1] + 3, Eb[2] - 20 - u * 0.6), V3(E_[0], lerp(E_[1], Eb[1] - 14, ease(ramp(t, L('climax', 2) - 0.3, E('climax')))), E_[2])); render3D(c, { fov: 52 }); }, { wipe: 0.8 });
  // recall: close on the seal, then a low orbit watching them come home
  shot(S('recall') - 0.2, (c, t) => { const [p, l] = closeCam(t); look(p.clone().add(V3(-0.6, 0.2, 1.6)), l.clone().add(V3(0, -0.1, 0))); render3D(c, { fov: 44 }); }, { wipe: 0.9 });
  shot(L('recall', 1) - 0.3, (c, t) => { const [p, l] = LOW(t); look(p, l); render3D(c, { fov: 54 }); }, { dissolve: 0.9 });
  // outro: the far view; then back to the loop frame
  shot(S('outro') - 0.3, (c, t) => {
    const k = ease2(ramp(t, LE('outro', 1) - 0.6, END - 0.4));
    const p0 = V3(-34 + (t - S('outro')) * 0.4, 7, -58), l0 = V3(0, 7, 0), [p1, l1] = closeCam(t), mid = V3(-9, 4, 14);
    const p = k < 0.5 ? p0.clone().lerp(mid, k * 2) : mid.clone().lerp(p1, (k - 0.5) * 2), l = l0.clone().lerp(l1, ease(k));
    look(p, l); render3D(c, { fov: lerp(46, 36, ease(ramp(k, 0.5, 1))) });
  }, { dissolve: 1.2 });
  for (const s of shots) if (s.t0 > 0.05 && (s.wipe || s.dissolve)) events.push({ t: +s.t0.toFixed(3), wipe: s.wipe || s.dissolve });
}
// ------------------------------------------------------------------ overlay
const BRAND = ['万象成群 · 第五期 · 终章', 'Swarms at Scale · EP05 · Finale'];
const CH = [
  { id: 'flock', step: '01 / 04', zh: '剑群就是鸟群', en: 'A flock of swords' },
  { id: 'ecs', step: '02 / 04', zh: '每把剑都是一个实体', en: 'Every sword is an entity' },
  { id: 'bend', step: '03 / 04', zh: '碰撞写弯曲，着色器来弯', en: 'Collisions write, the shader bends' },
  { id: 'gpu', step: '04 / 04', zh: '一万六千把，一次绘制', en: '16,000 swords, one draw' },
];
const DESC = {
  flock: ['分离 + 对齐 + 绕她旋转；邻居只查周围 27 个格子，最多看 8 把。', 'Separation + alignment + a swirl around her; neighbours come from the 27 nearby cells, 8 at most.'],
  ecs: ['组件是成列的数字，系统是一个个循环；角色由剑的编号哈希决定。', 'Components are columns of numbers, systems are plain loops; each role comes from a hash of the id.'],
  bend: ['撞击方向去掉沿剑身的分量，累加进弯曲；颤动随时间衰减。', 'The hit direction, minus its part along the blade, adds to the bend; the ringing decays over time.'],
  gpu: ['每把剑 4 个 vec4 写进浮点纹理；朝向、弯曲、剑光都在顶点着色器里。', 'Four vec4s per sword go into float textures; aiming, bending and trails run in the vertex shader.'],
};
function panelFor(t) {
  const k = CH.findIndex(c => t >= S(c.id) && t < E(c.id));
  if (k < 0) return null;
  const c = CH[k], s0 = S(c.id), s1 = E(c.id);
  const P = { step: c.step, zh: c.zh, en: c.en, dots: { n: CH.length, cur: k, frac: (t - s0) / (s1 - s0) }, opacity: win(t, s0 + 0.5, s1 + 0.2, 0.6, 0.5), desc: DESC[c.id] };
  const q = (() => { const s = TL.scenes.find(x => x.id === c.id); let r = 0; s.lines.forEach((l, i) => { if (t >= l.start - 0.3) r = i; }); return r; })();
  if (c.id === 'flock' && q >= 1) P.code = { src: 'swords', region: 'boids', file: 'swords.js · orbit()', since: L('flock', 1), hl: q === 1 ? ['// separation', '// alignment'] : ['tx * vt'] };
  if (c.id === 'ecs' && q === 1) P.code = { src: 'swords', region: 'columns', file: 'swords.js · components', since: L('ecs', 1) + 0.3, hl: ['this.sword', 'this.bend'] };
  if (c.id === 'ecs' && q === 3) P.code = { src: 'swords', region: 'tick', file: 'swords.js · step()', since: L('ecs', 3) - 0.2, hl: ['System('] };
  if (c.id === 'bend' && q === 0) P.code = { src: 'swords', region: 'clash', file: 'swords.js · clash() / hit()', since: L('bend', 0) + 0.6, hl: ['keep only the part', 'b.wob[e] = 1'] };
  if (c.id === 'bend' && q === 1) P.code = { src: 'swordgl', region: 'bendVS', file: 'swordgl.js · SWORD_VS', since: L('bend', 1), hl: ['float k = y * y', 'float th = kappa'], lang: 'GLSL ES 3.0' };
  if (c.id === 'gpu' && q === 0) P.code = { src: 'swordgl', region: 'upload', file: 'swordgl.js · sync()', since: L('gpu', 0) + 0.4, hl: ['P[k] = pos.x[i]', 'B[k] = bend.x[i]'] };
  if (c.id === 'gpu' && q >= 1) P.code = { src: 'swordgl', region: 'aimVS', file: 'swordgl.js · SWORD_VS', since: L('gpu', 1), hl: ['vec3 side', 'vec3 flat_'], lang: 'GLSL ES 3.0' };
  return P;
}

async function frame(t) {
  FOOT = null; X = {};
  renderer.setScissorTest(false); renderer.setRenderTarget(null);
  renderer.setClearColor(0x05070b, 1); renderer.clear();
  ctx.clearRect(0, 0, W_, H);
  WR.aim = new THREE.Vector3(...enemyPos(T, Math.max(t, T.foe)));
  const info = updateWorld(WR, t);
  const act = activeShots(t);
  if (act.u != null) {
    const x = Math.round(act.u * W_);
    act.prev.draw([x, W_], t); act.cur.draw([0, x], t);
  } else if (act.a != null) {
    // dissolve: snapshot the old shot (3D + its 2D overlay), draw the new one, lay the snapshot over it fading out
    act.prev.draw([0, W_], t);
    SNAP.clearRect(0, 0, W_, H); SNAP.drawImage(glc, 0, 0); SNAP.drawImage(c2, 0, 0);
    renderer.clear(); ctx.clearRect(0, 0, W_, H);
    act.cur.draw([0, W_], t);
    ctx.save(); ctx.globalAlpha = 1 - act.a; ctx.drawImage(SNAP.canvas, 0, 0); ctx.restore();
  } else act.cur.draw([0, W_], t);
  const out = { foot: FOOT, wipe: act.u != null ? { u: act.u, labA: act.cur.labA, labB: act.cur.labB } : null, labels: [], cards: [] };
  const sid = TL.scenes.find(s => t >= s.start && t < s.end)?.id || 'outro';
  out.brand = Math.min(ease(ramp(t, S('title') - 0.4, S('title') + 0.6)), 1 - ease(ramp(t, L('outro', 2) - 0.6, L('outro', 2) + 0.6)));
  out.panel = panelFor(t);
  const chip = (zh, en, real) => ({ zh, en, real, opacity: Math.max(out.brand, sid === 'intro' ? win(t, 0.6, E('intro'), 0.8, 0.5) : 0) });
  const pip = (clip, a, b, label, rect) => { const o = win(t, a, b, 0.5, 0.5); if (o <= 0) return; out.frame = { clip, t: clamp(t - a, 0, clip.count / 30 - 0.05), opacity: o, rect }; out.labels.push({ x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] + 26, zh: label[0], en: label[1], o, plain: true }); };
  const c = WR.sim.counts(), risen = N_OWN - c.own[R.REST];
  if (sid === 'intro') {
    out.chip = chip('three.js · Blender 模型 · 实时', 'Real-time three.js · Blender model');
    if (t > L('intro', 1) - 0.4) out.labels.push({ x: 960, y: 150, zh: `${fmt(risen)} 把剑`, en: 'SWORDS RISEN', o: win(t, L('intro', 1) + 0.3, E('intro') - 0.5, 0.4, 0.6), color: '#bff4ff' });
    out.subsBox = true;
  }
  if (sid === 'title') {
    out.title = { opacity: win(t, S('title') + 0.1, E('title') - 0.2, 0.7, 0.6), k: '万象成群 · 第五期 · 终章 · EP05', h: '御剑术：一万把飞剑', e: 'Ten thousand flying swords', tags: ['鸟群', '顶点动画', 'ECS', 'GPU 实例化'], top: 300, size: 84 };
    out.chip = chip('一万把剑的剑旋风', 'A whirlwind of 10,000 swords');
  }
  if (sid === 'flock') {
    out.chip = chip('剑旋风 · 一万把', 'Vortex of 10,000');
    const r1 = [['分离', 'separation', C.hot], ['对齐', 'alignment', C.cyan], ['绕她旋转', 'swirl', C.amber]];
    r1.forEach((r, i) => out.cards.push({ x: 560 + i * 280, y: 120, w: 250, y_: `RULE ${i + 1}`, zh: r[0], en: r[1], o: win(t, CK('flock', 1, 1) - 0.2 + i * 0.9, E('flock') - 2.8, 0.4, 0.5) }));
    out.params = { head: 'FLOCK · PER STEP', rows: [{ k: 'swords', v: fmt(risen), c: 'hot' }, { k: 'neighbour checks', v: fmt(WR.sim.lastChecks), c: 'good' }, { k: 'all pairs would be', v: fmt(N_OWN * (N_OWN - 1) / 2), c: 'bad' }, { k: 'neighbours used', v: X.nb != null ? `${X.nb} / 8` : '≤ 8' }],
      opacity: win(t, L('flock', 1), E('flock'), 0.5, 0.5) };
  }
  if (sid === 'ecs') {
    out.chip = chip(t < L('ecs', 1) ? '敌方 · 六千把赤剑' : '组件 · 系统', t < L('ecs', 1) ? 'The enemy · 6,000 swords' : 'Components · systems');
    if (t >= L('ecs', 2) - 0.3 && t < L('ecs', 3)) {
      const o = win(t, L('ecs', 2) + 0.3, L('ecs', 3) - 0.2, 0.5, 0.5);
      [[R.ATTACK, '进攻', 'attack'], [R.GUARD, '截击', 'intercept'], [R.SHIELD, '剑盾', 'shield']].forEach(([r, z, e], i) =>
        out.labels.push({ x: 1160 + i * 250, y: 150, zh: `${z} ${fmt(c.own[r] + (r === R.SHIELD ? 0 : c.own[R.STUN] * 0))}`, en: e, o, color: ROLE_C[r] }));
    }
    if (t < L('ecs', 1) - 0.3) out.params = { head: 'SWORDS', rows: [{ k: 'hers', v: fmt(N_OWN), c: 'good' }, { k: 'his', v: fmt(N - N_OWN - c.foe[R.HIDDEN]), c: 'bad' }], opacity: win(t, S('ecs') + 1, L('ecs', 1) - 0.3, 0.5, 0.4) };
  }
  if (sid === 'bend') {
    const inLab = t >= L('bend', 1) - 0.4 && t < L('bend', 2) - 0.4;
    out.chip = chip(inLab ? '慢动作实验 · 同一套着色器' : '交锋', inLab ? 'Slow-motion lab · same shader' : 'The clash');
    if (!inLab) {
      let bent = 0; for (let i = 0; i < N_OWN; i++) if (Math.hypot(WR.sim.bend.x[i], WR.sim.bend.y[i], WR.sim.bend.z[i]) > 0.15) bent++;
      out.params = { head: 'CLASH · LIVE', rows: [{ k: 'sparks on screen', v: fmt(info.sparks), c: 'hot' }, { k: 'hits / 0.55 s', v: fmt(info.events) }, { k: 'visibly bent (hers)', v: fmt(bent), c: 'bad' }], opacity: win(t, S('bend') + 0.5, E('bend'), 0.5, 0.5) };
    }
    pip(CLIPS.swim, L('bend', 2) - 0.1, E('bend') + 0.1, ['EP02 · GDC 2017：ABZÛ 的游动着色器', 'GDC 2017 · ABZÛ swim shader'], [1240, 150, 640, 360]);
    if (t > L('bend', 2) - 0.1) out.credit = { k: 'GDC 2017', text: 'Matt Nava (Giant Squid) · “Creating the Art of ABZÛ”', o: win(t, L('bend', 2), E('bend') + 0.1, 0.5, 0.5), top: 540 };
  }
  if (sid === 'gpu') {
    out.chip = chip('全景 · 三次绘制', 'Whole battle · three draws');
    if (t > L('gpu', 2) - 0.4) out.params = { head: 'PER FRAME', rows: [{ k: 'swords', v: fmt(N + 1), c: 'hot' }, { k: 'upload', v: '64 B × 16,001' }, { k: 'sim step', v: `${BENCH.battle.msPerStep} ms` }, { k: 'draw calls (swords)', v: '1 + 1 + 1', c: 'good' }], opacity: win(t, L('gpu', 2), E('gpu'), 0.5, 0.5) };
  }
  if (sid === 'climax') { out.chip = chip('剑河', 'River of blades'); out.subsBox = true; }
  if (sid === 'recall') { out.chip = chip('收剑 · 弯剑回直', 'Recall · bends straighten'); out.subsBox = true; }
  if (sid === 'outro') { out.chip = chip('万象成群 · 五期', 'Five episodes'); out.cards.push(...outroCards(t, win(t, S('outro') + 0.3, L('outro', 2) - 0.4, 0.6, 0.6))); out.subsBox = true; }
  return out;
}

export default {
  brand: BRAND,
  events,
  async init() {
    renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setSize(W_, H, false); renderer.autoClear = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    cam = new THREE.PerspectiveCamera(40, W_ / H, 0.03, 12000);
    for (const [n, f] of [['swords', 'swords.js'], ['swordgl', 'swordgl.js'], ['rig', 'rig.js']]) await loadSource(n, new URL('./sims/' + f, import.meta.url));
    WR = await buildWorld(END); DU = makeDuel(WR.u, WR.swordGeo);
    // the sword we ride along with: mid-height, mid-radius
    let bd = 1e9; for (let i = 0; i < N_OWN; i++) { const d = Math.abs(WR.sim.slot.h[i] - 14) + Math.abs(WR.sim.slot.r[i] - 12); if (d < bd) { bd = d; FOCUS = i; } }
    build();
    window.DBG = { WR, THREE, T };
  },
  frame,
};
