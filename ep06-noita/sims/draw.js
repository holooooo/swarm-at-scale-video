import { MAT, MATERIALS, noise } from './sandbox.js';

const surfaces = new WeakMap();
const BASE = MATERIALS.map(m => m.color.match(/[a-f\d]{2}/gi).map(hex => parseInt(hex, 16)));
const clamp = n => Math.max(0, Math.min(255, n | 0));

function surfaceFor(ctx, sim) {
  let entry = surfaces.get(sim);
  if (entry && entry.width === sim.width && entry.height === sim.height) return entry;
  // No browser globals are accessed until rendering. Node can import all modules.
  let canvas;
  if (typeof globalThis.OffscreenCanvas === 'function') canvas = new globalThis.OffscreenCanvas(sim.width, sim.height);
  else canvas = (ctx.canvas?.ownerDocument ?? globalThis.document)?.createElement('canvas');
  if (!canvas) return null;
  canvas.width = sim.width; canvas.height = sim.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  entry = { canvas, context, image: context.createImageData(sim.width, sim.height), width: sim.width, height: sim.height };
  surfaces.set(sim, entry);
  return entry;
}

function pixelColor(sim, i, x, y) {
  const material = sim.cells[i], base = BASE[material];
  const n = noise(sim.seed, x, y), grain = (n % 17) - 8;
  let r = base[0], g = base[1], b = base[2];
  if (material === MAT.EMPTY) { r = 13; g = 20; b = 30; }
  if (material === MAT.ROCK) {
    const seam = (x + Math.floor(y / 5) * 7) % 23 === 0 || y % 13 === 0;
    const face = y > 0 && sim.cells[i - sim.width] !== MAT.ROCK;
    const shade = face ? 21 : seam ? -11 : grain;
    r += shade; g += shade; b += shade;
  } else if (material === MAT.SAND) { r += grain * 2; g += grain; b += grain; }
  else if (material === MAT.WATER) {
    const top = y > 0 && sim.cells[i - sim.width] !== MAT.WATER;
    r += top ? 48 : grain / 2; g += top ? 53 : grain; b += top ? 38 : grain;
  } else if (material === MAT.OIL) {
    const top = y > 0 && sim.cells[i - sim.width] !== MAT.OIL;
    r += top ? 32 : grain; g += top ? 29 : grain; b += top ? 10 : grain / 2;
  } else if (material === MAT.WOOD) {
    const band = y % 4 === 0 ? -18 : 8;
    r += band + grain; g += band + grain / 2; b += grain / 2;
  } else if (material === MAT.FIRE) {
    const flicker = noise(sim.seed, x, y, sim.tick >> 1) % 4;
    [r, g, b] = [[255, 105, 36], [255, 151, 50], [255, 198, 88], [255, 224, 135]][flicker];
  } else if (material === MAT.SMOKE) {
    const age = Math.min(1, sim.life[i] / 95);
    r = 25 + age * (57 + grain); g = 31 + age * (56 + grain); b = 41 + age * (58 + grain);
  }
  return [clamp(r), clamp(g), clamp(b)];
}

function fireGlow(ctx, sim, x, y, sx, sy) {
  if (typeof ctx.createRadialGradient !== 'function') return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  // One subdued halo per occupied tile; not one expensive gradient per fire pixel.
  for (let by = 0; by < sim.height; by += 8) for (let bx = 0; bx < sim.width; bx += 8) {
    let count = 0, sumX = 0, sumY = 0;
    for (let py = by; py < Math.min(by + 8, sim.height); py++) for (let px = bx; px < Math.min(bx + 8, sim.width); px++) {
      if (sim.cells[py * sim.width + px] === MAT.FIRE) { count++; sumX += px; sumY += py; }
    }
    if (!count) continue;
    const cx = x + (sumX / count + .5) * sx, cy = y + (sumY / count + .5) * sy;
    const radius = Math.max(sx, sy) * (7 + Math.min(7, count / 5));
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgba(255,117,30,${Math.min(.2, .07 + count * .003)})`);
    gradient.addColorStop(1, 'rgba(255,89,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

function drawChunkGrid(ctx, sim, x, y, sx, sy) {
  const size = sim.chunkSize;
  const active = sim.lastActiveChunks ?? sim.activeChunks;
  ctx.save();
  ctx.lineWidth = 1;
  for (let cy = 0; cy < sim.chunksY; cy++) for (let cx = 0; cx < sim.chunksX; cx++) {
    const awake = active[cy * sim.chunksX + cx];
    ctx.strokeStyle = awake ? 'rgba(244,192,92,.86)' : 'rgba(140,164,188,.12)';
    if (awake) {
      ctx.fillStyle = 'rgba(236,176,71,.045)';
      ctx.fillRect(x + cx * size * sx, y + cy * size * sy, Math.min(size, sim.width - cx * size) * sx, Math.min(size, sim.height - cy * size) * sy);
    }
    ctx.strokeRect(x + cx * size * sx + .5, y + cy * size * sy + .5,
      Math.min(size, sim.width - cx * size) * sx - 1, Math.min(size, sim.height - cy * size) * sy - 1);
  }
  ctx.restore();
}

/** Nearest-neighbor pixels; the caller may clip and use negative offsets for close-ups. */
export function drawPixels(ctx, sim, x, y, w, h, { debug = false, grid = false, glow = true } = {}) {
  if (!ctx || w <= 0 || h <= 0) return;
  const sx = w / sim.width, sy = h / sim.height;
  const surface = surfaceFor(ctx, sim);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (surface) {
    const data = surface.image.data;
    for (let py = 0; py < sim.height; py++) for (let px = 0; px < sim.width; px++) {
      const i = py * sim.width + px, color = pixelColor(sim, i, px, py), p = i * 4;
      data[p] = color[0]; data[p + 1] = color[1]; data[p + 2] = color[2]; data[p + 3] = 255;
    }
    surface.context.putImageData(surface.image, 0, 0);
    ctx.drawImage(surface.canvas, x, y, w, h);
  } else {
    // Small non-DOM canvas implementations can render without an offscreen constructor.
    for (let py = 0; py < sim.height; py++) for (let px = 0; px < sim.width; px++) {
      const color = pixelColor(sim, py * sim.width + px, px, py);
      ctx.fillStyle = `rgb(${color.join(',')})`;
      ctx.fillRect(x + px * sx, y + py * sy, sx + .01, sy + .01);
    }
  }
  if (glow) fireGlow(ctx, sim, x, y, sx, sy);
  if (debug) drawChunkGrid(ctx, sim, x, y, sx, sy);
  if (grid && Math.min(sx, sy) >= 3) {
    ctx.beginPath(); ctx.lineWidth = .6; ctx.strokeStyle = 'rgba(9,15,24,.22)';
    for (let px = 0; px <= sim.width; px++) { ctx.moveTo(x + px * sx, y); ctx.lineTo(x + px * sx, y + h); }
    for (let py = 0; py <= sim.height; py++) { ctx.moveTo(x, y + py * sy); ctx.lineTo(x + w, y + py * sy); }
    ctx.stroke();
  }
  ctx.restore();
}
