// EP04 GPU side: a star, a spinning planet tiled with sun-tracking solar panels, and a Dyson swarm of
// 1,048,576 sails. Nothing here is simulated on the CPU: panel orientation and sail orbits are pure
// functions of (instance data, time, sun direction), evaluated in the vertex shader every frame.
import * as THREE from 'three';

const HEAD = /* glsl */`precision highp float; precision highp int;`;
export const SYS = { starR: 34, planetPos: new THREE.Vector3(560, 0, -80), planetR: 48, spinPeriod: 46, tilt: 0.32 };

export function spaceUniforms() {
  return { uTime: { value: 0 }, uSpin: { value: 0 }, uOrbitT: { value: 0 }, uStar: { value: new THREE.Vector3(0, 0, 0) },
    uPlanet: { value: SYS.planetPos.clone() }, uPlanetR: { value: SYS.planetR }, uTilt: { value: SYS.tilt },
    uPark: { value: 1 }, uTrack: { value: 1 }, uDim: { value: 0 }, uHL: { value: -1 }, uSailGlow: { value: 1 }, uSailCount: { value: 1 << 20 } };
}
// planet rotation (spin about a tilted axis) — shared by planet surface, panels and the CPU camera code
const ROT = /* glsl */`
uniform float uSpin, uTilt; uniform vec3 uPlanet, uStar; uniform float uPlanetR;
mat3 planetRot() {
  float c = cos(uSpin), s = sin(uSpin), ct = cos(uTilt), st = sin(uTilt);
  mat3 spin = mat3(c, 0, -s, 0, 1, 0, s, 0, c);
  mat3 tilt = mat3(1, 0, 0, 0, ct, st, 0, -st, ct);
  return tilt * spin;
}`;
export function planetRotJS(spin, tilt = SYS.tilt) {
  const m = new THREE.Matrix4().makeRotationY(spin), t = new THREE.Matrix4().makeRotationX(tilt);   // same as planetRot() in GLSL
  return new THREE.Matrix3().setFromMatrix4(t.multiply(m));
}

// ------------------------------------------------------------- star + background
export function makeStar(u) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(SYS.starR, 64, 32), new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: `varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `${HEAD} uniform float uTime; varying vec3 vN, vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){ float mu = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0);
        float g = 0.5 + 0.5 * sin(vW.x * 0.35 + uTime * 0.6) * sin(vW.y * 0.31 - uTime * 0.4) * sin(vW.z * 0.29 + uTime * 0.5);
        vec3 c = mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.95, 0.85), pow(mu, 0.6)) * (1.6 + 0.4 * g);
        gl_FragColor = vec4(c, 1.0); }` }));
  g.add(core);
  const glowT = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.18, 'rgba(255,190,120,0.55)'); gr.addColorStop(0.45, 'rgba(255,120,60,0.12)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(SYS.starR * 9); g.add(glow);
  // star field
  const N = 6000, p = new Float32Array(N * 3); let s = 9;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) { const a = R() * 6.283, b = Math.acos(2 * R() - 1); p.set([Math.sin(b) * Math.cos(a) * 3000, Math.cos(b) * 3000, Math.sin(b) * Math.sin(a) * 3000], i * 3); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: 0x9fb4d8, transparent: true, opacity: 0.8, depthWrite: false }));
  stars.onBeforeRender = (r, sc, cam) => stars.position.copy(cam.position);
  g.add(stars);
  return g;
}

// ------------------------------------------------------------- planet
export function makePlanet(u) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(SYS.planetR, 160, 80), new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: `${ROT} varying vec3 vL, vW, vN; void main(){ vL = normalize(position); mat3 R = planetRot(); vec3 w = uPlanet + R * position; vW = w; vN = R * vL; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: `${HEAD} ${ROT} uniform float uDim; varying vec3 vL, vW, vN;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        float e = n3(vL * 3.0) * 0.55 + n3(vL * 7.0) * 0.3 + n3(vL * 17.0) * 0.15;
        vec3 c = e < 0.42 ? mix(vec3(0.05, 0.16, 0.28), vec3(0.08, 0.3, 0.42), e / 0.42) : mix(vec3(0.42, 0.36, 0.3), vec3(0.78, 0.74, 0.7), smoothstep(0.42, 0.8, e));
        c = mix(c, vec3(0.9, 0.93, 0.97), smoothstep(0.78, 0.9, abs(vL.y)));
        vec3 L = normalize(uStar - vW), n = normalize(vN);
        float d = dot(n, L), day = smoothstep(-0.12, 0.2, d);
        vec3 col = c * (0.05 + 1.05 * max(d, 0.0)) + vec3(0.25, 0.45, 0.85) * pow(1.0 - max(dot(n, normalize(cameraPosition - vW)), 0.0), 3.0) * 0.6 * (0.2 + day);
        gl_FragColor = vec4(col * (1.0 - uDim), 1.0); }` }));
  m.frustumCulled = false;      // the shader moves it to uPlanet, so three's bounds are wrong
  return m;
}

