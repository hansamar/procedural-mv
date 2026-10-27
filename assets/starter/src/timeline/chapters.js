import { lastIndex } from "../engine/util.js";

// EDIT THIS TABLE PER SONG. One row per chapter, in time order: [chapter id, where it starts].
// "Where" is one of
//   null                    the first chapter, starts at 0
//   "lyric substring", nth  the nth line (0-based) whose text contains the substring;
//                           cut = the beat nearest that line's LRC time (repeats of a hook: nth 0, 1, 2 ...)
//   { bar: n }              bar n of the beat grid (0 = first full bar) -> instrumentals, intros, solos
//   { t: s }                s seconds, snapped to the nearest beat ({ t: s, snap: false } keeps it exact)
// Every cut lands on the beat grid unless snap is false, so cuts always sit on the music.
const CUTS = [
  ["intro", null],
  ["verse-1", "FIRST VERSE LINE", 0],
  ["hook-1", "HOOK LINE", 0],
  ["outro", "HOOK LINE", 1],
];

export function buildChapters(ly, sig, duration) {
  const cut = (where, nth = 0) => {
    if (where === null) return 0;
    if (typeof where === "object" && "bar" in where) return sig.timeOfBar(where.bar);
    if (typeof where === "object" && "t" in where) return where.snap === false ? where.t : sig.nearestBeat(where.t);
    if (!ly.lines.length) throw new Error(`chapters.js: no lyrics loaded, use { bar } or { t } cuts ("${where}")`);
    const hits = ly.lines.filter((l) => l.text.includes(where));
    if (!hits[nth]) throw new Error(`chapters.js CUTS: lyric "${where}" #${nth} not found (${hits.length} lines contain it; text must match data/lyrics_timed.json exactly, case included)`);
    return sig.nearestBeat(hits[nth].t0);
  };
  const edges = CUTS.map(([id, where, nth]) => [id, Math.max(0, cut(where, nth))]);
  edges.forEach(([id, t], i) => {
    if (i && t <= edges[i - 1][1]) throw new Error(`chapters.js: "${id}" (${t.toFixed(2)} s) does not start after "${edges[i - 1][0]}"`);
  });
  return edges.map(([id, t0], i) => ({ id, t0, t1: edges[i + 1]?.[1] ?? duration }));
}

export function chapterAt(chapters, t) {
  const index = Math.max(0, lastIndex(chapters, t, (c) => c.t0));
  const chapter = chapters[index];
  const span = chapter.t1 - chapter.t0;
  const local = t - chapter.t0;
  const p = span > 0 ? Math.min(1, Math.max(0, local / span)) : 0;
  return { chapter, index, p, local };
}
