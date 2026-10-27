# Procedural MV

**English** | [简体中文](README.zh-CN.md)

A skill for **Claude Code** that turns your audio and lyrics into a music video with visuals drawn in code. Claude analyzes the song, proposes visual directions, builds scenes, shows previews, and exports the approved result using the bundled Canvas2D / WebGL workflow.

Suitable for lyric videos, kinetic typography, audio visualizers, instrumental pieces, and music videos across genres and languages. Each song gets its own visual concept. Scenes follow audio time, so the same timestamp produces the same frame.

## Features

- **Song analysis:** audio features, beat grids, musical sections, vocal onsets, and lyric alignment; draft LRC generation when timed lyrics are missing.
- **Four starting looks:** flat poster typography, soft light, paper and ink, and an audio visualizer. Scenes can be developed into other looks through code.
- **Multiple formats:** 16:9, 9:16, 1:1, 4:5, and custom even dimensions, with export up to 4K.
- **Multilingual type:** bundled Chinese, Korean, and Latin fonts, plus lyric layout helpers.
- **Preview and review:** a local preview with sound, frame captures, contact sheets, and automated checks.
- **Audio verification:** a lossless intermediate master checked against the source, followed by an AAC playback copy in the delivered MP4.

The complete instructions live in [SKILL.md](SKILL.md). The repository includes the engine, starter project, analysis scripts, fonts, and reference material used by the skill.

## Install for Claude Code

Choose a personal installation or a project installation. Keep the entire repository together: the supporting files are needed alongside `SKILL.md`.

### Personal installation

Available across your Claude Code projects.

**macOS / Linux**

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/hansamar/procedural-mv.git ~/.claude/skills/procedural-mv
```

**Windows PowerShell**

```powershell
New-Item -ItemType Directory -Force "$HOME/.claude/skills" | Out-Null
git clone https://github.com/hansamar/procedural-mv.git "$HOME/.claude/skills/procedural-mv"
```

### Project installation

Run from your project root:

```bash
git clone https://github.com/hansamar/procedural-mv.git .claude/skills/procedural-mv
```

The entry point should be `.claude/skills/procedural-mv/SKILL.md`. If installing from a ZIP, extract the complete repository to that folder without an extra nested directory.

Start Claude Code in the project where you want to create the video, then invoke `/procedural-mv`. These paths and invocation follow the [official Claude Code skills documentation](https://code.claude.com/docs/en/skills).

## Start with a prompt

Give Claude a local audio path, lyrics or an LRC file when available, your aspect ratio, and any visual direction. FLAC or WAV is recommended for audio verification. Quote paths containing spaces.

**A vertical lyric video**

```text
/procedural-mv
Use ./input/song.wav and timed lyrics at ./input/song.lrc.
Make a 9:16 lyric video with soft lighting and readable text.
Show me 2–3 visual directions and preview frames first.
Wait for my approval before exporting at 1080 × 1920.
```

**An instrumental visualizer**

```text
/procedural-mv
Use ./input/instrumental.flac to make a 16:9 audio visualizer.
Follow the musical sections and accents, with no lyrics.
Show a contact sheet and a preview before the final export.
```

**A song without timed lyrics**

```text
/procedural-mv
The audio is ./input/song.wav and the lyrics are in ./input/lyrics.txt.
The song is in Korean. Draft timings and flag uncertain words for review.
Propose a visual concept before building the video.
```

Claude handles project operations and scene code. You choose the visual direction, review uncertain lyrics, and approve the final render. With no LRC, speech recognition produces a draft that needs checking against the actual lyrics.

## Requirements

Use a local Claude Code environment that can run the tools below. Execution in Claude web chat or other hosted environments has not been verified for this repository.

| Component | Purpose |
| --- | --- |
| Git | Clone and update the skill; downloading a ZIP is an alternative |
| Node.js and npm | Project setup, preview, checks, and export |
| Playwright and Chromium | Browser rendering; installed in the generated project |
| Python 3.10+ | Audio analysis |
| FFmpeg | Video encoding, audio muxing, and audio verification |
| Python analysis packages | Selected for the input type and available lyrics |

Audio and beat analysis use `numpy`, `scipy`, `librosa`, and `soundfile`. Vocal separation and alignment use `torch`, `torchaudio`, and `demucs`. `openai-whisper` is required to draft timed lyrics when no LRC is supplied. See [analysis setup](references/analysis.md) for the full dependency table, language helpers, and troubleshooting. Some models download weights on first use. A GPU can accelerate analysis; CPU execution is supported.

FFmpeg is resolved through `FFMPEG_PATH`, the system PATH, or Python's `imageio-ffmpeg` package. The `PYTHON` environment variable selects the interpreter for that fallback.

## Workflow

1. **Intake:** provide audio, lyrics, format, and preferences; create a separate project.
2. **Analysis:** extract timing and musical features, align lyrics, and review draft text.
3. **Concept:** choose a visual direction and inspect representative frames.
4. **Scenes:** build the visual progression, typography, and transitions around the music.
5. **Review:** inspect frames, the contact sheet, and live preview; resolve failures and review warnings.
6. **Export:** approve rendering, then receive the MP4 and applicable material credits.

The default workflow waits for your concept choice and final export approval. See [SKILL.md](SKILL.md) for the full process and [visual guidance](references/visual-language.md) for review criteria.

## Manual project commands

Claude can run these commands for you. To run them yourself, start at the installed skill's root and replace the example paths. Choose an empty output directory outside the installed skill:

```bash
node scripts/new_project.mjs /path/to/my-mv --audio /path/to/song.wav --lrc /path/to/song.lrc --format 9:16
cd /path/to/my-mv
npm install
npx playwright install chromium
```

For Windows, use paths such as `C:/Videos/my-mv`. Omit `--lrc` if none is available. The scaffold copies the starter and inputs; scene design continues in the generated project.

Run the appropriate analysis command from that project:

```bash
# Sung audio: choose the song's language
python analysis/run_all.py --lang en

