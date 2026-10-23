// Times the sword ECS on this machine at four moments of the film: node ep05-sword/sims/bench.mjs
import { Swords, N, R } from './swords.js';
import { T } from './schedule.js';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
const S = new Swords(T), out = {}, t0 = performance.now();
for (const [label, sec] of [['vortex', 40], ['battle', 100], ['river', 139], ['recall', 150]]) {
  S.advanceTo(sec * 60);
  const c0 = S.checks, a = performance.now(); S.advanceTo(sec * 60 + 120); const ms = (performance.now() - a) / 120;
  const c = S.counts();
  out[label] = { t: sec, msPerStep: +ms.toFixed(2), checksPerStep: Math.round((S.checks - c0) / 120), active: N - c.own[R.REST] - c.foe[R.HIDDEN] - c.foe[R.DEAD] };
  console.log(label, JSON.stringify(out[label]));
}
out.naivePairs = N * (N - 1) / 2; out.total = +((performance.now() - t0) / 1000).toFixed(1); out.cpu = os.cpus()[0].model; out.node = process.version;
writeFileSync(new URL('../bench.json', import.meta.url), JSON.stringify(out));
