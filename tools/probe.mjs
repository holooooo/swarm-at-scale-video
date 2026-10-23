// Evaluate an expression in the film page (debugging): node tools/probe.mjs ep01-boids "expr"
import { launch } from './cdp.mjs';
import { serve } from './serve.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srv = await serve(ROOT), b = await launch();
try {
  const page = await b.open(`http://127.0.0.1:${srv.port}/${process.argv[2]}/film.html?render=1`);
  console.log(await page.evaluate(process.argv[3]));
  if (page.logs.length) console.log(page.logs.slice(-20).join('\n'));
} finally { b.kill(); srv.close(); }
