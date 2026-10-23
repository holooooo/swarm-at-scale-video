// EP05 · drawing 16,001 swords: the ECS columns are packed into four float textures (64 bytes per sword),
// the vertex shader aims and bends every blade. One draw for the swords, one for the trails, one for the sparks.
// Trails are ribbons through the last HN positions of each sword's pommel (a ring buffer the sim keeps).
import * as THREE from 'three';
import { HEAD, SKY } from './world.js';
import { N, N_OWN, R, HN } from './swords.js';

export const NI = N + 1, HERO_I = N;          // the last instance is her own sword, posed analytically
const TS = Math.ceil(Math.sqrt(NI));
const tex = (w = TS, h = TS) => { const t = new THREE.DataTexture(new Float32Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
const HW = 2048, HH = Math.ceil(NI * HN / HW);          // trail history: HN texels per sword, newest first
const POMMEL = '0.26';                                   // guard -> pommel end, in sword lengths

const FETCH = /* glsl */`
uniform sampler2D tP, tD, tB, tV; uniform int TS;
#define FETCH(id) ivec2 uvI = ivec2(id % TS, id / TS); vec4 P = texelFetch(tP, uvI, 0), D = texelFetch(tD, uvI, 0), Bd = texelFetch(tB, uvI, 0), Vl = texelFetch(tV, uvI, 0);`;

const SWORD_VS = /* glsl */`${HEAD}
uniform mat4 projectionMatrix, viewMatrix; uniform float uTime, uHeroScale, uFaceZ; in vec3 position, normal; in vec2 uv;
${FETCH}
out vec3 vW, vN; out float vPart, vTeam, vRole, vGlow, vY, vHero;
//#region bendVS
// the blade bends as an arc from the guard (curvature kappa); the hilt stays straight and turns with the blade root,
// so tip and pommel swing to opposite sides. kappa = plastic bend + a decaying ring: amplitude * sin(phase)
vec3 bendSword(float y, vec3 off, vec3 fwd, vec3 b, float kappa, out vec3 tang) {
  float k = y * y * 0.5 * kappa;                       // offset across the blade grows with y^2 toward the tip
  float th = kappa * max(y, 0.0);                      // blade: turns along the arc; hilt (y < 0): stays straight
  float ob = dot(off, b); vec3 rest = off - b * ob;    // the cross-section turns with the blade
  tang = fwd * cos(th) + b * sin(th);
  vec3 c = y > 0.0 ? fwd * (abs(kappa) > 1e-4 ? sin(th) / kappa : y) + b * (abs(kappa) > 1e-4 ? (1.0 - cos(th)) / kappa : k)
                   : fwd * y;
  return c + rest + (b * cos(th) - fwd * sin(th)) * ob;
}
//#endregion
void main() {
  int id = gl_InstanceID; FETCH(id)
  float vis = P.w; vHero = float(id == ${N});
  if (vis < 0.001) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  //#region aimVS
  vec3 fwd = normalize(D.xyz);                                // tip direction from the CPU
  vec3 ref = (id == ${N} || uFaceZ > 0.5) && abs(fwd.z) < 0.9 ? vec3(0, 0, 1) : abs(fwd.y) < 0.95 ? vec3(0, 1, 0) : vec3(1, 0, 0);   // her sword shows its face
  vec3 side = normalize(cross(fwd, ref));
  vec3 flat_ = cross(side, fwd);                              // blade face normal
  //#endregion
  float part = uv.x;
  vec3 p = position, off = side * p.x + flat_ * p.z;         // glTF: x = width, y = length (guard 0 .. tip 1), z = thickness
  vec3 n = side * normal.x + fwd * normal.y + flat_ * normal.z;
  vec3 Bp = Bd.xyz - fwd * dot(Bd.xyz, fwd); float bl = length(Bp);
  vec3 b = bl > 1e-5 ? Bp / bl : normalize(cross(fwd, flat_ + side * 0.3));
  float kappa = 2.0 * bl + 0.6 * Bd.w * sin(Vl.w);
  vec3 tang, local = bendSword(p.y, off, fwd, b, kappa, tang);
  float thn = kappa * max(p.y, 0.0), nb = dot(n, b), nf = dot(n, fwd);
  n = n - b * nb - fwd * nf + (b * cos(thn) - fwd * sin(thn)) * nb + tang * nf;
  if (part > 3.5) local -= normalize(Vl.xyz + fwd * 0.01) * (uv.y * uv.y * 0.08) * min(1.0, length(Vl.xyz) * 0.1) + vec3(0.0, 0.02 * sin(uTime * 9.0 + float(id)) * uv.y, 0.0);   // tassel drags behind
  float sc = (id == ${N} ? uHeroScale : 1.0) * (0.9 + 0.2 * fract(float(id) * 0.6180339));
  vW = P.xyz + local * sc * vis;
  vN = n; vPart = part; vTeam = floor(D.w / 16.0); vRole = mod(D.w, 16.0); vY = uv.y;
  vGlow = clamp(length(Vl.xyz) / 30.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;
const SWORD_FS = /* glsl */`${HEAD}
${SKY}
uniform vec3 cameraPos; uniform float uRoleTint, uDim, uFocusRole; in vec3 vW, vN; in float vPart, vTeam, vRole, vGlow, vY, vHero; out vec4 o;
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(cameraPos - vW); if (dot(n, v) < 0.0) n = -n;
  vec3 r = reflect(-v, n);
  vec3 env = skyCol(normalize(r * vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.05, 0.0)));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float spec = pow(max(dot(r, uSun), 0.0), 60.0);
  float foe = vTeam;
  vec3 metal = mix(vec3(0.82, 0.86, 0.9), vec3(0.24, 0.2, 0.22), foe);
  vec3 glowC = mix(vec3(0.45, 0.95, 1.0), vec3(1.0, 0.22, 0.12), foe);
  if (vHero > 0.5) { metal = vec3(0.92, 0.94, 0.98); glowC = vec3(0.6, 1.0, 0.95); }
  vec3 c;
  if (vPart < 0.5) {
    c = metal * env * 0.75 + uSunCol * spec * 2.5 + glowC * (fres * (0.35 + 0.9 * vGlow) + 0.1 * vY);
  } else if (vPart < 1.5 || vPart > 2.5 && vPart < 3.5) {     // guard, pommel
    vec3 m = mix(vec3(0.75, 0.68, 0.48), vec3(0.15, 0.12, 0.12), foe);
    c = m * (env * 0.6 + uSunCol * max(dot(n, uSun), 0.0) * 0.5) + uSunCol * spec;
  } else if (vPart < 2.5) {                                    // cord-wrapped grip
    c = mix(vec3(0.16, 0.36, 0.38), vec3(0.08, 0.04, 0.05), foe) * (0.5 + 0.6 * max(dot(n, uSun), 0.0));
  } else {                                                      // tassel
    c = mix(vec3(0.35, 0.85, 0.75), vec3(0.75, 0.08, 0.06), foe) * 0.9;
  }
  // role tint (ECS chapter): attack amber, guard cyan, shield white, everything else grey
  if (uRoleTint > 0.0) {
    vec3 rc = vRole == ${R.ATTACK}.0 ? vec3(1.0, 0.62, 0.2) : vRole == ${R.GUARD}.0 ? vec3(0.3, 0.85, 1.0) : vRole == ${R.SHIELD}.0 ? vec3(0.95, 0.95, 1.0) : vRole == ${R.STUN}.0 ? vec3(1.0, 0.3, 0.6) : vec3(0.45);
    c = mix(c, rc * (0.6 + 0.6 * fres) + rc * 0.25, uRoleTint * (1.0 - foe * 0.6));
  }
  o = vec4(fogTo(c, vW, cameraPos) * (1.0 - uDim), 1.0);
}`;
//#region trailVS
// a ribbon through the pommel's last HN positions (newest first): one vertex pair per sample, facing the camera,
// thinning and fading toward the oldest; a jump (respawn) cuts it
const TRAIL_VS = /* glsl */`${HEAD}
uniform mat4 projectionMatrix, viewMatrix; uniform vec3 cameraPos; uniform float uTrail, uHeroScale; uniform sampler2D tH; in vec3 position;
${FETCH}
out float vA, vU, vX; out vec3 vC, vW;
vec3 hist(int id, int k) { int q = id * ${HN} + k; return texelFetch(tH, ivec2(q % ${HW}, q / ${HW}), 0).xyz; }
void main() {
  int id = gl_InstanceID; FETCH(id)
  float sp = length(Vl.xyz);
  if (P.w < 0.001 || sp < 3.0 || uTrail <= 0.0) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  float sc = (id == ${N} ? uHeroScale : 1.0) * (0.9 + 0.2 * fract(float(id) * 0.6180339));
  vec3 back = normalize(D.xyz) * ${POMMEL} * sc;                 // from the guard to the pommel
  #define PT(j) ((j) == 0 ? P.xyz : hist(id, (j) - 1)) - back      // sample 0 is the sword now, then its history
  int k = int(position.y); float u = position.y / ${HN}.0;
  vec3 p = PT(k), pa = PT(max(k - 1, 0)), pb = PT(min(k + 1, ${HN}));
  float jump = 0.0; for (int j = 0; j < ${HN}; j++) if (j < k) jump = max(jump, length(PT(j) - PT(j + 1)));
  vec3 tg = pa - pb; tg /= max(length(tg), 1e-4);
  vec3 w = cross(tg, normalize(cameraPos - p)); w /= max(length(w), 1e-4);
  float wd = 0.05 * (1.0 - u) * (0.5 + 0.5 * smoothstep(3.0, 12.0, sp));
  vW = p + w * wd * position.x; vX = position.x; vU = u;
  vA = smoothstep(3.0, 10.0, sp) * P.w * (jump > 6.0 ? 0.0 : 1.0) * uTrail;
  float foe = floor(D.w / 16.0);
  vC = mix(vec3(0.5, 0.95, 1.0), vec3(1.0, 0.32, 0.14), foe);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;
//#endregion
const TRAIL_FS = /* glsl */`${HEAD}
${SKY}
uniform vec3 cameraPos; uniform float uDim; in float vA, vU, vX; in vec3 vC, vW; out vec4 o;
void main() {
  float core = exp(-vX * vX * 5.0), a = vA * pow(1.0 - vU, 1.6) * (0.3 + 0.7 * core) * 0.3;
  float f = exp(-length(vW - cameraPos) * uFogK * 1.5);
  o = vec4(mix(vC, vec3(1.0), core * 0.45 * (1.0 - vU)) * a * f * (1.0 - uDim), 1.0);
}`;
const SPARK_VS = /* glsl */`${HEAD}
uniform mat4 projectionMatrix, viewMatrix; uniform float uTime, uPx; in vec3 position; in vec2 aInfo;   // position = origin, aInfo = (t0, kind)
out vec3 vC; out float vA;
float h(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
void main() {
  float age = uTime - aInfo.x, sd = float(gl_VertexID);
  if (age < 0.0 || age > 0.55) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
  vec3 dir = normalize(vec3(h(sd) - 0.5, h(sd + 1.7) - 0.4, h(sd + 3.1) - 0.5));
  float sp = 6.0 + 12.0 * h(sd + 5.3);
  vec3 p = position + dir * sp * (1.0 - exp(-age * 5.0)) / 5.0 + vec3(0.0, -4.0 * age * age, 0.0);
  vec4 cp = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * cp;
  float k = aInfo.y;
  vC = k < 0.5 ? vec3(1.0, 0.85, 0.55) : k < 1.5 ? vec3(0.55, 0.95, 1.0) : vec3(1.0, 0.35, 0.2);
  vA = (1.0 - age / 0.55);
  gl_PointSize = clamp(uPx * (0.10 + 0.06 * h(sd + 9.0)) / -cp.z, 1.0, 9.0) * (0.5 + vA);
}`;
const SPARK_FS = /* glsl */`${HEAD} uniform float uDim; in vec3 vC; in float vA; out vec4 o;
void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)) * vA; o = vec4(vC * a * 1.6 * (1.0 - uDim), 1.0); }`;
// a sphere of light around her (shield) and around him (barrier); rings spread from the last hits
const AURA_VS = /* glsl */`${HEAD} uniform mat4 projectionMatrix, viewMatrix, modelMatrix; in vec3 position, normal; out vec3 vW, vN;
void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = mat3(modelMatrix) * normal; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`;
const AURA_FS = /* glsl */`${HEAD} uniform vec3 cameraPos, uC, uCen; uniform vec4 uHits[24]; uniform float uTime, uOn, uBreak, uR; in vec3 vW, vN; out vec4 o;
void main() {
  vec3 n = normalize(vN), v = normalize(cameraPos - vW); float fres = pow(1.0 - abs(dot(n, v)), 2.5);
  float ring = 0.0;
  for (int i = 0; i < 24; i++) {
    float age = uTime - uHits[i].w; if (age < 0.0 || age > 0.8) continue;
    float d = acos(clamp(dot(normalize(vW - uCen), normalize(uHits[i].xyz - uCen)), -1.0, 1.0)) * uR;
    ring += exp(-pow((d - age * 6.0) / 0.35, 2.0)) * (1.0 - age / 0.8);
  }
  float hexes = 0.5 + 0.5 * sin(vW.x * 9.0) * sin(vW.y * 9.0) * sin(vW.z * 9.0);
  float a = uOn * (fres * 0.22 + ring * (0.5 + 0.3 * hexes)) + uBreak * fres;
  o = vec4(uC * a, 1.0);
}`;

export class SwordView {
  constructor(sim, wu, swordGeo) {
    this.sim = sim; this.tP = tex(); this.tD = tex(); this.tB = tex(); this.tV = tex(); this.tH = tex(HW, HH);
    const U = v => ({ value: v });
    const common = { ...wu, tP: U(this.tP), tD: U(this.tD), tB: U(this.tB), tV: U(this.tV), TS: U(TS), cameraPos: U(new THREE.Vector3()) };
    this.common = common;
    const g = new THREE.InstancedBufferGeometry(); g.index = swordGeo.index;
    for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, swordGeo.attributes[k]);
    g.instanceCount = NI;
    const heroScale = U(1.0);
    this.swordMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SWORD_VS, fragmentShader: SWORD_FS, side: THREE.DoubleSide,
      uniforms: { ...common, uHeroScale: heroScale, uRoleTint: U(0), uFocusRole: U(-1), uFaceZ: U(0) } });
    this.swords = new THREE.Mesh(g, this.swordMat); this.swords.frustumCulled = false;
    const tg = new THREE.InstancedBufferGeometry();
    const tv = [], ti = [];                       // HN vertex pairs: x = side (-1, 1), y = sample index
    for (let k = 0; k <= HN; k++) tv.push(-1, k, 0, 1, k, 0);
    for (let k = 0; k < HN; k++) { const a = k * 2; ti.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3)); tg.setIndex(ti); tg.instanceCount = NI;
    this.trailMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { ...common, tH: U(this.tH), uTrail: U(1), uHeroScale: heroScale } });
    this.trails = new THREE.Mesh(tg, this.trailMat); this.trails.frustumCulled = false; this.trails.renderOrder = 10;
    this.MAXSP = 24000; const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAXSP * 3), 3)); sg.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(this.MAXSP * 2), 2));
    this.sparkMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { ...common, uPx: U(1080) } });
    this.sparks = new THREE.Points(sg, this.sparkMat); this.sparks.frustumCulled = false; this.sparks.renderOrder = 11;
    const aura = (col, rad) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(rad, 64, 32), new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: AURA_VS, fragmentShader: AURA_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { cameraPos: common.cameraPos, uTime: wu.uTime, uC: U(new THREE.Color(...col)), uCen: U(new THREE.Vector3()), uHits: U(Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 0, -9))),
          uOn: U(0), uBreak: U(0), uR: U(rad) } }));
      m.frustumCulled = false; m.renderOrder = 12; return m;
    };
    this.shield = aura([0.45, 0.95, 1.0], 6.0); this.barrier = aura([1.0, 0.28, 0.16], 3.0);
    this.group = new THREE.Group(); this.group.add(this.swords, this.trails, this.sparks, this.shield, this.barrier);
    for (const m of [this.swords, this.trails, this.sparks]) m.onBeforeRender = (r, s, cam) => common.cameraPos.value.copy(cam.position);
    this.shield.onBeforeRender = this.barrier.onBeforeRender = (r, s, cam) => common.cameraPos.value.copy(cam.position);
  }
  //#region upload
  sync(t, hero) {          // the render system: copy four columns per sword, 4 x vec4 = 64 bytes
    const s = this.sim, P = this.tP.image.data, D = this.tD.image.data, B = this.tB.image.data, V = this.tV.image.data;
    const { pos, vel, dir, bend, sword } = s, role = sword.role;
    for (let i = 0; i < N; i++) {
      const k = i * 4, r = role[i];
      let vis = r === R.REST || r === R.HIDDEN || r === R.DEAD ? 0 : 1;
      if (vis) vis = Math.min(1, Math.max(0, (pos.y[i] + 14) / 6));         // fade in/out through the cloud deck
      P[k] = pos.x[i]; P[k + 1] = pos.y[i]; P[k + 2] = pos.z[i]; P[k + 3] = vis;
      D[k] = dir.x[i]; D[k + 1] = dir.y[i]; D[k + 2] = dir.z[i]; D[k + 3] = sword.team[i] * 16 + (r === R.STUN ? sword.prev[i] : r);
      const age = t - bend.wobT[i], amp = bend.wob[i] * Math.exp(-age * 3.2);
      B[k] = bend.x[i]; B[k + 1] = bend.y[i]; B[k + 2] = bend.z[i]; B[k + 3] = amp;
      V[k] = vel.x[i]; V[k + 1] = vel.y[i]; V[k + 2] = vel.z[i]; V[k + 3] = age * 38.0;
    }
    //#endregion
    const k = HERO_I * 4;
    P[k] = hero.p[0]; P[k + 1] = hero.p[1]; P[k + 2] = hero.p[2]; P[k + 3] = hero.vis;
    D[k] = hero.d[0]; D[k + 1] = hero.d[1]; D[k + 2] = hero.d[2]; D[k + 3] = 0;
    B[k] = B[k + 1] = B[k + 2] = 0; B[k + 3] = 0; V[k] = hero.v[0]; V[k + 1] = hero.v[1]; V[k + 2] = hero.v[2]; V[k + 3] = 0;
    // trail history: the sim's ring buffer, re-ordered newest first; her sword's comes from its analytic path
    const Hd = this.tH.image.data, hs = s.hist, h0 = s.histHead;
    for (let i = 0; i < N; i++) for (let j = 0; j < HN; j++) {
      const src = (i * HN + (h0 - j + HN) % HN) * 3, dst = (i * HN + j) * 4;
      Hd[dst] = hs[src]; Hd[dst + 1] = hs[src + 1]; Hd[dst + 2] = hs[src + 2];
    }
    if (hero.hist) for (let j = 0; j < HN; j++) Hd.set(hero.hist[j], (HERO_I * HN + j) * 4);
    this.tP.needsUpdate = this.tD.needsUpdate = this.tB.needsUpdate = this.tV.needsUpdate = this.tH.needsUpdate = true;
    // sparks from the event log, last 0.55 s
    const ev = s.events(t - 0.55, t + 1e-6, 2000), e = s.ev, pa = this.sparks.geometry.attributes.position.array, ia = this.sparks.geometry.attributes.aInfo.array;
    let n = 0; const per = Math.max(3, Math.min(12, Math.floor(this.MAXSP / Math.max(1, ev.length))));
    const hits = [[], []];
    for (const q of ev) {
      const b = q * 5, kind = e[b + 4];
      if (kind > 0.5) hits[kind > 1.5 ? 1 : 0].push(q);
      for (let j = 0; j < per && n < this.MAXSP; j++, n++) { pa[n * 3] = e[b + 1]; pa[n * 3 + 1] = e[b + 2]; pa[n * 3 + 2] = e[b + 3]; ia[n * 2] = e[b]; ia[n * 2 + 1] = kind; }
    }
    this.sparks.geometry.setDrawRange(0, n); this.sparks.geometry.attributes.position.needsUpdate = this.sparks.geometry.attributes.aInfo.needsUpdate = true;
    for (const [m, list] of [[this.shield, hits[0]], [this.barrier, hits[1]]]) {
      const H = m.material.uniforms.uHits.value, pick = list.slice(-24);
      for (let j = 0; j < 24; j++) { const q = pick[j]; if (q == null) H[j].set(0, 0, 0, -9); else H[j].set(e[q * 5 + 1], e[q * 5 + 2], e[q * 5 + 3], e[q * 5]); }
    }
    return { sparks: n, events: ev.length };
  }
}
