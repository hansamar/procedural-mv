"""Per-word forced alignment of the lyrics on the Demucs vocal stem (torchaudio MMS_FA).

Input : data/lyrics_timed.json (line starts, good to ~0.1 s), analysis/work/htdemucs/song/vocals.wav,
        data/vocal_onsets.json
Output: data/words_timed.json  -> {note, lines:[{i, txt, words:[{w,t,e,s}] | null}]}

Word split (parts_of) is identical to partsOf in src/lyrics/words.js: words by whitespace, Han/kana per
character, stutter "Go-Gone" -> "Go-", "Gone".
Run:  python analysis/align_words.py [--report]
"""
import importlib
import json
import re
import sys
import unicodedata
from bisect import bisect_right
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
import torchaudio.functional as F

ROOT = Path(__file__).resolve().parents[1]
LYR = ROOT / "data" / "lyrics_timed.json"
VOC = ROOT / "analysis" / "work" / "htdemucs" / "song" / "vocals.wav"
ONS = ROOT / "data" / "vocal_onsets.json"
OUT = ROOT / "data" / "words_timed.json"

SR = 16000
ONSET_SNAP = 0.04         # refine word starts to a vocal onset within +-40 ms


# ----------------------------------------------------------------------------- word split (= words.js)
# One token = one sung hit. MUST behave exactly like partsOf() in src/lyrics/words.js:
#  - split on whitespace; space-separated scripts (Latin, Hangul, Cyrillic, ...) -> one token per word
#  - stutter "Go-Gone" -> "Go-", "Gone"
#  - Han / Hiragana / Katakana -> one token per character; small kana, the long mark and voicing marks attach
#    to the previous character; Latin/digit runs inside such a chunk stay one token
#  - punctuation attaches to the preceding token; leading punctuation is prefixed to the next token
SMALL_KANA = set("ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶーｧｨｩｪｫｬｭｮｯｰ゛゜ﾞﾟ")
CJK = [(0x3005, 0x3005), (0x3007, 0x3007), (0x303B, 0x303B), (0x3041, 0x3096), (0x3099, 0x309F),
       (0x30A1, 0x30FA), (0x30FC, 0x30FF), (0x31F0, 0x31FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF),
       (0xF900, 0xFAFF), (0xFF66, 0xFF9F), (0x20000, 0x2FA1F)]
WS = re.compile("[ \t\n\r\f\v\u00a0\u3000]+")


def char_kind(ch):
    c = ord(ch)
    if ch in SMALL_KANA or 0x31F0 <= c <= 0x31FF or c in (0x3099, 0x309A):
        return "A"
    if any(a <= c <= b for a, b in CJK):
        return "C"
    cat = unicodedata.category(ch)
    if cat[0] == "M":
        return "A"
    if cat[0] in "PSZC":
        return "P"
    return "O"


def parts_of(txt):
    out = []
    prefix = ""

    def push(s):
        nonlocal prefix
        out.append(prefix + s)
        prefix = ""

    def attach(s):
        nonlocal prefix
        if out:
            out[-1] += s
        else:
            prefix += s

    for w in [x for x in WS.split(txt) if x]:
        kinds = [char_kind(ch) for ch in w]
        if not any(k in "CO" for k in kinds):
            attach(w)
            continue
        if "C" not in kinds:
            m = re.match(r"^([^\W\d_]+)-(\1.*)$", w, re.I)
            if m:
                push(m.group(1) + "-")
                push(m.group(2))
            else:
                push(w)
            continue
        started, last = False, None
        for ch, k in zip(w, kinds):
            if k == "C" or (k == "A" and not out):
                push(ch)
                last, started = "C", True
            elif k == "A":
                attach(ch)
            elif k == "P":
                if started:
                    attach(ch)
                else:
                    prefix += ch
            elif last == "O":
                attach(ch)
            else:
                push(ch)
                last, started = "O", True
    if prefix:
        out.append(prefix)
    return out


