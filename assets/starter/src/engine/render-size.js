// Keep the film's logical coordinates (style.js FORMAT) while rasterizing export layers at full resolution.
import { FORMAT } from "../scenes/style.js";
const params = new URLSearchParams(location.search);
const width = params.has("export") ? Number(params.get("width") || FORMAT.w) : FORMAT.w;
const height = (width * FORMAT.h) / FORMAT.w;
// yuv420p needs even sizes; the height must come out whole at this width
if (!Number.isInteger(width) || width <= 0 || width % 2 || !Number.isInteger(height) || height % 2) {
  throw new Error(`Invalid export width ${width} for a ${FORMAT.w}x${FORMAT.h} film (height ${height} must be a whole even number)`);
}
export const RENDER_SCALE = width / FORMAT.w;
export const RENDER_W = width;
export const RENDER_H = height;

const scaledSources = new WeakMap();
if (RENDER_SCALE !== 1) {
  const nativeDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
    const scale = scaledSources.get(image);
    if (scale) {
      if (args.length === 2) args.push(image.width / scale, image.height / scale);
      else if (args.length === 8) args = args.map((v, i) => i < 4 ? v * scale : v);
    }
    return nativeDraw.call(this, image, ...args);
  };
}

export function screenCanvas() {
  const c = document.createElement("canvas");
  c.width = RENDER_W;
  c.height = RENDER_H;
  if (RENDER_SCALE !== 1) {
    scaledSources.set(c, RENDER_SCALE);
    const g = c.getContext("2d");
    const nativeSet = g.setTransform.bind(g);
    g.setTransform = (a, b, cc, d, e, f) => {
      if (typeof a === "object") return nativeSet(a.a * RENDER_SCALE, a.b * RENDER_SCALE, a.c * RENDER_SCALE, a.d * RENDER_SCALE, a.e * RENDER_SCALE, a.f * RENDER_SCALE);
      return nativeSet(a * RENDER_SCALE, b * RENDER_SCALE, cc * RENDER_SCALE, d * RENDER_SCALE, e * RENDER_SCALE, f * RENDER_SCALE);
    };
    g.resetTransform = () => nativeSet(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    const filter = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "filter");
    const pixels = (value, scale) => value.replace(/([\d.]+)px/g, (_, n) => `${Number(n) * scale}px`);
    Object.defineProperty(g, "filter", {
      get: () => pixels(filter.get.call(g), 1 / RENDER_SCALE),
      set: value => filter.set.call(g, pixels(value, RENDER_SCALE)),
    });
    g.resetTransform();
  }
  return c;
}
