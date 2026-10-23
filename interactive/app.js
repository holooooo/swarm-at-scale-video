import * as THREE from 'three';
import {OrbitCamera} from './orbit.js';
import {createScene} from './scenes.js';

const $=s=>document.querySelector(s),canvas=$('#scene'),state=$('#state'),message=$('#message');
let running=false,busy=true,failed=false,adapter,renderer,camera,orbit,stageIndex=0,steps=0,job=0,acc=0,last=0,frames=0,reportAt=0;
const mobile=matchMedia('(max-width: 760px)').matches||navigator.hardwareConcurrency<=4;
function status(text){state.textContent=text;}
function fail(error){failed=true;running=false;busy=false;job++;status('场景不可用');message.hidden=false;message.classList.add('error');message.textContent=`${error.message || error}。请通过 HTTP(S) 打开；检查本地模块和模型是否完整。`;$('#pause').disabled=true;$('#step').disabled=true;$('#stage').disabled=true;console.error(error);}
window.addEventListener('error',e=>{if(!failed)fail(e.error||e.message);});
window.addEventListener('unhandledrejection',e=>{if(!failed)fail(e.reason);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('WebGL 上下文丢失。请关闭其他 GPU 页面后重新载入'));});
$('#reload').onclick=()=>location.reload();
function playback(){ document.querySelectorAll('#parameters input').forEach(input=>input.disabled=busy||failed); $('#pause').textContent=running?'暂停模拟':'继续模拟';$('#pause').setAttribute('aria-pressed',String(!running));$('#step').disabled=running||busy;status(busy?'准备场景…':running?'实时模拟':'已暂停 · 相机仍可操作'); }
function preset(index){const v=adapter.views[index];orbit.set(v.position,v.target,v.fov);$('#view').value=String(index);}
function render(){renderer.setRenderTarget(null);renderer.render(adapter.scene,camera);}
async function selectStage(index,resetCamera=true){
  if(failed)return;const token=++job,wasRunning=running;running=false;busy=true;acc=0;playback();
  const stage=adapter.stages[index];stageIndex=index;$('#stage').value=String(index);
  adapter.reset();steps=0;const target=adapter.select(stage.key)||0,targetSteps=Math.ceil(target*60);
  message.hidden=false;message.classList.remove('error');
  if(resetCamera)preset(stage.view??0);
  try{
    while(steps<targetSteps){
      if(token!==job||failed)return;const start=performance.now();
      do{if(adapter.warmStep)adapter.warmStep();else adapter.step();steps++;}while(steps<targetSteps&&performance.now()-start<9);
      message.textContent=`正在准备「${stage.label}」 ${Math.floor(steps/Math.max(1,targetSteps)*100)}% · 可继续拖动相机`;
      if(adapter.sync)adapter.sync();render();await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    if(token!==job||failed)return;busy=false;message.hidden=true;running=wasRunning;playback();render();
  }catch(e){fail(e);}
}
try{
  if(location.protocol==='file:') throw new Error('ES 模块和 GLB 模型需要本地 HTTP 服务，不支持直接双击文件');
  const context=canvas.getContext('webgl2',{antialias:!mobile,alpha:false,powerPreference:'high-performance'});
  if(!context)throw new Error('浏览器未能创建 WebGL2 上下文');
  renderer=new THREE.WebGLRenderer({canvas,context,antialias:!mobile});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.25:1.75));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  camera=new THREE.PerspectiveCamera(45,1,.02,20000);orbit=new OrbitCamera(camera,canvas);
  renderer.debug.onShaderError=()=>{fail(new Error('本机 GPU 无法编译场景着色器'));};
  const resize=()=>{const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe(canvas);resize();
  message.textContent='正在加载本地模拟模块与场景资源…';
  adapter=await createScene(document.body.dataset.episode,renderer,mobile);
  $('#title').textContent=adapter.title;$('#description').textContent=adapter.note;
  adapter.stages.forEach((s,i)=>$('#stage').add(new Option(s.label,String(i))));
  adapter.views.forEach((v,i)=>$('#view').add(new Option(v.label,String(i))));
  for(const control of adapter.controls){
    const label=document.createElement('label');label.className='parameter';
    const text=document.createElement('span');text.textContent=control.label;
    const value=document.createElement('output');value.textContent=control.value;value.id=`${control.key}-value`;
    const input=document.createElement('input');Object.assign(input,{type:'range',id:control.key,min:control.min,max:control.max,step:control.step,value:control.value});
    label.htmlFor=input.id;value.htmlFor=input.id;label.append(text,value,input);
    input.oninput=()=>{value.textContent=input.value;if(!busy&&!failed)adapter.set(control.key,+input.value);};
    $('#parameters').append(label);
  }
  $('#stage').onchange=()=>selectStage(+$('#stage').value);
  $('#view').onchange=()=>preset(+$('#view').value);
  $('#reset').onclick=()=>selectStage(stageIndex);
  $('#home-view').onclick=()=>preset(adapter.stages[stageIndex].view??0);
  $('#pause').onclick=()=>{if(busy||failed)return;running=!running;acc=0;playback();};
  $('#step').onclick=()=>{if(busy||running||failed)return;adapter.step();steps++;render();};
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===canvas){e.preventDefault();$('#pause').click();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;acc=0;playback();}});
  $('#quality').textContent=mobile?'移动端预算 · 低实例 / DPR ≤ 1.25':'桌面预算 · DPR ≤ 1.75';
  await selectStage(0);if(!failed){running=!matchMedia('(prefers-reduced-motion: reduce)').matches;playback();}
  function frame(now){
    if(failed)return;requestAnimationFrame(frame);
    const delta=last?Math.min((now-last)/1000,.05):0;last=now;
    if(!document.hidden){
      if(!busy&&running){
        acc=Math.min(acc+delta,3/60);let budget=adapter.heavy?1:3;
        while(acc>=1/60&&budget-->0){
          const end=adapter.stages[stageIndex].end;
          if(end!==undefined&&steps/60>=end){running=false;acc=0;playback();status('本阶段结束 · 请选择下一阶段或重置');break;}
          adapter.step();steps++;acc-=1/60;
        }
      }
      orbit.update();render();frames++;
      if(now-reportAt>1000){$('#metrics').textContent=`${adapter.stats()} · ${Math.round(frames*1000/Math.max(1,now-reportAt))} FPS`;frames=0;reportAt=now;}
    }
  }
  requestAnimationFrame(frame);
}catch(e){fail(e);}
