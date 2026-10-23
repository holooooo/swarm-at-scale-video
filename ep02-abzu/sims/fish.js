// Instanced fish: one static mesh per species, drawn thousands of times. Every fish is animated in
// the vertex shader (no bones): blendshapes (bite, turning curl) + four layered sine motions driven
// by one phase. Positions / velocities / phases come from a GpuFlock's float textures.
import * as THREE from 'three';
import { makeFishGeometry } from './fishmesh.js';

export const SEA_GLSL = /* glsl */`
uniform vec3 uSun; uniform float uTime, uDepth, uMurk;
vec3 seaCol(vec3 d) {
  float h = d.y;
  vec3 deep = vec3(0.01, 0.12, 0.24) * (1.0 - uDepth * 0.7), mid = vec3(0.03, 0.42, 0.58) * (1.0 - uDepth * 0.6), top = vec3(0.3, 0.86, 0.86) * (1.0 - uDepth * 0.5);
  vec3 c = mix(deep, mid, smoothstep(-0.6, 0.15, h));
  c = mix(c, top, smoothstep(0.1, 0.95, h));
  float sd = max(dot(d, uSun), 0.0);
  c += vec3(0.55, 0.95, 0.95) * pow(sd, 18.0) * 0.55 + vec3(1.0) * pow(sd, 300.0) * 0.6;
  // Snell's window shimmer near the surface
  float az = atan(d.z, d.x);
  c += vec3(0.4, 0.8, 0.85) * pow(max(0.0, sin(az * 11.0 + sin(az * 4.0 + uTime * 0.3) * 2.0)), 10.0) * smoothstep(0.35, 0.95, h) * 0.12;
  return c;
}
vec3 fogTo(vec3 col, vec3 world, vec3 cam, float k) {
  vec3 d = world - cam; float dist = length(d);
  float f = 1.0 - exp(-dist * k * (1.0 + uMurk));
  return mix(col, seaCol(d / dist), f);
}`;

