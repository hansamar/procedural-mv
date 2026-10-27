# Engine

Contents: layout · what to edit · CUTS · scene contract · ctx · signals · lyrics · post · registry and progress · lyric layout and groove · looks.js · fonts · query flags and window.mv · alternative renderers

## Layout

```
index.html, src/main.js       player (#play button; [ and ] nudge A/V by 10 ms); ?export hides the UI and exposes window.mv
src/data.js                   loads data/*.json, assets/material/plates.json and its images (optional files may be absent)
src/engine/renderer.js        draw(t): scene(ctx) paints a 2D plate -> post settings -> WebGL2 post pass
src/engine/post.js            post pass and POST_DEFAULTS
src/engine/render-size.js     ?export&width=<px> renders the same FORMAT layout at any even width (4K)
src/engine/space.js           small 3D: camera(), plane(), drawQuad(), quadPath()
src/engine/util.js            clamp lerp mix3 ease.* prog pulse springStep ring frameIdx hash noise1 keys lastIndex TAU
src/timeline/signals.js       musical signals (below)
src/timeline/chapters.js      CUTS table -> chapters on the beat grid
src/lyrics/words.js           lyric API (below); partsOf() = word split
src/scenes/style.js           FORMAT, FILM, palette, fonts, post presets, LYRIC: the per-song settings file
src/scenes/index.js           registry RAW -> SCENES (progress overlay)
src/scenes/demo.js demo-soft.js demo-ink.js demo-visualizer.js   starting looks: copy one per chapter
src/scenes/looks.js           building blocks for other looks (below)
src/scenes/flat.js kit.js strike.js hud.js backdrop.js   type, fields, hits, lyric layout, plates (visual-language.md §5)
src/scenes/groove.js          beat -> motion: pulseX, smoothPulse, qRamp, stepped, pump, onBar
assets/fonts/                 bundled OFL fonts (README.md lists coverage)
analysis/*.py                 song analysis (analysis.md)
scripts/check.mjs shots.mjs contact_sheet.mjs export.mjs verify_audio.mjs serve.mjs static-server.mjs ffmpeg-path.mjs
```

The logical canvas is `style.js` `FORMAT` (default 1920×1080); scenes read `ctx.W`, `ctx.H`. Export renders the same layout at `--width` (default `FORMAT.w`). `style.js` must stay free of imports and browser APIs: the Node scripts read it too. With the meter on, keep the bottom ~130 px free.

## What to edit per song

| File | What | Keep stable |
|---|---|---|
| `src/scenes/style.js` | `FORMAT`, `FILM`, palette, font stacks, post presets, `LYRIC` | the constant names (the toolkit imports them); add new ones beside them |
| `src/timeline/chapters.js` | `CUTS` | `buildChapters`, `chapterAt` |
| `src/scenes/index.js` | imports and `RAW` | `pick`, `SCENES` |
| `src/scenes/hud.js` | `METER` (off by default), `PROGRESS`, or replace the overlay | the `hud(ctx, out)` signature |
| `src/scenes/<yours>.js` | scenes, the protagonist module | |
| `index.html` | `@font-face` for added fonts | the `<audio id="track">`, `#play`, canvas |

