import * as THREE from 'three';

const slider=(key,label,min,max,step,value)=>({key,label,min,max,step,value});
const view=(label,position,target,fov=45)=>({label,position,target,fov});
export async function createScene(id, renderer, mobile) {
  if(id==='01') return boids(mobile);
  if(id==='02') return fish(renderer,mobile);
  if(id==='03') return city(mobile);
  if(id==='04') return space(mobile);
  if(id==='05') return sword(mobile);
  throw new Error('未知互动场景');
}
async function boids(mobile){
  const {Boids2D}=await import('../core/sims/boids2d.js');
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#0b171d');
  const p={ws:1.5,wa:1,wc:1}, count=mobile?320:640; let mode='grid';
  const sim=new Boids2D({n:count,seed:7,bounds:[-800,-450,800,450],params:()=>({...p,mode:'grid',topo:mode==='topo',k:7, jitter:mode==='noise'?2.5:0})});
  const geometry=new THREE.ConeGeometry(4,14,3); geometry.rotateZ(-Math.PI/2);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:'#a5e2e2'}),count); mesh.frustumCulled=false; scene.add(mesh);
  const grid=new THREE.GridHelper(1600,20,0x2b5159,0x17323b); grid.rotation.x=Math.PI/2; grid.position.z=-4;scene.add(grid);
  const dummy=new THREE.Object3D();
  const sync=()=>{for(let i=0;i<count;i++){dummy.position.set(sim.x[i],sim.y[i],0);dummy.rotation.set(0,0,Math.atan2(sim.vy[i],sim.vx[i]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.instanceMatrix.needsUpdate=true;};
  sync();
  return {scene,title:'局部规则，涌现秩序',note:'原 Boids2D · 在平面上模拟，在三维中观察。调节分离、对齐、凝聚，比较群体结构。',
    stages:[{label:'距离邻域',key:'grid'},{label:'最近七邻居',key:'topo'},{label:'扰动群集',key:'noise'}],
    controls:[slider('ws','分离力',0,3,0.1,1.5),slider('wa','对齐力',0,3,0.1,1),slider('wc','凝聚力',0,3,0.1,1)],
    views:[view('全局',[0,0,1500],[0,0,0]),view('倾斜',[900,-700,1000],[0,0,0]),view('近看',[0,0,500],[0,0,0])],
    select(key){mode=key;sim.reset();sync();},set(key,v){p[key]=v;},reset(){sim.reset();sync();},step(){sim.advanceTo(sim.stepN+1);sync();},stats(){return `${count} 个体 · ${sim.checks.toLocaleString()} 次邻域检查`;}};
}
async function fish(renderer,mobile){
  if(!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('鱼群模拟需要 WebGL2 浮点颜色缓冲。请使用支持此扩展的浏览器与显卡。');
  const [{GpuFlock},{makeSchool,makeSolo,seaUniforms},{makeSea}]=await Promise.all([import('../core/sims/gpuflock.js'),import('../ep02-abzu/sims/fish.js'),import('../ep02-abzu/sea.js')]);
  const sea=seaUniforms(),scene=new THREE.Scene();scene.add(makeSea(sea));
  const p={swirl:1.4,wa:1.8},tex=mobile?32:64;let elapsed=0;
  const flock=new GpuFlock(renderer,{tex,G:24,L:80,seed:5,phaseBase:4,phaseK:2.6,center:()=>[0,14,0],radii:[9,13,9],init:()=>({p:[0,14,0],spread:[10,12,10],v:[2,0,0]}),params:()=>({maxS:3.4,minS:2,maxF:5,rho0:70,swirl:p.swirl,wa:p.wa,wb:1.4,noiseW:0.6,flatten:0.3})});
  const kinds=['jack','sardine','fusilier']; const schools=kinds.map(k=>{const s=makeSchool(k,flock,sea);scene.add(s);return s;});
  const shark=makeSolo('shark',sea);scene.add(shark);shark.visible=false;
  const select=key=>{schools.forEach((s,i)=>s.visible=kinds[i]===key);shark.visible=key==='predator';if(shark.visible)schools[0].visible=true;flock.o.predator=shark.visible?t=>({p:[12*Math.cos(t*.45),14,12*Math.sin(t*.45)],r:9,s:12}):null;};select('jack');
  return {scene,title:'潜入鱼群内部',note:'原 GPU 纹理求解 + 原鱼体着色器。场景切换鱼种或捕食者；旋流与对齐会改变真实速度场。',
    stages:[{key:'jack',label:'大眼鲹'},{key:'sardine',label:'沙丁鱼'},{key:'fusilier',label:'黄尾梅鲷'},{key:'predator',label:'鲨鱼扰动'}],
    controls:[slider('swirl','旋流强度',0,3,0.1,1.4),slider('wa','群体对齐',0,3,0.1,1.8)],
    views:[view('鱼群全景',[30,10,32],[0,14,0]),view('群体内部',[0,14,5],[0,14,0],65),view('侧面',[23,14,0],[0,14,0])],
    select,set(key,v){p[key]=v;},reset(){elapsed=0;sea.uTime.value=0;flock.reset();},step(){elapsed+=1/60;sea.uTime.value=elapsed;flock.step();const u=shark.material.uniforms;u.soloPos.value.set(12*Math.cos(elapsed*.45),14,12*Math.sin(elapsed*.45));u.soloFwd.value.set(-Math.sin(elapsed*.45),0,Math.cos(elapsed*.45));u.soloPhase.value=elapsed*9;},stats(){return `${flock.N.toLocaleString()} 尾鱼 · GPU 空间网格`;}};
}
async function city(mobile){
  const [{Horde,setPress},{HordeView,fogUniforms},{makeCity,makeFlowLayer}]=await Promise.all([import('../ep03-ecs/sims/ecs.js'),import('../ep03-ecs/sims/zombie.js'),import('../ep03-ecs/city.js')]);
  const fog=fogUniforms(),scene=new THREE.Scene();scene.add(makeCity(fog));const h=new Horde(mobile?2048:4096,{perSec:180}),v=new HordeView(h,fog);scene.add(v.mesh);
  const stages=[{key:'arrival',label:'接近城墙',time:18},{key:'wall',label:'堆叠攀墙',time:55},{key:'flow',label:'街道流场',time:25}];
  let flow;try{flow=makeFlowLayer(h.flow);scene.add(flow);flow.visible=false;}catch{}
  return {scene,title:'实体、组件与系统',note:'原 Horde ECS 与实例化角色。改变生成速率和拥挤压力，观察绕障、堆叠与越墙。',stages,
    controls:[slider('pressure','拥挤压力',0.2,4,0.1,1.8),slider('spawn','每秒生成',30,320,10,180)],
    views:[view('城墙',[34,13,24],[2,5,0]),view('街道',[115,55,70],[85,0,0]),view('俯视',[58,125,.1],[58,0,0],55)],
    select(key){h.reset();h.snaps.clear();if(flow)flow.visible=key==='flow';return stages.find(s=>s.key===key).time;},
    set(key,x){if(key==='pressure')setPress(x);if(key==='spawn')h.o.perSec=x;h.snaps.clear();},
    reset(){h.reset();h.snaps.clear();v.sync();},step(){h.step();v.sync();},stats(){return `${h.w.n.toLocaleString()} 实体 · ${h.crossed.toLocaleString()} 次越墙`;}};
}
async function space(mobile){
  const {SYS,spaceUniforms,makeStar,makePlanet,makePanels,makeSwarm,makeShell}=await import('../ep04-dyson/sims/space.js');
  const u=spaceUniforms(),scene=new THREE.Scene(),panels=makePanels(u,mobile?8192:32768),swarm=makeSwarm(u),shell=makeShell(u);
  const cap=mobile?32768:131072;swarm.geometry.instanceCount=cap;u.uSailCount.value=cap;scene.add(makeStar(u),makePlanet(u),panels,swarm,shell);let elapsed=0,orbit=1;
  const select=key=>{panels.visible=key==='panels'||key==='all';swarm.visible=key==='swarm'||key==='all';shell.visible=key==='shell';};select('all');
  return {scene,title:'从一片帆，到恒星尺度',note:'原轨道与太阳帆着色器。移动相机探索行星、帆群与球壳；互动版限制实例数以保留操作余量。',
    stages:[{key:'all',label:'行星与帆群'},{key:'panels',label:'行星阵列'},{key:'swarm',label:'恒星帆群'},{key:'shell',label:'球壳结构'}],
    controls:[slider('orbit','轨道速率',0,4,0.1,1),slider('glow','太阳帆辉光',0,2,0.1,1)],
    views:[view('恒星系统',[300,300,1000],[230,0,-40],55),view('行星',[470,45,30],SYS.planetPos.toArray()),view('帆群',[250,130,420],[0,0,0],60)],
    select,set(key,v){if(key==='orbit')orbit=v;if(key==='glow')u.uSailGlow.value=v;},reset(){elapsed=0;u.uTime.value=0;u.uSpin.value=0;u.uOrbitT.value=0;},step(){elapsed+=1/60;u.uTime.value=elapsed;u.uSpin.value=elapsed*.1;u.uOrbitT.value+=orbit*.5;},stats(){return `${cap.toLocaleString()} 太阳帆 · 原实例化轨道`;}};
}
async function sword(mobile){
  const {buildWorld,updateWorld,T}=await import('../ep05-sword/sims/scene.js');
  const W=await buildWorld(T.rest+18),p={roleTint:0,trail:mobile?.5:1};let t=0;
  const stages=[{key:'seal',label:'剑指与本命剑',time:Math.max(0,T.rise0-2),end:T.rise0+8,view:0},
    {key:'rise',label:'万剑起势',time:T.rise0+8,end:T.form-.2,view:1},
    {key:'form',label:'剑阵成形',time:T.form+.3,end:T.roles-.2,view:1},
    {key:'roles',label:'攻守分工',time:T.roles+3,end:T.climax-.2,view:2},
    {key:'break',label:'剑河破阵',time:T.climax+1,end:T.recall-.2,view:2},
    {key:'recall',label:'收剑归鞘',time:T.recall+.5,end:T.rest+4,view:1}].filter(s=>Number.isFinite(s.time)&&s.end>s.time);
  updateWorld(W,0,p);
  return {scene:W.scene,title:'御剑：进入真实剑阵',note:'原角色 GLB、山峰、16,000 飞剑与碰撞求解。阶段由当前 schedule 动态读取；只在选定阶段内模拟，绝不自动播放影片。',stages,heavy:true,
    controls:[slider('roleTint','攻守角色着色',0,1,0.1,0),slider('trail','剑轨迹亮度',0,1.5,0.1,p.trail)],
    views:[view('人物与剑指',[-.6,1.5,2.7],[0,1.3,.2],38),view('山巅全景',[38,25,-58],[0,17,10],55),view('双阵交锋',[-36,35,16],[0,14,44],60)],
    select(key){W.sim.reset();W.sim.snaps.clear();t=0;return stages.find(s=>s.key===key).time;},set(key,x){p[key]=x;updateWorld(W,t,p);},
    reset(){W.sim.reset();W.sim.snaps.clear();t=0;updateWorld(W,t,p);},
    warmStep(){W.sim.step();W.sim.record();t=W.sim.stepN/60;},sync(){t=W.sim.stepN/60;updateWorld(W,t,p);},
    step(){W.sim.step();W.sim.record();t=W.sim.stepN/60;updateWorld(W,t,p);},
    stats(){return `16,000 飞剑 · ${W.sim.lastChecks.toLocaleString()} 次局部检查`;}};
}