// ------------------------------------------------------------- panels
// instance data (static, uploaded once): direction on the unit sphere (planet-local) + a seed
export function panelLayout(count) {
  const out = []; let s = 3;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const fields = [];
  while (out.length < count) {
    // rectangular fields in lat/long, like a factory planet's solar farms
    const lat0 = (R() * 2 - 1) * 1.15, lon0 = R() * 6.283, nLat = 14 + Math.floor(R() * 24), nLon = 14 + Math.floor(R() * 34), step = 0.0105;
    fields.push([lat0, lon0]);
    for (let a = 0; a < nLat && out.length < count; a++) for (let b = 0; b < nLon && out.length < count; b++) {
      const lat = lat0 + a * step, lon = lon0 + b * step / Math.max(0.25, Math.cos(lat));
      out.push(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon), R());
    }
  }
  return new Float32Array(out);
}
export const PANEL_VS = /* glsl */`${HEAD} ${ROT}
uniform float uPark, uTrack, uTime; uniform int uHL;
attribute vec4 aP;            // planet-local direction (xyz), seed (w)
varying vec3 vW, vN, vLoc; varying float vPart, vSun, vHL;
mat3 axisAngle(vec3 a, float t) { float c = cos(t), s = sin(t), k = 1.0 - c;
  return mat3(c + a.x*a.x*k, a.y*a.x*k + a.z*s, a.z*a.x*k - a.y*s,  a.x*a.y*k - a.z*s, c + a.y*a.y*k, a.z*a.y*k + a.x*s,  a.x*a.z*k + a.y*s, a.y*a.z*k - a.x*s, c + a.z*a.z*k); }
void main() {
  mat3 R = planetRot();
  vec3 up = R * aP.xyz;                                   // the panel's ground normal, this frame
  vec3 base = uPlanet + up * uPlanetR;
  vec3 east = normalize(cross(R * vec3(0.0, 1.0, 0.0), up) + vec3(1e-4, 0.0, 0.0));
  //#region faceSun
  vec3 sun = normalize(uStar - base);                     // the only per-frame input
  float elev = dot(sun, up);                              // how high the sun is above the horizon
  vec3 azim = normalize(sun - up * elev + east * 1e-4);   // 1) turn the base toward it
  float tilt = acos(clamp(elev, 0.0, 1.0));               // 2) then lean the face up to it
  float awake = smoothstep(-0.05, 0.12, elev) * uTrack;   // below the horizon: park flat
  vec3 face = normalize(up * cos(tilt * awake) + azim * sin(tilt * awake));
  //#endregion
  vec3 right = normalize(cross(azim, up));
  vec3 p = position; vPart = p.y > 0.95 ? 1.0 : 0.0; vLoc = p;
  vec3 w;
  if (vPart > 0.5) { vec3 q = p - vec3(0.0, 1.0, 0.0); w = up * 1.0 + right * q.x + face * q.y + cross(right, face) * q.z; vN = face; }
  else { w = right * p.x + up * p.y + azim * p.z; vN = up; }
  vW = base + w * 0.2; vSun = max(elev, 0.0); vHL = float(gl_InstanceID == uHL);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
}`;
const PANEL_FS = /* glsl */`${HEAD} ${ROT} uniform float uDim; varying vec3 vW, vN, vLoc; varying float vPart, vSun, vHL;
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(uStar - vW), V = normalize(cameraPosition - vW);
  vec3 c = vec3(0.5, 0.52, 0.55);
  if (vPart > 0.5) { vec2 g = fract(vLoc.xz * vec2(3.0, 4.0)); float line = step(0.88, max(g.x, g.y)); float rim = step(0.92, max(abs(vLoc.x), abs(vLoc.z) * 1.43)); c = mix(vec3(0.05, 0.12, 0.34), vec3(0.62, 0.66, 0.72), max(line, rim)); }
  float dif = max(dot(n, L), 0.0);
  vec3 col = c * (0.1 + dif * 1.1) + vec3(1.0, 0.85, 0.65) * pow(max(dot(reflect(-L, n), V), 0.0), 60.0) * 1.6 * vPart;
  col = mix(col, vec3(1.0, 0.7, 0.3), vHL * 0.75);
  gl_FragColor = vec4(col * (1.0 - uDim), 1.0);
}`;
export function panelGeometry() {
  // pole (0..1 on y) + panel slab centred at y = 1.0
  const parts = [new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0), new THREE.BoxGeometry(2.0, 0.06, 1.4).translate(0, 1.0, 0)];
  const P = [], N = [], I = [];
  for (const b of parts) { const o = P.length / 3; P.push(...b.attributes.position.array); N.push(...b.attributes.normal.array); I.push(...Array.from(b.index.array, i => i + o)); }
  // panel slab vertices sit at y 0.97..1.03; mark them by y > 0.95
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  return g;
}
export function makePanels(u, count) {
  const g = panelGeometry(), data = panelLayout(count);
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(data, 4)); g.instanceCount = count;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: PANEL_VS, fragmentShader: PANEL_FS, side: THREE.DoubleSide }));
  m.frustumCulled = false; m.userData.data = data;
  return m;
}

