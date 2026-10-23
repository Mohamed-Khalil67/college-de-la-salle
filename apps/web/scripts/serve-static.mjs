// Usage: node scripts/serve-static.mjs [port]   (default 4610)
// Serves the production build (dist/college-website/browser) the way nginx/default.conf does: a file, else the
// prerendered <path>/index.html, else the client-rendered shell index.csr.html. Every /api request answers 401,
// as the API does for a visitor who is not signed in: enough for the public pages and the login entry, with no
// database. Used by the public-site e2e spec (npm run e2e:public).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/college-website/browser', import.meta.url)));
const port = Number(process.argv[2] ?? 4610);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function file(path) {
  const full = normalize(join(root, path));
  return full.startsWith(root) && existsSync(full) && statSync(full).isFile() ? full : null;
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  if (path.startsWith('/api/')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ statusCode: 401, message: 'Non authentifié' }));
    return;
  }
  const found = file(path) ?? file(join(path, 'index.html')) ?? file('index.csr.html');
  res.writeHead(200, { 'content-type': types[extname(found)] ?? 'application/octet-stream' });
  createReadStream(found).pipe(res);
}).listen(port, () => console.log(`Serving ${root} on http://localhost:${port}`));
