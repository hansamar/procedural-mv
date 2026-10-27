// The flat graphic language (poster): impact from layout, not lighting.
// Huge heavy type that IS the composition (cropped, bleeding off frame), flat fields of black /
// steel white / one red, chrome as hard-banded flat metal, the strike as a vector slash that cuts
// the layout in two, beat-hard inversions, and UI furniture (windows, readouts, grids, barcodes,
// halftone). No haze, no glow: use FLAT_POST for the post settings.
import { clamp, lerp, ease, prog, pulse, hash } from "../engine/util.js";
import { BONE, INK, rgba, layer } from "./kit.js";
import { HOT } from "./style.js";

export { WHITE, BLACK, RED, STEEL, FLAT_POST, DISPLAY, LYRIC } from "./style.js";
import { WHITE, BLACK, RED, STEEL, DISPLAY, FORMAT } from "./style.js";
const { w: W, h: H } = FORMAT; // logical canvas
const meas = document.createElement("canvas").getContext("2d");
const capCache = new Map();
function capOf(weight) {
  if (capCache.has(weight)) return capCache.get(weight);
  meas.font = `${weight} 100px ${DISPLAY}`;
  const m = meas.measureText("H");
  const k = (m.actualBoundingBoxAscent || 72) / 100;
  capCache.set(weight, k);
  return k;
}
/** Width of text at a cap height (px), before stretch. */
export function typeWidth(text, cap, { weight = 900, track = -0.03 } = {}) {
  const size = cap / capOf(weight);
  meas.font = `${weight} ${size}px ${DISPLAY}`;
  let w = 0;
  for (const ch of text) w += meas.measureText(ch).width + track * size;
  return w - track * size;
}

/**
 * Heavy display type. (x, y) = left (or center/right) of the BASELINE.
 *   cap     cap height in px (make it huge: 300-900)     fit  force the width (px), overrides stretch
 *   stretch horizontal scale (1.12 reads "extended")     fill a color array, "chrome", or a CanvasGradient
 *   stroke  outline only (px)    align left|center|right    track letter spacing in em
 * Returns {x, y, w, h} of the drawn box (screen px).
 */
export function bigType(g, text, x, y, { cap = 400, weight = 900, fill = WHITE, stroke = 0, align = "left", stretch = 1.1, fit = 0, track = -0.03, alpha = 1, skew = 0 } = {}) {
  const raw = typeWidth(text, cap, { weight, track });
  const sx = fit ? fit / Math.max(1, raw) : stretch;
  const w = raw * sx;
  const size = cap / capOf(weight);
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  g.save();
  g.globalAlpha *= alpha;
  g.translate(x0, y);
  g.transform(sx, 0, -skew, 1, 0, 0);
  g.font = `${weight} ${size}px ${DISPLAY}`;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  const paint = fill === "chrome" ? chromeGrad(g, -cap, 0) : Array.isArray(fill) ? rgba(fill, 1) : fill;
  let cx = 0;
  for (const ch of text) {
    if (stroke) {
      g.strokeStyle = paint;
      g.lineWidth = stroke / sx;
      g.lineJoin = "miter";
      g.strokeText(ch, cx, 0);
    } else {
      g.fillStyle = paint;
      g.fillText(ch, cx, 0);
    }
    cx += g.measureText(ch).width + track * size;
  }
  g.restore();
  return { x: x0, y: y - cap, w, h: cap };
}

/** Polished steel as hard flat bands (a top-lit chrome horizon) between y0 (top) and y1. */
export function chromeGrad(g, y0, y1, { dark = 0 } = {}) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  const d = (c) => (dark ? shade(c, dark) : c);
  [
    [0, "#5a5c61"], [0.14, "#e9ebee"], [0.3, "#ffffff"], [0.46, "#7c7f85"], [0.5, "#16171a"],
    [0.62, "#4a4c51"], [0.82, "#cfd2d6"], [0.94, "#f4f5f7"], [1, "#6a6c71"],
  ].forEach(([k, c]) => gr.addColorStop(k, d(c)));
  return gr;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