// ------------------------------------------------------------- swarm
export const SAIL_VS = /* glsl */`${HEAD}
uniform float uOrbitT, uSailCount; uniform vec3 uStar;
in vec3 position;
uniform mat4 projectionMatrix, viewMatrix; uniform vec3 cameraPos;
out vec2 vUv; out float vFace, vFade;
float ihash(uint x) { x = x * 747796405u + 2891336453u; x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u; x = (x >> 22u) ^ x; return float(x) / 4294967295.0; }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0, -s, 0, 1, 0, s, 0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1, 0, 0, 0, c, s, 0, -s, c); }
void main() {
  uint id = uint(gl_InstanceID);
  if (float(id) >= uSailCount) { gl_Position = vec4(2.0); return; }
  //#region orbit
  // every orbit parameter comes from the sail's own index: nothing is stored
  float lane = floor(ihash(id * 4u) * 7.0);                  // 7 orbit planes
  float r = 120.0 + lane * 26.0 + (ihash(id * 4u + 1u) - 0.5) * 16.0;
  float inc = (lane - 3.0) * 0.38 + (ihash(id * 4u + 2u) - 0.5) * 0.07, node = lane * 1.7;
  float w = 26.0 / pow(r / 100.0, 1.5);                      // Kepler: inner orbits are faster
  float ang = ihash(id * 4u + 3u) * 6.2832 + uOrbitT * w * 0.02;
  vec3 p = uStar + rotY(node) * rotX(inc) * vec3(cos(ang) * r, 0.0, sin(ang) * r);   // position = f(index, time)
  //#endregion
  vec3 toStar = normalize(uStar - p), side = normalize(cross(toStar, vec3(0.0, 1.0, 0.0) + 1e-3)), up = cross(side, toStar);
  vec3 wp = p + (side * position.x + up * position.y) * 1.1;
  vec3 V = normalize(cameraPos - p);
  vFace = abs(dot(V, toStar)); vUv = position.xy;
  float d = length(cameraPos - p); vFade = smoothstep(4.0, 30.0, d);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SAIL_FS = /* glsl */`${HEAD} uniform float uSailGlow; in vec2 vUv; in float vFace, vFade; out vec4 o;
void main() { float r = max(abs(vUv.x), abs(vUv.y)); float edge = smoothstep(0.5, 0.42, r);
  vec3 c = mix(vec3(0.35, 0.6, 1.0), vec3(0.85, 0.95, 1.0), vFace) * (0.35 + 0.65 * vFace);
  o = vec4(c * edge * uSailGlow * vFade * 0.09, 1.0); }`;
export function makeSwarm(u) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position);
  g.instanceCount = 1 << 20;
  const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: SAIL_VS, fragmentShader: SAIL_FS, uniforms: { ...u, cameraPos: { value: new THREE.Vector3() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  mesh.onBeforeRender = (r, s, cam) => m.uniforms.cameraPos.value.copy(cam.position);
  return mesh;
}
// geodesic Dyson-sphere frame (partly built)
export function makeShell(u, radius = 300) {
  const ico = new THREE.IcosahedronGeometry(radius, 4), e = new THREE.EdgesGeometry(ico, 1);
  const p = e.attributes.position.array, keep = [];
  for (let i = 0; i < p.length; i += 6) { const y = (p[i + 1] + p[i + 4]) / 2 / radius, x = (p[i] + p[i + 3]) / 2 / radius; if (y > -0.15 && y < 0.55 && x < 0.35) keep.push(...p.slice(i, i + 6)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  const m = new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  return new THREE.LineSegments(g, m);
}
