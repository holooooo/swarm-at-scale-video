import { Sandbox, MAT, noise } from './sandbox.js';

export const DEMO_NAMES = Object.freeze(['hero', 'sand', 'water', 'fire', 'chunks', 'empty']);
export const HZ = 60;

/** All layout coordinates are authored in the same 320×180 world. */
function tools(sim) {
  const sx = sim.width / 320, sy = sim.height / 180;
  return {
    rect(x, y, w, h, m) { sim.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.max(1, Math.round(w * sx)), Math.max(1, Math.round(h * sy)), m); },
    dot(x, y, m) { sim.set(Math.floor(x * sx), Math.floor(y * sy), m); },
    mound(cx, bottom, radius, material) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const height = Math.max(0, Math.floor((radius - Math.abs(x - cx)) * .68));
        this.rect(x, bottom - height, 1, height + 1, material);
      }
    },
  };
}

function cave(sim, { plain = false } = {}) {
  const t = tools(sim);
  // Jagged silhouettes are fixed at construction, never jittered by the renderer.
  for (let x = 0; x < 320; x++) {
    const ceiling = plain ? 10 : 10 + Math.floor(5 * Math.sin(x * .047)) + noise(sim.seed, x) % 4;
    const floor = plain ? 169 : 166 + Math.floor(4 * Math.sin(x * .071)) + noise(sim.seed, x, 9) % 3;
    t.rect(x, 0, 1, Math.max(4, ceiling), MAT.ROCK);
    t.rect(x, floor, 1, 180 - floor, MAT.ROCK);
  }
  t.rect(0, 0, 7, 180, MAT.ROCK); t.rect(313, 0, 7, 180, MAT.ROCK);
  if (!plain) {
    // A few stalactites and shelves provide readable silhouettes at 1× resolution.
    for (const [cx, length, radius] of [[41, 16, 7], [112, 12, 8], [181, 21, 9], [299, 14, 6]]) {
      for (let dx = -radius; dx <= radius; dx++) t.rect(cx + dx, 10, 1, Math.max(1, length - Math.abs(dx) * 2), MAT.ROCK);
    }
    t.rect(7, 69, 34, 7, MAT.ROCK); t.rect(278, 94, 35, 7, MAT.ROCK);
  }
  return t;
}

function hero(sim) {
  const t = cave(sim);
  // The left pool, sand shelf, and central pillar read as separate material systems.
  t.rect(13, 146, 126, 19, MAT.WATER);
  t.rect(13, 165, 129, 7, MAT.ROCK);
  t.rect(133, 127, 13, 43, MAT.ROCK);
  t.rect(17, 123, 65, 6, MAT.ROCK);
  t.mound(48, 122, 27, MAT.SAND);
  t.rect(57, 28, 12, 31, MAT.SAND);
  t.rect(51, 57, 7, 5, MAT.ROCK); t.rect(69, 57, 8, 5, MAT.ROCK);
  t.rect(112, 88, 50, 7, MAT.ROCK);
  t.mound(136, 87, 14, MAT.SAND);
  t.rect(154, 129, 14, 40, MAT.ROCK);
  // Oil above a stone basin, connected to a long wooden bridge by flammable posts.
  t.rect(174, 124, 126, 39, MAT.OIL);
  t.rect(169, 116, 5, 52, MAT.ROCK); t.rect(300, 117, 7, 51, MAT.ROCK);
  t.rect(169, 163, 138, 7, MAT.ROCK);
  t.rect(176, 109, 111, 4, MAT.WOOD);
  t.rect(202, 113, 4, 34, MAT.WOOD); t.rect(272, 113, 4, 34, MAT.WOOD);
  // A high water cistern opens once, giving an actual water/fire interaction.
  t.rect(241, 41, 3, 36, MAT.ROCK); t.rect(286, 41, 3, 36, MAT.ROCK);
  t.rect(241, 74, 48, 3, MAT.ROCK); t.rect(244, 49, 42, 25, MAT.WATER);
}

function sand(sim) {
  const t = cave(sim, { plain: true });
  t.rect(17, 154, 130, 15, MAT.ROCK);
  t.mound(83, 153, 30, MAT.SAND);
  t.rect(52, 29, 23, 38, MAT.SAND);
  t.rect(44, 66, 12, 5, MAT.ROCK); t.rect(71, 66, 13, 5, MAT.ROCK);
  t.mound(237, 163, 22, MAT.SAND);
  t.rect(162, 122, 6, 47, MAT.ROCK); t.rect(294, 122, 6, 47, MAT.ROCK);
  t.rect(162, 164, 138, 6, MAT.ROCK);
  t.rect(199, 77, 23, 30, MAT.SAND);
  t.rect(148, 151, 8, 18, MAT.ROCK);
}

