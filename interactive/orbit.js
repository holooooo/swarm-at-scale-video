import * as THREE from 'three';

// Local, dependency-free orbit control. Camera stays live when simulation is paused.
export class OrbitCamera {
  constructor(camera, element) {
    this.camera = camera; this.element = element; this.target = new THREE.Vector3();
    this.min = 0.15; this.max = 8000; this.points = new Map();
    this.spherical = new THREE.Spherical(); this.offset = new THREE.Vector3();
    element.style.touchAction = 'none';
    element.addEventListener('contextmenu', e => e.preventDefault());
    element.addEventListener('pointerdown', e => { element.focus({preventScroll:true}); element.setPointerCapture(e.pointerId); this.points.set(e.pointerId, {x:e.clientX,y:e.clientY}); });
    element.addEventListener('pointermove', e => {
      const prev = this.points.get(e.pointerId); if (!prev) return;
      const before = [...this.points.values()].map(p => ({...p}));
      const dx = e.clientX-prev.x, dy = e.clientY-prev.y;
      this.points.set(e.pointerId, {x:e.clientX,y:e.clientY});
      if (this.points.size === 2) {
        const after = [...this.points.values()];
        const distance = a => Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        this.zoom(distance(before) / Math.max(1,distance(after)));
        this.pan((after[0].x+after[1].x-before[0].x-before[1].x)/2,(after[0].y+after[1].y-before[0].y-before[1].y)/2);
      } else if (e.buttons === 2 || e.shiftKey) this.pan(dx,dy);
      else { this.spherical.theta -= dx * 0.006; this.spherical.phi -= dy * 0.006; }
      this.update();
    });
    for (const name of ['pointerup','pointercancel','lostpointercapture']) element.addEventListener(name, e => this.points.delete(e.pointerId));
    element.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(Math.max(-120,Math.min(120,e.deltaY))*0.002)); this.update(); }, {passive:false});
    element.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_'].includes(e.key)) return;
      e.preventDefault();
      if (e.key==='ArrowLeft') this.spherical.theta-=0.1;
      if (e.key==='ArrowRight') this.spherical.theta+=0.1;
      if (e.key==='ArrowUp') this.spherical.phi-=0.1;
      if (e.key==='ArrowDown') this.spherical.phi+=0.1;
      if (['+','='].includes(e.key)) this.zoom(0.9);
      if (['-','_'].includes(e.key)) this.zoom(1.1);
      this.update();
    });
  }
  set(position, target, fov=45) {
    this.camera.up.set(0,1,0); this.camera.position.set(...position); this.target.set(...target);
    this.camera.fov=fov; this.camera.updateProjectionMatrix();
    this.spherical.setFromVector3(this.offset.copy(this.camera.position).sub(this.target)); this.update();
  }
  zoom(factor) { this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius*factor,this.min,this.max); }
  pan(dx,dy) {
    const scale=2*this.spherical.radius*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,this.element.clientHeight);
    const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrix,0);
    const up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrix,1);
    this.target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);
  }
  update() {
    this.spherical.phi=THREE.MathUtils.clamp(this.spherical.phi,0.015,Math.PI-0.015);
    this.spherical.radius=THREE.MathUtils.clamp(this.spherical.radius,this.min,this.max);
    this.camera.position.copy(this.target).add(this.offset.setFromSpherical(this.spherical));
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }
}
