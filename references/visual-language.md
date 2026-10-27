# Visual language

Contents: 1 contracts on screen · 2 craft defaults · 3 concept card · 4 adapting to the song · 5 toolkit · 6 opening and ending · 7 watch-fors · 8 review checklists · 9 lyric type and camera

§1 holds for every film. §2 is the default craft: strong starting points with a reason each, overridden only on the concept card. Looks, genres and formats: `styles.md`.

## 1. Contracts on screen

- **Borrowed pixels.** Everything visible is drawn in code or is logged material: PD/CC files, or official material the user approved. Study the artist's official visuals either way; what you take as style, rebuild in your own medium:

  | Borrow freely (rebuild in your medium) | In the film once the user approves it (asked before the export) | Never |
  |---|---|---|
  | concept and story idea, recurring motifs and objects, palette and material feel, styling and era, typography mood, composition and camera habits, choreography energy as motion | official MV frames or footage, photos, logos, cover art (as is, cropped, treated); tracing them; recreating a shot one to one; a recognisable likeness of a real person | AI-generated images or video |

  Official material works best as one layer of the film, not the film: the code layer (type, graphics, timing, transitions) still carries the concept, and the material is re-printed into the film's stock (`kit.js` `tone`, `flat.js` `poster`) unless the card says "as is".

- **Stateless.** A frame depends only on `t`: `check.mjs` redraws probe frames in shuffled order and FAILs on any difference.
- **Sung words readable.** While a line is sung, its words are on screen, inside the frame, legible at phone size (view the frame 360 px wide). `FILM.lyrics = "key"` (only chosen lines) or `"off"` only when the user asked for it. Scenes draw the letters behind `ctx.lyricsOn` and nothing else: no background, light or motion depends on it, so `?nolyrics` is the same film without words.

## 2. Craft defaults

Each default says why it exists and when a card may override it. To override: one line under `Overrides:` on the concept card (what, why), the knob in `style.js` if there is one, and a line in `docs/notes.md` for the WARN it causes.

### 2.1 One protagonist with a visible state
An object, shape, light, line, mark, type or force that is present or implied in every chapter, so a stranger always knows what to watch.
- Derive it from the song's central image or verb, what the title or hook *does*: falling → a falling object, burning → a fuse, waiting → a clock hand, a name → the letters of that name, a drop → a pressure that releases.
- It need not be a person. Objects, light, type and scenery can carry a whole film; a walking figure ties the camera to its feet (§9.2). Ask before building the film around a human figure.
- Check: muted, the first 10 s of the contact sheet: can a stranger say what it is and what it does?
- Override: visualizer, collage and graphic-performance films may let the music itself (the spectrum, the beat) or one recurring graphic system carry the film. It still needs a visible state that changes.

### 2.2 The arc is legible
One shape a stranger can feel, taken from the song's arc in `docs/song.md`, carried visibly.
- Shapes: climb to one climax; waves (each hook a peak, verses fall back); descent or fade (a ballad that empties out); journey A → B; circle (ends where it began); steady state with variations.
- Carriers: the protagonist's state, a number of objects, a fill level, light, saturation, scale, distance travelled, the size of the world. An on-screen meter (`hud.js`, off by default) is one optional carrier.
- Check: read the contact sheet left to right without sound; the shape is visible.
- Override: steady state is a valid shape for minimal, ambient or loop-based music; say what varies.

### 2.3 Cause → effect on musical events
Every hit lands on a real event (`sig.accents`, a kick, a snare, a word onset) and the target visibly reacts. How many hits and how hard follows §4; the look decides what a reaction looks like (`styles.md`).
- Why: sync is what makes a picture feel musical; hits on a guessed grid drift.
- Check: frames at accent times show the reaction starting on that frame, not before and not 3 frames late.

### 2.4 Lyrics change the world (sung songs)
Take 5–10 key words; each becomes an object or an action on its onset: "copy" spawns duplicates, "light" floods the frame, "stop" freezes motion, "fall" drops the layout.
- Why: a lyric that appears and changes nothing is a subtitle.
- Lyrics are part of the picture (type in the world, on objects, in light), not a subtitle strip; §9.1 sets the size limits.
- Instrumentals: musical events (a riff, a drop, a solo) take the place of key words.
- Override: in typographic mode the type *is* the world; the key words then change the type system itself (weight, scale, break, colour).

