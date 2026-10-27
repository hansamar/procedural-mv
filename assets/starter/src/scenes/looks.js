// LOOKS: stateless primitives for looks other than the flat poster (references/styles.md):
// light and gradients, drifting particles, paper and ink, line drawing, a spectrum for visualizers,
// a pixel layer and vertical CJK columns. Each one draws from its arguments alone: pass t, seed any
// randomness with hash / noise1. The caches in this file depend on their arguments, never on t.
// Colours come from style.js (pass them in); nothing here picks a palette.
import { clamp, lerp, hash, noise1, TAU, ease } from "../engine/util.js";
import { screenCanvas } from "../engine/render-size.js";
import { FORMAT } from "./style.js";
import { rgba, capSize } from "./kit.js";
export { SOFT_POST, FLAT_POST } from "./style.js";
const { w: W, h: H } = FORMAT;
const mod = (a, m) => ((a % m) + m) % m;
const unitText = (c) => String(c?.ch ?? c?.text ?? c);

// ---------------------------------------------------------------- light
/** Linear gradient over a rect. stops: [[offset 0..1, rgb, alpha = 1], ...]; angle 90 = top -> bottom. */
export function gradientField(g, stops, { angle = 90, x = 0, y = 0, w = W, h = H, alpha = 1 } = {}) {
  const a = (angle * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = (Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * h) / 2;
  const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  for (const [k, c, al = 1] of stops) gr.addColorStop(clamp(k), rgba(c, al * alpha));
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
}

/** Soft radial light (no shadowBlur, cheap). op "lighter" adds light; "source-over" paints a soft spot. */
export function glow(g, x, y, r, color, alpha = 1, { core = 0.12, op = "lighter" } = {}) {
  if (!(r > 0) || alpha <= 0) return;
  g.save();
  g.globalCompositeOperation = op;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, alpha));
  gr.addColorStop(clamp(core, 0.01, 0.9), rgba(color, alpha * 0.55));
  gr.addColorStop(Math.max(0.45, core + 0.05), rgba(color, alpha * 0.14));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
  g.restore();
}

/**
 * Drifting particles (dust, snow, embers, bokeh) as a pure function of t: each starts at a hashed
 * position and moves at its own speed, wrapping inside area [x, y, w, h]. drift = px/s [x, y];
 * r = [min, max] radius; twinkle = alpha flicker 0..1; soft = bokeh discs instead of dots.
 */
