// Procedural stylized fish mesh + baked blendshapes (morph targets), all in model space:
// z = spine (tail fin tip -1 … nose +1), x = left/right, y = up.
// Blendshapes are stored as per-vertex offset attributes, like the morph targets ABZÛ authored in Maya:
//   aOpen  jaw open        aLunge  head pushes forward
//   aCurlX bend the body sideways        aCurlY bend it upward
//   aCurlC correction for "sideways + upward at once" (additive bends double-count the tail)
import * as THREE from 'three';

// species shape parameters (unitless, fish length = 2)
export const SHAPES = {
  jack:    { h: 0.42, w: 0.15, hump: 0.45, tail: 0.62, fork: 0.20, dorsal: 0.22, peduncle: 0.05 },
  sardine: { h: 0.22, w: 0.11, hump: 0.50, tail: 0.38, fork: 0.15, dorsal: 0.10, peduncle: 0.04 },
  fusilier:{ h: 0.28, w: 0.11, hump: 0.48, tail: 0.50, fork: 0.24, dorsal: 0.12, peduncle: 0.04 },
  tang:    { h: 0.62, w: 0.10, hump: 0.42, tail: 0.42, fork: 0.04, dorsal: 0.18, peduncle: 0.07 },
  sergeant:{ h: 0.55, w: 0.12, hump: 0.42, tail: 0.44, fork: 0.12, dorsal: 0.20, peduncle: 0.07 },
  snapper: { h: 0.40, w: 0.15, hump: 0.40, tail: 0.46, fork: 0.10, dorsal: 0.20, peduncle: 0.06 },
  parrot:  { h: 0.44, w: 0.20, hump: 0.45, tail: 0.40, fork: 0.03, dorsal: 0.14, peduncle: 0.08 },
  shark:   { h: 0.20, w: 0.17, hump: 0.55, tail: 0.55, fork: 0.10, dorsal: 0.34, peduncle: 0.035, shark: true },
};

const Z0 = -0.62;           // body ends (peduncle) here; caudal fin goes to -1
const RINGS = 26, SEG = 14;

function profile(u, S) {
  // u: 0 peduncle … 1 nose; smooth teardrop with its widest point at S.hump
  const a = u < S.hump ? Math.pow(u / S.hump, 0.75) : Math.pow(1 - (u - S.hump) / (1 - S.hump), 0.55);
  return Math.max(S.peduncle, Math.sin(a * Math.PI / 2));
}

