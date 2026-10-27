'use strict';
const episodes = [
 ['ep01-boids','BOIDS','三条规则，六万只鸟','分离、对齐、聚合。局部规则如何长出群体形状，又如何用空间网格找到邻居。','局部规则 · 空间网格 · GPU','01_鸟群算法_三条规则到六万只鸟'],
 ['ep02-abzu','ABZÛ','一万条鱼，没有一根骨头','鱼身的游动写在顶点里。看看同一张静态网格，怎样在海中变得生动。','实例化 · 顶点动画 · 鱼群','02_ABZU_一万条鱼没有一根骨头'],
 ['ep03-ecs','ECS','一万个敌人，怎么更新？','把数据与逻辑拆开，让系统扫过整列数组。从街道上空观察尸潮的流动。','数据导向 · 角色系统 · 尸潮','03_ECS_一万个敌人'],
 ['ep04-dyson','DYSON SPHERE','一百万块板，追着太阳转','把朝向和轨道交给着色器。绕着行星看一看，白天追光，夜里平放。','GPU 实例化 · 无状态轨道 · LOD','04_戴森球计划_万板向日'],
 ['ep05-sword','SWORD FLIGHT','把前面的招式，合成御剑术','局部规则负责飞行，ECS 分配攻防，顶点着色器弯曲剑身。五期思路，在剑阵里相遇。','剑群 · 攻防分工 · 着色器弯剑','05_御剑术_一万把飞剑'],
 ['ep06-noita','NOITA INSPIRED','一粒火星，整座洞穴','倒沙、注水、点火。局部材料规则怎样引发连锁反应，又怎样让安静的区域休眠。','像素材质 · 密度与燃烧 · 活跃分块','06_Noita_像素炼金术']
];
document.querySelector('#episodes').innerHTML = episodes.map(([path,en,title,desc,tags,file],i)=>{const n=String(i+1).padStart(2,'0');return `<article class="episode"><a class="thumb" href="${path}/interactive.html" aria-label="探索${title}"><img src="assets/ep${n}.jpg" alt="${title}的实时场景画面" loading="lazy" width="960" height="540"></a><div class="episode-body"><span class="number">${n} / ${en}</span><h3>${title}</h3><p>${desc}</p><div class="topics">${tags}</div><div class="actions"><a class="button primary" href="${path}/interactive.html">交互探索 ↗</a><a href="${path}/film.html">讲解回放</a><a href="out/${file}.srt" download>字幕</a></div></div></article>`}).join('');
const canvas=document.querySelector('#flock'), ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let w=500,h=500,frame=0,visible=true,last=0;
let seed=2026;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const birds=Array.from({length:110},()=>({x:random(),y:random(),vx:(random()-.5)*.002,vy:(random()-.5)*.002}));
function resize(){const r=canvas.getBoundingClientRect();w=r.width;h=r.height;const d=Math.min(devicePixelRatio,2);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);draw(false)}
function draw(move){ctx.fillStyle='#0b121b';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#162330';ctx.lineWidth=1;for(let x=24;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=24;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 const next=birds.map(b=>{let ax=0,ay=0,cx=0,cy=0,vx=0,vy=0,n=0;for(const o of birds){if(o===b)continue;const dx=o.x-b.x,dy=o.y-b.y,d=dx*dx+dy*dy;if(d<.0225){n++;cx+=o.x;cy+=o.y;vx+=o.vx;vy+=o.vy;if(d<.0025&&d>0){ax-=dx*.0000018/d;ay-=dy*.0000018/d}}}if(n){ax+=(cx/n-b.x)*.00014+(vx/n-b.vx)*.03;ay+=(cy/n-b.y)*.00014+(vy/n-b.vy)*.03}ax+=(.5-b.x)*.000025;ay+=(.5-b.y)*.000025;let nx=b.vx+ax,ny=b.vy+ay;const v=Math.hypot(nx,ny)||1;const s=Math.max(.0008,Math.min(.0028,v));nx=nx/v*s;ny=ny/v*s;return {x:(b.x+nx+1)%1,y:(b.y+ny+1)%1,vx:nx,vy:ny}});if(move)birds.forEach((b,i)=>Object.assign(b,next[i]));
 birds.forEach((b,i)=>{const x=b.x*w,y=b.y*(h-55)+15,a=Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=i%9===0?'#ffb35c':'#9aaebe';ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-2.5);ctx.lineTo(-2,0);ctx.lineTo(-4,2.5);ctx.closePath();ctx.fill();ctx.restore()})}
function tick(t){frame=0;if(!visible||document.hidden||reduced.matches)return;if(t-last>30){draw(true);last=t}frame=requestAnimationFrame(tick)}
function start(){if(!frame&&visible&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick)}
new ResizeObserver(resize).observe(canvas);new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)start()}).observe(canvas);document.addEventListener('visibilitychange',start);reduced.addEventListener('change',()=>{draw(false);start()});resize();start();