export function motes(g, t, { n = 40, seed = 1, color, alpha = 0.5, r = [1.5, 5], drift = [4, -18], area = [0, 0, W, H], twinkle = 0.3, soft = false, op = "lighter" } = {}) {
  const [ax, ay, aw, ah] = area;
  g.save();
  g.globalCompositeOperation = op;
  for (let i = 0; i < n; i++) {
    const sp = lerp(0.5, 1.5, hash(i, seed, 3));
    const rad = lerp(r[0], r[1], hash(i, seed, 4) ** 2);
    const pw = aw + 4 * rad;
    const ph = ah + 4 * rad;
    const x = ax - 2 * rad + mod(hash(i, seed, 1) * pw + drift[0] * sp * t + 40 * noise1(t * 0.15 + i, seed), pw);
    const y = ay - 2 * rad + mod(hash(i, seed, 2) * ph + drift[1] * sp * t, ph);
    const a = alpha * (1 - twinkle + twinkle * (0.5 + 0.5 * noise1(t * 1.3 + i * 7.1, seed + 1)));
    if (soft) glow(g, x, y, rad, color, a, { core: 0.55, op });
    else {
      g.fillStyle = rgba(color, a);
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- paper and ink
const papers = new Map();
/** Paper ground: a flat colour with fixed tooth (grain) and fibres, cached per colour and seed. Ink goes on with op "multiply". */
export function paper(g, color, { tooth = 0.05, fibres = 160, seed = 7 } = {}) {
  const key = `${color}|${tooth}|${fibres}|${seed}`;
  let c = papers.get(key);
  if (!c) {
    c = screenCanvas(); // render resolution, so 4K export keeps the grain fine
    const p = c.getContext("2d");
    p.fillStyle = rgba(color);
    p.fillRect(0, 0, W, H);
    const img = p.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1;
    for (let i = 0; i < d.length; i += 4) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const n = (((s >>> 0) & 255) / 255 - 0.5) * 2 * tooth * 255;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    p.putImageData(img, 0, 0);
    p.lineCap = "round";
    for (let i = 0; i < fibres; i++) {
      const x = hash(i, seed, 1) * W;
      const y = hash(i, seed, 2) * H;
      const a = hash(i, seed, 3) * TAU;
      const l = 20 + 90 * hash(i, seed, 4);
      const dark = hash(i, seed, 5) < 0.6;
      p.strokeStyle = rgba(color.map((v) => (dark ? v * 0.82 : Math.min(255, v * 1.06))), 0.22);
      p.lineWidth = 0.6 + hash(i, seed, 6);
      p.beginPath();
      p.moveTo(x, y);
      p.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      p.stroke();
    }
    papers.set(key, c);
  }
  g.drawImage(c, 0, 0);
}

/** Closed wobbly outline (periodic harmonics, so no seam). */
function blobPath(g, x, y, r, rough, seed, n = 56) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    let m = 1;
    for (let k = 2; k <= 7; k++) m += (rough / k) * Math.sin(k * a + TAU * hash(seed, k)) * (0.6 + 0.8 * hash(seed, k, 2));
    const px = x + Math.cos(a) * r * m;
    const py = y + Math.sin(a) * r * m;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.closePath();
}

/**
 * Ink or watercolour blot: stacked irregular discs, densest in the core, with a darker rim where
 * pigment collects. k = bloom 0..1 (from a hit: prog(t, t0, t0 + 0.4)).
 */
export function inkBlot(g, x, y, r, color, { k = 1, seed = 1, alpha = 0.4, layers = 4, rough = 0.35, op = "multiply" } = {}) {
  const kk = ease.outCubic(clamp(k));
  if (kk <= 0 || r <= 0) return;
  g.save();
  g.globalCompositeOperation = op;
  for (let l = 0; l < layers; l++) {
    blobPath(g, x, y, r * kk * (0.45 + (0.55 * (l + 1)) / layers), rough, seed * 31 + l);
    g.fillStyle = rgba(color, (alpha / layers) * (1.5 - l / layers));
    g.fill();
  }
  blobPath(g, x, y, r * kk, rough, seed * 31 + layers - 1);
  g.lineWidth = Math.max(1, r * 0.025);
  g.strokeStyle = rgba(color, alpha * 0.45);
  g.stroke();
  g.restore();
}

/** Polyline -> points every `step` px: {x, y, s (length so far), nx, ny (unit normal)}. */
export function resample(pts, step = 6) {
  const out = [];
  let s = 0; // length at the start of the segment
  let next = 0; // length of the next sample
  let nx = 0;
  let ny = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 1e-6) continue;
    nx = -(y1 - y0) / l;
    ny = (x1 - x0) / l;
    for (; next <= s + l; next += step) out.push({ x: x0 + ((x1 - x0) * (next - s)) / l, y: y0 + ((y1 - y0) * (next - s)) / l, s: next, nx, ny });
    s += l;
  }
  const [xe, ye] = pts.at(-1);
  if (!out.length || out.at(-1).s < s) out.push({ x: xe, y: ye, s, nx, ny });
  return out;
}

/**
 * Brush stroke along a polyline: a ribbon body whose width follows the pressure (taper in and
 * out), bristle streaks at the edges and dry-brush gaps (飞白) where the ink runs thin.
 * k = how much of the stroke is painted (0..1), so a line can be drawn on in time.
 */
