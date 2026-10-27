import assert from 'node:assert/strict';
import { Sandbox, MAT, MATERIALS } from './sandbox.js';
import { createDemo, DEMO_NAMES } from './scenarios.js';
import { drawPixels } from './draw.js';

const results = [];
function check(name, test) {
  test();
  results.push(name);
  console.log(`PASS ${name}`);
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(); }
function centerY(sim, material) {
  let sum = 0, count = 0;
  for (let y = 0; y < sim.height; y++) for (let x = 0; x < sim.width; x++) {
    if (sim.get(x, y) === material) { sum += y; count++; }
  }
  assert.ok(count > 0, 'Material must still exist');
  return sum / count;
}
function box(sim) {
  sim.fillRect(0, sim.height - 1, sim.width, 1, MAT.ROCK);
  sim.fillRect(0, 0, 1, sim.height, MAT.ROCK);
  sim.fillRect(sim.width - 1, 0, 1, sim.height, MAT.ROCK);
}

check('Node-safe module imports and complete material metadata', () => {
  assert.equal(typeof drawPixels, 'function');
  assert.equal(MATERIALS.length, 8);
  assert.deepEqual(Object.values(MAT), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const material of MATERIALS) for (const key of ['name', 'zh', 'color']) assert.ok(material[key]);
  assert.ok(new Sandbox().cells instanceof Uint8Array);
});

check('sand and liquids move at most one neighboring cell each tick', () => {
  const sand = new Sandbox(64, 64);
  sand.set(30, 1, MAT.SAND);
  for (let t = 1; t <= 20; t++) {
    sand.step();
    assert.equal(sand.get(30, 1 + t), MAT.SAND);
    assert.equal(sand.count(MAT.SAND), 1);
    assert.equal(sand.stats.moved, 1);
  }
  for (const material of [MAT.WATER, MAT.OIL]) {
    const sim = new Sandbox(64, 4);
    sim.fillRect(0, 2, 64, 1, MAT.ROCK);
    sim.set(30, 1, material);
    sim.step();
    const xs = [];
    for (let x = 0; x < 64; x++) if (sim.get(x, 1) === material) xs.push(x);
    assert.equal(xs.length, 1);
    assert.equal(Math.abs(xs[0] - 30), 1, 'Supported liquid should flow sideways exactly one cell');
    assert.equal(sim.stats.moved, 1);
  }
});

check('sand takes a free diagonal when directly supported', () => {
  const sim = new Sandbox(12, 12);
  sim.set(5, 5, MAT.SAND); sim.set(5, 6, MAT.ROCK);
  sim.step();
  assert.equal(sim.get(5, 5), MAT.EMPTY);
  assert.ok(sim.get(4, 6) === MAT.SAND || sim.get(6, 6) === MAT.SAND);
});

check('sand, water, oil and rock are individually conserved without reactions', () => {
  const sim = new Sandbox(96, 80);
  box(sim);
  sim.fillRect(14, 49, 68, 30, MAT.OIL);
  sim.fillRect(25, 20, 45, 23, MAT.WATER);
  sim.fillRect(33, 3, 28, 13, MAT.SAND);
  const materials = [MAT.SAND, MAT.WATER, MAT.OIL, MAT.ROCK];
  const before = materials.map(m => sim.count(m));
  for (let t = 0; t < 480; t++) {
    sim.step();
    assert.equal(sim.stats.reactions, 0);
    if (t % 40 === 0) assert.deepEqual(materials.map(m => sim.count(m)), before);
  }
  assert.deepEqual(materials.map(m => sim.count(m)), before);
  assert.ok(centerY(sim, MAT.SAND) > centerY(sim, MAT.WATER) + 5, 'Sand must settle below water');
  assert.ok(centerY(sim, MAT.WATER) > centerY(sim, MAT.OIL) + 5, 'Water must settle below oil');
});

check('a closed one-cell column sorts by density instead of creating matter', () => {
  const sim = new Sandbox(3, 8);
  box(sim);
  sim.set(1, 4, MAT.SAND); sim.set(1, 5, MAT.WATER); sim.set(1, 6, MAT.OIL);
  steps(sim, 30);
  assert.equal(sim.get(1, 4), MAT.OIL);
  assert.equal(sim.get(1, 5), MAT.WATER);
  assert.equal(sim.get(1, 6), MAT.SAND);
  for (const m of [MAT.SAND, MAT.WATER, MAT.OIL]) assert.equal(sim.count(m), 1);
});

