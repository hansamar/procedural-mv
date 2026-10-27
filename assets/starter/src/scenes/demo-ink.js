// Reference scene, PAPER AND INK look (folk, acoustic, singer-songwriter, chamber, 国风 / 古风,
// quiet jazz): paper ground, one brush line as the protagonist, ink blots as the hit, vertical
// type for Han / kana lines. Same contract as demo.js:
// - stateless: the line, the blots and their fading are all computed from ctx.t
// - the arc is visible: the ridge is painted left to right over the whole film, and the red sun
//   (the one accent, SAFE) rises with it; the line runs through every seam, so IN = previous OUT
// - the hit is a blot that blooms where the brush is when an accent lands, sized by the energy
// - lyrics: CJK lines in right-to-left columns (looks.js fitColumns), others in lyricBox rows,
//   each unit inked in as it is sung; only the letters sit behind ctx.lyricsOn
// For a brush or serif face, put it first in style.js CJK / FONT (measuring and drawing then agree).
import { clamp, prog, ease, noise1, hash } from "../engine/util.js";
import { INK, PAPER, SAFE, SOFT_POST, LYRIC } from "./style.js";
import { rgba, fontFor, lyricBox, drawRows } from "./kit.js";
import { sungAt } from "./flat.js";
import { paper, brush, inkBlot, resample, fitColumns, drawColumns, isCJKLine } from "./looks.js";

// the ridge never depends on t: build it once per frame size (a cache, not state)
const ridges = new Map();
function ridge(W, H) {
  const key = `${W}x${H}`;
  if (!ridges.has(key)) {
    const pts = Array.from({ length: 41 }, (_, i) => {
      const u = i / 40;
      return [W * (-0.04 + 1.08 * u), H * (0.7 + 0.07 * noise1(u * 4, 4) + 0.03 * noise1(u * 13, 5) - 0.06 * Math.sin(Math.PI * u))];
    });
    ridges.set(key, { pts, P: resample(pts, 5) });
  }
  return ridges.get(key);
}

export function demoInk(ctx) {
  const { g, t, W, H, sig, ly, chapter: c } = ctx;
  const u = Math.min(W, H) / 1080; // size unit, so the look holds in any FORMAT
  const timing = { pulse: 0.15, groove: 0.25, ambient: 0.5 }[sig.profile] ?? 0.25;
  const painted = (x) => clamp((1.12 * x) / sig.duration); // share of the ridge painted at time x
  const { pts, P } = ridge(W, H);
  const L = P.at(-1).s;
  const tipAt = (x) => P[Math.min(P.length - 1, Math.round((painted(x) * L) / 5))];

  paper(g, PAPER);

  // the one accent: a sun that rises as the ridge is painted, left of the text (upper right)
  const arc = painted(t);
  g.fillStyle = rgba(SAFE, 0.85);
  g.beginPath();
  g.arc(W * 0.3, H * (0.66 - 0.36 * ease.inOutSine(arc)), 70 * u, 0, Math.PI * 2);
  g.fill();

  // protagonist: the ridge, painted over the whole film
  brush(g, pts, { width: 34 * u, color: INK, alpha: 0.9, k: arc, seed: 3, op: "multiply" });

  // hits: a blot blooms at the brush tip on each accent and fades over ~8 s (seams included)
  const recent = sig.accents.filter((x) => x <= t && x > t - 12).slice(-14);
  for (const x of recent) {
    const tip = tipAt(x);
    const r = (24 + 56 * sig.energy(x)) * u * (0.7 + 0.6 * hash(x, 2));
    const fade = Math.exp(-(t - x) / 8);
    inkBlot(g, tip.x + (hash(x, 3) - 0.5) * 60 * u, tip.y + (hash(x, 4) - 0.4) * 50 * u, r, INK, { k: prog(t, x, x + timing * 2), seed: Math.floor(x * 60), alpha: 0.24 * fade, rough: 0.5 });
  }

  // lyrics: ink in, unit by unit, in the upper right (a colophon's place on a scroll)
  const wide = W > H;
  const s = ctx.lyricsOn ? sungAt(ly, t, 0.8) : null;
  if (s) {
    const cs = s.line.words.map((w) => ({ ch: w.text, t: w.t }));
    const ink = (u0, x, y) => {
      const k = ease.outCubic(prog(t, u0.t, u0.t + timing));
      if (k <= 0) return; // a unit exists only once it is sung
      g.fillStyle = rgba(INK, 0.92 * k);
      g.fillText(u0.ch, x, y);
    };
    g.textAlign = "center";
    if (isCJKLine(cs)) {
      const fit = fitColumns(cs, LYRIC.cap, Math.min(LYRIC.maxH, H * 0.62), { maxW: W * (wide ? 0.3 : 0.55), weight: 500 });
      g.textBaseline = "middle";
      drawColumns(fit, cs, W - LYRIC.margin - 40 * u, LYRIC.margin + 30 * u, (u0, i, cx, cy, cap, size) => {
        g.font = fontFor(u0.ch, size, 500);
        ink(u0, cx, cy);
      }, { align: "right", valign: "top" });
      g.textBaseline = "alphabetic";
    } else {
      const box = lyricBox(cs, W - LYRIC.margin - 20 * u, LYRIC.margin + 30 * u, { maxW: W * (wide ? 0.5 : 0.84), align: "right", valign: "top", weight: 500 });
      drawRows(box, cs, box.x, box.y, (u0, i, cx, base, cap, size) => {
        g.font = fontFor(u0.ch, size, 500);
        ink(u0, cx, base);
      });
    }
    g.textAlign = "left";
  }

  // paper keeps its exact tone: no shoulder, low halation; a little more grain than FLAT_POST
  return { ...SOFT_POST, halation: 0.04, shoulder: 0, vignette: 0.18, grain: 0.04, hud: { status: c.id.toUpperCase(), cracks: recent.slice(-4) } };
}
