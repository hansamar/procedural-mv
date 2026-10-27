// One command that says whether the film is shippable. Starts its own server and browser.
// usage: node scripts/check.mjs [--out exports/check] [--every 8] [--no-play] [--no-perf]
// Writes <out>/report.json, <out>/frames/f_*.jpg (every N s + both sides of every chapter cut +
// first/last frame) and <out>/sheet.jpg. Exit 0 = no FAIL. A WARN is a judgement call: look at
// the frames, then fix it or accept it in writing (docs/notes.md). Never ship with a FAIL.
// Concept-dependent gates (ending, lyric density, chapter length, lyric size, frame format) follow
// src/scenes/style.js FORMAT / FILM / LYRIC, so a declared concept is checked on its own terms.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startServer, ROOT } from './static-server.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const OUT = path.resolve(opt('--out', path.join(ROOT, 'exports', 'check')));
const EVERY = Number(opt('--every', 8));
const PLAY = !argv.includes('--no-play');
const PERF = !argv.includes('--no-perf');

const results = [];
const add = (status, check, detail = '') => results.push({ status, check, detail });
const pass = (c, d) => add('PASS', c, d);
const warn = (c, d) => add('WARN', c, d);
const fail = (c, d) => add('FAIL', c, d);
const rel = (...p) => path.join(ROOT, ...p);
const has = (f) => fs.existsSync(rel(f));
const readJson = (f) => JSON.parse(fs.readFileSync(rel(f), 'utf8').replace(/^\uFEFF/, ''));
const failed = () => results.some((r) => r.status === 'FAIL');

// per-song settings (style.js is plain constants, so Node can import it)
let STYLE = {};
try {
  STYLE = await import(pathToFileURL(rel('src/scenes/style.js')).href);
} catch (e) {
  fail('style', `src/scenes/style.js does not load in Node (${e.message}): keep it free of imports and browser APIs`);
}
const W = STYLE.FORMAT?.w ?? 1920;
const H = STYLE.FORMAT?.h ?? 1080;
const FILM = { ending: 'loop', lyrics: 'full', maxChapter: 45, ...(STYLE.FILM || {}) };
const LYRIC = { maxW: 0.6 * W, maxH: 0.5 * H, margin: 80, ...(STYLE.LYRIC || {}) };
// lyric-layout WARN limits: the LYRIC defaults plus some slack
const LIM = { w: LYRIC.maxW + 0.1 * W, h: LYRIC.maxH + 0.05 * H, edge: LYRIC.margin / 2 };

