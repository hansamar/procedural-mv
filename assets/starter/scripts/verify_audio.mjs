// Compares the decoded PCM of two audio-bearing files (sample-identical check).
// Both are decoded with ffmpeg to s32le PCM and streamed through SHA-256 (no full buffering).
//
// Usage: node scripts/verify_audio.mjs <source> <output> [--json <file>] [--seconds <n>]
//   --seconds n  compare only the first n seconds of decoded PCM of both files (prefix check)
// Exit codes: 0 = PCM equal, 1 = PCM differs, 2 = error.
// ffmpeg: FFMPEG_PATH env, else ffmpeg on PATH, else imageio-ffmpeg (scripts/ffmpeg-path.mjs).

import { findFfmpeg } from './ffmpeg-path.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';


function parseArgs(argv) {
  const pos = [];
  let jsonOut = null;
  let seconds = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') {
      if (i + 1 >= argv.length) throw new Error('missing value for --json');
      jsonOut = path.resolve(argv[++i]);
    } else if (argv[i] === '--seconds') {
      if (i + 1 >= argv.length) throw new Error('missing value for --seconds');
      seconds = Number(argv[++i]);
      if (!(seconds > 0)) throw new Error('--seconds must be > 0');
    } else if (argv[i].startsWith('--')) {
      throw new Error(`unknown argument: ${argv[i]}`);
    } else {
      pos.push(argv[i]);
    }
  }
  if (pos.length !== 2) throw new Error('usage: node scripts/verify_audio.mjs <source> <output> [--json <file>]');
  return { source: path.resolve(pos[0]), output: path.resolve(pos[1]), jsonOut, seconds };
}

function resolveFfmpeg() {
  const p = findFfmpeg();
  return p;
}

// SHA-256 of the file bytes, streamed.
function fileSha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const rs = fs.createReadStream(file);
    rs.on('data', (c) => h.update(c));
    rs.on('error', reject);
    rs.on('end', () => resolve(h.digest('hex')));
  });
}

// Audio stream description from `ffmpeg -i` stderr (ffmpeg exits 1 with no output; that is expected).
function formatOf(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const line = r.stderr.split(/\r?\n/).find((l) => /Stream #\d+:\d+.*: Audio:/.test(l));
  if (!line) throw new Error(`no audio stream found in ${file}:\n${r.stderr}`);
  return line.replace(/^\s*Stream #\S+:\s*/, '').trim();
}

// Streams decoded PCM through SHA-256. Resolves { sha256, bytes }.
function pcmSha256(ffmpeg, file, seconds) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let bytes = 0;
    let err = '';
    const limit = seconds ? ['-t', String(seconds)] : [];
    const ff = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', file, '-map', '0:a:0', '-vn', ...limit,
      '-f', 's32le', '-acodec', 'pcm_s32le', '-',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    ff.stdout.on('data', (c) => { bytes += c.length; h.update(c); });
    ff.stderr.on('data', (d) => { err += d; });
    ff.once('error', reject);
    ff.once('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg decode of ${file} exited ${code}: ${err}`));
      else resolve({ sha256: h.digest('hex'), bytes });
    });
  });
}

async function main() {
  const { source, output, jsonOut, seconds } = parseArgs(process.argv.slice(2));
  const ffmpeg = resolveFfmpeg();
  for (const f of [source, output]) if (!fs.existsSync(f)) throw new Error(`missing file: ${f}`);

  const t0 = Date.now();
  const sourceContainer = await fileSha256(source);
  const srcFmt = formatOf(ffmpeg, source);
  const outFmt = formatOf(ffmpeg, output);
  const src = await pcmSha256(ffmpeg, source, seconds);
  const out = await pcmSha256(ffmpeg, output, seconds);

  const result = {
    source,
    output,
    seconds_compared: seconds,
    source_container_sha256: sourceContainer,
    source_sha256_pcm: src.sha256,
    output_sha256_pcm: out.sha256,
    equal: src.sha256 === out.sha256,
    source_pcm_bytes: src.bytes,
    output_pcm_bytes: out.bytes,
    source_format: srcFmt,
    output_format: outFmt,
    pcm_decode_format: 's32le (pcm_s32le), -map 0:a:0 -vn',
    runtime_sec: (Date.now() - t0) / 1000,
  };
  const json = JSON.stringify(result, null, 2) + '\n';
  if (jsonOut) fs.writeFileSync(jsonOut, json);
  process.stdout.write(json);
  process.exitCode = result.equal ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`VERIFY ERROR: ${err.stack || err}\n`);
  process.exitCode = 2;
});