const HEAD = /* glsl */`precision highp float; precision highp int; precision highp sampler2D;`;
export const FISH_VS = /* glsl */`${HEAD}
uniform mat4 projectionMatrix, viewMatrix;
uniform sampler2D tPos, tVel; uniform int T, SOLO;
uniform float spread, size, sizeVar, side, pivot, wave, waveK, twist, maskB, maskW, curlGain, layout_;
uniform vec4 uComp;                      // on/off: side, pivot, wave, twist
uniform float uMask, uCorr, uGrid, uGridGap;
uniform vec3 soloPos, soloFwd; uniform float soloPhase, soloOpen, soloLunge; uniform vec2 soloCurl;
in vec3 position, normal, aOpen, aLunge, aCurlX, aCurlY, aCurlC; in float aPart;
out vec3 vWorld, vN, vM; out float vPart, vSeed;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float ihash(uint x) { x = x * 747796405u + 2891336453u; x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; x = (x >> 22u) ^ x; return float(x) / 4294967295.0; }
void main() {
  int id = gl_InstanceID;
  vec3 P, V; float ph, yaw;
  if (SOLO == 1) { P = soloPos; V = soloFwd; ph = soloPhase; yaw = 0.0; }
  else { ivec2 uv = ivec2(id % T, id / T); vec4 a = texelFetch(tPos, uv, 0), b = texelFetch(tVel, uv, 0); P = a.xyz; V = b.xyz; ph = a.w; yaw = b.w;
    uint ui = uint(id) * 3u; P += (vec3(ihash(ui), ihash(ui + 1u), ihash(ui + 2u)) - 0.5) * spread; }   // same jitter as GpuFlock.read()
  vec3 pos = position;
  //#region blend
  // blendshapes: offsets authored per vertex, mixed by weights
  vec2 curl = SOLO == 1 ? soloCurl : vec2(clamp(-yaw * curlGain, -1.0, 1.0), 0.0);
  pos += aOpen * soloOpen + aLunge * soloLunge;             // bite: open, then lunge
  pos += aCurlX * curl.x + aCurlY * curl.y;                 // turning curl (additive)
  pos += aCurlC * min(abs(curl.x), abs(curl.y)) * uCorr;    // fix-up for the 45° case
  //#endregion
  //#region swim
  float body = clamp((position.z + 1.0) * 0.5, 0.0, 1.0);  // 0 tail … 1 head
  float mask = mix(1.0, smoothstep(maskB, maskW, 1.0 - body), uMask); // back half only
  pos.x += cos(ph) * side * uComp.x;                                  // 1 side to side
  pos.xz = rot(cos(ph) * 0.1 * pivot * uComp.y) * pos.xz;             // 2 yaw pivot
  pos.x += cos(ph + body * waveK) * wave * mask * uComp.z;            // 3 wave down the spine
  pos.xy = mix(pos.xy, rot(cos(ph + body * waveK) * 0.3 * twist * uComp.w) * pos.xy, mask); // 4 twist
  //#endregion
  vM = position; vPart = aPart; vSeed = ihash(uint(id) * 3u + 1u);
  float s = size * (1.0 + sizeVar * (vSeed - 0.5));
  vec3 fw = normalize(V + vec3(0.0, 0.0, 1e-5)), lf = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, lf);
  vec3 w = P + (lf * pos.x + up * pos.y + fw * pos.z) * s;
  // instance-data view: every fish parked on its own slot of a grid
  if (layout_ < 1.0) {
    float k = clamp(layout_ * 1.5 - float(id) / float(T * T) * 0.5, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k);
    vec3 g = vec3(float(id % T) - float(T) * 0.5, float(id / T) - float(T) * 0.5, 0.0) * uGridGap;
    vec3 gw = uGrid * vec3(1.0) + vec3(g.x, -g.y, 0.0) + vec3(position.z, position.y, position.x) * s * 0.9;
    w = mix(gw, w, k);
  }
  vWorld = w; vN = normalize(lf * normal.x + up * normal.y + fw * normal.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
export const FISH_FS = /* glsl */`${HEAD}
uniform vec3 cameraPos, cTop, cBelly, cAccent, cFin; uniform float hBody, bars, tailTint, stripe, fogK, sheen, uGhost, uHL;
in vec3 vWorld, vN, vM; in float vPart, vSeed; out vec4 o;
${SEA_GLSL}
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float yy = vM.y / max(hBody, 0.01);
  vec3 c = mix(cBelly, cTop, smoothstep(-0.25, 0.45, yy));
  if (bars > 0.0) c = mix(c, cAccent, step(0.55, sin(vM.z * bars + 1.2)) * smoothstep(-0.7, -0.2, yy) * step(vM.z, 0.7));
  if (stripe > 0.0) c = mix(c, cAccent, smoothstep(0.09, 0.03, abs(yy - 0.05)) * stripe);
  if (tailTint > 0.0) c = mix(c, cAccent, smoothstep(-0.45, -0.7, vM.z) * tailTint);
  if (vPart > 0.5) c = mix(cFin, cAccent, vPart > 1.5 ? tailTint * 0.8 : 0.0);
  // eye
  float e = length(vec2(abs(vM.x) > 0.0 ? vM.y - hBody * 0.22 : 9.0, vM.z - 0.78));
  if (vPart < 0.5 && abs(vM.x) > 0.02) { c = mix(c, vec3(0.95), smoothstep(0.065, 0.05, e)); c = mix(c, vec3(0.02), smoothstep(0.042, 0.03, e)); }
  // light from the surface + caustic shimmer
  float dif = 0.45 + 0.55 * max(dot(n, uSun), 0.0);
  float caus = pow(0.5 + 0.5 * sin(vWorld.x * 1.7 + uTime * 1.9) * sin(vWorld.z * 1.3 - uTime * 1.4 + sin(vWorld.x * 0.7)), 6.0);
  vec3 vd = normalize(cameraPos - vWorld);
  float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  c = c * dif + c * caus * 0.35 * max(n.y, 0.0) + vec3(0.45, 0.85, 0.9) * rim * 0.25;
  c += vec3(1.0) * pow(max(dot(reflect(-uSun, n), vd), 0.0), 24.0) * sheen;
  c = mix(c, vec3(1.0, 0.72, 0.35), uHL);
  c = fogTo(c, vWorld, cameraPos, fogK);
  o = vec4(c, 1.0 - uGhost * 0.85);
}`;

// colors & swim parameters per species (sizes in metres: fish length = 2 * size)
export const SPECIES = {
  jack:     { zh: '大眼鲹', en: 'Bigeye trevally', size: 0.45, top: [0.36, 0.45, 0.52], belly: [0.86, 0.9, 0.92], accent: [0.95, 0.85, 0.4], fin: [0.55, 0.62, 0.66], bars: 0, tailTint: 0.5, stripe: 0, sheen: 0.55,
              side: 0.025, pivot: 0.5, wave: 0.11, waveK: 3.2, twist: 0.4, maskB: 0.35, maskW: 0.85 },
  sardine:  { zh: '沙丁鱼', en: 'Sardine', size: 0.13, top: [0.12, 0.3, 0.5], belly: [0.88, 0.93, 0.95], accent: [0.3, 0.5, 0.7], fin: [0.6, 0.7, 0.76], bars: 0, tailTint: 0, stripe: 0.6, sheen: 0.7,
              side: 0.03, pivot: 0.6, wave: 0.14, waveK: 3.4, twist: 0.5, maskB: 0.3, maskW: 0.8 },
  fusilier: { zh: '黄尾梅鲷', en: 'Yellowtail fusilier', size: 0.18, top: [0.18, 0.4, 0.75], belly: [0.8, 0.88, 0.95], accent: [1.0, 0.82, 0.12], fin: [0.95, 0.8, 0.25], bars: 0, tailTint: 1.0, stripe: 0.8, sheen: 0.3,
              side: 0.03, pivot: 0.6, wave: 0.13, waveK: 3.2, twist: 0.5, maskB: 0.3, maskW: 0.8 },
  tang:     { zh: '蓝倒吊', en: 'Blue tang', size: 0.17, top: [0.08, 0.28, 0.85], belly: [0.25, 0.5, 0.95], accent: [1.0, 0.86, 0.1], fin: [0.05, 0.12, 0.35], bars: 0, tailTint: 1.0, stripe: 0, sheen: 0.15,
              side: 0.02, pivot: 0.7, wave: 0.08, waveK: 2.6, twist: 0.3, maskB: 0.45, maskW: 0.9 },
  sergeant: { zh: '豆娘鱼', en: 'Sergeant major', size: 0.14, top: [0.85, 0.85, 0.35], belly: [0.9, 0.93, 0.9], accent: [0.05, 0.08, 0.12], fin: [0.7, 0.75, 0.6], bars: 13.0, tailTint: 0, stripe: 0, sheen: 0.2,
              side: 0.02, pivot: 0.7, wave: 0.08, waveK: 2.6, twist: 0.3, maskB: 0.45, maskW: 0.9 },
  snapper:  { zh: '红鲷', en: 'Red snapper', size: 0.32, top: [0.82, 0.25, 0.25], belly: [0.98, 0.72, 0.68], accent: [0.95, 0.4, 0.35], fin: [0.9, 0.45, 0.4], bars: 0, tailTint: 0.4, stripe: 0, sheen: 0.35,
              side: 0.02, pivot: 0.5, wave: 0.09, waveK: 2.8, twist: 0.35, maskB: 0.4, maskW: 0.85 },
  parrot:   { zh: '鹦嘴鱼', en: 'Parrotfish', size: 0.36, top: [0.15, 0.7, 0.6], belly: [0.55, 0.9, 0.75], accent: [0.95, 0.45, 0.65], fin: [0.9, 0.5, 0.7], bars: 0, tailTint: 0.8, stripe: 0, sheen: 0.2,
              side: 0.02, pivot: 0.5, wave: 0.07, waveK: 2.4, twist: 0.3, maskB: 0.45, maskW: 0.9 },
  shark:    { zh: '真鲨', en: 'Reef shark', size: 1.4, top: [0.36, 0.42, 0.48], belly: [0.88, 0.9, 0.9], accent: [0.15, 0.18, 0.22], fin: [0.3, 0.35, 0.4], bars: 0, tailTint: 0.3, stripe: 0, sheen: 0.25,
              side: 0.01, pivot: 0.3, wave: 0.09, waveK: 2.2, twist: 0.25, maskB: 0.25, maskW: 0.9 },
};
import { SHAPES } from './fishmesh.js';

const geoCache = {};
const geom = kind => geoCache[kind] || (geoCache[kind] = makeFishGeometry(kind));

// sea: shared uniforms object for every material in the scene
export function seaUniforms() { return { uSun: { value: new THREE.Vector3(0.15, 1, 0.2).normalize() }, uTime: { value: 0 }, uDepth: { value: 0 }, uMurk: { value: 0 } }; }

export function makeFishMaterial(kind, sea, { solo = false, T = 1 } = {}) {
  const sp = SPECIES[kind], sh = SHAPES[kind], U = v => ({ value: v });
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FISH_VS, fragmentShader: FISH_FS, side: THREE.DoubleSide, transparent: true,
    uniforms: { ...sea, spread: U(0), tPos: U(null), tVel: U(null), T: U(T), SOLO: U(solo ? 1 : 0), size: U(sp.size), sizeVar: U(solo ? 0 : 0.3),
      side: U(sp.side), pivot: U(sp.pivot), wave: U(sp.wave), waveK: U(sp.waveK), twist: U(sp.twist), maskB: U(sp.maskB), maskW: U(sp.maskW), curlGain: U(0.6), layout_: U(1),
      uComp: U(new THREE.Vector4(1, 1, 1, 1)), uMask: U(1), uCorr: U(1), uGrid: U(0), uGridGap: U(1),
      soloPos: U(new THREE.Vector3()), soloFwd: U(new THREE.Vector3(0, 0, 1)), soloPhase: U(0), soloOpen: U(0), soloLunge: U(0), soloCurl: U(new THREE.Vector2()),
      cameraPos: U(new THREE.Vector3()), cTop: U(new THREE.Color(...sp.top)), cBelly: U(new THREE.Color(...sp.belly)), cAccent: U(new THREE.Color(...sp.accent)), cFin: U(new THREE.Color(...sp.fin)),
      hBody: U(sh.h), bars: U(sp.bars), tailTint: U(sp.tailTint), stripe: U(sp.stripe), fogK: U(0.011), sheen: U(sp.sheen), uGhost: U(0), uHL: U(0) },
  });
}
//#region instancing
function instanced(kind, count) {
  const g = new THREE.InstancedBufferGeometry();
  const src = geom(kind);
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
  g.setIndex(src.index);
  g.instanceCount = count;
  return g;
}
// a school: one draw call for every fish of one species (instance i reads texel i)
export function makeSchool(kind, flock, sea) {
  const m = makeFishMaterial(kind, sea, { T: flock.T });
  m.uniforms.spread.value = flock.o.spread || 0;
  const mesh = new THREE.Mesh(instanced(kind, flock.N), m);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => { m.uniforms.tPos.value = flock.posTex; m.uniforms.tVel.value = flock.velTex; m.uniforms.cameraPos.value.copy(cam.position); };
  mesh.userData = { kind, flock };
  return mesh;
}
//#endregion
export function makeSolo(kind, sea) {
  const m = makeFishMaterial(kind, sea, { solo: true });
  const mesh = new THREE.Mesh(instanced(kind, 1), m);
  mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => m.uniforms.cameraPos.value.copy(cam.position);
  return mesh;
}
export const fishGeometry = geom;
