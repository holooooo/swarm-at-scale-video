// EP05 · sky, sea of clouds, peaks, lights. Golden hour; every drift is periodic in the film length,
// so the last frame matches the first.
import * as THREE from 'three';

export const HEAD = /* glsl */`precision highp float; precision highp int; precision highp sampler2D;`;
export const SKY = /* glsl */`
uniform vec3 uSun, uSunCol, uZen, uHor, uFogC; uniform float uFogK, uCloudY;
vec3 skyCol(vec3 d) {
  float h = d.y, s = max(dot(d, uSun), 0.0);
  vec3 c = mix(uHor, uZen, smoothstep(-0.02, 0.55, h));
  c = mix(c, vec3(1.0, 0.62, 0.42), (1.0 - smoothstep(0.0, 0.25, abs(h - 0.02))) * 0.35 * (0.4 + 0.6 * pow(s, 3.0)));
  c += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 18.0) * 0.45 + pow(s, 4.0) * 0.12);
  return c;
}
vec3 fogTo(vec3 c, vec3 w, vec3 cam) {
  vec3 d = w - cam; float dist = length(d); vec3 dir = d / dist;
  vec3 f = mix(uFogC, skyCol(dir), 0.55);
  float k = 1.0 - exp(-dist * uFogK);
  k = max(k, smoothstep(uCloudY + 1.0, uCloudY - 6.0, w.y) * 0.97);      // under the sea of clouds
  return mix(c, f, k);
}`;
export function worldUniforms() {
  const U = v => ({ value: v });
  return { uSun: U(new THREE.Vector3(-0.55, 0.16, 0.82).normalize()), uSunCol: U(new THREE.Color(1.0, 0.72, 0.45)), uZen: U(new THREE.Color(0.2, 0.32, 0.55)),
    uHor: U(new THREE.Color(0.98, 0.78, 0.6)), uFogC: U(new THREE.Color(0.86, 0.74, 0.66)), uFogK: U(0.0035), uCloudY: U(-6.0), uTime: U(0), uLoop: U(180), uDim: U(0) };
}
const NOISE = /* glsl */`
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`;

export function makeSky(u) {
  return new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, side: THREE.BackSide, depthWrite: false, uniforms: u,
    vertexShader: `${HEAD} uniform mat4 projectionMatrix, modelViewMatrix; in vec3 position; out vec3 vD;
      void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `${HEAD} ${SKY} uniform float uDim; in vec3 vD; out vec4 o; void main() { o = vec4(skyCol(normalize(vD)) * (1.0 - uDim), 1.0); }` }));
}
// two layers of cloud sea: an fbm deck at the cloud line and thinner wisps above; drift loops over the film
export function makeClouds(u) {
  const g = new THREE.Group();
  for (const [y, k, a, sc] of [[-6, 0, 1.0, 0.022], [-2.5, 1, 0.55, 0.03], [2.0, 2, 0.28, 0.045]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2), new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, transparent: true, depthWrite: k === 0,
      uniforms: { ...u, uL: { value: k }, uA: { value: a }, uS: { value: sc } },
      vertexShader: `${HEAD} uniform mat4 projectionMatrix, modelViewMatrix, modelMatrix; in vec3 position; out vec3 vW;
        void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `${HEAD} ${SKY} ${NOISE} uniform float uL, uA, uS, uTime, uLoop, uDim; uniform vec3 cameraPosition; in vec3 vW; out vec4 o;
        void main() {
          float ph = 6.2831853 * uTime / uLoop;                       // whole loops over the film
          vec2 drift = vec2(cos(ph), sin(ph)) * (18.0 + 10.0 * uL);
          vec2 p = (vW.xz + drift) * uS;
          float n = fbm(p) * 0.7 + fbm(p * 3.1 + 3.0 + vec2(sin(ph), cos(ph)) * 0.6) * 0.3;
          float dens = smoothstep(uL == 0.0 ? 0.3 : 0.55, uL == 0.0 ? 0.62 : 0.85, n);
          float r = length(vW.xz);
          if (uL > 0.0) dens *= smoothstep(25.0, 60.0, r) * 0.8 + 0.2;   // keep the pinnacle top clear
          // billows: lit tops toward the sun, blue-grey valleys; the slope comes from the noise gradient
          float e = 0.6, nx = fbm(p + vec2(e * uS * 40.0, 0.0)) - fbm(p - vec2(e * uS * 40.0, 0.0));
          float ny = fbm(p + vec2(0.0, e * uS * 40.0)) - fbm(p - vec2(0.0, e * uS * 40.0));
          float slope = clamp(0.5 - 1.6 * (nx * uSun.x + ny * uSun.z), 0.0, 1.0);
          float top = smoothstep(0.28, 0.78, n);
          vec3 lit = mix(vec3(0.42, 0.44, 0.58), vec3(1.0, 0.86, 0.72), top * (0.55 + 0.45 * slope));
          lit += uSunCol * 0.3 * slope * top * pow(max(dot(normalize(vW - cameraPosition), uSun), 0.0), 3.0);
          vec3 d = vW - cameraPosition; float dist = length(d);
          vec3 c = mix(lit, skyCol(d / dist), 1.0 - exp(-dist * 0.0022));
          float a = uL == 0.0 ? mix(0.82, 1.0, dens) : dens * uA;
          a *= 1.0 - smoothstep(1200.0, 1500.0, length(vW.xz - cameraPosition.xz));
          o = vec4(c * (1.0 - uDim), a);
        }` }));
    m.position.y = y; m.renderOrder = 2 + k; g.add(m);
  }
  return g;
}
// faceted rock with a warm/cool split, fogged into the sky
export function rockMaterial(u, base, top) {
  return new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...u, uBase: { value: new THREE.Color(...base) }, uTop: { value: new THREE.Color(...top) } },
    vertexShader: `${HEAD} uniform mat4 projectionMatrix, viewMatrix, modelMatrix; in vec3 position, normal; in vec2 uv1; out vec3 vW, vN; out float vF;
      uniform float uTime, uLoop;
      void main() { vec3 p = position;
        if (uv1.x > 0.5) p.x += 0.04 * sin(6.2831853 * uTime / uLoop * 7.0 + uv1.y + p.y) * (p.y - 1.0);   // pine needles in the wind
        vW = (modelMatrix * vec4(p, 1.0)).xyz; vN = mat3(modelMatrix) * normal; vF = uv1.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `${HEAD} ${SKY} uniform vec3 uBase, uTop, cameraPosition; uniform float uDim; in vec3 vW, vN; in float vF; out vec4 o;
      void main() {
        vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
        float dif = max(dot(n, uSun), 0.0), hemi = 0.5 + 0.5 * n.y;
        vec3 c = mix(uBase, uTop, smoothstep(0.3, 0.9, n.y));
        c = c * (uSunCol * dif * 1.25 + mix(vec3(0.28, 0.32, 0.45), vec3(0.62, 0.58, 0.6), hemi) * 0.55);
        o = vec4(fogTo(c, vW, cameraPosition) * (1.0 - uDim), 1.0);
      }` });
}

export function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xa9bbd8, 0x6b5a55, 1.1);
  const sun = new THREE.DirectionalLight(0xffc89a, 3.2); sun.position.set(-0.55, 0.16, 0.82).multiplyScalar(50);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1); rim.position.set(0.6, 0.5, -0.8).multiplyScalar(50);
  scene.add(hemi, sun, rim);
  return { hemi, sun, rim };
}