export function brush(g, pts, { width = 28, color, alpha = 0.9, k = 1, seed = 1, bristles = 14, dry = 0.35, taper = 0.15, op = "source-over" } = {}) {
  const P = resample(pts, 4);
  const L = P.at(-1).s || 1;
  const end = L * clamp(k);
  if (end <= 0) return;
  const drawn = P.filter((q) => q.s <= end);
  const press = (s) => Math.min(ease.outCubic(clamp(s / L / taper)), 0.3 + 0.7 * clamp((1 - s / L) / taper)) * (1 + 0.12 * noise1(s / 45, seed));
  const dryAt = (s) => clamp(dry * (0.6 + 1.2 * noise1(s / 220, seed + 7)) + dry * 0.8 * (s / L) ** 3);
  g.save();
  g.globalCompositeOperation = op;
  // body
  const side = (q, sgn) => {
    const h = (width / 2) * press(q.s) * (1 - 0.85 * dryAt(q.s));
    return [q.x + sgn * q.nx * h, q.y + sgn * q.ny * h];
  };
  g.fillStyle = rgba(color, alpha);
  g.beginPath();
  drawn.forEach((q, i) => (i ? g.lineTo(...side(q, 1)) : g.moveTo(...side(q, 1))));
  for (let i = drawn.length - 1; i >= 0; i--) g.lineTo(...side(drawn[i], -1));
  g.closePath();
  g.fill();
  // bristles
  g.lineCap = "round";
  g.lineWidth = Math.max(1, (width / bristles) * 1.2);
  for (let b = 0; b < bristles; b++) {
    const off = bristles > 1 ? b / (bristles - 1) - 0.5 : 0;
    g.strokeStyle = rgba(color, alpha * (0.55 + 0.4 * hash(b, seed)));
    g.beginPath();
    let pen = false;
    for (const q of drawn) {
      const lift = 0.5 + 0.5 * noise1(q.s / 22 + b * 13.7, seed) < dryAt(q.s) * (0.5 + 1.2 * Math.abs(off));
      const o = off * width * press(q.s);
      if (lift) pen = false;
      else if (pen) g.lineTo(q.x + q.nx * o, q.y + q.ny * o);
      else {
        g.moveTo(q.x + q.nx * o, q.y + q.ny * o);
        pen = true;
      }
    }
    g.stroke();
  }
  g.restore();
}

/** Draw the first k (0..1) of a polyline's length: line art that draws itself. */
export function lineDraw(g, pts, k, { width = 3, color, alpha = 1, cap = "round", close = false } = {}) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (close && pts.length > 2) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
  if (k <= 0 || L <= 0) return;
  g.save();
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  g.lineCap = cap;
  g.lineJoin = "round";
  g.setLineDash([L * clamp(k), L + 1]);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- visualizer
const BANDS = ["sub", "low", "lowmid", "mid", "high", "air"];
/**
 * n bar heights (0..~1.5 at the loudest; soft-clip before mapping to a hard limit) from the analysed band levels at t, low -> high, smoothly
 * interpolated across the six bands, with per-bar detail that moves with the flux. The analysis
 * has six bands, not an FFT: the shape is real, single bins are invented, so keep n <= ~128.
 */
export function spectrum(sig, t, n = 48, { detail = 0.35, seed = 5 } = {}) {
  const lv = BANDS.map((b) => sig.level(b, t));
  const fl = clamp(sig.level("flux", t));
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = (i / Math.max(1, n - 1)) * (BANDS.length - 1);
    const j = Math.min(BANDS.length - 2, Math.floor(x));
    const f = x - j;
    const base = lerp(lv[j], lv[j + 1], f * f * (3 - 2 * f));
    out.push(Math.max(0, base * (1 + detail * (0.4 + fl) * noise1(t * 7 + i * 1.73, seed))));
  }
  return out;
}

/** Bars from values (0..1 = full height h) on a baseline at y; mirror = grow both ways from y. */
export function bars(g, vals, x, y, w, h, { color, alpha = 1, gap = 0.35, mirror = false, min = 2 } = {}) {
  const step = w / vals.length;
  const bw = Math.max(1, step * (1 - gap));
  g.fillStyle = rgba(color, alpha);
  vals.forEach((v, i) => {
    const bh = Math.max(min, v * h);
    g.fillRect(x + i * step + (step - bw) / 2, mirror ? y - bh / 2 : y - bh, bw, bh);
  });
}

