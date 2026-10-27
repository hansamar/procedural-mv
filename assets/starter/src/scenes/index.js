import { edge } from "./kit.js";
import { hud } from "./hud.js";
import * as demo from "./demo.js";
// Starting looks (references/styles.md): demo.js flat poster · demo-soft.js soft light ·
// demo-ink.js paper and ink · demo-visualizer.js abstract visualizer. To preview one on this song
// without editing RAW: node scripts/shots.mjs exports/look 12 31 --look soft (or open /?look=soft).
// To use one: import * as soft from "./demo-soft.js"; then point RAW entries at pick(soft, "demoSoft").
// one file per chapter (or per family of repeats). Import as namespaces so a file that does not
// export its scene yet shows a placeholder instead of breaking the whole module graph.

const todo = (ctx) => {
  edge(ctx.g, ctx.chapter.id, 72, ctx.H - 68, { size: 15, alpha: 0.5 });
  return {};
};
const pick = (m, name, old = todo) => (ctx) => (typeof m[name] === "function" ? m[name](ctx) : old(ctx));

// chapter id (src/timeline/chapters.js) -> scene fn(ctx) => post settings
export const RAW = {
  intro: pick(demo, "demo"),
  "verse-1": pick(demo, "demo"),
  "hook-1": pick(demo, "demo"),
  outro: pick(demo, "demo"),
};

// Every chapter gets the global HUD on top (not in afterimage renders).
export const SCENES = Object.fromEntries(
  Object.entries(RAW).map(([id, fn]) => [
    id,
    (ctx) => {
      const out = fn(ctx) || {};
      hud(ctx, out);
      return out;
    },
  ]),
);
