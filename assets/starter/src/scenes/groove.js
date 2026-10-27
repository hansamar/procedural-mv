// GROOVE: one place that turns the song's pulse into motion, so every chapter moves the same way.
// Pure functions of audio time t (stateless, no Math.random / Date).
//
// Grid-agnostic: sig.beats is whatever beat_grid.json tracked. `per` = grid beats per FELT beat
// (1 when the grid holds the felt pulse; 2 when it tracked eighths; 0.5 when it tracked half time).
// Felt beats are counted from the first downbeat, so per = 2 still lands on the one.
//
// Never tie camera speed (or any travel: scroll, dolly, conveyor) to raw beat intervals or to
// per-word events. Tracked beats jitter by tens of ms and sung words bunch up and stall; a speed
// read off them makes the whole world lurch. Drive travel with smoothPulse() (box-averaged, even
// speed) and keep hits (pump) for things that may jump: type, flashes, scale kicks.
import { clamp, lerp, ease } from "../engine/util.js";

/** Grid beat index of the first downbeat (bar 0, beat 0). */
const downX = (sig) => Math.round(sig.beatAt(sig.timeOfBar(0)).x);

/** Felt-beat position at t: fractional count of felt beats since the first downbeat. */
export function pulseX(sig, t, { per = 1 } = {}) {
  return (sig.beatAt(t).x - downX(sig)) / per;
}

/**
 * pulseX with the grid's jitter ironed out: box average over +-w s (n+1 taps). Footfalls / steps
 * stay within a few frames of the beat while the speed stays even. Use for anything that drives a
 * camera or travel.
 */
export function smoothPulse(sig, t, { w = 0.9, n = 12, per = 1 } = {}) {
  let s = 0;
  for (let i = 0; i <= n; i++) s += pulseX(sig, t - w + (2 * w * i) / n, { per });
  return s / (n + 1);
}

/**
 * Integrated linear speed ramp: distance travelled at q when speed rises linearly 0 -> 1 over
 * [0, up], then holds 1. Eased start without the surge of an ease curve. q, up in the same unit
 * (e.g. felt beats since the chapter start).
 */
export function qRamp(q, up) {
  if (up <= 0) return q;
  if (q <= 0) return 0;
  return q < up ? (q * q) / (2 * up) : q - up / 2;
}

/** Stepped motion: holds, then moves in the first `move` part of each unit (bar / beat). */
export function stepped(x, move = 0.35, fn = ease.outCubic) {
  const i = Math.floor(x);
  return i + fn(clamp((x - i) / move));
}

/** Hit from the latest onset of a kind, scaled by how full the arrangement is (quiet stays quiet). */
export function pump(sig, t, kind = "kick", hl = 0.1) {
  return sig.hit(kind, t, hl) * lerp(0.35, 1, sig.energy(t));
}

/** Snap a time in seconds to the nearest downbeat (for keyframes written in seconds). */
export function onBar(sig, s) {
  return sig.timeOfBar(Math.round(sig.barAt(s).x));
}
