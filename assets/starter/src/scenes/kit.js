// Shared world: palette, film stock, type voices, the shutter, the strip, the line.
import { clamp, lerp, hash, prog, ease } from "../engine/util.js";
import { screenCanvas } from "../engine/render-size.js";
import { partsOf } from "../lyrics/words.js";

export { INK, BONE, PAPER, SAFE, COLD, LYRIC } from "./style.js";
import { INK, BONE, SAFE, FONT, KR, CJK, LYRIC, FORMAT } from "./style.js";
const { w: W, h: H } = FORMAT; // logical canvas
export const rgba = (c, a = 1) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

export { FONT, KR, CJK } from "./style.js";
export const font = (size, weight = 500, fam = FONT) => `${weight} ${size}px ${fam}`;
const hasHangul = (s) => /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(s);
// Han, kana, CJK punctuation (。，「」) and full-width forms all take the CJK stack
const hasCJK = (s) => /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(s);
/** Family stack for a piece of text: Hangul -> KR, Han / kana -> CJK, else FONT. */
export const familyFor = (s) => (hasHangul(s) ? KR : hasCJK(s) ? CJK : FONT);
export const fontFor = (s, size, weight = 500) => font(size, weight, familyFor(s));

// ---------------------------------------------------------------- toned plates
// Every photograph is re-printed into the same paper: ink -> bone with a toe and a shoulder,
// so archive material and code-drawn light share one stock. Cached per image.
const toned = new Map();
export function tone(img, { neg = false, key = "" } = {}) {
  const id = `${img.src}|${neg}|${key}`;
  if (toned.has(id)) return toned.get(id);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  // auto levels from a coarse histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < a.length; i += 16) hist[(a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) | 0]++;
  const total = hist.reduce((s, v) => s + v, 0);
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.005; hi--);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    let x = clamp((v - lo) / Math.max(1, hi - lo));
    x = x * x * (3 - 2 * x) * 0.7 + x * 0.3; // gentle S
    if (neg) x = 1 - x;
    const k = Math.pow(x, 1.1);
    lut[v * 3] = lerp(INK[0] + 4, BONE[0], k);
    lut[v * 3 + 1] = lerp(INK[1] + 3, BONE[1], k);
    lut[v * 3 + 2] = lerp(INK[2] + 3, BONE[2], k);
  }
  for (let i = 0; i < a.length; i += 4) {
    const v = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) | 0;
    a[i] = lut[v * 3];
    a[i + 1] = lut[v * 3 + 1];
    a[i + 2] = lut[v * 3 + 2];
  }
  g.putImageData(d, 0, 0);
  toned.set(id, c);
  return c;
}

/** Sequence frames by name from plates.json, toned. */
export function seq(ctx, name, opts) {
  const ids = ctx.plates.seq[name];
  return ids.map((id) => tone(ctx.img[id], opts));
}

// ---------------------------------------------------------------- layers
const pool = [];
/** Borrow an offscreen full-frame layer (cleared). Return it with release(). */
export function layer() {
  const c = pool.pop() || screenCanvas();
  const g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  g.clearRect(0, 0, W, H);
  return { c, g, release: () => pool.push(c) };
}

/** Composite a layer with optional blur (depth of field) and opacity. */
export function put(g, L, { blur = 0, alpha = 1, op = "source-over" } = {}) {
  g.save();
  g.globalAlpha *= alpha; // multiply: a fade set by the caller around put() must survive
  g.globalCompositeOperation = op;
  if (blur > 0.3) g.filter = `blur(${blur.toFixed(2)}px)`;
  g.drawImage(L.c, 0, 0);
  g.restore();
  L.release();
}

// ---------------------------------------------------------------- type voices
/** Edge code: the film's own printing. Uppercase, tracked, small. */
export function edge(g, text, x, y, { size = 17, color = BONE, alpha = 0.7, track = 0.22, align = "left", weight = 500 } = {}) {
  g.save();
  g.font = fontFor(text, size, weight);
  g.fillStyle = rgba(color, alpha);
  g.textBaseline = "alphabetic";
  const s = String(text).toUpperCase();
  const chars = [...s];
  const ws = chars.map((ch) => g.measureText(ch).width + size * track);
  const total = ws.reduce((a, b) => a + b, 0) - size * track;
  let cx = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  chars.forEach((ch, i) => {
    g.fillText(ch, cx, y);
    cx += ws[i];
  });
  g.restore();
  return total;
}