# Instrumental audio instead
python analysis/run_all.py --instrumental
```

After scene design and timing are ready:

```bash
# Preview with sound: http://localhost:5173
node scripts/serve.mjs

# Generate a report, frames, and a contact sheet
node scripts/check.mjs

# Export the approved video at the configured format size
node scripts/export.mjs --out exports/my-mv.mp4
```

For 9:16, `--width 1080` exports 1080 × 1920 and `--width 2160` exports 2160 × 3840. For 16:9, `--width 3840` exports 3840 × 2160. See [export and verification](references/export-verify.md) for clips, frame rate, encoders, and lossless masters.

## Outputs and audio integrity

The generated project retains editable scene code, analysis data, and exports. Checks produce `exports/check/report.json`, frames, and `exports/check/sheet.jpg`. The export command writes the MP4 at the path passed to `--out`.

For exports starting at zero with audio muxing enabled, the exporter compares the lossless ALAC intermediate with the source's decoded PCM using SHA-256. A successful proof reports `"audio_pcm_equal": true`. The default MP4 contains H.264 video and AAC 320k audio. AAC is lossy: the proof applies to the intermediate master. Use `--keep-master` to retain that master. Clips starting after zero skip this proof. See [verification details](references/export-verify.md).

## Repository guide

| Path | Contents |
| --- | --- |
| [SKILL.md](SKILL.md) | Instructions Claude follows |
| [scripts/new_project.mjs](scripts/new_project.mjs) | Project scaffolder |
| [assets/starter/](assets/starter/) | Scene engine, analysis, rendering scripts, and fonts |
| [references/styles.md](references/styles.md) | Modes, looks, genres, and formats |
| [references/engine.md](references/engine.md) | Scene APIs, layout, signals, and typography |
| [references/analysis.md](references/analysis.md) | Dependencies, analysis commands, and troubleshooting |
| [references/export-verify.md](references/export-verify.md) | Checks, exports, and audio proof |
| [references/assets-credits.md](references/assets-credits.md) | Material sources, permissions, and credits |

## Update and troubleshoot

For a personal installation with no local changes:

```bash
git -C ~/.claude/skills/procedural-mv pull --ff-only
```

In PowerShell, use `git -C "$HOME/.claude/skills/procedural-mv" pull --ff-only`. For a project installation, substitute `.claude/skills/procedural-mv`. Check local edits before updating.

- **Skill unavailable:** verify the installation directory and `SKILL.md` location, then invoke `/procedural-mv` in Claude Code. Avoid duplicate installations at both scopes.
- **Missing Python packages:** follow `run_all.py` diagnostics using the same interpreter. See [analysis troubleshooting](references/analysis.md).
- **Incorrect or mistimed lyrics:** correct `data/song.lrc` and rerun analysis; review recognition drafts before exporting.
- **FAIL or WARN results:** fix failures, inspect the named frames, and resolve or document warnings. See the [check report guide](references/export-verify.md).

## Materials and licenses

The skill uses code-drawn scenes and documented borrowed material. Its current instructions exclude AI-generated images and video. Artist photographs, cover art, and official footage require item-by-item user approval before export; that approval does not replace the rights holder's permission. Provide audio, lyrics, and materials you have permission to use, and record sources using the [material and credit guidance](references/assets-credits.md).

Bundled fonts include SIL Open Font License texts in the [font directory](assets/starter/assets/fonts/). No separate code license has been specified for this repository.
