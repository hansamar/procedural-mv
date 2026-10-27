"""Draft an LRC from Whisper when the song has none: data/song.lrc.draft.

Whisper mishears sung lyrics, so the draft is a starting point only: correct the text against the
official lyrics (booklet, label site), keep or fix the timestamps, then save it as data/song.lrc.
Lines are Whisper segments, re-split at word gaps >= --gap s (default 0.6) and at --max chars (default 42).
Run:  python analysis/whisper_words.py [--lang xx]  then  python analysis/draft_lrc.py [--gap 0.6] [--max 42]
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "analysis" / "work" / "whisper_words.json"
OUT = ROOT / "data" / "song.lrc.draft"
GAP = float(sys.argv[sys.argv.index("--gap") + 1]) if "--gap" in sys.argv else 0.6
MAX = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 42
# scripts written without spaces between words
NOSPACE = re.compile(r"[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]")


def stamp(t):
    m, s = divmod(max(0.0, t), 60)
    return f"[{int(m):02d}:{s:05.2f}]"


def join(ws):
    out = ""
    for w in ws:
        sep = "" if not out or (NOSPACE.search(out[-1]) and NOSPACE.search(w["w"][:1])) else " "
        out += sep + w["w"]
    return out.strip()


if __name__ == "__main__":
    d = json.loads(SRC.read_text(encoding="utf-8"))
    lines, cur = [], []
    for w in d["words"]:
        if not w["w"]:
            continue
        if cur and (w["s"] - cur[-1]["e"] >= GAP or len(join(cur + [w])) > MAX):
            lines.append(cur)
            cur = []
        cur.append(w)
    if cur:
        lines.append(cur)
    rows = [f"[re:draft from Whisper ({d.get('language')}); correct the text before use]"]
    for i, ws in enumerate(lines):
        rows.append(stamp(ws[0]["s"]) + join(ws))
        nxt = lines[i + 1][0]["s"] if i + 1 < len(lines) else None
        if nxt is None or nxt - ws[-1]["e"] > 2.0:
            rows.append(stamp(ws[-1]["e"] + 0.2))          # empty stamp = end of the line (instrumental gap)
    OUT.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"{len(lines)} lines -> {OUT.relative_to(ROOT)}")
