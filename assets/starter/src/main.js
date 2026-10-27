import { loadData } from "./data.js";
import { createSignals } from "./timeline/signals.js";
import { buildLyrics } from "./lyrics/words.js";
import { buildChapters } from "./timeline/chapters.js";
import { createRenderer } from "./engine/renderer.js";
import { FORMAT } from "./scenes/style.js";

const EXPORT = new URLSearchParams(location.search).has("export");
if (EXPORT) document.body.classList.add("export");

const canvas = document.getElementById("stage");
// the preview fits the film's aspect (style.js FORMAT) into the window
canvas.style.aspectRatio = `${FORMAT.w} / ${FORMAT.h}`;
canvas.style.width = `min(100vw, calc(100vh * ${FORMAT.w} / ${FORMAT.h}))`;
const audio = document.getElementById("track");
const playBtn = document.getElementById("play");
const scrub = document.getElementById("scrub");
const clockEl = document.getElementById("clock");
const statusEl = document.getElementById("status");

let renderer = null;
let chapters = [];
let signals = null;
let lyrics = null;
let duration = 0;
let dragging = false;
let lastT = NaN;

// A/V offset. While playing, the picture is drawn a little AHEAD of audio.currentTime: the frame
// drawn in this rAF reaches the screen one or two vsyncs later, and a picture that lags its sound
// reads as off-beat far sooner than one that leads it. Adjustable with [ and ] (10 ms steps) or
// ?av=<ms>; remembered per browser. Still derived from the audio clock only.
const AV_KEY = "mv.av";
const avParam = new URLSearchParams(location.search).get("av");
let avMs = avParam !== null ? Number(avParam) : Number(localStorage.getItem(AV_KEY) ?? 35);
if (!Number.isFinite(avMs)) avMs = 35;
const viewTime = () => (audio.paused || EXPORT ? audio.currentTime : audio.currentTime + avMs / 1000);

function setStatus(msg) {
  statusEl.textContent = msg;
}

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function audioReady() {
  if (audio.readyState >= 4) return Promise.resolve();
  return new Promise((resolve, reject) => {
    audio.addEventListener("canplaythrough", () => resolve(), { once: true });
    audio.addEventListener("error", () => reject(new Error("音频加载失败")), { once: true });
  });
}

// ?look=<name> previews one scene on every chapter of this song, without touching RAW:
// a starting look (flat soft ink visualizer) or any scene file as <file.js>:<export>.
const LOOKS = { flat: "demo.js:demo", soft: "demo-soft.js:demoSoft", ink: "demo-ink.js:demoInk", visualizer: "demo-visualizer.js:demoVisualizer" };
async function lookScene(look) {
  if (!look) return null;
  const spec = LOOKS[look] ?? look;
  const m = /^([\w.-]+\.js):(\w+)$/.exec(spec);
  if (!m) throw new Error(`?look=${look}: use ${Object.keys(LOOKS).join(" | ")} or <file.js>:<export>`);
  const mod = await import(`./scenes/${m[1]}`).catch((e) => {
    throw new Error(`?look=${look}: cannot load src/scenes/${m[1]} (missing file, or an error inside it: ${e.message})`);
  });
  if (typeof mod[m[2]] !== "function") throw new Error(`?look=${look}: src/scenes/${m[1]} exports no ${m[2]}()`);
  return mod[m[2]];
}

async function boot() {
  setStatus("加载数据…");
  const data = await loadData();
  duration = data.duration;
  scrub.max = String(duration);

  signals = createSignals(data.features, data.grid, data.vocal);
  lyrics = buildLyrics(data.lyrics, data.vocal?.onsets ?? [], data.aligned);
  chapters = buildChapters(lyrics, signals, duration);
  const params = new URLSearchParams(location.search);
  const showLyrics = !params.has("nolyrics");
  renderer = createRenderer({ canvas, signals, lyrics, chapters, images: data.images, plates: data.plates, showLyrics, scene: await lookScene(params.get("look")) });

  setStatus("加载字体…");
  // every @font-face in index.html (add fonts there; nothing to change here)
  await Promise.all([...document.fonts].map((f) => f.load().catch((e) => console.error(`font ${f.family}: ${e.message}`))));

  setStatus("加载音频…");
  await audioReady();

  setStatus("预热画面…");
  for (const c of chapters) {
    try {
      renderer.draw(c.t0 + 0.05);
    } catch (e) {
      console.error(`warm-up failed in ${c.id}: ${e.message}`);
    }
  }
  renderer.draw(0);
}

function seek(t) {
  const target = Math.min(duration, Math.max(0, t));
  if (Math.abs(audio.currentTime - target) < 1e-4) {
    renderer.draw(audio.currentTime);
    return Promise.resolve(audio.currentTime);
  }
  return new Promise((resolve) => {
    audio.addEventListener(
      "seeked",
      () => {
        renderer.draw(audio.currentTime);
        resolve(audio.currentTime);
      },
      { once: true },
    );
    audio.currentTime = target;
  });
}

function frame() {
  const t = viewTime();
  if (t !== lastT) {
    renderer.draw(t);
    lastT = t;
  }
  clockEl.textContent = fmt(t);
  if (!dragging) scrub.value = String(t);
  if (!EXPORT) requestAnimationFrame(frame);
}

playBtn.addEventListener("click", async () => {
  if (!audio.paused) {
    audio.pause();
    return;
  }
  try {
    await audio.play();
  } catch (e) {
    setStatus(`播放失败：${e.message}`);
  }
});

audio.addEventListener("play", () => {
  playBtn.textContent = "暂停";
  setStatus(`播放中 · 画面提前 ${avMs} ms（[ / ] 调整）`);
});
audio.addEventListener("pause", () => {
  playBtn.textContent = "播放";
  if (audio.ended) return;
  setStatus("已暂停");
});
audio.addEventListener("ended", () => {
  playBtn.textContent = "重播";
  setStatus("播放结束");
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "[" && e.key !== "]") return;
  avMs += e.key === "]" ? 10 : -10;
  localStorage.setItem(AV_KEY, String(avMs));
  setStatus(`画面提前 ${avMs} ms（[ / ] 调整）`);
});

scrub.addEventListener("pointerdown", () => {
  dragging = true;
});
window.addEventListener("pointerup", () => {
  dragging = false;
});
scrub.addEventListener("input", () => {
  audio.currentTime = Number(scrub.value);
});

const ready = boot().then(() => {
  playBtn.disabled = false;
  playBtn.textContent = "播放";
  setStatus("准备就绪");
  frame();
});

ready.catch((e) => setStatus(`加载失败：${e.message}`));

window.mv = {
  canvas,
  W: FORMAT.w, // logical canvas size (style.js FORMAT)
  H: FORMAT.h,
  audio,
  get chapters() {
    return chapters;
  },
  get duration() {
    return duration;
  },
  // read-only views for scripts/check.mjs and debugging
  get signals() {
    return signals;
  },
  get lyrics() {
    return lyrics;
  },
  ready,
  draw: (t) => renderer.draw(t),
  seek,
};
