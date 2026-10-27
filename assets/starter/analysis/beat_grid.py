"""Fit the beat grid (constant or variable tempo), the meter and the song profile.

Input : data/audio_features.json (audio_features.py)
Output: data/beat_grid.json -> {mode, offset, period, bpm, beats:[t...], beats_per_bar, downbeat,
                               profile, source, quality, tempo_range}
        data/chapters.json  -> {note, grid (same object), duration_s}
        (the browser builds the chapter list itself in src/timeline/chapters.js)

beats[] is always written (also in constant mode), so the renderer uses one code path.
  mode     constant: one offset/period fitted to the kicks (or to onsets when the song has few kicks).
           variable: a dynamic-programming beat tracker that follows a smoothed local-tempo curve
           (tempo changes, rubato, live recordings). auto picks variable when the local tempo moves
           more than 4 % or the constant grid explains too few onsets.
  meter    beats_per_bar 4 or 3 from the low-band accent pattern (6/8 is tracked as 2 or 4 dotted beats:
           pass --meter 6 to count it as 6). downbeat = index into beats[] of the first bar line.
  profile  pulse (dense kicks, >= 95 BPM) | groove | ambient (few kicks, slow or rubato): how hard the
           visuals hit, see references/visual-language.md section 4.
Run:  python analysis/beat_grid.py [--bpm 120] [--mode auto|constant|variable] [--meter 3|4|6]
                                   [--downbeat <beat index>] [--profile pulse|groove|ambient]
"""
import json
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FEAT = json.loads((ROOT / "data" / "audio_features.json").read_text(encoding="utf-8"))
FPS = 1.0 / FEAT["time_axis"]["dt"]
DUR = float(FEAT["source"]["duration_s"])


def arg(name, cast=str, default=None):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


BPM0 = arg("--bpm", float, FEAT["tempo_bpm"])
MODE = arg("--mode", str, "auto")
METER = arg("--meter", int)
DOWNBEAT = arg("--downbeat", int)
PROFILE = arg("--profile", str)

env = FEAT["envelopes"]
flux = np.asarray(env["flux"], float)
flux = flux / (np.percentile(flux, 99) + 1e-9)
low = np.asarray(env["band_sub"], float) + 0.5 * np.asarray(env["band_low"], float)
mid = np.asarray(env["band_lowmid"], float) * 0.6 + np.asarray(env["band_mid"], float) * 0.8
kicks = np.array([k["t"] for k in FEAT["kicks"]], float)
quiet = [(q["from"], q["to"]) for q in FEAT["quiet_spans"]]
loud_s = DUR - sum(b - a for a, b in quiet)
onsets = librosa.onset.onset_detect(onset_envelope=flux, sr=int(FPS * 100), hop_length=100, units="time")


def at(arr, t):
    return arr[np.clip(np.round(np.asarray(t) * FPS).astype(int), 0, len(arr) - 1)]


# ----------------------------------------------------------------------------- constant fit
def phase_score(times, period):
    ang = 2 * np.pi * ((times / period) % 1.0)
    c, s = np.cos(ang).mean(), np.sin(ang).mean()
    return np.hypot(c, s), (np.arctan2(s, c) / (2 * np.pi)) % 1.0 * period


def fit_constant(times, bpm0):
    def search(base):
        best = (0, None, None)
        for bpm in np.linspace(base * 0.97, base * 1.03, 1201):
            r, off = phase_score(times, 60.0 / bpm)
            if r > best[0]:
                best = (r, 60.0 / bpm, off)
        return best

    # events on a slow grid fit double time just as well, so stay in librosa's octave unless the
    # double / half time fits clearly better (a bad estimate)
    best = search(bpm0)
    for base in (bpm0 * 2, bpm0 / 2):
        if 50 <= base <= 210:
            cand = search(base)
            if cand[0] > best[0] * 1.15:
                best = cand
    _, period, offset = best
    on = np.zeros(len(times), bool)
    for _ in range(3):                                # least squares on the onsets that sit on the grid
        idx = np.round((times - offset) / period)
        on = np.abs(times - (offset + idx * period)) < 0.1 * period
        if on.sum() < 4:
            break
        A = np.vstack([np.ones(on.sum()), idx[on]]).T
        offset, period = np.linalg.lstsq(A, times[on], rcond=None)[0]
    return float(offset % period), float(period), float(on.mean())


