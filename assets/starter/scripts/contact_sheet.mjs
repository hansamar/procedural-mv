// Tile rendered frames (e.g. the output of scripts/shots.mjs or scripts/check.mjs) into one contact sheet.
// usage: node contact_sheet.mjs <frames-dir> <out.jpg> [--cols 8] [--width 384]
// Frames are taken in file-name order (shots.mjs zero-pads times, so that is time order).
// ffmpeg: FFMPEG_PATH env, else ffmpeg on PATH, else imageio-ffmpeg (scripts/ffmpeg-path.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { findFfmpeg } from "./ffmpeg-path.mjs";

const [dir, out, ...rest] = process.argv.slice(2);
if (!dir || !out) {
  console.error("usage: node contact_sheet.mjs <frames-dir> <out.jpg> [--cols 8] [--width 384]");
  process.exit(2);
}
const opt = (k, d) => {
  const i = rest.indexOf(k);
  return i >= 0 ? Number(rest[i + 1]) : d;
};
const cols = opt("--cols", 8);
const width = opt("--width", 384);
const frames = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f) && !f.startsWith("s_")).sort();
if (!frames.length) throw new Error(`no frames in ${dir}`);
const rows = Math.ceil(frames.length / cols);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
frames.forEach((f, i) => fs.copyFileSync(path.join(dir, f), path.join(tmp, `s_${String(i).padStart(4, "0")}${path.extname(f)}`)));
const ext = path.extname(frames[0]);
const ff = findFfmpeg();
const r = spawnSync(ff, ["-y", "-loglevel", "error", "-i", path.join(tmp, `s_%04d${ext}`), "-vf", `scale=${width}:-1,tile=${cols}x${rows}`, "-frames:v", "1", out], { stdio: "inherit" });
fs.rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(JSON.stringify({ out, frames: frames.length, grid: `${cols}x${rows}` }));
