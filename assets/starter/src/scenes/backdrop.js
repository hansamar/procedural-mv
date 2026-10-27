// The sung line as stage scenery: giant type set on a plane in the scene's own world, seen
// through the scene's camera (perspective, parallax, depth of field) and drawn before the
// foreground so the action passes in front of it. Not a subtitle: it lives on the set.
import { clamp, prog, ease, lastIndex } from "../engine/util.js";
import { BONE, INK, rgba, fontFor, layer, put } from "./kit.js";

const REF = 100; // glyphs are laid out at 100 px and mapped to metres per glyph
let meas = null;
function mctx() {
  if (!meas) meas = document.createElement("canvas").getContext("2d");
  return meas;
}

const layouts = new Map();
/** Rows of glyphs in em units (1 em = the plane's `size`). Cached per line and wrap width. */
function layout(line, maxEm, track, weight, upper) {
  const key = `${line.index}|${maxEm}|${track}|${weight}|${upper}`;
  if (layouts.has(key)) return layouts.get(key);
  const g = mctx();
  const space = 0.24;
  const rows = [[]];
  let x = 0;
  line.words.forEach((w, wi) => {
    const text = upper ? w.text.toUpperCase() : w.text;
    g.font = fontFor(text, REF, weight);
    const glyphs = [...text].map((ch) => ({ ch, w: g.measureText(ch).width / REF }));
    const ww = glyphs.reduce((s, q) => s + q.w + track, -track);
    if (x > 0 && x + ww > maxEm) {
      rows.push([]);
      x = 0;
    }
    let gx = x;
    for (const q of glyphs) {
      rows.at(-1).push({ ...q, x: gx, wi, text });
      gx += q.w + track;
    }
    x += ww + space;
  });
  const out = rows.map((r) => ({ glyphs: r, w: r.length ? r.at(-1).x + r.at(-1).w : 0 }));
  layouts.set(key, out);
  return out;
}

/** The line on stage at t: from its first word until the next line starts (or `hold` after it ends). */
export function stageLine(ly, t, hold = 1.2) {
  const i = lastIndex(ly.lines, t, (l) => l.t);
  if (i < 0) return null;
  const l = ly.lines[i];
  const next = ly.lines[i + 1];
  const off = Math.min(l.end + hold, next ? next.t : Infinity);
  if (t >= off) return null;
  return { line: l, fade: prog(t, off - 0.35, off, ease.inQuad) };
}

/**
 * Set the sung line on a world plane.
 *   O     world point of the block's top-left (first row's cap line)
 *   U, V  unit vectors on the plane: along a row, and down the block
 *   size  em height in metres
 * The block is laid out once per line; each glyph gets its own affine from three projected
 * points, so strong perspective stays true without a texture warp.
 */
export function backdrop(ctx, cam, {
  O, U = [1, 0, 0], V = [0, 1, 0], size = 1, maxEm = 9, lead = 0.92, track = -0.02, weight = 600, upper = true,
  align = "left", color = BONE, alpha = 0.9, past = 0.55, op = "source-over", blur = 0, hold = 1.2, line: forced, layerOut = false,
} = {}) {
  const { g, t, ly } = ctx;
  if (!ctx.lyricsOn) return null;
  const on = forced ? { line: forced, fade: 0 } : stageLine(ly, t, hold);
  if (!on) return null;
  const rows = layout(on.line, maxEm, track, weight, upper);
  const L = layer();
  const lg = L.g;
  const P = (a, b) => [O[0] + U[0] * a + V[0] * b, O[1] + U[1] * a + V[1] * b, O[2] + U[2] * a + V[2] * b];
  const words = on.line.words;
  let drawn = 0;
  rows.forEach((row, ri) => {
    const dx = align === "right" ? -row.w : align === "center" ? -row.w / 2 : 0;
    const base = (ri * lead + 0.74) * size; // cap height ~0.74 em
    for (const q of row.glyphs) {
      const w = words[q.wi];
      if (t < w.t - 0.001) continue; // a word only exists once it is sung
      const x0 = (q.x + dx) * size;
      const A = cam.project(P(x0, base));
      const B = cam.project(P(x0 + size, base));
      const C = cam.project(P(x0, base - size));
      if (A.z < 0.08 || B.z < 0.08 || C.z < 0.08) continue;
      const k = prog(t, w.t, w.t + 0.14, ease.outCubic);
      const live = t < w.end + 0.05;
      const a = alpha * (live ? 0.45 + 0.55 * k : past) * (1 - on.fade);
      if (a < 0.004) continue;
      lg.setTransform((B.x - A.x) / REF, (B.y - A.y) / REF, (A.x - C.x) / REF, (A.y - C.y) / REF, A.x, A.y);
      lg.font = fontFor(q.text, REF, weight);
      lg.fillStyle = rgba(color, clamp(a));
      lg.fillText(q.ch, 0, 0);
      drawn++;
    }
  });
  lg.setTransform(1, 0, 0, 1, 0, 0);
  if (layerOut) return drawn ? L : (L.release(), null);
  if (drawn) put(g, L, { blur, op });
  else L.release();
  return on;
}

export { INK };
