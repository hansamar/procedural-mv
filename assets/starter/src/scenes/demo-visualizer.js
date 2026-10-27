// Reference scene, ABSTRACT VISUALIZER look (EDM, techno, house, drum & bass, instrumental
// electronica; any film the user wants without a story): the music's own shape is the subject.
// Same contract as demo.js:
// - stateless; colours from style.js; FLAT_POST
// - "protagonist" = the ring: its radius pumps on kicks, its bars are the band levels
//   (looks.js spectrum), it turns one step per bar (a cut on the one, not a drift)
// - the arc is visible: more rings as the film goes on, the accent colour arrives late
// - hits: snares flash (pulse profile only), accents tint the ring with the accent colour
// - layout follows FORMAT: wide frames put the ring left and the sung line right; square and
//   vertical frames stack them. The line is fitted with lyricBox at the LYRIC limits (a ring
//   interior is too small a container for a readable line); instrumentals show the bar count.
//   Only the letters sit behind ctx.lyricsOn
import { clamp, prog, ease, pulse } from "../engine/util.js";
import { WHITE, BLACK, RED, STEEL, FLAT_POST } from "./style.js";
import { rgba, fontFor, lyricBox, drawRows } from "./kit.js";
import { field, label, sungAt } from "./flat.js";
import { pump, stepped } from "./groove.js";
import { spectrum, radialBars, bars, glow } from "./looks.js";

export function demoVisualizer(ctx) {
  const { g, t, W, H, sig, ly, chapter: c } = ctx;
  const e = sig.energy(t);
  const arc = clamp(t / sig.duration);
  const u = Math.min(W, H) / 1080;
  const wide = W > H * 1.2;
  const square = !wide && W > H * 0.9;
  const cx = wide ? W * 0.3 : W / 2, cy = wide ? H * 0.47 : square ? H * 0.38 : H * 0.34; // ring centre
  const ru = u * (wide ? 1 : square ? 0.72 : 0.9); // the ring shrinks when the line has to sit under it
  field(g, BLACK);

  // the ring: kick pump on the radius, one rotation step per bar
  const bar = sig.barAt(t);
  const rot = -Math.PI / 2 + (Math.PI / 8) * stepped(bar.x, 0.2);
  const kick = pump(sig, t, "kick", 0.09);
  const R = 250 * ru * (1 + 0.1 * kick);
  const hits = sig.eventsIn("accent", c.t0, t);
  const tint = pulse(t, hits.at(-1) ?? -1, 0.2) * clamp(arc * 2 - 0.4); // the accent arrives late
  const vals = spectrum(sig, t, 48).map((v) => (v < 0.8 ? v : 0.8 + 0.2 * Math.tanh((v - 0.8) / 0.2))); // soft knee: peaks stay in frame
  const rings = 1 + Math.floor(arc * 2.99); // 1 -> 3 rings over the film
  for (let k = rings - 1; k >= 0; k--) {
    const col = k === 0 && tint > 0.05 ? RED : k === 0 ? WHITE : STEEL;
    radialBars(g, vals, cx, cy, R * (1 + 0.55 * k), 230 * ru * (1 - 0.25 * k), { color: col, alpha: k ? 0.35 : 0.9, width: (k ? 3 : 7) * ru, rot: rot + k * 0.2 });
  }
  glow(g, cx, cy, R * 0.95, RED, 0.25 * tint + 0.08 * kick);

  // the floor: the whole spectrum as a thin mirrored strip
  bars(g, spectrum(sig, t, 96, { seed: 8 }), W * 0.08, H * 0.88, W * 0.84, H * 0.06, { color: WHITE, alpha: 0.35 + 0.3 * e, mirror: true });

  // type: the sung line beside (or under) the ring, else the bar count
  const tx = wide ? W * 0.56 : W / 2, ty = wide ? H * 0.47 : square ? H * 0.75 : H * 0.7;
  const s = ctx.lyricsOn ? sungAt(ly, t) : null;
  if (s) {
    const cs = s.line.words.map((w) => ({ ch: w.text.toUpperCase(), t: w.t })); // fit the text you draw
    const box = lyricBox(cs, tx, ty, { maxW: wide ? W * 0.4 : W * 0.84, align: wide ? "left" : "center", valign: "middle", weight: 700 });
    g.textAlign = "center";
    drawRows(box, cs, box.x, box.y, (u0, i, ux, base, cap, size) => {
      const k = ease.outExpo(prog(t, u0.t, u0.t + 0.1));
      if (k <= 0) return;
      g.font = fontFor(u0.ch, size, 700);
      g.fillStyle = rgba(u0.t === s.word?.t && tint > 0.05 ? RED : WHITE, k);
      g.fillText(u0.ch, ux, base);
    });
    g.textAlign = "left";
  } else if (!ly.lines.length) {
    label(g, String(Math.max(0, bar.index + 1)).padStart(3, "0"), tx, ty, { size: 120 * u, align: wide ? "left" : "center", color: WHITE, track: 0.04 });
  }
  label(g, `${c.id.toUpperCase()}  ${Math.round(60 / sig.period)} BPM`, 72 * u, 80 * u, { size: 18 * u, color: WHITE, alpha: 0.6 });

  const snap = sig.profile === "pulse" ? sig.hit("snare", t, 0.05) * e : 0;
  return { ...FLAT_POST, flash: 0.16 * snap, zoom: 1 + 0.012 * kick, hud: { status: c.id.toUpperCase(), cracks: hits.slice(-4) } };
}
