// THE EARTH'S ILLUMINATION on the one Operational Map (2026-10-03): always on, never a mode, never a toggle.
// · day side: the map as it is;
// · night side: a natural darkening, continuous across the terminator (computed from the current UTC time — CURRENT);
// · on the night side only: the reference night lights (NASA Black Marble 2016, VIIRS Day/Night Band, a composite of
//   2016 — REFERENCE, never presented as live).
// Canvases in Web Mercator rows (the map's own projection), placed under every NEXUM layer and over the land, so
// objects, events, connections, labels and the selection always stay on top. No network request but the asset itself
// (same origin); redrawn every few minutes as the Earth turns.

import type { Map as MLMap } from "maplibre-gl";
import { nightFactor, solarAltitude, subsolar } from "../lib/sun";

export const LIGHTS_URL = "/ref/night-lights-2016.webp";
const W = 1024, H = 1024;                               // the night: mercator square, latitudes ±85.0511
const MAX_LAT = 85.0511287798;
const REDRAW_MS = 5 * 60_000;
const DARK = [3, 5, 8], DARK_ALPHA = 0.74;             // the night side: deep, never black (borders stay legible)
// The lights (revised after the physical test of 2026-10-03, reference: the earlier full-detail rendering):
// · as much of the source's detail as its file carries — one canvas column per source column, never resampled down;
// · only where lights exist (75° N – 60° S), so the canvas stays small enough for phones;
// · a gentle transfer curve (v^0.75 · 1.35) instead of v²: suburbs and towns of the composite stay visible, a floor
//   (6 % of full scale) keeps the dark background of the composite dark — no glow where the source has none.
const LIGHT = [255, 222, 168];
const L_TOP = 75, L_BOTTOM = -60;
const L_FLOOR = 0.06, L_GAMMA = 0.75, L_GAIN = 1.35;
const MASK_W = 720;                                     // the night mask for the lights (smooth; scaled up by the canvas)

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unmerc = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

function rowLatitudes(h: number, top = MAX_LAT, bottom = -MAX_LAT): Float64Array {
  const y0 = merc(top), y1 = merc(bottom), lat = new Float64Array(h);
  for (let y = 0; y < h; y++) lat[y] = unmerc(y0 + ((y + 0.5) / h) * (y1 - y0));
  return lat;
}

/** The reference lights once, in the map's rows: colour and the curve's alpha per pixel (null without the asset). */
async function lightsBase(): Promise<HTMLCanvasElement | null> {
  const img = new Image();
  img.decoding = "async";
  img.src = LIGHTS_URL;
  try { await img.decode(); } catch { return null; }   // without the reference image the shading still works
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const src = document.createElement("canvas");
  src.width = sw; src.height = sh;
  const sg = src.getContext("2d", { willReadFrequently: true })!;
  sg.drawImage(img, 0, 0);
  const sd = sg.getImageData(0, 0, sw, sh).data;
  // the mercator rows of the lit band, as many as the source has rows over it (no row invented)
  const h = Math.round(((merc(L_TOP) - merc(L_BOTTOM)) / (2 * Math.PI)) * sw);
  const lat = rowLatitudes(h, L_TOP, L_BOTTOM);
  const out = document.createElement("canvas");
  out.width = sw; out.height = h;
  const og = out.getContext("2d")!;
  const od = og.createImageData(sw, h);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const x = Math.max(0, (v / 255 - L_FLOOR) / (1 - L_FLOOR));
    lut[v] = Math.min(255, Math.round(Math.pow(x, L_GAMMA) * L_GAIN * 255));
  }
  for (let y = 0; y < h; y++) {
    const sy = Math.min(sh - 1, Math.max(0, Math.floor(((90 - lat[y]) / 180) * sh)));   // nearest source row
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      od.data[i] = LIGHT[0]; od.data[i + 1] = LIGHT[1]; od.data[i + 2] = LIGHT[2];
      od.data[i + 3] = lut[sd[(sy * sw + x) * 4]];
    }
  }
  og.putImageData(od, 0, 0);
  return out;
}

// The reference lights are a composite of about 0.13°: legible at world and continental scale, made of visible cells
// once a cell spans many pixels. Their own layer fades with the zoom (never sharpened, never interpolated into a
// precision the source does not have); the night itself (the darkening) stays at every zoom.
export const LIGHTS_OPACITY: [number, number][] = [[0, 1], [3.5, 1], [5, 0.45], [6, 0.15], [6.8, 0]];

