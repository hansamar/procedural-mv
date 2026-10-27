// Scaffold a new procedural MV project from the starter template.
// usage: node new_project.mjs <target-dir> [--audio <song.flac|wav>] [--lrc <song.lrc>] [--format 16:9|9:16|1:1|4:5|<w>x<h>]
// Copies assets/starter, then (optionally) copies the song to assets/audio/song.<ext> and the LRC to
// data/song.lrc, and sets FORMAT in src/scenes/style.js. Refuses to write into a non-empty
// directory. The original audio is copied byte-for-byte, never re-encoded.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const starter = path.join(here, "..", "assets", "starter");
const args = process.argv.slice(2);
const target = args[0];
const opt = (k) => {
  const i = args.indexOf(k);
  return i > 0 ? args[i + 1] : null;
};
if (!target) {
  console.error("usage: node new_project.mjs <target-dir> [--audio file] [--lrc file] [--format 16:9|9:16|1:1|4:5|<w>x<h>]");
  process.exit(2);
}
const PRESETS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const format = opt("--format");
let size = null;
if (format) {
  const m = /^(\d+)x(\d+)$/.exec(format);
  size = PRESETS[format] ?? (m ? [Number(m[1]), Number(m[2])] : null);
  if (!size || size.some((v) => v < 16 || v % 2)) {
    console.error(`--format ${format}: use 16:9, 9:16, 1:1, 4:5 or <w>x<h> with even sizes`);
    process.exit(2);
  }
}
if (fs.existsSync(target) && fs.readdirSync(target).length) {
  console.error(`refusing: ${target} is not empty`);
  process.exit(1);
}
fs.cpSync(starter, target, { recursive: true });
for (const d of ["assets/audio", "assets/material", "data", "exports"]) fs.mkdirSync(path.join(target, d), { recursive: true });
const audio = opt("--audio");
if (audio) {
  const ext = path.extname(audio).toLowerCase();
  fs.copyFileSync(audio, path.join(target, "assets", "audio", `song${ext}`));
  if (ext !== ".flac") {
    // index.html and audio_features.py name song.flac; point them at the real file (export.mjs finds song.*)
    for (const f of ["index.html", "analysis/audio_features.py"]) {
      const p = path.join(target, f);
      fs.writeFileSync(p, fs.readFileSync(p, "utf8").replaceAll("song.flac", `song${ext}`));
    }
  }
}
if (size) {
  const p = path.join(target, "src", "scenes", "style.js");
  const src = fs.readFileSync(p, "utf8");
  const out = src.replace(/export const FORMAT = \{[^}]*\};/, `export const FORMAT = { w: ${size[0]}, h: ${size[1]} };`);
  if (out === src) console.error("warning: FORMAT line not found in style.js; set it by hand");
  fs.writeFileSync(p, out);
}
const lrc = opt("--lrc");
if (lrc) fs.copyFileSync(lrc, path.join(target, "data", "song.lrc"));
fs.writeFileSync(path.join(target, "assets", "material", "plates.json"), JSON.stringify({ images: [], seq: {} }, null, 2));
console.log(JSON.stringify({ created: path.resolve(target), audio: !!audio, lrc: !!lrc, format: size ? `${size[0]}x${size[1]}` : "1920x1080" }));
