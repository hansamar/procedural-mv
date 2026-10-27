# Styles: modes, looks, genres, formats

Contents: 1 pick order · 2 modes · 3 look recipes · 4 genre playbook · 5 formats and platforms · 6 mixing looks in one film

The hard contracts (SKILL.md) hold in every style. Everything here is a starting point: the song, the artist's official visuals and the user's taste come first.

## 1. Pick order

1. **Mode** from what the song is and what the user wants: a story to follow, the words, the sound, archive material, one space, or choreography (§2).
2. **Look** from the genre row (§4) and the reference reading of the official visuals.
3. **Hits and type** from the profile (`visual-language.md` §4) and the look recipe (§3).
4. **Palette** last, from the song's imagery and the official visuals; one dominant accent unless the card overrides it.

Preview a starting look on the song before choosing: `node scripts/shots.mjs exports/look-ink 12 31 --look ink` (also `flat`, `soft`, `visualizer`, or any `<file.js>:<export>` in `src/scenes/`). Then start from the demo the recipe names: copy it into the chapter's file and change it. A look is ready when one test frame per visual system passes the review checklist (`visual-language.md` §8). Set colours, fonts and post presets in `style.js`; keep the existing names and add new ones beside them.

## 2. Modes

| Mode | The film is about | Protagonist | Suits | Watch for |
|---|---|---|---|---|
| story | something going through the song's arc | an object, light, line, mark or (if the user wants) a figure | narrative lyrics, pop, ballads, folk | key words must act on the world; relays at seams |
| typographic | the words as architecture | the type system itself | rap, spoken word, lyric-heavy pop, hook-driven songs | hierarchy and pace; raise `LYRIC` on the card if type goes giant |
| visualizer | the music's shape | the spectrum, the beat, one geometry | EDM, techno, instrumentals, beat tapes, game music | it must develop over the film, not idle like a screensaver |
| collage / archival | PD/CC or approved official material re-printed into one stock | a recurring cut-out or plate | indie, folk, retro, sample-based hip-hop | licences (`assets-credits.md`); one stock (`tone`, `poster`) |
| long take | one continuous space | the camera's journey | post-rock, ambient, cinematic, film scores | raise `FILM.maxChapter`; keep the space developing |
| graphic performance | shapes that dance | a family of shapes | K-pop, dance-pop, funk, Latin | a move vocabulary per section; the chorus has the biggest move |

## 3. Look recipes

Each recipe: where to start, the hit, the lyric treatment, the post preset, and what goes wrong. The hit and the lyric are what weaker results most often get wrong.

**Flat poster kinetic type** (the default look). Start: `demo.js`; `flat.js` `bigType`, `field`, furniture. Hit: slash, shear, inversion, a field wipe. Lyric: `lyricBox` at weight 700–900, one accent word. Post: `FLAT_POST`. Watch: giant type is architecture; the sung line still follows `LYRIC`.

**Soft light / dreamy.** Start: `demo-soft.js`; `looks.js` `gradientField`, `glow`, `motes`. Hit: a light swell (post `expo` ≤ 0.25, `flash` ≤ 0.2), a mote bloom. Lyric: light weight (300–400), each word exposing over 0.4–1 s. Post: `SOFT_POST`. Watch: haze is not an idea; the light protagonist needs a state that changes.

**Paper and ink / watercolour / 国风.** Start: `demo-ink.js`; `paper`, `brush`, `inkBlot`, `lineDraw`. Hit: a blot that blooms over 0.2–0.5 s; a new stroke. Lyric: Han lines in right-to-left columns (`fitColumns`), inked in per character; Latin in rows; Noto Serif SC 700 for a classical tone (put it first in `CJK`). Post: `SOFT_POST` with `shoulder: 0` (exact paper tone), low halation, grain ~0.04. Watch: one red accent (seal, sun); blots fade, they do not pile up.

**Line art / monoline.** Start: `looks.js` `lineDraw` + `resample` on paths built once per frame size. Hit: a new line snaps across; a shape closes. Lyric: light-weight type inked in per unit. Post: `FLAT_POST`. Watch: lines must draw things (a skyline, a hand, a room), not noodles.

**Visualizer / geometric.** Start: `demo-visualizer.js`; `spectrum`, `bars`, `radialBars`. Hit: radius pump on kicks, a flash on snares (pulse profile), a rotation step per bar. Lyric: `lyricBox` beside or under the geometry (a ring interior is too small for a readable line). Post: `FLAT_POST`. Watch: development (more layers, a new geometry for each drop, the accent arriving late).

