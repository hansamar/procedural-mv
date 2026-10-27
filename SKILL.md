---
name: procedural-mv
description: >-
  Make, refine or export code-rendered music videos from original audio and lyrics
  using Canvas2D/WebGL. Includes song analysis, beat grids, timed lyrics, four
  starting looks, Chinese/Korean/Latin fonts, frame checks, multi-format export
  up to 4K and audio integrity verification. Use for 程序化MV、音乐视频、歌词视频、
  动态歌词、音乐可视化、竖屏MV, lyric videos, kinetic typography and audio-reactive
  music videos across genres and languages.
---

# Procedural MV

Everything is in this skill: the engine and scripts in `assets/starter/`, the method in `references/`. Each song gets its own concept: do not reuse or imitate films made earlier with this skill. (The artist's own official visuals are different: study them in phase 2; putting them in the film needs the user's approval, contract 2.)

Talk to the user in their language. Assume they do not code: show frames and contact sheets, ask about taste, never ask them to edit code.

## Hard contracts (every film)

`check.mjs`, the export and the review enforce these. Nothing on a concept card overrides them.

1. **The audio is untouched and proven.** Export muxes the original losslessly, proves it PCM-identical (SHA-256) and fails otherwise; the delivered MP4 carries an AAC 320k encode of that proven master.
2. **Every borrowed pixel is logged; official ones wait for the user's yes.** No AI-generated images or video. Everything else on screen is drawn in code or is logged material (`assets/material/SOURCES.json`, `credits.md`): PD/CC files, or the artist's official material (MV frames or footage, photos, logos, cover art; also tracing them or recreating a shot) when the concept or the user calls for it. Before the render (the export), the user sees each official item (what, where, how it is treated, who holds the rights) with a review frame where it appears and approves it; `export.mjs` refuses while an official entry lacks `approved`. Review frames and the live preview may show items that still wait.
3. **Audio time is the only clock.** Scenes are stateless `fn(ctx)`: the same `t` gives the same frame. No `Math.random`, `Date.now`, `performance.now`, `new Date`, or module variables written while drawing.
4. **Sung words are readable while sung** (phone size, inside the frame), unless the user asked for fewer or no lyrics (`FILM.lyrics = "key" | "off"` in `style.js`). Scenes draw the letters behind `ctx.lyricsOn` and nothing else, so `?nolyrics` shows the same world without the words.

## Craft defaults (keep unless the concept card overrides them)

These come from reviews of earlier films and usually make a film better. Each can be overridden: write the override and its reason on the concept card (`Overrides:` line), set the matching knob in `style.js`, and accept the related check WARN in `docs/notes.md`. Details and reasons: `references/visual-language.md` §2.

| Default | Why | Typical override |
|---|---|---|
| one protagonist with a visible state (object, light, line, type, the spectrum) | a stranger needs something to follow | visualizer, collage or performance modes: the music or one graphic system carries the film |
| one arc shaped like the song, visible on the contact sheet | the film goes somewhere | steady state for minimal / ambient pieces |
| hits on real musical events (`sig.accents`, kicks, word onsets) | sync is what makes it feel musical | (rarely) |
| key lyrics change the world; hook repeats develop along one axis | lyrics matter; repeats escalate | typographic mode: the type is the world |
| a new visual system every 12–30 s (by profile); chapters ≤ `FILM.maxChapter` (45 s) | attention | long take: raise `FILM.maxChapter`, develop inside one space |
| relays at seams (OUT frame = next IN frame) | no stitched-together feel | a planned hard cut on a drop or downbeat |
| frame 0 not black, first hook within 1 s; the end loops to frame 0 (`FILM.ending`) | replays, short-video platforms | fade from black (ballad, cinematic); `FILM.ending = "close"` |
| lyric size limits `LYRIC` (16:9: cap ≤ 150 px, block ≤ 60 % width) | readable without shouting | typographic concepts raise `LYRIC` |
| one accent colour; each motif has a home chapter and an arc; no burst rings on lyric entry | restraint reads as design | maximalist genres (hyperpop, K-pop, comic): the card defines the colour system or the device |
| camera speed changes only where planned | jitter reads as a mistake | (rarely) |

## Choose the film: mode, look, format

