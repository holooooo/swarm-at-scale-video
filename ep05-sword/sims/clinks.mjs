// Clash log -> sound cues for the mix: node ep05-sword/sims/clinks.mjs  ->  build/ep05-sword/clinks.json
// [[t, kind, count], ...] in 0.1 s buckets (kind 0 sword on sword, 1 her shield, 2 his barrier).
import { Swords } from './swords.js';
import { T } from './schedule.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const S = new Swords(T); S.advanceTo(170 * 60);
const B = new Map();
for (let k = 0; k < S.evN; k++) { const t = S.ev[k * 5], kind = S.ev[k * 5 + 4], key = Math.floor(t * 10) * 3 + kind; B.set(key, (B.get(key) || 0) + 1); }
const out = [...B].map(([key, n]) => [Math.floor(key / 3) / 10, key % 3, n]).sort((a, b) => a[0] - b[0]);
const dir = new URL('../../build/ep05-sword/', import.meta.url); mkdirSync(dir, { recursive: true });
writeFileSync(new URL('clinks.json', dir), JSON.stringify({ cues: out, boom: [T.break], whoosh: [T.climax] }));
console.log('events', S.evN, 'buckets', out.length);
