// GPU boids with three.js. Each bird is one texel of a float texture (position / velocity).
// Neighbors are not searched one by one: every step all birds are splatted (additively) into
// a 3D grid atlas that stores per cell: count, centroid offset, summed velocity. Each bird then
// reads the 3x3x3 cells around it, so the three rules become samples of a field.
// Deterministic: seeded init + fixed 60 Hz steps; any step can be reached by re-simulating.
import * as THREE from 'three';
import { rng, DT } from './boids2d.js';

const FS_HEAD = /* glsl */`precision highp float; precision highp int; precision highp sampler2D;`;
const QUAD_VS = /* glsl */`in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SPLAT_VS = /* glsl */`${FS_HEAD}
uniform sampler2D tPos, tVel; uniform int T, G, TX; uniform vec3 gOrigin; uniform float cell; uniform vec2 atlas; uniform int which;
in vec3 position; out vec4 vData;
//#region splat
void main() {
  ivec2 uv = ivec2(gl_VertexID % T, gl_VertexID / T);       // this bird's texel
  vec3 g = (texelFetch(tPos, uv, 0).xyz - gOrigin) / cell;  // position in grid units
  ivec3 c = ivec3(floor(g));
  vec2 px = vec2(c.x + (c.z % TX) * G, c.y + (c.z / TX) * G) + 0.5; // 3D cell -> 2D atlas pixel
  gl_Position = vec4(px / atlas * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  // additive blending sums every bird that lands in the cell
  vData = which == 0 ? vec4(1.0, g - vec3(c) - 0.5)          // count, centroid offset
                     : vec4(texelFetch(tVel, uv, 0).xyz, 0.0); // summed velocity
  //#endregion
  if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(G)))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const SPLAT_FS = `${FS_HEAD} in vec4 vData; out vec4 o; void main() { o = vData; }`;

