// Find an ffmpeg binary: FFMPEG_PATH env -> `ffmpeg` on PATH -> the one bundled with the Python
// package imageio-ffmpeg (pip install imageio-ffmpeg). PYTHON env picks the interpreter to ask.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const works = (p) => spawnSync(p, ['-hide_banner', '-version'], { encoding: 'utf8' }).status === 0;

export function findFfmpeg() {
  const env = process.env.FFMPEG_PATH;
  if (env) {
    if (!fs.existsSync(env) && !works(env)) throw new Error(`FFMPEG_PATH=${env} does not exist`);
    return env;
  }
  if (works('ffmpeg')) return 'ffmpeg';
  const pys = [process.env.PYTHON, 'python', 'python3', 'py'].filter(Boolean);
  for (const py of pys) {
    const r = spawnSync(py, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
    const p = r.status === 0 ? r.stdout.trim() : '';
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('ffmpeg not found: install ffmpeg, or `pip install imageio-ffmpeg`, or set FFMPEG_PATH (and PYTHON for a non-PATH python)');
}
