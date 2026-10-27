import {MAT} from './sims/sandbox.js';
import {createDemo} from './sims/scenarios.js';
import {drawPixels} from './sims/draw.js';

const $=s=>document.querySelector(s), canvas=$('#scene'), ctx=canvas.getContext('2d',{alpha:false});
const brushes=[
  {id:MAT.SAND,name:'沙',color:'#d8b56b',desc:'向下掉，堵住就试着滑向两侧。沙比水和油重。'},
  {id:MAT.WATER,name:'水',color:'#459dc4',desc:'落进低处，也能向两侧流动。把水泼向火，看看会发生什么。'},
  {id:MAT.OIL,name:'油',color:'#93904b',desc:'比水轻，会浮在水上。遇火会燃烧，小心连锁反应。'},
  {id:MAT.FIRE,name:'火',color:'#f5a54c',desc:'点燃附近的油和木头。没有燃料，就会逐渐熄灭。'},
  {id:MAT.WOOD,name:'木',color:'#9c6240',desc:'搭一座桥，或盖住水池。它不会下落，但会被火烧掉。'},
  {id:MAT.ROCK,name:'岩',color:'#788389',desc:'不会燃烧的固定地形。画一道墙，改变沙与水的去向。'},
  {id:MAT.EMPTY,name:'擦除',color:'#262f38',desc:'擦掉材料与地形。也可以按住鼠标右键擦除。'}
];
const labels={hero:'洞穴连锁反应',sand:'沙子下落',water:'水与油的分层',fire:'燃烧与熄灭',chunks:'活跃区域',empty:'自由实验'};
const descriptions={hero:'已有沙、水、油和木桥。等一粒火星落下，也可以亲手改变它的走向。',sand:'向平台上倒沙，看沙堆的斜坡怎样自己长出来。',water:'把沙倒进水里，再添一点油。留意三种材料的位置。',fire:'木头和油是燃料。点火后试着加水，阻止燃烧蔓延。',chunks:'打开分块显示，静止区域会休眠。放一点材料，把附近唤醒。',empty:'从空白开始，画地形、倒材料，调出自己的配方。'};
const materialNames={0:'空',1:'岩',2:'沙',3:'水',4:'油',5:'火',6:'烟',7:'木'};
let demo, selected=MAT.SAND, running=!matchMedia('(prefers-reduced-motion: reduce)').matches, failed=false;
let brush=4, speed=1, debug=false, grid=false, acc=0,last=0,reportAt=0,frameCount=0,stepMs=0;
let pointer=null,previous=null,painting=false,erase=false;
const fmt=n=>Number(n||0).toLocaleString('zh-CN');
function fail(e){failed=true;running=false;$('#message').hidden=false;$('#message').textContent=`实验暂时无法运行：${e.message||e}。请通过本地 HTTP 服务打开，并检查模拟模块是否完整。`;$('#state').textContent='实验不可用';document.querySelectorAll('button,select,input').forEach(el=>el.disabled=true);window.ERR=e.message||String(e);console.error(e);window.READY=true;}
function playback(){
  $('#pause').textContent=running?'暂停':'继续';$('#pause').setAttribute('aria-pressed',String(!running));$('#step').disabled=running;
  $('#state').textContent=running?'规则正在运行':'已暂停 · 可以继续画';$('#state').classList.toggle('paused',!running);
}
function metrics(){if(!demo)return;const sim=demo.sim,s=sim.stats;$('#ticks').textContent=fmt(sim.tick);$('#active').textContent=`${fmt(s.activeChunks)} / ${fmt(s.totalChunks)}`;$('#visited').textContent=fmt(s.visited);}
function render(){if(!demo)return;drawPixels(ctx,demo.sim,0,0,canvas.width,canvas.height,{debug,grid,glow:true});
  if(pointer){const x=pointer.x/demo.sim.width*canvas.width,y=pointer.y/demo.sim.height*canvas.height,r=brush/demo.sim.width*canvas.width;ctx.save();ctx.strokeStyle=erase?'#ffe2dbb0':'#f1dfb9b0';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.restore();}
}
function chooseMaterial(id){selected=id;document.querySelectorAll('.material').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.material===id)));$('#material-description').textContent=brushes.find(b=>b.id===id).desc;}
function reset(key=$('#preset').value){demo=createDemo(key,{events:true});acc=0;last=0;painting=false;pointer=previous=null;$('#preset').value=key;$('#preset-description').textContent=descriptions[key];$('#scene-label').textContent=labels[key];if(key==='chunks'){$('#debug').checked=true;debug=true;}metrics();render();playback();}
function point(e){const rect=canvas.getBoundingClientRect();return {x:Math.min(demo.sim.width-2,Math.max(1,(e.clientX-rect.left)/rect.width*demo.sim.width)),y:Math.min(demo.sim.height-2,Math.max(1,(e.clientY-rect.top)/rect.height*demo.sim.height))};}
function paintAt(p,from=p){const d=Math.hypot(p.x-from.x,p.y-from.y),n=Math.max(1,Math.ceil(d/Math.max(1,brush*.6)));for(let i=0;i<=n;i++){const u=i/n;demo.sim.paint(Math.round(from.x+(p.x-from.x)*u),Math.round(from.y+(p.y-from.y)*u),brush,erase?MAT.EMPTY:selected);}render();metrics();}
function move(e){if(failed||!demo)return;pointer=point(e);if(painting)paintAt(pointer,previous||pointer);previous=pointer;const x=Math.floor(pointer.x),y=Math.floor(pointer.y);$('#cursor-info').textContent=`${x}, ${y} · ${materialNames[demo.sim.cells[y*demo.sim.width+x]]||'材料'}`;if(!running)render();}
function oneStep(){const t0=performance.now();if(painting&&pointer)paintAt(pointer);demo.advanceTo((demo.sim.tick+1)/60);stepMs=performance.now()-t0;}
try{
  if(location.protocol==='file:')throw new Error('模块需要 HTTP 服务，不能直接双击文件');
  for(const [i,b] of brushes.entries()){const button=document.createElement('button');button.type='button';button.className='material';button.dataset.material=b.id;button.style.setProperty('--material',b.color);button.setAttribute('aria-label',b.name);button.innerHTML=`<span class="swatch" aria-hidden="true"></span><span>${b.name}</span>${i<6?`<kbd aria-hidden="true">${i+1}</kbd>`:''}`;button.onclick=()=>chooseMaterial(b.id);$('#materials').append(button);}
  chooseMaterial(MAT.SAND);reset();
  // The opening is a staged experiment; user interactions remain unscripted afterward.
  if($('#preset').value==='hero'){demo.advanceTo(.6);metrics();render();}
  $('#pause').onclick=()=>{running=!running;acc=0;playback();};
  $('#step').onclick=()=>{if(running)return;oneStep();metrics();render();};
  $('#reset').onclick=()=>reset();$('#clear').onclick=()=>reset('empty');$('#preset').onchange=()=>reset();
  $('#brush').oninput=e=>{brush=+e.target.value;$('#brush-value').textContent=`${brush} 格`;render();};
  $('#speed').onchange=e=>{speed=+e.target.value;acc=0;};
  $('#debug').onchange=e=>{debug=e.target.checked;render();};$('#grid').onchange=e=>{grid=e.target.checked;render();};
  canvas.addEventListener('pointerdown',e=>{if(failed||e.button>2)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);painting=true;erase=e.button===2;pointer=point(e);previous=pointer;paintAt(pointer);});
  canvas.addEventListener('pointermove',move);
  const stop=e=>{painting=false;erase=false;previous=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
  canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  canvas.addEventListener('pointerleave',()=>{if(!painting){pointer=previous=null;$('#cursor-info').textContent='按住拖动，把材料放进洞穴';render();}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();$('#pause').click();}else if(e.key==='.'&&!running){e.preventDefault();$('#step').click();}else if(/^[1-6]$/.test(e.key)){e.preventDefault();chooseMaterial(brushes[+e.key-1].id);}else if(e.key==='Escape'){painting=false;pointer=previous=null;render();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;painting=false;acc=0;playback();}});
  const fit=()=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(320,Math.round(r.width*d));canvas.height=Math.round(canvas.width*9/16);render();};new ResizeObserver(fit).observe(canvas);fit();
  window.NOITA={get sim(){return demo.sim;},get running(){return running;},get selected(){return selected;},reset,chooseMaterial,pause(value=true){running=!value;acc=0;playback();},step(n=1){for(let i=0;i<n;i++)oneStep();metrics();render();},render};
  window.READY=true;
  function frame(now){if(failed)return;requestAnimationFrame(frame);try{const dt=last?Math.min((now-last)/1000,.06):0;last=now;if(running&&!document.hidden){acc=Math.min(acc+dt*speed,6/60);let n=0;while(acc>=1/60&&n++<6){oneStep();acc-=1/60;}}render();frameCount++;if(now-reportAt>700){metrics();$('#performance').textContent=`${Math.round(frameCount*1000/(now-reportAt))} FPS · ${stepMs.toFixed(2)} ms / 步`;frameCount=0;reportAt=now;}}catch(e){fail(e);}}
  requestAnimationFrame(frame);
}catch(e){fail(e);}