const VEL_FS = /* glsl */`${FS_HEAD}
uniform sampler2D tPos, tVel, tGA, tGB; uniform int G, TX; uniform vec3 gOrigin; uniform float cell;
uniform vec3 center, radii; uniform vec4 pred; uniform float predS;
uniform float dt, ws, wa, wc, wb, maxS, minS, maxF, flatten, noiseW, stepN, rho0, swirl;
out vec4 o;
ivec2 atlasUV(ivec3 c) { return ivec2(c.x + (c.z % TX) * G, c.y + (c.z / TX) * G); }
vec3 steer(vec3 dir, vec3 v) {
  float l = length(dir); if (l < 1e-5) return vec3(0.0);
  vec3 f = dir / l * maxS - v; float fl = length(f);
  return fl > maxF ? f * (maxF / fl) : f;
}
float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy);
  vec3 p = texelFetch(tPos, uv, 0).xyz, v = texelFetch(tVel, uv, 0).xyz;
  vec3 g = (p - gOrigin) / cell; ivec3 c0 = ivec3(floor(g));
  //#region field
  float n = 0.0; vec3 coh = vec3(0.0), ali = vec3(0.0); vec4 own = vec4(0.0);
  for (int dz = -1; dz <= 1; dz++) for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    ivec3 c = c0 + ivec3(dx, dy, dz);
    if (any(lessThan(c, ivec3(0))) || any(greaterThanEqual(c, ivec3(G)))) continue;
    vec4 A = texelFetch(tGA, atlasUV(c), 0);           // count, centroid offset
    vec3 B = texelFetch(tGB, atlasUV(c), 0).xyz;       // summed velocity
    if (c == c0) { A -= vec4(1.0, g - vec3(c0) - 0.5); B -= v; } // leave myself out
    if (A.x < 0.5) continue;
    vec3 d = vec3(c) + 0.5 + A.yzw / A.x - g;          // to the cell's centroid
    float k = smoothstep(1.8, 0.2, length(d));
    coh += d * A.x * k;  ali += B * k;  n += A.x * k;
    if (c == c0) own = vec4(d, A.x);
  }
  float crowd = n / rho0;                                     // >1 too crowded, <1 too sparse
  vec3 acc = wa * steer(ali, v)                               // alignment
           + wc * steer(coh, v) * clamp(1.0 - crowd, 0.0, 1.0)   // cohesion
           + ws * steer(-coh, v) * clamp(crowd - 1.0, 0.0, 1.5); // separation
  acc += ws * steer(-own.xyz, v) * smoothstep(0.4, 0.0, length(own.xyz)) * clamp(own.w / 6.0, 0.0, 1.0); // no clumping inside a cell
  //#endregion
  vec3 q = (p - center) / radii;
  acc += wb * steer(center - p, v) * smoothstep(0.9, 2.0, length(q));
  vec3 dp = p - pred.xyz; float dd = length(dp);
  if (pred.w > 0.0 && dd < pred.w) acc += steer(dp, v) * predS * pow(1.0 - dd / pred.w, 1.5);
  if (swirl != 0.0) acc += abs(swirl) * steer(cross(vec3(0.0, sign(swirl), 0.0), p - center), v);  // mill around the center (bait ball)
  acc.y -= v.y * flatten;
  vec3 h = vec3(hash(vec3(uv, stepN)), hash(vec3(uv.yx, stepN + 7.1)), hash(vec3(uv, stepN * 1.37 + 3.0))) - 0.5;
  acc += h * noiseW;
  v += acc * dt;
  float s = length(v); v *= clamp(s, minS, maxS) / max(s, 1e-4);
  // yaw rate (rad/s, + = turning left): drives the fish's turning curl
  vec2 a2 = texelFetch(tVel, uv, 0).xz, b2 = v.xz;
  o = vec4(v, atan(a2.x * b2.y - a2.y * b2.x, dot(a2, b2) + 1e-6) / dt);
}`;
const POS_FS = `${FS_HEAD} uniform sampler2D tPos, tVel; uniform float dt, phaseBase, phaseK; out vec4 o;
void main() {
  ivec2 uv = ivec2(gl_FragCoord.xy); vec4 p = texelFetch(tPos, uv, 0); vec3 v = texelFetch(tVel, uv, 0).xyz;
  //#region phase
  // pos.w = swim phase: integrated, so the tail beat speeds up smoothly with swim speed
  float rate = phaseBase + phaseK * length(v);      // faster swimming -> faster tail
  o = vec4(p.xyz + v * dt, mod(p.w + dt * rate, 6283.185));
  //#endregion
}`;
const COPY_FS = `${FS_HEAD} uniform sampler2D tSrc; out vec4 o; void main() { o = texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0); }`;

// ---------------- sky (shared by sky dome and bird fog) ----------------
export const SKY_GLSL = /* glsl */`
uniform vec3 uSun; uniform float uWater, uTime, uNight;
vec3 skyCol(vec3 d) {
  float h = d.y;
  vec3 top = vec3(0.10, 0.17, 0.34), mid = vec3(0.42, 0.50, 0.66), hor = vec3(0.98, 0.69, 0.50);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
  c = mix(c, top, smoothstep(0.16, 0.75, h));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(1.0, 0.55, 0.28) * pow(sd, 6.0) * 0.32 + vec3(1.0, 0.85, 0.6) * pow(sd, 900.0) * 1.4;
  float az = atan(d.z, d.x);
  float hill = 0.012 + 0.016 * sin(az * 3.0 + 1.0) + 0.009 * sin(az * 7.3 + 2.0) + 0.005 * sin(az * 19.0) + 0.003 * sin(az * 53.0);
  c = mix(c, mix(vec3(0.05, 0.05, 0.07), vec3(0.13, 0.10, 0.11), smoothstep(-0.25, hill, h)), step(h, hill));
  // night (bats)
  vec3 nc = mix(vec3(0.05, 0.06, 0.12), vec3(0.01, 0.015, 0.04), smoothstep(-0.05, 0.6, h));
  c = mix(c, nc, uNight);
  // underwater
  vec3 deep = vec3(0.005, 0.07, 0.12), shallow = vec3(0.07, 0.42, 0.52);
  vec3 w = mix(deep, shallow, smoothstep(-0.5, 0.9, h));
  float rays = pow(max(0.0, sin(az * 9.0 + sin(az * 3.0 + uTime * 0.2) * 2.0)), 8.0) * smoothstep(0.0, 0.9, h) * 0.12;
  w += vec3(0.5, 0.9, 0.9) * rays + vec3(0.6, 0.95, 1.0) * pow(max(h, 0.0), 6.0) * 0.25;
  return mix(c, w, uWater);
}`;

