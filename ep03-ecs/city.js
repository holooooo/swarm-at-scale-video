// EP03 set: a dusk street canyon ending in a concrete wall, plus debug layers (flow field arrows, crowd counts).
import * as THREE from 'three';
import { LV, GW, GH } from './sims/ecs.js';
import { CITY_FOG } from './sims/zombie.js';

const H = /* glsl */`precision highp float;`;
const lit = (fog, color, { windows = 0, stripes = 0, emissive = 0 } = {}) => new THREE.ShaderMaterial({
  uniforms: { ...fog, uC: { value: new THREE.Color(...color) }, uWin: { value: windows }, uStripe: { value: stripes }, uEm: { value: emissive } },
  vertexShader: `varying vec3 vW, vN; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
  fragmentShader: `${H} uniform vec3 uC, uSun, uSunCol, uSky; uniform float uWin, uStripe, uEm; varying vec3 vW, vN; ${CITY_FOG}
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 n = normalize(vN), c = uC;
      c *= 0.88 + 0.12 * hash(floor(vW.xz * 0.5) + floor(vW.y * 0.5));
      if (uWin > 0.0 && abs(n.y) < 0.5) {
        vec2 q = vec2(abs(n.x) > 0.5 ? vW.z : vW.x, vW.y) / vec2(3.2, 3.4); vec2 f = fract(q), id = floor(q);
        float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.85) * step(1.0, id.y);
        float on = step(0.82, hash(id + floor(vW.x * 0.01)));
        c = mix(c, mix(vec3(0.08, 0.09, 0.11), vec3(1.0, 0.72, 0.4) * 1.4, on), win);
      }
      if (uStripe > 0.0) c = mix(c, vec3(0.85, 0.65, 0.1), step(0.5, fract((vW.z + vW.y) * 0.35)) * step(vW.y, 0.9) * step(0.2, vW.y));
      float dif = max(dot(n, uSun), 0.0), hemi = 0.5 + 0.5 * n.y;
      c = c * (uSunCol * dif * 0.85 + uSky * hemi * 0.5 + 0.06) + uC * uEm;
      gl_FragColor = vec4(cityFog(c, vW, cameraPosition), 1.0);
    }` });

export function makeCity(fog) {
  const g = new THREE.Group();
  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({ uniforms: fog, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }`,
    fragmentShader: `${H} uniform vec3 uFogA, uFogB, uSun; varying vec3 vD; void main(){ vec3 d = normalize(vD);
      vec3 c = mix(uFogB, vec3(0.22, 0.24, 0.32), smoothstep(0.0, 0.5, d.y)); c += vec3(1.0, 0.55, 0.25) * pow(max(dot(d, uSun), 0.0), 8.0) * 0.6;
      c = mix(c, uFogA * 0.7, smoothstep(0.0, -0.2, d.y)); gl_FragColor = vec4(c, 1.0); }` }));
  sky.renderOrder = -10; sky.frustumCulled = false; g.add(sky);
  // street
  const road = new THREE.Mesh(new THREE.PlaneGeometry(600, 200).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: fog,
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `${H} uniform vec3 uSunCol, uSky; varying vec3 vW; ${CITY_FOG} float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec3 c = vec3(0.16, 0.16, 0.17) * (0.85 + 0.15 * hash(floor(vW.xz * 2.0)));
        c = mix(c, vec3(0.75, 0.7, 0.55), step(abs(vW.z), 0.12) * step(0.5, fract(vW.x * 0.12)));
        c = mix(c, vec3(0.3, 0.29, 0.28), step(${(LV.z1 - 0.2).toFixed(1)}, abs(vW.z)));
        c *= uSunCol * 0.55 + uSky * 0.45;
        gl_FragColor = vec4(cityFog(c, vW, cameraPosition), 1.0); }` }));
  g.add(road);
  // buildings on both sides
  const R = (i => () => ((i = (i * 16807) % 2147483647) / 2147483647))(7);
  for (const side of [-1, 1]) {
    let x = LV.x0 - 10;
    while (x < LV.x1 + 60) {
      const w = 10 + R() * 14, h = 16 + R() * 34, d = 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lit(fog, [0.42 + R() * 0.1, 0.38 + R() * 0.08, 0.36], { windows: 1 }));
      b.position.set(x + w / 2, h / 2, side * (LV.z1 + d / 2 + 0.2)); g.add(b); x += w + 0.4;
    }
  }
  // the wall + walkway on top
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, LV.wallH, LV.z1 - LV.z0 + 6), lit(fog, [0.52, 0.5, 0.47], { stripes: 1 }));
  wall.position.set(LV.wallX - 1.2, LV.wallH / 2, 0); g.add(wall);
  const top = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, LV.z1 - LV.z0 + 6), lit(fog, [0.4, 0.38, 0.36]));
  top.position.set(LV.wallX - 3, LV.wallH, 0); g.add(top);
  for (let z = LV.z0; z <= LV.z1; z += 3.3) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.15), lit(fog, [0.3, 0.3, 0.3])); p.position.set(LV.wallX - 0.6, LV.wallH + 0.75, z); g.add(p); }
  // floodlights on the wall
  for (const z of [-9, 0, 9]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), lit(fog, [1.0, 0.95, 0.8], { emissive: 2.5 })); l.position.set(LV.wallX - 0.4, LV.wallH + 1.6, z); g.add(l);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 26, 24, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * 0.05 * smoothstep(-13.0, 13.0, vY), 1.0); }` }));
    beam.position.set(LV.wallX + 11, LV.wallH - 3.0, z); beam.rotation.z = Math.PI / 2 + 0.45; g.add(beam);
  }
  // wrecked cars (also obstacles in the flow field)
  for (const [cx, cz, w, d] of LV.cars) {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), lit(fog, [0.32 + R() * 0.3, 0.25, 0.22])); body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.6, d * 0.9), lit(fog, [0.2, 0.2, 0.22])); cab.position.set(-0.2, 1.3, 0);
    c.add(body, cab); c.position.set(cx, 0, cz); c.rotation.y = (R() - 0.5) * 0.3; g.add(c);
  }
  return g;
}

// flow-field arrows (one per 2x2 cells) coloured by distance, drawn on the street
export function makeFlowLayer(flow) {
  const step = 2, pts = [];
  for (let cz = 0; cz < GH; cz += step) for (let cx = 0; cx < GW; cx += step) { const i = cz * GW + cx; if (!flow.wall[i]) pts.push(i); }
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0.75, 0, 0, -0.5, 0, 0.42, -0.25, 0, 0, -0.5, 0, -0.42], 3)); tri.setIndex([0, 1, 2, 0, 2, 3]);
  const g = new THREE.InstancedBufferGeometry(); g.index = tri.index; g.setAttribute('position', tri.attributes.position);
  const inst = new Float32Array(pts.length * 4);
  let maxD = 0; for (const i of pts) maxD = Math.max(maxD, flow.dist[i] < 1e8 ? flow.dist[i] : 0);
  pts.forEach((i, k) => { inst.set([LV.x0 + (i % GW + 0.5) * LV.cell, LV.z0 + (Math.floor(i / GW) + 0.5) * LV.cell, Math.atan2(-flow.dir[i * 2 + 1], flow.dir[i * 2]), flow.dist[i] / maxD], k * 4); });
  g.setAttribute('aI', new THREE.InstancedBufferAttribute(inst, 4)); g.instanceCount = pts.length;
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uA: { value: 1 }, uReveal: { value: 1 } },
    vertexShader: `attribute vec4 aI; uniform float uReveal; varying float vD, vR;
      void main(){ float c = cos(aI.z), s = sin(aI.z); vec3 p = vec3(position.x * c - position.z * s, 0.0, position.x * s + position.z * c) * 1.5;
        vD = aI.w; vR = smoothstep(uReveal - 0.04, uReveal, aI.w); gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(aI.x, 0.06, aI.y), 1.0); }`,
    fragmentShader: `uniform float uA; varying float vD, vR; void main(){ vec3 c = mix(vec3(0.45, 1.0, 0.75), vec3(0.25, 0.5, 1.0), vD); gl_FragColor = vec4(c * 1.2, uA * (1.0 - vR)); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2;
  return mesh;
}
// crowd counts as glowing columns per cell
export function makeCountLayer() {
  const box = new THREE.BoxGeometry(0.86, 1, 0.86); box.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry(); g.index = box.index; g.setAttribute('position', box.attributes.position);
  const inst = new Float32Array(GW * GH * 3); g.setAttribute('aI', new THREE.InstancedBufferAttribute(inst, 3)); g.instanceCount = GW * GH;
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 1 }, uScale: { value: 0.25 } },
    vertexShader: `attribute vec3 aI; uniform float uScale; varying float vC, vY; void main(){ vC = aI.z; vY = position.y; vec3 p = position * vec3(1.0, max(aI.z, 0.0) * uScale + 0.001, 1.0) + vec3(aI.x, 0.0, aI.y); gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); if (aI.z < 0.5) gl_Position = vec4(2.0); }`,
    fragmentShader: `uniform float uA; varying float vC, vY; void main(){ float x = clamp(log(1.0 + vC) / log(40.0), 0.0, 1.0); vec3 c = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.45, 0.2), x); gl_FragColor = vec4(c * (0.25 + 0.5 * vY) * uA, 1.0); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 3;
  mesh.update = cnt => { for (let i = 0; i < GW * GH; i++) { inst[i * 3] = LV.x0 + (i % GW + 0.5) * LV.cell; inst[i * 3 + 1] = LV.z0 + (Math.floor(i / GW) + 0.5) * LV.cell; inst[i * 3 + 2] = cnt[i]; } g.attributes.aI.needsUpdate = true; };
  return mesh;
}