function water(sim) {
  const t = cave(sim, { plain: true });
  // Left: a narrow jet spreads horizontally across a broad, flat basin.
  t.rect(22, 81, 5, 84, MAT.ROCK); t.rect(145, 112, 5, 53, MAT.ROCK);
  t.rect(22, 161, 128, 7, MAT.ROCK);
  t.rect(58, 31, 22, 40, MAT.WATER);
  t.rect(51, 69, 11, 5, MAT.ROCK); t.rect(76, 69, 12, 5, MAT.ROCK);
  t.rect(28, 146, 116, 15, MAT.WATER);
  // Right: inverted layers visibly exchange; gold oil ends up above blue water.
  t.rect(170, 71, 5, 95, MAT.ROCK); t.rect(295, 71, 5, 95, MAT.ROCK);
  t.rect(170, 162, 130, 6, MAT.ROCK);
  t.rect(175, 122, 120, 40, MAT.OIL);
  t.rect(175, 93, 120, 29, MAT.WATER);
  t.rect(230, 46, 14, 15, MAT.SAND);
}

function fire(sim) {
  const t = cave(sim);
  // A low bridge, dry oil, and a delayed falling water curtain.
  t.rect(26, 155, 268, 12, MAT.ROCK);
  t.rect(33, 125, 254, 30, MAT.OIL);
  t.rect(28, 119, 5, 38, MAT.ROCK); t.rect(287, 119, 5, 38, MAT.ROCK);
  t.rect(40, 112, 239, 4, MAT.WOOD);
  for (const x of [60, 110, 164, 214, 267]) t.rect(x, 116, 4, 35, MAT.WOOD);
  t.rect(53, 112, 5, 4, MAT.FIRE);
  t.rect(182, 25, 4, 47, MAT.ROCK); t.rect(242, 25, 4, 47, MAT.ROCK);
  t.rect(182, 69, 64, 4, MAT.ROCK); t.rect(186, 34, 56, 35, MAT.WATER);
}

function chunks(sim) {
  const t = cave(sim);
  t.rect(13, 139, 294, 29, MAT.ROCK);
  t.rect(99, 65, 70, 7, MAT.ROCK); t.mound(133, 64, 21, MAT.SAND);
  t.rect(188, 102, 107, 5, MAT.ROCK);
  t.rect(222, 107, 6, 32, MAT.ROCK);
  t.rect(235, 129, 60, 10, MAT.WATER);
  t.mound(67, 138, 28, MAT.SAND);
  t.rect(69, 35, 5, 11, MAT.SAND);
  t.rect(251, 70, 4, 10, MAT.WATER);
}

const BUILDERS = { hero, sand, water, fire, chunks, empty() {} };

function eventFor(name, tick, sim) {
  const t = tools(sim);
  if (name === 'hero') {
    if (tick === 36) t.rect(202, 109, 4, 4, MAT.FIRE);
    if (tick === 240) t.rect(252, 74, 12, 3, MAT.EMPTY);
  }
  if (name === 'sand' && tick <= 720 && tick % 15 === 0) {
    t.rect(60, 28, 4, 3, MAT.SAND);
    t.rect(208, 77, 3, 3, MAT.SAND);
  }
  if (name === 'fire' && tick === 210) t.rect(202, 69, 20, 4, MAT.EMPTY);
  if (name === 'chunks' && tick <= 900) {
    if (tick % 36 === 0) t.rect(70, 36, 3, 4, MAT.SAND);
    if (tick % 54 === 0) t.rect(251, 70, 3, 4, MAT.WATER);
  }
}

/**
 * 60 Hz deterministic timeline. Forward calls preserve edits to demo.sim.
 * Seeking backwards rebuilds the same initial world and replays scheduled events.
 * `events:false` disables all scheduled edits (the hero starts without fire).
 */
export function createDemo(name, options = {}) {
  if (!Object.hasOwn(BUILDERS, name)) throw new RangeError(`Unknown demo: ${name}`);
  const sim = new Sandbox(options.width ?? 320, options.height ?? 180, options);
  const events = options.events !== false;
  const demo = {
    sim,
    reset() {
      sim.reset();
      BUILDERS[name](sim);
      return sim;
    },
    advanceTo(seconds) {
      if (!Number.isFinite(seconds)) throw new RangeError('Demo time must be finite');
      const target = Math.max(0, Math.floor(seconds * HZ + 1e-7));
      if (target < sim.tick) demo.reset();
      while (sim.tick < target) {
        if (events) eventFor(name, sim.tick + 1, sim);
        sim.step();
      }
      return sim;
    },
  };
  demo.reset();
  return demo;
}
