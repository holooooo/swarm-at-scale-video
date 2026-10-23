// EP04 · 《戴森球计划》万板向日 — 131,072 sun-tracking panels + 1,048,576 sails, no per-frame CPU work.
// Everything is a pure function of film time: planet spin, sun direction, sail orbit time.
// The planet makes exactly 4 turns over the film and the orbit clock is re-anchored at the bridge wipe,
// so the last frame == frame 0.
import * as THREE from 'three';
import { TL, S, E, VE, L, LE, chunks, clamp, ease, ease2, lerp, ramp, win, loadSource } from '../core/film.js';
import { SYS, spaceUniforms, makeStar, makePlanet, makePanels, makeSwarm, makeShell, planetRotJS } from './sims/space.js';
import BENCH from './bench.json' with { type: 'json' };

const W = 1920, H = 1080, END = TL.duration;
const CK = (id, k, j) => chunks(TL.scenes.find(s => s.id === id).lines[k])[j].start;
const glc = document.querySelector('#gl'), c2 = document.querySelector('#c2d'), ctx = c2.getContext('2d');
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let renderer, R3;
const N_PANELS = 131072, N_SAILS = 1 << 20;

// ------------------------------------------------------------------ clocks
const TURNS = 4, WSPIN = TURNS * 2 * Math.PI / END;
let SPIN0 = 0, HERO = 0, HERO_DIR = null;
const spinAt = t => SPIN0 + WSPIN * t;
const orbAt = t => (t < S('bridge') ? t : t - END) * 1.0;
// panel frame in world space (matches PANEL_VS)
function panelFrame(spin, d0) {
  const R = planetRotJS(spin), up = d0.clone().applyMatrix3(R).normalize();
  const base = SYS.planetPos.clone().addScaledVector(up, SYS.planetR);
  const pole = V3(0, 1, 0).applyMatrix3(R);
  const east = pole.clone().cross(up).add(V3(1e-4, 0, 0)).normalize(), north = up.clone().cross(east);
  const sun = V3(0, 0, 0).sub(base).normalize();
  return { up, base, east, north, sun, elev: sun.dot(up) };
}
function pickHero(data) {
  // a panel at mid latitude; then choose SPIN0 so that frame 0 is shortly after its sunrise
  let best = 0, bd = 1e9;
  for (let i = 0; i < N_PANELS; i++) { const d = Math.abs(data[i * 4 + 1] - 0.3) + Math.abs(data[i * 4] - 0.0) * 0.1; if (d < bd) { bd = d; best = i; } }
  HERO = best; HERO_DIR = V3(data[best * 4], data[best * 4 + 1], data[best * 4 + 2]);
  let prev = panelFrame(0, HERO_DIR).elev;
  for (let k = 1; k <= 3600; k++) {
    const s = k / 3600 * 2 * Math.PI, e = panelFrame(s, HERO_DIR).elev;
    if (prev < 0.22 && e >= 0.22) { SPIN0 = s; break; }
    prev = e;
  }
}
// ground camera: offsets in the hero panel's local (east, up, north) frame
function groundCam(cam, t, off, look, d0 = HERO_DIR) {
  const f = panelFrame(spinAt(t), d0), L3 = (o) => f.base.clone().addScaledVector(f.east, o[0]).addScaledVector(f.up, o[1]).addScaledVector(f.north, o[2]);
  cam.up.copy(f.up); cam.position.copy(L3(off)); cam.lookAt(L3(look));
  return f;
}
// hook camera: on the sun side of the panel, so we see its face turning; offsets in (east, up, north)
let HERO_OFF = [0.62, 0.36, -0.55], HERO_LOOK = [0, 0.2, 0];
function heroCamSetup() {
  const f = panelFrame(SPIN0, HERO_DIR), az = f.sun.clone().addScaledVector(f.up, -f.elev).normalize();
  const ae = az.dot(f.east), an = az.dot(f.north), re = -an, rn = ae;           // right = up x az in (e, n)
  HERO_OFF = [ae * 2.3 + re * 1.3, 1.25, an * 2.3 + rn * 1.3];
  HERO_LOOK = [-ae * 0.3 - re * 0.35, 0.2, -an * 0.3 - rn * 0.35];
}
// a panel whose sun elevation at time t is close to the target (for daylight shots)
const panelCache = {};
function panelWithElev(t, target, key) {
  if (panelCache[key]) return panelCache[key];
  const d = R3.panels.userData.data; let best = null, bd = 1e9;
  for (let i = 0; i < N_PANELS; i += 97) { const v = V3(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), e = panelFrame(spinAt(t), v).elev; if (Math.abs(e - target) < bd && Math.abs(v.y) < 0.6) { bd = Math.abs(e - target); best = v; } }
  return (panelCache[key] = best);
}
function spaceCam(cam, p, l) { cam.up.set(0, 1, 0); cam.position.copy(p); cam.lookAt(l); }
const WIDE_P = V3(260, 160, 700), WIDE_L = V3(200, 0, -40);
const PLANET_P = t => { const a = 0.4 + t * 0.01; return SYS.planetPos.clone().add(V3(Math.sin(a) * -150, 55, Math.cos(a) * 110)); };