### 2.5 Repeats develop
Every hook repeat keeps one grammar and moves one step along an axis chosen for the song: a bigger target (object → room → street → city), more copies (1 → 10 → 100), closer or further, more or less light, alone → crowd, or quieter for a song that turns inward. The arrangement drives it: sparse sections stay sparse.
- Why: identical hooks make a long song feel like a loop.

### 2.6 The world changes often enough
A new visual system (geometry, medium, camera or space, not only colour) at the §4 interval. `check.mjs` WARNs about chapters longer than `FILM.maxChapter` (45 s).
- Override: a long take or one-shot concept raises `FILM.maxChapter` and develops inside one space (the camera travels, the light changes, the world fills up).

### 2.7 Media transform on screen
A system becomes the next one as a visible event: type becomes a plate, a plate tilts into 3D, a photo posterizes into the palette, a line becomes a shape, a spectrum bar becomes a building.
- Why: unrelated pictures cut together read as a slideshow.

### 2.8 Relays at seams
Each chapter's OUT frame equals the next chapter's IN frame through a shared shape, motion vector, camera move, occlusion, colour field, space or meaning. Write each relay into the storyboard; `check.mjs` renders t0 − 0.1 and t0 + 0.02 of every cut.
- Override: a hard cut on a drop or a downbeat is a relay too when it is planned: the cut lands on the beat and the new system answers the old one (same position, inverted colour, the shape continuing).

### 2.9 Designed opening and ending
Frame 0 is not black and hooks within 1 s: a graphic already in tension, with a first cause → effect (no face before the first cause). The ending is chosen on the card: a loop to frame 0 (`FILM.ending = "loop"`, the default; good for replays and short-video platforms; `check.mjs` compares first and last frames) or a designed close (`"close"`: a final image, a fade, the protagonist leaving).
- Override: a ballad, film-score or cinematic concept may open from black or fade in over the intro; write it on the card.

### 2.10 Restraint
- One dominant accent colour, appearing only where the card says; one chapter may flood with it.
- Each motif has a home chapter; a recurring motif (a moon, a colour, a logo shape) gets a written arc: every appearance and what it does there (whole → cracked → sinking → reflected → healed). Three to six appearances suit a 3–4 min song; a motif in every chapter becomes wallpaper.
- Lyric accents are quiet: ink-in, a light change, an inversion, a weight change. No burst rings, starbursts or scribble halos on lyric entry: they read as cheap.
- Override: maximalist genres (hyperpop, K-pop, comic or pop-art concepts) may run a multi-colour system or a deliberate graphic device (speech-bubble bursts, stickers); the card defines the system and where it lives.

## 3. Concept card (one per proposal; save the chosen one as docs/concept.md)

```
Song / mood in 3 words:
Mode: story | typographic | visualizer | collage-archival | long take | graphic performance
Look: flat poster | soft light | paper-ink | visualizer | <recipe from styles.md or new: medium, hit reaction, lyric treatment>
Format: 16:9 | 9:16 | 1:1 | 4:5  (platform: ___)
Borrowed from the official visuals (element -> how it is rebuilt here; "none" if the user wants a fresh look):
Official material in the film (item -> where, how treated; each needs the user's approval before the export; usually "none"):
Protagonist:                     visible state(s):
Throughline (one sentence a stranger gets):
Arc: climb | waves | descent | journey | circle | steady ; carried by ___ (meter: off | on, LABEL/UNIT)
Palette: base ___ / ___ , accent ___ (where the accent may appear: ___; the one chapter allowed to flood: ___)
Type: font, case, weight; lyric treatment (rows | vertical columns | on objects | ...)
Motifs -> arc (each appearance: chapter, what it does):
Key words / musical events -> world actions (5-10):
Repeat steps (the axis, and one step per hook repeat):
Camera: still | slow glide | pulse on beats | jolts and cuts on accents | handheld drift | mixed: ___ (where it speeds up or stops, and why)
Opening (first 2 s):
Ending: loop to frame 0 | close: ___
FILM: ending ___ , lyrics full | key | off , maxChapter ___
LYRIC: default | raised to ___ (why)
Overrides (default -> what instead, why):
Profile (from the run_all summary): pulse | groove | ambient
```

