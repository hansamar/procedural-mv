"""Run the whole analysis in order, skipping steps whose output already exists.

    python analysis/run_all.py [--lang xx] [--instrumental] [--force] [--start s]
                               [--bpm n] [--mode auto|constant|variable] [--meter 3|4|6] [--downbeat i] [--profile p]

Steps (output -> skipped when present, unless --force):
  1 audio_features.py      data/audio_features.json
  2 demucs htdemucs        analysis/work/htdemucs/song/vocals.wav      (not with --instrumental)
  3 beat_grid.py           data/beat_grid.json, data/chapters.json      (always rerun: cheap, takes the grid flags)
  4 vocal_onsets.py        data/vocal_onsets.json
  5 whisper_words.py       analysis/work/whisper_words.json            (needs openai-whisper; optional with an LRC)
  6 no data/song.lrc  -> draft_lrc.py writes data/song.lrc.draft and the run STOPS: correct the text by hand
                         against the official lyrics, save as data/song.lrc, run this again.
    with data/song.lrc -> align_lyrics.py, align_words.py --report
Ends with a JSON summary. Exit code 0 = everything the film needs is in data/.
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "analysis"
D = ROOT / "data"
argv = sys.argv[1:]
FORCE = "--force" in argv
INSTR = "--instrumental" in argv


def flag(name):
    return [name, argv[argv.index(name) + 1]] if name in argv else []


def have(mod):
    return importlib.util.find_spec(mod) is not None


def run(label, cmd, out=None, always=False):
    if out and out.exists() and not (FORCE or always):
        print(f"[skip] {label}: {out.relative_to(ROOT)} exists")
        return True
    print(f"[run ] {label}: {' '.join(str(c) for c in cmd)}", flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT)
    if r.returncode:
        print(f"[FAIL] {label} exited {r.returncode}")
        return False
    return True


def song_file():
    for ext in ("flac", "wav", "aiff", "m4a", "mp3", "ogg"):
        f = ROOT / "assets" / "audio" / f"song.{ext}"
        if f.exists():
            return f
    sys.exit("no assets/audio/song.<ext>: copy the original song there first (new_project.mjs --audio)")


need = ["numpy", "scipy", "librosa", "soundfile"] + ([] if INSTR else ["torch", "torchaudio", "demucs"])
missing = [m for m in need if not have(m)]
if missing:
    sys.exit(f"missing Python packages: {' '.join(missing)}  ->  {sys.executable} -m pip install {' '.join(missing)}")

py = sys.executable
song = song_file()
vocals = A / "work" / "htdemucs" / "song" / "vocals.wav"
lrc = D / "song.lrc"
ok = run("features", [py, A / "audio_features.py"], D / "audio_features.json")
if ok and not INSTR:
    # --two-stems: only vocals are used (analysis only, never in the film)
    ok = run("stems", [py, "-m", "demucs", "-n", "htdemucs", "--two-stems", "vocals", "-o", A / "work", song], vocals)
grid = sum((flag(f) for f in ("--bpm", "--mode", "--meter", "--downbeat", "--profile")), [])
ok = ok and run("beat grid", [py, A / "beat_grid.py", *grid], always=True)
stopped = None
if ok and not INSTR:
    ok = run("vocal onsets", [py, A / "vocal_onsets.py"], D / "vocal_onsets.json")
    whisper = A / "work" / "whisper_words.json"
    if ok and have("whisper"):
        ok = run("whisper", [py, A / "whisper_words.py", *flag("--lang")], whisper)
    elif not lrc.exists():
        ok = False
        print(f"[FAIL] no data/song.lrc and no openai-whisper: {py} -m pip install openai-whisper, or write the LRC by hand")
    if ok and not lrc.exists():
        ok = run("draft lrc", [py, A / "draft_lrc.py"], always=True)
        stopped = "edit data/song.lrc.draft against the official lyrics, save it as data/song.lrc, rerun run_all.py"
    elif ok:
        ok = run("align lines", [py, A / "align_lyrics.py", *flag("--start")], always=True)
        ok = ok and run("align words", [py, A / "align_words.py", *flag("--lang"), "--report"], always=True)

files = ["audio_features.json", "beat_grid.json", "chapters.json"] + ([] if INSTR else ["vocal_onsets.json", "lyrics_timed.json", "words_timed.json"])
present = {f: (D / f).exists() for f in files}
summary = {"ok": ok and not stopped and all(present.values()), "next": stopped, "files": present}
if (D / "beat_grid.json").exists():
    g = json.loads((D / "beat_grid.json").read_text(encoding="utf-8"))
    summary["grid"] = {k: g.get(k) for k in ("mode", "bpm", "beats_per_bar", "profile", "quality")}
print(json.dumps(summary, ensure_ascii=False, indent=2))
sys.exit(0 if summary["ok"] else 1)
