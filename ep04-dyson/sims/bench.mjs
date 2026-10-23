// EP04 benchmark: aim N solar panels at the sun on the CPU and write their instance matrices,
// the way a per-object Update() would. usage: node ep04-dyson/sims/bench.mjs > ep04-dyson/bench.json
const RUNS = 15;
//#region cpu
function aimPanelsCPU(n, pos, up, sun, out) {     // every frame, for every panel:
  for (let i = 0; i < n; i++) {
    const ux = up[i * 3], uy = up[i * 3 + 1], uz = up[i * 3 + 2];
    // project the sun onto the panel's horizon -> azimuth axis, then tilt toward it
    const d = sun[0] * ux + sun[1] * uy + sun[2] * uz;
    let fx = sun[0] - d * ux, fy = sun[1] - d * uy, fz = sun[2] - d * uz;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const el = Math.max(0, Math.asin(Math.min(1, d))), c = Math.cos(el), s = Math.sin(el);
    const nx = ux * s + fx * c, ny = uy * s + fy * c, nz = uz * s + fz * c;   // panel normal
    const rx = fy * uz - fz * uy, ry = fz * ux - fx * uz, rz = fx * uy - fy * ux;
    const o = i * 16;                               // write a 4x4 matrix (64 bytes) per panel
    out[o] = rx; out[o + 1] = ry; out[o + 2] = rz; out[o + 3] = 0;
    out[o + 4] = nx; out[o + 5] = ny; out[o + 6] = nz; out[o + 7] = 0;
    out[o + 8] = ny * rz - nz * ry; out[o + 9] = nz * rx - nx * rz; out[o + 10] = nx * ry - ny * rx; out[o + 11] = 0;
    out[o + 12] = pos[i * 3]; out[o + 13] = pos[i * 3 + 1]; out[o + 14] = pos[i * 3 + 2]; out[o + 15] = 1;
  }
}
//#endregion
const res = {};
for (const n of [100_000, 1_000_000]) {
  const pos = new Float32Array(n * 3), up = new Float32Array(n * 3), out = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1); up.set([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)], i * 3); pos.set([up[i * 3] * 100, up[i * 3 + 1] * 100, up[i * 3 + 2] * 100], i * 3); }
  const ts = [];
  for (let r = 0; r < RUNS; r++) { const sun = [Math.cos(r), 0.2, Math.sin(r)]; const t0 = process.hrtime.bigint(); aimPanelsCPU(n, pos, up, sun, out); ts.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  ts.sort((a, b) => a - b);
  res[n] = { ms: +ts[RUNS >> 1].toFixed(2), uploadMB: +(n * 64 / 1048576).toFixed(1) };
}
console.log(JSON.stringify({ ...res, cpu: (await import('node:os')).cpus()[0].model, node: process.version }));
