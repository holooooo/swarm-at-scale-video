// EP03 · ECS — from Overwatch to World War Z. 8,192 zombies on a tiny typed-array ECS.
// frame(t) is a pure function of t (the horde re-simulates from snapshots). Frame END == frame 0.
import * as THREE from 'three';
import { TL, S, E, VE, L, LE, chunks, clamp, ease, ease2, lerp, ramp, win, loadSource } from '../core/film.js';
import { Horde, LV, GW, GH } from './sims/ecs.js';
import { HordeView, fogUniforms } from './sims/zombie.js';
import { makeCity, makeFlowLayer, makeCountLayer } from './city.js';
import BENCH from './bench.json' with { type: 'json' };
import SYS from './bench_systems.json' with { type: 'json' };

const W = 1920, H = 1080, END = TL.duration;
const CK = (id, k, j) => chunks(TL.scenes.find(s => s.id === id).lines[k])[j].start;
const glc = document.querySelector('#gl'), c2 = document.querySelector('#c2d'), ctx = c2.getContext('2d');
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let renderer, R3;

// ------------------------------------------------------------------ 3D
const S0 = 62;                        // horde sim time of the loop frame
function build3D() {
  const fog = fogUniforms(), scene = new THREE.Scene();
  scene.add(makeCity(fog));
  const horde = new Horde(8192), view = new HordeView(horde, fog);
  scene.add(view.mesh);
  const flow = makeFlowLayer(horde.flow); flow.visible = false; scene.add(flow);
  const counts = makeCountLayer(); counts.visible = false; scene.add(counts);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 5000);
  R3 = { fog, scene, horde, view, flow, counts, cam };
}
function simAt(st) { R3.horde.advanceTo(st * 60); R3.view.sync(); }
let FOCUS = null;
function focus() {
  if (FOCUS == null) {
    simAt(S0);
    const { x, y, z } = R3.horde.pos; let best = 0, bd = 1e9;
    // a zombie on the surface of the slope (highest in its patch), climbing toward the wall
    for (let e = 0; e < R3.horde.w.n; e++) { if (x[e] < 0.3 || x[e] > 2.5 || Math.abs(z[e] - 2) > 3 || y[e] > 7.2) continue; const d = -y[e]; if (d < bd) { bd = d; best = e; } }
    FOCUS = best;
  }
  const p = R3.horde.pos;
  return V3(p.x[FOCUS], p.y[FOCUS], p.z[FOCUS]);
}
const CLOSE = { off: V3(8.5, 2.6, 7.0), look: V3(-2.0, 1.4, -1.0) };
const closeCam = (cam, P) => { cam.position.copy(P).add(CLOSE.off); cam.lookAt(P.clone().add(CLOSE.look)); };
function draw3D(clip, o = {}) {
  const u = R3.view.mat.uniforms;
  u.uHL.value = o.hl ?? 0; u.uFocus.value = o.hl ? FOCUS : -1; u.uDim.value = o.dim ?? 0;
  R3.fog.uFogK.value = o.fogK ?? 0.012;
  R3.flow.visible = (o.flow ?? 0) > 0.001; R3.flow.material.uniforms.uA.value = o.flow ?? 0; R3.flow.material.uniforms.uReveal.value = o.reveal ?? 1;
  R3.counts.visible = (o.counts ?? 0) > 0.001; R3.counts.material.uniforms.uA.value = o.counts ?? 0;
  if (R3.counts.visible) R3.counts.update(R3.horde.cnt);
  renderer.setScissorTest(true); renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
  renderer.render(R3.scene, R3.cam); renderer.setScissorTest(false);
}
const WIDE = (cam, t, d = 1) => { const a = 0.4 + t * 0.015; cam.position.set(6 + 40 * d, 12 * d + 3, Math.sin(a) * 9); cam.lookAt(4, 4.5, 0); };

