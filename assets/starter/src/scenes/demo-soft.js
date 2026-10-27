// Reference scene, SOFT LIGHT look (ballad, R&B / soul, ambient, lo-fi, dream pop, slow C-pop):
// a gradient sky, drifting motes and one light as the protagonist. Same contract as demo.js:
// - stateless: everything is a function of ctx.t; colours from style.js; SOFT_POST
// - the arc is visible: night -> dawn across the film, and the light grows chapter by chapter
// - the hit is a light swell on each accent (energy-scaled; slower and softer on ambient songs),
//   not a slash: the reaction belongs to the look
// - lyrics: lyricBox at a lighter weight, each unit exposes over a profile-dependent time once it
//   is sung; only the letters sit behind ctx.lyricsOn, so the world is the same with ?nolyrics
// - travel (the light's drift) runs on smoothPulse(), never raw beat intervals
import { clamp, lerp, mix3, prog, ease, pulse } from "../engine/util.js";
import { BLACK, COLD, BONE, HOT, SOFT_POST } from "./style.js";
import { rgba, fontFor, lyricBox, drawRows } from "./kit.js";
import { sungAt } from "./flat.js";
import { smoothPulse } from "./groove.js";
import { gradientField, glow, motes } from "./looks.js";

export function demoSoft(ctx) {
  const { g, t, W, H, sig, ly, chapter: c, p } = ctx;
  const e = sig.energy(t); // 0 quiet .. 1 full arrangement
  const arc = clamp((ctx.index + p) / ctx.chapters.length); // 0 -> 1 over the film: night -> dawn
  const timing = { pulse: 0.15, groove: 0.3, ambient: 0.7 }[sig.profile] ?? 0.3;

  // sky: the arc carrier
  const top = mix3(BLACK, COLD, 0.1 + 0.25 * arc);
  const low = mix3(BLACK, HOT, 0.08 + 0.4 * arc);
  gradientField(g, [[0, top], [0.65, mix3(top, low, 0.55)], [1, low]]);

  // world: dust drifts up, denser when the arrangement is full; a few out-of-focus lights
  motes(g, t, { n: Math.round(18 + 50 * e), color: BONE, alpha: 0.2 + 0.25 * e, r: [1, 3.5], drift: [5, -24], seed: 2 });
  motes(g, t, { n: 9, color: HOT, alpha: 0.1, r: [40, 110], drift: [-3, -7], soft: true, seed: 9 });

  // protagonist: one light, drifting at an even speed, swelling on every accent
  const q = smoothPulse(sig, t);
  const x = W * (0.5 + 0.16 * Math.sin(q * 0.09));
  const y = H * (0.66 - 0.12 * arc) + 0.01 * H * Math.sin(q * 0.5);
  const hits = sig.eventsIn("accent", c.t0, t);
  const swell = pulse(t, hits.at(-1) ?? -1, timing) * lerp(0.35, 1, e);
  const R = Math.min(W, H) * (0.07 + 0.08 * arc) * (1 + 0.4 * swell);
  glow(g, x, y, R * 4, HOT, 0.3 + 0.3 * swell);
  glow(g, x, y, R, BONE, 0.75 + 0.25 * swell, { core: 0.3 });

  // lyrics: light type, word by word
  const s = ctx.lyricsOn ? sungAt(ly, t, 1.0) : null;
  if (s) {
    const cs = s.line.words.map((w) => ({ ch: w.text, t: w.t }));
    const box = lyricBox(cs, W / 2, H * 0.3, { weight: 400 });
    g.textAlign = "center";
    drawRows(box, cs, box.x, box.y, (u, i, cx, base, cap, size) => {
      const k = ease.outCubic(prog(t, u.t, u.t + timing * 1.5));
      if (k <= 0) return; // a unit exists only once it is sung
      g.font = fontFor(u.ch, size, 400);
      g.fillStyle = rgba(BONE, k * (u.t === s.word?.t ? 1 : 0.78));
      g.fillText(u.ch, cx, base + cap * 0.12 * (1 - k)); // settles into place as it exposes
    });
    g.textAlign = "left";
  }

  return { ...SOFT_POST, expo: 1 + 0.12 * swell, hud: { status: c.id.toUpperCase(), cracks: hits.slice(-4) } };
}
