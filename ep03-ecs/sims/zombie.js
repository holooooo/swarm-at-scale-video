// Instanced low-poly zombies. The ECS columns are packed into two float textures every frame;
// the vertex shader poses each body procedurally (run / climb / fall), like EP02's fish: no bones.
import * as THREE from 'three';

const HEAD = /* glsl */`precision highp float; precision highp int; precision highp sampler2D;`;
// boxes: [part, cx, cy, cz, sx, sy, sz, pivotY]   parts: 0 torso 1 head 2 armL 3 armR 4 legL 5 legR
const PARTS = [
  [0, 0, 1.2, 0, 0.44, 0.62, 0.26, 0.92], [1, 0, 1.66, 0.02, 0.24, 0.26, 0.24, 1.5],
  [2, -0.3, 1.18, 0, 0.12, 0.58, 0.13, 1.46], [3, 0.3, 1.18, 0, 0.12, 0.58, 0.13, 1.46],
  [4, -0.12, 0.46, 0, 0.16, 0.9, 0.17, 0.92], [5, 0.12, 0.46, 0, 0.16, 0.9, 0.17, 0.92],
];
export function zombieGeometry() {
  const P = [], N = [], A = [], idx = [];
  for (const [part, cx, cy, cz, sx, sy, sz, py] of PARTS) {
    const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(cx, cy, cz);
    const o = P.length / 3;
    P.push(...b.attributes.position.array); N.push(...b.attributes.normal.array);
    for (let i = 0; i < b.attributes.position.count; i++) A.push(part, py, cx);
    idx.push(...Array.from(b.index.array, i => i + o));
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 3));
  g.setIndex(idx);
  return g;
}
export const CITY_FOG = /* glsl */`
uniform vec3 uFogA, uFogB; uniform float uFogK;
vec3 cityFog(vec3 c, vec3 w, vec3 cam) {
  vec3 d = w - cam; float dist = length(d);
  vec3 fc = mix(uFogA, uFogB, smoothstep(-0.1, 0.5, d.y / dist));
  return mix(c, fc, 1.0 - exp(-dist * uFogK));
}`;
const VS = /* glsl */`${HEAD}
uniform mat4 projectionMatrix, viewMatrix; uniform sampler2D tA, tB; uniform int T; uniform float uTime, uSolo; uniform vec4 uSoloA, uSoloB;
in vec3 position, normal, aPart; out vec3 vW, vN; out float vPart, vSeed, vFocus;
uniform int uFocus;
mat3 rx(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
mat3 ry(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
void main() {
  int id = gl_InstanceID; ivec2 uv = ivec2(id % T, id / T);
  vec4 A = uSolo > 0.5 ? uSoloA : texelFetch(tA, uv, 0), B = uSolo > 0.5 ? uSoloB : texelFetch(tB, uv, 0);  // A: x y z heading  B: phase climb seed speed
  float part = aPart.x, pivotY = aPart.y, ph = B.x, climb = B.y, seed = B.z, run = clamp(B.w / 4.0, 0.0, 1.2);
  vec3 p = position;
  float side = part == 2.0 || part == 4.0 ? -1.0 : 1.0;
  float swing = sin(ph + (part == 2.0 || part == 5.0 ? 3.14159 : 0.0));
  vec3 pv = vec3(0.0, pivotY, 0.0);
  if (part >= 4.0) {                                   // legs: run stride / scrabble while climbing
    float a = swing * mix(0.9 * run, 0.6, climb) - climb * 0.9;
    p = pv + rx(a) * (p - pv);
  } else if (part >= 2.0) {                            // arms: reaching forward, flailing, up when climbing
    float a = mix(-1.35 + 0.35 * swing * run + 0.25 * sin(ph * 1.7 + seed * 9.0), -2.6 + 0.5 * swing, climb);
    p = pv + rx(a) * (p - pv);
    p.x += side * 0.04 * sin(ph * 2.3 + seed * 5.0);
  }
  float lean = mix(0.32 * run, 0.75, climb) + 0.08 * sin(ph * 2.0);
  p = vec3(0.0, 0.92, 0.0) + rx(lean) * (p - vec3(0.0, 0.92, 0.0));
  if (part == 1.0) p += vec3(0.04 * sin(seed * 40.0), 0.0, 0.0);
  float s = 0.9 + 0.22 * seed;
  vec3 w = A.xyz + ry(A.w) * (p * s);
  vN = ry(A.w) * rx(lean) * normal; vW = w; vPart = part; vSeed = seed; vFocus = float(id == uFocus);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FS = /* glsl */`${HEAD}
