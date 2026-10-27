async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败 ${src}`));
    img.src = src;
  });
}

export async function loadData() {
  const optional = (path, fallback) => getJson(path).catch(() => fallback);
  const [features, chapters, lyrics, vocal, plates] = await Promise.all([
    getJson("data/audio_features.json"),
    getJson("data/chapters.json"),
    // instrumentals / songs not aligned yet: no lyrics, no vocal stem -> empty, the film still runs
    optional("data/lyrics_timed.json", { lines: [] }),
    optional("data/vocal_onsets.json", null),
    optional("assets/material/plates.json", { images: [], seq: {} }),
  ]);
  // per-word forced alignment; optional, the line-level estimate stands in without it
  const aligned = await getJson("data/words_timed.json").then((d) => d.lines, () => null);
  const images = {};
  await Promise.all(
    plates.images.map(async (p) => {
      images[p.id] = await loadImage(`assets/material/${p.file}`);
    }),
  );
  return {
    features,
    grid: chapters.grid,
    lyrics: lyrics.lines,
    vocal,
    aligned,
    plates,
    images,
    duration: chapters.duration_s,
  };
}
