import { chapterAt } from "../timeline/chapters.js";
import { SCENES } from "../scenes/index.js";
import { createPost, POST_DEFAULTS } from "./post.js";
import { frameIdx } from "./util.js";
import { screenCanvas, RENDER_W, RENDER_H, RENDER_SCALE } from "./render-size.js";
import { FORMAT } from "../scenes/style.js";

// logical canvas (style.js FORMAT); export renders the same layout at RENDER_SCALE
export const W = FORMAT.w;
export const H = FORMAT.h;

function makeCanvas() {
  return screenCanvas();
}

/**
 * A frame is draw(t): the chapter scene paints a 2D plate and returns post settings.
 * An afterimage is the same scene rendered at an earlier instant, so seeking stays exact.
 */
// scene: optional fn(ctx) drawn on every chapter instead of SCENES (?look= previews, main.js)
export function createRenderer({ canvas, signals, lyrics, chapters, images, plates, showLyrics = true, scene: only = null }) {
  const plate = makeCanvas();
  const g = plate.getContext("2d");
  const afterPlate = makeCanvas();
  const ga = afterPlate.getContext("2d");
  canvas.width = RENDER_W;
  canvas.height = RENDER_H;
  const post = createPost(canvas, RENDER_W, RENDER_H, RENDER_SCALE);
  let afterKey = null;

  function paint(target, t, nested) {
    const { chapter, index, p, local } = chapterAt(chapters, t);
    const ctx = {
      g: target,
      t,
      W,
      H,
      sig: signals,
      ly: lyrics,
      chapter,
      chapters,
      index,
      p,
      local,
      img: images,
      plates,
      lyricsOn: showLyrics,
      nested,
    };
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    target.filter = "none";
    target.fillStyle = "#070708";
    target.fillRect(0, 0, W, H);
    const scene = only ?? SCENES[chapter.id];
    const out = (scene && scene(ctx)) || {};
    // per-chapter grade switch (e.g. one chapter allowed to drown in the accent colour)
    out.hot = out.hot ?? 0;
    return out;
  }

  function draw(t) {
    const out = paint(g, t, false);
    const s = { ...POST_DEFAULTS, ...out };
    if (s.after && s.afterAmt > 0.001) {
      const key = s.after.toFixed(4);
      if (key !== afterKey) {
        paint(ga, s.after, true);
        post.setAfter(afterPlate);
        afterKey = key;
      }
    } else s.afterAmt = 0;
    post.render(plate, s, frameIdx(t));
  }

  return { draw, plate };
}