/**
 * Sung words, laid left to right. A word only exists once the voice reaches it (no run-ahead);
 * it arrives with a short exposure (bright, then settles).
 */
export function sung(g, ly, words, t, x, y, { size = 64, weight = 500, color = BONE, dim = 1, track = 0, max = 1e9, lh = 1.12, expose = 0.12 } = {}) {
  g.save();
  g.textBaseline = "alphabetic";
  let cx = x;
  let cy = y;
  for (const w of words) {
    if (t < w.t - 0.001) break;
    g.font = fontFor(w.text, size, weight);
    const ww = g.measureText(w.text).width;
    if (cx > x && cx + ww > x + max) {
      cx = x;
      cy += size * lh;
    }
    const k = prog(t, w.t, w.t + expose, ease.outCubic);
    const live = t < w.end;
    g.fillStyle = rgba(color, (0.35 + 0.65 * k) * (live ? 1 : dim));
    g.fillText(w.text, cx, cy);
    cx += ww + size * (0.26 + track);
  }
  g.restore();
}

export function measure(g, text, size, weight = 500) {
  g.save();
  g.font = fontFor(text, size, weight);
  const w = g.measureText(text).width;
  g.restore();
  return w;
}

// ---------------------------------------------------------------- the shutter
/**
 * Focal-plane shutter. open: 0 closed .. 1 fully open. slit: gap (px) left when closed.
 * The two curtains meet at y = seam. Blades show as faint horizontal edges.
 */
export function shutter(g, { open = 1, seam = 668, slit = 0, tilt = 0, sheen = 0.06 } = {}) {
  if (open >= 0.999 && slit <= 0) return;
  const topEdge = lerp(seam - slit / 2, -40, open);
  const botEdge = lerp(seam + slit / 2, H + 40, open);
  g.save();
  g.translate(W / 2, seam);
  g.rotate(tilt);
  g.translate(-W / 2, -seam);
  const blade = (y0, y1, dir) => {
    g.fillStyle = "rgb(10, 10, 12)";
    g.fillRect(-200, Math.min(y0, y1), W + 400, Math.abs(y1 - y0));
    // four blades, edges catch a little light
    for (let i = 0; i < 4; i++) {
      const y = y1 - dir * i * Math.max(8, Math.abs(y1 - y0) / 4.2);
      if ((dir > 0 && y < y0) || (dir < 0 && y > y0)) break;
      g.fillStyle = `rgba(233, 227, 214, ${sheen * (1 - i * 0.2)})`;
      g.fillRect(-200, y - (dir > 0 ? 1.5 : 0), W + 400, 1.5);
    }
  };
  blade(-400, topEdge, 1);
  blade(H + 400, botEdge, -1);
  g.restore();
}

// ---------------------------------------------------------------- grease pencil
/** A crop mark in grease pencil: two L corners around a rectangle, drawn on with k 0..1. */
export function cropMark(g, x, y, w, h, k, { color = SAFE, width = 7, seed = 1 } = {}) {
  if (k <= 0) return;
  g.save();
  g.strokeStyle = rgba(color, 0.92);
  g.lineWidth = width;
  g.lineCap = "round";
  g.lineJoin = "round";
  const j = (i) => (hash(seed, i) - 0.5) * width * 1.4;
  const L = Math.min(w, h) * 0.38;
  const seg = (pts, kk) => {
    if (kk <= 0) return;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    const n = pts.length - 1;
    const e = kk * n;
    for (let i = 1; i <= Math.ceil(e); i++) {
      const f = Math.min(1, e - (i - 1));
      g.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f));
    }
    g.stroke();
  };
  seg(
    [
      [x + j(1), y + L],
      [x + j(2), y + j(3)],
      [x + L, y + j(4)],
    ],
    clamp(k * 2),
  );
  seg(
    [
      [x + w - L, y + h + j(5)],
      [x + w + j(6), y + h + j(7)],
      [x + w + j(8), y + h - L],
    ],
    clamp(k * 2 - 1),
  );
  g.restore();
}

