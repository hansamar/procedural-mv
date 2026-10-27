// Offline exporter: draws independent browser frames at exact frame-index timestamps,
// pipes PNG frames into ffmpeg (libx264), then muxes the ORIGINAL FLAC as lossless ALAC.
// --out exports/name.mp4 writes ONE file: AAC 320k, plays in any player.
// On the way it muxes a temporary lossless ALAC master, proves it bit-exact against the
// source with verify_audio.mjs (export fails if not), encodes the AAC copy from it, then
// deletes the master. --keep-master keeps it as exports/name.alac-master.mp4.
// --no-aac writes only the ALAC file at --out (some players play ALAC-in-MP4 silently).
//
// Usage:
//   node scripts/export.mjs --out <file.mp4> [--from <sec>] [--to <sec>] [--fps 60]
//                           [--width <px>] [--encoder h264_nvenc]
//                           [--silent-out <file.mp4>] [--no-mux] [--no-aac] [--keep-master]
//   --width: output width, default = style.js FORMAT width; the height follows the aspect
//            (16:9 4K = 3840, 9:16 4K = 2160)
// ffmpeg: FFMPEG_PATH env, else ffmpeg on PATH, else imageio-ffmpeg (scripts/ffmpeg-path.mjs).
// Refuses to start while assets/material/SOURCES.json has an official entry without "approved".

import { findFfmpeg } from './ffmpeg-path.mjs';
import { startServer, ROOT } from './static-server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

// the original song: assets/audio/song.<ext> (flac preferred)
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');
const AUDIO_SRC = ['flac', 'wav', 'aiff', 'm4a', 'mp3', 'ogg'].map((e) => path.join(AUDIO_DIR, `song.${e}`)).find((f) => fs.existsSync(f)) ?? path.join(AUDIO_DIR, 'song.flac');

