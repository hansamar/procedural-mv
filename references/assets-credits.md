# Assets and credits

## Policy

- Allowed: code-drawn graphics; public-domain material (Wikimedia Commons PD, Library of Congress, national archives, museum open-access collections, NASA); CC0 and CC BY (with attribution); OFL fonts.
- Allowed after the user's approval: the artist's official material (MV frames or footage, teasers, concept photos, logos, album art), also traced or with a shot recreated (§Official material).
- Reference use needs no approval: study the official visuals and borrow concept, motifs, palette and style (visual-language.md §1, §3).
- Not allowed in the film: AI-generated images or video; stock with unclear licences; CC BY-SA or CC BY-NC unless the user accepts the terms in writing.
- The original song is used as is, only for this MV. Stems are analysis only and never enter the film.
- Material is optional: a film drawn entirely in code needs no SOURCES.json.

## Official material

The rights stay with their holders (label, agency, photographer); the user decides whether this film may use them (their own release, permission, or a private or fan edit), so each item is asked about, not assumed.

1. Files come from the user or from official sources the user points to (official site, press kit, the artist's channels). Originals go to `assets/material/archive/`, processed copies to `plates/`. Footage becomes a short frame sequence, never a `<video>` element (that would break the stateless contract): `ffmpeg -ss 72 -t 3 -i mv.mp4 -vf fps=24,scale=1280:-2 assets/material/plates/mv-car-%03d.jpg`, then list the frames as a `seq` in `plates.json`.
2. One SOURCES.json entry per item with `"official": true`: `rights` (holder), `source_url` (or `"provided by the user"`), `use` (as is | cropped | treated: ... | traced | recreated shot), `used_in` (chapters), `"approved": null`. A traced or recreated shot with no file gets `"file": null` and a `title`.
3. Before the export (at the user check, SKILL.md 5b; review frames and the live preview may already show it): one line per item (what, where and when, how treated, rights holder) with a frame where it appears; ask yes or no for each. Record the answer: `"approved": "<YYYY-MM-DD> <the user's words>"`. Take rejected items out of the film and out of SOURCES.json.
4. A later change of an approved item's use (another chapter, a heavier treatment, a different file) clears `approved`; ask again.
5. `check.mjs` WARNs (`official`) while items wait; `export.mjs` refuses to start while an official entry lacks `approved`.

## Licence check (Wikimedia Commons)

Query the metadata of every file before downloading:

```
https://commons.wikimedia.org/w/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url|extmetadata&format=json
```

Record `LicenseShortName`, `Artist`, `Credit`, `DateTimeOriginal` and `descriptionurl`. Reject the file if the licence is missing or not on the allowed list. For other archives, record the rights statement shown on the item page.

## Files

- Originals go to `assets/material/archive/` (one SOURCES.json entry each; `check.mjs` FAILs on unlisted files).
- Processed plates (cropped, resized, greyscale) may live in `assets/material/plates/`; `assets/material/plates.json` lists what the engine loads:

```json
{ "images": [{ "id": "street-01", "file": "plates/street-01.jpg" }], "seq": { "walk": ["walk-00", "walk-01"] } }
```

Scenes read `ctx.img[id]`; `seq` names frame sequences for `kit.js seq()`. Resize plates to what the layout needs (usually ≤ 1920 px on the long side) to keep loading fast.

## assets/material/SOURCES.json

```json
{ "files": [
  { "file": "archive/street-01.jpg", "title": "<title on the source page>", "author": "<author or Unknown>",
    "date": "<year>", "license": "Public domain", "source_url": "https://commons.wikimedia.org/wiki/File:...",
    "retrieved": "<YYYY-MM-DD>", "used_in": ["verse-2"], "processing": "greyscale, crop, posterized" },
  { "file": "archive/cover.jpg", "official": true, "title": "<album> cover", "rights": "© <year> <label>",
    "source_url": "provided by the user", "retrieved": "<YYYY-MM-DD>", "used_in": ["outro"],
    "use": "as is, last 6 s, slow push-in", "approved": "<YYYY-MM-DD> <the user's words>" } ] }
```

Checked: `license` and `source_url` for open material; `rights`, `source_url`, `use` and `used_in` for official material; every archive file has an entry; `approved` before export.

## credits.md

Write it in the user's language, with these parts:
- Music: song, artist, label; the original audio is unmodified.
- Material: table of file, title, author, date, licence, link (from SOURCES.json); official items with their rights holder and "used with the user's approval (<date>)".
- Fonts: every font used (bundled ones: `assets/fonts/README.md`), licence (OFL), source.
- Tools: librosa, Demucs, Whisper, torchaudio MMS_FA, Playwright, ffmpeg (licences per their repositories).
- Statements: no AI-generated images; official visuals: studied as reference only, or the approved items listed above; stems used only for analysis.