// ------------------------------------------------------------------ 1. files on disk
function preflight() {
  const html = has('index.html') ? fs.readFileSync(rel('index.html'), 'utf8') : '';
  const src = /<audio[^>]*\bsrc="([^"]+)"/.exec(html)?.[1];
  if (!src) fail('audio', 'index.html has no <audio src="...">');
  else if (!has(src)) fail('audio', `${src} missing: copy the original song there (new_project.mjs --audio <file>)`);
  else pass('audio', src);
  const need = [
    ['data/audio_features.json', 'python analysis/audio_features.py'],
    ['data/chapters.json', 'python analysis/beat_grid.py'],
  ];
  for (const [f, how] of need) if (!has(f)) fail('data', `${f} missing: run ${how}`);
  if (failed()) return;

  const feat = readJson('data/audio_features.json');
  const ch = readJson('data/chapters.json');
  const d1 = feat.source?.duration_s;
  const d2 = ch.duration_s;
  if (!(Math.abs(d1 - d2) <= 0.05)) fail('data', `duration: audio_features ${d1} s vs chapters.json ${d2} s -> rerun analysis/beat_grid.py`);
  const g = ch.grid || {};
  if (!(g.period > 0)) fail('beat grid', 'chapters.json has no grid.period -> rerun analysis/beat_grid.py');
  else {
    pass('beat grid', `${g.mode || 'constant'} ${(60 / g.period).toFixed(1)} BPM, ${g.beats_per_bar || 4} beats/bar, profile ${g.profile || 'groove'}, quality ${g.quality ?? '?'}`);
    if (g.quality !== undefined && g.quality < 0.4) warn('beat grid', `quality ${g.quality} is low: check the cut frames by eye; rerun beat_grid.py with --bpm / --mode / --meter if cuts miss the beat`);
  }

  if (has('data/song.lrc') && !has('data/lyrics_timed.json')) fail('lyrics', 'data/song.lrc exists but data/lyrics_timed.json does not -> run analysis/align_lyrics.py');
  else if (!has('data/lyrics_timed.json')) warn('lyrics', 'no lyrics: right for an instrumental; for a sung song follow references/analysis.md "No LRC"');
  else if (!has('data/words_timed.json')) warn('lyrics', 'no data/words_timed.json: word times are estimated -> run analysis/align_words.py');

  const plates = has('assets/material/plates.json') ? readJson('assets/material/plates.json') : { images: [] };
  const lost = (plates.images || []).filter((p) => !has(path.join('assets/material', p.file)));
  if (lost.length) fail('material', `plates.json lists missing files: ${lost.slice(0, 5).map((p) => p.file).join(', ')}`);
  const archive = rel('assets/material/archive');
  const archived = fs.existsSync(archive) ? fs.readdirSync(archive).filter((f) => !f.startsWith('.')) : [];
  const sources = has('assets/material/SOURCES.json') ? readJson('assets/material/SOURCES.json').files || [] : null;
  const official = (sources || []).filter((f) => f.official);
  if (plates.images?.length || archived.length || official.length) {
    if (!sources) fail('licences', 'material is used but assets/material/SOURCES.json is missing (references/assets-credits.md)');
    else {
      const listed = new Set(sources.map((f) => f.file).filter(Boolean));
      const name = (f) => f.file || f.title || '(untitled)';
      // open material needs a licence; official material needs its rights holder and the use the user approves
      const bad = sources.filter((f) => !f.official && (!f.license || !f.source_url));
      const badOff = official.filter((f) => !f.source_url || !f.rights || !f.use || !f.used_in?.length);
      const unlisted = archived.filter((f) => !listed.has(`archive/${f}`));
      if (bad.length) fail('licences', `${bad.length} SOURCES.json entries lack license or source_url: ${bad.slice(0, 5).map(name).join(', ')}`);
      if (badOff.length) fail('licences', `${badOff.length} official entries lack source_url, rights, use or used_in: ${badOff.slice(0, 5).map(name).join(', ')} (references/assets-credits.md §Official material)`);
      if (unlisted.length) fail('licences', `archive files without a SOURCES.json entry: ${unlisted.slice(0, 5).join(', ')}`);
      if (!bad.length && !badOff.length && !unlisted.length) pass('licences', `${sources.length} sourced files (${official.length} official)`);
    }
  }
  // official material is rendered only after the user approved it (export.mjs refuses otherwise)
  if (official.length) {
    const ok = (f) => f.approved === true || (typeof f.approved === 'string' && f.approved.trim() !== '');
    const wait = official.filter((f) => !ok(f));
    if (wait.length) warn('official', `${wait.length}/${official.length} official item(s) not approved by the user yet: ${wait.slice(0, 6).map((f) => f.file || f.title).join(', ')} -> show each with its frames at the user check (SKILL.md 5b) and record "approved" in SOURCES.json; export.mjs refuses until then`);
    else pass('official', `${official.length} official item(s) approved by the user`);
  }
  if (!has('credits.md')) warn('credits', 'credits.md missing: write it before delivery (references/assets-credits.md)');

  // static scene hygiene: the picture must be a pure function of t
  // (comments are stripped first, so a note that names a banned call does not trip the check)
  const scenesDir = rel('src/scenes');
  const uncomment = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  for (const f of fs.readdirSync(scenesDir, { recursive: true }).map(String).filter((f) => f.endsWith('.js'))) {
    const code = uncomment(fs.readFileSync(path.join(scenesDir, f), 'utf8'));
    const m = /Math\.random\(|Date\.now\(|performance\.now\(|new Date\(/.exec(code);
    if (m) fail('stateless', `src/scenes/${f.replaceAll('\\', '/')} uses ${m[0]}…: use hash/noise of t or frameIdx(t) instead`);
  }
  // chapters still drawn by a reference demo (demo.js, demo-soft.js, ...), whatever the import is called
  const index = uncomment(fs.readFileSync(path.join(scenesDir, 'index.js'), 'utf8'));
  const demoAliases = [...index.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']\.\/demo[\w-]*\.js["']/g)].map((m) => m[1]);
  const demoIds = demoAliases.length ? [...index.matchAll(new RegExp(`^\\s*"?([\\w-]+)"?\\s*:\\s*pick\\((?:${demoAliases.join('|')})\\b`, 'gm'))].map((m) => m[1]) : [];
  if (demoIds.length) warn('scenes', `still on a demo scene: ${demoIds.join(', ')} -> copy the closest demo into the chapter's own file and make it this song's scene`);
}

// ------------------------------------------------------------------ 2. in the browser
const TW = Math.round(W / 12); // luminance thumbnails (160x90 at 1920x1080)
const TH = Math.round(H / 12);
const LW = Math.round(W / 5); // lyric-layout grid: 5 px per cell
const LH = Math.round(H / 5);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (L) => {
  const m = mean(L);
  return Math.sqrt(mean(L.map((x) => (x - m) ** 2)));
};
const diff = (A, B) => mean(A.map((a, i) => Math.abs(a - B[i]))) / 255;
const fmt = (t) => t.toFixed(2);
// files src/data.js loads only if present
const OPTIONAL = ['/data/lyrics_timed.json', '/data/vocal_onsets.json', '/data/words_timed.json', '/assets/material/plates.json', '/favicon.ico'];

async function openPage(browser, base, query) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  // 404s are judged by URL below (optional data files may be absent); other console errors count
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (r.status() >= 400 && !OPTIONAL.includes(p)) errors.push(`${r.status()} ${p}`);
  });
  await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.mv, null, { timeout: 60000 });
  const bootError = await page.evaluate(() => window.mv.ready.then(() => null, (e) => String(e?.message || e)));
  await page.evaluate(([W, H, LW, LH]) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    const ch = document.createElement('canvas');
    ch.width = LW;
    ch.height = LH;
    const gh = ch.getContext('2d', { willReadFrequently: true });
    window.__chk = {
      // luminance thumbnail of the frame at t (drawn and read in the same task)
      lum(t) {
        window.mv.draw(t);
        g.drawImage(window.mv.canvas, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const L = new Array(W * H);
        for (let i = 0; i < L.length; i++) L[i] = Math.round(0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]);
        return L;
      },
      // finer luminance grid for the lyric-layout bbox (LW x LH; W/LW px per cell)
      lumHi(t) {
        window.mv.draw(t);
        gh.drawImage(window.mv.canvas, 0, 0, LW, LH);
        const d = gh.getImageData(0, 0, LW, LH).data;
        const L = new Array(LW * LH);
        for (let i = 0; i < L.length; i++) L[i] = Math.round(0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]);
        return L;
      },
      jpg(t) {
        window.mv.draw(t);
        return window.mv.canvas.toDataURL('image/jpeg', 0.8);
      },
    };
  }, [TW, TH, LW, LH]);
  return { page, errors, bootError };
}
const lum = (page, t) => page.evaluate((t) => window.__chk.lum(t), t);
const lumHi = (page, t) => page.evaluate((t) => window.__chk.lumHi(t), t);

