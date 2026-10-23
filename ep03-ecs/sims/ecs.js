// A tiny ECS that runs the EP03 zombie horde.
//   entity    = an index
//   component = a few typed-array columns (no functions)
//   system    = a plain function that loops over the columns it needs (no state of its own)
// Deterministic (fixed 60 Hz, seeded spawns) with snapshots every 2 s so any frame can be reached quickly.
export const DT = 1 / 60;
let PRESS = 1.8;
export const setPress = p => { PRESS = p; };

//#region world
export class World {
  constructor(cap) { this.cap = cap; this.n = 0; this.mask = new Uint32Array(cap); this.bits = {}; this.store = {}; }
  // a component is just named columns of numbers
  component(name, fields) {
    this.bits[name] = 1 << Object.keys(this.bits).length;
    const c = {}; for (const f of fields) c[f] = new Float32Array(this.cap);
    return (this.store[name] = c);
  }
  spawn(...names) { const e = this.n++; for (const k of names) this.mask[e] |= this.bits[k]; return e; }
  // entities that own every listed component
  *query(...names) { let m = 0; for (const k of names) m |= this.bits[k]; for (let e = 0; e < this.n; e++) if ((this.mask[e] & m) === m) yield e; }
}
//#endregion

const ihash = x => { x = (Math.imul(x >>> 0, 747796405) + 2891336453) >>> 0; x = Math.imul(((x >>> ((x >>> 28) + 4)) ^ x) >>> 0, 277803737) >>> 0; return (((x >>> 22) ^ x) >>> 0) / 4294967295; };

// ---------------- level ----------------
export const LV = {
  x0: -24, x1: 176, z0: -13, z1: 13, cell: 1,       // street, metres
  wallX: 0, wallH: 8.5, behind: -7,                 // wall face at x = 0, survivors behind it
  cars: [[34, -6, 4.4, 2], [52, 5, 4.4, 2], [71, -2.5, 4.4, 2], [96, 6.5, 4.4, 2], [118, -5, 4.4, 2], [140, 2, 4.4, 2]],
};
export const GW = Math.round((LV.x1 - LV.x0) / LV.cell), GH = Math.round((LV.z1 - LV.z0) / LV.cell);
const cellOf = (x, z) => { const cx = Math.min(GW - 1, Math.max(0, Math.floor((x - LV.x0) / LV.cell))), cz = Math.min(GH - 1, Math.max(0, Math.floor((z - LV.z0) / LV.cell))); return cz * GW + cx; };
const blocked = (x, z) => LV.cars.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 0.3 && Math.abs(z - cz) < d / 2 + 0.3);

//#region flowfield
// one Dijkstra from the goal over the whole street; every cell keeps an arrow toward it
export function buildFlowField() {
  const N = GW * GH, dist = new Float32Array(N).fill(1e9), dir = new Float32Array(N * 2), wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const x = LV.x0 + (i % GW + 0.5) * LV.cell, z = LV.z0 + (Math.floor(i / GW) + 0.5) * LV.cell; wall[i] = blocked(x, z) ? 1 : 0; }
  const heap = [], push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (let cz = 0; cz < GH; cz++) for (let cx = 0; cx < GW; cx++) if (LV.x0 + (cx + 0.5) * LV.cell < LV.behind) { const i = cz * GW + cx; dist[i] = 0; push(0, i); }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [d, i] = pop(); if (d > dist[i]) continue;
    const cx = i % GW, cz = (i / GW) | 0;
    for (const [dx, dz, c] of nb) {
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
      const j = z * GW + x; if (wall[j]) continue;
      if (d + c < dist[j]) { dist[j] = d + c; push(d + c, j); }
    }
  }
  for (let i = 0; i < N; i++) {                      // arrow = toward the cheapest neighbour
    const cx = i % GW, cz = (i / GW) | 0; let best = dist[i], bx = 0, bz = 0;
    for (const [dx, dz] of nb) { const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= GW || z >= GH) continue; const j = z * GW + x; if (dist[j] < best) { best = dist[j]; bx = dx; bz = dz; } }
    const l = Math.hypot(bx, bz) || 1; dir[i * 2] = bx / l; dir[i * 2 + 1] = bz / l;
  }
  return { dist, dir, wall };
}
//#endregion