// ---------- args ----------
function parseArgs(argv) {
  const o = { out: null, from: 0, to: null, fps: 60, width: null, encoder: 'libx264', silentOut: null, noMux: false, noAac: false, keepMaster: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--out': o.out = next(); break;
      case '--from': o.from = Number(next()); break;
      case '--to': o.to = Number(next()); break;
      case '--fps': o.fps = Number(next()); break;
      case '--width': o.width = Number(next()); break;
      case '--encoder': o.encoder = next(); break;
      case '--silent-out': o.silentOut = next(); break;
      case '--no-mux': o.noMux = true; break;
      case '--no-aac': o.noAac = true; break;
      case '--keep-master': o.keepMaster = true; break;
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  if (!o.out) throw new Error('--out <file.mp4> is required');
  if (!(o.fps > 0)) throw new Error('--fps must be > 0');
  if (o.width !== null && (!Number.isInteger(o.width) || o.width <= 0 || o.width % 2)) throw new Error('--width must be a positive even integer');
  if (!['libx264', 'h264_nvenc'].includes(o.encoder)) throw new Error('unsupported --encoder');
  if (!Number.isFinite(o.from) || o.from < 0) throw new Error('--from must be >= 0');
  if (o.to !== null && !(o.to > o.from)) throw new Error('--to must be > --from');
  o.out = path.resolve(o.out);
  if (o.silentOut) o.silentOut = path.resolve(o.silentOut);
  // ALAC master: --out itself with --no-aac, else <name>.alac-master.mp4 beside the AAC file
  // (temporary unless --keep-master)
  o.master = o.noAac ? o.out : o.out.replace(/\.mp4$/i, '') + '.alac-master.mp4';
  return o;
}

// ---------- ffmpeg ----------
function resolveFfmpeg(needAac) {
  const p = findFfmpeg();
  const enc = spawnSync(p, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(`ffmpeg at ${p} failed to run: ${enc.stderr}`);
  for (const name of ['libx264', 'alac', ...(needAac ? ['aac'] : [])]) {
    if (!new RegExp(`\\s${name}\\s`).test(enc.stdout)) {
      throw new Error(`ffmpeg at ${p} lacks encoder ${name}${name === 'aac' ? ' (pass --no-aac to write only the ALAC master)' : ''}`);
    }
  }
  return p;
}

// ---------- official material: rendered only after the user approved it ----------
// (SKILL.md contract 2, references/assets-credits.md §Official material)
function officialGate() {
  const src = path.join(ROOT, 'assets', 'material', 'SOURCES.json');
  if (!fs.existsSync(src)) return;
  let files;
  try {
    files = JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '')).files || [];
  } catch (e) {
    throw new Error(`assets/material/SOURCES.json is not valid JSON: ${e.message}`);
  }
  const ok = (f) => f.approved === true || (typeof f.approved === 'string' && f.approved.trim() !== '');
  const wait = files.filter((f) => f.official && !ok(f));
  if (wait.length) {
    throw Object.assign(new Error(`not rendering: ${wait.length} official item(s) lack the user's approval: ${wait.map((f) => f.file || f.title).join(', ')}\n` +
      '  -> show the user each item (what, where, how it is treated, rights holder) with a frame where it appears, record "approved" in SOURCES.json, and take rejected items out of the film and the file'), { plain: true }); // a rule, not a crash: no stack
  }
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  officialGate();
  // output size: --width (default = the logical width in style.js FORMAT); height follows the aspect
  const { FORMAT = { w: 1920, h: 1080 } } = await import(pathToFileURL(path.join(ROOT, 'src/scenes/style.js')).href);
  const W = args.width ?? FORMAT.w;
  const H = (W * FORMAT.h) / FORMAT.w;
  if (!Number.isInteger(W) || W <= 0 || W % 2 || !Number.isInteger(H) || H % 2) throw new Error(`--width ${W} gives a ${W}x${H} frame for a ${FORMAT.w}x${FORMAT.h} film: both sides must be whole even numbers`);
  const ffmpeg = resolveFfmpeg(!args.noMux && !args.noAac);
  if (!fs.existsSync(AUDIO_SRC)) throw new Error(`missing audio source ${AUDIO_SRC}`);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });

  const server = await startServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html?export=1&width=${W}`;
  log(`static server on 127.0.0.1:${port}, root=${ROOT}`);
  log(`ffmpeg=${ffmpeg}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const started = Date.now(); // node-side progress timing only, never used in the page
  let summary;
  let audioEqual = null; // true once verify_audio.mjs proved the ALAC master
  let ffChild = null;
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await context.newPage();
    const pageErrors = [];
    const watch = p => p.on('pageerror', e => { pageErrors.push(e.message); log(`[page error] ${e.message}`); });
    watch(page);
    page.on('console', (m) => { if (m.type() === 'error') log(`[page console.error] ${m.text()}`); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.mv);
    await page.evaluate(() => window.mv.ready);

    const info = await page.evaluate(() => ({
      duration: window.mv.duration,
      w: window.mv.canvas.width,
      h: window.mv.canvas.height,
    }));
    if (info.w !== W || info.h !== H) throw new Error(`canvas is ${info.w}x${info.h}, expected ${W}x${H}`);
    const duration = info.duration;
    if (!(duration > 0)) throw new Error(`invalid duration ${duration}`);
    let to = args.to ?? duration;
    if (to > duration + 1e-9) {
      log(`--to ${to} exceeds duration ${duration}; clamping`);
      to = duration;
    }
    if (args.from >= to) throw new Error(`from (${args.from}) >= to (${to})`);
    log(`duration=${duration}s  range=[${args.from}, ${to})  fps=${args.fps}`);

    // Independent offline frames share a timeline, with a bounded queue to preserve encoding order.
    const pages = [page];
    const workers = 4;
    for (let i = 1; i < workers; i++) {
      const worker = await context.newPage();
      watch(worker);
      await worker.goto(url, { waitUntil: 'load' });
      await worker.waitForFunction(() => window.mv);
      await worker.evaluate(() => window.mv.ready);
      pages.push(worker);
    }

    const silentPath = args.silentOut ?? (args.noMux ? args.out : args.out.replace(/\.mp4$/i, '') + '.silent.mp4');
    const maxAllowed = 0.5 / args.fps;
    let maxDrift = 0;
    let frames = 0;
    const videoOptions = args.encoder === 'h264_nvenc'
      ? ['-c:v', 'h264_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-cq', '16', '-b:v', '0']
      : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16'];
    const ff = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(args.fps), '-i', '-',
      ...videoOptions, '-pix_fmt', 'yuv420p', '-r', String(args.fps),
      '-movflags', '+faststart',
      silentPath,
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    ffChild = ff;
    let ffErr = '';
    ff.stderr.on('data', (d) => { ffErr += d; });
    ff.stdin.on('error', () => {}); // EPIPE is reported via ffDone, not as an uncaught error
    const ffDone = new Promise((resolve, reject) => {
      ff.once('error', reject);
      ff.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr}`))));
    });
    ffDone.catch(() => {}); // avoid unhandled rejection; awaited below

    const frameCount = Math.ceil((to - args.from) * args.fps - 1e-9);
    async function render(i) {
      const tt = args.from + i / args.fps;
      const result = await pages[i % workers].evaluate(async ({ tt, offline }) => {
        if (offline) window.mv.draw(tt);
        const actual = offline ? tt : await window.mv.seek(tt);
        return { actual, data: window.mv.canvas.toDataURL('image/png') };
      }, { tt, offline: true });
      return { actual: result.actual, png: Buffer.from(result.data.slice(result.data.indexOf(',') + 1), 'base64') };
    }
    const queue = [];
    function enqueue(i) {
      if (i >= frameCount) return;
      const job = render(i);
      job.catch(() => {});
      queue.push(job);
    }
    for (let i = 0; i < workers; i++) enqueue(i);

    for (let i = 0; ; i++) {
      const t = args.from + i / args.fps;
      if (t >= to - 1e-9) break;
      if (ff.exitCode !== null) throw new Error(`ffmpeg exited early (${ff.exitCode}): ${ffErr}`);
      const { actual, png } = await queue.shift();
      const drift = Math.abs(actual - t);
      if (drift > maxDrift) maxDrift = drift;
      if (!ff.stdin.write(png)) await once(ff.stdin, 'drain');
      frames++;
      enqueue(i + workers);
      if (i % 120 === 0) {
        log(`frame ${i}  t=${t.toFixed(4)}s  elapsed=${((Date.now() - started) / 1000).toFixed(1)}s`);
      }
    }
    ff.stdin.end();
    await ffDone;
    if (pageErrors.length) throw new Error(`browser render errors: ${pageErrors.join('; ')}`);
    log(`encoded ${frames} frames -> ${silentPath}`);

    if (maxDrift > maxAllowed) {
      throw new Error(`max seek drift ${maxDrift.toExponential(3)}s exceeds 0.5/fps=${maxAllowed.toExponential(3)}s`);
    }

    if (!args.noMux) {
      const mux = spawnSync(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', silentPath,
        '-ss', String(args.from), '-t', (frames / args.fps).toFixed(9), '-i', AUDIO_SRC,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'alac',
        '-movflags', '+faststart',
        args.master,
      ], { encoding: 'utf8' });
      if (mux.status !== 0) throw new Error(`mux failed: ${mux.stderr}`);
      log(`muxed ALAC master -> ${args.master}`);
      if (!args.silentOut) fs.rmSync(silentPath, { force: true });

      // audio proof on the lossless master before anything lossy is made from it
      if (args.from === 0) {
        const clip = to < duration ? ['--seconds', (frames / args.fps).toFixed(6)] : [];
        const v = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify_audio.mjs'), AUDIO_SRC, args.master, ...clip], { encoding: 'utf8' });
        let res = null;
        try { res = JSON.parse(v.stdout); } catch {}
        if (!res || res.equal !== true) throw new Error(`audio proof failed (master kept: ${args.master}): ${v.stdout}${v.stderr}`);
        audioEqual = true;
        log(`audio proof: PCM equal (sha256 ${res.output_sha256_pcm.slice(0, 16)}...)`);
      } else {
        log('audio proof skipped (--from > 0); verify a clip from 0 if needed');
      }

      if (!args.noAac) {
        // playback copy: same video stream (copied), audio from the ALAC master encoded to AAC 320k
        const aac = spawnSync(ffmpeg, [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', args.master,
          '-map', '0:v:0', '-map', '0:a:0',
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
          '-movflags', '+faststart',
          args.out,
        ], { encoding: 'utf8' });
        if (aac.status !== 0) throw new Error(`AAC playback mux failed: ${aac.stderr}`);
        log(`muxed AAC playback copy -> ${args.out}`);
        if (!args.keepMaster) { fs.rmSync(args.master, { force: true }); log('deleted the temporary ALAC master (--keep-master keeps it)'); }
      }
      log(`DELIVER: ${args.out}${args.noAac ? '  (ALAC only: some players play it silently; drop --no-aac for AAC)' : '  (AAC 320k, plays in any player)'}`);
      if (args.noAac || args.keepMaster) log(`MASTER:  ${args.master}  (lossless ALAC)`);
    }

    summary = {
      frames_written: frames,
      fps: args.fps,
      encoder: args.encoder,
      render_workers: workers,
      timing_mode: 'offline-frame-index',
      browser_errors: pageErrors,
      from: args.from,
      to,
      duration,
      width: W,
      height: H,
      max_drift_sec: null,
      drift_limit_sec: maxAllowed,
      audio_pcm_equal: audioEqual,
      runtime_sec: (Date.now() - started) / 1000,
      outputs: {
        out: args.out,
        master: args.noMux || !(args.noAac || args.keepMaster) ? null : args.master,
        playback: args.noMux ? null : args.out,
        silent: args.noMux || args.silentOut ? silentPath : null,
      },
      sizes_bytes: {
        out: args.noMux ? null : fs.statSync(args.out).size,
        master: args.noMux || args.noAac || !args.keepMaster ? null : fs.statSync(args.master).size,
        silent: fs.existsSync(silentPath) ? fs.statSync(silentPath).size : null,
      },
    };
  } finally {
    if (ffChild && ffChild.exitCode === null) ffChild.kill();
    await browser.close();
    server.close();
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

function log(msg) {
  process.stderr.write(msg + '\n');
}

main().catch((err) => {
  process.stderr.write(`EXPORT FAILED: ${err.plain ? err.message : err.stack || err}\n`);
  process.exit(1);
});
