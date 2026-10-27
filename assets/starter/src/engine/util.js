// Pure helpers. Everything is a function of song time; no wall clock, no Math.random.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const mix3 = (A, B, k) => [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)];

export const ease = {
  linear: (x) => x,
  smooth: (x) => x * x * (3 - 2 * x),
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

/** Eased progress of x through [a, b]. */
export const prog = (x, a, b, fn = ease.linear) => fn(clamp((x - a) / Math.max(1e-6, b - a)));
/** Decaying hit from t0 with half-life hl. Zero before t0. */
export const pulse = (t, t0, hl = 0.12) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / hl));
/** Damped spring step response, 0 -> 1 with overshoot. */
export function springStep(t, freq = 4, damping = 0.35) {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damping * w * t) * Math.cos(w * Math.sqrt(1 - damping * damping) * t);
}
/** Damped ring that starts at 1 and settles at 0 (a twang). */
export const ring = (t, freq = 6, decay = 6) => (t < 0 ? 0 : Math.cos(TAU * freq * t) * Math.exp(-decay * t));

export const frameIdx = (t) => Math.round(t * 60);

export function hash(...ns) {
  let h = 2166136261 >>> 0;
  for (const n of ns) {
    const x = Math.imul(Math.floor(n * 65536) | 0, 0x9e3779b1);
    h = Math.imul(h ^ x, 0x85ebca6b) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed) * 2 - 1, hash(i + 1, seed) * 2 - 1, u);
}

/** Hold-then-ease keyframes: ks = [[t, value, easeIntoThisKey?], ...]. */
export function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, fn = ease.inOutCubic] = ks[i];
    if (t < t1) {
      const [t0, v0] = ks[i - 1];
      const k = fn(clamp((t - t0) / (t1 - t0)));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return ks[ks.length - 1][1];
}

/** Index of the last element of a sorted array that is <= t, or -1. */
export function lastIndex(arr, t, get = (x) => x) {
  let lo = 0;
  let hi = arr.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (get(arr[mid]) <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