export class Horde {
  constructor(cap = 8192, o = {}) {
    this.cap = cap; this.o = { waves: 34, perSec: 260, ...o };
    this.flow = buildFlowField();
    this.cnt = new Float32Array(GW * GH); this.cntS = new Float32Array(GW * GH); this.start = new Int32Array(GW * GH + 1); this.sorted = new Int32Array(cap); this.cell = new Int32Array(cap);
    this.snaps = new Map();
    this.reset();
  }
  reset() {
    const w = this.w = new World(this.cap);
    this.pos = w.component('Position', ['x', 'y', 'z', 'heading']);
    this.vel = w.component('Velocity', ['x', 'z']);
    this.agent = w.component('Agent', ['speed', 'phase', 'seed', 'respawns']);
    this.climb = w.component('Climb', ['ty', 'air']);
    this.stepN = 0; this.crossed = 0;
  }
  // ------------- systems (tick order) -------------
  //#region spawn
  spawnSystem() {
    const w = this.w, want = Math.min(this.cap, Math.floor(this.stepN * DT * this.o.perSec));
    while (w.n < want) {
      const e = w.spawn('Position', 'Velocity', 'Agent', 'Climb');
      this.place(e, 0); this.agent.speed[e] = 3.6 + 2.4 * ihash(e * 5 + 1); this.agent.seed[e] = ihash(e * 5 + 2); this.agent.phase[e] = ihash(e * 5 + 3) * 6.28;
    }
  }
  //#endregion
  place(e, k) {
    const h = i => ihash(e * 31 + k * 977 + i);
    let x, z; do { x = 150 + h(1) * 24; z = LV.z0 + 0.8 + h(2) * (LV.z1 - LV.z0 - 1.6); k++; } while (blocked(x, z));
    this.pos.x[e] = x; this.pos.z[e] = z; this.pos.y[e] = 0; this.climb.ty[e] = 0; this.climb.air[e] = 0; this.vel.x[e] = -3; this.vel.z[e] = 0;
  }
  //#region grid
  gridSystem() {           // count zombies per cell (same counting-sort grid as the EP01 flock)
    const { x, z, y } = this.pos, n = this.w.n, cnt = this.cnt, start = this.start, sorted = this.sorted, cell = this.cell;
    cnt.fill(0);
    for (let e = 0; e < n; e++) { cell[e] = cellOf(x[e], z[e]); cnt[cell[e]]++; }
    start[0] = 0; for (let c = 0; c < cnt.length; c++) start[c + 1] = start[c] + cnt[c];
    const fill = start.slice(0, cnt.length);
    for (let e = 0; e < n; e++) sorted[fill[cell[e]]++] = e;
    for (let c = 0; c < cnt.length; c++) {        // within a cell: lowest first
      for (let i = start[c] + 1; i < start[c + 1]; i++) { const e = sorted[i]; let k = i - 1; while (k >= start[c] && y[sorted[k]] > y[e]) { sorted[k + 1] = sorted[k]; k--; } sorted[k + 1] = e; }
    }
    // a lightly blurred copy for the pressure gradient
    const s = this.cntS;
    for (let cz = 0; cz < GH; cz++) for (let cx = 0; cx < GW; cx++) {
      let a = 0, wsum = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= GW || Z >= GH) continue; const k = (dx === 0 && dz === 0) ? 2 : 1; a += cnt[Z * GW + X] * k; wsum += k; }
      s[cz * GW + cx] = a / wsum;
    }
  }
  //#endregion
  //#region flow
  flowSystem(dt) {         // read the arrow under your feet, push away from crowded cells
    const { x, z } = this.pos, v = this.vel, dir = this.flow.dir, s = this.cntS, sp = this.agent.speed;
    for (let e = 0; e < this.w.n; e++) {
      const c = this.cell[e], cx = c % GW, cz = (c / GW) | 0;
      const gx = (s[c + (cx < GW - 1 ? 1 : 0)] - s[c - (cx > 0 ? 1 : 0)]) * 0.5;
      const gz = (s[c + (cz < GH - 1 ? GW : 0)] - s[c - (cz > 0 ? GW : 0)]) * 0.5;
      const dx = dir[c * 2] * sp[e] - gx * PRESS, dz = dir[c * 2 + 1] * sp[e] - gz * PRESS;
      const k = Math.min(1, dt * 3);
      v.x[e] += (dx - v.x[e]) * k; v.z[e] += (dz - v.z[e]) * k;
    }
  }
  //#endregion
  //#region climb
  climbSystem(dt) {        // stand on top of whoever is already in your cell
    const { y } = this.pos, ty = this.climb.ty, air = this.climb.air, start = this.start, sorted = this.sorted;
    const PER_LAYER = 2.6, LAYER_H = 0.62;
    for (let c = 0; c < this.cnt.length; c++)
      for (let i = start[c]; i < start[c + 1]; i++) ty[sorted[i]] = (i - start[c]) / PER_LAYER * LAYER_H;
    for (let e = 0; e < this.w.n; e++) {
      const d = ty[e] - y[e];
      if (d > 0) { y[e] += Math.min(d, 2.4 * dt); air[e] = 0; }             // clamber up, slowly
      else { air[e] += dt; y[e] = Math.max(ty[e], y[e] - (2 + 9.8 * air[e]) * dt); } // fall
    }
  }
  //#endregion
  //#region move
  moveSystem(dt) {
    const { x, y, z, heading } = this.pos, v = this.vel;
    for (let e = 0; e < this.w.n; e++) {
      let nx = x[e] + v.x[e] * dt, nz = z[e] + v.z[e] * dt;
      if (nx < LV.wallX + 0.35 && x[e] >= LV.wallX && y[e] < LV.wallH - 0.3) { nx = LV.wallX + 0.35; v.x[e] = 0; } // the wall
      if (blocked(nx, nz)) { nx = x[e]; nz = z[e]; }
      x[e] = nx; z[e] = Math.min(LV.z1 - 0.3, Math.max(LV.z0 + 0.3, nz));
      const sp = Math.hypot(v.x[e], v.z[e]); if (sp > 0.3) heading[e] = Math.atan2(v.x[e], v.z[e]);
    }
  }
  //#endregion
  recycleSystem() {        // over the wall and landed: back to the end of the street
    const { x, y } = this.pos;
    for (let e = 0; e < this.w.n; e++) if (x[e] < LV.behind + 1 && y[e] < 0.05) { this.crossed++; this.agent.respawns[e]++; this.place(e, this.agent.respawns[e]); }
  }
  animSystem(dt) {
    const ph = this.agent.phase, v = this.vel;
    for (let e = 0; e < this.w.n; e++) ph[e] = (ph[e] + dt * (2.5 + 1.9 * Math.hypot(v.x[e], v.z[e]))) % 6283.185;
  }
  //#region tick
  step() {
    const dt = DT;
    this.spawnSystem();
    this.gridSystem();
    this.flowSystem(dt);
    this.climbSystem(dt);
    this.moveSystem(dt);
    this.recycleSystem();
    this.animSystem(dt);
    this.stepN++;
  }
  //#endregion
  snapshot() {
    const s = { stepN: this.stepN, n: this.w.n, crossed: this.crossed, mask: this.w.mask.slice(), cols: {} };
    for (const [k, c] of Object.entries(this.w.store)) for (const [f, a] of Object.entries(c)) s.cols[k + '.' + f] = a.slice();
    return s;
  }
  restore(s) {
    this.stepN = s.stepN; this.w.n = s.n; this.crossed = s.crossed; this.w.mask.set(s.mask);
    for (const [k, c] of Object.entries(this.w.store)) for (const [f, a] of Object.entries(c)) a.set(s.cols[k + '.' + f]);
  }
  advanceTo(step) {
    step = Math.max(0, Math.round(step));
    if (step < this.stepN) {
      let best = null; for (const [k, s] of this.snaps) if (k <= step && (!best || k > best.stepN)) best = s;
      if (best) this.restore(best); else this.reset();
    }
    while (this.stepN < step) { this.step(); if (this.stepN % 120 === 0 && !this.snaps.has(this.stepN)) this.snaps.set(this.stepN, this.snapshot()); }
    this.gridSystem();       // keep counts in sync with positions for drawing
  }
}