// ------------------------------------------------------------------ 2D diagrams
const C = { bg: '#0b0f17', line: 'rgba(255,255,255,0.08)', z: '#7d8796', pos: '#ffb35c', vel: '#5ad1ff', other: '#3a4250', hot: '#ff6b6b', good: '#7be3b5', txt: '#dbe4ee', dim: '#8fa1b6' };
function bg2d(clip) {
  const g = ctx.createRadialGradient(1300, 420, 80, 1300, 520, 1300); g.addColorStop(0, '#141b2b'); g.addColorStop(1, '#070a12');
  ctx.fillStyle = g; ctx.fillRect(clip[0], 0, clip[1] - clip[0], H);
}
function text(s, x, y, o = {}) { ctx.save(); ctx.font = o.font || '600 18px "PingFang SC"'; ctx.fillStyle = o.color || C.txt; ctx.globalAlpha = o.alpha ?? 1; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); ctx.restore(); }
function rrect(x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
// memory: ROWS cache lines of 16 words (4 bytes each)
const MEM = { x0: 880, y0: 175, ww: 58, rh: 38, rows: 14 };
function memGrid(a = 1) {
  ctx.save(); ctx.globalAlpha = a;
  for (let r = 0; r < MEM.rows; r++) {
    rrect(MEM.x0 - 4, MEM.y0 + r * MEM.rh - 3, 16 * MEM.ww + 8, MEM.rh - 2, 6, 'rgba(255,255,255,0.025)');
    text(`0x${(0x7f3a0 + r * 64).toString(16)}`, MEM.x0 - 14, MEM.y0 + r * MEM.rh + MEM.rh / 2 - 3, { font: '12px "SF Mono", Menlo', color: '#55657a', align: 'right' });
  }
  text('64 字节 = 1 条缓存行  cache line', MEM.x0, MEM.y0 - 26, { font: '600 15px "PingFang SC"', color: C.dim });
  ctx.restore();
}
function word(r, c, n, col, label, a = 1, glow = 0) {
  const x = MEM.x0 + c * MEM.ww, y = MEM.y0 + r * MEM.rh;
  ctx.save(); ctx.globalAlpha = a;
  if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
  rrect(x + 2, y, n * MEM.ww - 4, MEM.rh - 8, 5, col);
  ctx.shadowBlur = 0;
  if (label) text(label, x + n * MEM.ww / 2, y + MEM.rh / 2 - 4, { font: '600 12px "SF Mono", Menlo', color: '#0b0f17', align: 'center' });
  ctx.restore();
  return [x + n * MEM.ww / 2, y + MEM.rh / 2 - 4];
}
// scattered object layout (deterministic): per zombie a header (6 words), position (4), velocity (4), anim (3)
const OBJ = (() => {
  const used = Array.from({ length: MEM.rows }, () => new Array(16).fill(0)), out = [];
  let s = 11; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const alloc = n => { for (let tries = 0; tries < 500; tries++) { const r = Math.floor(R() * MEM.rows), c = Math.floor(R() * (16 - n + 1)); if (used[r].slice(c, c + n).every(v => !v)) { for (let k = 0; k < n; k++) used[r][c + k] = 1; return [r, c]; } } return [0, 0]; };
  for (let i = 0; i < 9; i++) out.push({ hdr: alloc(6), pos: alloc(4), vel: alloc(4), anim: alloc(3), name: alloc(2) });
  return out;
})();
function oopDiagram(t, t0, a) {
  memGrid(a);
  const k = Math.floor(Math.max(0, t - t0) / 0.9), u = ((t - t0) / 0.9) % 1;
  const lines = new Set();
  OBJ.forEach((o, i) => {
    const on = i < k || (i === k && u > 0.1), cur = i === k;
    const al = a * (on ? 1 : 0.55);
    word(...o.hdr, 6, C.z, 'Zombie', al, cur ? 10 : 0); word(...o.name, 2, C.other, 'name', al); word(...o.anim, 3, C.other, 'anim', al);
    const pp = word(...o.pos, 4, C.pos, 'position', al, cur ? 14 : 0), vp = word(...o.vel, 4, C.vel, 'velocity', al, cur ? 14 : 0);
    if (on) { lines.add(o.hdr[0]); lines.add(o.pos[0]); lines.add(o.vel[0]); }
    if (cur) {
      const hp = [MEM.x0 + (o.hdr[1] + 3) * MEM.ww, MEM.y0 + o.hdr[0] * MEM.rh + 15];
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      for (const p of [pp, vp]) { ctx.beginPath(); ctx.moveTo(...hp); ctx.quadraticCurveTo((hp[0] + p[0]) / 2, Math.min(hp[1], p[1]) - 60, p[0], p[1]); ctx.stroke(); }
      ctx.restore();
    }
  });
  // fetched lines flash; bytes used vs fetched
  for (const r of lines) rrect(MEM.x0 - 6, MEM.y0 + r * MEM.rh - 5, 16 * MEM.ww + 12, MEM.rh + 2, 7, null, 'rgba(255,107,107,0.6)', 2);
  const fetched = lines.size * 64, usedB = Math.min(k + 1, OBJ.length) * 16;
  if (fetched) text(`读入 fetched ${fetched} B · 用到 used ${usedB} B · 利用率 ${Math.round(usedB / Math.max(1, fetched) * 100)}%`, MEM.x0, MEM.y0 + MEM.rows * MEM.rh + 18, { font: '600 17px "PingFang SC"', color: C.hot, alpha: a });
}
function soaDiagram(t, t0, a) {
  memGrid(a);
  const cols = [['px', C.pos], ['pz', C.pos], ['vx', C.vel], ['vz', C.vel]];
  const per = 3;                 // each array spans 3 cache lines (48 entities)
  const sweep = Math.max(0, t - t0) * 18;   // entities processed
  cols.forEach(([name, col], k) => {
    for (let r = 0; r < per; r++) for (let c = 0; c < 16; c++) {
      const idx = r * 16 + c, done = idx < sweep;
      word(k * (per + 0.5) + r | 0, c, 1, col, r === 0 && c === 0 ? name : '', a * (done ? 1 : 0.4), done && idx > sweep - 3 ? 12 : 0);
    }
    text(`${name}[ ]  Float32Array`, MEM.x0 + 16 * MEM.ww + 20, MEM.y0 + (k * (per + 0.5) | 0) * MEM.rh + 15, { font: '600 14px "SF Mono"', color: col, alpha: a, align: 'left' });
  });
  const lines = Math.min(12, Math.ceil(sweep / 16) * 4 / 4 * 4);
  text(`每条缓存行 64 B 全部有用 · 利用率 100%`, MEM.x0, MEM.y0 + MEM.rows * MEM.rh + 18, { font: '600 17px "PingFang SC"', color: C.good, alpha: a });
}
function bars(t, a, rows, x0 = 1000, y0 = 790, w = 760) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  rrect(x0 - 24, y0 - 50, w + 48, 70 + rows.length * 56, 16, 'rgba(8,11,18,0.9)', 'rgba(255,255,255,0.1)');
  text('移动 1,000,000 个实体一步  move 1M entities one step · ' + BENCH.cpu, x0, y0 - 22, { font: '600 15px "PingFang SC"', color: C.dim });
  const max = 40, sx = w * 0.72 / max;
  const fb = x0 + 160 + 16.7 * sx;
  rows.forEach((r, i) => {
    const y = y0 + 14 + i * 56, k = ease(ramp(t, r.at, r.at + 0.8));
    text(r.label, x0, y + 14, { font: '600 16px "PingFang SC"', color: r.col });
    rrect(x0 + 160, y, Math.max(2, r.ms * sx * k), 28, 6, r.col);
    text(`${(r.ms * k).toFixed(1)} ms`, x0 + 170 + r.ms * sx * k, y + 14, { font: '600 16px "SF Mono"', color: '#fff' });
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(fb, y0 + 2); ctx.lineTo(fb, y0 + 18 + rows.length * 56); ctx.stroke();
  text('一帧 16.7 ms', fb, y0 + 2, { font: '13px "PingFang SC"', color: '#fff', align: 'center' });
  ctx.restore();
}
// Overwatch-style table (our illustration)
const ENT = [['#1', 'Tracer · 玩家', 'player'], ['#2', 'Reinhardt · 玩家', 'player'], ['#3', 'AI 机器人 · bot', 'bot'], ['#4', '脉冲炸弹 · 投射物', 'proj'], ['#5', '运载目标 · payload', 'payload']];
const COMP = ['Transform', 'Connection', 'InputStream', 'Stats', 'Health', 'Physics', 'Projectile'];
const HAS = { player: [0, 1, 2, 3, 4, 5], bot: [0, 3, 4, 5], proj: [0, 5, 6], payload: [0, 5] };
function ecsTable(t, a, sys) {
  const x0 = 820, y0 = 190, cw = 112, rh = 64, lw = 200;
  ctx.save(); ctx.globalAlpha = a;
  text('Entity', x0, y0 - 30, { font: '600 15px "SF Mono"', color: C.dim });
  COMP.forEach((c, j) => {
    const lit = sys && sys.cols.includes(j);
    rrect(x0 + lw + j * cw + 4, y0 - 46, cw - 8, 30, 8, lit ? 'rgba(255,179,92,0.9)' : 'rgba(255,255,255,0.06)');
    text(c, x0 + lw + j * cw + cw / 2, y0 - 31, { font: '600 12px "SF Mono"', color: lit ? '#0b0f17' : C.txt, align: 'center' });
  });
  ENT.forEach(([id, name, kind], i) => {
    const y = y0 + i * rh, has = HAS[kind], match = sys && sys.cols.every(c => has.includes(c));
    rrect(x0 - 8, y, lw + COMP.length * cw + 8, rh - 10, 10, match ? 'rgba(255,179,92,0.12)' : 'rgba(255,255,255,0.03)');
    text(id, x0 + 6, y + rh / 2 - 5, { font: '600 15px "SF Mono"', color: C.dim });
    text(name, x0 + 52, y + rh / 2 - 5, { font: '600 16px "PingFang SC"', color: C.txt });
    COMP.forEach((c, j) => { if (has.includes(j)) { const lit = sys && sys.cols.includes(j); rrect(x0 + lw + j * cw + 18, y + 10, cw - 36, rh - 30, 8, lit && match ? '#ffb35c' : lit ? 'rgba(255,179,92,0.35)' : 'rgba(90,209,255,0.45)'); } });
    if (sys && !match && sys.cols.some(c => has.includes(c))) text('跳过 skipped', x0 + lw + COMP.length * cw + 20, y + rh / 2 - 5, { font: '600 14px "PingFang SC"', color: C.hot });
    if (sys && match) text('✓ 处理', x0 + lw + COMP.length * cw + 20, y + rh / 2 - 5, { font: '600 14px "PingFang SC"', color: '#ffb35c' });
  });
  ctx.restore();
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
let FOOT = null;
const CLIP = (dir, count) => ({ dir: 'media/' + dir, fps: 30, count });
const CLIPS = { film: CLIP('film_pile', 194), game: CLIP('game_horde', 138), game2: CLIP('game_horde2', 150), ow: CLIP('owClip', 314), chords: CLIP('ow_chords', 270), ow46: CLIP('ow_46', 270) };

function build() {
  const fIn = L('intro', 2) - 0.3, gIn = CK('intro', 2, 1) + 0.4;
  shot(0, (c, t) => hookShot(c, t));
  shot(fIn, (c, t) => { FOOT = { clip: CLIPS.film, t: t - fIn, clipX: c }; }, { wipe: 1.1, labA: ['我们的模拟', 'OUR SIM'], labB: ['电影《僵尸世界大战》', 'WORLD WAR Z (2013 FILM)'] });
  shot(gIn, (c, t) => { FOOT = { clip: CLIPS.game, t: Math.min(4.5, t - gIn), clipX: c }; }, { dissolve: 0.5 });
  shot(CK('intro', 2, 2) - 0.2, (c, t) => wideShot(c, t, 1.0), { dissolve: 0.7 });
  shot(S('oop'), (c, t) => { bg2d(c); clipped(c, () => oopDiagram(t, CK('oop', 1, 0), 1)); return {}; }, { wipe: 1.0 });
  shot(S('owA'), (c, t) => { bg2d(c); clipped(c, () => ecsTable(t, ease(ramp(t, S('owA'), S('owA') + 0.8)), null)); return {}; }, { wipe: 1.0 });
  shot(S('owClip'), (c, t) => { FOOT = { clip: CLIPS.ow, t: t - S('owClip'), clipX: c }; }, { dissolve: 0.5 });
  shot(S('ow'), (c, t) => { bg2d(c); clipped(c, () => owTable(t)); return {}; }, { dissolve: 0.5 });
  shot(S('soa'), (c, t) => { bg2d(c); clipped(c, () => soaDiagram(t, S('soa') + 2.5, 1)); return {}; }, { wipe: 1.0, labA: ['对象数组', 'ARRAY OF OBJECTS'], labB: ['组件数组', 'STRUCTURE OF ARRAYS'] });
  shot(S('flow'), (c, t) => flowShot(c, t), { wipe: 1.1 });
  shot(S('pile'), (c, t) => pileShot(c, t), { wipe: 1.0 });
  shot(S('systems'), (c, t) => wideShot(c, t, 0.8), { wipe: 1.0 });
  shot(S('bridge'), (c, t) => finShot(c, t), { dissolve: 0.8 });
  for (const s of shots) if (s.t0 > 0.05 && (s.wipe || s.dissolve)) events.push({ t: +s.t0.toFixed(3), wipe: s.wipe || s.dissolve });
}
function clipped(c, f) { ctx.save(); ctx.beginPath(); ctx.rect(c[0], 0, c[1] - c[0], H); ctx.clip(); f(); ctx.restore(); }
function owTable(t) {
  const l1 = L('ow', 1), l2 = L('ow', 2);
  const sys = t > CK('ow', 1, 1) - 0.3 && t < l2 - 0.2 ? { cols: [1, 2, 3] } : null;
  ecsTable(t, 1, sys);
  if (t < l1 - 0.2) {      // component = data, system = code
    const a = win(t, S('ow') + 0.2, l1 - 0.2, 0.5, 0.4);
    ctx.save(); ctx.globalAlpha = a;
    rrect(980, 560, 380, 250, 14, 'rgba(8,11,18,0.92)', 'rgba(90,209,255,0.5)', 2);
    text('struct Connection {', 1000, 595, { font: '15px "SF Mono"', color: '#5ad1ff' });
    ['  handle;', '  playerName;', '  afkTimer;', '}'].forEach((s, i) => text(s, 1000, 625 + i * 28, { font: '15px "SF Mono"', color: C.txt }));
    text('组件：只有数据', 1170, 780, { font: '600 16px "PingFang SC"', color: '#5ad1ff', align: 'center' });
    rrect(1420, 560, 420, 250, 14, 'rgba(8,11,18,0.92)', 'rgba(255,179,92,0.6)', 2);
    text('PlayerConnectionSystem::Update()', 1440, 595, { font: '15px "SF Mono"', color: '#ffb35c' });
    ['  for (conn, input, stats) in tuples:', '    if idle(input, stats): kick(conn)', '    else: conn.afkTimer = 0'].forEach((s, i) => text(s, 1440, 625 + i * 28, { font: '14px "SF Mono"', color: C.txt }));
    text('系统：只有逻辑', 1630, 780, { font: '600 16px "PingFang SC"', color: '#ffb35c', align: 'center' });
    ctx.restore();
  }
  if (sys) text('PlayerConnectionSystem · 挂机检测（示意）', 1300, 560, { font: '600 18px "PingFang SC"', color: '#ffb35c', align: 'center' });
}

// 3D shots
function hookShot(clip, t) {
  simAt(S0 + t);
  const P = focus();
  const k = ease2(ramp(t, L('intro', 0) + 1.6, L('intro', 1) + 1.4));
  const close = new THREE.PerspectiveCamera(); closeCam(close, P);
  WIDE(R3.cam, t, 1);
  const wideP = R3.cam.position.clone();
  R3.cam.position.lerpVectors(close.position, wideP, k);
  R3.cam.lookAt(P.clone().add(CLOSE.look).lerp(V3(6, 4.5, 0), Math.min(1, k * 1.2)));
  draw3D(clip, { hl: 0.85 * (1 - ramp(t, L('intro', 1), L('intro', 1) + 1)) });
  return { focusPx: project(P) };
}
function project(P) { const v = P.clone().add(V3(0, 2.2, 0)).project(R3.cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }
function wideShot(clip, t, d) {
  simAt(S0 + t - 18);
  WIDE(R3.cam, t, d);
  draw3D(clip, {});
  return {};
}
function flowShot(clip, t) {
  const s0 = S('flow'), l1 = L('flow', 1), l2 = L('flow', 2);
  simAt(18 + (t - s0));
  // 0: street-level view of the stream   1: lift to top-down, arrows spread out from the goal   2: zombies read arrows
  const up = ease2(ramp(t, l1 - 0.6, l1 + 1.8));
  const a = V3(70, 6, 8), b = V3(70, 74, 0.01);
  R3.cam.position.lerpVectors(a, b, up);
  R3.cam.lookAt(V3(30, 1, 0).lerp(V3(70, 0, 0), up));
  const reveal = ease(ramp(t, CK('flow', 1, 1) - 0.3, CK('flow', 1, 2) + 0.8));
  draw3D(clip, { flow: up, reveal, fogK: lerp(0.012, 0.0012, up), dim: up * 0.25 });
  return {};
}
function pileShot(clip, t) {
  const s0 = S('pile'), l1 = L('pile', 1), l2 = L('pile', 2);
  let st, counts = 0;
  if (t < l1 - 0.3) {           // counting grid, seen from above the wall
    st = 46 + (t - s0);
    counts = ease(ramp(t, CK('pile', 0, 1) - 0.3, CK('pile', 0, 1) + 0.6));
    R3.cam.position.set(30, 26, 9); R3.cam.lookAt(6, 0, 0);
  } else if (t < l2 - 0.3) {    // time-lapse: the ramp grows (2.5x)
    st = 26 + (t - (l1 - 0.3)) * 2.6;
    R3.cam.position.set(14, 5.5, 25); R3.cam.lookAt(3, 4.2, 0);
  } else {
    st = 56 + (t - (l2 - 0.3));
    WIDE(R3.cam, t - s0, 0.85);
  }
  simAt(st);
  draw3D(clip, { counts: counts * 0.9, dim: counts * 0.35 });
  return { timelapse: t >= l1 - 0.3 && t < l2 - 0.3 };
}
const T_LAST = (Math.round(END * 30) - 1) / 30;     // last rendered frame lands one step before the loop frame
function finShot(clip, t) {
  const st = S0 - (T_LAST - t) - 1 / 60;
  simAt(st);
  const fly0 = L('final', 1) - 0.8, fly1 = END - 0.6;
  WIDE(R3.cam, t - S('bridge') + 40, 1.0);
  if (t > fly0) {
    const P = focus(), k = ease2(ramp(t, fly0, fly1));
    const close = new THREE.PerspectiveCamera(); closeCam(close, P);
    const far = R3.cam.position.clone();
    R3.cam.position.lerpVectors(far, close.position, k);
    R3.cam.lookAt(V3(6, 4.5, 0).lerp(P.clone().add(CLOSE.look), Math.min(1, k * 1.2)));
    if (k >= 1) closeCam(R3.cam, P);
  }
  draw3D(clip, { hl: 0.85 * ease(ramp(t, fly1 - 1.2, fly1)) });
  return t > fly0 ? { focusPx: project(focus()) } : {};
}

// ------------------------------------------------------------------ overlay
const BRAND = ['万象成群 · 第三期', 'Swarms at Scale · EP03 · ECS'];
const CH = [
  { id: 'oop', step: '01 / 05', zh: '一只僵尸一个对象', en: 'One object per zombie' },
  { id: 'ow', step: '02 / 05', zh: 'ECS：实体 · 组件 · 系统', en: 'Entity · Component · System' },
  { id: 'soa', step: '03 / 05', zh: '组件连续存储', en: 'Components packed in arrays' },
  { id: 'flow', step: '04 / 05', zh: '流场寻路', en: 'Flow-field pathfinding' },
  { id: 'pile', step: '05 / 05', zh: '尸山：计数与攀爬', en: 'The pile: count and climb' },
];
const DESC = {
  oop: ['每个对象单独分配在堆上：update 要沿着指针到处跳。', 'Each object lives on its own in the heap; update chases pointers all over.'],
  ow: ['实体 = ID；组件 = 数据（无函数）；系统 = 逻辑（无字段）。', 'Entity = an ID; component = data, no functions; system = logic, no fields.'],
  soa: ['同类组件存成一列：系统顺序扫描，缓存和预取都吃满。', 'Each component type is one column: systems scan it in order, cache and prefetch stay full.'],
  flow: ['一次 Dijkstra 覆盖整条街；每只僵尸 O(1) 读箭头。', 'One Dijkstra over the whole street; each zombie reads its arrow in O(1).'],
  pile: ['格内按高度排序：第 k 只站在第 k/2.6 层上。', 'Sorted by height in each cell: the k-th zombie stands on layer k / 2.6.'],
};
function panelFor(t) {
  const k = CH.findIndex(c => t >= S(c.id) && t < E(c.id));
  if (k < 0) return null;
  const c = CH[k], s0 = S(c.id), s1 = E(c.id);
  const P = { step: c.step, zh: c.zh, en: c.en, dots: { n: 5, cur: k, frac: (t - s0) / (s1 - s0) }, opacity: win(t, s0 + 0.5, s1 + 0.2, 0.6, 0.5), desc: DESC[c.id] };
  const q = (() => { const s = TL.scenes.find(x => x.id === c.id); let r = 0; s.lines.forEach((l, i) => { if (t >= l.start - 0.3) r = i; }); return r; })();
  if (c.id === 'oop' && q < 2) P.code = { src: 'bench', region: 'oop', file: 'bench.mjs · class Zombie', since: L('oop', 0) + 0.3, hl: q === 0 ? ['update(dt)'] : ['new Vec3'] };
  if (c.id === 'ow') P.code = { src: 'ecs', region: 'world', file: 'ecs.js · class World', since: L('ow', 0), hl: q === 0 ? ['component(name', 'Float32Array'] : ['*query'] };
  if (c.id === 'soa') P.code = { src: 'bench', region: 'soa', file: 'bench.mjs · moveSystem()', since: S('soa') + 0.6, hl: ['for (let i = 0'] };
  if (c.id === 'flow' && q === 2) P.code = { src: 'ecs', region: 'flow', file: 'ecs.js · flowSystem()', since: L('flow', 2), hl: ['dir[c * 2]'] };
  if (c.id === 'pile' && q <= 1) P.code = { src: 'ecs', region: q === 0 ? 'grid' : 'climb', file: q === 0 ? 'ecs.js · gridSystem()' : 'ecs.js · climbSystem()', since: q === 0 ? CK('pile', 0, 1) : L('pile', 1), hl: q === 0 ? ['cnt[cell[e]]++'] : ['(i - start[c]) / PER_LAYER', 'clamber up'] };
  if (c.id === 'oop' && q === 2) P.opacity *= 1;
  return P;
}
const fmt = n => Math.round(n).toLocaleString('en-US');
function dataTable(t, o) {
  if (o <= 0) return;
  const h = R3.horde, x0 = 1150, y0 = 150, rowH = 30, cols = [['entity', '#8fa1b6'], ['pos.x', '#ffb35c'], ['pos.y', '#ffb35c'], ['pos.z', '#ffb35c'], ['vel.x', '#5ad1ff'], ['vel.z', '#5ad1ff'], ['speed', '#7be3b5'], ['phase', '#7be3b5']];
  ctx.save(); ctx.globalAlpha = o;
  rrect(x0, y0, 730, 70 + rowH * 8, 16, 'rgba(8,11,18,0.88)', 'rgba(255,255,255,0.1)');
  text(`World · ${fmt(h.w.n)} entities · 4 components`, x0 + 20, y0 + 26, { font: '600 15px "PingFang SC"' });
  cols.forEach(([c, col], k) => text(c, x0 + 20 + k * 88, y0 + 56, { font: '13px "SF Mono"', color: col }));
  const P = h.pos, Vv = h.vel, A = h.agent;
  for (let r = 0; r < 7; r++) {
    const e = r < 6 ? r * 1361 : h.w.n - 1, y = y0 + 56 + rowH * (r + 1);
    rrect(x0 + 12, y - 14, 706, rowH - 4, 4, r % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)');
    const vals = r === 5 ? ['⋮'] : [e, P.x[e], P.y[e], P.z[e], Vv.x[e], Vv.z[e], A.speed[e], A.phase[e] % 6.2832];
    vals.forEach((v, k) => text(typeof v === 'number' ? (k ? v.toFixed(2) : String(v)) : v, x0 + 20 + k * 88, y, { font: '13px "SF Mono"', color: k ? '#e6edf5' : '#8fa1b6' }));
  }
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
    ctx.save(); ctx.globalAlpha = 1;
    extra = act.cur.draw([0, W], t) || {};
    ctx.restore();
    if (FOOT) FOOT.opacity = act.a; else if (fA) { fA.opacity = 1 - act.a; FOOT = fA; }
  } else extra = act.cur.draw([0, W], t) || {};
  const out = { foot: FOOT, wipe: act.u != null ? { u: act.u, labA: act.cur.labA, labB: act.cur.labB } : null, labels: [], cards: [] };
  const sid = TL.scenes.find(s => t >= s.start && t < s.end)?.id || 'final';
  out.brand = Math.min(ease(ramp(t, S('title') - 0.4, S('title') + 0.6)), 1 - ease(ramp(t, L('final', 1) - 0.4, L('final', 1) + 0.6)));
  out.panel = panelFor(t);
  const chip = (zh, en, real) => ({ zh, en, real, opacity: Math.max(out.brand, sid === 'intro' || sid === 'owClip' ? 1 : 0) });
  const pip = (clip, a, b, label, rect = [1240, 130, 640, 360]) => {
    const o = win(t, a, b, 0.5, 0.5); if (o <= 0) return;
    out.frame = { clip, t: clamp(t - a, 0, clip.count / 30 - 0.05), opacity: o, rect };
    out.labels.push({ x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] + 26, zh: label[0], en: label[1], o, plain: true });
  };
  if (extra.focusPx) {
    const o = Math.max(1 - ramp(t, L('intro', 0) + 2.6, L('intro', 0) + 3.4), ramp(t, END - 1.4, END - 0.6)) * (t < 30 || t > END - 2 ? 1 : 0);
    if (t < 30 && t > 0.0) out.labels.push({ x: extra.focusPx[0], y: extra.focusPx[1] - 30, zh: '这一只', en: 'ONE ZOMBIE', o: Math.min(o, ramp(t, 0.6, 1.2)), color: '#ffb35c' });
  }
  if (sid === 'intro') {
    const fIn = L('intro', 2) - 0.3, gIn = CK('intro', 2, 1) + 0.4;
    if (t < fIn) out.labels.push({ x: 960, y: 150, zh: '墙高 8.5 米', en: 'WALL · 8.5 m', o: win(t, 0.6, L('intro', 1) - 0.2, 0.5, 0.5), color: '#ffc46b' });
    else if (t < gIn) { out.chip = chip('电影《僵尸世界大战》(2013) 预告片', 'World War Z film trailer', true); out.credit = { k: 'FOOTAGE', text: 'World War Z (2013) © Paramount Pictures · trailer', o: 1 }; }
    else if (t < CK('intro', 2, 2) - 0.2) { out.chip = chip('游戏《僵尸世界大战》实机', 'World War Z (2019 game)', true); out.credit = { k: 'FOOTAGE', text: 'World War Z © Saber Interactive / Focus Entertainment · trailer', o: 1 }; }
    else out.chip = chip('three.js · 8,192 只僵尸', 'Our horde sim');
    out.subsBox = t > fIn;
  }
  if (sid === 'title') {
    const tc = win(t, S('title') + 0.1, E('title') - 0.2, 0.7, 0.6);
    out.title = { opacity: tc, k: '万象成群 · 第三期 · EP03', h: 'ECS：一万个敌人', e: 'From Overwatch to World War Z', tags: ['Entity', 'Component', 'System'], top: 320, size: 84 };
    out.chip = chip('three.js · 8,192 只僵尸', 'A tiny ECS in typed arrays');
  }
  if (sid === 'oop') {
    out.chip = chip('面向对象', 'Object-oriented');
    bars(t, win(t, L('oop', 2) - 0.2, E('oop') + 0.2, 0.5, 0.5), [{ label: '对象 objects', ms: BENCH.oopMs, col: C.hot, at: CK('oop', 2, 1) - 0.3 }]);
  }
  if (sid === 'owA') {
    out.chip = chip('GDC 2017', 'Overwatch');
    out.cards.push({ x: 1180, y: 600, w: 640, y_: 'GDC 2017 · BLIZZARD', zh: 'Overwatch Gameplay Architecture and Netcode', en: 'Timothy Ford, lead gameplay programmer', o: win(t, S('owA') + 0.3, E('owA') + 0.4, 0.5, 0.4) });
  }
  if (sid === 'owClip') { out.chip = chip('GDC 2017 演讲', 'Talk excerpt', true); out.credit = { k: 'GDC 2017', text: 'Timothy Ford (Blizzard) · “Overwatch Gameplay Architecture and Netcode” · GDC Vault', o: 1 }; out.subsFull = true; out.subsBox = true; }
  if (sid === 'ow') {
    out.chip = chip('ECS 示意', 'Illustration');
    pip(CLIPS.ow46, L('ow', 2) - 0.2, E('ow') + 0.3, ['GDC 原片：《守望先锋》客户端的系统与组件', 'GDC 2017 · Overwatch client: ~46 systems, 103 components'], [1180, 560, 640, 360]);
    if (t > L('ow', 2) - 0.2) out.cards.push({ x: 860, y: 600, w: 290, big: true, y_: 'OVERWATCH CLIENT', zh: '46 系统<br>103 组件', en: '≈40% 是单例组件', o: win(t, L('ow', 2), E('ow') + 0.3, 0.5, 0.5) });
  }
  if (sid === 'soa') {
    out.chip = chip('数据导向', 'Data-oriented');
    bars(t, win(t, L('soa', 1) - 0.2, E('soa') + 0.2, 0.5, 0.5), [{ label: '对象 objects', ms: BENCH.oopMs, col: C.hot, at: L('soa', 1) - 0.4 }, { label: '组件数组 SoA', ms: BENCH.soaMs, col: C.good, at: CK('soa', 1, 2) - 0.3 }], 1000, 800);
  }
  if (sid === 'flow') {
    out.chip = chip('流场', 'Flow field');
    out.cards.push({ x: 1240, y: 150, w: 600, y_: 'SUPREME COMMANDER 2 · 2010', zh: '流场寻路：一张场，成千上万个单位共用', en: 'Elijah Emerson, “Crowd Pathfinding and Steering Using Flow Field Tiles”, Game AI Pro (2013)', o: win(t, L('flow', 1) + 0.4, E('flow') + 0.2, 0.5, 0.5) });
    if (t > L('flow', 1)) out.labels.push({ x: 960, y: 900 - 40, zh: '绿 = 离目标近 · 蓝 = 远', en: 'distance to the goal', o: win(t, L('flow', 1) + 1, E('flow'), 0.5, 0.5), plain: true });
    out.params = { head: 'FLOW FIELD', rows: [{ k: 'grid', v: `${GW} × ${GH} cells` }, { k: 'solved', v: '1× per map', c: 'good' }, { k: 'zombies', v: fmt(R3.horde.w.n), c: 'hot' }, { k: 'flowSystem', v: SYS.msPerStep.flowSystem.toFixed(3) + ' ms' }], opacity: win(t, L('flow', 1) + 0.5, E('flow'), 0.5, 0.5) };
  }
  if (sid === 'pile') {
    out.chip = chip(extra.timelapse ? '延时 2.6×' : '尸山', extra.timelapse ? 'Time-lapse 2.6×' : 'The pile');
    pip(CLIPS.game2, L('pile', 2) - 0.2, E('pile') + 0.2, ['《僵尸世界大战》实机：尸潮', 'World War Z gameplay trailer'], [1240, 130, 640, 360]);
    if (t > L('pile', 2) - 0.2) out.cards.push({ x: 1240, y: 560, w: 640, y_: 'GAME INFORMER · 2019', zh: 'Swarm 引擎：为同屏约 500 只僵尸而建', en: '“purposefully built to handle up to 500 zombies on the screen”', o: win(t, L('pile', 2), E('pile') + 0.2, 0.5, 0.5) });
  }
  if (sid === 'systems') {
    out.chip = chip('7 个系统', '7 systems');
    const rows = Object.entries(SYS.msPerStep).map(([k, v]) => ({ k, v: v.toFixed(3) + ' ms' }));
    out.params = { head: `SYSTEMS · ${fmt(SYS.zombies)} ZOMBIES`, rows: [...rows, { k: 'total / step', v: SYS.total.toFixed(2) + ' ms', c: 'good' }], opacity: win(t, S('systems') + 0.5, E('systems'), 0.5, 0.5) };
    dataTable(t, win(t, L('systems', 1) - 0.2, E('systems') + 0.2, 0.5, 0.5));
    out.subsBox = true;
  }
  if (sid === 'bridge') { out.chip = chip('转向', 'Facing the goal'); out.subsBox = true; }
  if (sid === 'final') {
    const tc = win(t, S('final') + 0.1, L('final', 1) - 0.5, 0.7, 0.6);
    out.title = { opacity: tc, k: '下期预告 · NEXT · EP04', h: '《戴森球计划》：万板向日', e: 'Dyson Sphere Program — panels that track the sun', tags: ['GPU 实例化', '着色器里算朝向', '一百万块板'], top: 320, size: 76 };
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
    await loadSource('ecs', new URL('./sims/ecs.js', import.meta.url));
    await loadSource('bench', new URL('./sims/bench.mjs', import.meta.url));
    build3D(); build();
    focus();                       // pick the focus zombie before any frame (picking re-simulates to S0)
    window.DBG = { R3, focus, simAt, THREE };
  },
  frame,
};
