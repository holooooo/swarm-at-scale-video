export const MAT = Object.freeze({ EMPTY: 0, ROCK: 1, SAND: 2, WATER: 3, OIL: 4, FIRE: 5, SMOKE: 6, WOOD: 7 });

export const MATERIALS = Object.freeze([
  { name: 'empty', zh: '空气', color: '#101722' },
  { name: 'rock', zh: '岩石', color: '#343b49' },
  { name: 'sand', zh: '沙子', color: '#dfb45a' },
  { name: 'water', zh: '水', color: '#428fb5' },
  { name: 'oil', zh: '油', color: '#a88d39' },
  { name: 'fire', zh: '火', color: '#ff913e' },
  { name: 'smoke', zh: '烟', color: '#777a85' },
  { name: 'wood', zh: '木头', color: '#91604a' },
].map(Object.freeze));

/** Stateless, integer-only noise: sleeping regions never consume a random stream. */
export function noise(seed, x, y = 0, tick = 0) {
  let n = Math.imul((x | 0) ^ seed, 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d) ^ Math.imul(tick | 0, 0x165667b1);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

const DENSITY = [0, 100, 4, 3, 2, 0, 0, 100];
const FLAMMABLE = new Set([MAT.OIL, MAT.WOOD]);

/** A small educational falling-sand model, inspired by Noita's material interactions. */
export class Sandbox {
  constructor(width = 320, height = 180, { seed = 6, optimized = true } = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new RangeError('Sandbox dimensions must be integers >= 2');
    this.width = width;
    this.height = height;
    this.seed = seed | 0;
    this.optimized = Boolean(optimized);
    this.cells = new Uint8Array(width * height);
    this.life = new Uint16Array(this.cells.length);
    this.chunkSize = 16;
    this.chunksX = Math.ceil(width / this.chunkSize);
    this.chunksY = Math.ceil(height / this.chunkSize);
    this.totalChunks = this.chunksX * this.chunksY;
    this.activeChunks = new Uint8Array(this.totalChunks);
    this.lastActiveChunks = new Uint8Array(this.totalChunks);
    this._nextActive = new Uint8Array(this.totalChunks);
    this._stamp = new Uint32Array(this.cells.length);
    this.reset();
  }

  reset() {
    this.cells.fill(MAT.EMPTY);
    this.life.fill(0);
    this._stamp.fill(0);
    this.activeChunks.fill(0);
    this.lastActiveChunks.fill(0);
    this._nextActive.fill(0);
    this.tick = 0;
    this.stats = { visited: 0, activeChunks: 0, totalChunks: this.totalChunks, moved: 0, reactions: 0 };
    this._stepping = false;
    return this;
  }

  get(x, y) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? MAT.ROCK : this.cells[(y | 0) * this.width + (x | 0)];
  }

  set(x, y, material) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    if (!Number.isInteger(material) || material < 0 || material >= MATERIALS.length) throw new RangeError('Unknown material');
    const i = y * this.width + x;
    if (this.cells[i] === material) return false;
    this.cells[i] = material;
    this.life[i] = this._initialLife(material, x, y);
    this._wake(x, y);
    return true;
  }

  paint(x, y, radius, material, { replace = false } = {}) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) return this;
    const left = Math.max(0, Math.floor(x - radius)), right = Math.min(this.width - 1, Math.ceil(x + radius));
    const top = Math.max(0, Math.floor(y - radius)), bottom = Math.min(this.height - 1, Math.ceil(y + radius));
    for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
      if ((px - x) ** 2 + (py - y) ** 2 > radius ** 2) continue;
      if (replace || material === MAT.EMPTY || this.get(px, py) === MAT.EMPTY) this.set(px, py, material);
    }
    return this;
  }

  fillRect(x, y, w, h, material) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w)), y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.set(px, py, material);
    return this;
  }

  count(material) {
    let count = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === material) count++;
    return count;
  }

  /** Includes transient ages and tick, so equal hashes describe equal simulation state. */
  hash() {
    let h = 2166136261;
    for (let i = 0; i < this.cells.length; i++) {
      h = Math.imul(h ^ this.cells[i], 16777619);
      h = Math.imul(h ^ this.life[i], 16777619);
    }
    h = Math.imul(h ^ this.tick, 16777619);
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  //#region active-chunks
  _wake(x, y) {
    const mask = this._stepping ? this._nextActive : this.activeChunks;
    const size = this.chunkSize;
    const x0 = Math.max(0, Math.floor((x - 1) / size));
    const x1 = Math.min(this.chunksX - 1, Math.floor((x + 1) / size));
    const y0 = Math.max(0, Math.floor((y - 1) / size));
    const y1 = Math.min(this.chunksY - 1, Math.floor((y + 1) / size));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        mask[cy * this.chunksX + cx] = 1;
      }
    }
  }
  //#endregion

  _initialLife(material, x, y) {
    const n = noise(this.seed, x, y, this.tick);
    return material === MAT.FIRE ? 45 + n % 35 : material === MAT.SMOKE ? 95 + n % 75 : 0;
  }

  _change(i, material) {
    const x = i % this.width, y = Math.floor(i / this.width);
    this.cells[i] = material;
    this.life[i] = this._initialLife(material, x, y);
    this._stamp[i] = this.tick;
    this.stats.reactions++;
    this._wake(x, y);
  }

  //#region density
  _trySwap(i, x, y, material) {
    if (x < 0 || x >= this.width ||
        y < 0 || y >= this.height) return false;
    const j = y * this.width + x;
    const target = this.cells[j];
    if (this._stamp[j] === this.tick) return false;
    if (DENSITY[material] <= DENSITY[target]) return false;
    [this.cells[i], this.cells[j]] = [target, material];
    [this.life[i], this.life[j]] = [this.life[j], this.life[i]];
    this._stamp[i] = this._stamp[j] = this.tick;
    this.stats.moved++;
    this._wake(i % this.width, Math.floor(i / this.width));
    this._wake(x, y);
    return true;
  }
  //#endregion

  _rise(i, x, y) {
    if (y < 0 || x < 0 || x >= this.width) return false;
    const j = y * this.width + x;
    if (this.cells[j] !== MAT.EMPTY || this._stamp[j] === this.tick) return false;
    this.cells[j] = this.cells[i]; this.life[j] = this.life[i];
    this.cells[i] = MAT.EMPTY; this.life[i] = 0;
    this._stamp[i] = this._stamp[j] = this.tick;
    this.stats.moved++;
    this._wake(x, y); this._wake(i % this.width, Math.floor(i / this.width));
    return true;
  }

  _neighbors(x, y, visit) {
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) visit(ny * this.width + nx, nx, ny);
    }
  }

  _burn(i, x, y) {
    //#region combustion
    let wet = false;
    this._neighbors(x, y, j => {
      wet ||= this.cells[j] === MAT.WATER;
    });
    if (wet) { this._change(i, MAT.SMOKE); return; }
    this._neighbors(x, y, (j, nx, ny) => {
      const fuel = this.cells[j];
      const chance = fuel === MAT.OIL ? 3 : 8;
      const spark = noise(this.seed, nx, ny, this.tick) % chance === 0;
      if (FLAMMABLE.has(fuel) && spark) {
        this._change(j, MAT.FIRE);
      }
    });
    //#endregion
    if (--this.life[i] <= 0) { this._change(i, MAT.SMOKE); return; }
    this._wake(x, y);
    const drift = noise(this.seed, x, y, this.tick) & 1 ? 1 : -1;
    if (this.life[i] < 20 && this.tick % 3 === 0) this._rise(i, x, y - 1) || this._rise(i, x + drift, y - 1);
  }

  _update(i, x, y) {
    const material = this.cells[i];
    if (material === MAT.EMPTY || material === MAT.ROCK || material === MAT.WOOD || this._stamp[i] === this.tick) return;
    const direction = noise(this.seed, x, y, this.tick) & 1 ? 1 : -1;
    if (material === MAT.FIRE) { this._burn(i, x, y); return; }
    if (material === MAT.SMOKE) {
      if (--this.life[i] <= 0) { this._change(i, MAT.EMPTY); return; }
      this._wake(x, y);
      if ((this.tick + i) % 2 === 0) this._rise(i, x, y - 1) || this._rise(i, x + direction, y - 1) || this._rise(i, x - direction, y - 1);
      return;
    }
    if (material === MAT.WATER) {
      // Check water as well as fire so a falling water pixel extinguishes on contact.
      this._neighbors(x, y, j => { if (this.cells[j] === MAT.FIRE) this._change(j, MAT.SMOKE); });
    }
    //#region falling
    if (this._trySwap(i, x, y + 1, material)) return;
    if (this._trySwap(i, x + direction, y + 1, material)) return;
    if (this._trySwap(i, x - direction, y + 1, material)) return;
    if (material === MAT.SAND) return;
    //#endregion
    //#region flow
    // Horizontal flow enters air/gas; density swaps happen vertically.
    for (const dx of [direction, -direction]) {
      const target = this.get(x + dx, y);
      if (target !== MAT.EMPTY && target !== MAT.SMOKE) continue;
      if (this._trySwap(i, x + dx, y, material)) return;
    }
    //#endregion
  }

  step() {
    this.tick++;
    if (this.tick >= 0xffffffff) { this.tick = 1; this._stamp.fill(0); }
    const mask = this.activeChunks;
    this.lastActiveChunks.set(mask);
    this._nextActive.fill(0);
    this.stats.visited = this.stats.moved = this.stats.reactions = 0;
    this.stats.activeChunks = this.optimized ? mask.reduce((sum, v) => sum + v, 0) : this.totalChunks;
    if (!this.optimized) this.lastActiveChunks.fill(1);
    this._stepping = true;
    // Bottom-to-top; alternate the horizontal order without consuming mutable RNG state.
    const reverse = (this.tick & 1) === 0;
    for (let cy = this.chunksY - 1; cy >= 0; cy--) {
      // Enumerate active spans once per chunk-row: dormant world pixels are never scanned.
      const spans = [];
      for (let k = 0; k < this.chunksX; k++) {
        const cx = reverse ? this.chunksX - 1 - k : k;
        if (!this.optimized || mask[cy * this.chunksX + cx]) spans.push(cx);
      }
      if (!spans.length) continue;
      const bottom = Math.min(this.height, (cy + 1) * this.chunkSize) - 1;
      for (let y = bottom; y >= cy * this.chunkSize; y--) for (const cx of spans) {
        const left = cx * this.chunkSize, right = Math.min(this.width, left + this.chunkSize);
        for (let k = left; k < right; k++) {
          const x = reverse ? right - 1 - (k - left) : k;
          this.stats.visited++;
          this._update(y * this.width + x, x, y);
        }
      }
    }
    this._stepping = false;
    this.activeChunks.set(this._nextActive);
    return this.stats;
  }
}
