#!/usr/bin/env node
// Minimal static file server for local use and tests (no dependencies).
//   npm run serve            -> http://127.0.0.1:4173/threat-tiger.html
//   PORT=8080 npm run serve
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 4173;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.md': 'text/markdown; charset=utf-8',
};

createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (rel === '/') rel = '/threat-tiger.html';
  const file = path.join(root, path.normalize(rel));
  // Stay inside the project and never serve dot-folders (.git, .remember) or dependencies.
  if (!file.startsWith(root + path.sep) || /[\\/](\.|node_modules)/.test(path.relative(root, file))) { res.writeHead(404).end(); return; }
  let stat;
  try { stat = statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
  if (!stat.isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Threat Tiger: http://127.0.0.1:${port}/threat-tiger.html`));
