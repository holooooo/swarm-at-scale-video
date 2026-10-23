// CPU boids in 2D. Deterministic: seeded RNG + fixed 60 Hz steps, so any frame can be
// re-simulated from scratch. The //#region blocks are quoted on screen by the code panel.
export const DT = 1 / 60;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const DEFAULTS = {
  r: 70, sepR: 26, ws: 1.5, wa: 1.0, wc: 1.0, maxSpeed: 150, minSpeed: 70, maxForce: 260,
  mode: 'grid', k: 7, margin: 110, turn: 420, predators: [], pw: 3.0, jitter: 0,
};

export class Boids2D {
  // o: { n, seed, bounds:[x0,y0,x1,y1], params:(simT)=>partial params, init:(rand, i)=>[x,y,vx,vy] }
  constructor(o) {
    this.o = o;
    this.cap = o.cap || o.n;
    this.x = new Float32Array(this.cap); this.y = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap); this.vy = new Float32Array(this.cap);
    this.reset();
  }
  reset() {
    const o = this.o, R = rng(o.seed || 7);
    const [x0, y0, x1, y1] = o.bounds;
    for (let i = 0; i < this.cap; i++) {
      if (o.init) { [this.x[i], this.y[i], this.vx[i], this.vy[i]] = o.init(R, i); continue; }
      this.x[i] = x0 + R() * (x1 - x0); this.y[i] = y0 + R() * (y1 - y0);
      const a = R() * Math.PI * 2, s = 90 + R() * 50;
      this.vx[i] = Math.cos(a) * s; this.vy[i] = Math.sin(a) * s;
    }
    this.n = o.n; this.stepN = 0; this.checks = 0;
    this.p = { ...DEFAULTS, ...(o.base || {}) };
  }
  params(simT) { return { ...DEFAULTS, ...(this.o.base || {}), ...(this.o.params ? this.o.params(simT) : {}) }; }
  advanceTo(step) {
    step = Math.max(0, Math.round(step));
    if (step < this.stepN) this.reset();
    while (this.stepN < step) {
      this.p = this.params(this.stepN * DT);
      if (this.o.nAt) this.n = Math.min(this.cap, Math.round(this.o.nAt(this.stepN * DT)));
      this.step(DT); this.stepN++;
    }
    this.p = this.params(this.stepN * DT);
  }

  buildGrid(cell) {
    const [x0, y0, x1, y1] = this.o.bounds, pad = 400;
    const gx0 = x0 - pad, gy0 = y0 - pad;
    const cols = Math.ceil((x1 - x0 + 2 * pad) / cell), rows = Math.ceil((y1 - y0 + 2 * pad) / cell);
    const nc = cols * rows;
    if (!this.cellStart || this.cellStart.length < nc + 1) this.cellStart = new Int32Array(nc + 1);
    if (!this.cellOf || this.cellOf.length < this.cap) { this.cellOf = new Int32Array(this.cap); this.sorted = new Int32Array(this.cap); }
    const cs = this.cellStart; cs.fill(0, 0, nc + 1);
    for (let i = 0; i < this.n; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor((this.x[i] - gx0) / cell)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor((this.y[i] - gy0) / cell)));
      const c = cy * cols + cx; this.cellOf[i] = c; cs[c + 1]++;
    }
    for (let c = 0; c < nc; c++) cs[c + 1] += cs[c];
    const fill = cs.slice(0, nc);
    for (let i = 0; i < this.n; i++) this.sorted[fill[this.cellOf[i]]++] = i;
    this.grid = { cell, cols, rows, gx0, gy0 };
  }
  // candidate neighbors of boid i, by the current search mode
  candidates(i, out) {
    let m = 0;
    const p = this.p;
    if (p.mode === 'grid') {
      //#region grid
      // spatial grid: only look in my cell and the 8 around it
      const { cell, cols, rows, gx0, gy0 } = this.grid;
      const cx = Math.floor((this.x[i] - gx0) / cell), cy = Math.floor((this.y[i] - gy0) / cell);
      for (let gy = Math.max(0, cy - 1); gy <= Math.min(rows - 1, cy + 1); gy++)
        for (let gx = Math.max(0, cx - 1); gx <= Math.min(cols - 1, cx + 1); gx++) {
          const c = gy * cols + gx;
          for (let s = this.cellStart[c]; s < this.cellStart[c + 1]; s++) out[m++] = this.sorted[s];
        }
      //#endregion
    } else {
      //#region naive
      // naive: every boid compares itself with every other boid -> n * n checks
      for (let j = 0; j < this.n; j++) out[m++] = j;
      //#endregion
    }
    return m;
  }
  // neighbor list of i (metric radius, or the k nearest when mode === 'topo')
  neighbors(i, out, cand) {
    const p = this.p, xi = this.x[i], yi = this.y[i];
    const m = this.candidates(i, cand);
    this.checks += m;
    if (p.topo) {
      //#region topo
      // topological: keep the k nearest, however far away they are
      const K = p.k, bd = this._bd || (this._bd = new Float32Array(64)), bi = out;
      let have = 0;
      for (let c = 0; c < m; c++) {
        const j = cand[c]; if (j === i) continue;
        const dx = this.x[j] - xi, dy = this.y[j] - yi, d2 = dx * dx + dy * dy;
        if (have < K) { let q = have++; while (q > 0 && bd[q - 1] > d2) { bd[q] = bd[q - 1]; bi[q] = bi[q - 1]; q--; } bd[q] = d2; bi[q] = j; }
        else if (d2 < bd[K - 1]) { let q = K - 1; while (q > 0 && bd[q - 1] > d2) { bd[q] = bd[q - 1]; bi[q] = bi[q - 1]; q--; } bd[q] = d2; bi[q] = j; }
      }
      return have;
      //#endregion
    }
    let k = 0; const r2 = p.r * p.r;
    for (let c = 0; c < m; c++) {
      const j = cand[c]; if (j === i) continue;
      const dx = this.x[j] - xi, dy = this.y[j] - yi;
      if (dx * dx + dy * dy < r2) out[k++] = j;
    }
    return k;
  }
  // the three forces on boid i (each already a steering acceleration), plus extras
  forces(i, nb, cnt, f) {
    const p = this.p, x = this.x, y = this.y, vx = this.vx, vy = this.vy;
    f.sep[0] = f.sep[1] = f.ali[0] = f.ali[1] = f.coh[0] = f.coh[1] = 0;
    //#region rules
    let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0;
    for (let q = 0; q < cnt; q++) {
      const j = nb[q];
      const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy + 1e-3;
      if (d2 < p.sepR * p.sepR) { sx += dx / d2; sy += dy / d2; } // separation: push away, ~1/d
      ax += vx[j]; ay += vy[j];                                     // alignment: neighbors' heading
      cx += x[j]; cy += y[j];                                       // cohesion: neighbors' center
    }
    if (p.topo && p.sepMetric) {           // collisions are physical: separation stays metric
      sx = sy = 0;
      for (let j = 0; j < this.n; j++) {
        const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy + 1e-3;
        if (j !== i && d2 < p.sepR * p.sepR) { sx += dx / d2; sy += dy / d2; }
      }
    }
    if (cnt > 0) {
      steer(f.sep, sx, sy, vx[i], vy[i], p);
      steer(f.ali, ax, ay, vx[i], vy[i], p);
      steer(f.coh, cx / cnt - x[i], cy / cnt - y[i], vx[i], vy[i], p);
    }
    f.ax = p.ws * f.sep[0] + p.wa * f.ali[0] + p.wc * f.coh[0];       // weighted sum = this
    f.ay = p.ws * f.sep[1] + p.wa * f.ali[1] + p.wc * f.coh[1];       // frame's steering
    //#endregion
    // predators: flee
    f.fl[0] = f.fl[1] = 0;
    for (const pr of p.predators) {
      const dx = x[i] - pr.x, dy = y[i] - pr.y, d = Math.hypot(dx, dy);
      if (d < pr.r && d > 1e-3) {
        const fl = [0, 0];
        steer(fl, dx / d, dy / d, vx[i], vy[i], { maxSpeed: p.maxSpeed * 1.5, maxForce: p.maxForce * 2.5 });
        const w = (1 - d / pr.r) * p.pw;
        f.fl[0] += fl[0] * w; f.fl[1] += fl[1] * w;
      }
    }
    f.ax += f.fl[0]; f.ay += f.fl[1];
    // soft walls
    const [x0, y0, x1, y1] = this.o.bounds, mg = p.margin;
    if (x[i] < x0 + mg) f.ax += p.turn * (1 - (x[i] - x0) / mg);
    if (x[i] > x1 - mg) f.ax -= p.turn * (1 - (x1 - x[i]) / mg);
    if (y[i] < y0 + mg) f.ay += p.turn * (1 - (y[i] - y0) / mg);
    if (y[i] > y1 - mg) f.ay -= p.turn * (1 - (y1 - y[i]) / mg);
    return f;
  }
  step(dt) {
    const n = this.n, p = this.p;
    if (!this._nb || this._nb.length < this.cap) { this._nb = new Int32Array(this.cap); this._cand = new Int32Array(this.cap); this._ax = new Float32Array(this.cap); this._ay = new Float32Array(this.cap); }
    if (p.mode === 'grid') this.buildGrid(p.topo ? Math.max(p.r, 90) : p.r);
    this.checks = 0;
    const f = { sep: [0, 0], ali: [0, 0], coh: [0, 0], fl: [0, 0], ax: 0, ay: 0 };
    for (let i = 0; i < n; i++) {
      const cnt = this.neighbors(i, this._nb, this._cand);
      this.forces(i, this._nb, cnt, f);
      this._ax[i] = f.ax; this._ay[i] = f.ay;
    }
    for (let i = 0; i < n; i++) {
      let vx = this.vx[i] + this._ax[i] * dt, vy = this.vy[i] + this._ay[i] * dt;
      if (p.jitter) { const a = Math.sin(i * 12.9898 + this.stepN * 0.37) * 43758.5453; const r = (a - Math.floor(a)) - 0.5; vx += -vy * r * p.jitter * dt; vy += vx * r * p.jitter * dt; }
      const s = Math.hypot(vx, vy) || 1, cs = Math.min(p.maxSpeed, Math.max(p.minSpeed, s));
      this.vx[i] = vx / s * cs; this.vy[i] = vy / s * cs;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  }
  // diagnostics for drawing one boid's view of the world
  inspect(i) {
    if (!this._nb) this.step(0);
    if (this.p.mode === 'grid') this.buildGrid(this.p.topo ? Math.max(this.p.r, 90) : this.p.r);
    const nb = new Int32Array(this.cap), cand = new Int32Array(this.cap);
    const c0 = this.checks;
    const cnt = this.neighbors(i, nb, cand);
    const m = this.checks - c0; this.checks = c0;
    const f = this.forces(i, nb, cnt, { sep: [0, 0], ali: [0, 0], coh: [0, 0], fl: [0, 0], ax: 0, ay: 0 });
    return { nb: Array.from(nb.subarray(0, cnt)), cand: Array.from(cand.subarray(0, m)), f };
  }
  // connected groups under a linking radius (for "how many flocks are there")
  groups(linkR) {
    const n = this.n, par = new Int32Array(n).map((_, i) => i);
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const r2 = linkR * linkR;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = this.x[i] - this.x[j], dy = this.y[i] - this.y[j];
      if (dx * dx + dy * dy < r2) { const a = find(i), b = find(j); if (a !== b) par[a] = b; }
    }
    const sizes = new Map();
    for (let i = 0; i < n; i++) { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
    return { count: [...sizes.values()].filter(s => s >= 3).length, root: Array.from({ length: n }, (_, i) => find(i)), sizes };
  }
}

//#region steer
// Reynolds steering: desired velocity minus current velocity, clamped
function steer(out, dx, dy, vx, vy, p) {
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) { out[0] = out[1] = 0; return; }
  let fx = dx / d * p.maxSpeed - vx, fy = dy / d * p.maxSpeed - vy; // desired - velocity
  const f = Math.hypot(fx, fy);
  if (f > p.maxForce) { fx *= p.maxForce / f; fy *= p.maxForce / f; }  // limit(maxForce)
  out[0] = fx; out[1] = fy;
}
//#endregion
export { steer };