Derive the palette and the protagonist from the song: title, lyric imagery, and the artist's own visual world. Look at the official MV, teasers, concept photos and cover (search the web, describe what you see) and write the reference reading in `docs/song.md`; add one card line per borrowed element ("Borrowed: chrome surfaces from the teaser -> flat steel fields"). The film should feel related to the official world without copying it; when the card puts official material in the film, say on the card what the code adds to it.

Make the 2–3 proposals differ in mode, look or protagonist, not only in colour (for example: a story card in the flat-poster look, a typographic card, a visualizer card). Give each one test frame and say which one you recommend and why.

## 4. Adapting to the song

Read `profile` from the run_all summary (or `sig.profile`) and the section map, then start from the row values; change them when the frames say so.

| | pulse (dance, EDM, hip-hop, rock; dense kicks) | groove (mid-tempo pop, R&B, funk) | ambient (ballad, acoustic, slow, rubato) |
|---|---|---|---|
| hits per bar | every accent (4+) | 1–2 (backbeat, word onsets) | 0–1 (downbeat or key word) |
| hit reaction (flat look) | slash, shear, hard invert | shear, a field wipe, a count tick | a slow fill, a fold, a light change; save an invert for one key moment |
| new system every | 12–15 s | 15–20 s | 20–30 s |
| cuts | hard, on the beat | hard on bars, eased inside | long dissolves made from relays |
| type motion | snaps in ≤ 0.12 s | 0.15–0.25 s | eases 0.4–1 s, word by word |
| post | `FLAT_POST`, invert flips | `FLAT_POST` or `SOFT_POST` | `SOFT_POST`, `fade`, `afterAmt` trails |
| arc carriers that fit | impact, speed, pressure, scale | count, distance, crowd, level | light, fill, temperature, distance, emptiness |

Scale every amplitude with `sig.energy(t)` (0 quiet … 1 full), so quiet verses stay quiet in every profile. Genre-specific starting points: `styles.md` §Genres.

| Case | Do |
|---|---|
| instrumental, or long spans without vocals | the protagonist and musical events carry the film; type = title, numbers (bars, BPM) or none; CUTS by `{bar:n}` |
| tempo changes, rubato, 3/4, 6/8 | variable beat grid and `barAt`; hits on `sig.accents`, not an assumed 4/4; waltz feel = one strong hit per bar plus two light ones |
| Latin, Hangul | split by word |
| Chinese, Japanese | split per character, so each sung syllable can land; no Latin letter-spacing tricks; the bundled Noto Sans SC 400 / 900 and Noto Serif SC 700 cover common Han and kana; vertical columns (`looks.js` `fitColumns`) suit 国风, ink and ballad looks |
| mixed-language lines | each script gets its own stack (`kit.js` `fontFor`); keep a mixed line in rows, not columns |
| over 5 min | the same ladder, plus a mid-film "reset" chapter (the carrier drops back) so the second rise reads |
| under 90 s, or an edit | 4–6 chapters; the first hook within 15 s |
| vertical, square, 4:5 | set `FORMAT` before building; `LYRIC` follows it; keep the platform UI zones clear (`styles.md` §Formats) |

## 5. Toolkit

Signatures are in the source; this is what each piece is for.

