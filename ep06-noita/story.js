// EP06 · Noita-inspired pixel experiments. Teaching reconstruction, not game source.
// Every image is a function of t: scene-local fixed-seed demos rewind themselves at 60 Hz.
import { TL, S, E, L, LE, clamp, ease, ease2, lerp, ramp, win, sceneAt, loadSource } from '../core/film.js';
import { MAT } from './sims/sandbox.js';
import { createDemo } from './sims/scenarios.js';
import { drawPixels } from './sims/draw.js';

const W = 1920, H = 1080, END = TL.duration;
const ctx = document.querySelector('#c2d').getContext('2d');
const loopSurface = document.createElement('canvas');
loopSurface.width=W; loopSurface.height=H;
const loopCtx=loopSurface.getContext('2d');
const GOLD = '#edc16c', CYAN = '#64dfe9', FIRE = '#ff8959', DIM = '#869da6';
const LAB = { x:48, y:248, w:1056, h:594 };
const SOURCE = 'Petri Purho · GDC 2019 · Exploring the Tech and Design of Noita · Vault 1025695';
const brand = ['万象成群 · 06 / NOITA', 'SWARMS AT SCALE · A SINGLE SPARK'];
const demos = new Map();
const events = TL.scenes.slice(1).map(s => ({ t:s.start, wipe:0.65 }));
function demo(key, name, seconds, options = {}) {
  if (!demos.has(key)) demos.set(key, createDemo(name, { seed:6, ...options }));
  const d = demos.get(key);
  d.advanceTo(Math.max(0, seconds));
  return d.sim;
}
function text(s, x, y, size = 18, color = DIM, align = 'left', mono = false) {
  ctx.fillStyle = color;
  ctx.font = `${mono ? '500' : '600'} ${size}px ${mono ? '"SF Mono", Menlo, monospace' : '"PingFang SC", sans-serif'}`;
  ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = 'left';
}
function line(x1, y1, x2, y2, color, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}
function arrow(x1,y1,x2,y2,color,alpha=1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  const a = Math.atan2(y2-y1,x2-x1), r=10;
  line(x1,y1,x2,y2,color,2.5);
  line(x2,y2,x2-r*Math.cos(a-.55),y2-r*Math.sin(a-.55),color,2.5);
  line(x2,y2,x2-r*Math.cos(a+.55),y2-r*Math.sin(a+.55),color,2.5);
  ctx.restore();
}
function background(t = 0) {
  ctx.fillStyle = '#070c10'; ctx.fillRect(0,0,W,H);
  const g = ctx.createRadialGradient(620,440,10,620,440,1050);
  g.addColorStop(0,'#142229'); g.addColorStop(1,'#070c10');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // Sparse dust is scenic atmosphere; all physical materials come from drawPixels.
  for(let i=0;i<38;i++) {
    const x=(i*317.7+Math.sin(t*.09+i)*12)%W;
    const y=(i*173.3+Math.cos(t*.07+i*2)*8)%900;
    ctx.fillStyle=`rgba(123,153,161,${.05+(i%3)*.02})`; ctx.fillRect(x,y,2,2);
  }
}
function vignette() {
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#03070bb3'); g.addColorStop(.16,'#03070b00');
  g.addColorStop(.70,'#03070b00'); g.addColorStop(.89,'#03070b80'); g.addColorStop(1,'#03070bf5');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
function viewport(sim, box, crop = null, opts = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(box.x,box.y,box.w,box.h); ctx.clip();
  ctx.imageSmoothingEnabled=false;
  if(crop) {
    const scale=box.w/crop.w;
    drawPixels(ctx,sim,box.x-crop.x*scale,box.y-crop.y*scale,sim.width*scale,sim.height*scale,opts);
  } else drawPixels(ctx,sim,box.x,box.y,box.w,box.h,opts);
  ctx.restore();
}
function border(box, color='#38505b') {
  ctx.strokeStyle=color; ctx.lineWidth=1;
  ctx.strokeRect(box.x-.5,box.y-.5,box.w+1,box.h+1);
  for(const [x,y,sx,sy] of [[box.x,box.y,1,1],[box.x+box.w,box.y,-1,1],[box.x,box.y+box.h,1,-1],[box.x+box.w,box.y+box.h,-1,-1]]) {
    line(x,y,x+18*sx,y,'#75939e',2); line(x,y,x,y+18*sy,'#75939e',2);
  }
}
function labHeader(left,right) {
  text(left,48,211,16,'#c6d6db'); text(right,1104,211,11,DIM,'right',true);
  line(48,225,1104,225,'#2b4049',1);
}
function legend(y=884) {
  const entries=[[MAT.SAND,'沙 / SAND',GOLD],[MAT.WATER,'水 / WATER',CYAN],[MAT.OIL,'油 / OIL','#ae8d4d'],[MAT.FIRE,'火 / FIRE',FIRE],[MAT.SMOKE,'烟 / SMOKE','#8e95a6']];
  entries.forEach((a,i)=>{
    const x=48+i*211; ctx.fillStyle=a[2]; ctx.fillRect(x,y-10,9,9); text(a[1],x+18,y,12,DIM,'left',true);
  });
}
function metrics(sim) {
  return {head:'本演示 · 每步访问 / VISITS PER STEP',rows:[
    {k:'访问格子 / visited',v:sim.stats.visited.toLocaleString('en-US'),c:'hot'},
    {k:'活跃块 / active chunks',v:`${sim.stats.activeChunks} / ${sim.stats.totalChunks}`,c:'good'},
    {k:'模拟步 / fixed tick',v:String(sim.tick)}
  ]};
}
function panel(id,step,zh,en,desc,region,hl,t,color=GOLD) {
  return {step,zh,en,color,opacity:ease(ramp(t,S(id),S(id)+.55)),
    dots:{n:5,cur:['grid','sand','water','fire','chunks'].indexOf(id),frac:ramp(t,S(id),E(id))},desc,
    code:region ? {src:'sandbox',region,file:'sims/sandbox.js',lang:'JavaScript · live source',since:S(id)+.15,hl}:null};
}
function outBase(t) {
  const o = Math.min(ease(ramp(t,.05,1.15)),1-ease(ramp(t,END-2.6,END-1.1)));
  return {brand:o,progress:o,subsFull:true,subsBox:true,labels:[],cards:[],panel:null,params:null,chip:null,
    credit:{k:'INSPIRED BY',text:SOURCE,o},title:null};
}
function caveCamera(sim, zoom, target={x:203,y:110}) {
  const cw=sim.width/zoom, ch=sim.height/zoom;
  const x=clamp(target.x-cw*.5,0,sim.width-cw),y=clamp(target.y-ch*.5,0,sim.height-ch);
  viewport(sim,{x:0,y:0,w:W,h:H},{x,y,w:cw},{glow:true});
}
function opening(t) {
  background(t);
  const sim=demo('intro','hero',t);
  const k=ease2(ramp(t,.9,5.0));
  caveCamera(sim,lerp(3.2,1,k)); vignette();
  return sim;
}
function intro(t,out) {
  opening(t);
  out.chip={zh:'教学重演 · 实际像素模拟',en:'EDUCATIONAL RECONSTRUCTION',opacity:out.brand};
  const a=win(t,L('intro',2)-.25,E('intro'),.6,.6);
  out.title={k:'EP06 / THE ACCIDENT LAB',h:'一粒火星',e:'NOITA · A SINGLE SPARK',size:78,top:644,opacity:a};
}
function findCell(sim, material, predicate=()=>true, target=[.5,.45]) {
  let best=null,dist=Infinity;
  for(let y=2;y<sim.height-2;y++) for(let x=2;x<sim.width-2;x++) {
    const i=y*sim.width+x;
    if(sim.cells[i]!==material || !predicate(x,y,i)) continue;
    const d=(x/sim.width-target[0])**2+(y/sim.height-target[1])**2;
    if(d<dist) {dist=d;best={x,y,i};}
  }
  return best;
}
function microscope(t,out) {
  const age=t-S('grid'), sim=demo('grid','hero',.52+age*.22,{events:false});
  labHeader('01 / 从洞穴到格子','0.22× TIME · ONE CELL / ONE MATERIAL');
  const p=findCell(sim,MAT.OIL,()=>true,[.65,.72]) || {x:203,y:130};
  const k=ease2(ramp(t,S('grid'),LE('grid',0)));
  const cw=lerp(320,26,k), ch=cw*LAB.h/LAB.w;
  const crop={x:clamp(p.x-cw*.5,0,sim.width-cw),y:clamp(p.y-ch*.5,0,sim.height-ch),w:cw};
  viewport(sim,LAB,crop,{glow:false,grid:k>.97}); border(LAB);
  if(k>.96) {
    const s=LAB.w/cw;
    ctx.save();ctx.beginPath();ctx.rect(LAB.x,LAB.y,LAB.w,LAB.h);ctx.clip();
    const sx=LAB.x+(p.x-crop.x)*s,sy=LAB.y+(p.y-crop.y)*s;
    ctx.strokeStyle=GOLD;ctx.lineWidth=3;ctx.strokeRect(sx+2,sy+2,s-4,s-4);
    text('MATERIAL = OIL',LAB.x+24,LAB.y+35,15,GOLD,'left',true);
    ctx.restore();
  }
  legend();
  out.panel=panel('grid','01','世界是一张材料表','A GRID OF MATERIALS',
    ['放大的是同一份真实模拟状态。','The magnified view uses the same simulation state.'],'density',['this.cells','target, material'],t);
  out.chip={zh:'放大观察',en:'PIXEL MICROSCOPE'};
}
function particleProbe(sim,material,sideways,t) {
  const p=findCell(sim,material,(x,y,i)=>sim.cells[i+sim.width]===MAT.EMPTY,[.48,.38]);
  if(!p) return;
  const sc=LAB.w/sim.width,px=LAB.x+(p.x+.5)*sc,py=LAB.y+(p.y+.5)*sc;
  const a=.6+.2*Math.sin(t*3);
  ctx.strokeStyle=material===MAT.SAND?GOLD:CYAN;ctx.lineWidth=2;ctx.strokeRect(px-sc*1.5,py-sc*1.5,sc*3,sc*3);
  arrow(px,py+13,px,py+43,material===MAT.SAND?GOLD:CYAN,a);
  if(sideways) {arrow(px-12,py,px-42,py,CYAN,a*.6);arrow(px+12,py,px+42,py,CYAN,a*.6);}
}
function ruleShot(id,t,out) {
  const age=t-S(id), rate=id==='sand'?.28:id==='water'?.25:.45;
  const sim=demo(id,id,age*rate);
  const waterLayer=t>=L('water',1);
  const cfg={
    sand:{n:'02',zh:'落下，或沿斜面滑落',en:'FALL · DIAGONAL · REST',color:GOLD,desc:['先检查下方，再尝试左右斜下。','Try below, then the two lower diagonals.'],region:'falling',hl:['y + 1','MAT.SAND']},
    water:{n:'03',zh:'液体找到自己的路',en:'FALL · SPREAD · DISPLACE',color:CYAN,desc:waterLayer?['不同材料的密度，决定能否交换位置。','Relative material density determines displacement.']:['落不下去时，检查左右的空气格子。','When downward movement fails, try empty cells to either side.'],region:waterLayer?'density':'flow',hl:waterLayer?['DENSITY','target, material']:['MAT.EMPTY','dx']},
    fire:{n:'04',zh:'接触，点燃，继续传播',en:'CONTACT BECOMES A CHAIN REACTION',color:FIRE,desc:['下面展示的是实际燃料消耗与烟的运动。','Actual fuel consumption and smoke motion.'],region:'combustion',hl:['FLAMMABLE','MAT.FIRE','MAT.SMOKE']}
  }[id];
  labHeader(`${cfg.n} / ${id==='sand'?'倒沙实验':id==='water'?'液体实验':'燃烧实验'}`,`${rate.toFixed(2)}× TIME · 60 HZ · TICK ${String(sim.tick).padStart(4,'0')}`);
  viewport(sim,LAB,null,{glow:true});border(LAB);legend();
  if(id==='sand') particleProbe(sim,MAT.SAND,false,t);
  if(id==='water') particleProbe(sim,MAT.WATER,true,t);
  out.panel=panel(id,cfg.n,cfg.zh,cfg.en,cfg.desc,cfg.region,cfg.hl,t,cfg.color);
  out.chip={zh:'实际运行 · 教学重演',en:'LIVE RULES / FIXED SEED'};
}
function chunksShot(t,out) {
  const age=t-S('chunks'),sim=demo('chunks','chunks',age);
  labHeader('05 / 只关心正在变化的地方','ACTIVE CHUNKS · ACTUAL COUNTERS');
  const debug=t>=L('chunks',1);
  viewport(sim,LAB,null,{debug,glow:true});border(LAB);legend();
  out.panel=panel('chunks','05','让安静的区域休息','SLEEP QUIET CHUNKS',
    ['变化会唤醒邻块；计数来自当前模拟。','Changes wake neighbors; counters come from this simulation.'],'active-chunks',['active','wake','visited'],t,CYAN);
  out.params=metrics(sim);
  out.chip={zh:debug?'亮框：活跃区域':'同一座洞穴 · 访问计数',en:debug?'OUTLINE = ACTIVE CHUNK':'VISITS, NOT A GAME BENCHMARK'};
}
function finale(t,out) {
  const age=t-S('final'),sim=demo('final','hero',age);
  background(t);
  caveCamera(sim,lerp(1.6,1,ease2(ramp(age,0,3.8))));vignette();
  const a=win(t,S('final')+.4,END-2.3,.7,.7);
  out.title={k:'LOCAL RULES / EMERGENT ACCIDENTS',h:'让规则相遇',e:'SMALL RULES. UNEXPECTED CONSEQUENCES.',size:64,top:655,opacity:a};
  out.chip={zh:'教学重演 · 非游戏源码 / 性能',en:'RECONSTRUCTION, NOT ORIGINAL SOURCE',opacity:out.brand};
  // An editorial dissolve to the opening state, never reversed fire or a backwards simulation.
  // The final second holds precisely the opening image. No history-dependent framebuffer reuse.
  const aLoop=ease(ramp(t,END-2.2,END-1.0));
  if(aLoop>0) {
    loopCtx.globalAlpha=1;loopCtx.drawImage(ctx.canvas,0,0);
    opening(0);ctx.save();ctx.globalAlpha=1-aLoop;ctx.drawImage(loopSurface,0,0);ctx.restore();
  }
}

export default {
  brand,events,
  async init() {
    await loadSource('sandbox',new URL('./sims/sandbox.js',import.meta.url));
    // Separate caches prevent one scene's seek from affecting another's simulation.
    for(const [key,name,options] of [['intro','hero',{}],['grid','hero',{events:false}],['sand','sand',{}],['water','water',{}],['fire','fire',{}],['chunks','chunks',{}],['final','hero',{}]]) {
      demo(key,name,0,options);
    }
  },
  frame(time) {
    const t=clamp(time,0,END), id=sceneAt(t).id, out=outBase(t);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    background(t);
    if(id==='intro') intro(t,out);
    else if(id==='grid') microscope(t,out);
    else if(id==='sand'||id==='water'||id==='fire') ruleShot(id,t,out);
    else if(id==='chunks') chunksShot(t,out);
    else finale(t,out);
    // Fixed-time editorial transition: no CSS animation or wall clock.
    if(id!=='intro'&&id!=='final') {
      const k=1-ease(ramp(t,S(id),S(id)+.45));
      if(k>0) {ctx.fillStyle=`rgba(5,10,14,${k*.6})`;ctx.fillRect(0,175,W,740);}
    }
    return out;
  }
};
