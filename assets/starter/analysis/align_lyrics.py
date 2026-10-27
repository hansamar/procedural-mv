"""Snap LRC lyric starts to vocal-stem onsets, optionally cross-checked against Whisper word times.

Input : data/song.lrc (any LRC: [mm:ss], [mm:ss.xx], [mm:ss.xxx], several stamps per line, [offset:ms]),
        analysis/work/htdemucs/song/vocals.wav, analysis/work/whisper_words.json (optional)
Output: data/lyrics_timed.json -> {note, summary, lines:[{t, lrc, txt, end, src, conf, whisper_agree}]}
Lyric text always comes from the LRC (Whisper text is not used for display). An empty timestamped LRC
line marks the end of the previous line. Credit lines ("作词：…", "Composer: …") are dropped.
No LRC yet? Run whisper_words.py + draft_lrc.py, correct data/song.lrc.draft by hand, save as song.lrc.
Run:  python analysis/align_lyrics.py [--start 7.0]   (--start: ignore lines before this time)
"""
import json
import re
import sys
from pathlib import Path

import librosa
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
LRC = ROOT / "data" / "song.lrc"
VOCALS = ROOT / "analysis" / "work" / "htdemucs" / "song" / "vocals.wav"
WHISPER = ROOT / "analysis" / "work" / "whisper_words.json"
OUT = ROOT / "data" / "lyrics_timed.json"

SNAP_WINDOW = 0.8
WHISPER_AGREE = 0.2
MAX_LINE = 8.0            # a line never stays on screen longer than this past its start
HOP = 256
SR = 22050
LYRIC_START = float(sys.argv[sys.argv.index("--start") + 1]) if "--start" in sys.argv else 0.0

STAMP = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
CREDIT = re.compile(r"^\s*(作词|作曲|编曲|制作人|和声|混音|监制|词|曲|作詞|作曲|編曲|작사|작곡|편곡|lyrics?( by)?|lyricist|"
                    r"written by|composer|composed by|music( by)?|arrange[dr]?( by)?|producer|produced by)\s*[:：]", re.I)


def read_lrc():
    """[(t, txt)] sorted by time; txt == "" marks the end of the previous line."""
    text = LRC.read_text(encoding="utf-8-sig")
    m = re.search(r"\[offset:\s*([+-]?\d+)\]", text, re.I)
    offset = int(m.group(1)) / 1000.0 if m else 0.0      # LRC convention: positive = lyrics earlier
    rows = []
    for raw in text.splitlines():
        stamps = STAMP.findall(raw)
        if not stamps:
            continue
        txt = STAMP.sub("", raw).strip()
        if CREDIT.match(txt):
            continue
        for mm, ss in stamps:
            t = int(mm) * 60 + float(ss.replace(":", ".")) - offset
            if t >= LYRIC_START:
                rows.append((round(t, 3), txt))
    rows.sort(key=lambda r: r[0])
    return rows


def vocal_onsets():
    y, sr = librosa.load(str(VOCALS), sr=SR, mono=True)
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP, aggregate=np.median)
    return librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=HOP, units="time", backtrack=False)


if __name__ == "__main__":
    rows = read_lrc()
    onsets = vocal_onsets()
    whisper = json.loads(WHISPER.read_text(encoding="utf-8"))["words"] if WHISPER.exists() else []
    w_starts = np.array([w["s"] for w in whisper])

    result, ends = [], {}
    prev = -1.0
    for k, (lrc_t, txt) in enumerate(rows):
        if not txt:
            if result:
                ends[len(result) - 1] = lrc_t
            continue
        cand = onsets[np.abs(onsets - lrc_t) <= SNAP_WINDOW]
        if len(cand):
            t, src, conf = float(cand[np.argmin(np.abs(cand - lrc_t))]), "vocal-onset", "medium"
        else:
            t, src, conf = lrc_t, "lrc-only", "low"
        if t <= prev + 0.2:
            t = prev + 0.2
            src += "+ordered"
        near_w = w_starts[np.abs(w_starts - t) <= WHISPER_AGREE] if len(w_starts) else []
        if src.startswith("vocal-onset") and len(near_w):
            conf = "medium-high"
        result.append({"t": round(t, 3), "lrc": lrc_t, "txt": txt, "src": src, "conf": conf,
                       "whisper_agree": bool(len(near_w))})
        prev = t

    for i, row in enumerate(result):
        nxt = result[i + 1]["t"] - 0.05 if i + 1 < len(result) else row["t"] + 3.0
        row["end"] = round(max(row["t"] + 0.3, min(nxt, ends.get(i, nxt), row["t"] + MAX_LINE)), 3)

    shifts = [abs(r["t"] - r["lrc"]) for r in result]
    summary = {
        "count": len(result),
        "whisper": bool(whisper),
        "by_src": {k: sum(r["src"].startswith(k) for r in result) for k in ["vocal-onset", "lrc-only"]},
        "by_conf": {k: sum(r["conf"] == k for r in result) for k in ["medium-high", "medium", "low"]},
        "max_shift_s": round(max(shifts), 3) if shifts else 0,
        "mean_shift_s": round(float(np.mean(shifts)), 3) if shifts else 0,
    }
    note = (
        "t = seconds. Start snapped to nearest vocal-stem onset within 0.8 s of LRC time. "
        "medium-high = also agrees with a Whisper word start within 0.2 s (only when whisper_words.json exists). "
        "low = no vocal onset found, LRC time kept. end = next line, an empty LRC stamp, or t+8 s, whichever "
        "is first. Accuracy is approximately +/-0.2 s; align_words.py refines per word."
    )
    OUT.write_text(json.dumps({"note": note, "summary": summary, "lines": result}, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
