// Per-system cost of the EP03 horde (8,192 zombies), averaged over 600 steps once the pile has formed.
// usage: node ep03-ecs/sims/bench_systems.mjs > ep03-ecs/bench_systems.json
import { Horde } from './ecs.js';
const h = new Horde(8192); h.advanceTo(50 * 60);
const names = ['spawnSystem', 'gridSystem', 'flowSystem', 'climbSystem', 'moveSystem', 'recycleSystem', 'animSystem'], ms = Object.fromEntries(names.map(n => [n, 0]));
const STEPS = 600;
for (let s = 0; s < STEPS; s++) {
  for (const n of names) { const t0 = process.hrtime.bigint(); h[n](1 / 60); ms[n] += Number(process.hrtime.bigint() - t0) / 1e6; }
  h.stepN++;
}
for (const n of names) ms[n] = +(ms[n] / STEPS).toFixed(3);
console.log(JSON.stringify({ zombies: h.w.n, msPerStep: ms, total: +Object.values(ms).reduce((a, b) => a + b, 0).toFixed(2) }));