// ------------------------------------------------------------------ fields
/** Fill the frame (or a rect) flat. */
export function field(g, color, x = 0, y = 0, w = W, h = H, a = 1) {
  g.fillStyle = rgba(color, a);
  g.fillRect(x, y, w, h);
}
/** Hard invert of a rect (difference with white): the beat flip. amt 0/1 (keep it binary on beats). */
export function invert(g, amt = 1, x = 0, y = 0, w = W, h = H, { keepRed = true } = {}) {
  if (amt <= 0.001) return;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "difference";
  g.fillStyle = `rgba(255,255,255,${clamp(amt)})`;
  g.fillRect(x, y, w, h);
  g.restore();
  // red is the only colour: a difference flip turns it cyan, so map cyan back to red (full frame)
  if (keepRed && amt >= 0.999) {
    const d = g.getImageData(0, 0, g.canvas.width, g.canvas.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 1] - a[i] > 90 && a[i + 2] - a[i] > 90) {
        a[i] = RED[0];
        a[i + 1] = RED[1];
        a[i + 2] = RED[2];
      }
    }
    g.putImageData(d, 0, 0);
  }
}
/** True for `dur` seconds after each time in `times` (a hard, frame-exact flip). */
export const flipOn = (times, t, dur = 0.09) => times.some((t0) => t >= t0 && t < t0 + dur);

// ------------------------------------------------------------------ the strike as a vector slash
/**
 * A slash across the layout: drawn a→b in `win` s ending at t0, then a hairline scar that fades.
 * Flat: a sharp white blade with a red core, no glow. Returns 0..1 crack energy.
 */
