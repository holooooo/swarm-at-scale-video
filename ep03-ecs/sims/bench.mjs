// Microbenchmark shown in EP03: move N entities one step, object-per-entity vs component arrays.
// usage: node ep03-ecs/sims/bench.mjs > ep03-ecs/bench.json
const N = 1_000_000, RUNS = 15, dt = 1 / 60;
//#region oop
class Vec3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Zombie {
  constructor(i) {
    this.name = 'zombie' + i; this.health = 100; this.target = null; this.anim = { clip: 'walk', t: Math.random() };
    this.position = new Vec3(Math.random(), 0, Math.random());     // each a separate heap object
    this.velocity = new Vec3(Math.random(), 0, Math.random());
  }
  update(dt) { this.position.x += this.velocity.x * dt; this.position.z += this.velocity.z * dt; }
}
//#endregion
//#region soa
const px = new Float32Array(N), pz = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N);
function moveSystem(n, dt) {          // one tight loop over contiguous columns
  for (let i = 0; i < n; i++) { px[i] += vx[i] * dt; pz[i] += vz[i] * dt; }
}
//#endregion
const world = [];
for (let i = 0; i < N; i++) world.push(new Zombie(i));
// objects get created, destroyed and re-spawned during play: shuffle to mimic a fragmented heap
for (let i = N - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [world[i], world[j]] = [world[j], world[i]]; }
for (let i = 0; i < N; i++) { px[i] = Math.random(); vx[i] = Math.random(); pz[i] = Math.random(); vz[i] = Math.random(); }
const time = f => { const ts = []; for (let r = 0; r < RUNS; r++) { const t0 = process.hrtime.bigint(); f(); ts.push(Number(process.hrtime.bigint() - t0) / 1e6); } ts.sort((a, b) => a - b); return ts[RUNS >> 1]; };
const oop = time(() => { for (let i = 0; i < N; i++) world[i].update(dt); });
const soa = time(() => moveSystem(N, dt));
console.log(JSON.stringify({ N, oopMs: +oop.toFixed(2), soaMs: +soa.toFixed(2), speedup: +(oop / soa).toFixed(1), node: process.version, cpu: (await import('node:os')).cpus()[0].model }));