**Pixel / chiptune / 8-bit.** Start: `looks.js` `pixelLayer(scale)`: draw the world on its `g` in normal frame coordinates (it rasterizes at 1/scale), then `put(g)` scales it up without smoothing. Hit: a palette swap, a pixel burst, a shake in whole pixels. Lyric: on the full-resolution plate in a pixel OFL font (Press Start 2P, Silkscreen; DotGothic16 for kana and kanji), or inside the layer with a cap of at least 12 × scale px, so letters stay legible blocks. Post: `FLAT_POST`, grain 0. Watch: one pixel scale for the whole world; no smooth sub-pixel motion.

**Film / archival / collage.** Start: PD/CC or approved official plates (`assets-credits.md`), `kit.js` `tone`, `seq`, `scratch`, `dust`, `flat.js` `poster`. Hit: a frame jump, a burn (`flash` + `expo`), a cut-out slapped on with a 2 px shadow. Lyric: intertitle cards, typewriter rows, words scratched into the emulsion. Post: `SOFT_POST` with grain ~0.08, halation ~0.3. Watch: every plate logged; all plates re-printed into one stock.

**3D / space.** Start: `space.js` `camera`, `plane`, `drawQuad`, `backdrop.js`; or three.js as a vendored file (`engine.md` §Alternative renderers). Hit: a camera jolt (post `shake`), an object impact. Lyric: slabs in the scene, facing the camera while sung. Post: either preset. Watch: preview perf; planned camera speeds.

**Neon / night city / synthwave / city pop.** Start: `demo-soft.js`; `gradientField` (deep blue → magenta), `glow` along stroked tube paths, a grid floor with `space.js`. Hit: a tube flicker on snares (pattern from `hash(beat index)`, never random), a swell on downbeats. Lyric: tube lettering: a solid thin core over a glow; light or medium weight. Post: `SOFT_POST` with halation ~0.35. Watch: the core stays solid so glow never costs legibility; one hot and one cool colour.

**Risograph / print / halftone / zine.** Start: `demo.js`; `flat.js` `field`, `halftone`; 2–3 spot inks drawn with `multiply`, misregistered by 2–6 px (offset from `hash(chapter index)`). Hit: a new ink layer prints (a field wipe in one ink), a registration jump. Lyric: heavy condensed type in one ink, overprinting the picture. Post: `FLAT_POST`, grain ~0.06. Watch: keep to the inks; overprint, do not blend.

**Glitch / cyber / datamosh.** Start: draw the world into a `kit.js` `layer()`, then draw it back in horizontal bands offset by `hash(bar index, band)`; RGB split = the layer drawn three times with small offsets and `lighter`. Hit: a slice burst on snares, a freeze on a stop. Lyric: solid and readable; glitch the world or a line's exit, never the line being sung. Post: `FLAT_POST`. Watch: glitches only on events; quiet sections stay clean.

## 4. Genre playbook

Starting points, not rules. Read the profile from the analysis: a slow K-pop ballad is "ballad", not "K-pop".

