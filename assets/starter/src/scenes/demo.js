// Reference scene: shows the scene contract and the core grammar in ~60 lines.
// - stateless: everything is a function of ctx.t (the player seeks)
// - the sung word is the composition (huge, cropped) and the world obeys it
// - every accent is a cause (slash) with a visible effect (layout shears); amplitude follows
//   sig.energy(t), density follows sig.profile (sig.accents is already profile-aware)
// - lyrics: lyricBox() fits the whole line once (balanced rows, style.js LYRIC limits, inside the
//   margins), so the layout never jumps; a unit only appears once it is sung (no run-ahead)
// - travel (the grid) runs on smoothPulse(): even speed, never raw beat intervals
// - returns post settings; FLAT_POST keeps flat whites/accents exact
import { clamp, prog, ease } from "../engine/util.js";
import { WHITE, BLACK, RED, FLAT_POST, field, bigType, slash, shear, invert, flipOn, label, corners, grid, sungAt } from "./flat.js";
import { rgba, fontFor, lyricBox, drawRows } from "./kit.js";
import { smoothPulse } from "./groove.js";

export function demo(ctx) {
  const { g, t, W, H, sig, ly, chapter: c, p } = ctx;
  const e = sig.energy(t); // 0 quiet .. 1 full arrangement
  // repeats develop: later chapters get a bigger field of the accent colour
  const heat = clamp(ctx.index / Math.max(1, ctx.chapters.length - 1));
  field(g, BLACK);
  field(g, RED, 0, H * (1 - 0.6 * heat * p), W, H);

  // the grid travels one cell per felt beat, at an even speed
  const q = smoothPulse(sig, t);
  g.save();
  g.translate(0, (q % 1) * 120);
  grid(g, 0, -120, W, H + 240, 120, { color: WHITE, alpha: 0.08 + 0.08 * e });
  g.restore();

  // type motion speed follows the profile (visual-language.md §4)
  const snap = { pulse: 0.12, groove: 0.2, ambient: 0.6 }[sig.profile] ?? 0.2;
  const s = ctx.lyricsOn ? sungAt(ly, t) : null;
  if (s) {
    const cs = s.line.words.map((w) => ({ ch: w.text.toUpperCase(), t: w.t })); // fit the text you draw
    const box = lyricBox(cs, W / 2, H / 2, { weight: 900 });
    g.textAlign = "center";
    drawRows(box, cs, box.x, box.y, (u, i, x, y, cap, size) => {
      if (t < u.t) return; // a unit exists only once it is sung
      const k = ease.outExpo(prog(t, u.t, u.t + snap));
      g.font = fontFor(u.ch, size * (1.15 - 0.15 * k), 900); // lands from slightly big
      // the word being sung takes the accent; on the red field it turns black so it still reads
      const onRed = y - cap / 2 > H * (1 - 0.6 * heat * p);
      g.fillStyle = rgba(u.t === s.word?.t ? (onRed ? BLACK : RED) : WHITE, 1);
      g.fillText(u.ch, x, y);
    });
    g.textAlign = "left";
  } else if (!ly.lines.length) {
    // instrumental: the bar count is the type
    const bar = sig.barAt(t);
    bigType(g, String(Math.max(0, bar.index + 1)).padStart(3, "0"), W / 2, H * 0.7, { cap: Math.min(520, W * 0.27), align: "center", fit: W * 0.88, fill: "chrome" });
  }

  // cause -> effect on the last accent of this chapter
  const hits = sig.eventsIn("accent", c.t0, t);
  const h0 = hits.at(-1) ?? -1;
  const a = [W * 0.06, H * 0.83];
  const b = [W * 0.94, H * 0.17];
  const decay = sig.profile === "ambient" ? 0.5 : 0.12;
  shear(g, a, b, (14 + 40 * e) * Math.exp(-(t - h0) / decay));
  slash(g, t, h0, a, b, { width: 6 + 14 * e });
  // hard inversions only where the music is dense enough to carry them
  if (sig.profile === "pulse" && flipOn(hits.filter((x) => sig.barAt(x).isDownbeat), t, 0.07)) invert(g);

  corners(g, 40, 40, W - 80, H - 80, { color: WHITE });
  label(g, `${c.id.toUpperCase()}  ${t.toFixed(2)}  ${sig.profile.toUpperCase()}`, 72, 80, { color: WHITE, alpha: 0.7 });
  return { ...FLAT_POST, hud: { status: c.id.toUpperCase(), cracks: hits.slice(-4) } };
}
