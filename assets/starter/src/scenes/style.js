// THE PER-SONG SETTINGS FILE: frame format, film settings from the concept card, palette, type,
// lyric limits and post preset. A style swap (references/styles.md) starts here.
// Keep this file free of imports and browser APIs: the engine, the toolkit AND the Node scripts
// (check.mjs, export.mjs, shots.mjs) read it. Scenes take colours and fonts from here (directly or
// via the flat.js / kit.js / looks.js re-exports); never hardcode an rgb or a font family in a scene.
// Colours are [r, g, b] 0..255; rgba() in kit.js turns them into CSS.

// ---------------------------------------------------------------- frame
// Logical canvas in px; scenes use ctx.W / ctx.H. Set it before building scenes.
// 16:9 {w:1920,h:1080} (default) · 9:16 {w:1080,h:1920} · 1:1 {w:1080,h:1080} · 4:5 {w:1080,h:1350}
export const FORMAT = { w: 1920, h: 1080 };
const ASPECT = FORMAT.w / FORMAT.h; // < 0.9 vertical (9:16, 4:5) · 0.9-1.4 square-ish · wide

// ---------------------------------------------------------------- film settings (docs/concept.md)
// The concept card decides these; check.mjs follows them instead of assuming one kind of film.
export const FILM = {
  ending: "loop", // "loop": the last frame hands back to frame 0 (checked) | "close": a designed final image
  lyrics: "full", // "full": every sung line on screen | "key": only chosen lines are set (sparse by design)
  //                 "off": no sung words on screen (only when the user asked for it)
  maxChapter: 45, // s before a chapter WARNs; raise it for a long take or a slow ambient piece
};

// ---------------------------------------------------------------- palette
// default flat-poster palette: black / steel white / one red accent
export const WHITE = [232, 235, 238]; // type and fields
export const BLACK = [8, 8, 10]; // ground
export const RED = [232, 38, 30]; // THE accent: only where the concept card allows it
export const STEEL = [150, 154, 160]; // secondary grey (chrome bands, furniture)
export const HOT = [255, 72, 44]; // hottest accent (strike tip, meter over full scale)
// print / film stock (labels, plates, overlays)
export const INK = [6, 7, 9];
export const BONE = [226, 229, 233];
export const PAPER = [214, 218, 223];
export const SAFE = [168, 35, 27];
export const COLD = [143, 196, 198];

// ---------------------------------------------------------------- post
// post preset every scene spreads into its return value: crisp, no bloom, almost no grain
export const FLAT_POST = { halation: 0.05, grain: 0.025, vignette: 0.1, blur: [0, 0], shoulder: 0 };
// softer stock for light / painterly / film looks (looks.js demos use it); tune per song
export const SOFT_POST = { halation: 0.22, grain: 0.05, vignette: 0.3, blur: [0, 0], shoulder: 1 };

// ---------------------------------------------------------------- type
// Families must be declared with @font-face in index.html; bundled (assets/fonts/README.md):
// Space Grotesk 300-700 (Latin) · Noto Sans KR 100-900 (Hangul, kana, Latin, many Han) ·
// Noto Sans SC 400 / 900 and Noto Serif SC 700 (simplified + common traditional Chinese, kana).
// kit.js fontFor() picks the stack by script. Put the face the concept needs first in its stack
// (a serif, a brush face, Noto Sans JP for Japanese...); check.mjs WARNs about lyric glyphs that
// no bundled font covers.
export const FONT = '"Space Grotesk", "Noto Sans KR", sans-serif'; // Latin text, labels
export const KR = '"Noto Sans KR", "Space Grotesk", sans-serif'; // Hangul
export const CJK = '"Noto Sans SC", "Noto Sans KR", "Space Grotesk", sans-serif'; // Han / kana (serif: "Noto Serif SC" first)
export const DISPLAY = '"Noto Sans KR", "Noto Sans SC", "Space Grotesk", sans-serif'; // giant type (bigType); Chinese giant type: "Noto Sans SC" first

// ---------------------------------------------------------------- lyric limits
// Default size limits for sung lines (cap heights in px on the logical canvas). kit.js lyricBox()
// applies them and check.mjs measures against them (WARN past maxW + 10 % of the width,
// maxH + 5 % of the height, or closer than margin / 2 to an edge).
// They are defaults, not law: a concept built on giant type (type as architecture, one word per
// frame, full-bleed hooks) raises them HERE and says so on the concept card.
export const LYRIC =
  ASPECT < 0.9 ? { cap: 110, key: 170, maxW: 0.84 * FORMAT.w, maxH: 0.42 * FORMAT.h, margin: 64 }
  : ASPECT < 1.4 ? { cap: 120, key: 180, maxW: 0.76 * FORMAT.w, maxH: 0.46 * FORMAT.h, margin: 72 }
  : { cap: 150, key: 210, maxW: 0.6 * FORMAT.w, maxH: 0.5 * FORMAT.h, margin: 80 };
