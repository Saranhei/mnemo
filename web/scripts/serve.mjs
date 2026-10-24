// Servidor local para probar la app con las mismas cabeceras de seguridad que en producción.
//
//   node scripts/serve.mjs dist        → http://localhost:5173
//
// Solo para desarrollo: escucha únicamente en esta computadora (127.0.0.1).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.PORT ?? 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Lee las mismas cabeceras que se publican (archivo _headers), sección "/*".
async function securityHeaders() {
  try {
    const text = await readFile(join(root, '_headers'), 'utf8');
    const block = text.split(/\n(?=\/)/).find((b) => b.startsWith('/*')) ?? '';
    return Object.fromEntries(
      block.split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const headers = await securityHeaders();

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`Mnemo en http://localhost:${port}  (carpeta: ${root})`));
