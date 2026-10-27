// Static file server for the project folder (Range-capable, root-confined, no cache).
// startServer(port = 0) -> Promise<http.Server>; port 0 = any free port (server.address().port).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function handle(req, res) {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = path.resolve(ROOT, '.' + (urlPath === '/' ? '/index.html' : urlPath));
    const rel = path.relative(ROOT, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return res.writeHead(403).end('forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end('not found');
    const size = fs.statSync(file).size;
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    };
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!m || (m[1] === '' && m[2] === '')) return res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
      if (start >= size || start > end) return res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.writeHead(500);
    res.end(String(err));
  }
}

export function startServer(port = 0, host = '127.0.0.1') {
  const server = http.createServer(handle);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
