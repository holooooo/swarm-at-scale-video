// 万象成群 · shared film runtime: timeline lookup, overlay DOM, code panel, subtitles,
// footage frames, deterministic renderFrame(t) for headless capture, and a small preview player.
const W = 1920, H = 1080;
const $ = s => document.querySelector(s);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const ease2 = x => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const lerp = (a, b, u) => a + (b - a) * u;
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
// fade in over [a, a+fi], out over [b-fo, b]
export const win = (t, a, b, fi = 0.5, fo = 0.5) => Math.min(ease((t - a) / fi), ease((b - t) / fo));

// ---------- timeline ----------
export const TL = window.TIMELINE;
const sc = id => { const s = TL.scenes.find(x => x.id === id); if (!s) throw new Error('scene ' + id); return s; };
export const S = id => sc(id).start;
export const E = id => sc(id).end;
export const VE = id => sc(id).voiceEnd;
export const L = (id, k) => sc(id).lines[k].start;
export const LE = (id, k) => sc(id).lines[k].end;
export const sceneAt = t => { let s = TL.scenes[0]; for (const x of TL.scenes) if (t >= x.start) s = x; return s; };

// ---------- code highlighting (JS + GLSL) ----------
const KW = new Set('if else for return break continue const let var function new class while of in this uniform out in layout discard'.split(' '));
const TY = new Set('float int bool void vec2 vec3 vec4 ivec2 ivec3 mat3 mat4 sampler2D Float32Array'.split(' '));
const BI = new Set('Math normalize dot cross mix clamp smoothstep length texelFetch floor fract min max sqrt abs sin cos hypot limit'.split(' '));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlight(line) {
  const ci = line.indexOf('//');
  const code = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : '';
  let html = '', m;
  const re = /([A-Za-z_$][A-Za-z0-9_$]*)|(\d+\.?\d*(?:e-?\d+)?|\.\d+)|('[^']*'|"[^"]*")|(\s+)|(.)/g;
  while ((m = re.exec(code))) {
    const [tok, id, num, str] = m;
    if (id) {
      if (KW.has(id)) html += `<span class="tk-k">${id}</span>`;
      else if (TY.has(id)) html += `<span class="tk-t">${id}</span>`;
      else if (BI.has(id)) html += `<span class="tk-b">${id}</span>`;
      else if (code.slice(m.index + id.length).trimStart().startsWith('(')) html += `<span class="tk-f">${id}</span>`;
      else html += esc(id);
    } else if (num) html += `<span class="tk-n">${num}</span>`;
    else if (str) html += `<span class="tk-s">${esc(str)}</span>`;
    else html += esc(tok);
  }
  if (com) html += `<span class="tk-c">${esc(com)}</span>`;
  return html;
}
// Source regions are cut from the real simulation files: //#region name ... //#endregion
const SOURCES = {};
export async function loadSource(name, url) {
  const r = await fetch(url);
  SOURCES[name] = await r.text();
}
function region(src, name) {
  const lines = SOURCES[src].split('\n'), out = [];
  const i0 = lines.findIndex(l => new RegExp('//#region ' + name + '\\s*$').test(l));
  if (i0 < 0) throw new Error('region not found ' + src + ':' + name);
  for (let i = i0 + 1; i < lines.length; i++) {
    if (/\/\/#endregion/.test(lines[i])) break;
    if (/\/\/#region/.test(lines[i])) continue;
    out.push({ n: i + 1, s: lines[i] });
  }
  const ne = out.filter(o => o.s.trim());
  const ind = ne.length ? Math.min(...ne.map(o => o.s.match(/^ */)[0].length)) : 0;
  out.forEach(o => o.s = o.s.slice(ind).replace(/\s+$/, ''));
  return out;
}
const snipCache = new Map();
function renderCode(code, t) {
  const box = $('#code');
  if (!code) { box.classList.add('hide'); return; }
  box.classList.remove('hide');
  const key = code.src + ':' + code.region;
  if (!snipCache.has(key)) snipCache.set(key, region(code.src, code.region));
  const rows = snipCache.get(key);
  $('#code .fn').textContent = code.file;
  const nums = rows.map(r => r.n);
  $('#code .ln').textContent = `L${nums[0]}–${nums[nums.length - 1]}  ·  ${code.lang || 'JavaScript'}`;
  const total = rows.reduce((a, r) => a + r.s.length + 1, 0);
  const age = t - code.since;
  const shown = Math.floor(clamp(age / Math.min(1.5, 0.25 + total * 0.003)) * total);
  let used = 0, html = '';
  const hl = code.hl || [];
  rows.forEach(r => {
    const len = r.s.length + 1;
    let s = r.s, caret = false;
    if (used + len > shown) { s = r.s.slice(0, Math.max(0, shown - used)); caret = used <= shown; }
    used += len;
    const isHl = age > 1.1 && hl.some(h => r.s.includes(h));
    html += `<div class="row${isHl ? ' hl' : ''}"><span class="n">${r.n}</span><span>${highlight(s)}${caret ? '<span class="caret"></span>' : ''}</span></div>`;
    if (caret) used = 1e9;
  });
  const maxLen = Math.max(...rows.map(r => r.s.length));
  const fs = Math.min(14.5, 14.5 * 74 / Math.max(74, maxLen));
  const pre = $('#code pre');
  pre.style.fontSize = fs.toFixed(2) + 'px'; pre.style.lineHeight = (fs * 1.48).toFixed(1) + 'px';
  pre.innerHTML = html;
}

// ---------- overlay setters ----------
let lastDesc = '';
function setPanel(p, t) {
  const el = $('#panel');
  if (!p || (p.opacity ?? 1) <= 0.001) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.opacity = p.opacity ?? 1;
  el.style.transform = `translateY(${(1 - (p.opacity ?? 1)) * 14}px)`;
  $('#pstep').textContent = p.step;
  $('#pstep').style.background = p.color || '';
  $('#ptitle .zh').textContent = p.zh; $('#ptitle .en').textContent = p.en;
  const dots = $('#pdots');
  if (p.dots) {
    dots.classList.remove('hide');
    if (dots.children.length !== p.dots.n) dots.innerHTML = '<i></i>'.repeat(p.dots.n);
    [...dots.children].forEach((d, i) => {
      d.className = i < p.dots.cur ? 'done' : i === p.dots.cur ? 'cur' : '';
      d.style.setProperty('--p', (i === p.dots.cur ? clamp(p.dots.frac) * 100 : 0) + '%');
    });
  } else dots.classList.add('hide');
  const dk = JSON.stringify(p.desc);
  if (dk !== lastDesc) { $('#pdesc').innerHTML = p.desc ? `${p.desc[0]}<span class="en">${p.desc[1]}</span>` : ''; lastDesc = dk; }
  $('#pdesc').classList.toggle('hide', !p.desc);
  renderCode(p.code, t);
}
// long lines split at '|' (and at punctuation if still long) into timed chunks
export function chunks(line, depth = 0) {
  if (line.zh.includes('|')) {
    const zs = line.zh.split('|'), es = line.en.split('|');
    const w = zs.map(z => z.length + 2), tot = w.reduce((a, b) => a + b, 0);
    let t0 = line.start;
    return zs.flatMap((z, i) => {
      const t1 = t0 + (line.end - line.start) * w[i] / tot;
      const c = { zh: z, en: (es[i] || '').trim(), start: t0, end: t1 }; t0 = t1;
      return chunks(c, depth + 1);
    });
  }
  const zh = line.zh.replace(/[，。、；：]$/, '');
  const one = [{ zh, en: line.en, start: line.start, end: line.end }];
  if (zh.length <= 25 || depth > 2) return one;
  const cuts = [...zh.matchAll(/[，。：；？！]/g)].map(m => m.index);
  if (!cuts.length) return one;
  const c = cuts.reduce((a, b) => Math.abs(b - zh.length / 2) < Math.abs(a - zh.length / 2) ? b : a);
  const z1 = zh.slice(0, c), z2 = zh.slice(c + 1);
  const fr = (z1.length + 0.5) / (z1.length + z2.length + 1);
  const en = line.en, target = en.length * fr;
  let best = null;
  for (const m of en.matchAll(/(, | — |: |; |\. )/g)) if (!best || Math.abs(m.index - target) < Math.abs(best[0] - target)) best = [m.index, m[0].length];
  if (!best || Math.abs(best[0] - target) > en.length * 0.22) {
    const sp = [...en.matchAll(/ /g)].map(m => m.index);
    best = [sp.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a, sp[0]), 1];
  }
  const e1 = en.slice(0, best[0] + (best[1] > 1 ? 1 : 0)).trim(), e2 = en.slice(best[0] + best[1]).trim();
  const tm = line.start + (line.end - line.start) * fr;
  return [...chunks({ zh: z1, en: e1, start: line.start, end: tm }, depth + 1), ...chunks({ zh: z2, en: e2, start: tm, end: line.end }, depth + 1)];
}
export const allChunks = () => TL.scenes.flatMap(s => s.lines.flatMap(l => chunks(l)));
function setSubs(t, opt) {
  const s = sceneAt(t);
  let txt = null;
  for (const l of s.lines) {
    if (t < l.start - 0.05 || t > l.end + 0.45) continue;
    for (const c of chunks(l)) if (t >= c.start - 0.05) txt = c;
  }
  $('#subs .zh').textContent = txt ? txt.zh.replace(/[，。、；：]$/, '') : '';
  $('#subs .en').textContent = txt ? txt.en : '';
  $('#subs').style.visibility = txt ? 'visible' : 'hidden';
  $('#subs').classList.toggle('full', !!opt.full);
  $('#subs').classList.toggle('box', !!opt.box);
  $('#subs').classList.toggle('quote', !!s.clip);
}
function setParams(p) {
  const el = $('#params');
  if (!p) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.style.opacity = p.opacity ?? 1;
  $('#params h4 span').textContent = p.head || 'LIVE · SIMULATION';
  $('#prows').innerHTML = p.rows.map(r => `<div class="prow ${r.c || ''}"><span class="k">${r.k}</span><span class="v">${r.v}</span></div>`).join('');
}
function setWipe(w) {
  const el = $('#wipe');
  if (!w || w.u <= 0.001 || w.u >= 0.999) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = (w.u * W) + 'px';
  el.querySelector('.l span').textContent = w.labB ? `${w.labB[0]} · ${w.labB[1]}` : '';
  el.querySelector('.r span').textContent = w.labA ? `${w.labA[0]} · ${w.labA[1]}` : '';
  el.querySelector('.l').style.opacity = w.labB ? clamp((w.u * W - 40) / 300) : 0;
  el.querySelector('.r').style.opacity = w.labA ? clamp(((1 - w.u) * W - 40) / 300) : 0;
}
function setChip(c) {
  const el = $('#chip');
  if (!c) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.classList.toggle('real', !!c.real);
  el.style.opacity = c.opacity ?? 1;
  el.querySelector('.zh').textContent = c.zh; el.querySelector('.en').textContent = c.en;
}
function setTitle(tc) {
  const el = $('#title');
  if (!tc || tc.opacity <= 0) { el.style.opacity = 0; return; }
  el.style.opacity = tc.opacity;
  el.style.top = (tc.top ?? 300) + 'px';
  el.style.transform = `translateY(${(1 - tc.opacity) * 16}px)`;
  el.querySelector('.k').textContent = tc.k || '';
  el.querySelector('.h').textContent = tc.h || '';
  el.querySelector('.h').style.fontSize = (tc.size || 88) + 'px';
  el.querySelector('.e').textContent = tc.e || '';
  el.querySelector('.tags').innerHTML = (tc.tags || []).map(s => `<span class="glass">${s}</span>`).join('');
}
function setCards(cards) {
  $('#cards').innerHTML = (cards || []).filter(c => (c.o ?? 1) > 0.001).map(c =>
    `<div class="card glass${c.big ? ' big' : ''}" style="left:${c.x}px;top:${c.y}px;width:${c.w || 420}px;opacity:${c.o ?? 1};transform:translateY(${(1 - (c.o ?? 1)) * 12}px)">` +
    `${c.y_ ? `<div class="y">${c.y_}</div>` : ''}<div class="zh">${c.zh}</div>${c.en ? `<div class="en">${c.en}</div>` : ''}${c.sub ? `<div class="sub">${c.sub}</div>` : ''}</div>`).join('');
}
function setLabels(ls) {
  $('#labels').innerHTML = (ls || []).filter(l => (l.o ?? 1) > 0.001).map(l =>
    `<div class="lab2 ${l.plain ? 'plain' : 'glass'}" style="left:${l.x}px;top:${l.y}px;opacity:${l.o ?? 1};${l.color ? `color:${l.color}` : ''}">${l.zh}${l.en ? `<small>${l.en}</small>` : ''}</div>`).join('');
}
function setCredit(c) {
  const el = $('#credit');
  if (!c || (c.o ?? 1) <= 0.001) { el.classList.add('hide'); return; }
  el.classList.remove('hide');
  el.style.opacity = c.o ?? 1;
  if (c.top != null) el.style.top = c.top + 'px'; else el.style.top = '';
  el.innerHTML = `<b>${c.k || 'SOURCE'}</b>${c.text}`;
}
function setProgress(t, o) {
  const p = $('#prog');
  if (!p.dataset.init) {
    p.dataset.init = 1;
    for (const s of TL.scenes.slice(1)) { const m = document.createElement('div'); m.className = 'm'; m.style.left = (s.start / TL.duration * 100) + '%'; p.appendChild(m); }
  }
  p.style.opacity = o;
  p.querySelector('.f').style.width = (t / TL.duration * 100) + '%';
}

// ---------- footage: pre-extracted JPEG frame sequences ----------
const imgCache = new Map();
function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img ' + src)); im.src = src; });
  imgCache.set(src, p);
  if (imgCache.size > 240) imgCache.delete(imgCache.keys().next().value);
  return p;
}
// f: { clip: {dir, fps, count}, t (seconds into clip), opacity, clipX: [x0,x1] in px, el: '#foot'|'#frame', rect, filter }
async function setFootage(sel, f) {
  const el = $(sel);
  const img = sel === '#frame' ? el.querySelector('img') : el;
  if (!f || (f.opacity ?? 1) <= 0.001) { el.style.display = 'none'; return; }
  const c = f.clip;
  const k = Math.max(1, Math.min(c.count, 1 + Math.floor(f.t * c.fps + 1e-6)));
  const src = `${c.dir}/f${String(k).padStart(4, '0')}.jpg`;
  const im = await loadImg(src);
  if (img.getAttribute('src') !== src) { img.src = im.src; await img.decode().catch(() => {}); }
  el.style.display = 'block';
  el.style.opacity = f.opacity ?? 1;
  el.style.filter = f.filter || '';
  if (f.rect) Object.assign(el.style, { left: f.rect[0] + 'px', top: f.rect[1] + 'px', width: f.rect[2] + 'px', height: f.rect[3] + 'px' });
  el.style.transform = f.zoom ? `scale(${f.zoom})` : '';
  el.style.clipPath = f.clipX ? `inset(0 ${W - f.clipX[1]}px 0 ${f.clipX[0]}px)` : '';
}

