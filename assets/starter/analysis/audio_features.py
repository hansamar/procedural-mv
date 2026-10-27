"""Full-mix feature extraction for the MV timeline.

Writes data/audio_features.json. All times are seconds from the start of the
original file; the grid used by the renderer is 60 Hz.
"""
import hashlib
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy.signal import find_peaks

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "audio" / "song.flac"
OUT = ROOT / "data" / "audio_features.json"
GRID_HZ = 60
HOP_S = 1.0 / GRID_HZ

BANDS = {
    "sub": (20, 120),
    "low": (120, 250),
    "lowmid": (250, 800),
    "mid": (800, 3000),
    "high": (3000, 8000),
    "air": (8000, 16000),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def band_envelopes(S, freqs, frame_t, times_grid):
    power = np.abs(S) ** 2
    out = {}
    for name, (lo, hi) in BANDS.items():
        idx = (freqs >= lo) & (freqs < hi)
        e = np.sqrt(power[idx].mean(axis=0) + 1e-12)
        out[name] = np.interp(times_grid, frame_t, e)
    return out


def norm01(x):
    x = np.asarray(x, dtype=float)
    lo, hi = np.percentile(x, 2), np.percentile(x, 99.5)
    return np.clip((x - lo) / (hi - lo + 1e-9), 0, 1)


if __name__ == "__main__":
    info = sf.info(str(SRC))
    sr_native = info.samplerate
    y, sr = librosa.load(str(SRC), sr=None, mono=True)
    duration = len(y) / sr
    print(f"sr={sr} dur={duration:.3f} channels={info.channels} subtype={info.subtype}", file=sys.stderr)

    n_fft, hop = 4096, sr // 100
    S = librosa.stft(y, n_fft=n_fft, hop_length=hop)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    FRAME_T = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)
    grid = np.arange(0, duration, HOP_S)

    rms_full = np.interp(grid, FRAME_T, librosa.feature.rms(S=np.abs(S), frame_length=n_fft, hop_length=hop)[0])
    bands_raw = band_envelopes(S, freqs, FRAME_T, grid)

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    flux = np.interp(grid, FRAME_T, onset_env)
    centroid = np.interp(grid, FRAME_T, librosa.feature.spectral_centroid(S=np.abs(S), sr=sr)[0])

    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, units="frames", trim=False)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    tempo_val = float(np.atleast_1d(tempo)[0])

    bands_norm = {k: norm01(v) for k, v in bands_raw.items()}

    def pick(env, min_gap_s, height_pct):
        thr = np.percentile(env, height_pct)
        peaks, _ = find_peaks(env, height=thr, distance=max(1, int(min_gap_s / HOP_S)))
        return [{"t": round(float(grid[p]), 3), "s": round(float(env[p]), 3)} for p in peaks]

    kick_env = bands_norm["sub"] + 0.5 * bands_norm["low"]
    kicks = pick(kick_env, 0.20, 93)
    snare_env = bands_norm["lowmid"] * 0.6 + bands_norm["mid"] * 0.8 + bands_norm["high"] * 0.5
    snares = pick(snare_env, 0.20, 95)
    hats = pick(bands_norm["air"] + 0.5 * bands_norm["high"], 0.09, 93)

    beats_per_bar = 4
    beat_idx = np.arange(len(beat_times))
    phase_scores = []
    for ph in range(beats_per_bar):
        sel = beat_times[beat_idx % beats_per_bar == ph]
        vals = [bands_norm["sub"][min(len(grid) - 1, int(t / HOP_S))] for t in sel]
        phase_scores.append(float(np.mean(vals)) if vals else 0.0)
    downbeat_phase = int(np.argmax(phase_scores))
    downbeats = beat_times[beat_idx % beats_per_bar == downbeat_phase]

    # chroma from the STFT already in memory: cheap and stable across librosa versions
    # (chroma_cqt at this 10 ms hop exhausts memory on librosa 1.x)
    chroma = librosa.feature.chroma_stft(S=np.abs(S) ** 2, sr=sr, n_fft=n_fft, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=20)
    feat = np.vstack([librosa.util.normalize(chroma, axis=0), librosa.util.normalize(mfcc, axis=0)])
    section_frames = librosa.segment.agglomerative(feat, k=14)
    section_times = librosa.frames_to_time(section_frames, sr=sr, hop_length=hop)

    loud = bands_raw["sub"] + bands_raw["low"] + bands_raw["lowmid"] + bands_raw["mid"] + bands_raw["high"]
    loud_db = 20 * np.log10(loud / (np.max(loud) + 1e-12) + 1e-6)
    quiet = []
    run = None
    for i, v in enumerate(loud_db):
        if v < -28 and run is None:
            run = i
        elif v >= -28 and run is not None:
            if (i - run) * HOP_S >= 0.25:
                quiet.append({"from": round(float(grid[run]), 3), "to": round(float(grid[i]), 3)})
            run = None

    out = {
        "source": {
            "file": "assets/audio/song.flac",
            "sha256": sha256(SRC),
            "samplerate": int(sr_native),
            "channels": int(info.channels),
            "subtype": info.subtype,
            "duration_s": round(duration, 4),
        },
        "grid_hz": GRID_HZ,
        "tempo_bpm": round(tempo_val, 2),
        "beats_s": [round(float(t), 3) for t in beat_times],
        "downbeats_s": [round(float(t), 3) for t in downbeats],
        "downbeat_phase_scores": [round(s, 4) for s in phase_scores],
        "section_boundaries_s": [round(float(t), 3) for t in section_times],
        "kicks": kicks,
        "snares": snares,
        "hats": hats,
        "quiet_spans": quiet,
        "envelopes": {
            "rms": [round(float(v), 5) for v in np.asarray(rms_full)],
            "flux": [round(float(v), 4) for v in flux],
            "centroid_hz": [round(float(v), 1) for v in centroid],
            **{f"band_{k}": [round(float(v), 4) for v in bands_norm[k]] for k in BANDS},
        },
        "time_axis": {"t0": 0.0, "dt": HOP_S, "n": int(len(grid))},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"tempo={tempo_val:.2f} beats={len(beat_times)} downbeats={len(downbeats)} kicks={len(kicks)} snares={len(snares)} hats={len(hats)}")
    print("section boundaries:", [round(float(t), 2) for t in section_times])
    print("quiet spans:", quiet)
    print("phase scores:", [round(s, 3) for s in phase_scores])