- **`style.js`:** `FORMAT`, `FILM`, palette (`WHITE BLACK RED STEEL HOT`, `INK BONE PAPER SAFE COLD`), fonts (`FONT KR CJK DISPLAY`), post presets (`FLAT_POST` crisp; `SOFT_POST` halation, grain, soft shoulder), `LYRIC` limits. Change per song; keep the names (add new ones beside them).
- **Demos** (copy one per chapter): `demo.js` flat poster (giant type, field wipes, hits); `demo-soft.js` soft light (gradient sky, motes, a light protagonist that swells on accents, exposed lyrics); `demo-ink.js` paper and ink (a brush line painted over the film, ink blots as hits, vertical CJK columns); `demo-visualizer.js` (radial spectrum that pumps on kicks, bar-step rotation, layout that adapts to FORMAT).
- **`looks.js`:** `gradientField`, `glow`, `motes` (particles, bokeh), `paper`, `inkBlot`, `brush` (a bristled stroke with dry gaps, painted to `k`), `resample`, `lineDraw` (a path drawn to `k`), `spectrum` (band levels → n bars), `bars`, `radialBars`, `pixelLayer(scale)`, `fitColumns` / `drawColumns` (vertical CJK), `isCJKLine`.
- **Type and fields (`flat.js`):** `bigType` giant type, `typeWidth`, `chromeGrad`, `field` flat blocks (a field wiping on a hit is the basic transition), `label`. Lyric blocks: `kit.js` `lyricBox` / `fitRows` + `drawRows` (§9.1); `sungAt(ly, t)` gives the line and word sung now.
- **Hits (`flat.js`):** `slash` a cut that leaves a scar; `shear` splits the layout along a line; `invert` + `flipOn` frame-exact inversions. `strike.js`: a thrown line that lands on t0 with a crack (copy its structure: path → in flight → impact → reaction).
- **Furniture:** `win` OS windows, `label`, `grid`, `barcode`, `halftone`, `corners`.
- **Photos:** `poster(img, {levels, cut, colors})` posterizes a PD photo into the palette; `kit.js` `tone`, `seq`, `scratch`, `dust` for archival plates.
- **Space:** `space.js` `camera`, `plane`, `drawQuad`; `backdrop(ctx, cam, …)` sets the current line in 3D.
- **Motion on the beat (`groove.js`):** `smoothPulse`, `qRamp`, `pump`, `onBar`, `stepped` (§9.2).
- **Optional meter (`hud.js`):** draws nothing until `METER.on = true`; then `PROGRESS = {chapterId: [from, to, "STATUS"]}`, and scenes return `hud: {status, cracks: [t…]}` to spike it.

## 6. Opening and ending

- **Frame 0:** a graphic already in tension; the first cause → effect within 1 s. The title built one hit at a time (a letter or stroke per accent) is the most reliable hook in the first 2 s.
- **Loop:** the carrier and the protagonist return to their frame-0 state; the last frame matches frame 0.
- **Close:** the arc completes (arrives, empties, fades) on a held final image.

## 7. Watch-fors

Each of these was rejected in earlier reviews. Look for them in every review, unless the card chose one on purpose.

