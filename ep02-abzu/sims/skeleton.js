// The "skeleton we don't need": 60 joints on a fish, placed in model space and deformed on the CPU with
// exactly the same four motions as the vertex shader, so the dots sit on the swimming mesh.
import * as THREE from 'three';
import { SHAPES } from './fishmesh.js';

export function joints(kind) {
  const S = SHAPES[kind], J = [], B = [];
  const add = (p, parent) => { J.push(p); if (parent != null) B.push([parent, J.length - 1]); return J.length - 1; };
  let prev = null;
  const spine = [];
  for (let i = 0; i < 24; i++) { const z = 0.98 - i * (1.58 / 23); prev = add([0, 0, z], prev); spine.push(prev); }
  // caudal fin rays
  for (const sgn of [1, -1]) { let p = spine[23]; for (let k = 1; k <= 6; k++) p = add([0, sgn * S.tail * k / 6, -0.6 - 0.4 * k / 6], p); }
  // dorsal fin
  { let p = spine[11]; for (let k = 1; k <= 8; k++) p = add([0, S.h * 0.8 + S.dorsal * k / 8, -0.05 - 0.15 * k / 8], p); }
  // pectoral fins
  for (const sx of [-1, 1]) { let p = spine[5]; for (let k = 1; k <= 5; k++) p = add([sx * (S.w + 0.22 * k / 5), -S.h * 0.3 - 0.2 * k / 5, 0.4 - 0.2 * k / 5], p); }
  // jaw
  { let p = spine[0]; for (let k = 1; k <= 2; k++) p = add([0, -S.h * 0.15 * k, 0.95 - 0.08 * k], p); }
  return { J, B };
}

// JS twin of the //#region swim block in fish.js
export function swim(p, sp, ph, comp = [1, 1, 1, 1], useMask = 1) {
  let [x, y, z] = p;
  const body = Math.min(1, Math.max(0, (z + 1) * 0.5));
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mask = useMask ? sm(sp.maskB, sp.maskW, 1 - body) : 1;
  x += Math.cos(ph) * sp.side * comp[0];
  let a = Math.cos(ph) * 0.1 * sp.pivot * comp[1], c = Math.cos(a), s = Math.sin(a);
  [x, z] = [c * x - s * z, s * x + c * z];
  x += Math.cos(ph + body * sp.waveK) * sp.wave * mask * comp[2];
  a = Math.cos(ph + body * sp.waveK) * 0.3 * sp.twist * comp[3]; c = Math.cos(a); s = Math.sin(a);
  const tx = c * x - s * y, ty = s * x + c * y;
  x = x + (tx - x) * mask; y = y + (ty - y) * mask;
  return [x, y, z];
}

export function makeSkeleton(maxFish = 32, nJ = 64) {
  const pts = new THREE.BufferGeometry(), lns = new THREE.BufferGeometry();
  pts.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxFish * nJ * 3), 3));
  lns.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxFish * nJ * 6), 3));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 1 }, uS: { value: 10 } },
    vertexShader: `uniform float uS; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(uS * 6.0 / -mv.z, 2.0, 16.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(vec3(1.0, 0.75, 0.35) * (1.2 - r) * uA, 1.0); }` });
  const lm = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, depthTest: false, blending: THREE.AdditiveBlending });
  const P = new THREE.Points(pts, pm), Ls = new THREE.LineSegments(lns, lm);
  P.frustumCulled = Ls.frustumCulled = false; P.renderOrder = Ls.renderOrder = 6;
  const g = new THREE.Group(); g.add(Ls, P);
  const cache = {};
  // fish: [{kind, sp, P:Vector3, V:Vector3, ph, size}]
  g.set = (fish, alpha = 1) => {
    const pa = pts.attributes.position.array, la = lns.attributes.position.array;
    let np = 0, nl = 0;
    for (const f of fish) {
      const sk = cache[f.kind] || (cache[f.kind] = joints(f.kind));
      const fw = f.V.clone().normalize(), lf = new THREE.Vector3(0, 1, 0).cross(fw).normalize(), up = fw.clone().cross(lf);
      const W = sk.J.map(j => { const [x, y, z] = swim(j, f.sp, f.ph); return f.P.clone().addScaledVector(lf, x * f.size).addScaledVector(up, y * f.size).addScaledVector(fw, z * f.size); });
      for (const w of W) { pa.set([w.x, w.y, w.z], np * 3); np++; }
      for (const [a, b] of sk.B) { la.set([W[a].x, W[a].y, W[a].z, W[b].x, W[b].y, W[b].z], nl * 6); nl++; }
    }
    pts.setDrawRange(0, np); lns.setDrawRange(0, nl * 2);
    pts.attributes.position.needsUpdate = lns.attributes.position.needsUpdate = true;
    pm.uniforms.uA.value = alpha; lm.opacity = alpha * 0.7;
    g.visible = alpha > 0.001 && np > 0;
    return np;
  };
  return g;
}
