import { lastIndex } from "../engine/util.js";

const BAND_PREFIX = "band_";

/**
 * Musical signals, all pure functions of audio time t (seconds).
 * grid = data/beat_grid.json: {beats[], period, offset, beats_per_bar, downbeat, profile, mode}.
 * Old grids without beats[] (offset + period only) still work.
 */
export function createSignals(features, grid, vocalData) {
  const dt = features.time_axis.dt;
  const n = features.time_axis.n;
  const bands = {};
  for (const [key, values] of Object.entries(features.envelopes)) {
    bands[key.startsWith(BAND_PREFIX) ? key.slice(BAND_PREFIX.length) : key] = Float32Array.from(values);
  }
  const kicks = features.kicks.map((k) => k.t);
  const snares = features.snares.map((s) => s.t);
  const hats = features.hats.map((h) => h.t);
  const quiet = features.quiet_spans.map((q) => [q.from, q.to]);
  const vox = vocalData ? Float32Array.from(vocalData.rms) : null;
  const duration = features.source.duration_s;

  function band(name, t) {
    const a = bands[name];
    const x = Math.min(n - 1.001, Math.max(0, t / dt));
    const i = Math.floor(x);
    const u = x - i;
    return a[i] * (1 - u) + a[i + 1] * u;
  }

  const peaks = {};
  for (const name of Object.keys(bands)) {
    const sorted = Float32Array.from(bands[name]).sort();
    peaks[name] = sorted[Math.floor(sorted.length * 0.95)] || 1;
  }

  /** Band level normalised to its 95th percentile, capped at 1.5. */
  const level = (name, t) => Math.min(1.5, band(name, t) / peaks[name]);

  // ------------------------------------------------------------------ energy: 0..1, smoothed ~1.5 s
  // How full the arrangement is right now. Scale every effect amplitude with it, so quiet
  // verses stay quiet whatever the profile.
  const energyArr = (() => {
    const src = bands.rms;
    const w = Math.max(1, Math.round(0.75 / dt));
    const pre = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[i];
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - w);
      const b = Math.min(n, i + w + 1);
      out[i] = (pre[b] - pre[a]) / (b - a);
    }
    const s = Float32Array.from(out).sort();
    const lo = s[Math.floor(n * 0.05)];
    const hi = s[Math.floor(n * 0.95)] || 1;
    for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) / (hi - lo + 1e-9)));
    return out;
  })();
  function energy(t) {
    const x = Math.min(n - 1.001, Math.max(0, t / dt));
    const i = Math.floor(x);
    return energyArr[i] + (energyArr[i + 1] - energyArr[i]) * (x - i);
  }

  function since(times, t) {
    const i = lastIndex(times, t);
    return i < 0 ? Infinity : t - times[i];
  }

  function kickAges(t, count) {
    const last = lastIndex(kicks, t);
    const ages = [];
    for (let k = last; k >= 0 && ages.length < count; k--) ages.push(t - kicks[k]);
    return ages;
  }

  // ------------------------------------------------------------------ beat grid (constant or variable)
  const period = grid.period;
  const beats = grid.beats?.length ? grid.beats : (() => {
    const b = [];
    for (let x = grid.offset; x <= duration + period; x += period) b.push(x);
    return b;
  })();
  const bpb = grid.beats_per_bar || 4;
  const down = grid.downbeat || 0;
  const profile = grid.profile || "groove";
  const B = beats.length;
  const edgeP = (i) => (i <= 0 ? beats[1] - beats[0] : beats[B - 1] - beats[B - 2]) || period;

  /** Beat position at t: x = fractional beat index into beats[] (extrapolated outside). */
  function beatAt(t) {
    let x;
    if (t < beats[0]) x = (t - beats[0]) / edgeP(0);
    else if (t >= beats[B - 1]) x = B - 1 + (t - beats[B - 1]) / edgeP(B);
    else {
      const i = lastIndex(beats, t);
      x = i + (t - beats[i]) / (beats[i + 1] - beats[i]);
    }
    const index = Math.floor(x);
    const phase = x - index;
    return { x, index, phase, age: t - timeOfBeat(index), length: timeOfBeat(index + 1) - timeOfBeat(index) };
  }
  /** Time of (fractional) beat index i. */
  function timeOfBeat(i) {
    if (i <= 0) return beats[0] + i * edgeP(0);
    if (i >= B - 1) return beats[B - 1] + (i - (B - 1)) * edgeP(B);
    const k = Math.floor(i);
    return beats[k] + (i - k) * (beats[k + 1] - beats[k]);
  }
  /** Bar position at t. index 0 = the first full bar; beat = 0..bpb-1 inside the bar. */
  function barAt(t) {
    const b = beatAt(t);
    const rel = b.x - down;
    const index = Math.floor(rel / bpb);
    const inBar = rel - index * bpb;
    const r = Math.round(rel); // an onset a few ms early still counts as its beat
    const isDownbeat = Math.abs(rel - r) < 0.25 && ((r % bpb) + bpb) % bpb === 0;
    return { index, beat: Math.floor(inBar), phase: inBar / bpb, x: rel / bpb, isDownbeat };
  }
  const timeOfBar = (i) => timeOfBeat(down + i * bpb);
  const nearestBeat = (t) => timeOfBeat(Math.round(beatAt(t).x));
  const inQuiet = (t) => quiet.some(([a, b]) => t >= a && t < b);

  // ------------------------------------------------------------------ accents: where hits land
  // The profile decides how dense the cause -> effect hits are (references/visual-language.md §4):
  //   pulse   every kick and snare
  //   groove  snares + bar downbeats (kick on the one when there is one)
  //   ambient bar downbeats only, skipping quiet spans
  const accents = (() => {
    const downs = [];
    for (let i = down; i < B; i += bpb) downs.push(beats[i]);
    const snapKick = (t) => {
      const k = lastIndex(kicks, t + 0.07);
      return k >= 0 && Math.abs(kicks[k] - t) < 0.07 ? kicks[k] : t;
    };
    let list;
    if (profile === "pulse") list = [...kicks, ...snares];
    else if (profile === "ambient") list = downs.map(snapKick);
    else list = [...snares, ...downs.map(snapKick)];
    list = list.filter((t) => !inQuiet(t)).sort((a, b) => a - b);
    const out = [];
    for (const t of list) if (!out.length || t - out.at(-1) > 0.09) out.push(t);
    return out;
  })();

  const arrOf = (kind) => (kind === "kick" ? kicks : kind === "snare" ? snares : kind === "accent" ? accents : hats);
  /** Decaying pulse from the latest onset of a kind (kick / snare / hat / accent). */
  function hit(kind, t, hl = 0.12) {
    const a = since(arrOf(kind), t);
    return a === Infinity ? 0 : Math.pow(0.5, a / hl);
  }
  /** Times of a kind inside [t0, t] (the hits that have happened so far in a chapter). */
  function eventsIn(kind, t0, t) {
    const a = arrOf(kind);
    const out = [];
    for (let i = Math.max(0, lastIndex(a, t0 - 1e-6) + 1); i < a.length && a[i] <= t; i++) out.push(a[i]);
    return out;
  }

  function vocal(t) {
    if (!vox) return 0;
    const x = Math.min(vox.length - 1.001, Math.max(0, t * 60));
    const i = Math.floor(x);
    return vox[i] + (vox[i + 1] - vox[i]) * (x - i);
  }

  return {
    band,
    level,
    energy,
    kicks,
    snares,
    hats,
    accents,
    quiet,
    inQuiet,
    kickAges,
    since,
    hit,
    eventsIn,
    vocal,
    sinceKick: (t) => since(kicks, t),
    sinceSnare: (t) => since(snares, t),
    sinceAccent: (t) => since(accents, t),
    count: (kind, t) => lastIndex(arrOf(kind), t) + 1,
    kickCount: (t) => lastIndex(kicks, t) + 1,
    beats,
    beatAt,
    timeOfBeat,
    nearestBeat,
    barAt,
    timeOfBar,
    beatsPerBar: bpb,
    profile,
    mode: grid.mode || "constant",
    period,
    offset: grid.offset,
    duration,
  };
}
