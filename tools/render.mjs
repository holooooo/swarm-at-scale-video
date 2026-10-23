// Render <ep>/film.html frame by frame in headless Chrome (Metal WebGL2) and pipe JPEGs to ffmpeg.
// usage: node tools/render.mjs ep01-boids [--stills 0,12.5] [--from 0 --to 30] [--workers 3] [--out file.mp4]
//        node tools/render.mjs ep01-boids --srt out.srt      (bilingual SRT from the on-screen subtitle chunks)
//        node tools/render.mjs ep01-boids --events           (transition times for the audio mix)
import { launch } from './cdp.mjs';
import { serve } from './serve.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EP = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const FPS = 30, WORKERS = +arg('workers', 3);
const srv = await serve(ROOT);
const PAGE = arg('page', 'film.html'), url = `http://127.0.0.1:${srv.port}/${EP}/${PAGE}${PAGE.includes('?') ? '&' : '?'}render=1`;
const b = await launch();
const stillDir = path.join(ROOT, 'build', EP, 'stills'); mkdirSync(stillDir, { recursive: true });
const grab = async (page, t) => { await page.evaluate(`renderFrame(${t})`); return page.screenshot(92); };
const check = async page => {
  const err = await page.evaluate('window.ERR || ""');
  if (err || page.logs.some(l => l.startsWith('EXC'))) { console.log('ERR', err, '\n' + page.logs.join('\n')); process.exit(1); }
};
try {
  if (has('srt') || has('events')) {
    const page = await b.open(url); await check(page);
    if (has('events')) {
      const ev = await page.evaluate('JSON.stringify(window.__events)');
      writeFileSync(path.join(ROOT, 'build', EP, 'events.json'), ev); console.log('events', JSON.parse(ev).length);
    }
    if (has('srt')) {
      const cs = JSON.parse(await page.evaluate('chunksJSON()'));
      const ts = x => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
      const srt = cs.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.zh.replace(/[，。、；：]$/, '')}\n${c.en}\n`).join('\n');
      writeFileSync(arg('srt'), srt); console.log(arg('srt'), cs.length, 'cues');
    }
  } else if (has('stills')) {
    const page = await b.open(url); await check(page);
    for (const t of arg('stills').split(',').map(Number)) {
      const out = path.join(stillDir, `t${t.toFixed(2).padStart(7, '0')}.jpg`), t0 = Date.now();
      writeFileSync(out, await grab(page, t));
      console.log(out, Date.now() - t0, 'ms');
    }
    if (page.logs.length) console.log(page.logs.slice(-30).join('\n'));
  } else {
    const pages = await Promise.all(Array.from({ length: WORKERS }, () => b.open(url)));
    for (const p of pages) await check(p);
    const dur = await pages[0].evaluate('window.DURATION');
    const f0 = Math.round(+arg('from', 0) * FPS), f1 = Math.min(Math.round(dur * FPS), Math.round(+arg('to', 1e9) * FPS));
    const out = arg('out', path.join(ROOT, 'build', EP, 'video_noaudio.mp4'));
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = f0; f < f1; f += WORKERS) {
      const batch = [];
      for (let w = 0; w < WORKERS && f + w < f1; w++) batch.push(grab(pages[w], (f + w) / FPS));
      for (const img of await Promise.all(batch)) if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
      if ((f - f0) % (FPS * 10) < WORKERS) {
        const el = (Date.now() - t0) / 1000, done = f - f0 + WORKERS;
        console.log(`frame ${f}/${f1}  ${el.toFixed(0)}s  eta ${(el / done * (f1 - f)).toFixed(0)}s`);
      }
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    for (const p of pages) if (p.logs.some(l => l.startsWith('EXC') || l === 'CRASHED')) console.log(p.logs.join('\n'));
    console.log('done', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} finally { b.kill(); srv.close(); }