# ----------------------------------------------------------------------------- romanizer
# MMS_FA only knows a-z and '. Every token is romanized: Hangul with the built-in Revised Romanization
# (+ liaison), Chinese with pypinyin, Japanese with pykakasi, everything else (accents, Cyrillic, Greek,
# Thai, ...) with unidecode. pypinyin / pykakasi / unidecode are optional: missing ones fall back to
# unidecode, then to accent stripping. --lang zh|ja|ko|en|... picks the reading of Han characters.
LANG = sys.argv[sys.argv.index("--lang") + 1].lower() if "--lang" in sys.argv else None


def _opt(name):
    try:
        return importlib.import_module(name)
    except ImportError:
        return None


_PINYIN, _KAKASI, _UNIDECODE = _opt("pypinyin"), _opt("pykakasi"), _opt("unidecode")
_KKS = _KAKASI.kakasi() if _KAKASI else None

CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi",
        "yu", "eu", "ui", "i"]
# final consonant: (romanization at syllable end, initial index it becomes before a vowel-initial syllable)
JONG = [("", None), ("k", 0), ("k", 1), ("k", 9), ("n", 2), ("n", 12), ("n", 18), ("t", 3), ("l", 5),
        ("k", 0), ("m", 6), ("l", 7), ("l", 9), ("l", 16), ("p", 17), ("l", 18), ("m", 6), ("p", 7),
        ("p", 9), ("t", 9), ("t", 10), ("ng", None), ("t", 12), ("t", 14), ("k", 15), ("t", 16), ("p", 17),
        ("t", 18)]
NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
       "8": "eight", "9": "nine"}


def _ascii(s):
    if _UNIDECODE:
        return _UNIDECODE.unidecode(s)
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _is_hangul(ch):
    return 0xAC00 <= ord(ch) <= 0xD7A3


def _is_kana(ch):
    c = ord(ch)
    return 0x3041 <= c <= 0x30FF or 0x31F0 <= c <= 0x31FF or 0xFF66 <= c <= 0xFF9F


def _cjk(run):
    has_kana = any(_is_kana(ch) for ch in run)
    if (has_kana or LANG == "ja") and _KKS:
        return "".join(x["hepburn"] for x in _KKS.convert(run))
    if not has_kana and LANG in (None, "zh", "yue") and _PINYIN:
        return "".join(_PINYIN.lazy_pinyin(run, style=_PINYIN.Style.NORMAL))
    return _ascii(run)


def romanize(word):
    res, run, mode = "", "", None

    def flush():
        nonlocal res, run
        if not run:
            return
        if mode == "H":
            res += romanize_hangul_safe(run)
        elif mode == "C":
            res += _cjk(run)
        else:
            res += _ascii("".join(NUM.get(c, c) for c in run))
        run = ""

    for ch in word:
        m = "H" if _is_hangul(ch) else "C" if (char_kind(ch) == "C" or _is_kana(ch)) else "O"
        if m != mode:
            flush()
            mode = m
        run += ch
    flush()
    r = re.sub(r"[^a-z']", "", res.lower()).strip("'")
    return r or "a"