- One real person followed for minutes: it reads as a stranger's story.
- One device everywhere (film strips in every chapter): it stops meaning anything.
- Lyrics as subtitles, or too small for a phone.
- Sections that feel stitched together, with no relay at the seam.
- Haze and glow standing in for an idea: in any look, the picture must still say something.
- A palette that ignores the song, or several competing accents.
- A lyric that appears but changes nothing; every hook looking the same.
- Hits that drift off the music.
- A motif in every scene (the same moon on a page, in a window, on a map).
- Lyrics filling the screen, running off the frame or out of their container; a word split across rows.
- Burst or "pop" rings around a lyric as it appears.
- A camera whose speed changes by accident (raw beat intervals, a walker's steps, each sung word).
- CJK glyphs drawn as outlines only: overlapping contours inside the font show false strokes.

## 8. Review checklists (run on `exports/check/` before showing the user)

Every film:
- [ ] `check.mjs`: no FAIL; each WARN fixed or accepted in `docs/notes.md`.
- [ ] Every sung line readable at phone size (frame viewed 360 px wide); `lyric layout` passes; type fits its container with balanced rows, no orphan unit, no split word.
- [ ] Hits start on their frames (`shots.mjs` at accent times).
- [ ] The sheet shows the card's arc; a loop ending matches frame 0.
- [ ] `node scripts/shots.mjs exports/nl <times> --nolyrics` is the same world without words.
- [ ] Accent colour and motifs only where the card says (grep the scenes for each motif's draw call and count).
- [ ] No decoration appears just because a lyric appeared.
- [ ] The camera behaves as the card says: in a glide, frames 0.5 s apart move by similar distances; surges, stops and jolts land where planned.

Then, by mode:
- **Story:** muted, the first 10 s tell what the protagonist is and does; each key word changes the world on its onset frame (times from `data/words_timed.json`); hook repeats side by side: one grammar, one step further; every seam shares a shape, motion, space or field.
- **Typographic:** the type system changes with the song's sections; key words change the type itself; the hierarchy reads (one word accented per line); the hook repeats escalate.
- **Visualizer:** the picture answers the music visibly (kicks, snares, bands); quiet spans look quiet; the system develops over the film (more layers, new colours, a new geometry for the drop), so minute 3 differs from minute 1.
- **Collage / archival:** every plate is in SOURCES.json, official ones approved by the user; plates are re-printed into one stock (`tone`, `poster`); no plate repeats without a reason.
- **Long take:** the space keeps developing (light, density, camera position); chapter boundaries still show a change.
- **Graphic performance:** shapes move on the beat as choreography; each section has its own move vocabulary; the drop or chorus is the biggest move.

## 9. Lyric type and camera

### 9.1 Lyric type

`style.js` `LYRIC` holds the limits for sung lines; `kit.js` `lyricBox` applies them and `check.mjs` measures against them. They follow `FORMAT`:

| | 16:9 (1920×1080) | 1:1 (1080×1080) | 9:16 / 4:5 (1080 wide) |
|---|---|---|---|
| cap height of a sung line | ≤ 150 px | ≤ 120 px | ≤ 110 px |
| one key word, briefly (`LYRIC.key`) | ≤ 210 px | ≤ 180 px | ≤ 170 px |
| block width | ≤ 60 % | ≤ 76 % | ≤ 84 % |
| block height | ≤ 50 % | ≤ 46 % | ≤ 42 % |
| distance from the frame edge | ≥ 80 px | ≥ 72 px | ≥ 64 px |

- These limit sung lines. Architectural type (a giant cropped title, a word as a wall) is scenery and may be any size, as long as the sung line stays readable on top of it.
- A typographic concept (one word per frame, full-bleed hooks) raises `LYRIC` in `style.js` and says so on the card.
- Fit text to its container: `lyricBox` / `fitRows` + `drawRows` choose the largest cap that fits, with balanced rows (they differ by at most one unit), no single unit alone on a row, and never a break inside a word. For vertical Han lines use `fitColumns` + `drawColumns` (right-to-left columns, one upright unit per cell).
- Measure the text you draw: uppercase (or transform) the units before fitting, not only when drawing.
- CJK: the advance is about 1.37 × cap at weight 900; use `rowLayout`, not a fixed step. Draw CJK with a fill; for a dim or ghost glyph use a low-alpha fill, not an outline.
- Hierarchy comes from contrast, not size: one word in the accent colour, the rest in ink or bone; at most one accented word per line.
- A line that a scene moves away (a block sinking, a pan) stays readable while it is sung; it may leave after its last word.

### 9.2 Camera and travel

Camera behaviour is a per-song choice on the card: a ballad may glide or hold still, a hard-hitting track may jolt, cut and lunge on accents, a song may change mode per chapter. What every song shares: speed changes are meant and sit on the music.
- Glides and long travel: drive them by `groove.js` `smoothPulse(sig, t)`, which irons out grid jitter (raw beat intervals vary ±20 % and read as accidental surging). Landings still fall within a few frames of the beat.
- Deliberate pushes and hits: `pump(sig, t, kind)` or `pulseX` give a move on each beat or accent; make it a clear gesture (a jolt, a punch-in, a cut), not a wobble in a glide.
- Start a glide with `qRamp(q, up)` (a linear speed ramp, integrated) unless a hard start is wanted.
- Do not tie the camera to each sung word unless the card asks for it; words arrive into the frame the camera is already making.