uniform vec3 cameraPos, uSun, uSunCol, uSky; uniform float uHL, uDim; uniform vec3 uHLCol;
in vec3 vW, vN; in float vPart, vSeed, vFocus; out vec4 o;
${CITY_FOG}
vec3 pal(float t) { vec3 c = vec3(0.42, 0.4, 0.37) + vec3(0.16, 0.12, 0.1) * cos(6.283 * (vec3(1.0) * t + vec3(0.0, 0.33, 0.67))); return mix(vec3(dot(c, vec3(0.333))), c, 0.55); }
void main() {
  vec3 n = normalize(vN);
  vec3 skin = mix(vec3(0.5, 0.54, 0.46), vec3(0.6, 0.56, 0.5), fract(vSeed * 7.0));
  vec3 shirt = pal(fract(vSeed * 13.0)) * 0.8, pants = mix(vec3(0.16, 0.17, 0.2), vec3(0.3, 0.26, 0.2), fract(vSeed * 3.0));
  vec3 c = vPart == 1.0 ? skin : vPart >= 4.0 ? pants : vPart >= 2.0 ? (fract(vSeed * 5.0) > 0.4 ? shirt : skin) : shirt;
  c *= 0.85 + 0.3 * fract(vSeed * 91.0);
  float dif = max(dot(n, uSun), 0.0), hemi = 0.5 + 0.5 * n.y;
  c = c * (uSunCol * dif * 0.9 + uSky * hemi * 0.55 + 0.08);
  c = mix(c, uHLCol, vFocus * uHL);
  c *= 1.0 - uDim;
  o = vec4(cityFog(c, vW, cameraPos), 1.0);
}`;

export function fogUniforms() {
  return { uFogA: { value: new THREE.Color(0.36, 0.33, 0.33) }, uFogB: { value: new THREE.Color(0.55, 0.47, 0.42) }, uFogK: { value: 0.012 },
    uSun: { value: new THREE.Vector3(0.6, 0.45, -0.35).normalize() }, uSunCol: { value: new THREE.Color(1.0, 0.76, 0.58) }, uSky: { value: new THREE.Color(0.62, 0.62, 0.7) } };
}
// pack ECS columns into textures (the "render system")
export class HordeView {
  constructor(horde, fog) {
    const cap = horde.cap; this.T = Math.ceil(Math.sqrt(cap)); this.h = horde;
    const mk = () => { const t = new THREE.DataTexture(new Float32Array(this.T * this.T * 4), this.T, this.T, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
    this.tA = mk(); this.tB = mk();
    const U = v => ({ value: v });
    this.mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS,
      uniforms: { ...fog, tA: U(this.tA), tB: U(this.tB), T: U(this.T), uTime: U(0), cameraPos: U(new THREE.Vector3()), uHL: U(0), uHLCol: U(new THREE.Color(1, 0.6, 0.25)), uDim: U(0), uFocus: U(-1),
        uSolo: U(0), uSoloA: U(new THREE.Vector4()), uSoloB: U(new THREE.Vector4()) } });
    this.mesh = new THREE.Mesh(zombieGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = (r, s, cam) => this.mat.uniforms.cameraPos.value.copy(cam.position);
  }
  //#region render
  sync() {                  // render system: copy the columns the shader needs
    const h = this.h, n = h.w.n, A = this.tA.image.data, B = this.tB.image.data, p = h.pos, v = h.vel, a = h.agent, c = h.climb;
    for (let e = 0; e < n; e++) {
      const k = e * 4, climbing = Math.min(1, Math.max(0, (c.ty[e] - p.y[e]) * 2 + (p.y[e] > 0.4 ? 0.6 : 0)));
      A[k] = p.x[e]; A[k + 1] = p.y[e]; A[k + 2] = p.z[e]; A[k + 3] = p.heading[e];
      B[k] = a.phase[e]; B[k + 1] = climbing; B[k + 2] = a.seed[e]; B[k + 3] = Math.hypot(v.x[e], v.z[e]);
    }
    this.tA.needsUpdate = this.tB.needsUpdate = true;
    this.mesh.geometry.instanceCount = n;
  }
  //#endregion
}