check('fire consumes both oil and wood and eventually dissipates as rising smoke', () => {
  for (const fuel of [MAT.OIL, MAT.WOOD]) {
    const sim = new Sandbox(32, 32);
    box(sim);
    sim.fillRect(7, 22, 18, 9, fuel);
    sim.set(10, 22, MAT.FIRE);
    const initialFuel = sim.count(fuel);
    let firePeak = 0, smokeSeen = false, reactions = 0;
    for (let t = 0; t < 240; t++) {
      sim.step();
      firePeak = Math.max(firePeak, sim.count(MAT.FIRE));
      smokeSeen ||= sim.count(MAT.SMOKE) > 0;
      reactions += sim.stats.reactions;
    }
    assert.ok(sim.count(fuel) < initialFuel / 2, `${MATERIALS[fuel].name} should burn substantially`);
    assert.ok(firePeak > 10, 'Flame should propagate beyond its ignition pixel');
    assert.ok(smokeSeen && reactions > 10);
    steps(sim, 600);
    assert.equal(sim.count(MAT.FIRE), 0);
    assert.equal(sim.count(MAT.SMOKE), 0);
  }
  const smoke = new Sandbox(24, 24);
  smoke.set(12, 18, MAT.SMOKE);
  steps(smoke, 10);
  assert.ok(centerY(smoke, MAT.SMOKE) < 18);
  steps(smoke, 200);
  assert.equal(smoke.count(MAT.SMOKE), 0);
});

check('water extinguishes contact fire and protects adjacent fuel', () => {
  const sim = new Sandbox(12, 12);
  sim.fillRect(0, 7, 12, 1, MAT.ROCK);
  sim.set(4, 6, MAT.WATER); sim.set(5, 6, MAT.FIRE); sim.set(6, 6, MAT.WOOD);
  sim.step();
  assert.equal(sim.count(MAT.FIRE), 0);
  assert.equal(sim.count(MAT.WATER), 1);
  assert.equal(sim.count(MAT.WOOD), 1);
  assert.ok(sim.count(MAT.SMOKE) > 0);
  assert.ok(sim.stats.reactions >= 1);
});

check('settled sand sleeps, support edits wake adjacent chunks, work counters are exact', () => {
  const sim = new Sandbox(64, 64);
  sim.fillRect(0, 63, 64, 1, MAT.ROCK);
  sim.set(15, 62, MAT.SAND);
  steps(sim, 3);
  assert.equal(sim.stats.visited, 0);
  assert.equal(sim.stats.activeChunks, 0);
  sim.set(15, 63, MAT.EMPTY);
  assert.equal(sim.activeChunks[3 * sim.chunksX], 1);
  assert.equal(sim.activeChunks[3 * sim.chunksX + 1], 1, 'An edit on a chunk edge wakes its neighbor');
  sim.step();
  assert.equal(sim.get(15, 63), MAT.SAND);
  assert.equal(sim.stats.activeChunks, 2);
  assert.equal(sim.stats.visited, 2 * 16 * 16);
  assert.equal(sim.stats.moved, 1);
  steps(sim, 3);
  assert.equal(sim.stats.visited, 0);
  assert.equal(sim.stats.moved, 0);
  const partial = new Sandbox(35, 19);
  partial.set(34, 18, MAT.ROCK);
  partial.step();
  assert.equal(partial.stats.activeChunks, 1);
  assert.equal(partial.stats.visited, 3 * 3, 'Partial edge chunks count real cells, not padded cells');
});

check('localized motion visits a small fraction of an otherwise sleeping world', () => {
  const sim = new Sandbox(320, 180);
  sim.fillRect(0, 179, 320, 1, MAT.ROCK);
  steps(sim, 3);
  sim.set(161, 40, MAT.SAND);
  sim.step();
  assert.ok(sim.stats.visited > 0 && sim.stats.visited <= 4 * 16 * 16);
  assert.ok(sim.stats.activeChunks < sim.stats.totalChunks / 20);
});