Pick per song with `references/styles.md` (modes, look recipes, a genre playbook, platform formats):
- **Mode** = how the film tells: story, typographic, visualizer, collage / archival, long take, graphic performance.
- **Look** = what it is made of. Four starting looks, each a working scene to copy: flat poster kinetic type (`src/scenes/demo.js`), soft light (`demo-soft.js`), paper and ink with vertical CJK (`demo-ink.js`), audio visualizer (`demo-visualizer.js`). Others (pixel, line art, collage, film, 3D, neon, print, glitch) are recipes built from `looks.js`, `flat.js` and `kit.js`.
- **Format** = `FORMAT` in `style.js` (or `new_project.mjs --format`): 16:9 (default), 9:16 (抖音 / Reels / Shorts), 1:1, 4:5. Set it before building scenes; scenes lay out in `ctx.W` / `ctx.H`.

## Workflow

Keep a todo list with these phases; do not start a phase before the previous one is done. Checkpoints: the user picks the concept (phase 2) and says to render (phase 5b). Never start `export.mjs` before that go-ahead; after any later change, show the frames again first. If the user explicitly asked to work end to end without check-ins, pick the card yourself (say why in `docs/concept.md`), run every check, export 1080p (or the asked size) and show the sheet with the result. Official material is the exception: it still needs the user's yes, so such a film leaves it out or stops for that one question before export.

