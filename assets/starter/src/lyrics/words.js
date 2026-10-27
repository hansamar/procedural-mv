import { lastIndex } from "../engine/util.js";

const GAP = 0.04;
const SNAP = 0.16;

// ---------------------------------------------------------------------------- word split
// One token = one sung hit. MUST behave exactly like parts_of() in analysis/align_words.py.
//  - Split on whitespace. Latin / Hangul / other space-separated scripts: one token per word.
//  - Stutter word sung as two hits: "Go-Gone" -> "Go-", "Gone" (left part repeats as the start of the right).
//  - Han / Hiragana / Katakana (no spaces between words): one token per character (= syllable). Small kana,
//    the long mark and voicing marks attach to the previous character; Latin/digit runs inside such a chunk
//    stay one token ("我说Hello世界" -> 我, 说, Hello, 世, 界).
//  - Punctuation / symbols attach to the preceding token; leading punctuation is prefixed to the next token.
const SMALL_KANA = new Set([..."ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶーｧｨｩｪｫｬｭｮｯｰ゛゜ﾞﾟ"]);

function inRanges(c, ranges) {
  for (let i = 0; i < ranges.length; i += 2) if (c >= ranges[i] && c <= ranges[i + 1]) return true;
  return false;
}
// Han (incl. 々 〇 〻), Hiragana, Katakana (incl. phonetic extensions), halfwidth Katakana
const CJK = [0x3005, 0x3005, 0x3007, 0x3007, 0x303b, 0x303b, 0x3041, 0x3096, 0x3099, 0x309f, 0x30a1, 0x30fa,
  0x30fc, 0x30ff, 0x31f0, 0x31ff, 0x3400, 0x4dbf, 0x4e00, 0x9fff, 0xf900, 0xfaff, 0xff66, 0xff9f, 0x20000, 0x2fa1f];

function charKind(ch) {
  const c = ch.codePointAt(0);
  if (SMALL_KANA.has(ch) || (c >= 0x31f0 && c <= 0x31ff) || c === 0x3099 || c === 0x309a) return "A"; // attach
  if (inRanges(c, CJK)) return "C"; // one syllable
  if (/^\p{M}$/u.test(ch)) return "A";
  if (/^[\p{P}\p{S}\p{Z}\p{C}]$/u.test(ch)) return "P"; // punctuation / symbol
  return "O"; // letters of space-separated scripts, digits
}

export function partsOf(txt) {
  const out = [];
  let prefix = ""; // leading punctuation waiting for the next token
  const push = (s) => { out.push(prefix + s); prefix = ""; };
  const attach = (s) => { if (out.length) out[out.length - 1] += s; else prefix += s; };
  for (const w of txt.split(/[ \t\n\r\f\v 　]+/).filter(Boolean)) {
    const kinds = [...w].map(charKind);
    if (!kinds.some((k) => k === "C" || k === "O")) { attach(w); continue; } // punctuation-only chunk
    if (!kinds.includes("C")) { // space-separated word (Latin, Hangul, ...)
      const m = /^(\p{L}+)-(\1.*)$/iu.exec(w);
      if (m) { push(m[1] + "-"); push(m[2]); } else push(w);
      continue;
    }
    let started = false; // a token was produced inside this chunk
    let last = null; // kind of the last token-forming char in this chunk
    [...w].forEach((ch, i) => {
      const k = kinds[i];
      if (k === "C" || (k === "A" && !out.length)) { push(ch); last = "C"; started = true; }
      else if (k === "A") attach(ch);
      else if (k === "P") { if (started) attach(ch); else prefix += ch; }
      else if (last === "O") attach(ch);
      else { push(ch); last = "O"; started = true; }
    });
  }
  if (prefix) out.push(prefix);
  return out;
}

/**
 * Forced-aligned word starts for line li (data/words_timed.json), or null. A line the aligner could
 * not settle borrows the word offsets of the first aligned line with the same text, placed on
 * its own line start (repeats are sung on the same grid position).
 */
function alignedStarts(aligned, lines, li, parts) {
  if (!aligned) return null;
  const ok = (a) => a && a.words && a.words.length === parts.length;
  const a = aligned[li];
  if (ok(a) && a.txt === lines[li].txt) return a.words.map((w) => w.t);
  const ti = aligned.findIndex((b, j) => j !== li && ok(b) && b.txt === lines[li].txt);
  if (ti < 0) return null;
  return aligned[ti].words.map((w) => lines[li].t + (w.t - lines[ti].t));
}