`FILM` (the concept card's film settings; `check.mjs` follows them):
- `ending: "loop" | "close"`: a loop is checked against frame 0; a close is a designed final image.
- `lyrics: "full" | "key" | "off"`: every sung line on screen / only chosen lines / none (only when the user asked).
- `maxChapter: 45`: seconds before a chapter WARNs; raise it for a long take or a slow piece.

Engine files (`src/engine/`, `main.js`, `signals.js`, `words.js`, `scripts/`) change only to keep a hard contract or to add a missing capability, never to make a scene or a check pass; log such changes in `docs/notes.md`. A scene that seems to need an engine change is usually keeping state or fighting the contract.

## CUTS (src/timeline/chapters.js)

```js
const CUTS = [
  ["intro", null],                 // first row: starts at 0
  ["verse-1", "Under the", 0],     // nth (0-based) line whose text CONTAINS the substring -> nearest beat to its LRC time
  ["hook-1", "Call my name", 0],
  ["break", { bar: 40 }],          // bar 40 of the beat grid (0 = first full bar)
  ["hook-2", "Call my name", 1],   // the second repeat of the hook line
  ["outro", { t: 182.5 }],         // seconds, snapped to the nearest beat; { t, snap: false } keeps it exact
];
```

Substrings are case-sensitive and must match `data/lyrics_timed.json`. Ids must be unique, rows in time order, and every id needs a `RAW` entry. Errors are thrown at boot with a readable message; `check.mjs` shows it as `boot` FAIL.

## Scene contract

```js
export function myScene(ctx) {              // pure function of ctx.t: no state carried between frames
  const { g, t, W, H, sig, ly, chapter: c, p } = ctx;
  // paint on g (CanvasRenderingContext2D, W x H logical = style.js FORMAT)
  return { ...FLAT_POST, hud: { status: "PLAIN WORDS", cracks: [/* hit times */] } };
}
```

- Allowed: caches that do not depend on t (offscreen canvases from `layer()`, geometry or text metrics precomputed per frame size); `hash(...)`, `noise1(x, seed)` for randomness.
- Not allowed: `Math.random`, `Date.now`, `performance.now`, `new Date`, module variables written during draw (check.mjs FAILs on these and on draw-order dependence; comments are ignored).
- Lay out in `W`, `H` fractions or `u = Math.min(W, H) / 1080`, so the scene holds in any FORMAT.
- Heavy `shadowBlur` and full-screen `filter` blurs are slow; use post `blur`, `glow` from looks.js, or a small offscreen layer scaled up.
- Draw the letters of lyrics only when `ctx.lyricsOn`, and nothing else behind that flag.

## ctx

`{ g, t, W, H, sig, ly, chapter: {id, t0, t1}, chapters, index (chapter index), p (0..1 through the chapter), local (t - t0), img (plate id -> HTMLImageElement), plates, lyricsOn, nested }`

`nested` is true while the afterimage pass paints an earlier instant: skip overlays and expensive extras there.

## Signals (ctx.sig)

- Bands: `band(name, t)` raw, `level(name, t)` normalised to the 95th percentile (cap 1.5). Names: rms flux centroid_hz sub low lowmid mid high air.
- `energy(t)`: 0 (quietest) … 1 (fullest arrangement). Scale amplitudes with it.
- Events, sorted time arrays: `kicks`, `snares`, `hats`, `accents` (where hits land; density follows the profile: pulse = kicks + snares, groove = snares + downbeats, ambient = downbeats; none inside quiet spans).
- `quiet` `[[from, to]…]`, `inQuiet(t)`.
- Event helpers: `hit(kind, t, hl=0.12)` decaying pulse; `eventsIn(kind, t0, t)` events so far in a span; `count(kind, t)`; `since(times, t)`, `sinceKick`, `sinceSnare`, `sinceAccent`; `kickAges(t, n)`, `kickCount(t)`.
- Grid: `beatAt(t)` `{x, index, phase, age, length}`; `timeOfBeat(i)`; `nearestBeat(t)`; `barAt(t)` `{index, beat, phase, x, isDownbeat}`; `timeOfBar(i)`; `beats`, `beatsPerBar`, `period`, `offset`, `mode` (constant | variable).
- `vocal(t)`: vocal-stem RMS (0 without stems). `profile`: pulse | groove | ambient. `duration`.

## Lyrics (ctx.ly)

- `lines`: `[{t0 (LRC time), t (first word), end, index, text, words: [{t, end, text}], aligned}]`; empty for instrumentals.
- `words`: every word, in time order.
- `line(substr, nth=0)` (throws if missing), `word(q|RegExp, t0, t1, nth)`, `wordsIn(t0, t1, q?)`, `at(t)` line being sung or null, `progress(word, t)` 0..1.
- flat.js `sungAt(ly, t, hold)` → `{line, word}` sung now; backdrop.js `stageLine`, `backdrop(ctx, cam, …)` set the current line in 3D.
- Word split: `partsOf` (words.js) and `parts_of` (align_words.py) must stay identical. Latin/Hangul by word; Han/kana per character; "Go-Gone" → "Go-", "Gone".

## Post (return value of a scene; defaults in post.js POST_DEFAULTS)

- Camera: `shake [x, y]`, `zoom`, `blur [x, y]`.
- Afterimage: `after` (a time to render as a trail), `afterAmt`, `afterNeg`. Costs a second paint; cached per `after` value, so keep it constant within a beat.
- Grade: `red`, `cold`, `invert`, `flash`, `expo`, `fade`, `hot` (0/1: the one chapter allowed to flood with the accent).
- Film: `halation` .35, `vignette` .45, `grain` .07, `shoulder` 1 (0 = exact flat whites and accents).
- Presets in `style.js`: `FLAT_POST = {halation: .05, grain: .025, vignette: .1, blur: [0, 0], shoulder: 0}` (crisp); `SOFT_POST = {halation: .22, grain: .05, vignette: .3, blur: [0, 0], shoulder: 1}` (light, painterly, film). Spread one in every return and override keys per scene; add a preset for a new look beside them.

## Registry and progress overlay

```js
import * as hook from "./hook.js";                   // namespace import: a missing export shows a placeholder
export const RAW = { intro: pick(open, "open"), "hook-1": pick(hook, "hook1"), "hook-2": pick(hook, "hook2") };
```

`SCENES` wraps every entry and draws `hud(ctx, out)` on top. To develop repeats, one file can export one scene per repeat, or one function reading `ctx.chapter.id`. A RAW entry still pointing at a demo file (`pick(demo, …)`, `pick(soft, …)`, any `./demo*.js` import) is a `scenes` WARN: copy the demo into the chapter's own file. `hud()` draws nothing unless `METER.on`; then it reads `PROGRESS = {chapterId: [from, to, "STATUS"]}` and `METER.label/unit/full/toStart`. Replace its body for another overlay (a timecode, a counter, a map).

## Lyric layout (kit.js) and groove (groove.js)

- `unitsOf(text)` → units `{ch}` (CJK per character, Latin/Hangul per word); or build them from `line.words` to keep word times. Transform the text (uppercase…) before fitting, so the fit measures what is drawn.
- `lyricBox(cs, x, y, {cap, maxW, maxH, margin, align, valign, weight})` fits at the `style.js` `LYRIC` limits and clamps inside the margin; `drawRows(box, cs, box.x, box.y, (u, i, cx, baseline, cap, size) => …)` draws each unit (`cx` = unit centre: set `textAlign = "center"`). `fitRows(cs, capMax, maxW, {maxH, maxRows, weight})` is the same fit without the clamp, for a bubble or sign. Rows are balanced and never break a word or leave one unit alone.
- `rowLayout(units, cap)` → `{xs, w}` for one row; CJK advance is about 1.37 × cap at 900.
- `fontFor(text, size, weight)` picks the stack by script (Hangul → `KR`, Han/kana/CJK punctuation → `CJK`, else `FONT`).
- `put(g, layer, {alpha})` multiplies the current `globalAlpha`, so a fade around it works.
- `pulseX(sig, t, {per})` felt beats since the first downbeat (`per` = grid beats per felt beat: 2 if the grid tracked eighths). `smoothPulse(sig, t, {w, per})` the same, jitter averaged out: drive cameras and travel with it. `qRamp(q, up)` eased start without a surge. `stepped(x, move)` one step per unit of `x` (beats or bars), moving during the first `move` of each unit. `pump(sig, t, kind)` a hit scaled by energy. `onBar(sig, s)` snaps seconds to a downbeat.

## looks.js

Building blocks for looks other than the flat poster (`styles.md` §3). All stateless; sizes default to the full frame.

- `gradientField(g, stops, {angle, x, y, w, h, alpha})`: a linear gradient field; `stops` = `[[pos, rgb, alpha?]…]`.
- `glow(g, x, y, r, color, alpha, {core, op})`: a soft radial light (cheap; no shadowBlur).
- `motes(g, t, {n, seed, color, alpha, r, drift, area, twinkle, soft, op})`: drifting particles or bokeh, positions from `t`.
- `paper(g, color, {tooth, fibres, seed})`: a paper ground (texture cached per frame size).
- `inkBlot(g, x, y, r, color, {k, seed, alpha, layers, rough, op})`: a blot blooming with `k` 0..1.
- `resample(pts, step)` → points with arc length `s`; `brush(g, pts, {width, color, alpha, k, seed, bristles, dry, taper, op})`: a bristled stroke painted up to `k` 0..1 of its length, with dry-brush gaps; `lineDraw(g, pts, k, {width, color, alpha, cap, close})`: a line drawn to `k`.
- `spectrum(sig, t, n, {detail, seed})` → n bar values 0..1 from the band levels; `bars(g, vals, x, y, w, h, {color, alpha, gap, mirror, min})`; `radialBars(g, vals, cx, cy, r0, len, {color, alpha, width, rot, mirror, cap})`.
- `pixelLayer(scale)` → `{g, put(g, {alpha})}`: draw in frame coordinates on `g` (rasterized at 1/scale), then `put` scales it up without smoothing.
- `fitColumns(cs, capMax, maxH, {maxW, maxCols, pitch, gap, minCap, weight})` and `drawColumns(fit, cs, x, y, (u, i, cx, cy, cap, size) => …, {align, valign})`: vertical Han/kana setting, right-to-left balanced columns, one upright unit per cell (draw with `textBaseline = "middle"`, `textAlign = "center"`); `isCJKLine(cs)` tells whether a line can go vertical.

## Fonts

Bundled in `assets/fonts/` (all OFL; `README.md` lists coverage), declared in `index.html`, loaded before the first frame:

| Family | Weights | Covers |
|---|---|---|
| Space Grotesk | 300–700 | Latin |
| Noto Sans KR | 100–900 | Hangul, Latin, kana, many Han |
| Noto Sans SC | 400, 900 | GB2312 + Big5 level 1 + JIS level 1 subset: simplified and common traditional Chinese, kana, punctuation |
| Noto Serif SC | 700 | the same subset |

- Stacks in `style.js`: `FONT` (Latin, labels), `KR` (Hangul), `CJK` (Han, kana, CJK punctuation), `DISPLAY` (giant type; needs a 900 weight). Put the face the concept needs first; for Chinese giant type put "Noto Sans SC" first in `DISPLAY`; for a classical tone "Noto Serif SC" first in `CJK`.
- A static face covers only its declared weight: ask for 400/900 of Noto Sans SC or 700 of Noto Serif SC; other weights are matched to the nearest one.
- `check.mjs` `fonts` WARNs about every lyric glyph no bundled face covers (rare Han, Japanese-only kanji, other scripts). Then add an OFL font:
  1. Download it from Google Fonts (Noto Sans JP / TC, Noto Serif JP, a display, brush or pixel face); put the `.woff2` or `.ttf` in `assets/fonts/` with its OFL text.
  2. Add `@font-face { font-family: "<Family>"; src: url("assets/fonts/<file>") format("woff2"); font-weight: 100 900; font-display: block; }` to `index.html` (`format("truetype")` for a TTF; the real weight range for a static file).
  3. Put the family first in the matching stack in `style.js`.
  4. List it in `credits.md`; rerun `check.mjs` (the `fonts` line should pass).

## Query flags and window.mv

- `?export` export mode (no UI); `&width=<px>` render width (default `FORMAT.w`; 16:9 4K = 3840, 9:16 4K = 2160); `?nolyrics` hides lyrics; `?av=<ms>` A/V offset for the live player; `?look=<flat|soft|ink|visualizer|file.js:export>` draws that one scene on every chapter (HUD still on top), for concept frames and live previews without editing RAW (`shots.mjs --look`, or `serve.mjs` and open `/?look=ink`). A bad value fails loudly (`mv.ready` rejects).
- `window.mv = { canvas, audio, chapters, duration, signals, lyrics, W, H, ready (Promise), draw(t), seek(t) }`. Scripts `await mv.ready`, then `mv.draw(t)` and read `mv.canvas`.

## Alternative renderers

A scene may draw with any technology as long as `draw(t)` stays deterministic and ends on the 2D plate:
- **three.js / raw WebGL inside a scene:** render to an offscreen WebGL canvas created once (cache), set every object from `t` each frame (no `clock`, no physics integration across frames; precompute simulations into arrays indexed by frame), then `g.drawImage(glCanvas, 0, 0, W, H)`. Add the library as a pinned local file under `src/vendor/`, not a CDN, so export works offline.
- **Pre-rendered footage** (PD/CC, or official footage the user approved): frame sequences as plates (`plates.seq`), picked with `frameIdx(t)`; never a `<video>` element.
- Check perf with `check.mjs`: preview should stay under 16.7 ms p90; export is offline, so slow scenes only slow the export.