// Lyric blocks (bboxes in logical px) = what the lyrics add to the frame. A cell is "changed"
// when its luminance differs by more than LYR_DELTA between lyrics-on and ?nolyrics. Changed
// cells within LYR_GAP cells (~40 px) of each other join one block (a line, a stacked phrase);
// blocks with fewer than LYR_MIN cells are specks (antialiasing, a stray particle) and dropped.
// Separate blocks (a headline up top plus the next phrase lower down) are judged one by one.
const LYR_DELTA = 24;
const LYR_GAP = 8;
const LYR_MIN = 40;
function lyricBlocks(A, B) {
  const N = LW * LH;
  const on = new Uint8Array(N);
  for (let i = 0; i < N; i++) on[i] = Math.abs(A[i] - B[i]) > LYR_DELTA ? 1 : 0;
  // dilate by LYR_GAP/2 (separable box max) so nearby glyphs merge into one block
  const r = LYR_GAP >> 1;
  const h = new Uint8Array(N);
  const d = new Uint8Array(N);
  for (let y = 0; y < LH; y++) {
    for (let x = 0, run = -1e9; x < LW; x++) {
      if (on[y * LW + x]) run = x;
      if (x - run <= r) h[y * LW + x] = 1;
    }
    for (let x = LW - 1, run = 1e9; x >= 0; x--) {
      if (on[y * LW + x]) run = x;
      if (run - x <= r) h[y * LW + x] = 1;
    }
  }
  for (let x = 0; x < LW; x++) {
    for (let y = 0, run = -1e9; y < LH; y++) {
      if (h[y * LW + x]) run = y;
      if (y - run <= r) d[y * LW + x] = 1;
    }
    for (let y = LH - 1, run = 1e9; y >= 0; y--) {
      if (h[y * LW + x]) run = y;
      if (run - y <= r) d[y * LW + x] = 1;
    }
  }
  // connected components of the dilated mask; bbox from the undilated changed cells inside each
  const seen = new Uint8Array(N);
  const blocks = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!d[s] || seen[s]) continue;
    let x0 = LW, y0 = LH, x1 = -1, y1 = -1, n = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      const x = i % LW;
      const y = (i - x) / LW;
      if (on[i]) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      for (const j of [x > 0 ? i - 1 : -1, x < LW - 1 ? i + 1 : -1, y > 0 ? i - LW : -1, y < LH - 1 ? i + LW : -1]) {
        if (j >= 0 && d[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (n < LYR_MIN) continue;
    const sx = W / LW;
    const sy = H / LH;
    blocks.push({ x: Math.round(x0 * sx), y: Math.round(y0 * sy), w: Math.round((x1 + 1 - x0) * sx), h: Math.round((y1 + 1 - y0) * sy) });
  }
  return blocks;
}

async function browserChecks(browser, base) {
  const { page, errors, bootError } = await openPage(browser, base, '?export');
  if (bootError) {
    fail('boot', `${bootError} | ${errors.slice(0, 3).join(' | ')} (chapters.js CUTS and the data files are the usual cause)`);
    return;
  }
  const info = await page.evaluate(async () => {
    const { RAW } = await import('/src/scenes/index.js');
    const mv = window.mv;
    const s = mv.signals;
    return {
      duration: mv.duration,
      canvas: [mv.canvas.width, mv.canvas.height],
      chapters: mv.chapters.map((c) => ({ id: c.id, t0: c.t0, t1: c.t1 })),
      raw: Object.keys(RAW),
      accents: s.accents.length,
      lines: mv.lyrics.lines.map((l) => ({ t: l.t, end: l.end, text: l.text, n: l.words.length, aligned: l.aligned })),
    };
  });
  const D = info.duration;
  if (info.canvas.join('x') !== `${W}x${H}`) fail('canvas', `canvas is ${info.canvas.join('x')}, expected ${W}x${H} (style.js FORMAT)`);
  else pass('canvas', `${W}x${H}`);
  pass('boot', `${info.chapters.length} chapters, ${fmt(D)} s, ${info.accents} accents (${(info.accents / (D / 60)).toFixed(0)}/min)`);

  // chapters <-> scenes
  const ids = info.chapters.map((c) => c.id);
  const noScene = ids.filter((id) => !info.raw.includes(id));
  if (noScene.length) fail('scenes', `chapters without a RAW entry in src/scenes/index.js: ${noScene.join(', ')}`);
  const unused = info.raw.filter((id) => !ids.includes(id));
  if (unused.length) warn('scenes', `RAW entries no chapter uses: ${unused.join(', ')}`);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail('chapters', `duplicate chapter ids: ${dup.join(', ')}`);
  for (const c of info.chapters) {
    const len = c.t1 - c.t0;
    if (len < 2) warn('chapters', `"${c.id}" lasts only ${fmt(len)} s`);
    if (len > FILM.maxChapter) warn('chapters', `"${c.id}" lasts ${fmt(len)} s (> FILM.maxChapter ${FILM.maxChapter}): make sure something develops inside it (a lyric event, a new layer), or raise FILM.maxChapter if the concept is a long take`);
  }
  if (!noScene.length && !dup.length) pass('chapters', info.chapters.map((c) => `${c.id}@${fmt(c.t0)}`).join(' '));

  // lyrics data
  const L = info.lines;
  if (L.length) {
    const aligned = L.filter((l) => l.aligned).length;
    const empty = L.filter((l) => !l.n);
    const late = L.filter((l) => l.t > D || l.end > D + 0.5);
    if (empty.length) fail('lyrics', `lines with no words: ${empty.slice(0, 3).map((l) => fmt(l.t)).join(', ')}`);
    if (late.length) fail('lyrics', `lines after the end of the song: ${late.slice(0, 3).map((l) => fmt(l.t)).join(', ')} -> wrong LRC or [offset]`);
    const ratio = aligned / L.length;
    (ratio < 0.8 && has('data/words_timed.json') ? warn : pass)('lyrics', `${L.length} lines, ${aligned} word-aligned (${(ratio * 100).toFixed(0)}%)`);

    // fonts: every lyric glyph should come from a bundled font, not from the machine's fallback
    const chars = [...new Set(L.map((l) => l.text).join(''))].filter((ch) => /\S/.test(ch));
    const missing = await page.evaluate(async (chars) => {
      const { familyFor } = await import('/src/scenes/kit.js');
      await document.fonts.ready;
      // Re-register every bundled @font-face at half size under its own name: a glyph drawn small
      // came from the bundled file, even when the machine has an identical system font installed.
      const probes = new Map(); // family -> probe names
      const rules = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } }).filter((r) => r instanceof CSSFontFaceRule);
      await Promise.all(rules.map(async (r, i) => {
        const fam = r.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        const f = new FontFace(`__probe${i}`, r.style.getPropertyValue('src'), { sizeAdjust: '50%' });
        try { await f.load(); } catch { return; }
        document.fonts.add(f);
        probes.set(fam, [...(probes.get(fam) || []), `"__probe${i}"`]);
      }));
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d', { willReadFrequently: true });
      const print = (font, ch) => {
        g.clearRect(0, 0, 64, 64);
        g.font = font;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText(ch, 32, 48);
        const d = g.getImageData(0, 0, 64, 64).data;
        let h = 0;
        for (let i = 3; i < d.length; i += 4) h = (Math.imul(h, 31) + d[i]) >>> 0;
        return h;
      };
      return chars.filter((ch) => {
        const fams = familyFor(ch).split(',').flatMap((s) => probes.get(s.trim().replace(/["']/g, '')) || []);
        return !fams.length || print(`400 40px ${fams.join(', ')}, monospace`, ch) === print('400 40px monospace', ch);
      });
    }, chars);
    if (missing.length) warn('fonts', `${missing.length} lyric glyph(s) not in the bundled fonts, so they render in whatever the machine falls back to (or as boxes): ${missing.slice(0, 30).join(' ')} -> add an OFL font that covers them (references/engine.md §Fonts)`);
    else pass('fonts', `${chars.length} lyric glyphs covered by bundled fonts`);
  }

  // stateless: the same t must give the same picture whatever was drawn before
  const probes = [0.37, 0.5, 0.71, 0.13, 0.9].map((u) => u * D);
  const first = [];
  for (const t of probes) first.push(await lum(page, t));
  let worst = { d: 0, t: 0 };
  for (let i = probes.length - 1; i >= 0; i--) {
    await lum(page, (probes[i] + D * 0.41) % D);
    const d = diff(first[i], await lum(page, probes[i]));
    if (d > worst.d) worst = { d, t: probes[i] };
  }
  if (worst.d > 0.004) fail('stateless', `draw(${fmt(worst.t)}) changes with draw order (diff ${worst.d.toFixed(3)}): state kept in module variables between frames`);
  else pass('stateless', `max redraw diff ${worst.d.toFixed(4)}`);

  // frames: every N s, both sides of every cut, first and last frame
  const shots = new Map();
  for (let t = 0; t < D; t += EVERY) shots.set(fmt(t), { t, tag: 'every' });
  for (const c of info.chapters.slice(1)) {
    shots.set(fmt(c.t0 - 0.1), { t: c.t0 - 0.1, tag: `out-${c.id}` });
    shots.set(fmt(c.t0 + 0.02), { t: c.t0 + 0.02, tag: `in-${c.id}` });
  }
  shots.set(fmt(0), { t: 0, tag: 'first' });
  shots.set(fmt(D - 0.02), { t: D - 0.02, tag: 'last' });
  const frameDir = path.join(OUT, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });
  for (const f of fs.readdirSync(frameDir)) if (/^f_.*\.jpg$/.test(f)) fs.rmSync(path.join(frameDir, f));
  const flat = [];
  for (const { t, tag } of [...shots.values()].sort((a, b) => a.t - b.t)) {
    const data = await page.evaluate((t) => window.__chk.jpg(t), t);
    fs.writeFileSync(path.join(frameDir, `f_${t.toFixed(2).padStart(7, '0')}_${tag}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    if (std(await lum(page, t)) < 3) flat.push(fmt(t));
  }
  pass('frames', `${shots.size} frames in ${frameDir}`);
  if (flat.length) warn('frames', `nearly uniform frames at ${flat.slice(0, 8).join(', ')} s: intended (a held flat field) or a scene drawing nothing?`);

  // loop: the last frame hands back to frame 0
  const loopD = diff(await lum(page, 0), await lum(page, D - 0.02));
  if (FILM.ending === 'close') pass('loop', `FILM.ending = "close": designed final image, no loop required (first vs last diff ${loopD.toFixed(3)})`);
  else (loopD > 0.15 ? warn : pass)('loop', `first vs last frame diff ${loopD.toFixed(3)}${loopD > 0.15 ? ': a loop ending returns to the opening frame (or set FILM.ending = "close" if the card chose a close)' : ''}`);

  // lyrics are scenery: visible with lyrics on, gone with ?nolyrics
  if (L.length) {
    const nl = await openPage(browser, base, '?export&nolyrics');
    const step = Math.max(1, Math.floor(L.length / 8));
    const samples = L.filter((_, i) => i % step === 0).map((l) => (l.t + Math.min(l.end, l.t + 2)) / 2);
    const hidden = [];
    // visible = at least one lyric block (same cell test as the layout check below), so a small or dark first word still counts
    for (const t of samples) if (!lyricBlocks(await lumHi(page, t), await lumHi(nl.page, t)).length) hidden.push(fmt(t));
    if (FILM.lyrics === 'off') pass('lyrics on screen', `FILM.lyrics = "off": no sung words required (${samples.length - hidden.length}/${samples.length} sampled moments show some)`);
    else if (hidden.length === samples.length) fail('lyrics on screen', 'lyrics on and ?nolyrics render the same frames: no scene draws the sung words (or ?nolyrics is ignored; or set FILM.lyrics = "off" if the user asked for no lyrics)');
    else if (hidden.length && FILM.lyrics === 'key') pass('lyrics on screen', `FILM.lyrics = "key": ${samples.length - hidden.length}/${samples.length} sampled sung moments set`);
    else if (hidden.length) warn('lyrics on screen', `no visible lyric while singing at ${hidden.join(', ')} s (intended? set FILM.lyrics = "key")`);
    else pass('lyrics on screen', `${samples.length} sung moments checked`);

    // lyric layout: the sung words must fit the frame (not overflow, not run into the edges)
    const lstep = Math.max(1, Math.ceil(L.length / 40));
    const lsamples = L.filter((_, i) => i % lstep === 0).map((l) => (l.t + Math.min(l.end, l.t + 2)) / 2);
    const bad = [];
    let measured = 0;
    let widest = 0;
    for (const t of lsamples) {
      const blocks = lyricBlocks(await lumHi(page, t), await lumHi(nl.page, t));
      if (!blocks.length) continue;
      measured++;
      const issues = [];
      for (const b of blocks) {
        widest = Math.max(widest, b.w);
        const why = [];
        if (b.w > LIM.w) why.push(`w ${((b.w / W) * 100).toFixed(0)}%`);
        if (b.h > LIM.h) why.push(`h ${((b.h / H) * 100).toFixed(0)}%`);
        if (b.x < LIM.edge || b.y < LIM.edge || b.x + b.w > W - LIM.edge || b.y + b.h > H - LIM.edge) why.push('edge');
        if (why.length) issues.push(`[${b.x},${b.y} ${b.w}x${b.h}] ${why.join('/')}`);
      }
      if (issues.length) bad.push(`${fmt(t)}s ${issues.join(' ')}`);
    }
    if (bad.length) {
      warn('lyric layout', `${bad.length}/${measured} sung moments have a lyric block past the style.js LYRIC limits (x,y wxh in ${W}x${H}; limits w ${Math.round(LIM.w)} h ${Math.round(LIM.h)} edge ${LIM.edge}): ${bad.slice(0, 8).join('; ')}${bad.length > 8 ? '; ...' : ''} -> fit the type with kit.js lyricBox / fitRows, or, if the concept is built on giant type, raise LYRIC in style.js and note it on the card. Gate only the letters with ctx.lyricsOn: a backdrop that changes with lyricsOn also counts as lyric`);
    } else if (measured) {
      pass('lyric layout', `${measured} sung moments within the LYRIC limits (widest lyric ${widest} px of ${W})`);
    }
    errors.push(...nl.errors);
    await nl.page.close();
  }

  // perf: preview has to keep up with playback (export is offline and does not)
  if (PERF) {
    const per = await page.evaluate(async () => {
      const mv = window.mv;
      const gl = mv.canvas.getContext('webgl2');
      const res = {};
      const step = Math.max(1, mv.duration / 120);
      for (let t = 0.2; t < mv.duration - 0.1; t += step) {
        mv.draw(t);
        const a = performance.now();
        for (let k = 1; k <= 3; k++) mv.draw(t + k / 60);
        gl?.finish();
        const ms = (performance.now() - a) / 3;
        const id = mv.chapters.filter((c) => t >= c.t0).at(-1).id;
        (res[id] ??= []).push(ms);
      }
      return Object.entries(res).map(([id, v]) => {
        v.sort((a, b) => a - b);
        return { id, p90: v[Math.floor(v.length * 0.9)], max: v.at(-1) };
      });
    });
    const slow = per.filter((c) => c.p90 > 16.7);
    if (slow.length) warn('perf', `p90 draw > 16.7 ms (preview drops frames, export unaffected): ${slow.map((c) => `${c.id} ${c.p90.toFixed(1)}ms`).join(', ')}`);
    else pass('perf', `worst p90 ${Math.max(...per.map((c) => c.p90)).toFixed(1)} ms`);
  }

  if (errors.length) fail('browser errors', [...new Set(errors)].slice(0, 8).join(' | '));
  else pass('browser errors', 'none');
  await page.close();
}

// realtime playback in the normal (non-export) page
async function playCheck(browser, base) {
  const { page, errors, bootError } = await openPage(browser, base, '');
  if (bootError) return;
  await page.waitForFunction(() => !document.getElementById('play').disabled, null, { timeout: 60000 });
  await page.click('#play');
  await page.waitForTimeout(2000);
  const t = await page.evaluate(() => window.mv.audio.currentTime);
  if (errors.length) fail('playback', [...new Set(errors)].slice(0, 5).join(' | '));
  else (t > 1 ? pass : warn)('playback', `audio clock at ${t.toFixed(2)} s after 2 s of play${t > 1 ? '' : ' (headless audio may be blocked: open the page and press play)'}`);
  await page.close();
}

// ------------------------------------------------------------------ main
preflight();
if (!failed()) {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11'] });
  try {
    await browserChecks(browser, base);
    if (PLAY && !failed()) await playCheck(browser, base);
  } catch (e) {
    fail('check.mjs', e.stack || String(e));
  } finally {
    await browser.close();
    server.close();
  }
  const frames = path.join(OUT, 'frames');
  if (fs.existsSync(frames)) {
    const sheet = path.join(OUT, 'sheet.jpg');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'contact_sheet.mjs'), frames, sheet, '--cols', '8', '--width', '320'], { encoding: 'utf8' });
    if (r.status === 0) pass('contact sheet', sheet);
    else warn('contact sheet', (r.stderr || r.stdout).split('\n').find((l) => /Error/.test(l)) || 'contact_sheet.mjs failed');
  }
}

const count = (s) => results.filter((r) => r.status === s).length;
const report = { ok: !failed(), pass: count('PASS'), warn: count('WARN'), fail: count('FAIL'), results };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check.padEnd(16)} ${r.detail}`);
console.log(`\n${report.ok ? 'OK' : 'NOT SHIPPABLE'}: ${report.pass} pass, ${report.warn} warn, ${report.fail} fail -> ${path.join(OUT, 'report.json')}`);
process.exit(report.ok ? 0 : 1);