export function installIllumination(map: MLMap, beforeLayer: string): () => void {
  // the clock: the current UTC time; tests may pin an instant through the test hook (never a user control)
  let pinned: number | null = null;
  const now = () => pinned ?? Date.now();
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(W, H);
  const lat = rowLatitudes(H);
  // the lights: their own canvas over the lit band, masked by the night (the same night factor as the darkening)
  const lightsCanvas = document.createElement("canvas");
  lightsCanvas.width = 2; lightsCanvas.height = 2;
  const mask = document.createElement("canvas");
  let base: HTMLCanvasElement | null = null;
  const maskLat = (h: number) => rowLatitudes(h, L_TOP, L_BOTTOM);
  const drawLights = (sun: { lat: number; lon: number }) => {
    if (!base) return;
    if (lightsCanvas.width !== base.width) { lightsCanvas.width = base.width; lightsCanvas.height = base.height; }
    const mh = Math.max(1, Math.round((MASK_W * base.height) / base.width));
    mask.width = MASK_W; mask.height = mh;
    const mg = mask.getContext("2d")!, md = mg.createImageData(MASK_W, mh), ml = maskLat(mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < MASK_W; x++) {
      const i = (y * MASK_W + x) * 4;
      md.data[i + 3] = nightFactor(solarAltitude(ml[y], ((x + 0.5) / MASK_W) * 360 - 180, sun)) * 255;
    }
    mg.putImageData(md, 0, 0);
    const lg = lightsCanvas.getContext("2d")!;
    lg.globalCompositeOperation = "copy";
    lg.drawImage(base, 0, 0);
    lg.globalCompositeOperation = "destination-in";     // the lights only where (and as much as) it is night
    lg.imageSmoothingEnabled = true;
    lg.drawImage(mask, 0, 0, lightsCanvas.width, lightsCanvas.height);
    lg.globalCompositeOperation = "source-over";
  };
  const draw = () => {
    const sun = subsolar(now());
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * 360 - 180;
        const f = nightFactor(solarAltitude(lat[y], lon, sun));
        const i = (y * W + x) * 4;
        d[i] = DARK[0]; d[i + 1] = DARK[1]; d[i + 2] = DARK[2]; d[i + 3] = f * DARK_ALPHA * 255;   // the night
      }
    }
    g.putImageData(img, 0, 0);
    drawLights(sun);
    for (const id of ["nexum-illumination", "nexum-lights"]) {
      const src = map.getSource(id) as any;
      if (src) { src.play(); requestAnimationFrame(() => src.pause()); }   // copy the new pixels once (static canvas)
    }
    performance.mark("nexum:illumination");
    (canvas as any).dataset.sun = `${sun.lat.toFixed(2)},${sun.lon.toFixed(2)}`;
  };
  draw();
  const before = map.getLayer(beforeLayer) ? beforeLayer : undefined;
  map.addSource("nexum-illumination", { type: "canvas", canvas, animate: false,
    coordinates: [[-180, MAX_LAT], [180, MAX_LAT], [180, -MAX_LAT], [-180, -MAX_LAT]] });
  map.addLayer({ id: "nexum-illumination", type: "raster", source: "nexum-illumination",
    paint: { "raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0 } }, before);
  map.addSource("nexum-lights", { type: "canvas", canvas: lightsCanvas, animate: false,
    coordinates: [[-180, L_TOP], [180, L_TOP], [180, L_BOTTOM], [-180, L_BOTTOM]] });
  map.addLayer({ id: "nexum-lights", type: "raster", source: "nexum-lights",
    paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], ...LIGHTS_OPACITY.flat()] as any,
      "raster-resampling": "linear", "raster-fade-duration": 0 } }, before);
  lightsBase().then((b) => { base = b; draw(); });
  const timer = window.setInterval(draw, REDRAW_MS);
  ((window as any).__nexum ??= {}).illumination = { canvas, lightsCanvas, subsolar: () => subsolar(now()),
    pin: (ms: number | null) => { pinned = ms; draw(); }, lightsReady: () => base !== null };
  return () => window.clearInterval(timer);
}
