// Render single frames to JPG (starts its own server; no dev server needed).
// usage: node scripts/shots.mjs <outdir> <t1> [t2 ...] [--nolyrics] [--look flat|soft|ink|visualizer|<file.js>:<export>]
// --look draws that scene on every chapter (a concept test frame without editing RAW).
// Prints {"frames":[...], "errors":[...]}; exit 1 if the page logged errors.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startServer, ROOT } from './static-server.mjs';

const { FORMAT = { w: 1920, h: 1080 } } = await import(pathToFileURL(path.join(ROOT, 'src/scenes/style.js')).href);

const args = process.argv.slice(2);
const li = args.indexOf('--look');
const look = li >= 0 ? args.splice(li, 2)[1] : null;
const nolyrics = args.includes('--nolyrics');
const [out, ...rest] = args.filter((a) => a !== '--nolyrics');
const times = rest.map(Number);
if (!out || !times.length || times.some((t) => !Number.isFinite(t)) || (li >= 0 && !look)) {
  console.error('usage: node scripts/shots.mjs <outdir> <t1> [t2 ...] [--nolyrics] [--look flat|soft|ink|visualizer|<file.js>:<export>]');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11'] });
const errors = [];
const frames = [];
try {
  const page = await browser.newPage({ viewport: { width: FORMAT.w, height: FORMAT.h } });
  // 404s are judged by URL (optional data files may be absent, e.g. instrumentals); other console errors count
  const OPTIONAL = ['/data/lyrics_timed.json', '/data/vocal_onsets.json', '/data/words_timed.json', '/assets/material/plates.json', '/favicon.ico'];
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (r.status() >= 400 && !OPTIONAL.includes(p)) errors.push(`${r.status()} ${p}`);
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?export${nolyrics ? '&nolyrics' : ''}${look ? `&look=${encodeURIComponent(look)}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mv, null, { timeout: 60000 });
  await page.evaluate(() => window.mv.ready);
  for (const t of times) {
    const data = await page.evaluate((t) => {
      window.mv.draw(t);
      return window.mv.canvas.toDataURL('image/jpeg', 0.85);
    }, t);
    const file = path.join(out, `f_${t.toFixed(2).padStart(7, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    frames.push(file);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify({ frames, errors: errors.slice(0, 20) }, null, 2));
process.exit(errors.length ? 1 : 0);