| Genre | Mode · look | Hits and motion | Type and lyrics | Palette · post | Watch for |
|---|---|---|---|---|---|
| pop, dance-pop | story or graphic performance · flat poster, neon | hits on accents; each hook a bigger target | heavy sans; one accent word | 2–3 bright + 1 accent · `FLAT_POST` | hooks that do not develop |
| K-pop | graphic performance, typographic · flat poster, neon, print | hard cuts on choreography hits; the killing part = the biggest move; a new system per section | Hangul 900 + Latin display; a member-colour system may override the one-accent default | saturated, card-defined · `FLAT_POST` | dense but organised; key point visible |
| J-pop, anime song, vocaloid | typographic · flat poster, pixel, glitch | fast cuts on accents; title drops on downbeats | big kana / kanji display; add Noto Sans JP if `fonts` WARNs | bright · `FLAT_POST` | long lines at speed: fit them, do not shrink below phone size |
| hip-hop, rap | typographic, collage · flat poster, zine, print | kicks and snares; ad-libs as stamps; rhyme words accented | many words: rows set per onset; condensed heavy face; `FILM.lyrics` stays full | high contrast + 1 accent · `FLAT_POST` | long lines (let `lyricBox` fit them); the beat switch = a new system |
| rock, punk, metal | story, collage · flat poster, archival, print | slashes and shakes on snares; hard cuts; breakdowns go heavy and slow | condensed heavy, scratched | black, bone, red · grain ~0.06 | keep breakdowns visibly different |
| EDM, house, techno | visualizer, graphic performance · visualizer, neon, geometric | kick pump; the build-up tightens (density, speed via `qRamp`); the drop = a new system on its downbeat | title, BPM, key words; few vocals → `FILM.lyrics = "key"` | dark + 1–2 electric colours · `FLAT_POST` | every drop develops; breakdowns calm down |
| drum & bass, dubstep, trap | visualizer, graphic performance · glitch, neon, 3D | snares on 2 and 4 of the half-time feel; bass wobble drives deformation (`sig.level("low", t)`) | short stacked words | dark, acid accent | the grid may track 170 or 85 BPM: set `per` in `pulseX` / `smoothPulse` |
| R&B, soul, neo-soul | story · soft light, neon night, line art | groove: backbeat and key words; eased motion | light or medium weight; a serif works | warm (amber, plum) · `SOFT_POST` | intimacy through light, not haze |
| ballad, C-pop 抒情, OST | story (descent or journey) · soft light, paper-ink, line art | ambient: 0–1 hits per bar; long relays; one climax (the last chorus) | light weight, exposure 0.5–1 s; vertical columns for Han lines | muted + 1 accent · `SOFT_POST` | fade from black and `FILM.ending = "close"` often fit; write them on the card |
| folk, acoustic, singer-songwriter | story · paper-ink, line art, collage | gentle hits on strums and key words | serif or warm sans | paper, ink, 1 earth accent · `SOFT_POST`, shoulder 0 | small worlds, close detail |
| 国风, 古风, Chinese traditional | story or long take · paper-ink (a scroll that travels) | ink blots and strokes on drum or plucked accents | Noto Serif SC 700 in right-to-left columns | rice paper, ink, cinnabar (`SAFE`) · `SOFT_POST`, shoulder 0 | one motif arc (moon, plum, mountains), not all of them everywhere; PD paintings from museum open-access collections can be plates |
| jazz, swing, bossa nova | graphic performance, typographic · print, line art | swing: hits on offbeats and fills; a solo = a shape improvising | condensed or geometric; numbers as graphics | 2 inks + paper · `FLAT_POST`, grain | rubato needs the variable grid |
| classical, orchestral, film score | long take, story · soft light, line art, 3D | energy drives scale; movements or sections set chapters | titles or none | restrained · `SOFT_POST` | tempo changes: variable grid; raise `FILM.maxChapter` |
| lo-fi, chillhop, city pop | long take, story · pixel, neon night, soft | light hits; steady state with small variations | small caps style, still phone-readable | dusk gradients · `SOFT_POST` | the loop must close seamlessly |
| ambient, post-rock, drone | long take · soft light, 3D space | few hits; the crescendo is the arc | minimal or none | one temperature shift · `SOFT_POST` | `frames` "nearly uniform" WARN may be intended; note it |
| children's, novelty | story · flat poster with round shapes, cut-out | every key word acts, slowly and clearly | big, friendly, high contrast | bright, more colours allowed | pace and legibility |
| hyperpop, experimental, glitchcore | graphic performance, typographic · glitch, print, multi-colour | dense hits; systems change every 8–12 s | chaotic layouts, but the sung line stays readable | card-defined colour system | contract 4 still holds |
| Latin, reggaeton, afrobeats | graphic performance, story · flat poster, print, neon | the dembow or clave pattern (accents), sway from `smoothPulse` | bold, warm | warm saturated | do not hit every kick; feel the pattern |
| instrumental, beat tape, game music | visualizer, story · any | musical events replace key words | title, bar count or none | any | the arc comes from `energy` and the section map |

## 5. Formats and platforms

| Format | `FORMAT` | For | 4K export |
|---|---|---|---|
| 16:9 | `{ w: 1920, h: 1080 }` | YouTube, Bilibili, TV | `--width 3840` |
| 9:16 | `{ w: 1080, h: 1920 }` | 抖音, 快手, 视频号, Reels, Shorts | `--width 2160` |
| 1:1 | `{ w: 1080, h: 1080 }` | feeds | `--width 2160` |
| 4:5 | `{ w: 1080, h: 1350 }` | Instagram feed | `--width 2160` |

- Set `FORMAT` at intake (`new_project.mjs --format 9:16`) or in `style.js` before building scenes. `LYRIC`, export size and `check.mjs` follow it.
- Write layouts in `W`, `H` fractions and `u = Math.min(W, H) / 1080`; branch on `W > H` where a composition needs a different arrangement (the visualizer demo puts the ring left and the line right on wide frames, and stacks them on tall ones).
- Vertical platforms cover the bottom ~18 % (caption, music bar), the right ~12 % (buttons) and the top ~8 %: keep sung lines and the protagonist inside x 6–86 %, y 10–80 % of the frame.
- Short edits: design the full song, then export a section with `export.mjs --from <s> --to <s>` (for example the hook for a 15–30 s clip). The bit-exact audio proof runs only for clips that start at 0 and for full exports.
- A second format of the same film is a second project folder with another `FORMAT`: re-check every chapter with `shots.mjs`, since crops and compositions change.

## 6. Mixing looks in one film

- When the song changes character (a ballad intro before a drop, a rap verse inside a pop song), give each look a home chapter and make the switch a media transform on a real event (`visual-language.md` §2.7).
- Keep one constant across looks (the protagonist, the accent colour or the type family), so it stays one film.
- Add the second look's colours to `style.js` beside the first; keep one post preset per look and spread it in that look's scenes.
