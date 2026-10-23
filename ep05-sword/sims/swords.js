// EP05 · 16,000 flying swords as a tiny ECS: entity = index, components = typed-array columns, systems = loops.
// Deterministic: fixed 60 Hz, hashes instead of Math.random, a scripted schedule in sim seconds (= film seconds),
// snapshots every 4 s so any frame can be reached quickly. No DOM / three.js here, so Node can benchmark it.
export const DT = 1 / 60;
export const N_OWN = 10000, N_FOE = 6000, N = N_OWN + N_FOE;
export const HN = 8, H_EVERY = 1;                  // trail history: the last 8 positions (0.13 s)
export const R = { REST: 0, ORBIT: 1, FORM: 2, ATTACK: 3, GUARD: 4, SHIELD: 5, STUN: 6, FALL: 7, DEAD: 8, RIVER: 9, CIRCLE: 10, RECALL: 11, HIDDEN: 12 };
export const HERO_C = [0, 1.15, 0];                 // her chest; the sword shield is a cap around it
const R_SHIELD = 4.6, R_HIT = 6.0, R_BARRIER = 3.0;

export const ihash = x => { x = (Math.imul(x >>> 0, 747796405) + 2891336453) >>> 0; x = Math.imul(((x >>> ((x >>> 28) + 4)) ^ x) >>> 0, 277803737) >>> 0; return (((x >>> 22) ^ x) >>> 0) / 4294967295; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the rival: arrives, hovers on his sword, retreats after his barrier breaks (pure function of t)
export function enemyPos(T, t, o = [0, 0, 0]) {
  const E0 = [0, 13, 78], A = [0, 46, 300], B = [30, 70, 340];
  const k1 = sm(T.foe - 1.5, T.foe + 4.5, t), k2 = sm(T.break + 2.5, T.break + 9, t);
  for (let i = 0; i < 3; i++) o[i] = A[i] + (E0[i] - A[i]) * k1;
  o[1] += 0.35 * Math.sin(t * 1.3); o[0] += 0.5 * Math.sin(t * 0.55);
  for (let i = 0; i < 3; i++) o[i] += (B[i] - o[i]) * k2;
  return o;
}

export class Swords {
  constructor(T) {
    this.T = T;
    //#region columns
    // components: every field is one Float32Array column, indexed by entity id
    const col = () => new Float32Array(N);
    this.pos = { x: col(), y: col(), z: col() };
    this.vel = { x: col(), y: col(), z: col() };
    this.dir = { x: col(), y: col(), z: col() };            // where the tip points
    this.sword = { team: col(), role: col(), prev: col(), target: col(), until: col(), hp: col() };
    this.bend = { x: col(), y: col(), z: col(), wob: col(), wobT: col() };  // plastic bend + ringing
    //#endregion
    // static per-sword data (slots), derived from hashes
    this.slot = { rx: col(), ry: col(), rz: col(), r: col(), h: col(), vt: col(), job: col() };
    this.HS = 1 << 16; this.cnt = new Int32Array(this.HS + 1); this.start = new Int32Array(this.HS + 1); this.sorted = new Int32Array(N); this.key = new Int32Array(N);
    this.EVC = 1 << 20; this.ev = new Float32Array(this.EVC * 5);  // t x y z kind (0 clash, 1 shield, 2 barrier)
    this.hist = new Float32Array(N * HN * 3); this.histHead = 0;      // ring buffer of past positions, for the trails
    this.snaps = new Map(); this.E = [0, 0, 0];
    this.ownAtk = []; this.foeAtk = [];
    for (let i = 0; i < N; i++) {
      const h = k => ihash(i * 13 + k), own = i < N_OWN, s = this.slot;
      if (own) {
        const a = i * 2.39996, rr = 9 + 30 * Math.sqrt(h(1));
        s.rx[i] = Math.cos(a) * rr; s.rz[i] = Math.sin(a) * rr; s.ry[i] = -20 - 6 * h(2);
        s.h[i] = 2 + 44 * h(3); s.r[i] = 4.5 + 0.42 * s.h[i] + 5 * h(4); s.vt[i] = 9 + 6 * h(5);
        const j = h(6); s.job[i] = j < 0.4 ? R.ATTACK : j < 0.8 ? R.GUARD : R.SHIELD;
        if (s.job[i] === R.ATTACK) this.ownAtk.push(i);
      } else {
        s.job[i] = h(6) < 0.55 ? R.ATTACK : R.GUARD; s.r[i] = 5 + 9 * h(4); s.h[i] = -6 + 14 * h(3); s.vt[i] = 8 + 4 * h(5);
        if (s.job[i] === R.ATTACK) this.foeAtk.push(i);
      }
    }
    // the shield cap: Fibonacci points on a sphere cap facing the enemy (+z), two layers
    let k = 0; const sh = []; for (let i = 0; i < N_OWN; i++) if (this.slot.job[i] === R.SHIELD) sh.push(i);
    this.cap = new Float32Array(N_OWN * 3); this.nb = new Float64Array(7);
    this.Eb = enemyPos(T, T.break);                             // where he stands when the barrier breaks
    for (const i of sh) {
      const u = (k + 0.5) / sh.length, ang = Math.acos(1 - u * (1 - Math.cos(1.25))), th = k * 2.39996, rr = R_SHIELD + (k % 2) * 0.55;
      this.cap[i * 3] = Math.sin(ang) * Math.cos(th) * rr; this.cap[i * 3 + 1] = Math.sin(ang) * Math.sin(th) * rr * 0.85; this.cap[i * 3 + 2] = Math.cos(ang) * rr;
      k++;
    }
    this.reset();
  }
  reset() {
    const { pos, vel, dir, sword, bend, slot } = this;
    for (const c of [pos, vel, dir, sword, bend]) for (const a of Object.values(c)) a.fill(0);
    for (let i = 0; i < N; i++) {
      const own = i < N_OWN; sword.team[i] = own ? 0 : 1; sword.role[i] = own ? R.REST : R.HIDDEN;
      pos.x[i] = own ? slot.rx[i] : 0; pos.y[i] = own ? slot.ry[i] : -60; pos.z[i] = own ? slot.rz[i] : 120; dir.y[i] = -1;
      sword.hp[i] = 1 + Math.floor(ihash(i * 13 + 9) * 3); sword.target[i] = -1;
    }
    this.stepN = 0; this.evN = 0; this.checks = 0; this.lastChecks = 0;
    for (let i = 0; i < N; i++) this.clearHist(i);
  }
  clearHist(i) { const h = this.hist, b = i * HN * 3; for (let j = 0; j < HN; j++) { h[b + j * 3] = this.pos.x[i]; h[b + j * 3 + 1] = this.pos.y[i]; h[b + j * 3 + 2] = this.pos.z[i]; } }
  record() {             // the trail system: every H_EVERY steps, push every sword's position into its ring
    const h = this.hist, k = this.histHead = (this.histHead + 1) % HN, { x, y, z } = this.pos;
    for (let i = 0; i < N; i++) { const b = (i * HN + k) * 3; h[b] = x[i]; h[b + 1] = y[i]; h[b + 2] = z[i]; }
  }
  get t() { return this.stepN * DT; }
  emit(kind, x, y, z) { if (this.evN >= this.EVC) return; const e = this.ev, k = this.evN++ * 5; e[k] = this.t; e[k + 1] = x; e[k + 2] = y; e[k + 3] = z; e[k + 4] = kind; }

  //#region roles
  roleSystem() {          // the schedule hands out jobs; each sword's job was fixed by a hash of its id
    const T = this.T, t = this.t, { role, prev, until, team } = this.sword, s = this.slot;
    for (let i = 0; i < N; i++) {
      const own = i < N_OWN, h = ihash(i * 13 + 7);
      let r = role[i];
      if (r === R.STUN && t >= until[i]) r = prev[i];
      if (own) {
        if (r === R.REST && t < T.recall && t >= T.rise0 + 6 * Math.log1p(i + 1) / Math.log1p(N_OWN)) r = R.ORBIT;
        if (t >= T.form && t < T.roles && r === R.ORBIT) r = R.FORM;
        if (t >= T.roles && t < T.climax && (r === R.FORM || r === R.ORBIT)) r = s.job[i];
        if (t >= T.climax + 0.25 * h && t < T.recall && r !== R.CIRCLE && r !== R.RIVER) { r = R.RIVER; prev[i] = R.RIVER; }
        if (t >= T.recall + 2.0 * h && r !== R.REST) r = R.RECALL;
        if (t >= T.rest) r = R.REST;
      } else {
        if (r === R.HIDDEN && t >= T.foe + 5 * Math.pow(h, 0.7) && t < T.break) { r = R.FORM; this.spawnFoe(i, h); }
        if (t >= T.roles && r === R.FORM) r = s.job[i];
        if (r === R.DEAD && t >= T.roles && t < T.climax - 3) {       // reinforcements rise out of the clouds
          this.spawnFoe(i, h); r = s.job[i]; this.sword.hp[i] = 2 + Math.floor(3 * ihash(i * 31 + this.stepN));
          this.bend.x[i] = this.bend.y[i] = this.bend.z[i] = this.bend.wob[i] = 0;
        }
        if (t >= T.break + 5 * h && r !== R.FALL && r !== R.DEAD && r !== R.HIDDEN) {
          r = R.FALL; const a = ihash(i * 13 + 12) * 6.283;
          this.bend.x[i] += 0.32 * Math.cos(a); this.bend.z[i] += 0.32 * Math.sin(a); this.bend.wob[i] = 1; this.bend.wobT[i] = t;
        }
      }
      if (r === R.STUN || r === R.FALL || r === R.DEAD || r === R.REST || r === R.HIDDEN) { role[i] = r; continue; }
      if (role[i] !== R.STUN) prev[i] = r;
      role[i] = r;
    }
  }
  //#endregion
  spawnFoe(i, h) {
    const E = enemyPos(this.T, this.t, this.E), q = k => ihash(i * 13 + k);
    this.pos.x[i] = E[0] + 26 * (q(1) - 0.5); this.pos.y[i] = E[1] - 24 - 8 * q(2); this.pos.z[i] = E[2] + 14 + 16 * q(3);
    this.vel.x[i] = 0; this.vel.y[i] = 16; this.vel.z[i] = -4; this.dir.x[i] = 0; this.dir.y[i] = 1; this.dir.z[i] = 0;
    this.clearHist(i);
  }
  gridSystem() {           // spatial hash: count, prefix sum, scatter (same counting sort as EP01 / EP03)
    const { x, y, z } = this.pos, role = this.sword.role, HS = this.HS, cnt = this.cnt, start = this.start, key = this.key, sorted = this.sorted;
    cnt.fill(0);
    for (let i = 0; i < N; i++) {
      const r = role[i]; if (r === R.REST || r === R.HIDDEN || r === R.DEAD) { key[i] = -1; continue; }
      const k = cellKey(x[i], y[i], z[i], HS); key[i] = k; cnt[k]++;
    }
    start[0] = 0; for (let c = 0; c < HS; c++) start[c + 1] = start[c] + cnt[c];
    cnt.fill(0);
    for (let i = 0; i < N; i++) { const k = key[i]; if (k >= 0) sorted[start[k] + cnt[k]++] = i; }
  }
  //#region boids
  steer(i, vdx, vdy, vdz, k, amax, dt) {
    const v = this.vel; let ax = (vdx - v.x[i]) * k, ay = (vdy - v.y[i]) * k, az = (vdz - v.z[i]) * k;
    const a = Math.hypot(ax, ay, az); if (a > amax) { ax *= amax / a; ay *= amax / a; az *= amax / a; }
    v.x[i] += ax * dt; v.y[i] += ay * dt; v.z[i] += az * dt;
  }
  // orbit around an axis through (cx, cz): tangential speed + springs to the sword's radius and height,
  // plus the two boids rules that need neighbours: separation and alignment (at most 8 neighbours)
  orbit(i, cx, cy, cz, rad, hgt, vt, dt) {
    const p = this.pos, v = this.vel;
    const rx = p.x[i] - cx, rz = p.z[i] - cz, rho = Math.hypot(rx, rz) || 1e-3;
    const tx = -rz / rho, tz = rx / rho, ux = rx / rho, uz = rz / rho;      // tangent, radial
    let vdx = tx * vt + ux * (rad - rho) * 1.2, vdz = tz * vt + uz * (rad - rho) * 1.2, vdy = (cy + hgt - p.y[i]) * 0.8;
    this.neighbours(i, 1.25); const [sx, sy, sz, ax, ay, az, n] = this.nb;
    vdx += sx * 2.2; vdy += sy * 2.2; vdz += sz * 2.2;                      // separation
    if (n) { vdx += (ax / n - v.x[i]) * 0.35; vdy += (ay / n - v.y[i]) * 0.35; vdz += (az / n - v.z[i]) * 0.35; } // alignment
    this.steer(i, vdx, Math.max(-14, Math.min(16, vdy)), vdz, 2.5, 26, dt);
  }
  //#endregion
  neighbours(i, rs) {      // writes [separation xyz, velocity sum xyz, count] into this.nb
    const p = this.pos, v = this.vel, start = this.start, sorted = this.sorted, HS = this.HS;
    const px = p.x[i], py = p.y[i], pz = p.z[i], cx = Math.floor(px / CS), cy = Math.floor(py / CS), cz = Math.floor(pz / CS);
    let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, n = 0, chk = 0;
    for (let dx = -1; dx <= 1 && n < 8; dx++) for (let dy = -1; dy <= 1 && n < 8; dy++) for (let dz = -1; dz <= 1 && n < 8; dz++) {
      const k = hash3(cx + dx, cy + dy, cz + dz, HS);
      for (let q = start[k]; q < start[k + 1] && n < 8; q++) {
        const j = sorted[q]; if (j === i) continue; chk++;
        const ex = px - p.x[j], ey = py - p.y[j], ez = pz - p.z[j], d2 = ex * ex + ey * ey + ez * ez;
        if (d2 > CS * CS) continue;
        n++; ax += v.x[j]; ay += v.y[j]; az += v.z[j];
        if (d2 < rs * rs && d2 > 1e-6) { const w = 1 / d2; sx += ex * w; sy += ey * w; sz += ez * w; }
      }
    }
    this.checks += chk; const o = this.nb;
    o[0] = sx; o[1] = sy; o[2] = sz; o[3] = ax; o[4] = ay; o[5] = az; o[6] = n;
  }
  validTarget(j, want) { const r = this.sword.role[j]; return r === want || r === R.STUN && this.sword.prev[j] === want; }
  pick(i, list, want) {
    if (!list.length) return -1;
    for (let k = 0; k < 6; k++) { const j = list[Math.floor(ihash(i * 7919 + Math.floor(this.t * 0.7) * 31 + k) * list.length)]; if (this.validTarget(j, want)) return j; }
    return -1;
  }
  moveSystem(dt) {
    const T = this.T, t = this.t, p = this.pos, v = this.vel, s = this.slot, sw = this.sword, role = sw.role;
    const E = enemyPos(T, t, this.E), H = HERO_C;
    for (let i = 0; i < N; i++) {
      const r = role[i], h = ihash(i * 13 + 5);
      if (r === R.REST || r === R.HIDDEN || r === R.DEAD) continue;
      if (r === R.ORBIT) this.orbit(i, 0, 0, 0, s.r[i], s.h[i], s.vt[i], dt);
      else if (r === R.FORM) {                       // sunflower disc facing the other side, turning slowly
        const own = i < N_OWN, k = own ? i : i - N_OWN, n = own ? N_OWN : N_FOE, rad = (own ? 19 : 13) * Math.sqrt((k + 0.5) / n), th = k * 2.39996 + (own ? 0.05 : -0.06) * t;
        const cx = own ? 0 : E[0], cy = own ? 15 : E[1] + 3, cz = own ? 14 : E[2] - 13, cup = (own ? -1 : 1) * 0.012 * rad * rad;
        const gx = cx + Math.cos(th) * rad, gy = cy + Math.sin(th) * rad * 0.8, gz = cz + cup;
        this.steer(i, (gx - p.x[i]) * 2, (gy - p.y[i]) * 2, (gz - p.z[i]) * 2, 3, 30, dt);
      } else if (r === R.SHIELD) {
        const gx = H[0] + this.cap[i * 3], gy = H[1] + this.cap[i * 3 + 1], gz = H[2] + this.cap[i * 3 + 2];
        this.steer(i, (gx - p.x[i]) * 3, (gy - p.y[i]) * 3, (gz - p.z[i]) * 3, 3, 40, dt);
      } else if (r === R.ATTACK) {
        const own = i < N_OWN, gx = own ? E[0] : H[0], gy = own ? E[1] : H[1], gz = own ? E[2] : H[2];
        let dx = gx - p.x[i], dy = gy - p.y[i], dz = gz - p.z[i]; const d = Math.hypot(dx, dy, dz) || 1, sp = own ? 25 : 22;
        const wv = Math.sin(t * 2.1 + h * 40) * 0.5;                     // weave so they don't arrive in a line
        this.steer(i, dx / d * sp + wv * 6, dy / d * sp + Math.cos(t * 1.7 + h * 30) * 3, dz / d * sp, 2.2, 34, dt);
      } else if (r === R.GUARD) {                    // intercept: chase one sword of the other side's attackers
        let j = sw.target[i];
        if (j < 0 || !this.validTarget(j, R.ATTACK) || ihash(i * 3 + Math.floor(t * 0.7)) < 0.01) j = sw.target[i] = this.pick(i, i < N_OWN ? this.foeAtk : this.ownAtk, R.ATTACK);
        if (j < 0) { this.orbit(i, i < N_OWN ? 0 : E[0], i < N_OWN ? 4 : E[1] - 6, i < N_OWN ? 8 : E[2], s.r[i] * 0.4 + 4, 6, s.vt[i], dt); continue; }
        const lx = p.x[j] + v.x[j] * 0.25 - p.x[i], ly = p.y[j] + v.y[j] * 0.25 - p.y[i], lz = p.z[j] + v.z[j] * 0.25 - p.z[i], d = Math.hypot(lx, ly, lz) || 1;
        this.steer(i, lx / d * 31, ly / d * 31, lz / d * 31, 3, 46, dt);
        if (Math.hypot(p.x[j] - p.x[i], p.y[j] - p.y[i], p.z[j] - p.z[i]) < 1.3 && role[j] !== R.STUN) this.clash(i < N_OWN ? i : j, i < N_OWN ? j : i);
      } else if (r === R.RIVER) {                    // one river of blades toward him, pulled onto the line her -> him
        const lx = E[0] - H[0], ly = E[1] + 2 - H[1], lz = E[2] - H[2], L2 = lx * lx + ly * ly + lz * lz;
        const u = Math.max(0, Math.min(1, ((p.x[i] - H[0]) * lx + (p.y[i] - H[1]) * ly + (p.z[i] - H[2]) * lz) / L2));
        const qx = H[0] + lx * u - p.x[i], qy = H[1] + 6 * Math.sin(u * Math.PI) + ly * u - p.y[i], qz = H[2] + lz * u - p.z[i];
        let dx = E[0] - p.x[i], dy = E[1] - p.y[i], dz = E[2] - p.z[i]; const d = Math.hypot(dx, dy, dz) || 1;
        if (d < 9 && t > T.break) { role[i] = R.CIRCLE; continue; }
        this.steer(i, dx / d * 40 + qx * 0.9, dy / d * 40 + qy * 0.9, dz / d * 40 + qz * 0.9, 3, 70, dt);
      } else if (r === R.CIRCLE) this.orbit(i, this.Eb[0], this.Eb[1] - 10, this.Eb[2], 6 + s.r[i] * 0.45, 4 + s.h[i] * 0.35, s.vt[i] * 1.2, dt);
      else if (r === R.RECALL) {                     // spiral back down around her, then dive to the rest slot
        const tr = T.recall + 2.0 * ihash(i * 13 + 7), u = sm(tr, tr + 9, t);
        if (u < 0.92) this.orbit(i, 0, 0, 0, s.r[i], s.h[i] + (s.ry[i] - s.h[i]) * u, s.vt[i], dt);
        else this.steer(i, (s.rx[i] - p.x[i]) * 1.5, (s.ry[i] - p.y[i]) * 1.5, (s.rz[i] - p.z[i]) * 1.5, 3, 30, dt);
      } else if (r === R.STUN || r === R.FALL) {     // tumbling: drag, gravity, no steering
        const g = r === R.FALL ? 9.8 : i < N_OWN ? 1.5 : 4, drag = r === R.FALL ? 0.25 : 1.4;
        v.x[i] -= v.x[i] * drag * dt; v.y[i] -= (v.y[i] * drag + g) * dt; v.z[i] -= v.z[i] * drag * dt;
      }
    }
  }
  //#region clash
  clash(i, j) {            // i: hers, j: his. Bounce apart, and write the hit into both swords' bend
    const p = this.pos, v = this.vel, t = this.t, sw = this.sword;
    let nx = p.x[j] - p.x[i], ny = p.y[j] - p.y[i], nz = p.z[j] - p.z[i]; const d = Math.hypot(nx, ny, nz) || 1; nx /= d; ny /= d; nz /= d;
    const vr = (v.x[i] - v.x[j]) * nx + (v.y[i] - v.y[j]) * ny + (v.z[i] - v.z[j]) * nz, J = Math.max(8, vr) * 0.9;
    for (const [e, sgn] of [[i, -1], [j, 1]]) {
      v.x[e] += sgn * nx * J; v.y[e] += sgn * ny * J + 3; v.z[e] += sgn * nz * J;
      this.hit(e, sgn * nx, sgn * ny, sgn * nz, Math.min(1, J / 40) * (0.07 + 0.13 * ihash(e * 17 + this.stepN)), 0.45 + 0.5 * ihash(e * 29 + this.stepN));
    }
    if (--sw.hp[j] <= 0) { sw.role[j] = R.FALL; }
    this.emit(0, (p.x[i] + p.x[j]) / 2, (p.y[i] + p.y[j]) / 2, (p.z[i] + p.z[j]) / 2);
  }
  hit(e, nx, ny, nz, amount, stun) {
    const b = this.bend, dr = this.dir, sw = this.sword;
    const k = nx * dr.x[e] + ny * dr.y[e] + nz * dr.z[e];                // keep only the part across the blade
    let bx = nx - dr.x[e] * k, by = ny - dr.y[e] * k, bz = nz - dr.z[e] * k; const l = Math.hypot(bx, by, bz) || 1;
    b.x[e] += bx / l * amount; b.y[e] += by / l * amount; b.z[e] += bz / l * amount;
    const m = Math.hypot(b.x[e], b.y[e], b.z[e]); if (m > 0.5) { b.x[e] *= 0.5 / m; b.y[e] *= 0.5 / m; b.z[e] *= 0.5 / m; }
    b.wob[e] = 1; b.wobT[e] = this.t;
    if (sw.role[e] !== R.FALL) { if (sw.role[e] !== R.STUN) sw.prev[e] = sw.role[e]; sw.role[e] = R.STUN; sw.until[e] = this.t + stun; }
  }
  //#endregion
  contactSystem() {        // attackers against her shield / his barrier; stray blades crossing in the crowd
    const p = this.pos, v = this.vel, sw = this.sword, role = sw.role, t = this.t, H = HERO_C, E = this.E, T = this.T;
    const start = this.start, sorted = this.sorted, HS = this.HS;
    for (let i = 0; i < N; i++) {
      const r = role[i]; if (r !== R.ATTACK && r !== R.RIVER) continue;
      const own = i < N_OWN, c = own ? E : H, rad = own ? R_BARRIER : R_HIT;
      if (own && t > T.break) continue;
      let nx = p.x[i] - c[0], ny = p.y[i] - c[1], nz = p.z[i] - c[2]; const d = Math.hypot(nx, ny, nz);
      if (d > rad || d < 1e-3) continue;
      nx /= d; ny /= d; nz /= d;
      const vn = v.x[i] * nx + v.y[i] * ny + v.z[i] * nz;
      if (vn < 0) { v.x[i] -= 1.6 * vn * nx; v.y[i] -= 1.6 * vn * ny; v.z[i] -= 1.6 * vn * nz; }
      p.x[i] = c[0] + nx * rad; p.y[i] = c[1] + ny * rad; p.z[i] = c[2] + nz * rad;
      this.hit(i, -nx, -ny, -nz, own ? 0.06 : 0.14, own ? 0.5 : 0.8);
      this.emit(own ? 2 : 1, p.x[i], p.y[i], p.z[i]);
      if (!own) {           // the shield blades near the impact ring too
        const cx = Math.floor(p.x[i] / CS), cy = Math.floor(p.y[i] / CS), cz = Math.floor(p.z[i] / CS);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const k = hash3(cx + dx, cy + dy, cz + dz, HS);
          for (let q = start[k]; q < start[k + 1]; q++) { const j = sorted[q]; if (role[j] === R.SHIELD) { this.bend.wob[j] = 0.7; this.bend.wobT[j] = t; } }
        }
        if (--sw.hp[i] <= 0) role[i] = R.FALL;
      }
    }
  }
  integrateSystem(dt) {
    const p = this.pos, v = this.vel, dr = this.dir, b = this.bend, sw = this.sword, role = sw.role, t = this.t, T = this.T;
    for (let i = 0; i < N; i++) {
      const r = role[i];
      if (r === R.REST || r === R.HIDDEN || r === R.DEAD) continue;
      p.x[i] += v.x[i] * dt; p.y[i] += v.y[i] * dt; p.z[i] += v.z[i] * dt;
      let gx, gy, gz;
      if (r === R.STUN || r === R.FALL) {            // spin about a fixed per-sword axis
        const a = ihash(i * 13 + 11) * 6.283, ax = Math.cos(a), az = Math.sin(a), w = (r === R.FALL ? 7 : 11) * dt;
        const c = Math.cos(w), s = Math.sin(w), x = dr.x[i], y = dr.y[i], z = dr.z[i], k = (ax * x + az * z) * (1 - c);
        gx = x * c + (0 * z - az * y) * s + ax * k; gy = y * c + (az * x - ax * z) * s; gz = z * c + (ax * y - 0 * x) * s + az * k;
        dr.x[i] = gx; dr.y[i] = gy; dr.z[i] = gz;
        if (r === R.FALL && p.y[i] < -36) role[i] = R.DEAD;
      } else {
        if (r === R.FORM) { gx = 0; gy = 0; gz = i < N_OWN ? 1 : -1; }
        else if (r === R.SHIELD) { gx = this.cap[i * 3]; gy = this.cap[i * 3 + 1]; gz = this.cap[i * 3 + 2]; }
        else { gx = v.x[i]; gy = v.y[i]; gz = v.z[i]; }
        const l = Math.hypot(gx, gy, gz) || 1, k = Math.min(1, dt * 9);
        gx = dr.x[i] + (gx / l - dr.x[i]) * k; gy = dr.y[i] + (gy / l - dr.y[i]) * k; gz = dr.z[i] + (gz / l - dr.z[i]) * k;
      }
      const l = Math.hypot(gx, gy, gz) || 1; dr.x[i] = gx / l; dr.y[i] = gy / l; dr.z[i] = gz / l;
      if (r === R.RECALL) { const f = Math.exp(-dt * 0.45); b.x[i] *= f; b.y[i] *= f; b.z[i] *= f; }  // straighten on the way home
    }
    if (t >= T.rest) for (let i = 0; i < N_OWN; i++) {           // the loop frame: everyone exactly home and straight
      p.x[i] = this.slot.rx[i]; p.y[i] = this.slot.ry[i]; p.z[i] = this.slot.rz[i]; v.x[i] = v.y[i] = v.z[i] = 0;
      dr.x[i] = 0; dr.y[i] = -1; dr.z[i] = 0; b.x[i] = b.y[i] = b.z[i] = b.wob[i] = b.wobT[i] = 0;
    }
  }
  //#region tick
  step() {
    const dt = DT, c0 = this.checks;
    this.roleSystem();
    this.gridSystem();
    this.moveSystem(dt);
    this.contactSystem();
    this.integrateSystem(dt);
    this.lastChecks = this.checks - c0;
    this.stepN++;
  }
  //#endregion
  snapshot() {
    const s = { stepN: this.stepN, evN: this.evN, checks: this.checks, hist: this.hist.slice(), histHead: this.histHead, cols: [] };
    for (const c of [this.pos, this.vel, this.dir, this.sword, this.bend]) for (const a of Object.values(c)) s.cols.push(a.slice());
    return s;
  }
  restore(s) {
    this.stepN = s.stepN; this.evN = s.evN; this.checks = s.checks; this.hist.set(s.hist); this.histHead = s.histHead; let k = 0;
    for (const c of [this.pos, this.vel, this.dir, this.sword, this.bend]) for (const a of Object.values(c)) a.set(s.cols[k++]);
  }
  advanceTo(step) {
    step = Math.max(0, Math.round(step));
    if (step < this.stepN) {
      let best = null; for (const [k, s] of this.snaps) if (k <= step && (!best || k > best.stepN)) best = s;
      if (best) this.restore(best); else this.reset();
    }
    while (this.stepN < step) { this.step(); if (this.stepN % H_EVERY === 0) this.record(); if (this.stepN % 240 === 0 && !this.snaps.has(this.stepN)) this.snaps.set(this.stepN, this.snapshot()); }
    this.gridSystem();
  }
  counts() {
    const c = new Int32Array(16), o = new Int32Array(16), role = this.sword.role;
    for (let i = 0; i < N; i++) (i < N_OWN ? c : o)[role[i]]++;
    return { own: c, foe: o };
  }
  // events in (t0, t1]; they are appended in time order
  events(t0, t1, max = 2000) {
    const e = this.ev, first = x => { let lo = 0, hi = this.evN; while (lo < hi) { const m = (lo + hi) >> 1; if (e[m * 5] <= x) lo = m + 1; else hi = m; } return lo; };
    const a = first(t0), b = first(t1), out = [];
    for (let k = Math.max(a, b - max); k < b; k++) out.push(k);
    return out;
  }
}
const CS = 1.6;
const hash3 = (x, y, z, HS) => ((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0) & (HS - 1);
const cellKey = (x, y, z, HS) => hash3(Math.floor(x / CS), Math.floor(y / CS), Math.floor(z / CS), HS);
