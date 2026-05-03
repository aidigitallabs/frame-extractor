import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 4180;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = normalize(join(root, decoded)).replace(/[\\/]+$/, '');
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target || root;
}

async function resolveFile(target) {
  try {
    const s = await stat(target);
    if (s.isDirectory()) {
      const idx = join(target, 'index.html');
      const si = await stat(idx);
      if (si.isFile()) return idx;
      return null;
    }
    if (s.isFile()) return target;
  } catch {}
  return null;
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  const target = safeJoin(ROOT, url === '/' ? '/index.html' : url);
  if (!target) { res.writeHead(403); res.end('Forbidden'); return; }

  const file = await resolveFile(target);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }

  try {
    const data = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error: ' + err.message);
  }
});

function lanAddresses() {
  const out = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log(`frame-extractor served from: ${ROOT}`);
  console.log(`  local:    http://localhost:${PORT}/`);
  for (const ip of lanAddresses()) {
    console.log(`  network:  http://${ip}:${PORT}/`);
  }
});
