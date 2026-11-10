// Minimal static server for the production build (hash routing: no fallback needed).
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function serve(root, port) {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = normalize(join(root, url === '/' ? 'index.html' : url));
    if (!file.startsWith(normalize(root))) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404).end();
    }
  });
  // a busy port (EADDRINUSE) fails the run instead of measuring someone else's server
  return new Promise((resolve, reject) => {
    server.once('error', (e) => reject(new Error(`perf server on port ${port}: ${e.message} (set PERF_PORT)`)));
    server.listen(port, () => resolve(server));
  });
}