check('chunk optimization matches full scanning for all six authored worlds', () => {
  for (const name of DEMO_NAMES) {
    const optimized = createDemo(name);
    const reference = createDemo(name, { optimized: false });
    let optimizedVisits = 0, referenceVisits = 0;
    for (let tick = 1; tick <= 270; tick++) {
      optimized.advanceTo(tick / 60); reference.advanceTo(tick / 60);
      optimizedVisits += optimized.sim.stats.visited;
      referenceVisits += reference.sim.stats.visited;
      if (tick % 9 === 0) assert.equal(optimized.sim.hash(), reference.sim.hash(), `${name} diverged at tick ${tick}`);
    }
    assert.ok(optimizedVisits < referenceVisits / 2, `${name}: active chunks must reduce actual visited work`);
    assert.equal(reference.sim.stats.visited, 320 * 180);
  }
});

check('repeat runs, backwards seeks, reset, and arbitrary frame order are deterministic', () => {
  for (const name of DEMO_NAMES) {
    const demo = createDemo(name);
    const identity = demo.sim, initial = demo.sim.hash();
    for (const seconds of [2.3, .4, 1.7, 0, 3.8, 1]) {
      demo.advanceTo(seconds);
      const direct = createDemo(name); direct.advanceTo(seconds);
      assert.equal(demo.sim.hash(), direct.sim.hash(), `${name} failed seek to ${seconds}`);
    }
    demo.reset();
    assert.equal(demo.sim, identity, 'Reset retains the simulation object held by renderers');
    assert.equal(demo.sim.hash(), initial);
  }
});

check('timeline events ignite hero; event-free reset stays isomorphic; forward seeks retain edits', () => {
  const hero = createDemo('hero');
  assert.equal(hero.sim.count(MAT.FIRE), 0);
  hero.advanceTo(.6);
  assert.ok(hero.sim.count(MAT.FIRE) > 0);
  const beforeOil = hero.sim.count(MAT.OIL);
  hero.advanceTo(3);
  assert.ok(hero.sim.count(MAT.OIL) < beforeOil / 2);
  assert.ok(hero.sim.count(MAT.FIRE) > 300);
  const still = createDemo('hero', { events: false });
  const start = still.sim.hash(); still.advanceTo(1); still.reset();
  assert.equal(still.sim.hash(), start);
  still.advanceTo(2); assert.equal(still.sim.count(MAT.FIRE), 0);
  const editing = createDemo('empty');
  editing.sim.paint(80, 60, 3, MAT.WOOD);
  const wood = editing.sim.count(MAT.WOOD);
  editing.advanceTo(2);
  assert.equal(editing.sim.count(MAT.WOOD), wood);
  assert.equal(editing.sim.get(80, 60), MAT.WOOD);
  assert.equal(createDemo('sand', { width: 96, height: 54 }).sim.cells.length, 96 * 54);
});

check('sand scene stays dry and pours small streams for twelve seconds', () => {
  const demo = createDemo('sand');
  assert.equal(demo.sim.count(MAT.WATER), 0);
  demo.advanceTo(10);
  const earlier = demo.sim.count(MAT.SAND);
  demo.advanceTo(11);
  assert.ok(demo.sim.count(MAT.SAND) > earlier, 'Late frames must still receive fresh sand');
  assert.equal(demo.sim.count(MAT.WATER), 0);
  demo.advanceTo(12);
  const finalSand = demo.sim.count(MAT.SAND);
  demo.advanceTo(13);
  assert.equal(demo.sim.count(MAT.SAND), finalSand, 'The source stops after twelve seconds');
});

check('drawPixels accepts clipped negative offsets with a non-DOM canvas context', () => {
  let saves = 0, restores = 0, fills = 0;
  const ctx = {
    save() { saves++; }, restore() { restores++; },
    fillRect(x, y, w, h) { assert.ok([x, y, w, h].every(Number.isFinite)); fills++; },
    strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const sim = new Sandbox(8, 8); sim.paint(4, 4, 2, MAT.WATER);
  drawPixels(ctx, sim, -60, -20, 240, 240, { debug: true, grid: true, glow: true });
  assert.ok(fills >= 64);
  assert.equal(saves, restores);
});

console.log(`\n${results.length} simulation checks passed.`);
