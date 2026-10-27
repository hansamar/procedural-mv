// Optional progress meter: one number on every frame (a fill level, a pressure, a count, a speed)
// for concepts whose arc is a climb a stranger should be able to read. OFF by default: switch it on
// in METER only if docs/concept.md chose a meter as the progress device. Many films show their arc
// inside the scenes instead (a growing pile, a fading light) and draw nothing here.
// Scenes may return `hud` in their post settings:
//   hud.status  plain words, bottom right ("CAMERAS TURNED 64")
//   hud.cracks  [t0...] hit times in this chapter (spikes on the meter)
//   hud.g       override the reading (rare)
//   hud.off     hide the meter this frame
import { clamp, lerp, prog, pulse, ease } from "../engine/util.js";
import { BONE, rgba, fontFor } from "./kit.js";
import { HOT } from "./strike.js";

// on: draw the meter. label/unit: what it measures, in plain words. full: bar full scale.
// toStart: the last chapter falls back to its start value on the final second (for loop endings).
export const METER = { on: false, label: "LEVEL", unit: "", full: 25, toStart: true };

// [value at chapter start, value at chapter end, default status], one row per chapter id.
// Shape it after the arc in docs/concept.md (climb, waves, descent, journey ...), not always up.
export const PROGRESS = {
  intro: [0, 1.0, ""],
  "verse-1": [1.0, 3.0, ""],
  "hook-1": [3.0, 12.0, ""],
  outro: [12.0, 0, ""],
};

/** The reading at t (deterministic). */
export function meterAt(ctx, out = {}) {
  const { t, chapter: c, sig } = ctx;
  const [g0, g1] = PROGRESS[c.id] ?? [0, 0];
  const k = clamp((t - c.t0) / Math.max(1e-6, c.t1 - c.t0));
  // last chapter (toStart): hold, then return to the start value in the final second so the end equals frame 0
  const base = METER.toStart && c.id === Object.keys(PROGRESS).at(-1) ? lerp(g0, g1, prog(t, c.t1 - 1.6, c.t1 - 0.5, ease.inOutCubic)) : lerp(g0, g1, ease.inOutSine(k));
  if (out.hud?.g !== undefined) return out.hud.g;
  let spike = 0;
  for (const t0 of out.hud?.cracks ?? []) spike = Math.max(spike, pulse(t, t0, 0.14));
  const kick = pulse(t, t - sig.sinceAccent(t), 0.08);
  return Math.max(0, base * (1 + 0.32 * spike) + 0.25 * spike + 0.04 * base * kick);
}

/** Draw the meter over the plate (nothing unless METER.on). */
export function hud(ctx, out = {}) {
  const { g, t, chapter: c } = ctx;
  if (!METER.on || ctx.nested || out.hud?.off) return;
  const v = meterAt(ctx, out);
  const status = out.hud?.status ?? PROGRESS[c.id]?.[2] ?? "";
  const over = v > METER.full;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.filter = "none";
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  g.shadowBlur = 0;
  g.shadowColor = "transparent";
  const x = 72;
  const y = ctx.H - 68;
  // solid black plates (flat poster language): the readout stays legible on white, red and type fields
  g.fillStyle = "rgb(8, 8, 10)";
  g.fillRect(x - 16, y - 66, 512, 82);
  if (status) {
    g.font = fontFor(status, 15, 500);
    let sw = 0;
    for (const ch of status) sw += g.measureText(ch).width + 15 * 0.22;
    g.fillRect(1848 - sw - 16, y - 30, sw + 32, 46);
  }
  // label + number
  g.font = fontFor(METER.label, 15, 500);
  g.fillStyle = rgba(BONE, 0.55);
  spaced(g, METER.label, x, y - 44, 15 * 0.22);
  g.font = fontFor("0", 40, 600);
  g.fillStyle = over ? rgba(HOT, 0.95) : rgba(BONE, 0.92);
  const num = v >= 99.85 ? "99.9" : v.toFixed(1).padStart(4, "0");
  g.fillText(num, x, y);
  const nw = g.measureText("00.0").width;
  if (METER.unit) {
    g.font = fontFor(METER.unit, 22, 500);
    g.fillStyle = rgba(BONE, 0.6);
    g.fillText(METER.unit, x + nw + 8, y);
  }
  // the bar: 40 ticks; the fill is the reading, a peak tick holds the chapter's top
  const bx = x + nw + 44;
  const n = 40;
  const fill = clamp(v / METER.full) * n;
  for (let i = 0; i < n; i++) {
    const on = i < fill;
    const red = over || i >= n - 6;
    g.fillStyle = on ? (red ? rgba(HOT, 0.9) : rgba(BONE, 0.85)) : rgba(BONE, 0.12);
    g.fillRect(bx + i * 9, y - 22, 5, on ? 22 : 14);
  }
  // status, bottom right: what the look just did, in plain words
  if (status) {
    g.font = fontFor(status, 15, 500);
    g.fillStyle = rgba(BONE, 0.7);
    spaced(g, status, 1848, y, 15 * 0.22, "right");
  }
  g.restore();
}

function spaced(g, text, x, y, track, align = "left") {
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + track;
  w -= track;
  let cx = align === "right" ? x - w : x;
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + track;
  }
}
