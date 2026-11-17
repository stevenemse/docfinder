// Serveur de vérification : sert dist/ avec EXACTEMENT les en-têtes de vercel.json.
// But : vérifier que la CSP ne casse pas l'app (aucune violation console).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'dist');
const vercel = JSON.parse(await readFile(resolve(process.cwd(), 'vercel.json'), 'utf8'));
const headers = Object.fromEntries(
  vercel.headers[0].headers.map((h) => [h.key, h.value])
);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = join(ROOT, decodeURIComponent(url.pathname));
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', ...headers });
    res.end(body);
  } catch {
    res.writeHead(404, headers);
    res.end('not found');
  }
}).listen(3000, '0.0.0.0', () => console.log('csp-check on 3000'));