# ----------------------------------------------------------------------------- variable tracker
def tempo_curve(bpm_ref):
    """Smoothed local tempo per frame, folded into the octave of bpm_ref."""
    tc = librosa.feature.tempo(onset_envelope=flux, sr=int(FPS * 100), hop_length=100, aggregate=None,
                               start_bpm=bpm_ref, ac_size=6.0)
    tc = np.asarray(tc, float).reshape(-1)
    tc = np.where(tc > 0, tc, bpm_ref)
    for _ in range(3):
        tc = np.where(tc > bpm_ref * 1.42, tc / 2, tc)
        tc = np.where(tc < bpm_ref / 1.42, tc * 2, tc)
    w = int(8 * FPS) | 1                              # 8 s median: follows sections, not jitter
    pad = np.pad(tc, w // 2, mode="edge")
    idx = np.arange(0, len(tc), 15)
    tc = np.interp(np.arange(len(tc)), idx, [np.median(pad[i:i + w]) for i in idx])
    return tc


def track(curve_bpm, alpha=60.0):
    """Ellis-style DP beat tracker with a time-varying period (frames)."""
    strength = flux.copy()
    for k in kicks:                                   # kicks are the most reliable beat evidence
        i = int(round(k * FPS))
        if i < len(strength):
            strength[i] += 0.5
    strength = strength - strength.mean()
    n = len(strength)
    P = FPS * 60.0 / curve_bpm                        # period in frames per frame
    score = strength.copy()
    back = -np.ones(n, int)
    for t in range(n):
        p = P[t]
        lo, hi = int(t - 1.35 * p), int(t - 0.75 * p)
        if hi <= 0:
            continue
        lo = max(lo, 0)
        cand = np.arange(lo, hi + 1)
        pen = -alpha * np.log((t - cand) / p) ** 2
        j = int(np.argmax(score[cand] + pen))
        score[t] += score[cand[j]] + pen[j]
        back[t] = cand[j]
    # best end in the last period, then follow the back pointers
    tail = np.arange(max(0, n - int(P[-1] * 1.5)), n)
    t = int(tail[np.argmax(score[tail])])
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    beats = np.array(beats[::-1], float) / FPS
    # refine each beat to a kick within 60 ms (keeps order)
    for i, b in enumerate(beats):
        if len(kicks):
            k = kicks[np.argmin(np.abs(kicks - b))]
            if abs(k - b) < 0.06 and (i == 0 or k > beats[i - 1] + 0.1):
                beats[i] = k
    return beats


# ----------------------------------------------------------------------------- run
dense = len(kicks) >= 0.3 * loud_s / (60.0 / BPM0)   # enough kicks to carry the grid
src_times = kicks if dense else onsets
source = "kick" if dense else "onset"
offset, period, on_frac = fit_constant(src_times, BPM0)
bpm = 60.0 / period
curve = tempo_curve(bpm)
loud = np.ones(len(curve), bool)
for a, b in quiet:
    loud[int(a * FPS):int(b * FPS)] = False
lo_t, hi_t = np.percentile(curve[loud] if loud.any() else curve, [5, 95])
tempo_range = [round(float(lo_t), 1), round(float(hi_t), 1)]
moving = hi_t / lo_t > 1.04
mode = MODE if MODE in ("constant", "variable") else ("variable" if moving or on_frac < 0.45 else "constant")

if mode == "constant":
    n0 = int(np.floor(-offset / period))
    beats = offset + period * np.arange(n0 + 1, int((DUR - offset) / period) + 2)
    beats = beats[(beats >= 0) & (beats <= DUR)]
    quality = on_frac
else:
    beats = track(curve)
    period = float(np.median(np.diff(beats)))
    offset = float(beats[0])
    bpm = 60.0 / period
    near = np.array([np.min(np.abs(beats - t)) for t in src_times]) if len(src_times) else np.array([1.0])
    quality = float((near < 0.1 * period).mean())

# meter + downbeat from the accent pattern at the beats
acc = at(low, beats) - 0.5 * at(mid, beats)
sec = np.array(FEAT.get("section_boundaries_s", []), float)


def bar_score(n):
    best = (-1e9, 0)
    for ph in range(n):
        sel = np.arange(len(beats)) % n == ph
        if sel.sum() < 2 or (~sel).sum() < 2:
            continue
        c = (acc[sel].mean() - acc[~sel].mean()) / (acc.std() + 1e-9)
        if len(sec):                                  # sections tend to start on bar lines
            on_sec = np.isin(np.arange(len(beats)), [np.argmin(np.abs(beats - s)) for s in sec])
            c += 0.3 * (on_sec & sel).sum() / max(1, on_sec.sum())
        best = max(best, (c, ph))
    return best


s3, s4 = bar_score(3), bar_score(4)
bpb = METER or (3 if s3[0] > 1.3 * max(s4[0], 0.05) and s3[0] > 0.25 else 4)
downbeat = DOWNBEAT if DOWNBEAT is not None else bar_score(bpb if bpb in (3, 4) else 2)[1]

# profile
kd = len(kicks) / max(1.0, loud_s / period)          # kicks per beat while the song is playing
if PROFILE:
    profile = PROFILE
elif kd >= 0.55 and bpm >= 95:
    profile = "pulse"
elif kd < 0.2 or (bpm < 82 and kd < 0.45) or (mode == "variable" and quality < 0.4):
    profile = "ambient"
else:
    profile = "groove"

grid = {"mode": mode, "offset": round(float(offset), 5), "period": round(float(period), 6),
        "bpm": round(float(bpm), 3), "beats_per_bar": int(bpb), "downbeat": int(downbeat), "profile": profile,
        "source": source, "quality": round(float(quality), 3), "tempo_range": tempo_range,
        "kicks_per_beat": round(float(kd), 3), "beats": [round(float(b), 4) for b in beats]}
(ROOT / "data" / "beat_grid.json").write_text(json.dumps(grid), encoding="utf-8")
out = {"note": "Beat grid (seconds on the audio clock). Chapters are built in src/timeline/chapters.js.",
       "grid": grid, "duration_s": DUR}
(ROOT / "data" / "chapters.json").write_text(json.dumps(out), encoding="utf-8")
print(json.dumps({k: v for k, v in grid.items() if k != "beats"} | {"n_beats": len(beats),
                 "meter_scores": [round(s3[0], 3), round(s4[0], 3)]}))