function build3D() {
  const u = spaceUniforms(), scene = new THREE.Scene();
  const star = makeStar(u), planet = makePlanet(u), panels = makePanels(u, N_PANELS), swarm = makeSwarm(u), shell = makeShell(u, 300);
  scene.add(star, planet, panels, swarm, shell);
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.01, 20000);
  R3 = { u, scene, star, planet, panels, swarm, shell, cam };
  pickHero(panels.userData.data); heroCamSetup();
}
function draw3D(clip, t, o = {}) {
  const u = R3.u;
  u.uTime.value = t; u.uSpin.value = spinAt(t); u.uOrbitT.value = orbAt(t) * (o.orbSpeed ?? 1);
  u.uTrack.value = o.track ?? 1; u.uDim.value = o.dim ?? 0; u.uHL.value = o.hl ? HERO : -1;
  u.uSailGlow.value = o.sails ?? 1; u.uSailCount.value = o.sailCount ?? N_SAILS;
  R3.swarm.visible = (o.sails ?? 1) > 0.001;
  R3.shell.visible = (o.shell ?? 0) > 0.001; R3.shell.material.opacity = 0.35 * (o.shell ?? 0);
  R3.cam.fov = o.fov ?? 40; R3.cam.updateProjectionMatrix();
  renderer.setScissorTest(true); renderer.setScissor(clip[0], 0, clip[1] - clip[0], H);
  renderer.render(R3.scene, R3.cam); renderer.setScissorTest(false);
}