| # | Phase | Do | Done when |
|---|---|---|---|
| 0 | Intake | get the audio (FLAC/WAV best), lyrics (LRC, plain text, or none), any wishes (style, platform, format); `node <skill>/scripts/new_project.mjs <dir> --audio <file> [--lrc <file>] [--format 9:16]`, then in `<dir>`: `npm i`, `npx playwright install chromium` | `assets/audio/song.*` exists, `npm i` ok |
| 1 | Analysis | `python analysis/run_all.py [--lang xx] [--instrumental]` (`references/analysis.md`) | the summary prints `"ok": true` (no LRC: correct `data/song.lrc.draft`, save as `data/song.lrc`, rerun) |
| 2 | Understanding + concept | study the song and the artist's official visuals (MV, teasers, concept photos, cover; search the web); write `docs/song.md`; offer 2–3 concept cards (a card that puts official material in the film lists it under `Official material:`) (`visual-language.md` §3) that differ in mode or look, not only colour; one test frame each (`node scripts/shots.mjs exports/concept-soft <t> --look soft` shows a starting look on this song without editing RAW; then copy the closest demo and adjust); recommend one | the user picked a card; saved as `docs/concept.md` |
| 3 | Storyboard | `docs/BRIEF-chapters.md` (`references/agent-brief-template.md`); `style.js` (FORMAT, FILM, LYRIC, palette, fonts, post); `CUTS` in `src/timeline/chapters.js`; `RAW` in `src/scenes/index.js` | `node scripts/check.mjs --no-play --no-perf`: no FAIL (the demo WARN is expected now) |
| 4 | Build | protagonist (or core system) first, then chapters in time order, or parallel agents (`agent-brief-template.md`) | every chapter has its own scene; `check.mjs` no FAIL, no demo WARN |
| 5 | Review | `node scripts/check.mjs`; open `exports/check/sheet.jpg` and the out-/in- frames; run the checklist for the film's mode (`visual-language.md` §8); fix and rerun | no FAIL; each WARN fixed or accepted in `docs/notes.md` |
| 5b | User check | `node scripts/serve.mjs` (live preview with sound, http://localhost:5173); give the user the link, the sheet and frames of what changed; list open WARNs and choices in plain words; official material: one line per item (what, where, how treated, rights holder) with a frame of it, yes or no each, answers recorded as `approved` in `SOURCES.json` (`assets-credits.md` §Official material); wait | the user says to render and at which size; every official item in the film is approved |
| 6 | Export | `node scripts/export.mjs --out exports/<name>.mp4 [--width <px>]` (`references/export-verify.md`; it refuses unapproved official material) | the summary shows `"audio_pcm_equal": true` |
| 7 | Credits | `credits.md`, `SOURCES.json` (`references/assets-credits.md`); delete scratch frame folders; stop the preview server; save the user's taste feedback to memory if memory exists | no credits / licences WARN |

`docs/song.md`: what the lyrics mean (or what the music does, for instrumentals); the section map with times and which instruments play; every hook repeat with times; quiet spans; the arc (where it peaks, falls back, empties or arrives); 5–10 key words or musical events that can become actions; profile and tempo from the run_all summary; a reference reading: what the official visuals say (motifs, palette, styling, era, mood), what this film borrows and how it transforms it.

## Decisions

| Situation | Do |
|---|---|
| no LRC, sung song | run_all writes a Whisper draft; correct it against the official lyrics; never ship Whisper text unchecked |
| plain lyrics text only | the draft path too: keep the draft timestamps, replace the words line by line |
| instrumental | `run_all.py --instrumental`; CUTS by `{bar:n}` / `{t:s}`; musical events replace key words; type = title, numbers or none |
| Chinese, Japanese, Korean | `--lang zh` / `ja` / `ko`; the bundled fonts cover Hangul, simplified and common traditional Chinese, and kana; vertical columns for Han lines with `looks.js` `fitColumns`; rare glyphs: `check.mjs` `fonts` WARN names them (`references/engine.md` §Fonts) |
| tempo changes, rubato, 3/4, 6/8 | trust `beat_grid` (variable mode, meter); if cuts miss, rerun with `--mode variable` or `--meter 3`; land hits on `sig.accents`, not on a guessed grid |
| the user names a genre, a style or a reference ("像赛博朋克", "watercolour", "like a 90s MV") | `styles.md`: the matching look recipe and genre row; keep the contracts, swap the style layer |
| no direction from the user | `styles.md` genre row → 2–3 cards in different modes or looks; recommend one and say why |
| vertical, square or short-video delivery | set `FORMAT`; keep type and protagonist out of the platform UI zones (`styles.md` §Formats); edits with `export.mjs --from --to` |
| the user wants fewer or no lyrics | `FILM.lyrics = "key"` or `"off"` |
| the user wants the official MV, photos or cover in the film (or the concept needs them) | allowed (contract 2): files from the user or official sources into `assets/material/archive/`, footage as frame sequences; one `SOURCES.json` entry per item with `"official": true`; approval at the user check, before the export (`assets-credits.md` §Official material) |
| `check.mjs` FAIL | read its detail line (it names the file and the fix); never edit check.mjs to pass |
| `check.mjs` WARN from a card override | accept it in `docs/notes.md` with the override's reason |

## Working rules

- Per-song files: `src/scenes/style.js`, `src/timeline/chapters.js` (CUTS), `src/scenes/index.js` (RAW), `src/scenes/hud.js` (METER / PROGRESS), your scene and protagonist files, `index.html` (`@font-face` only). Colours and fonts come from `style.js`; never hardcode them in a scene.
- Start every scene by copying the closest demo into the chapter's own file: each one already fits lyrics, lands hits on accents, scales with energy, follows the profile, lays out for any FORMAT and returns post settings.
- Set lyrics with `kit.js` `lyricBox` / `fitRows` + `drawRows`, or `looks.js` `fitColumns` + `drawColumns` for vertical CJK; never a fixed character step or a hand-picked size. Lay out in `W`, `H` fractions or `u = Math.min(W, H) / 1080`.
- After every scene edit: `node scripts/shots.mjs exports/wip <t0+0.02> <mid> <t1-0.1>` and look at the images. Code that "should work" is not evidence; frames are.
- Rerun `node scripts/check.mjs --no-play --no-perf` after each chapter, the full check before review.
- Engine files (`src/engine/`, `main.js`, `timeline/signals.js`, `lyrics/words.js`, `scripts/`) change only to keep a hard contract or to add a missing capability, never to silence a check; log such a change in `docs/notes.md`.
- If a step fails twice the same way, read the relevant reference section instead of retrying.

## Bundled resources

- `scripts/new_project.mjs`: scaffold a project from the starter.
- `assets/starter/`: the working project. `analysis/run_all.py` (whole analysis), `scripts/check.mjs` (delivery gate, frames, sheet), `shots.mjs` (any frames), `contact_sheet.mjs`, `serve.mjs` (preview), `export.mjs`, `verify_audio.mjs`. In `src/scenes/`: `style.js` (FORMAT, FILM, palette, fonts, post presets, LYRIC limits), the four demos, `looks.js` (gradients, glow, motes, paper, ink, brush, line drawing, spectrum bars, pixel layer, vertical CJK), `flat.js` and `kit.js` (type, fields, hits, lyric layout, plates), `groove.js` (beat → motion), `strike.js`, `hud.js`, `backdrop.js`. `assets/fonts/`: Latin, Korean and Chinese OFL fonts (README lists coverage).
- `references/styles.md`: modes, look recipes, genre playbook, formats and platforms. Read in phase 2.
- `references/visual-language.md`: contracts on screen, craft defaults with reasons and overrides, concept card, adapting to the song, toolkit, watch-fors, review checklists, lyric type and camera. Read before phases 2 and 5.
- `references/analysis.md`: run_all, every script, flags, failure fixes, data schemas.
- `references/engine.md`: layout, scene contract, ctx, signals and lyrics APIs, CUTS, post keys, looks.js API, fonts, alternative renderers.
- `references/export-verify.md`: check.mjs report, shots, export, audio proof.
- `references/assets-credits.md`: licences, official material and its approval, SOURCES.json, credits.
- `references/agent-brief-template.md`: storyboard table and the brief for parallel scene agents.
