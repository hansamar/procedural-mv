# Storyboard table and sub-agent brief

## Storyboard (docs/BRIEF-chapters.md)

One row per chapter, in time order. Fill every cell; an empty IN/OUT is the most common cause of a stitched-together film.

| chapter id | CUTS entry | start s | section (from docs/song.md) | lyric or musical event → world action | repeat step | visual system | IN (= prev OUT) | OUT | arc: carrier from → to | owner, file |
|---|---|---|---|---|---|---|---|---|---|---|
| intro | `null` | 0.00 | intro, no drums | first accent → first letter of the title lands | 1 letter | title on flat field | = last frame of the film | field splits along the slash | 1 of 8 letters | lead, open.js |

Then set `style.js` from the concept card (`FORMAT`, `FILM`, `LYRIC` if raised, palette, fonts, post preset), copy the ids into `CUTS` (chapters.js) and `RAW` (index.js) (and, if the meter is on, the values into `hud.js` `PROGRESS`), and run `node scripts/check.mjs --no-play --no-perf` (no FAIL expected; the demo WARN is normal at this point).

## Building without sub-agents

Build in time order, one chapter at a time: copy the demo closest to the card's look (`demo.js`, `demo-soft.js`, `demo-ink.js`, `demo-visualizer.js`) to the chapter file, rename the export, register it in RAW, render `node scripts/shots.mjs exports/wip <t0+0.02> <mid> <t1-0.1>`, look, fix, then run `check.mjs --no-play --no-perf` before moving on.

## Building with sub-agents

The lead first builds the protagonist (or core system) module, `src/scenes/style.js` (FORMAT, FILM, palette, fonts, post), the meter if used, and the opening chapter, so agents have working examples. Then write one shared brief to `docs/brief.md` and launch 3–5 agents in one message (background). Each prompt: "Read docs/brief.md fully. You are agent X. Your chapters: … Your files: …". Give each agent whole families of repeats (all hooks to one agent), so the development stays consistent.

If launching agents fails (quota, unavailable tool), build without them; do not wait.

```
<SONG> MV: SHARED BRIEF (read fully before writing code)

Project: <absolute path>. A procedural canvas MV for "<song>" (<duration> s), <profile> profile, <bpm> BPM, <beats/bar>/bar.
Scenes live in src/scenes/*.js. A scene is fn(ctx): paint a <W>x<H> plate (style.js FORMAT; use ctx.W / ctx.H, never fixed sizes) on ctx.g and return post settings.

CONCEPT (docs/concept.md)
- Protagonist: <what>. Visible state: <state>.
- Arc: <shape>, carried by <carrier>; the storyboard column says where each chapter starts and ends. Meter: <off | on, set by the lead in hud.js; do not edit>.
- Ending: <loop to frame 0 | close: ...>.
- Throughline: "<one sentence>".
- Mode: <story | typographic | visualizer | ...>. Look: <flat poster | soft light | paper-ink | visualizer | recipe from styles.md>; start every scene by copying <demo file>.
- Palette import: src/scenes/style.js <constant names>; accent <colour> only on <where>.
- FILM: ending <loop | close>, lyrics <full | key | off>. Overrides of the craft defaults: <list from the card, or none>.
- Post preset: <FLAT_POST or the style's preset>. Fonts: <constants>.

RULES
1. No AI images. Material (PD/CC plates, official frames, photos, logos, cover art) only where the table says, from assets/material (logged in SOURCES.json; official items are approved by the user before the export). Nothing else from the official visuals enters the film: the borrowed style is described in CONCEPT.
2. Stateless: everything from ctx.t. No Math.random, Date.now, performance.now, new Date, module counters. Use hash()/noise1().
3. Sung lines are part of the picture and readable at phone size while sung; fit them with kit.js lyricBox / fitRows (looks.js fitColumns for vertical CJK). Only the letters sit behind ctx.lyricsOn.
4. Every hit lands on ctx.sig.accents / kicks / snares or a ctx.ly word onset, and the target visibly reacts.
5. Keep <reserved areas, e.g. y > 950 and corners> free. If the meter is on, return hud: {status: "PLAIN WORDS", cracks: [t...]}.
6. Edit only your own files. RAW in index.js already points at your exports.
7. Banned devices outside their home chapter: <list>.

API: read references/engine.md sections ctx, Signals, Lyrics, Post, looks.js (path: <skill>/references/engine.md), and <demo file>.
Protagonist API: <functions and arguments of the lead's module>.

CHAPTERS: <paste the storyboard rows for this agent, plus the rows just before and after (for IN/OUT)>

VERIFY (repeat until clean)
- node scripts/shots.mjs exports/agent-<X> <t0+0.02> <a few mid times> <t1-0.1>   -> errors must be []
- Look at every frame: lyric readable, hit visible on its frame, IN matches the previous OUT, reserved areas clear.
- node scripts/check.mjs --no-play --no-perf --out exports/agent-<X>-check   -> no FAIL caused by your files
- Delete exports/agent-<X>* when done.

REPORT BACK (short)
- files and export names; what each chapter shows over time; the exact IN and OUT frames; anything unfinished.
```

## After the agents report

1. Run `node scripts/check.mjs`.
2. Open every out-/in- pair and fix relays yourself: seams are the lead's job.
3. Compare the hook repeats side by side: one grammar, one step further each time.
4. Show the user `exports/check/sheet.jpg`.