def romanize_hangul_safe(word):
    # handle the ㄹㄹ marker (initial index -1) cleanly
    syl = []
    for ch in word:
        c = ord(ch)
        if 0xAC00 <= c <= 0xD7A3:
            c -= 0xAC00
            syl.append([c // 588, (c % 588) // 28, c % 28])
    res = ""
    for k, (cho, jung, jong) in enumerate(syl):
        nxt = syl[k + 1] if k + 1 < len(syl) else None
        res += (CHO[cho] if cho >= 0 else "l") + JUNG[jung]
        if not jong:
            continue
        rom, move = JONG[jong]
        if nxt is not None and nxt[0] == 11 and move is not None:
            if jong == 18:
                res += "p"                      # ㅄ + vowel -> p.s (없어 -> eopseo)
            nxt[0] = move                       # 찾아 -> cha-ja
        elif nxt is not None and jong in (4, 8) and nxt[0] == 5:
            res += "l"                          # ㄹㄹ / ㄴㄹ -> ll
            nxt[0] = -1
        else:
            res += rom
    return res


# ----------------------------------------------------------------------------- helpers
def last_index(arr, t):
    return bisect_right(arr, t) - 1


def old_estimate(line, onsets):
    """Replicates src/lyrics/words.js buildLyrics() word starts."""
    GAP, SNAP = 0.04, 0.16
    parts = parts_of(line["txt"])
    weights = [max(1.5, len(re.sub(r"[^\w]|_", "", p))) for p in parts]
    total = sum(weights)
    span = max(0.2, line["end"] - line["t"] - GAP)
    at = line["t"]
    ts = []
    for w in weights:
        ts.append(at)
        at += span * w / total
    for i in range(1, len(ts)):
        k = last_index(onsets, ts[i] + SNAP)
        cand = [onsets[j] for j in (k, k - 1) if 0 <= j < len(onsets) and abs(onsets[j] - ts[i]) <= SNAP]
        if not cand:
            continue
        best = min(cand, key=lambda o: abs(o - ts[i]))
        lo = ts[i - 1] + 0.06
        hi = (ts[i + 1] if i + 1 < len(ts) else line["end"]) - 0.06
        if lo < best < hi:
            ts[i] = best
    return ts


def load_vocals():
    x, sr = sf.read(str(VOC), dtype="float32", always_2d=True)
    x = torch.from_numpy(x.mean(axis=1))
    x = F.resample(x, sr, SR)
    return x


HF_WEIGHTS = ROOT / "analysis" / "work" / "mms_fa" / "model.safetensors"


def load_mms_fa(bundle):
    """torchaudio MMS_FA. if dl.fbaipublicfiles.com is unreachable, fall back to the identical checkpoint
    converted to HF format (huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner, model.safetensors,
    vocab = <blank>,<pad>,</s>,<unk>, then the same 27 chars) and map it onto torchaudio's Wav2Vec2Model."""
    try:
        return bundle.get_model(with_star=True)
    except Exception as exc:  # noqa: BLE001
        if not HF_WEIGHTS.exists():
            raise
        print(f"MMS_FA download failed ({type(exc).__name__}); using {HF_WEIGHTS.name}")
    from safetensors.torch import load_file
    from torchaudio.models import wav2vec2_model
    from torchaudio.pipelines._wav2vec2 import utils as pu

    hf = load_file(str(HF_WEIGHTS))
    sd = {}
    for k, v in hf.items():
        for a, b in (("wav2vec2.feature_extractor.", "feature_extractor."),
                     ("wav2vec2.feature_projection.", "encoder.feature_projection."),
                     ("wav2vec2.encoder.", "encoder.transformer."), ("lm_head.", "aux.")):
            if k.startswith(a):
                sd[b + k[len(a):]] = v
                break
    keep = [0] + list(range(4, sd["aux.weight"].shape[0]))      # drop pad, </s>, unk -> 28 outputs
    sd["aux.weight"], sd["aux.bias"] = sd["aux.weight"][keep], sd["aux.bias"][keep]
    pc = "encoder.transformer.pos_conv_embed.conv."
    if pc + "parametrizations.weight.original0" in sd:            # newer HF weight-norm naming
        sd[pc + "weight_g"] = sd.pop(pc + "parametrizations.weight.original0")
        sd[pc + "weight_v"] = sd.pop(pc + "parametrizations.weight.original1")
    model = wav2vec2_model(**bundle._params)
    model.load_state_dict(sd)
    return pu._extend_model(model, normalize_waveform=True, apply_log_softmax=True, append_star=True)


# ----------------------------------------------------------------------------- emissions (whole song, cached)
EMIS_DIR = ROOT / "analysis" / "work" / "mms_fa"
HOP = 320                     # samples per CTC frame at 16 kHz -> 20 ms
FPS = SR / HOP
# (core s, context s each side, phase s). wav2vec2 layer-norms its whole input and recognises sung text much better
# in short windows than over 30 s of music, but short windows are noisy, so several tilings vote (see consensus()).
VARIANTS = [(20, 5, 0), (10, 2, 0), (6, 1, 0), (4, 1, 0), (4, 1, 2), (2.5, 0.75, 0), (2.5, 0.75, 1.25),
            (1.5, 0.5, 0), (1.5, 0.5, 0.75)]


def song_emission(wav, core_s, ctx_s, phase_s=0.0, model=None):
    """Log-probs [T, 28] for the whole vocal stem: windows of core_s seconds plus ctx_s context on each side
    (tiling shifted by phase_s), centres stitched."""
    path = EMIS_DIR / f"emission_vocals_{core_s:g}_{ctx_s:g}{'' if not phase_s else f'_p{phase_s:g}'}.npy"
    if path.exists():
        em = np.load(path)
        if abs(em.shape[0] - wav.shape[0] / HOP) < 3:
            return em
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = model or load_mms_fa(torchaudio.pipelines.MMS_FA).to(dev).eval()
    dev = next(model.parameters()).device
    n_frames = wav.shape[0] // HOP
    out = np.zeros((n_frames, 28), np.float32)
    core, ctx, ph = int(core_s * FPS), int(ctx_s * FPS), int(phase_s * FPS)
    starts = [0] + list(range(ph if ph else core, n_frames, core))
    for f0, f1 in zip(starts, starts[1:] + [n_frames]):
        a, b = max(0, f0 - ctx), min(n_frames, f1 + ctx)
        seg = wav[a * HOP:b * HOP + 80]
        with torch.inference_mode():
            em, _ = model(seg.unsqueeze(0).to(dev))
        em = em[0, :, :28].float().cpu().numpy()      # drop torchaudio's zero-cost star column (penalised below)
        out[f0:f1] = em[f0 - a:f1 - a]
    EMIS_DIR.mkdir(parents=True, exist_ok=True)
    np.save(path, out)
    return out


# ----------------------------------------------------------------------------- constrained CTC Viterbi
STAR_LOGP = -2.0              # per-frame cost of the between-line wildcard (ad-libs, backing vocals, echoes)
NEG = -1e9


def viterbi(em, labels, lo, hi, star_logp=STAR_LOGP):
    """CTC Viterbi over the whole song.

    labels: token ids (>=1), or -1 for a wildcard <star> (placed between consecutive lines).
    lo/hi : per-token allowed frame range (hard window from the line prior).
    Returns per-token (first_frame, last_frame, mean_logp).
    """
    labels = np.asarray(labels)
    T, L = em.shape[0], len(labels)
    S = 2 * L + 1                                    # blank, tok0, blank, tok1, ..., blank
    lab = np.zeros(S, np.int64)
    lab[1::2] = np.where(labels < 0, 0, labels)
    is_star = np.zeros(S, bool)
    is_star[1::2] = labels < 0
    slo = np.zeros(S, np.int64)
    shi = np.full(S, T - 1, np.int64)
    slo[1::2], shi[1::2] = lo, hi
    for s in range(2, S - 1, 2):                     # blank between two tokens: union of their windows
        slo[s], shi[s] = slo[s - 1], shi[s + 1]
    skip = np.zeros(S, bool)                         # s-2 -> s allowed when labels differ (or star involved)
    skip[3::2] = (lab[3::2] != lab[1:-2:2]) | is_star[3::2] | is_star[1:-2:2]
    score = np.full(S, NEG)
    score[0] = em[0, 0]
    score[1] = star_logp if is_star[1] else em[0, lab[1]]
    back = np.zeros((T, S), np.int8)
    idx = np.arange(S)
    for t in range(1, T):
        e = np.where(is_star, star_logp, em[t, lab])
        e = np.where((t < slo) | (t > shi), NEG, e)
        c1 = np.concatenate(([NEG], score[:-1]))
        c2 = np.where(skip, np.concatenate(([NEG, NEG], score[:-2])), NEG)
        stack = np.stack([score, c1, c2])
        arg = stack.argmax(0)
        score = stack[arg, idx] + e
        back[t] = arg
    s = S - 1 if score[S - 1] >= score[S - 2] else S - 2
    path = np.empty(T, np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    res = [[None, None, []] for _ in range(L)]
    for t, s in enumerate(path):
        if s % 2:
            r = res[s // 2]
            r[0] = t if r[0] is None else r[0]
            r[1] = t
            r[2].append(star_logp if is_star[s] else em[t, lab[s]])
    return [(a, b, float(np.mean(p)) if p else NEG) for a, b, p in res]


# ----------------------------------------------------------------------------- main alignment
WIN_PRE, WIN_POST = 0.6, 0.35   # a line's characters may sit in [t - 0.6, next.t + 0.35] (pickups sit up to
                                # ~0.5 s before line.t, which is often snapped to the 2nd word)
AGREE = 0.06                    # a variant "agrees" on a word start if within 60 ms of the consensus
GRID = json.loads((ROOT / "data" / "beat_grid.json").read_text())
GRID_OFF, GRID_P = GRID["offset"], GRID["period"]       
DEBUG = "--debug" in sys.argv
QUORUM = 0.6                    # every word of a line needs >= 60 % agreeing variants, else the line is null


def snap_to_onsets(words, onsets):
    for k, w in enumerate(words):
        j = last_index(onsets, w["t"] + ONSET_SNAP)
        cand = [onsets[q] for q in (j, j - 1) if 0 <= q < len(onsets) and abs(onsets[q] - w["t"]) <= ONSET_SNAP]
        if cand:
            best = min(cand, key=lambda o: abs(o - w["t"]))
            lo = words[k - 1]["t"] + 0.03 if k else -1
            if lo < best < w["e"] - 0.03:
                w["t"] = best


def align_variant(em, lyr, star_logp=STAR_LOGP):
    """One constrained Viterbi over the whole song -> per line list of (t, e, logp) per word."""
    T = em.shape[0]
    D = torchaudio.pipelines.MMS_FA.get_dict(star=None)
    labels, lo, hi, owner = [], [], [], []           # owner = (line, word), None for stars
    for i, line in enumerate(lyr):
        nxt = lyr[i + 1]["t"] if i + 1 < len(lyr) else line["end"] + 1.0
        f_lo = max(0, int((line["t"] - WIN_PRE) * FPS))
        f_hi = min(T - 1, int((nxt + WIN_POST) * FPS))
        if i:
            labels.append(-1); lo.append(0); hi.append(T - 1); owner.append(None)
        for wi, p in enumerate(parts_of(line["txt"])):
            for c in romanize(p):
                labels.append(D[c]); lo.append(f_lo); hi.append(f_hi); owner.append((i, wi))
    spans = viterbi(em, labels, np.array(lo), np.array(hi), star_logp)
    by_word = {}
    for sp, o in zip(spans, owner):
        if o:
            by_word.setdefault(o, []).append(sp)
    out = []
    for i, line in enumerate(lyr):
        ws = []
        for wi in range(len(parts_of(line["txt"]))):
            sp = by_word[(i, wi)]
            ws.append((sp[0][0] / FPS, (sp[-1][1] + 1) / FPS, float(np.mean([x[2] for x in sp]))))
        out.append(ws)
    return out


def consensus(runs):
    """runs: [variant][word] -> (t, e, logp). Returns per word (t, e, s, share_agreeing)."""
    T = np.array([[w[0] for w in r] for r in runs])          # [V, W]
    E = np.array([[w[1] for w in r] for r in runs])
    P = np.array([[w[2] for w in r] for r in runs])
    res = []
    for k in range(T.shape[1]):
        med = np.median(T[:, k])
        ok = np.abs(T[:, k] - med) <= AGREE
        res.append((float(np.mean(T[ok, k])), float(np.median(E[ok, k])), float(np.exp(np.mean(P[ok, k]))),
                    float(ok.mean())))
    return res


def align(snap=True, write=True):
    lyr = json.loads(LYR.read_text(encoding="utf8"))["lines"]
    onsets = sorted(json.loads(ONS.read_text())["onsets"])
    wav = load_vocals()
    model = None
    runs = []
    for v in VARIANTS:
        path = EMIS_DIR / f"emission_vocals_{v[0]:g}_{v[1]:g}{'' if not v[2] else f'_p{v[2]:g}'}.npy"
        if model is None and not path.exists():
            model = load_mms_fa(torchaudio.pipelines.MMS_FA).to("cuda" if torch.cuda.is_available() else "cpu")
            model.eval()
        runs.append(align_variant(song_emission(wav, *v, model=model), lyr))

    # pass 1: consensus of the tilings + sanity checks
    rows = []
    for i, line in enumerate(lyr):
        parts = parts_of(line["txt"])
        nxt = lyr[i + 1]["t"] if i + 1 < len(lyr) else line["end"] + 1.0
        cons = consensus([r[i] for r in runs])
        words = [{"w": p, "t": t, "e": max(e, t + 0.02), "s": s, "agree": a, "r": romanize(p)}
                 for p, (t, e, s, a) in zip(parts, cons)]
        starts = [w["t"] for w in words]
        agree = min(w["agree"] for w in words)
        reason = None
        if agree < QUORUM:
            bad = [w["w"] for w in words if w["agree"] < QUORUM]
            reason = f"tilings disagree on {bad} (min agreement {agree:.0%})"
        elif any(b <= a for a, b in zip(starts, starts[1:])):
            reason = "non-monotonic"
        elif starts[0] < line["t"] - WIN_PRE or starts[-1] >= nxt:
            reason = f"out of range ({starts[0]:.2f}..{starts[-1]:.2f} vs {line['t']:.2f}..{nxt:.2f})"
        rows.append({"i": i, "txt": line["txt"], "words": words, "fail": reason, "src": "ctc"})

    # pass 2: repeated lyrics are sung with the same rhythm at the same place in the bar (checked: aligned repeats
    # agree to ~0.05 beat across the whole song). A failed line borrows the in-bar rhythm of its aligned repeats
    # when >= 2 repeats agree with each other, or 1 repeat agrees with this line's own low-agreement consensus.
    # (line.t itself is not a usable anchor: it sits on the 1st or the 2nd word depending on the repeat.)
    def beat(t):
        return (t - GRID_OFF) / GRID_P

    for row in rows:
        if not row["fail"]:
            continue
        i = row["i"]
        nxt = lyr[i + 1]["t"] if i + 1 < len(lyr) else lyr[i]["end"] + 1.0
        own = np.array([beat(w["t"]) for w in row["words"]])
        mates = [r for r in rows if r["txt"] == row["txt"] and not r["fail"] and r["src"] == "ctc"]
        if not mates:
            continue
        pats = []                      # in-bar pattern of each mate: first word's phase in the bar + offsets
        for r in mates:
            b = np.array([beat(w["t"]) for w in r["words"]])
            bar0 = 4 * np.floor(b[0] / 4)
            pats.append(b - bar0)
        best = None
        for k, pat in enumerate(pats):
            group = [q for q, p2 in enumerate(pats) if abs(p2[0] - pat[0]) < 0.3]
            tmpl = np.median([pats[q] for q in group], 0)
            spread = max((np.ptp([pats[q][j] for q in group]) for j in range(len(tmpl))), default=0)
            for bar0 in 4 * (np.floor(own[0] / 4) + np.array([-1, 0, 1])):
                place = bar0 + tmpl
                ts = place * GRID_P + GRID_OFF
                if ts[0] < lyr[i]["t"] - WIN_PRE or ts[-1] >= nxt:
                    continue
                conf = np.array([w["agree"] >= QUORUM for w in row["words"]])
                dev = np.abs(place - own)[conf].max() if conf.any() else 9.0   # confident words only
                cand = (np.median(np.abs(place - own)), dev, len(group), spread, ts, [mates[q]["i"] for q in group])
                if best is None or cand[0] < best[0]:
                    best = cand
        if best is None:
            continue
        med_dev, own_dev, n, spread, ts, used = best
        if DEBUG:
            print("tmpl", i, row["txt"], used, "spread %.2f own median/max dev %.2f/%.2f" % (spread, med_dev, own_dev))
        # the own consensus must at least put the line in the same bar position (median dev <= half a beat)
        if med_dev > 0.5 or not ((n >= 2 and spread <= 0.2) or own_dev <= 0.2):
            continue
        durs = np.median([[w["e"] - w["t"] for w in r["words"]] for r in mates if r["i"] in used], 0)
        # keep this line's own CTC time where the tilings agreed and it matches the template, else the template
        new = [w["t"] if (w["agree"] >= QUORUM and abs(beat(w["t"]) - beat(ts[k])) <= 0.2) else float(ts[k])
               for k, w in enumerate(row["words"])]
        if any(b <= a + 0.03 for a, b in zip(new, new[1:])):
            continue
        for k, w in enumerate(row["words"]):
            if new[k] != w["t"]:
                w["t"] = new[k]
                w["e"] = float(min(new[k] + durs[k], new[k + 1] if k + 1 < len(new) else 1e9))
                w["agree"] = 0.0     # marks a template-filled word
        row["src"] = "template from lines " + ",".join(map(str, used))
        row["was"] = row["fail"] + f"; own CTC vs template median {med_dev:.2f} / max {own_dev:.2f} beat"
        row["fail"] = None

    out_lines, fails = [], []
    for row in rows:
        words = row["words"]
        if row["fail"]:
            fails.append((row["i"], row["txt"], row["fail"]))
            out_lines.append({"i": row["i"], "txt": row["txt"], "words": None, "fail": row["fail"],
                              "raw_t": [round(w["t"], 3) for w in words]})
            continue
        if snap:
            snap_to_onsets(words, onsets)
        score = float(np.exp(np.mean([np.log(w["s"]) for w in words])))
        agree = min(w["agree"] for w in words)
        for w in words:
            w["t"], w["e"], w["s"], w["agree"] = round(w["t"], 3), round(w["e"], 3), round(w["s"], 3), round(w["agree"], 2)
        o = {"i": row["i"], "txt": row["txt"], "src": row["src"], "score": round(score, 3), "agree": round(agree, 2),
             "words": words}
        if "was" in row:
            o["ctc_fail"] = row["was"]
        out_lines.append(o)

    if write:
        note = ("Per-word times from MMS_FA (torchaudio's multilingual CTC forced-alignment model, 20 ms frames) on "
                "the Demucs vocal stem. For each of %d emission tilings (window sizes 2.5-30 s, two phases) one "
                "constrained CTC Viterbi runs over the whole song: each line's characters must lie in "
                "[line.t-%.2f, next.t+%.2f] s, a penalised wildcard between lines absorbs ad-libs. Per word the "
                "start is the mean of the tilings within %d ms of the median; agree = share of tilings that agree. "
                "Then each start is snapped to a vocal onset within +-40 ms (order kept). Korean romanized "
                "(Revised Romanization + liaison), digits spelled out; r = romanization used. t = word start; "
                "e = end of the last char's CTC frames (CTC is peaky, e runs early: use the next word's t for "
                "display); s = geometric-mean char prob (low on sung audio, not a failure signal by itself). "
                "words=null -> tilings disagree (<%d%% agree on some word), non-monotonic, or outside the line "
                "window: fall back to the character-weighted estimate. Note: many line starts in "
                "lyrics_timed.json sit on the 2nd word; pickup words can start about an 8th note "
                "before line.t. Word split == src/lyrics/words.js. Built by "
                "analysis/align_words.py." % (len(VARIANTS), WIN_PRE, WIN_POST, AGREE * 1000, QUORUM * 100))
        OUT.write_text(json.dumps({"note": note, "lines": out_lines}, ensure_ascii=False, indent=1), encoding="utf8")
    return lyr, onsets, wav, out_lines, fails


# ----------------------------------------------------------------------------- report
def report(lyr, onsets, wav, out_lines, fails):
    ok = [l for l in out_lines if l["words"]]
    ctc = [l for l in ok if l["src"] == "ctc"]
    print(f"aligned {len(ok)}/{len(out_lines)} lines ({len(ctc)} pure CTC, {len(ok) - len(ctc)} template-assisted), "
          f"fallback null {len(fails)}")
    for l in ok:
        if l["src"] != "ctc":
            print(f"  TEMPLATE {l['i']:3d} {l['txt']!r}: {l['src']}  [{l['ctc_fail']}]")
    for f in fails:
        print("  NULL", f)

    # repeat consistency: same lyric at the same bar position -> word phases in the bar should match
    from collections import defaultdict
    groups = defaultdict(list)
    for l in ctc:
        b = np.array([(w["t"] - GRID_OFF) / GRID_P for w in l["words"]])
        groups[(l["txt"], round((b[0] % 4) * 2) / 2)].append((l["i"], b - 4 * np.floor(b[0] / 4)))
    spreads, outl = [], []
    for (txt, _), v in groups.items():
        if len(v) < 2:
            continue
        P = np.array([p for _, p in v])
        med = np.median(P, 0)
        for (li, p) in v:
            d = np.abs(p - med)
            spreads += list(d * GRID_P)
            if d.max() > 0.2:
                outl.append((li, txt, round(float(d.max()), 2)))
    print(f"\nrepeat consistency (pure-CTC lines sung >= 2x at the same bar position, n={len(spreads)} words): "
          f"median |word - repeat median| = {1000 * np.median(spreads):.0f} ms, 90th pct {1000 * np.percentile(spreads, 90):.0f} ms")
    print("  words deviating > 0.2 beat from their repeats:", outl)

    # key lines = the most repeated lyric lines (hooks), where a timing error shows most
    from collections import Counter
    keys = [txt for txt, _ in Counter(l["txt"] for l in out_lines).most_common(7)]
    deltas = []
    worst = []
    print("\nkey lines: word  new_t  (old_t, delta)")
    for l in out_lines:
        if not any(k in l["txt"] for k in keys):
            continue
        old = old_estimate(lyr[l["i"]], onsets)
        if not l["words"]:
            print(f"{l['i']:3d} {l['txt']}: FALLBACK")
            continue
        cells = []
        for w, o in zip(l["words"], old):
            d = w["t"] - o
            deltas.append(abs(d))
            worst.append((abs(d), l["i"], w["w"], w["t"], round(o, 3)))
            cells.append(f"{w['w']} {w['t']:.3f}({d:+.2f})")
        print(f"{l['i']:3d} {'T' if l['src'] != 'ctc' else ' '} s={l['score']:.2f} | " + "  ".join(cells))
    print(f"\nkey-line words: n={len(deltas)} mean|new-old|={np.mean(deltas):.3f}s  median={np.median(deltas):.3f}s "
          f">0.10s: {sum(d > 0.1 for d in deltas)}")
    print("worst:", sorted(worst, reverse=True)[:8])

    # energy check: RMS (10 ms hop, 20 ms window) rise around each start, all aligned words
    x = wav.numpy()
    hop, win = 160, 320
    n = (len(x) - win) // hop
    rms = np.sqrt(np.array([np.mean(x[k * hop:k * hop + win] ** 2) for k in range(n)]) + 1e-10)
    db = 20 * np.log10(rms)

    def rise(t):
        k = int(t * 100)
        before = db[max(0, k - 6):k - 1].mean()
        after = db[k + 1:k + 6].mean()
        return after - before

    allr = [rise(w["t"]) for l in out_lines if l["words"] for w in l["words"]]
    print(f"\nRMS rise at all aligned word starts (dB, after 10-60ms minus before): mean {np.mean(allr):.1f}, "
          f"share >+1dB {np.mean(np.array(allr) > 1):.0%}")
    oldr = [rise(t) for l in out_lines if l["words"] for t in old_estimate(lyr[l["i"]], onsets)]
    print(f"same metric at old estimate starts: mean {np.mean(oldr):.1f}, share >+1dB {np.mean(np.array(oldr) > 1):.0%}")
    for li in (0, 13, 34, 109):
        l = out_lines[li]
        if not l["words"]:
            continue
        print(f"\nline {li} '{l['txt']}' (dB per 20 ms from -60 ms to +80 ms around start; '|' = start)")
        for w in l["words"]:
            k = int(w["t"] * 100)
            env = [db[k + d] for d in range(-6, 9, 2)]
            print(f"  {w['w']:>10s} {w['t']:8.3f}  " +
                  " ".join(("|" if d == 0 else " ") + f"{v:5.0f}" for d, v in zip(range(-6, 9, 2), env)))


if __name__ == "__main__":
    res = align()
    if "--report" in sys.argv:
        report(*res)
    else:
        print(f"wrote {OUT}; fallback lines: {res[4]}")