export function slash(g, t, t0, a, b, { width = 16, win = 0.07, scar = 0.6, color = WHITE, core = RED } = {}) {
  const age = t - t0;
  if (age < -win || age > scar + 0.3) return 0;
  const k = age < 0 ? ease.inCubic(clamp(1 + age / win)) : 1;
  const e = age >= 0 ? Math.exp(-age / 0.08) : 0;
  const ex = lerp(a[0], b[0], k);
  const ey = lerp(a[1], b[1], k);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const wNow = age < 0 ? width : width * (0.15 + 0.85 * e);
  if (wNow > 0.4) {
    // a tapered blade: fat at the tip end, needle at the start
    g.fillStyle = rgba(color, age < 0 ? 1 : Math.max(0.15, e));
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(ex + nx * wNow / 2, ey + ny * wNow / 2);
    g.lineTo(ex + (dx / len) * wNow * 2, ey + (dy / len) * wNow * 2);
    g.lineTo(ex - nx * wNow / 2, ey - ny * wNow / 2);
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(core, age < 0 ? 1 : e);
    g.lineWidth = Math.max(1, wNow * 0.18);
    g.beginPath();
    g.moveTo(lerp(a[0], ex, 0.35), lerp(a[1], ey, 0.35));
    g.lineTo(ex, ey);
    g.stroke();
  }
  if (age >= 0 && age < scar) {
    g.strokeStyle = rgba(core, 0.85 * (1 - age / scar));
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  g.restore();
  return e;
}

/**
 * Cut whatever is on `g` along the line a→b and shear the two halves apart (the crack splits the
 * layout). Call AFTER drawing the content to be cut. amount px of shear along the cut.
 */
export function shear(g, a, b, amount, { open = 0, fill = BLACK } = {}) {
  if (Math.abs(amount) < 0.3 && open < 0.3) return;
  const L = layer();
  L.g.drawImage(g.canvas, 0, 0, W, H, 0, 0, W, H); // coords in film px (render-size scales them)
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (fill) {
    g.fillStyle = rgba(fill, 1);
    g.fillRect(0, 0, W, H); // what shows through the gap (null = clear)
  } else g.clearRect(0, 0, W, H);
  for (const side of [1, -1]) {
    g.save();
    g.beginPath();
    const far = 4000;
    g.moveTo(a[0] - ux * far, a[1] - uy * far);
    g.lineTo(b[0] + ux * far, b[1] + uy * far);
    g.lineTo(b[0] + ux * far - uy * far * side, b[1] + uy * far + ux * far * side);
    g.lineTo(a[0] - ux * far - uy * far * side, a[1] - uy * far + ux * far * side);
    g.closePath();
    g.clip();
    g.drawImage(L.c, side * amount * ux - side * open * uy, side * amount * uy + side * open * ux);
    g.restore();
  }
  g.restore();
  L.release();
}

// ------------------------------------------------------------------ UI furniture
/**
 * A system window (steel chrome UI): title bar, body lines, optional buttons.
 *   open 0..1 (scales in from the title bar)    hot index of a highlighted button
 */
export function win(g, x, y, w, h, { title = "", lines = [], buttons = [], open = 1, hot = -1, size = 22, fg = BLACK, bg = WHITE } = {}) {
  if (open <= 0.001) return;
  const hh = Math.max(34, size * 1.6);
  const hOpen = hh + (h - hh) * ease.outExpo(clamp(open));
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = rgba(BLACK, 1);
  g.fillRect(x + 10, y + 10, w, hOpen); // hard drop shadow
  g.fillStyle = rgba(bg, 1);
  g.fillRect(x, y, w, hOpen);
  g.fillStyle = chromeGrad(g, y, y + hh);
  g.fillRect(x, y, w, hh);
  g.strokeStyle = rgba(fg, 1);
  g.lineWidth = 3;
  g.strokeRect(x, y, w, hOpen);
  g.beginPath();
  g.moveTo(x, y + hh);
  g.lineTo(x + w, y + hh);
  g.stroke();
  g.font = `700 ${Math.round(size * 0.8)}px ${DISPLAY}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillStyle = rgba(fg, 1);
  g.fillText(title, x + 16, y + hh / 2 + 1);
  for (let i = 0; i < 3; i++) g.strokeRect(x + w - 30 - i * 26, y + hh / 2 - 8, 16, 16);
  if (open > 0.6) {
    g.save();
    g.beginPath();
    g.rect(x, y + hh, w, hOpen - hh);
    g.clip();
    g.font = `700 ${size}px ${DISPLAY}`;
    g.textBaseline = "alphabetic";
    lines.forEach((l, i) => {
      g.fillStyle = typeof l === "object" ? rgba(l.color ?? fg, 1) : rgba(fg, 1);
      g.fillText(typeof l === "object" ? l.text : l, x + 22, y + hh + size * 1.6 * (i + 1));
    });
    const bw = (w - 44 - (buttons.length - 1) * 16) / Math.max(1, buttons.length);
    buttons.forEach((b, i) => {
      const bx = x + 22 + i * (bw + 16);
      const by = y + h - size * 2.6;
      const on = i === hot;
      g.fillStyle = rgba(on ? fg : bg, 1);
      g.fillRect(bx, by, bw, size * 1.8);
      g.strokeRect(bx, by, bw, size * 1.8);
      g.fillStyle = rgba(on ? bg : fg, 1);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(b, bx + bw / 2, by + size * 0.92);
      g.textAlign = "left";
    });
    g.restore();
  }
  g.restore();
}

/** Small monospace-ish readout text (UI labels). */
export function label(g, text, x, y, { size = 18, color = WHITE, alpha = 1, align = "left", weight = 700, track = 0.12 } = {}) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = `${weight} ${size}px ${DISPLAY}`;
  g.textBaseline = "alphabetic";
  g.fillStyle = rgba(color, alpha);
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + track * size;
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + track * size;
  }
  g.restore();
}

/** A hairline grid over a rect. */
export function grid(g, x, y, w, h, step = 60, { color = WHITE, alpha = 0.12, width = 1 } = {}) {
  g.save();
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  g.beginPath();
  for (let gx = x; gx <= x + w + 0.1; gx += step) {
    g.moveTo(gx, y);
    g.lineTo(gx, y + h);
  }
  for (let gy = y; gy <= y + h + 0.1; gy += step) {
    g.moveTo(x, gy);
    g.lineTo(x + w, gy);
  }
  g.stroke();
  g.restore();
}

/** Barcode block. */
export function barcode(g, x, y, w, h, seed = 1, { color = WHITE, alpha = 1 } = {}) {
  g.save();
  g.fillStyle = rgba(color, alpha);
  let cx = x;
  let i = 0;
  while (cx < x + w) {
    const bw = 2 + Math.floor(hash(seed, i) * 4) * 2;
    if (i % 2 === 0) g.fillRect(cx, y, Math.min(bw, x + w - cx), h);
    cx += bw;
    i++;
  }
  g.restore();
}

/** Halftone dots over a rect; f(u, v) -> 0..1 dot size (u, v in 0..1). */
export function halftone(g, x, y, w, h, f, { cell = 18, color = WHITE, alpha = 1 } = {}) {
  g.save();
  g.fillStyle = rgba(color, alpha);
  g.beginPath();
  for (let gy = 0; gy * cell < h; gy++) {
    for (let gx = 0; gx * cell < w; gx++) {
      const off = gy % 2 ? cell / 2 : 0;
      const px = x + gx * cell + off;
      const py = y + gy * cell;
      const r = (cell / 2) * clamp(f((px - x) / w, (py - y) / h));
      if (r < 0.4) continue;
      g.moveTo(px + r, py);
      g.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  g.fill();
  g.restore();
}

/** Corner registration ticks (frame furniture), viewfinder corners. */
export function corners(g, x, y, w, h, { len = 28, color = WHITE, alpha = 0.7, width = 2 } = {}) {
  g.save();
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  g.beginPath();
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.moveTo(cx, cy + sy * len);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * len, cy);
  }
  g.stroke();
  g.restore();
}

/** The sung line (or a word of it) at t, for type-led layouts: {line, word, words sung so far}. */
export function sungAt(ly, t, hold = 0.6) {
  const i = ly.lines.findLastIndex((l) => l.t <= t);
  if (i < 0) return null;
  const line = ly.lines[i];
  const next = ly.lines[i + 1];
  if (t > Math.min(line.end + hold, next ? next.t : Infinity)) return null;
  const sung = line.words.filter((w) => w.t <= t);
  return { line, word: sung.at(-1) ?? null, sung };
}

export { HOT, INK, BONE };

// ------------------------------------------------------------------ real material -> flat
const posters = new Map();
/**
 * Posterize a real image (an archive plate: ctx.img[id]) into flat tones, so real material can
 * turn into graphics: levels 2 = hard black/white threshold; colors picks the tone per level
 * (dark -> light). cut 0..1 shifts the threshold. Cached per (src, levels, cut, colors).
 */
export function poster(img, { levels = 2, cut = 0.5, colors = null, invert: inv = false } = {}) {
  const cols = colors ?? (levels === 2 ? [BLACK, WHITE] : levels === 3 ? [BLACK, STEEL, WHITE] : Array.from({ length: levels }, (_, i) => [0, 1, 2].map((j) => lerp(BLACK[j], WHITE[j], i / (levels - 1)))));
  const id = `${img.src}|${levels}|${cut}|${cols.flat().join(",")}|${inv}`;
  if (posters.has(id)) return posters.get(id);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  // auto levels, then quantize around the cut
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < a.length; i += 32) {
    const v = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let i = 0; i < a.length; i += 4) {
    let x = clamp(((a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) - lo) / Math.max(1, hi - lo));
    if (inv) x = 1 - x;
    const k = levels === 2 ? (x >= cut ? 1 : 0) : Math.min(levels - 1, Math.floor(clamp(x + (0.5 - cut)) * levels));
    const col = cols[k];
    a[i] = col[0];
    a[i + 1] = col[1];
    a[i + 2] = col[2];
  }
  g.putImageData(d, 0, 0);
  posters.set(id, c);
  return c;
}
