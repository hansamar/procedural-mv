# Song analysis (offline, Python)

Contents: setup · run_all · no LRC · instrumentals · individual scripts · reading the summary · failures · schemas

## Setup

Use any Python 3.10+ that has the packages below. Find it once (`python --version`, `py -3`, a conda env) and use that interpreter for every command; below it is written `python`.

| Package | Needed for | Required |
|---|---|---|
| numpy scipy librosa soundfile | features, beat grid | always |
| torch torchaudio demucs | stems, vocal onsets, word alignment | sung songs |
| openai-whisper | timing cross-check; the draft LRC when there is none | strongly recommended; required with no LRC |
| pypinyin (zh), pykakasi (ja), unidecode (other scripts) | romanizing lyrics for the word aligner | optional; better word times |

`run_all.py` lists missing required packages with the exact `pip install` line. A GPU speeds up Demucs and Whisper; the CPU works, just slowly (Whisper large-v3 on CPU: roughly the song length × 5–10).

Input: the original song at `assets/audio/song.<ext>` (FLAC/WAV best; `new_project.mjs --audio` puts it there) and, for sung songs, `data/song.lrc`.

## run_all (use this)

```bash
python analysis/run_all.py                    # sung song with data/song.lrc
python analysis/run_all.py --lang zh          # set the language for Whisper and the aligner (zh ja ko en es ...)
python analysis/run_all.py --instrumental     # no vocals: features + beat grid only
python analysis/run_all.py --force            # recompute everything (after replacing the audio)
```

Grid flags pass through to beat_grid: `--bpm N --mode auto|constant|variable --meter 3|4|6 --downbeat i --profile pulse|groove|ambient`; `--start s` passes to align_lyrics (ignore LRC lines before s).

Steps whose output exists are skipped, so rerunning is cheap. The beat grid and the lyric alignment always rerun. The run ends with a JSON summary:

```json
{ "ok": true, "next": null, "files": {"audio_features.json": true, "...": true},
  "grid": {"mode": "constant", "bpm": 126.0, "beats_per_bar": 4, "profile": "pulse", "quality": 0.85} }
```

Done when `"ok": true`. Copy `grid` into `docs/song.md`.

## No LRC

1. `python analysis/run_all.py --lang xx` stops after writing `data/song.lrc.draft` (Whisper lines with timestamps) and prints `next`.
2. Correct the text line by line against the official lyrics (booklet, label or streaming lyrics the user provides). Keep the timestamps; fix only obviously wrong ones; delete hallucinated lines in instrumental parts.
3. Save as `data/song.lrc` (UTF-8) and rerun `run_all.py`.

Only plain lyrics text: use the same path and paste the correct text over the draft lines. Never ship uncorrected Whisper text: it mishears sung words.

LRC rules the aligner understands: `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]`, several stamps on one line (repeats), `[offset:ms]`, an empty stamped line = the previous line ends there; credit lines are dropped.

## Instrumentals

`--instrumental` skips stems, onsets and lyrics. `check.mjs` then WARNs "no lyrics", which is correct. CUTS use `{bar:n}` and `{t:s}`; the musical events (accents, `energy`, quiet spans) drive the scenes.

## Individual scripts (what run_all calls)

| Script | Output | Notes |
|---|---|---|
| `audio_features.py` | `data/audio_features.json` | 60 Hz envelopes, kicks/snares/hats, sections, quiet spans |
| `python -m demucs -n htdemucs --two-stems vocals -o analysis/work assets/audio/song.<ext>` | `analysis/work/htdemucs/song/vocals.wav` | analysis only, never in the film |
| `beat_grid.py [grid flags]` | `data/beat_grid.json`, `data/chapters.json` | constant or variable tempo, meter, downbeat, profile, quality |
| `vocal_onsets.py` | `data/vocal_onsets.json` | onsets + 60 Hz vocal RMS |
| `whisper_words.py [--lang xx]` | `analysis/work/whisper_words.json` | large-v3; timing evidence only |
| `draft_lrc.py [--gap 0.6] [--max 42]` | `data/song.lrc.draft` | only when there is no LRC |
| `align_lyrics.py [--start s]` | `data/lyrics_timed.json` | line starts snapped to vocal onsets, cross-checked with Whisper |
| `align_words.py [--lang xx] [--report]` | `data/words_timed.json` | MMS_FA forced alignment per word; `--report` lists weak lines |

The lyric text always comes from the LRC. Lines the aligner cannot place get `words: null`; the browser then spreads the words over the line's vocal onsets.

MMS_FA downloads its checkpoint on first use. If that host is unreachable, put the HF conversion (`MahmoudAshraf/mms-300m-1130-forced-aligner`, `model.safetensors`) at `analysis/work/mms_fa/model.safetensors`; the script loads it instead.

## Reading the summary

| Field | Meaning | Act when |
|---|---|---|
| `mode` | constant or variable tempo | variable on a song you know is steady: rerun with `--mode constant` |
| `bpm` | tempo (variable: median) | half or double of the felt tempo: rerun with `--bpm <felt>` |
| `beats_per_bar` | 4 or 3 (6 with `--meter 6`) | waltz or 6/8 detected as 4: `--meter 3` / `--meter 6` |
| `profile` | pulse, groove or ambient | the feel disagrees: `--profile <name>` (it sets accent density and the visual tables) |
| `quality` | 0..1, how well the grid explains the onsets | below 0.4: check cut frames by eye; try `--mode variable` |

Downbeat off by one or two beats (cuts land on beat 2): `--downbeat <beat index>` (index into `beats[]`, from beat_grid.json).

## Failures and fixes

| Symptom | Fix |
|---|---|
| `missing Python packages` | run the printed pip line with the same interpreter |
| Demucs/Whisper out of memory | close other GPU programs; or set `CUDA_VISIBLE_DEVICES=` to force CPU |
| `no data/song.lrc and no openai-whisper` | install openai-whisper, or write the LRC by hand |
| lyrics land on the wrong line in the film | LRC times wrong or `[offset]` set: fix the LRC, rerun; `--start` to skip a spoken intro |
| many `words: null` in the report | install the romanizer for the language, pass `--lang`; otherwise accept the onset fallback |
| `check.mjs` "duration" FAIL | the audio changed after analysis: `run_all.py --force` |

## Schemas

- `audio_features.json`: `source{file, sha256, samplerate, channels, subtype, duration_s}`, `grid_hz: 60`, `tempo_bpm`, `beats_s[]`, `downbeats_s[]`, `section_boundaries_s[]`, `kicks[{t,…}]`, `snares[{t}]`, `hats[{t}]`, `quiet_spans[{from,to}]`, `envelopes{rms, flux, centroid_hz, band_sub, band_low, band_lowmid, band_mid, band_high, band_air}` (60 Hz arrays), `time_axis{t0, dt, n}`.
- `beat_grid.json`: `{mode, offset, period, bpm, beats[], beats_per_bar, downbeat, profile, source, quality, tempo_range}`.
- `chapters.json`: `{note, grid (= beat_grid), duration_s}`. The chapter list itself is built in the browser from `CUTS`.
- `vocal_onsets.json`: onset times and a 60 Hz `rms` array.
- `lyrics_timed.json`: `{note, summary, lines:[{t, lrc, txt, end, src, conf, whisper_agree}]}`.
- `words_timed.json`: `{note, lines:[{i, txt, words:[{w, t, e, s}] | null}]}` (`s` = score).
- `whisper_words.json`: `{language, text, segments:[{s, e, text}], words:[{w, s, e}]}`.
