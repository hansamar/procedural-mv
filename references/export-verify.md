# Verify and export

All scripts start and stop their own static server and browser: no dev server, no port bookkeeping. ffmpeg is found via `FFMPEG_PATH`, else `ffmpeg` on PATH, else the Python package imageio-ffmpeg (set `PYTHON=<interpreter>` if `python` is not on PATH; on Windows `python` is often the Microsoft Store stub, which runs nothing and makes the scripts fail to find ffmpeg, so point `PYTHON` at a real interpreter).

## check.mjs: the delivery gate

```bash
node scripts/check.mjs                      # full check (about 1 min for a 3-min song)
node scripts/check.mjs --no-play --no-perf  # faster, while building
node scripts/check.mjs --every 4            # denser frames
```

Writes `exports/check/report.json`, `exports/check/frames/f_<t>_<tag>.jpg` and `exports/check/sheet.jpg`. Exit 0 = no FAIL.

| Check | FAIL means | WARN means |
|---|---|---|
| style | `src/scenes/style.js` does not load in Node (an import or a browser API in it) | |
| audio, data | song or analysis file missing, durations disagree | |
| beat grid | no grid | quality < 0.4 |
| lyrics | LRC without alignment, empty lines, lines past the end | no lyrics (fine for instrumentals), no word alignment, < 80 % word-aligned |
| material, licences | plates missing; SOURCES.json missing; an open entry without `license`/`source_url`, an official one without `rights`/`source_url`/`use`/`used_in`; an archive file without an entry | |
| official | | official items without the user's `approved` (`export.mjs` refuses to render them) |
| credits | | credits.md missing |
| canvas | the canvas is not `FORMAT` (w×h) | |
| boot | the page did not start (usually CUTS text, or a scene syntax error) | |
| scenes, chapters | a chapter without a scene, duplicate ids | a RAW entry still on a demo file (`./demo*.js`): copy the demo into the chapter's own file; unused RAW entries; chapters < 2 s or > `FILM.maxChapter` |
| fonts | | lyric glyphs that no bundled `@font-face` covers (they would render in a system fallback or as boxes) |
| stateless | `Math.random`/`Date.now`/`performance.now`/`new Date` in any scene file (comments ignored), or a frame that changes with draw order | |
| frames | | nearly uniform frames (an intended field, or a scene drawing nothing?) |
| loop | | `FILM.ending = "loop"` and first vs last frame differ > 0.15 (a `"close"` ending passes) |
| lyrics on screen | lyrics never visible (`?nolyrics` renders the same), unless `FILM.lyrics = "off"` | some sung moments show no lyric (passes with `FILM.lyrics = "key"`) |
| lyric layout | | the lyric block (lyrics-on vs `?nolyrics` difference) is wider than `LYRIC.maxW` + 10 % of the frame, taller than `LYRIC.maxH` + 5 %, or closer than `LYRIC.margin` / 2 to an edge: oversized or clipped type (visual-language.md §9.1). A backdrop that changes with a lyric also counts; look at the listed frames |
| perf | | p90 > 16.7 ms in a chapter (preview drops frames; export is unaffected) |
| browser errors, playback | console errors, failed requests | headless audio clock did not advance |

Rules: never ship with a FAIL; never edit check.mjs to make a check pass; for each WARN either fix it or write one line in `docs/notes.md` saying why it is intended (for a concept-card override, name the override). The film settings that change what is checked live in `style.js` `FILM` and `LYRIC`, not in check.mjs.

## Looking at frames

`frames/` holds one frame every N s, both sides of every cut (`out-<id>` at t0 − 0.1, `in-<id>` at t0 + 0.02), and the first and last frames. Open `sheet.jpg` first, then the out-/in- pairs.

```bash
node scripts/shots.mjs exports/wip 12.4 12.6 31 --nolyrics          # any frames, own server
node scripts/shots.mjs exports/look 12 31 --look soft                # one scene on every chapter (flat|soft|ink|visualizer|<file.js>:<export>)
node scripts/contact_sheet.mjs exports/wip exports/wip/sheet.jpg --cols 8 --width 384
```

`shots.mjs` prints `{frames, errors}`; errors must be `[]`. Read the frames as images. Code that should work is not evidence.

What to look for (visual-language.md §8):
- **Seams:** OUT and IN share a shape, motion, space or field.
- **Lyrics:** the word being sung is readable at phone size.
- **Hits:** frames at accent times (`data/audio_features.json` kicks/snares, or `mv.signals.accents`) show the reaction starting on that frame.
- **Loop:** the last frame against frame 0.
- **Sheet as a stranger:** one throughline, a new system at the profile interval, hooks developing, the arc visible.

## Preview

```bash
node scripts/serve.mjs     # http://localhost:5173 (PORT env to change); Ctrl-C to stop
```

Only for the user to watch with sound. Run it in a terminal the user can see, and stop it when done.

## Export

```bash
node scripts/export.mjs --out exports/<name>_1080p.mp4                  # FORMAT size (16:9 1920x1080, 9:16 1080x1920 ...)
node scripts/export.mjs --out exports/<name>_4k.mp4 --width 3840        # 16:9 4K; 9:16, 1:1, 4:5 4K: --width 2160
node scripts/export.mjs --out exports/clip.mp4 --from 0 --to 10          # quick test
node scripts/export.mjs --out exports/hook.mp4 --from 62.4 --to 92.4     # a short-video section (no audio proof)
# more: --fps 60 (default) --encoder libx264|h264_nvenc --silent-out f.mp4 --no-mux
```

Run it only after the user has checked the live preview and sheet and said to render (SKILL.md phase 5b). Every export, clips included, refuses to start while an official item in `SOURCES.json` lacks `approved` (`assets-credits.md` §Official material).

4 browser pages render exact frame timestamps into ffmpeg (libx264 crf 16, preset slow). The original audio is then muxed as ALAC into a temporary `<name>.alac-master.mp4`, proved PCM-identical with `verify_audio.mjs` (export fails and keeps the master if not), encoded from that master to AAC 320k in `<name>.mp4`, and the master is deleted. `<name>.mp4` is the only output; it plays in any player (many play ALAC-in-MP4 silently). `--keep-master` keeps the lossless file; `--no-aac` writes only ALAC at `--out`. A clip with `--from` > 0 skips the proof (its audio is a straight cut of the original, not re-timed). `--width` must give a whole, even height for the FORMAT. 4K takes several times longer than 1080p; test with a 10 s clip first.

## Audio proof

Export runs the proof itself: its summary must show `"audio_pcm_equal": true`. To check a kept master by hand:

```bash
node scripts/verify_audio.mjs assets/audio/song.flac exports/<name>.alac-master.mp4
node scripts/verify_audio.mjs assets/audio/song.flac exports/clip.alac-master.mp4 --seconds 10   # clip from 0
```

Use the real extension of the song file. The AAC file is lossy by design and never compares equal; do not run verify_audio on it.

Also confirm with ffprobe (from the same ffmpeg folder) that the duration matches the song within one frame, the size is the FORMAT (or `--width`) size, and the streams are h264 + aac.

## Before reporting "done"

- [ ] `check.mjs` exit 0, WARNs fixed or noted.
- [ ] The user checked the preview and `sheet.jpg` and said to render before export ran.
- [ ] Export summary `"audio_pcm_equal": true`; the user got `<name>.mp4`.
- [ ] `credits.md` and `SOURCES.json` complete; every official item approved by the user before the render.
- [ ] Scratch folders (`exports/wip`, `exports/concept`, agent folders) deleted; any preview server stopped.