/** Film scratch: a vertical hairline that wanders slightly, flickers per frame. */
export function scratch(g, x, t, seed, { alpha = 0.8, width = 1.4, color = BONE, y0 = 0, y1 = H } = {}) {
  const f = Math.round(t * 24);
  const a = alpha * (0.6 + 0.4 * hash(seed, f));
  g.save();
  g.strokeStyle = rgba(color, a);
  g.lineWidth = width;
  g.beginPath();
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const y = lerp(y0, y1, i / n);
    const xx = x + (hash(seed, i) - 0.5) * 3 + Math.sin(i * 0.7 + seed) * 2;
    if (i === 0) g.moveTo(xx, y);
    else g.lineTo(xx, y);
  }
  g.stroke();
  g.restore();
}

/** Dust and hair on the gate: a few specks, reseeded on film frames (24 fps). */
export function dust(g, t, { n = 6, alpha = 0.5, seed = 3 } = {}) {
  const f = Math.round(t * 24);
  g.save();
  for (let i = 0; i < n; i++) {
    if (hash(seed, f, i, 9) > 0.55) continue;
    const x = hash(seed, f, i, 1) * W;
    const y = hash(seed, f, i, 2) * H;
    const r = 0.8 + hash(seed, f, i, 3) * 2.2;
    g.fillStyle = hash(seed, f, i, 4) > 0.5 ? rgba(INK, alpha) : rgba(BONE, alpha * 0.6);
    g.fillRect(x, y, r, r * (1 + hash(seed, f, i, 5) * 3));
  }
  g.restore();
}