/**
 * Word timings. Where the forced alignment has the line, its word starts are used as they are.
 * Otherwise: character-weighted inside the line, then each start is pulled to the nearest vocal
 * onset (Demucs vocal stem) within +-0.16 s, keeping order.
 * line.t becomes the first sung word (pickup words start before the old line
 * time); line.t0 keeps the old line time, which the chapter cuts are built on.
 */
export function buildLyrics(lines, onsets = [], aligned = null) {
  const words = [];
  const out = lines.map((line, li) => {
    const parts = partsOf(line.txt);
    const starts = alignedStarts(aligned, lines, li, parts);
    if (starts) {
      const last = starts.at(-1);
      const end = Math.max(line.end, last + 0.25);
      const ws = parts.map((text, wi) => ({ text, t: starts[wi], end: wi + 1 < parts.length ? starts[wi + 1] : end, line: li, index: wi, count: parts.length }));
      words.push(...ws);
      return { ...line, t0: line.t, t: starts[0], end, index: li, text: line.txt, words: ws, aligned: true };
    }
    const weights = parts.map((w) => Math.max(1.5, w.replace(/[^\p{L}\p{N}]/gu, "").length));
    const total = weights.reduce((s, w) => s + w, 0);
    const span = Math.max(0.2, line.end - line.t - GAP);
    let at = line.t;
    const ws = parts.map((text, wi) => {
      const dur = (span * weights[wi]) / total;
      const w = { text, t: at, end: at + dur, line: li, index: wi, count: parts.length };
      at += dur;
      return w;
    });
    for (let i = 1; i < ws.length; i++) {
      const k = lastIndex(onsets, ws[i].t + SNAP);
      const cand = [onsets[k], onsets[k - 1]].filter((o) => o !== undefined && Math.abs(o - ws[i].t) <= SNAP);
      if (!cand.length) continue;
      const best = cand.reduce((a, b) => (Math.abs(a - ws[i].t) < Math.abs(b - ws[i].t) ? a : b));
      const lo = ws[i - 1].t + 0.06;
      const hi = (ws[i + 1]?.t ?? line.end) - 0.06;
      if (best > lo && best < hi) ws[i].t = best;
    }
    for (let i = 0; i < ws.length; i++) ws[i].end = i + 1 < ws.length ? ws[i + 1].t : line.end;
    words.push(...ws);
    return { ...line, t0: line.t, index: li, text: line.txt, words: ws, aligned: false };
  });

  // Aligned pickups now start earlier than the old line times, so an estimated line can end up
  // overlapping (or even starting after) the aligned line that follows it. Fit it in front.
  for (let i = 0; i < out.length; i++) {
    const l = out[i];
    const nx = out[i + 1];
    if (l.aligned || !nx || l.end <= nx.t - 0.05) continue;
    const lo = Math.max(i > 0 ? out[i - 1].words.at(-1).t + 0.08 : 0, Math.min(l.t, nx.t - 0.12 * l.words.length));
    const hi = nx.t - 0.05;
    const k = (hi - lo) / Math.max(0.05, l.end - l.t);
    const t0 = l.t;
    for (const w of l.words) {
      w.t = lo + (w.t - t0) * k;
      w.end = lo + (w.end - t0) * k;
    }
    l.t = lo;
    l.end = hi;
  }

  /** nth line whose text contains q (case-sensitive). */
  function line(q, nth = 0) {
    const hits = out.filter((l) => l.text.includes(q));
    if (!hits[nth]) throw new Error(`lyric not found: ${q} #${nth}`);
    return hits[nth];
  }
  /** nth word equal to q (or matching a regexp) inside [t0, t1). */
  function word(q, t0 = 0, t1 = Infinity, nth = 0) {
    const m = typeof q === "string" ? (w) => w.text === q : (w) => q.test(w.text);
    const hits = words.filter((w) => w.t >= t0 && w.t < t1 && m(w));
    return hits[nth] ?? null;
  }
  function wordsIn(t0, t1, q) {
    const m = q === undefined ? () => true : typeof q === "string" ? (w) => w.text === q : (w) => q.test(w.text);
    return words.filter((w) => w.t >= t0 && w.t < t1 && m(w));
  }
  /** Line being sung at t (null between lines). */
  function at(t) {
    const i = lastIndex(out, t, (l) => l.t);
    if (i < 0 || t >= out[i].end) return null;
    return out[i];
  }
  /** 0..1 progress of the voice through a word (never runs ahead). */
  function progress(w, t) {
    return Math.min(1, Math.max(0, (t - w.t) / Math.max(0.05, w.end - w.t)));
  }
  return { lines: out, words, line, word, wordsIn, at, progress };
}
