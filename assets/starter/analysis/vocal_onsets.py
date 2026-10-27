"""Vocal onsets from the Demucs vocal stem, used to snap word starts.

Writes data/vocal_onsets.json: onset times (s) and a 60 Hz vocal RMS envelope.
Run: python analysis/vocal_onsets.py
"""
import json
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "analysis" / "work" / "htdemucs" / "song" / "vocals.wav"
OUT = ROOT / "data" / "vocal_onsets.json"

if not SRC.exists():
    SRC = next((ROOT / "analysis" / "work" / "htdemucs").glob("*/vocals.wav"))

y, sr = librosa.load(SRC, sr=22050, mono=True)
hop = 256
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", backtrack=True, delta=0.06)

rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
grid = np.arange(0, times[-1], 1 / 60)
r60 = np.interp(grid, times, rms)
r60 = r60 / (np.percentile(r60, 97) + 1e-9)

OUT.write_text(json.dumps({
    "source": str(SRC.relative_to(ROOT)).replace("\\", "/"),
    "onsets": [round(float(t), 3) for t in on],
    "rms_dt": 1 / 60,
    "rms": [round(float(v), 3) for v in np.clip(r60, 0, 1.5)],
}))
print(len(on), "onsets", len(r60), "rms frames")
