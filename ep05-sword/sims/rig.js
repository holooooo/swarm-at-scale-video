// EP05 · the Blender characters in three.js: materials, wind flutter after skinning, and poses set by code
// (two-bone IK for the arms, curl angles for the fingers). No baked animation: pose(t) is a pure function of t.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = V3(), _v2 = V3(), _m = new THREE.Matrix4();

export async function loadGLB(url) { return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej)); }

// one toon material for everything she wears: the VRoid parts bring their MToon colours (material.userData,
// written by vroid.py), the scripted robe gets the same look. Lit/shade split like MToon, a cool rim, and the wind
// + flutter from the "Flutter" UV map (uv1 = weight, phase) applied after skinning.
const TOON_VS = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uWT, uWA, uLoop; uniform vec3 uWD;
#ifndef USE_UV1
attribute vec2 uv1;
#endif
varying vec2 vUv; varying vec3 vN, vW;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  { float w = uv1.x, ph = uv1.y, om = 6.2831853 / uLoop;
    float s = sin(uWT * om * 37.0 + ph) * 0.6 + sin(uWT * om * 61.0 + ph * 1.7) * 0.4;
    transformed += (uWD * (0.55 + 0.45 * s) + vec3(0.0, 0.25 * s, 0.0)) * w * w * uWA; }
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const TOON_FS = /* glsl */`
uniform sampler2D map; uniform float uHasMap, uShift, uOpacity, uCut, uToony;
uniform vec3 uCol, uShade, uSunDir, uSunC, uAmb, uRimC;
varying vec2 vUv; varying vec3 vN, vW;
void main() {
  vec4 tx = uHasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
  float a = tx.a * uOpacity;
  if (a < uCut) discard;
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) n = -n;
  float nl = dot(n, uSunDir);
  float lit = smoothstep(uShift - uToony, uShift + uToony, nl);          // MToon: shade shift + toony
  vec3 base = tx.rgb * uCol, shade = tx.rgb * uShade;
  vec3 c = mix(shade * uAmb, base * (uSunC * 0.78 + uAmb * 0.22), lit);
  c += uRimC * pow(1.0 - max(dot(n, v), 0.0), 4.0) * (0.35 + 0.65 * max(0.0, n.y + 0.3));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;
const ROBE = {      // name: [colour, shade, opacity]  (the rival's colours replace these)
  robe: [0xf0f2f7, 0x9ea9c6, 1], trim: [0x9fc8da, 0x5d7fa3, 1], sash: [0xc2e6ee, 0x7fa6c4, 0.8], gauze: [0xe6f0f6, 0xa8bbd4, 0.34], jade: [0x7ee0c0, 0x2f8a78, 1],
};
const RIVAL = { robe: [0x1d1b21, 0x0b0a10, 1], trim: [0xb0181d, 0x5a0a12, 1], sash: [0x8a1016, 0x45060c, 0.85], gauze: [0x4a0d12, 0x22050a, 0.8], jade: [0xc49a48, 0x6a4a20, 1] };
export const LIGHT = { sunDir: new THREE.Vector3(-0.55, 0.42, 0.72).normalize(), sun: new THREE.Color(1.0, 0.9, 0.8), amb: new THREE.Color(0.62, 0.64, 0.78), rim: new THREE.Color(0.55, 0.75, 1.0) };
function toon(src, kind, wind) {
  const d = src.userData || {}, U = v => ({ value: v }), nm = src.name;
  const rb = (kind === 'rival' ? RIVAL : ROBE)[nm];
  const col = rb ? new THREE.Color(rb[0]) : new THREE.Color().setRGB(...(d.col || [1, 1, 1]).slice(0, 3), THREE.SRGBColorSpace);
  const shade = rb ? new THREE.Color(rb[1]) : new THREE.Color().setRGB(...(d.shade || [0.8, 0.8, 0.9]).slice(0, 3), THREE.SRGBColorSpace);
  const blend = rb ? rb[2] < 1 : d.alpha === 'BLEND', mask = d.alpha === 'MASK';
  const m = new THREE.ShaderMaterial({ vertexShader: TOON_VS, fragmentShader: TOON_FS, transparent: blend, depthWrite: !blend,
    side: rb || d.cull === 0 ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: { ...wind, map: U(src.map || null), uHasMap: U(src.map ? 1 : 0), uCol: U(col), uShade: U(shade), uShift: U(rb ? 0.0 : (d.shift ?? -0.5) * 0.6),
      uToony: U(rb ? 0.7 : 0.12), uOpacity: U(rb ? rb[2] : 1), uCut: U(mask ? 0.5 : blend ? 0.01 : -1),
      uSunDir: U(LIGHT.sunDir), uSunC: U(LIGHT.sun), uAmb: U(LIGHT.amb), uRimC: U(LIGHT.rim.clone().multiplyScalar(rb ? 0.25 : 0.18)) } });
  m.name = nm; m.userData.queue = rb ? (blend ? 3100 : 2000) : d.queue ?? 2000;
  return m;
}
export function windUniforms(loop) { return { uWT: { value: 0 }, uWA: { value: 0.07 }, uLoop: { value: loop }, uWD: { value: V3(0.35, 0.05, -1).normalize() } }; }
// the bones a humanoid has (the overlay draws these; hair / bust / eye bones are VRoid's secondary bones)
const isHumanoid = n => !/^(J|Hair|Root)/.test(n) && !/end/.test(n);

export class Character {
  constructor(gltf, kind, wind) {
    this.root = gltf.scene; this.kind = kind;
    this.verts = 0;
    this.root.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; this.verts += o.geometry.attributes.position.count;
      o.material = toon(o.material, kind, wind); o.renderOrder = o.material.userData.queue / 1000;     // MToon render queue
    });
    this.bones = {}; this.root.traverse(o => { if (o.isBone) this.bones[o.name.replace(/[^A-Za-z0-9]/g, '')] = o; });
    this.humanoid = Object.keys(this.bones).filter(isHumanoid);
    this.rest = {}; for (const [k, b] of Object.entries(this.bones)) this.rest[k] = b.quaternion.clone();
    this.root.updateMatrixWorld(true);
    const P = n => this.bones[n].getWorldPosition(V3());
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len[s] = [P('upperarm' + s).distanceTo(P('forearm' + s)), P('forearm' + s).distanceTo(P('hand' + s))];
      // palm normal of the rest pose, stored in hand-local space
      const d = P('middle1' + s).sub(P('hand' + s)).normalize(), ac = P('pinky1' + s).sub(P('index1' + s)).normalize();
      let n = d.clone().cross(ac).normalize(); const toBody = P('chest').sub(P('hand' + s));
      if (n.dot(toBody) < 0) n.negate();
      this.palmLocal = this.palmLocal || {};
      this.palmLocal[s] = n.applyQuaternion(this.bones['hand' + s].getWorldQuaternion(_q).invert());
    }
  }
  bone(n) { return this.bones[n]; }
  resetPose() { for (const [k, b] of Object.entries(this.bones)) b.quaternion.copy(this.rest[k]); this.root.updateMatrixWorld(true); }
  // rotate a bone by a world-space rotation q, keeping its parent
  rotWorld(b, q) {
    const pw = b.parent.getWorldQuaternion(_q2), bw = b.getWorldQuaternion(_q);
    b.quaternion.copy(pw.clone().invert().multiply(q.clone().multiply(bw)));
    b.updateMatrixWorld(true);
  }
  // turn bone b so the direction head -> child head points along dir (world)
  aim(b, childName, dir) {
    const h = b.getWorldPosition(V3()), c = this.bones[childName].getWorldPosition(V3());
    const cur = c.sub(h).normalize(); this.rotWorld(b, new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()));
  }
  //#region ik
  // two-bone IK: shoulder, elbow, wrist. The pole says which way the elbow points.
  armIK(s, target, pole) {
    const ua = this.bones['upperarm' + s], fa = this.bones['forearm' + s], [l1, l2] = this.len[s];
    const S = ua.getWorldPosition(V3()), d = target.clone().sub(S), dist = Math.min(d.length(), (l1 + l2) * 0.999); d.normalize();
    const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);       // law of cosines
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a * l1 * l1));
    const side = pole.clone().sub(S); side.addScaledVector(d, -side.dot(d)).normalize();
    const elbow = S.clone().addScaledVector(d, a * l1).addScaledVector(side, h);
    this.aim(ua, 'forearm' + s, elbow.clone().sub(S));
    this.aim(fa, 'hand' + s, S.clone().addScaledVector(d, dist).sub(fa.getWorldPosition(V3())));
    return elbow;
  }
  //#endregion
  // point the hand along fwd, then twist it about fwd until its palm faces palmDir
  handOrient(s, fwd, palmDir) {
    const hb = this.bones['hand' + s];
    this.aim(hb, 'middle1' + s, fwd);
    const f = fwd.clone().normalize(), cur = this.palmLocal[s].clone().applyQuaternion(hb.getWorldQuaternion(_q));
    const a = cur.addScaledVector(f, -cur.dot(f)).normalize(), b = palmDir.clone().addScaledVector(f, -palmDir.dot(f)).normalize();
    const ang = Math.atan2(a.clone().cross(b).dot(f), a.dot(b));
    this.rotWorld(hb, new THREE.Quaternion().setFromAxisAngle(f, ang));
  }
  // finger curls in radians: { index, middle, ring, pinky, thumb }; three joints per finger
  fingers(s, c) {
    const hb = this.bones['hand' + s], palm = this.palmLocal[s].clone().applyQuaternion(hb.getWorldQuaternion(_q));
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      // the hinge axis (finger direction x palm normal) doesn't move when the finger turns about it
      const b1 = this.bones[f + '1' + s], b2 = this.bones[f + '2' + s], b3 = this.bones[f + '3' + s];
      const dir = b2.getWorldPosition(V3()).sub(b1.getWorldPosition(V3())).normalize(), axis = dir.cross(palm).normalize();
      this.rotWorld(b1, new THREE.Quaternion().setFromAxisAngle(axis, -(c[f] ?? 0) * 0.8));
      this.rotWorld(b2, new THREE.Quaternion().setFromAxisAngle(axis, -(c[f] ?? 0) * 0.9));
      if (b3) this.rotWorld(b3, new THREE.Quaternion().setFromAxisAngle(axis, -(c[f] ?? 0) * 0.6));
    }
    const t1 = this.bones['thumb1' + s], t2 = this.bones['thumb2' + s];
    if (c.thumb) {
      const tgt = this.bones['ring1' + s].getWorldPosition(V3()).addScaledVector(palm, 0.025).lerp(this.bones['middle1' + s].getWorldPosition(V3()), 0.3);
      const h = t1.getWorldPosition(V3()), cur = t2.getWorldPosition(V3()).sub(h).normalize(), want = tgt.clone().sub(h).normalize();
      this.rotWorld(t1, new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(cur, want), c.thumb));
    }
  }
  twist(n, axis, ang) { this.rotWorld(this.bones[n], new THREE.Quaternion().setFromAxisAngle(axis, ang)); }
  worldPos(n, o = V3()) { return this.bones[n].getWorldPosition(o); }
}
export const GESTURE = {
  jianzhi: { index: 0.05, middle: 0.05, ring: 1.45, pinky: 1.5, thumb: 1 },     // 剑指: two fingers out, the rest held by the thumb
  fist: { index: 1.5, middle: 1.55, ring: 1.55, pinky: 1.55, thumb: 0.8 },
  open: { index: 0.05, middle: 0.0, ring: 0.05, pinky: 0.1, thumb: 0 },
  relax: { index: 0.35, middle: 0.4, ring: 0.45, pinky: 0.5, thumb: 0.2 },
};
export const mixG = (a, b, k) => Object.fromEntries(Object.keys(a).map(f => [f, a[f] + (b[f] - a[f]) * k]));