export function makeFishGeometry(kind = 'jack') {
  const S = SHAPES[kind];
  const P = [], C = [];            // positions, part codes (0 body, 1 fin, 2 tail fin)
  const tris = [];
  const ring = [];
  for (let r = 0; r <= RINGS; r++) {
    const u = r / RINGS, z = Z0 + u * (1 - Z0);
    const pr = r === RINGS ? 0 : profile(u, S);
    const hu = S.h * pr, wu = S.w * pr;
    // sharks: flatter belly, pointed snout
    const row = [];
    for (let k = 0; k < SEG; k++) {
      const a = k / SEG * Math.PI * 2;
      let y = Math.cos(a) * hu, x = Math.sin(a) * wu;
      if (S.shark && y < 0) y *= 0.72;
      row.push(P.length / 3); P.push(x, y + (S.shark ? 0 : hu * 0.08 * (1 - u)), z); C.push(0);
    }
    ring.push(row);
  }
  for (let r = 0; r < RINGS; r++) for (let k = 0; k < SEG; k++) {
    const a = ring[r][k], b = ring[r][(k + 1) % SEG], c = ring[r + 1][k], d = ring[r + 1][(k + 1) % SEG];
    tris.push(a, c, b, b, c, d);
  }
  // tail cap
  const cap = P.length / 3; P.push(0, 0, Z0 - 0.01); C.push(0);
  for (let k = 0; k < SEG; k++) tris.push(cap, ring[0][k], ring[0][(k + 1) % SEG]);
  const fin = (pts, code) => { const i0 = P.length / 3; for (const p of pts) { P.push(...p); C.push(code); } for (let i = 1; i + 1 < pts.length; i++) tris.push(i0, i0 + i, i0 + i + 1, i0, i0 + i + 1, i0 + i); };
  // caudal fin (forked), in the y-z plane
  const th = S.tail * (S.shark ? 1.1 : 1);
  fin([[0, 0.04, Z0 + 0.02], [0, th * (S.shark ? 1.15 : 1), -1.0], [0, th * 0.35, -1.0 + S.fork * 0.6], [0, 0, -1.0 + S.fork], [0, -th * 0.35, -1.0 + S.fork * 0.6], [0, -th * (S.shark ? 0.6 : 1), -0.98], [0, -0.04, Z0 + 0.02]], 2);
  // dorsal fin
  const ds = S.shark ? 0.05 : -0.05, dh = S.dorsal;
  fin([[0, S.h * 0.9, ds - 0.12], [0, S.h * 0.9 + dh, ds - 0.20 - (S.shark ? 0.06 : 0)], [0, S.h * 0.95, ds + 0.28]], 1);
  // pectoral fins
  for (const sx of [-1, 1]) fin([[sx * S.w * 0.9, -S.h * 0.25, 0.42], [sx * (S.w + 0.22 + (S.shark ? 0.2 : 0)), -S.h * 0.55 - (S.shark ? 0.08 : 0), 0.18], [sx * S.w * 0.9, -S.h * 0.35, 0.28]], 1);
  // anal / pelvic fin
  fin([[0, -S.h * 0.8, -0.25], [0, -S.h * 0.8 - dh * 0.45, -0.35], [0, -S.h * 0.75, -0.05]], 1);

  const n = P.length / 3, pos = new Float32Array(P);
  // ---- blendshapes ----
  const open = new Float32Array(n * 3), lunge = new Float32Array(n * 3);
  const cx = new Float32Array(n * 3), cy = new Float32Array(n * 3), cc = new Float32Array(n * 3);
  const hingeZ = 0.78;
  const bend = (x, y, z, dir, k) => {
    // wrap the spine behind the pivot onto a circular arc (curvature k) toward the 2D direction dir;
    // each cross-section turns with the spine (its component along dir rotates in the bend plane)
    const zp = 0.55;
    if (z >= zp) return [x, y, z];
    const R = 1 / k, a = (zp - z) / R;
    const along = x * dir[0] + y * dir[1], px = x - along * dir[0], py = y - along * dir[1];
    const lat = R * (1 - Math.cos(a)) + along * Math.cos(a);
    return [px + dir[0] * lat, py + dir[1] * lat, zp - R * Math.sin(a) + along * Math.sin(a)];
  };
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (z > hingeZ - 0.1 && C[i] === 0) {
      const t = Math.min(1, (z - (hingeZ - 0.1)) / 0.32);
      if (y < S.h * 0.05) { const ang = 0.8 * t; open[i * 3 + 1] = -(z - hingeZ + 0.1) * Math.sin(ang) - Math.abs(y) * 0.15 * t; open[i * 3 + 2] = -(z - hingeZ + 0.1) * (1 - Math.cos(ang)); }
      else open[i * 3 + 1] = 0.03 * t;
    }
    if (z > 0.35) { const t = Math.min(1, (z - 0.35) / 0.5); lunge[i * 3 + 2] = 0.16 * t; lunge[i * 3 + 1] = 0.02 * t; }
    const K = 1.15;                                      // curvature of the authored curl poses
    const bx = bend(x, y, z, [1, 0], K), by = bend(x, y, z, [0, 1], K);
    const d = Math.SQRT1_2, bd = bend(x, y, z, [d, d], K * Math.SQRT2);   // the true curl for weights (1, 1)
    for (let q = 0; q < 3; q++) {
      const b = [x, y, z][q];
      cx[i * 3 + q] = bx[q] - b; cy[i * 3 + q] = by[q] - b;
      // what "sideways + upward" should look like, minus what adding the two shapes gives
      cc[i * 3 + q] = (bd[q] - b) - (cx[i * 3 + q] + cy[i * 3 + q]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(C), 1));
  g.setAttribute('aOpen', new THREE.BufferAttribute(open, 3));
  g.setAttribute('aLunge', new THREE.BufferAttribute(lunge, 3));
  g.setAttribute('aCurlX', new THREE.BufferAttribute(cx, 3));
  g.setAttribute('aCurlY', new THREE.BufferAttribute(cy, 3));
  g.setAttribute('aCurlC', new THREE.BufferAttribute(cc, 3));
  g.setIndex(tris);
  g.computeVertexNormals();
  g.userData = { kind, verts: n, tris: tris.length / 3 };
  return g;
}