// ---------------------------------------------------------------- lyric rows
// A lyric is laid out in UNITS: one CJK character, or one Latin / Hangul word (partsOf() units,
// the same tokens the word timings use). Rows never break inside a unit, are balanced (unit counts
// differ by <= 1) and never leave one unit alone on a row. Sizes are CAP HEIGHTS (px), so CJK and
// Latin lines of the same cap read the same size. cs items: {ch} (or {text}, or plain strings).
const meas = document.createElement("canvas").getContext("2d");
const capK = new Map();
const w100 = new Map();
const unitText = (c) => String(c?.ch ?? c?.text ?? c);
const CJK_CH = /[\u3005\u3007\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

/** Font px size whose cap height is `cap`, in the face fontFor() picks for this text. */
export function capSize(text, cap, weight = 700) {
  const fam = familyFor(text);
  const key = `${fam}|${weight}`;
  if (!capK.has(key)) {
    meas.font = font(100, weight, fam);
    capK.set(key, (meas.measureText("H").actualBoundingBoxAscent || 72) / 100);
  }
  return cap / capK.get(key);
}
/** Advance width of text at a cap height (measured once at 100 px, then scaled). */
function widthAt(text, cap, weight) {
  const key = `${text}|${weight}`;
  if (!w100.has(key)) {
    meas.font = fontFor(text, 100, weight);
    w100.set(key, meas.measureText(text).width);
  }
  return (w100.get(key) * capSize(text, cap, weight)) / 100;
}
/** Word space between two units: only where neither side is a CJK character (Latin / Hangul words). */
const spaced = (a, b) => !CJK_CH.test(a.at(-1) ?? "") && !CJK_CH.test(b[0] ?? "");

/** Lyric text -> units ({ch}) for fitRows / lyricBox. */
export const unitsOf = (text) => partsOf(text).map((ch) => ({ ch }));

/**
 * One row of units at cap: xs = unit centres from the row's left edge, w = row width.
 * gap = extra advance per unit (fraction of its width); word spaces go between Latin / Hangul units.
 */
export function rowLayout(chars, cap, gap = 0.04, { weight = 700 } = {}) {
  const xs = [];
  let x = 0;
  chars.forEach((c, i) => {
    const s = unitText(c);
    if (i > 0 && spaced(unitText(chars[i - 1]), s)) x += widthAt(" ", cap, weight) * (1 + gap);
    const w = widthAt(s, cap, weight) * (1 + gap);
    xs.push(x + w / 2);
    x += w;
  });
  return { xs, w: x };
}

/**
 * Fit units into at most maxRows balanced rows no wider than maxW (and no taller than maxH),
 * shrinking the cap from capMax in 2 px steps down to minCap. Fewest rows win at each cap.
 * Returns {cap, pitch, weight, rows: [{w, cs: [{i, x}]}], w, h, overflow}; h = cap + (n-1)*cap*pitch
 * (cap top of row 1 to baseline of the last row). overflow = nothing fitted even at minCap.
 */
export function fitRows(cs, capMax, maxW, { maxH = Infinity, maxRows = 3, pitch = 1.3, gap = 0.04, minCap = 30, weight = 700 } = {}) {
  const N = cs.length;
  const build = (cap, n) => {
    const base = Math.floor(N / n);
    const extra = N % n;
    const rows = [];
    let i = 0;
    for (let r = 0; r < n; r++) {
      const len = base + (r < extra ? 1 : 0);
      const lay = rowLayout(cs.slice(i, i + len), cap, gap, { weight });
      rows.push({ w: lay.w, cs: lay.xs.map((x, k) => ({ i: i + k, x })) });
      i += len;
    }
    return { cap, pitch, weight, rows, w: Math.max(0, ...rows.map((r) => r.w)), h: cap + (n - 1) * cap * pitch, overflow: false };
  };
  if (!N) return { cap: capMax, pitch, weight, rows: [], w: 0, h: 0, overflow: false };
  // most rows allowed: no lone unit on a row when N > 1
  const nMax = N === 1 ? 1 : Math.max(1, Math.min(maxRows, Math.floor(N / 2)));
  for (let cap = capMax; cap >= minCap; cap -= 2) {
    for (let n = 1; n <= nMax; n++) {
      if (cap + (n - 1) * cap * pitch > maxH) break;
      const fit = build(cap, n);
      if (fit.w <= maxW) return fit;
    }
  }
  // nothing fits: the narrowest layout at minCap that respects maxH
  let n = nMax;
  while (n > 1 && minCap + (n - 1) * minCap * pitch > maxH) n--;
  return { ...build(minCap, n), overflow: true };
}

/**
 * Draw fitted rows. align center|left|right (x = row centre / left / right edge); valign
 * middle|top|bottom (y = block centre / cap top / last baseline). Defaults come from fit
 * (lyricBox sets them). draw(c, i, cx, baseline, cap, size): cx = unit centre, size = font px.
 */
export function drawRows(fit, cs, x, y, draw, { align = fit.align ?? "center", valign = fit.valign ?? (align === "center" ? "middle" : "top") } = {}) {
  const top = valign === "middle" ? y - fit.h / 2 : valign === "bottom" ? y - fit.h : y;
  fit.rows.forEach((row, ri) => {
    const x0 = align === "center" ? x - row.w / 2 : align === "right" ? x - row.w : x;
    const base = top + fit.cap + ri * fit.cap * fit.pitch;
    for (const o of row.cs) draw(cs[o.i], o.i, x0 + o.x, base, fit.cap, capSize(unitText(cs[o.i]), fit.cap, fit.weight));
  });
}

/**
 * Fit a lyric at the default size limits (style.js LYRIC) and clamp the block so it stays
 * >= margin from every frame edge. Returns the fit plus the final x, y, align, valign: pass it
 * straight to drawRows(box, cs, box.x, box.y, draw).
 */
export function lyricBox(cs, x, y, { cap = LYRIC.cap, maxW = LYRIC.maxW, maxH = LYRIC.maxH ?? Infinity, margin = LYRIC.margin, align = "center", valign = align === "center" ? "middle" : "top", ...opts } = {}) {
  const fit = fitRows(cs, cap, Math.min(maxW, W - 2 * margin), { maxH: Math.min(maxH, H - 2 * margin), ...opts });
  const clampSpan = (lo, size, min, max) => (size > max - min ? (min + max - size) / 2 : clamp(lo, min, max - size));
  const left = align === "center" ? x - fit.w / 2 : align === "right" ? x - fit.w : x;
  const top = valign === "middle" ? y - fit.h / 2 : valign === "bottom" ? y - fit.h : y;
  const nl = clampSpan(left, fit.w, margin, W - margin);
  const nt = clampSpan(top, fit.h, margin, H - margin);
  return { ...fit, x: x + (nl - left), y: y + (nt - top), align, valign };
}
