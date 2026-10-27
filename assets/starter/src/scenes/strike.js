// The strike: a reusable cause->effect device. Screen-space helpers (logical canvas) so one strike reads
// as the same object all film long: a tapered metal line thrown in from off frame, an accent-hot tip
// that lands ON the beat, a crack (burst + sparks + shock ring), and the thing it hits reacting.
// Use it as the protagonist, or as the template for your own protagonist module. Stateless: everything is a function of t and the crack time t0.
import { clamp, lerp, ease, prog, pulse, hash } from "../engine/util.js";
import { BONE, rgba } from "./kit.js";

export { HOT } from "./style.js";
import { HOT, FORMAT } from "./style.js";
const { w: W, h: H } = FORMAT;
export const WIN = 0.09; // seconds the throw takes; the tip lands on t0

const bez = (P, u) => {
  const v = 1 - u;
  return [0, 1].map((i) => v * v * v * P[0][i] + 3 * v * v * u * P[1][i] + 3 * v * u * u * P[2][i] + u * u * u * P[3][i]);
};

/**
 * A strike path from a hand (usually off frame) to a target, as 49 points.
 *   from  [x, y] start (off frame)    to [x, y] where the tip lands
 *   bend  how far the line bellies out (px, signed)    seed varies the S-curve
 */
export function strikePath(from, to, { bend = 420, seed = 1 } = {}) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const s = hash(seed) > 0.5 ? 1 : -1;
  const P = [
    from,
    [from[0] + dx * 0.3 + nx * bend * s, from[1] + dy * 0.3 + ny * bend * s],
    [from[0] + dx * 0.72 - nx * bend * 0.55 * s, from[1] + dy * 0.72 - ny * bend * 0.55 * s],
    to,
  ];
  return Array.from({ length: 49 }, (_, i) => bez(P, i / 48));
}

/** Convenience: thrown at `to` from one of the frame edges ("l", "r", "t", "b", "tl", "tr", "bl", "br"). */
export function strikeFrom(side, to, opts = {}) {
  const E = { l: [-260, H * 0.35], r: [W + 260, H * 0.39], t: [W * 0.36, -260], b: [W * 0.57, H + 260], tl: [-240, -200], tr: [W + 240, -220], bl: [-240, H + 220], br: [W + 240, H + 220] };
  return strikePath(E[side] ?? E.l, to, opts);
}

/**
 * The strike in flight and its crack. Draw over the scene.
 *   pts    path (strikePath)    t0 the crack time (tip lands)
 *   big    a heavier line and a bigger burst    win throw time (s)
 *   slack  seconds before the throw the slack line is already hanging in shot (0 = none)
 *   hot    red of the tip/sparks 0..1 (keep red as an accent)    scale overall size multiplier
 * Returns the crack energy 0..1 (1 at t0, decaying) so the scene can drive its target.
 */
export function crack(g, t, t0, pts, { big = false, win = WIN, slack = 0, hot = 1, scale = 1, color = BONE } = {}) {
  const age = t - t0;
  const e = age >= 0 ? Math.exp(-age / 0.09) : 0;
  if (age < -Math.max(win, slack) || age > 0.6) return e;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.lineCap = "round";
  g.lineJoin = "round";
  // slack line, hanging and swaying before the throw pulls it taut
  if (slack > 0 && age < -win) {
    const k = prog(age, -slack, -win);
    const sw = Math.sin(t * 2.3) * 22;
    g.strokeStyle = rgba(color, 0.28 * Math.min(1, k * 4));
    g.lineWidth = 2.4 * scale;
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const u = i / (pts.length - 1);
      const yy = y + (sw + 90 * (1 - k)) * Math.sin(Math.PI * u);
      i ? g.lineTo(x, yy) : g.moveTo(x, yy);
    });
    g.stroke();
  }
  const p = age < 0 ? ease.inCubic(clamp(1 + age / win)) : 1;
  const vis = age < 0 ? (age < -win ? 0 : 1) : Math.exp(-age / 0.06);
  if (vis > 0.02) {
    const n = Math.max(2, Math.round(p * (pts.length - 1)) + 1);
    const tail = Math.max(0, n - 22);
    const w0 = (big ? 11 : 7) * scale;
    for (const pass of [0, 1]) {
      for (let k = tail + 1; k < n; k++) {
        const u = (k - tail) / Math.max(1, n - tail);
        const w = lerp(w0, 1.4 * scale, u);
        // pass 0: the dark body of the steel; pass 1: the hard specular catch along it
        g.strokeStyle = pass ? rgba([255, 255, 255], vis * (0.25 + 0.75 * u)) : rgba([70, 72, 78], vis * (0.4 + 0.6 * u));
        g.lineWidth = pass ? Math.max(1, w * 0.38) : w;
        const o = pass ? -w * 0.18 : 0;
        g.beginPath();
        g.moveTo(pts[k - 1][0], pts[k - 1][1] + o);
        g.lineTo(pts[k][0], pts[k][1] + o);
        g.stroke();
      }
    }
    const [tx, ty] = pts[n - 1];
    g.fillStyle = rgba(HOT, vis * hot);
    g.beginPath();
    g.arc(tx, ty, (big ? 7 : 5) * scale, 0, Math.PI * 2);
    g.fill();
  }
  if (age >= 0) {
    const [cx, cy] = pts.at(-1);
    const r = (big ? 300 : 180) * scale * (0.35 + ease.outExpo(clamp(age / 0.08)));
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, rgba(BONE, 0.9 * e));
    gr.addColorStop(0.2, rgba(HOT, 0.5 * e * hot));
    gr.addColorStop(1, rgba(HOT, 0));
    g.fillStyle = gr;
    g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const sp = ease.outExpo(clamp(age / 0.14));
    for (let j = 0; j < (big ? 14 : 9); j++) {
      const a = hash(t0 * 7, j) * Math.PI * 2;
      const l0 = (24 + 36 * sp) * scale;
      const l1 = l0 + (60 + 140 * hash(t0, j, 2)) * sp * scale;
      g.strokeStyle = j % 3 ? rgba(BONE, Math.exp(-age / 0.1)) : rgba(HOT, Math.exp(-age / 0.1) * hot);
      g.lineWidth = 1.8 * scale;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0);
      g.lineTo(cx + Math.cos(a) * l1, cy + Math.sin(a) * l1);
      g.stroke();
    }
    shock(g, t, t0, cx, cy, { r: (big ? 900 : 520) * scale });
  }
  g.restore();
  return e;
}

/** A sonic shock ring expanding from (x, y): the crack is supersonic. */
export function shock(g, t, t0, x, y, { r = 600, dur = 0.45, width = 3, alpha = 0.55, color = BONE } = {}) {
  const age = t - t0;
  if (age < 0 || age > dur) return;
  const k = ease.outCubic(age / dur);
  g.save();
  g.strokeStyle = rgba(color, alpha * (1 - k));
  g.lineWidth = width * (1 + 2 * (1 - k));
  g.beginPath();
  g.arc(x, y, 20 + r * k, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** Crack energy without drawing: 0 before t0, 1 at t0, decays (hl seconds). For driving targets. */
export const hitAt = (t, t0, hl = 0.12) => pulse(t, t0, hl);
/** Latest crack time <= t from a sorted list, or -Infinity. */
export function lastCrack(times, t) {
  let out = -Infinity;
  for (const x of times) if (x <= t) out = x;
  return out;
}
/** How many cracks have landed by t. */
export const cracksBy = (times, t) => times.filter((x) => x <= t).length;