export function makeSky(uniforms) {
  const m = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vD; ${SKY_GLSL} void main(){ gl_FragColor = vec4(skyCol(normalize(vD)), 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 64, 32), m);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}
export function skyUniforms() {
  return { uSun: { value: new THREE.Vector3(-0.6, 0.06, -0.8).normalize() }, uWater: { value: 0 }, uTime: { value: 0 }, uNight: { value: 0 } };
}

// ---------------- birds ----------------
const BIRD_VS = /* glsl */`${FS_HEAD}
uniform mat4 projectionMatrix, viewMatrix;
uniform sampler2D tPos, tVel; uniform int T; uniform float size, time, morph, layout_, pxAngle, pxMin, dim;
uniform vec3 camPos, planeO, planeU, planeV, cCenter, cRadius;
#ifdef PICK
uniform int ids[8];
#endif
in vec3 position; out vec3 vWorld; out vec3 vCol; out float vA;
const vec3 BIRD[12] = vec3[12](
  vec3(0.0, 0.0, 0.55), vec3(-0.12, 0.0, -0.45), vec3(0.12, 0.0, -0.45),
  vec3(0.0, 0.0, 0.15), vec3(-1.0, 0.0, -0.18), vec3(0.0, 0.0, -0.22),
  vec3(0.0, 0.0, 0.15), vec3(0.0, 0.0, -0.22), vec3(1.0, 0.0, -0.18),
  vec3(0.0, 0.0, -0.35), vec3(-0.2, 0.0, -0.72), vec3(0.2, 0.0, -0.72));
const vec3 FISH[12] = vec3[12](
  vec3(0.0, 0.0, 0.85), vec3(0.0, 0.24, 0.05), vec3(0.0, 0.0, -0.6),
  vec3(0.0, 0.0, 0.85), vec3(0.0, 0.0, -0.6), vec3(0.0, -0.19, 0.05),
  vec3(0.0, 0.0, -0.5), vec3(0.0, 0.32, -1.02), vec3(0.0, -0.32, -1.02),
  vec3(0.0, 0.2, 0.12), vec3(0.0, 0.4, -0.16), vec3(0.0, 0.13, -0.32));
const vec3 QUAD[12] = vec3[12](
  vec3(-0.5, -0.5, 0.0), vec3(0.5, -0.5, 0.0), vec3(0.5, 0.5, 0.0),
  vec3(-0.5, -0.5, 0.0), vec3(0.5, 0.5, 0.0), vec3(-0.5, 0.5, 0.0),
  vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
float hash1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float ihash(uint x) { x = x * 747796405u + 2891336453u; x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; x = (x >> 22u) ^ x; return float(x) / 4294967295.0; }
uniform float spread;
void main() {
#ifdef PICK
  int id = ids[gl_InstanceID];
#else
  int id = gl_InstanceID;
#endif
  ivec2 uv = ivec2(id % T, id / T);
  vec3 p = texelFetch(tPos, uv, 0).xyz, v = texelFetch(tVel, uv, 0).xyz;
  uint ui = uint(id) * 3u;
  p += (vec3(ihash(ui), ihash(ui + 1u), ihash(ui + 2u)) - 0.5) * spread;   // personal space below grid resolution
  int k = gl_VertexID % 12;
  float ph = hash1(float(id)) * 6.2832;
  // bird with flapping wings
  vec3 b = BIRD[k];
  if (k == 4 || k == 8) b.y = sin(time * 15.0 + ph) * 0.55;
  // fish with a body wave travelling to the tail
  vec3 f = FISH[k];
  f.x = sin(time * 9.0 + ph - f.z * 3.2) * 0.16 * (1.1 - f.z * 0.9);
  vec3 shape = mix(b, f, morph);
  vec3 fw = normalize(v + vec3(1e-4, 0.0, 0.0)), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
  float dist = length(p - camPos);
  float s = max(size, dist * pxAngle * pxMin);
  vec3 sim = p + (rt * shape.x + up * shape.y + fw * shape.z) * s;
  // texture layout: every bird sits on its own texel of a plane
  float rank = float(id) / float(T * T);
  float e = clamp(layout_ * 1.6 - rank * 0.6, 0.0, 1.0); e = e * e * (3.0 - 2.0 * e);
  vec3 tp = planeO + planeU * ((float(uv.x) + 0.5) / float(T) - 0.5) + planeV * ((float(uv.y) + 0.5) / float(T) - 0.5);
  float px = length(planeU) / float(T);
  vec3 lay = tp + (normalize(planeU) * QUAD[k].x + normalize(planeV) * QUAD[k].y) * px * 0.96;
  vWorld = mix(lay, sim, e);
  vec3 texc = clamp(0.5 + 0.5 * (p - cCenter) / cRadius, 0.0, 1.0);
  vec3 fishC = mix(vec3(0.05, 0.16, 0.22), vec3(0.72, 0.9, 0.92), smoothstep(0.12, -0.15, f.y) * 0.85 + 0.15);   // dark back, silver belly
  vec3 bc = mix(vec3(0.035, 0.04, 0.055), fishC, morph);
  vCol = mix(texc, bc, e);
  vA = mix(1.0, mix(0.92, 0.95, morph) * clamp(pow(size / s, 0.35), 0.45, 1.0), e) * (1.0 - dim);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;
const BIRD_FS = /* glsl */`${FS_HEAD}
uniform vec3 camPos; uniform float fogD, layout_; uniform vec3 tint; uniform float tintA;
in vec3 vWorld; in vec3 vCol; in float vA; out vec4 o;
${SKY_GLSL}
void main() {
  vec3 d = vWorld - camPos; float dist = length(d);
  float fog = (1.0 - exp(-dist * fogD)) * smoothstep(0.0, 0.3, layout_);
  vec3 c = mix(vCol, tint, tintA);
  o = vec4(mix(c, skyCol(d / dist), fog * (1.0 - tintA * 0.8)), vA);
}`;

// ---------------- field view: one glowing point per occupied grid cell ----------------
const FIELD_VS = /* glsl */`${FS_HEAD}
uniform mat4 projectionMatrix, viewMatrix; uniform sampler2D tGA; uniform int G, TX; uniform vec3 gOrigin; uniform float cell, pxScale, amp;
in vec3 position; out float vC;
void main() {
  int i = gl_VertexID; ivec3 c = ivec3(i % G, (i / G) % G, i / (G * G));
  vec4 A = texelFetch(tGA, ivec2(c.x + (c.z % TX) * G, c.y + (c.z / TX) * G), 0);
  vC = A.x;
  vec3 w = gOrigin + (vec3(c) + 0.5 + (A.x > 0.5 ? A.yzw / A.x : vec3(0.0))) * cell;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  gl_PointSize = A.x < 0.5 ? 0.0 : pxScale * cell / gl_Position.w * (0.18 + 0.22 * clamp(A.x / 60.0, 0.0, 1.0));
  if (A.x < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const FIELD_FS = /* glsl */`${FS_HEAD} uniform float amp; in float vC; out vec4 o;
vec3 heat(float x) { return clamp(vec3(1.5 * x - 0.1, 1.6 * x * x, 0.35 + 0.9 * (x - x * x)), 0.0, 1.0) + vec3(0.0, 0.0, 0.25) * (1.0 - x); }
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard;
  float x = clamp(log(1.0 + vC) / log(1.0 + 120.0), 0.0, 1.0);
  o = vec4(heat(x) * pow(1.0 - r, 1.5) * amp, 1.0); }`;

export function ihash(x) {
  x = (Math.imul(x >>> 0, 747796405) + 2891336453) >>> 0;
  x = Math.imul(((x >>> ((x >>> 28) + 4)) ^ x) >>> 0, 277803737) >>> 0;
  return (((x >>> 22) ^ x) >>> 0) / 4294967295;
}
export class GpuFlock {
  // o: { tex, G, L, seed, warm, center(simT)->[x,y,z], radii, params(simT)->{...}, predator(simT)->{p,r,s}|null, init(rand)->{p:[..], v:[..], spread:[..]} }
  constructor(renderer, o) {
    this.r = renderer; this.o = o;
    const T = this.T = o.tex, G = this.G = o.G || 40, TX = this.TX = 8, TY = Math.ceil(G / TX);
    this.N = T * T; this.cell = (o.L || 240) / G;
    const fb = renderer.extensions.has('EXT_float_blend');
    const rt = (w, h, type) => new THREE.WebGLRenderTarget(w, h, { type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.pos = [rt(T, T, THREE.FloatType), rt(T, T, THREE.FloatType)];
    this.vel = [rt(T, T, THREE.FloatType), rt(T, T, THREE.FloatType)];
    this.atlas = new THREE.Vector2(G * TX, G * TY);
    this.gA = rt(G * TX, G * TY, fb ? THREE.FloatType : THREE.HalfFloatType);
    this.gB = rt(G * TX, G * TY, fb ? THREE.FloatType : THREE.HalfFloatType);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.PlaneGeometry(2, 2);
    const mk = (fs, uniforms) => { const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
      const s = new THREE.Scene(); const me = new THREE.Mesh(quad, m); me.frustumCulled = false; s.add(me); return { s, m }; };
    const U = v => ({ value: v });
    this.velPass = mk(VEL_FS, { tPos: U(null), tVel: U(null), tGA: U(this.gA.texture), tGB: U(this.gB.texture), G: U(G), TX: U(TX), gOrigin: U(new THREE.Vector3()), cell: U(this.cell),
      center: U(new THREE.Vector3()), radii: U(new THREE.Vector3(1, 1, 1)), pred: U(new THREE.Vector4()), predS: U(0),
      dt: U(DT), ws: U(1), wa: U(1), wc: U(1), wb: U(1), maxS: U(14), minS: U(8), maxF: U(30), flatten: U(0.6), noiseW: U(4), stepN: U(0), rho0: U(60), swirl: U(0) });
    this.posPass = mk(POS_FS, { tPos: U(null), tVel: U(null), dt: U(DT), phaseBase: U(o.phaseBase ?? 4), phaseK: U(o.phaseK ?? 0.6) });
    this.copyPass = mk(COPY_FS, { tSrc: U(null) });
    const pts = new THREE.BufferGeometry();
    pts.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    const splat = which => {
      const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SPLAT_VS, fragmentShader: SPLAT_FS, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        uniforms: { tPos: U(null), tVel: U(null), T: U(T), G: U(G), TX: U(TX), gOrigin: this.velPass.m.uniforms.gOrigin, cell: U(this.cell), atlas: U(this.atlas), which: U(which) } });
      const s = new THREE.Scene(); const p = new THREE.Points(pts, m); p.frustumCulled = false; s.add(p); return { s, m };
    };
    this.splatA = splat(0); this.splatB = splat(1);
    this.reset();
  }
  get posTex() { return this.pos[this.cur].texture; }
  get velTex() { return this.vel[this.cur].texture; }
  reset() {
    const o = this.o, R = rng(o.seed || 11), N = this.N;
    const P = new Float32Array(N * 4), V = new Float32Array(N * 4);
    const ini = o.init ? o.init(0) : {};
    const c = ini.p || o.center(0), sp = ini.spread || o.radii, v0 = ini.v || [10, 0, 0];
    for (let i = 0; i < N; i++) {
      let x, y, z; do { x = R() * 2 - 1; y = R() * 2 - 1; z = R() * 2 - 1; } while (x * x + y * y + z * z > 1);
      P[i * 4] = c[0] + x * sp[0]; P[i * 4 + 1] = c[1] + y * sp[1]; P[i * 4 + 2] = c[2] + z * sp[2]; P[i * 4 + 3] = ihash(i * 7 + 5) * 6.2832;   // hash, not R(): keeps EP01's seeded layout unchanged
      V[i * 4] = v0[0] + (R() - 0.5) * 6; V[i * 4 + 1] = v0[1] + (R() - 0.5) * 2; V[i * 4 + 2] = v0[2] + (R() - 0.5) * 6;
    }
    this.cur = 0;
    for (const [arr, rts] of [[P, this.pos], [V, this.vel]]) {
      const dt = new THREE.DataTexture(arr, this.T, this.T, THREE.RGBAFormat, THREE.FloatType); dt.needsUpdate = true;
      this.copyPass.m.uniforms.tSrc.value = dt;
      this.pass(this.copyPass, rts[0]);
      dt.dispose();
    }
    this.stepN = 0; this._read = null;
  }
  pass(p, target) { const r = this.r; r.setRenderTarget(target); r.render(p.s, this.cam); }
  step() {
    const o = this.o, r = this.r, t = this.stepN * DT, u = this.velPass.m.uniforms;
    const pr = { ws: 1.0, wa: 1.8, wc: 0.8, wb: 1.2, maxS: 16, minS: 10, maxF: 20, flatten: 0.6, noiseW: 3, rho0: 140, swirl: 0, ...(o.params ? o.params(t) : {}) };
    for (const k of ['ws', 'wa', 'wc', 'wb', 'maxS', 'minS', 'maxF', 'flatten', 'noiseW', 'rho0', 'swirl']) u[k].value = pr[k];
    const c = o.center(t); u.center.value.set(c[0], c[1], c[2]);
    const rad = pr.radii || o.radii; u.radii.value.set(rad[0], rad[1], rad[2]);
    const L = this.cell * this.G;
    u.gOrigin.value.set(Math.floor((c[0] - L / 2) / this.cell) * this.cell, Math.floor((c[1] - L / 2) / this.cell) * this.cell, Math.floor((c[2] - L / 2) / this.cell) * this.cell);
    const pd = o.predator ? o.predator(t) : null;
    if (pd) { u.pred.value.set(pd.p[0], pd.p[1], pd.p[2], pd.r); u.predS.value = pd.s; } else { u.pred.value.set(0, 0, 0, 0); u.predS.value = 0; }
    u.stepN.value = this.stepN % 4096;
    const a = this.cur, b = 1 - a;
    // 1) splat into grid
    const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    for (const [sp, tgt] of [[this.splatA, this.gA], [this.splatB, this.gB]]) {
      sp.m.uniforms.tPos.value = this.pos[a].texture; sp.m.uniforms.tVel.value = this.vel[a].texture;
      r.setRenderTarget(tgt); r.clear(true, false, false); r.render(sp.s, this.cam);
    }
    r.setClearColor(cc, ca);
    // 2) velocities from the field   3) positions
    u.tPos.value = this.pos[a].texture; u.tVel.value = this.vel[a].texture;
    this.pass(this.velPass, this.vel[b]);
    const pu = this.posPass.m.uniforms; pu.tPos.value = this.pos[a].texture; pu.tVel.value = this.vel[b].texture;
    this.pass(this.posPass, this.pos[b]);
    this.cur = b; this.stepN++; this._read = null;
  }
  advanceTo(step) {
    step = Math.max(0, Math.round(step));
    if (step < this.stepN) this.reset();
    while (this.stepN < step) this.step();
    this.r.setRenderTarget(null);
  }
  gridInfo() { const u = this.velPass.m.uniforms; return { origin: u.gOrigin.value.clone(), cell: this.cell, G: this.G }; }
  read() {
    if (this._read) return this._read;
    const buf = new Float32Array(this.N * 4);
    this.r.readRenderTargetPixels(this.pos[this.cur], 0, 0, this.T, this.T, buf);
    const sp = this.o.spread || 0;
    if (sp) for (let i = 0; i < this.N; i++) for (let k = 0; k < 3; k++) buf[i * 4 + k] += (ihash(i * 3 + k) - 0.5) * sp;
    const vb = new Float32Array(this.N * 4);
    this.r.readRenderTargetPixels(this.vel[this.cur], 0, 0, this.T, this.T, vb);
    this.r.setRenderTarget(null);
    return (this._read = { p: buf, v: vb });
  }
  readGrid() {
    const w = this.atlas.x, h = this.atlas.y, buf = new Float32Array(w * h * 4);
    this.r.readRenderTargetPixels(this.gA, 0, 0, w, h, buf); this.r.setRenderTarget(null);
    return { buf, w, h, TX: this.TX, G: this.G };
  }
  nearest(i, k) {
    const { p } = this.read(), x = p[i * 4], y = p[i * 4 + 1], z = p[i * 4 + 2];
    const best = [];
    for (let j = 0; j < this.N; j++) {
      if (j === i) continue;
      const dx = p[j * 4] - x, dy = p[j * 4 + 1] - y, dz = p[j * 4 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
      if (best.length < k || d2 < best[best.length - 1][0]) { best.push([d2, j]); best.sort((a, b) => a[0] - b[0]); if (best.length > k) best.pop(); }
    }
    return best.map(b => b[1]);
  }
  position(i) { const { p } = this.read(); return new THREE.Vector3(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]); }
  velocity(i) { const { v } = this.read(); return new THREE.Vector3(v[i * 4], v[i * 4 + 1], v[i * 4 + 2]); }
}

// Instanced bird / fish / texel renderer for a flock (GPU textures)
export function makeBirds(flock, sky, { pick = false, size = 0.55 } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  geo.instanceCount = pick ? 8 : flock.N;
  const U = v => ({ value: v });
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: BIRD_VS, fragmentShader: BIRD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    defines: pick ? { PICK: 1 } : {},
    uniforms: { ...sky, tPos: U(null), tVel: U(null), T: U(flock.T), size: U(size), time: U(0), morph: U(0), layout_: U(1), pxAngle: U(0.001), pxMin: U(1.6), dim: U(0),
      camPos: U(new THREE.Vector3()), planeO: U(new THREE.Vector3()), planeU: U(new THREE.Vector3(100, 0, 0)), planeV: U(new THREE.Vector3(0, 100, 0)),
      cCenter: U(new THREE.Vector3()), cRadius: U(new THREE.Vector3(60, 30, 60)), fogD: U(0.0016), tint: U(new THREE.Color(1, 0.7, 0.3)), tintA: U(0),
      ids: U(new Array(8).fill(0)), spread: U(flock.o.spread ?? 0) },
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => {
    m.uniforms.tPos.value = flock.posTex; m.uniforms.tVel.value = flock.velTex;
    m.uniforms.camPos.value.copy(cam.position);
    m.uniforms.pxAngle.value = 2 * Math.tan(cam.fov * Math.PI / 360) / 1080;
  };
  return mesh;
}

export function makeField(flock) {
  const geo = new THREE.BufferGeometry();
  const n = flock.G ** 3;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const U = v => ({ value: v });
  const m = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FIELD_VS, fragmentShader: FIELD_FS, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { tGA: U(flock.gA.texture), G: U(flock.G), TX: U(flock.TX), gOrigin: flock.velPass.m.uniforms.gOrigin, cell: U(flock.cell), pxScale: U(1080 / (2 * Math.tan(20 * Math.PI / 180))), amp: U(0.5) },
  });
  const p = new THREE.Points(geo, m); p.frustumCulled = false;
  return p;
}
