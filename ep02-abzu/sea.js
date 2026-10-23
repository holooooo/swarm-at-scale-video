// Stylized underwater set: sea-color dome, caustic sand floor, light shafts, swaying kelp, coral, marine snow.
// Everything is a function of uTime only (deterministic for frame capture).
import * as THREE from 'three';
import { SEA_GLSL } from './sims/fish.js';
import { rng } from '../core/sims/boids2d.js';

const H = /* glsl */`precision highp float;`;

export function makeSea(sea, { floorY = 0, kelp = 40, coral = 26, seed = 3 } = {}) {
  const g = new THREE.Group();
  // dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), new THREE.ShaderMaterial({
    uniforms: sea, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }`,
    fragmentShader: `${H} varying vec3 vD; ${SEA_GLSL} void main(){ gl_FragColor = vec4(seaCol(normalize(vD)), 1.0); }`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; g.add(dome);

  // sand floor with dunes, ripples and caustics
  const fg = new THREE.PlaneGeometry(900, 900, 220, 220); fg.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(fg, new THREE.ShaderMaterial({
    uniforms: { ...sea, uFloorY: { value: floorY }, uCaus: { value: 1 } },
    vertexShader: `uniform float uFloorY; varying vec3 vW;
      float dune(vec2 p) { return sin(p.x * 0.031 + sin(p.y * 0.017) * 2.0) * 2.2 + sin(p.y * 0.043 + p.x * 0.011) * 1.4 + sin(p.x * 0.11 + p.y * 0.07) * 0.35; }
      void main(){ vec3 p = position; p.y = uFloorY + dune(p.xz); vW = (modelMatrix * vec4(p, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `${H} uniform float uCaus; varying vec3 vW; ${SEA_GLSL}
      float caus(vec2 p, float t) {
        float c = 0.0;
        for (int i = 0; i < 3; i++) { float fi = float(i); vec2 q = p * (0.35 + fi * 0.21) + vec2(sin(t * 0.4 + fi), cos(t * 0.33 + fi * 2.0)) * 2.0;
          c += pow(abs(sin(q.x + sin(q.y * 1.3 + t * 0.7)) * sin(q.y + sin(q.x * 1.1 - t * 0.6))), 0.35); }
        return pow(1.0 - c / 3.0, 5.0);
      }
      void main(){
        vec3 sand = mix(vec3(0.86, 0.62, 0.58), vec3(0.96, 0.78, 0.66), 0.5 + 0.5 * sin(vW.x * 0.05 + sin(vW.z * 0.04)));
        sand *= 0.94 + 0.06 * sin(vW.x * 0.9 + sin(vW.z * 0.45) * 2.0) * smoothstep(60.0, 10.0, length(vW.xz - cameraPosition.xz));
        vec3 c = sand * 0.78 + vec3(0.85, 1.0, 1.0) * caus(vW.xz * 0.6, uTime) * 0.9 * uCaus;
        gl_FragColor = vec4(fogTo(c, vW, cameraPosition, 0.012), 1.0);
      }`,
  }));
  g.add(floor);

  const R = rng(seed);
  // light shafts: tall additive quads hanging from the surface
  const shafts = new THREE.Group();
  const sm = new THREE.ShaderMaterial({ uniforms: { ...sea }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `${H} uniform float uTime; varying vec2 vUv; varying vec3 vW;
      void main(){ float a = sin(vUv.x * 3.14159) * pow(vUv.y, 1.6) * (0.6 + 0.4 * sin(uTime * 0.5 + vW.x * 0.05));
        float d = length(vW - cameraPosition); a *= smoothstep(8.0, 40.0, d) * exp(-d * 0.006);
        gl_FragColor = vec4(vec3(0.55, 0.95, 0.95) * a * 0.10, 1.0); }` });
  for (let i = 0; i < 26; i++) {
    const w = 6 + R() * 14, h = 140, q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sm);
    q.position.set((R() - 0.5) * 260, floorY + h / 2 - 8, (R() - 0.5) * 260);
    q.rotation.set(0.1 * (R() - 0.5), R() * Math.PI, 0.18 + 0.1 * R());
    q.userData.spin = (R() - 0.5) * 0.05; shafts.add(q);
  }
  g.add(shafts);

  // kelp: ribbons that sway with height
  const kg = new THREE.PlaneGeometry(0.9, 1, 1, 24); kg.translate(0, 0.5, 0);
  const kGeo = new THREE.InstancedBufferGeometry(); kGeo.index = kg.index; kGeo.setAttribute('position', kg.attributes.position); kGeo.setAttribute('uv', kg.attributes.uv);
  const kp = new Float32Array(kelp * 4);
  for (let i = 0; i < kelp; i++) {
    const cl = Math.floor(i / 8), a = cl * 2.4 + 1, r = 55 + cl * 18;
    kp.set([Math.cos(a) * r + (R() - 0.5) * 14, Math.sin(a) * r + (R() - 0.5) * 14, 18 + R() * 30, R() * 6.28], i * 4);
  }
  kGeo.setAttribute('aK', new THREE.InstancedBufferAttribute(kp, 4)); kGeo.instanceCount = kelp;
  const kelpM = new THREE.Mesh(kGeo, new THREE.ShaderMaterial({ uniforms: { ...sea, uFloorY: { value: floorY } }, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime, uFloorY; attribute vec4 aK; varying vec3 vW; varying vec2 vUv;
      void main(){ float h = position.y; vec3 p = vec3(aK.x, uFloorY - 0.5 + h * aK.z, aK.y);
        float sway = sin(uTime * 0.6 + aK.w + h * 2.5) * 2.2 * h * h + sin(uTime * 1.3 + aK.w * 3.0 + h * 6.0) * 0.4 * h;
        p.x += sway + position.x * cos(aK.w) * (1.0 - h * 0.3); p.z += sway * 0.4 + position.x * sin(aK.w);
        vW = p; vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `${H} varying vec3 vW; varying vec2 vUv; ${SEA_GLSL}
      void main(){ vec3 c = mix(vec3(0.16, 0.42, 0.14), vec3(0.62, 0.78, 0.25), vUv.y) * (0.75 + 0.25 * sin(vUv.y * 60.0));
        gl_FragColor = vec4(fogTo(c, vW, cameraPosition, 0.012), 1.0); }` }));
  kelpM.frustumCulled = false; g.add(kelpM);

  // coral / rocks: lumpy flat-shaded blobs
  const cols = [[0.95, 0.45, 0.5], [0.98, 0.7, 0.35], [0.55, 0.35, 0.75], [0.3, 0.75, 0.7], [0.62, 0.55, 0.5]];
  for (let i = 0; i < coral; i++) {
    const geo = new THREE.IcosahedronGeometry(1, 4), p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(p, k), f = 1 + 0.28 * Math.sin(v.x * 5 + i) * Math.sin(v.y * 4 + i * 2) * Math.sin(v.z * 6); p.setXYZ(k, v.x * f, v.y * f * 0.7, v.z * f); }
    geo.computeVertexNormals();
    const c = cols[i % cols.length];
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { ...sea, uC: { value: new THREE.Color(...c) } },
      vertexShader: `varying vec3 vW, vN; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: `${H} uniform vec3 uC; varying vec3 vW, vN; ${SEA_GLSL}
        void main(){ vec3 n = normalize(vN); vec3 c = uC * (0.45 + 0.55 * max(dot(n, uSun), 0.0)) + uC * 0.25 * pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 2.0);
          gl_FragColor = vec4(fogTo(c, vW, cameraPosition, 0.012), 1.0); }` }));
    const a = R() * 6.28, r = 30 + R() * 110, s = 2 + R() * 6;
    m.position.set(Math.cos(a) * r, floorY + s * 0.2, Math.sin(a) * r); m.scale.setScalar(s); m.rotation.y = R() * 6;
    g.add(m);
  }

  // marine snow: points wrapped in a box that follows the camera
  const N = 3500, sp = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) sp[i] = R();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: { ...sea, uBox: { value: 70 }, uCam: { value: new THREE.Vector3() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime, uBox; uniform vec3 uCam; varying float vA;
      void main(){ vec3 p = position * uBox + vec3(sin(uTime * 0.2 + position.y * 9.0), -uTime * 0.25, cos(uTime * 0.17 + position.x * 7.0)) ;
        p = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        vec4 mv = viewMatrix * vec4(p, 1.0); float d = -mv.z; vA = smoothstep(uBox * 0.5, 2.0, d) * smoothstep(0.5, 2.0, d);
        gl_PointSize = clamp(90.0 / d, 1.0, 6.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${H} varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; gl_FragColor = vec4(vec3(0.7, 0.95, 1.0) * (1.0 - r) * vA * 0.45, 1.0); }` }));
  snow.frustumCulled = false; snow.onBeforeRender = (r, s, cam) => snow.material.uniforms.uCam.value.copy(cam.position);
  g.add(snow);
  g.userData = { floor, shafts, kelp: kelpM, snow, dome };
  g.update = t => { for (const q of shafts.children) q.rotation.y += 0; };
  return g;
}
