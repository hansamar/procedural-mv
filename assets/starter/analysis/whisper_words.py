"""Word-level transcription of the vocal stem (Whisper large-v3).

Used to cross-check LRC timing (align_lyrics.py) and, for songs without an LRC, to draft one (draft_lrc.py).
Output: analysis/work/whisper_words.json -> {language, text, segments:[{s,e,text}], words:[{w,s,e}]}
Run:  python analysis/whisper_words.py [--lang zh|ja|ko|en|es|...]   (default: auto-detect)
"""
import json
import sys
from pathlib import Path

import librosa
import torch
import whisper

ROOT = Path(__file__).resolve().parent.parent
VOCALS = ROOT / "analysis" / "work" / "htdemucs" / "song" / "vocals.wav"
OUT = ROOT / "analysis" / "work" / "whisper_words.json"
LANG = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else None


if __name__ == "__main__":
    audio, _ = librosa.load(str(VOCALS), sr=16000, mono=True)
    cuda = torch.cuda.is_available()
    model = whisper.load_model("large-v3", device="cuda" if cuda else "cpu")
    result = model.transcribe(
        audio,
        language=LANG,
        word_timestamps=True,
        condition_on_previous_text=False,
        temperature=0.0,
        beam_size=5,
        fp16=cuda,
    )
    words, segments = [], []
    for seg in result["segments"]:
        segments.append({"s": round(float(seg["start"]), 3), "e": round(float(seg["end"]), 3), "text": seg["text"].strip()})
        for w in seg.get("words", []):
            words.append({"w": w["word"].strip(), "s": round(float(w["start"]), 3), "e": round(float(w["end"]), 3)})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"language": result.get("language"), "text": result["text"], "segments": segments,
                               "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("language", result.get("language"), "segments", len(segments), "words", len(words))