// ------------------------------------------------------------------ 2D helpers
const C = { txt: '#dbe4ee', dim: '#8fa1b6', hot: '#ff6b6b', good: '#7be3b5', amber: '#ffb35c', cyan: '#5ad1ff' };
function text(s, x, y, o = {}) { ctx.save(); ctx.font = o.font || '600 18px "PingFang SC"'; ctx.fillStyle = o.color || C.txt; ctx.globalAlpha = o.alpha ?? 1; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); ctx.restore(); }
function rrect(x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
function arrowH(x0, y, x1, col, a, label) {
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1 - 16, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - 20, y - 11); ctx.lineTo(x1 - 20, y + 11); ctx.closePath(); ctx.fill(); ctx.restore();
  if (label) text(label, (x0 + x1) / 2, y - 24, { font: '600 16px "PingFang SC"', color: col, align: 'center', alpha: a });
}
// CPU → GPU pipeline diagram; mode 'cpu' (per-frame matrices) or 'gpu' (static buffer + 2 uniforms)
function pipeline(t, a, mode, t0) {
  if (a <= 0) return;
  const y = 330, cpuX = 860, gpuX = 1540, w = 330, h = 250;
  ctx.save(); ctx.globalAlpha = a;
  rrect(cpuX, y, w, h, 18, 'rgba(10,14,24,0.88)', 'rgba(255,255,255,0.12)');
  rrect(gpuX, y, w, h, 18, 'rgba(10,14,24,0.88)', 'rgba(255,255,255,0.12)');
  text('CPU', cpuX + 24, y + 34, { font: '700 22px "SF Mono"', color: mode === 'cpu' ? C.hot : C.dim });
  text('GPU', gpuX + 24, y + 34, { font: '700 22px "SF Mono"', color: mode === 'gpu' ? C.good : C.dim });
  ctx.restore();
  const k = Math.max(0, t - t0);
  if (mode === 'cpu') {
    ['for 1,000,000 panels:', '  find sun', '  turn base · tilt face', '  write mat4 (64 B)'].forEach((s, i) => text(s, cpuX + 24, y + 80 + i * 32, { font: '15px "SF Mono"', color: i ? C.txt : C.amber, alpha: a }));
    text('vertex shader: just draw', gpuX + 24, y + 90, { font: '15px "SF Mono"', color: C.dim, alpha: a });
    arrowH(cpuX + w + 20, y + h / 2, gpuX - 20, C.hot, a, '每帧 61 MB  every frame');
    // packets streaming
    for (let i = 0; i < 9; i++) { const u = ((k * 0.9 + i / 9) % 1); const x = lerp(cpuX + w + 30, gpuX - 40, u); rrect(x, y + h / 2 + 22, 26, 14, 3, 'rgba(255,107,107,0.85)'); }
  } else {
    ['each frame:', '  uSpin   4 B', '  uStar  12 B'].forEach((s, i) => text(s, cpuX + 24, y + 80 + i * 32, { font: '15px "SF Mono"', color: i ? C.txt : C.amber, alpha: a }));
    ['instance buffer (once):', '  dir + seed · 16 B', '  × 131,072 = 2 MB', 'vertex shader: faceSun()'].forEach((s, i) => text(s, gpuX + 24, y + 80 + i * 32, { font: '15px "SF Mono"', color: i === 3 ? C.good : i ? C.txt : C.amber, alpha: a }));
    arrowH(cpuX + w + 20, y + h / 2, gpuX - 20, C.good, a, '每帧 16 字节  16 bytes');
  }
}
function bars(t, a, rows, x0 = 1000, y0 = 700, w = 760) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  rrect(x0 - 24, y0 - 50, w + 48, 70 + rows.length * 56, 16, 'rgba(8,11,18,0.9)', 'rgba(255,255,255,0.1)');
  text('每帧朝向计算  aim panels, per frame · ' + BENCH.cpu, x0, y0 - 22, { font: '600 15px "PingFang SC"', color: C.dim });
  const max = 50, sx = w * 0.72 / max, fb = x0 + 160 + 16.7 * sx;
  rows.forEach((r, i) => {
    const y = y0 + 14 + i * 56, k = ease(ramp(t, r.at, r.at + 0.8));
    text(r.label, x0, y + 14, { font: '600 16px "PingFang SC"', color: r.col });
    rrect(x0 + 160, y, Math.max(2, r.ms * sx * k), 28, 6, r.col);
    text(r.txt || `${(r.ms * k).toFixed(1)} ms`, x0 + 170 + Math.max(2, r.ms * sx * k), y + 14, { font: '600 16px "SF Mono"', color: '#fff' });
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(fb, y0 + 2); ctx.lineTo(fb, y0 + 18 + rows.length * 56); ctx.stroke();
  text('一帧 16.7 ms', fb, y0 + 2, { font: '13px "PingFang SC"', color: '#fff', align: 'center' });
  ctx.restore();
}
// top-down frustum culling / LOD diagram
function lodDiagram(t, a, t0) {
  if (a <= 0) return;
  const cx = 1340, cy = 560, k = Math.max(0, t - t0);
  ctx.save(); ctx.globalAlpha = a;
  rrect(860, 150, 960, 760, 18, 'rgba(8,11,18,0.9)', 'rgba(255,255,255,0.1)');
  ctx.beginPath(); ctx.roundRect(860, 150, 960, 760, 18); ctx.clip();
  const yaw = -0.6 + 0.35 * Math.sin(k * 0.5), fov = 0.55, camP = [cx - 330, cy + 250];
  // frustum wedge
  ctx.fillStyle = 'rgba(90,209,255,0.07)'; ctx.beginPath(); ctx.moveTo(...camP);
  for (const s of [-1, 1]) { const ang = yaw + s * fov; ctx.lineTo(camP[0] + Math.cos(ang) * 1200, camP[1] + Math.sin(ang) * 1200); }
  ctx.closePath(); ctx.fill();
  let s = 5; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let near = 0, far = 0, culled = 0;
  for (let i = 0; i < 420; i++) {
    const r = 60 + R() * 300, an = R() * 6.283, x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r * 0.75;
    const dx = x - camP[0], dy = y - camP[1], d = Math.hypot(dx, dy), da = Math.atan2(dy, dx) - yaw, inView = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < fov;
    if (y < 165 || y > 900 || x < 875 || x > 1805) continue;
    if (!inView) { culled++; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    else if (d < 380) { near++; ctx.fillStyle = C.amber; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.fill(); }
    else { far++; ctx.fillStyle = C.cyan; ctx.fillRect(x - 2.5, y - 2.5, 5, 5); }
  }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(...camP, 9, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,179,92,0.5)'; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(...camP, 380, yaw - fov, yaw + fov); ctx.stroke(); ctx.setLineDash([]);
  text('相机 camera', camP[0] - 10, camP[1] + 30, { font: '600 15px "PingFang SC"', color: '#fff', align: 'center' });
  [[C.amber, `近：实心模型 ${near}`], [C.cyan, `远：平面贴片 ${far}`], ['rgba(255,255,255,0.4)', `视野外：不画 ${culled}`]].forEach(([c, l], i) => { ctx.fillStyle = c; ctx.fillRect(890, 190 + i * 32, 14, 14); text(l, 914, 197 + i * 32, { font: '600 16px "PingFang SC"' }); });
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
const CLIPS = { launch: CLIP('dsp_launch', 180), sails: CLIP('dsp_sails', 150), swarm: CLIP('dsp_swarm', 210), shell: CLIP('dsp_shell', 270) };

function build() {
  const fIn = CK('intro', 1, 1) - 0.3, sIn = CK('intro', 1, 2) - 0.2, back = L('intro', 2) - 0.3;
  shot(0, (c, t) => hookShot(c, t));
  shot(fIn, (c, t) => { FOOT = { clip: CLIPS.launch, t: t - fIn, clipX: c }; }, { wipe: 1.1, labA: ['我们的渲染', 'OUR RENDER'], labB: ['《戴森球计划》实机', 'DYSON SPHERE PROGRAM'] });
  shot(sIn, (c, t) => { FOOT = { clip: CLIPS.sails, t: t - sIn, clipX: c }; }, { dissolve: 0.5 });
  shot(back, (c, t) => wideShot(c, t), { wipe: 1.1, labA: ['实机', 'GAMEPLAY'], labB: ['three.js · 一百万张帆', 'OURS · 1M SAILS'] });
  shot(S('cpu'), (c, t) => farmShot(c, t, { dim: 0.55 }), { wipe: 1.0 });
  shot(S('gpu'), (c, t) => gpuShot(c, t), { wipe: 1.0, labA: ['CPU 逐个计算', 'CPU PER PANEL'], labB: ['顶点着色器', 'VERTEX SHADER'] });
  shot(S('swarm'), (c, t) => swarmShot(c, t), { wipe: 1.1 });
  shot(S('shell'), (c, t) => shellShot(c, t), { wipe: 1.0 });
  shot(S('lod'), (c, t) => { draw3D(c, t, { dim: 0.75 }); spaceCam(R3.cam, WIDE_P, WIDE_L); draw3D(c, t, { dim: 0.7 }); return {}; }, { wipe: 1.0 });
  shot(S('bridge'), (c, t) => bridgeShot(c, t), { wipe: 1.1 });
  for (const s of shots) if (s.t0 > 0.05 && (s.wipe || s.dissolve)) events.push({ t: +s.t0.toFixed(3), wipe: s.wipe || s.dissolve });
}

// close on the hero panel, then pull out to the whole planet
function hookShot(clip, t) {
  const k = ease2(ramp(t, L('intro', 0) + 2.8, CK('intro', 1, 1) - 0.2));
  const f = groundCam(R3.cam, t, HERO_OFF, HERO_LOOK);
  const close = R3.cam.position.clone(), closeL = f.base.clone().addScaledVector(f.up, 0.2);
  const farP = PLANET_P(t), farL = SYS.planetPos.clone();
  R3.cam.position.lerpVectors(close, farP, k * k);
  R3.cam.up.lerpVectors(f.up, V3(0, 1, 0), k).normalize();
  R3.cam.lookAt(closeL.lerp(farL, Math.min(1, k * 1.4)));
  draw3D(clip, t, { hl: 1 - k, fov: lerp(40, 40, k) });
  return { elev: f.elev };
}
function wideShot(clip, t) { spaceCam(R3.cam, WIDE_P.clone().add(V3(Math.sin(t * 0.03) * 40, 0, 0)), WIDE_L); draw3D(clip, t); return {}; }
function farmShot(clip, t, o = {}) {
  groundCam(R3.cam, t, [2.6, 1.3, -1.8], [-0.8, 0.0, 0.7], panelWithElev((S('cpu') + E('cpu')) / 2, 0.97, 'cpu'));
  draw3D(clip, t, o); return {};
}
function gpuShot(clip, t) {
  const l1 = L('gpu', 1), l2 = L('gpu', 2), l3 = L('gpu', 3);
  if (t < l3 - 0.3) {
    // farm close: panels tracking; the planet turns 6x faster here so the motion reads (time-lapse)
    const k = ease2(ramp(t, l2 - 0.6, l2 + 1.2));
    const d0 = panelWithElev((S('gpu') + l3) / 2, 0.97, 'gpu');
    groundCam(R3.cam, t, [lerp(2.6, 5.5, k), lerp(1.3, 3.2, k), lerp(-1.8, -4.2, k)], [-0.8, 0.0, 0.7], d0);
    draw3D(clip, t, {});
  } else {
    // terminator from orbit: day-side panels tilted, night-side parked flat
    // look straight at the terminator: the sun is off to the left, night to the right
    const toSun = V3(0, 0, 0).sub(SYS.planetPos).normalize(), side = toSun.clone().cross(V3(0, 1, 0)).normalize();
    const p = SYS.planetPos.clone().addScaledVector(side, -95).addScaledVector(toSun, 18).add(V3(0, 22, 0));
    spaceCam(R3.cam, p, SYS.planetPos.clone().addScaledVector(toSun, 6));
    draw3D(clip, t, {});
  }
  return {};
}
function swarmShot(clip, t) {
  const s0 = S('swarm'), l2 = L('swarm', 2);
  const k = ease2(ramp(t, s0 + 0.5, L('swarm', 1) + 1.5));
  const p0 = WIDE_P, p1 = V3(150, 40, 230);
  spaceCam(R3.cam, p0.clone().lerp(p1, k), WIDE_L.clone().lerp(V3(0, 0, 0), k));
  const grow = ease(ramp(t, l2 - 0.5, l2 + 2.5));
  draw3D(clip, t, { sailCount: Math.round(lerp(4096, N_SAILS, Math.pow(grow, 3))) * (t < l2 - 0.5 ? 1 : 1) });
  return { sails: Math.round(lerp(4096, N_SAILS, Math.pow(grow, 3))) };
}
function shellShot(clip, t) {
  const a = 0.6 + (t - S('shell')) * 0.02;
  spaceCam(R3.cam, V3(Math.sin(a) * 640, 220, Math.cos(a) * 640), V3(0, 30, 0));
  draw3D(clip, t, { shell: ease(ramp(t, S('shell') + 0.3, S('shell') + 1.6)), sails: 0.6 });
  return {};
}
function bridgeShot(clip, t) { spaceCam(R3.cam, WIDE_P.clone().add(V3(-60 + (t - S('bridge')) * 3, 30, 60)), WIDE_L); draw3D(clip, t, { dim: 0.2 }); return {}; }

// ------------------------------------------------------------------ overlay
const BRAND = ['万象成群 · 第四期', 'Swarms at Scale · EP04 · Dyson Sphere'];
const CH = [
  { id: 'cpu', step: '01 / 05', zh: '每块板一个 Update', en: 'One Update per panel' },
  { id: 'gpu', step: '02 / 05', zh: '把朝向搬进顶点着色器', en: 'Aim in the vertex shader' },
  { id: 'swarm', step: '03 / 05', zh: '什么都不存的太阳帆', en: 'Sails that store nothing' },
  { id: 'shell', step: '04 / 05', zh: '戴森壳：一层一次绘制', en: 'Dyson shell: one draw per layer' },
  { id: 'lod', step: '05 / 05', zh: '少画与不画', en: 'LOD and culling' },
];
const DESC = {
  cpu: ['每帧：CPU 为每块板算一个 4×4 矩阵（64 字节），再整批上传。', 'Per frame: a 4×4 matrix (64 bytes) per panel on the CPU, then uploaded.'],
  gpu: ['实例数据只传一次；每帧只更新自转角和太阳位置两个 uniform。', 'Instance data goes up once; each frame updates just two uniforms: spin and sun.'],
  swarm: ['位置 = f(编号, 时间)：哈希定轨道，开普勒定律定角速度。', 'position = f(index, time): a hash picks the orbit, Kepler sets the speed.'],
  shell: ['同一种六边形，实例化后整层一次 draw call。', 'Identical hexagons, instanced: one draw call for the whole layer.'],
  lod: ['近处用实心模型，远处用贴片，视野外直接跳过。', 'Solid meshes up close, sprites far away, nothing out of view.'],
};
function panelFor(t) {
  const k = CH.findIndex(c => t >= S(c.id) && t < E(c.id));
  if (k < 0) return null;
  const c = CH[k], s0 = S(c.id), s1 = E(c.id);
  const P = { step: c.step, zh: c.zh, en: c.en, dots: { n: 5, cur: k, frac: (t - s0) / (s1 - s0) }, opacity: win(t, s0 + 0.5, s1 + 0.2, 0.6, 0.5), desc: DESC[c.id] };
  const q = (() => { const s = TL.scenes.find(x => x.id === c.id); let r = 0; s.lines.forEach((l, i) => { if (t >= l.start - 0.3) r = i; }); return r; })();
  if (c.id === 'cpu' && q === 0) P.code = { src: 'bench', region: 'cpu', file: 'bench.mjs · aimPanelsCPU()', since: L('cpu', 0) + 0.4, hl: ['const o = i * 16'] };
  if (c.id === 'gpu' && q >= 2) P.code = { src: 'space', region: 'faceSun', file: 'space.js · PANEL_VS', since: L('gpu', 2), hl: q === 2 ? ['azim =', 'float tilt'] : ['float awake'], lang: 'GLSL ES 3.0' };
  if (c.id === 'swarm' && q >= 1 && q <= 2) P.code = { src: 'space', region: 'orbit', file: 'space.js · SAIL_VS', since: L('swarm', 1), hl: q === 1 ? ['ihash(id * 4u)', 'float w = 26.0'] : ['vec3 p = uStar'], lang: 'GLSL ES 3.0' };
  return P;
}
const fmt = n => Math.round(n).toLocaleString('en-US');

async function frame(t) {
  FOOT = null;
  renderer.setScissorTest(false); renderer.setRenderTarget(null);
  renderer.setClearColor(0x020308, 1); renderer.clear();
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
  const sid = TL.scenes.find(s => t >= s.start && t < s.end)?.id || 'bridge';
  out.brand = ease(ramp(t, S('title') - 0.4, S('title') + 0.6));
  out.panel = panelFor(t);
  const chip = (zh, en, real) => ({ zh, en, real, opacity: Math.max(out.brand, sid === 'intro' ? 1 : 0) });
  const pip = (clip, a, b, label, rect = [1240, 130, 640, 360]) => {
    const o = win(t, a, b, 0.5, 0.5); if (o <= 0) return;
    out.frame = { clip, t: clamp(t - a, 0, clip.count / 30 - 0.05), opacity: o, rect };
    out.labels.push({ x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] + 26, zh: label[0], en: label[1], o, plain: true });
  };
  if (sid === 'intro') {
    const fIn = CK('intro', 1, 1) - 0.3, back = L('intro', 2) - 0.3;
    if (t < fIn) {
      const o = win(t, 0.8, CK('intro', 1, 0) + 0.5, 0.5, 0.5);
      out.labels.push({ x: 960, y: 150, zh: `太阳高度 ${Math.round(Math.asin(clamp(extra.elev ?? 0, -1, 1)) * 180 / Math.PI)}°`, en: 'SUN ELEVATION', o, color: '#ffc46b' });
    } else if (t < back) { out.chip = chip('《戴森球计划》实机画面', 'Dyson Sphere Program gameplay', true); out.credit = { k: 'FOOTAGE', text: 'Dyson Sphere Program © Youthcat Studio / Gamera Games · Bilibili @不肝不氪的云在', o: 1 }; }
    else out.chip = chip('three.js · 131,072 块板 · 1,048,576 张帆', 'Our render');
    out.subsBox = t > fIn;
  }
  if (sid === 'title') {
    const tc = win(t, S('title') + 0.1, E('title') - 0.2, 0.7, 0.6);
    out.title = { opacity: tc, k: '万象成群 · 第四期 · EP04', h: '一百万块板，追着太阳转', e: 'Dyson Sphere Program — a million things facing the sun', tags: ['GPU 实例化', '顶点着色器', '程序化绘制'], top: 320, size: 80 };
    out.chip = chip('three.js · 1,048,576 张太阳帆', 'Our render');
  }
  if (sid === 'cpu') {
    out.chip = chip('CPU 逐个计算', 'CPU, one panel at a time');
    pipeline(t, win(t, S('cpu') + 0.6, L('cpu', 1) - 0.3, 0.6, 0.4), 'cpu', S('cpu'));
    bars(t, win(t, L('cpu', 1) - 0.2, E('cpu') + 0.2, 0.5, 0.5), [{ label: '100,000 块', ms: BENCH['100000'].ms, col: C.amber, at: CK('cpu', 1, 1) - 0.4 }, { label: '1,000,000 块', ms: BENCH['1000000'].ms, col: C.hot, at: CK('cpu', 1, 1) + 0.2 }], 1000, 340);
    if (t > CK('cpu', 1, 2) - 0.3) out.cards.push({ x: 1000, y: 620, w: 520, big: true, y_: 'UPLOAD · 每帧上传', zh: `${BENCH['1000000'].uploadMB} MB`, en: '1,000,000 × 64-byte matrices', o: win(t, CK('cpu', 1, 2) - 0.3, E('cpu') + 0.2, 0.5, 0.5) });
  }
  if (sid === 'gpu') {
    out.chip = chip(t < L('gpu', 3) - 0.3 ? '延时摄影 · 实时着色器' : '晨昏线 · 夜侧平放', t < L('gpu', 3) - 0.3 ? 'Time-lapse, live shader' : 'Terminator: night side parks flat');
    pipeline(t, win(t, L('gpu', 1) - 0.2, L('gpu', 2) + 0.2, 0.5, 0.4), 'gpu', L('gpu', 1));
    if (t > L('gpu', 3) - 0.3) { const o = win(t, L('gpu', 3) + 0.2, E('gpu') + 0.2, 0.5, 0.5); out.labels.push({ x: 640, y: 300, zh: '白天：朝向太阳', en: 'day side: tracking', o, color: '#ffc46b' }, { x: 1300, y: 300, zh: '夜里：平放待机', en: 'night side: parked flat', o, color: '#8fa1b6' }); }
    out.params = { head: 'PER FRAME', rows: [{ k: 'panels', v: fmt(N_PANELS), c: 'hot' }, { k: 'CPU work', v: '0 per panel', c: 'good' }, { k: 'uniforms', v: '16 B', c: 'good' }, { k: 'instance buffer', v: '2 MB · once' }, { k: 'draw calls', v: '1' }], opacity: win(t, L('gpu', 2) + 0.4, E('gpu'), 0.5, 0.5) };
  }
  if (sid === 'swarm') {
    out.chip = chip('三种轨道 · 一次绘制', 'One draw call');
    out.params = { head: 'SWARM', rows: [{ k: 'sails', v: fmt(extra.sails || N_SAILS), c: 'hot' }, { k: 'bytes stored / sail', v: '0', c: 'good' }, { k: 'orbit planes', v: '7' }, { k: 'draw calls', v: '1', c: 'good' }], opacity: win(t, S('swarm') + 0.6, E('swarm'), 0.5, 0.5) };
    pip(CLIPS.swarm, L('swarm', 3) - 0.3, E('swarm') + 0.2, ['《戴森球计划》实机：戴森云', 'Dyson Sphere Program · the swarm'], [1240, 470, 640, 360]);
    if (t > L('swarm', 3) - 0.3) out.cards.push({ x: 1240, y: 150, w: 640, y_: 'DSPSwarmDrawFix · MOD 作者分析', zh: '远处的太阳帆：一次 DrawProceduralNow(Quads, sailCount × 12)', en: 'per the mod author: all far sails in one procedural draw call', o: win(t, L('swarm', 3) - 0.3, E('swarm') + 0.2, 0.5, 0.5) });
  }
  if (sid === 'shell') {
    out.chip = chip('戴森壳', 'Dyson shell');
    pip(CLIPS.shell, S('shell') + 0.5, E('shell') + 0.2, ['《戴森球计划》实机：戴森壳', 'Dyson Sphere Program · shells'], [1240, 470, 640, 360]);
    out.cards.push({ x: 1240, y: 150, w: 640, y_: 'SPHEREOPT · MOD', zh: '5,240 块壳：18 fps → ~85 fps', en: 'instanced hexagons, one draw call per layer instead of one per shell', o: win(t, L('shell', 1) - 0.3, E('shell') + 0.2, 0.5, 0.5) });
  }
  if (sid === 'lod') { out.chip = chip('细节层级 · 视锥剔除', 'LOD · frustum culling'); lodDiagram(t, win(t, S('lod') + 0.5, E('lod') + 0.2, 0.5, 0.5), S('lod')); }
  if (sid === 'bridge') {
    const o = win(t, S('bridge') + 0.4, E('bridge') + 0.2, 0.6, 0.6);
    [['EP01', '局部规则 · 空间网格', 'boids · grid'], ['EP02', '实例化 · 顶点动画', 'instancing · vertex anim'], ['EP03', '数据与逻辑分开', 'ECS · SoA'], ['EP04', '能算的交给 GPU', 'stateless GPU']].forEach((c, i) =>
      out.cards.push({ x: 150 + i * 420, y: 360, w: 380, y_: c[0], zh: c[1], en: c[2], o: o * ramp(t, S('bridge') + 0.4 + i * 0.6, S('bridge') + 1.0 + i * 0.6) }));
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
    await loadSource('space', new URL('./sims/space.js', import.meta.url));
    await loadSource('bench', new URL('./sims/bench.mjs', import.meta.url));
    build3D(); build();
    window.DBG = { R3, THREE, panelFrame, spinAt, HERO: () => HERO, SPIN0: () => SPIN0 };
  },
  frame,
};
