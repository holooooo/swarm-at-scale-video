// Tiny static server for the film pages (ES modules + fetch need http://, not file://).
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };
export function serve(root, port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(root)) { rsp.writeHead(403); return rsp.end(); }
      let f = p;
      try { if (statSync(f).isDirectory()) f = path.join(f, 'index.html'); statSync(f); } catch { rsp.writeHead(404); return rsp.end('not found'); }
      rsp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      createReadStream(f).pipe(rsp);
    });
    srv.listen(port, '127.0.0.1', () => res({ port: srv.address().port, close: () => srv.close() }));
  });
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(process.argv[2] || '.'), port = +(process.argv[3] || 8017);
  serve(root, port).then(s => console.log(`serving ${root} at http://127.0.0.1:${s.port}/`));
}