// ---------- boot ----------
export async function boot(story) {
  const render = new URLSearchParams(location.search).has('render');
  document.body.classList.toggle('render', render);
  await story.init?.();
  $('#brand .t1').textContent = story.brand[0]; $('#brand .t2').textContent = story.brand[1];
  window.DURATION = TL.duration;
  window.__events = story.events || [];
  window.renderFrame = async function (t) {
    const f = await story.frame(t);
    setPanel(f.panel, t);
    setSubs(t, { full: !f.panel || (f.panel.opacity ?? 1) < 0.5 || f.subsFull, box: f.subsBox });
    setParams(f.params);
    setWipe(f.wipe);
    setChip(f.chip);
    setTitle(f.title);
    setCards(f.cards);
    setLabels(f.labels);
    setCredit(f.credit);
    await setFootage('#foot', f.foot);
    await setFootage('#frame', f.frame);
    const bo = f.brand ?? 1;
    $('#brand').style.opacity = bo;
    setProgress(t, f.progress ?? bo);
    $('#fade').style.opacity = f.fade ?? 0;
    return true;
  };
  window.chunksJSON = () => JSON.stringify(allChunks());
  if (!render) player();
  window.READY = true;
}

function player() {
  const st = $('#stage');
  const fit = () => { const s = Math.min(innerWidth / W, (innerHeight - 52) / H); st.style.transform = `scale(${s})`; };
  addEventListener('resize', fit); fit();
  const bar = document.createElement('div');
  bar.id = 'player';
  bar.innerHTML = `<button id="pp">▶ 播放</button><span id="tc">0.00</span><input id="sk" type="range" min="0" max="${TL.duration}" step="0.01" value="0"><span>${TL.duration.toFixed(1)}s</span>`;
  document.body.appendChild(bar);
  const audio = new Audio(new URLSearchParams(location.search).get('audio') || 'audio.m4a');
  let playing = false, t = 0, busy = false, t0 = 0, w0 = 0;
  const draw = async tt => { if (busy) return; busy = true; try { await window.renderFrame(tt); } catch (e) { console.error(e); } busy = false; $('#tc').textContent = tt.toFixed(2); $('#sk').value = tt; };
  const loop = () => {
    if (!playing) return;
    t = audio.readyState >= 2 && !audio.paused ? audio.currentTime : w0 + (performance.now() - t0) / 1000;
    if (t >= TL.duration) { playing = false; $('#pp').textContent = '▶ 播放'; return; }
    draw(t); requestAnimationFrame(loop);
  };
  $('#pp').onclick = () => {
    playing = !playing; $('#pp').textContent = playing ? '❚❚ 暂停' : '▶ 播放';
    if (playing) { t0 = performance.now(); w0 = t; audio.currentTime = t; audio.play().catch(() => {}); loop(); } else audio.pause();
  };
  $('#sk').oninput = e => { t = +e.target.value; audio.currentTime = t; w0 = t; t0 = performance.now(); if (!playing) draw(t); };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); $('#pp').click(); } });
  const h = +(location.hash.slice(1) || 0); t = h; draw(h);
}