/** Bars around a circle: r0 = inner radius, len = length at value 1; rot in radians; mirror = both halves. */
export function radialBars(g, vals, cx, cy, r0, len, { color, alpha = 1, width = 6, rot = -Math.PI / 2, mirror = true, cap = "round" } = {}) {
  const n = vals.length;
  const total = mirror ? 2 * n : n;
  g.save();
  g.strokeStyle = rgba(color, alpha);
  g.lineWidth = width;
  g.lineCap = cap;
  g.beginPath();
  for (let i = 0; i < total; i++) {
    const v = vals[mirror && i >= n ? total - 1 - i : i];
    const a = rot + (i / total) * TAU;
    const r1 = r0 + Math.max(1, v * len);
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- pixels
const pixPool = new Map();
/**
 * Low-res layer for pixel looks: draw on L.g in normal frame coordinates, then L.put(g) scales
 * it up with smoothing off. scale = frame px per pixel (6..12 reads as pixel art).
 */
export function pixelLayer(scale = 8) {
  const pool = pixPool.get(scale) ?? pixPool.set(scale, []).get(scale);
  const w = Math.ceil(W / scale);
  const h = Math.ceil(H / scale);
  let c = pool.pop();
  if (!c) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
  }
  const lg = c.getContext("2d");
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalAlpha = 1;
  lg.globalCompositeOperation = "source-over";
  lg.clearRect(0, 0, w, h);
  lg.setTransform(1 / scale, 0, 0, 1 / scale, 0, 0);
  return {
    g: lg,
    put(g, { alpha = 1 } = {}) {
      g.save();
      g.globalAlpha *= alpha;
      g.imageSmoothingEnabled = false;
      g.drawImage(c, 0, 0, w * scale, h * scale);
      g.restore();
      pool.push(c);
    },
  };
}

// ---------------------------------------------------------------- vertical CJK
/**
 * Vertical setting for Han / kana lines (kit.js fitRows turned 90 degrees): balanced columns,
 * read right to left, no unit alone in a column, the cap shrinks from capMax until the block fits
 * maxH (and maxW). One unit per cell, upright: keep Latin-heavy lines horizontal.
 * Returns {cap, size, colW, pitch, cols: [{h, cs: [{i, y}]}], w, h, overflow}.
 */
export function fitColumns(cs, capMax, maxH, { maxW = Infinity, maxCols = 3, pitch = 1.45, gap = 0.08, minCap = 30, weight = 700 } = {}) {
  const N = cs.length;
  const build = (cap, n) => {
    const size = capSize("国", cap, weight);
    const cell = size * (1 + gap);
    const base = Math.floor(N / n);
    const extra = N % n;
    const cols = [];
    let i = 0;
    for (let k = 0; k < n; k++) {
      const len = base + (k < extra ? 1 : 0);
      cols.push({ h: len * cell, cs: Array.from({ length: len }, (_, j) => ({ i: i + j, y: (j + 0.5) * cell })) });
      i += len;
    }
    return { cap, size, colW: size, pitch, weight, cols, w: size + (n - 1) * size * pitch, h: Math.max(0, ...cols.map((c) => c.h)), overflow: false };
  };
  if (!N) return { ...build(capMax, 1), cols: [], w: 0, h: 0 };
  const nMax = N === 1 ? 1 : Math.max(1, Math.min(maxCols, Math.floor(N / 2)));
  for (let cap = capMax; cap >= minCap; cap -= 2) {
    for (let n = 1; n <= nMax; n++) {
      const fit = build(cap, n);
      if (fit.w > maxW) break;
      if (fit.h <= maxH) return fit;
    }
  }
  return { ...build(minCap, nMax), overflow: true };
}

/**
 * Draw fitted columns. align right|center|left: x = right edge | block centre | left edge;
 * valign top|middle: y = top | block centre. Column 0 is the rightmost (read first).
 * draw(c, i, cx, cy, cap, size): cx, cy = cell centre (set g.textAlign "center", g.textBaseline "middle").
 */
export function drawColumns(fit, cs, x, y, draw, { align = "center", valign = "middle" } = {}) {
  const right = align === "right" ? x : align === "left" ? x + fit.w : x + fit.w / 2;
  const top = valign === "middle" ? y - fit.h / 2 : y;
  fit.cols.forEach((col, k) => {
    const cx = right - fit.colW / 2 - k * fit.colW * fit.pitch;
    for (const o of col.cs) draw(cs[o.i], o.i, cx, top + o.y, fit.cap, capSize(unitText(cs[o.i]), fit.cap, fit.weight));
  });
}

/** True when every unit of a line is Han / kana (a candidate for vertical setting). */
export const isCJKLine = (cs) => cs.length > 0 && cs.every((c) => /^[\u3005\u3007\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+$/.test(unitText(c)));
