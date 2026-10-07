// CAMERA PREVIEWS ON THE MAP (master pass, OSIRIS's "live previews"; 2026-10-06 physical acceptance: each tile belongs
// unmistakably to its mark — a stem joins them, tiles that would overlap are not drawn, the camera in focus is outlined):
// when the person turns them on and the map is at street scale (zoom ≥ 13), up to 8 NEXUM cameras nearest the centre
// get a small tile above their mark. A current image is
// loaded from its publisher only now and every minute after, labelled with the time it was loaded (never "LIVE" for a
// still); a live stream shows a LIVE tile that opens the camera's card (the video itself starts only there, on request);
// a link-only camera shows no image. A tap on a tile opens the camera's NEXUM card (source, licence, status, evidence).
import { Marker, type Map as MLMap } from "maplibre-gl";
import { call } from "../lib/api";
import { store } from "../store";
import { ops } from "./state";

const MAX = 8, MIN_Z = 13, REFRESH_MS = 60_000;
// the tile's room (px; smaller tiles on a short screen, e.g. a phone in landscape — styles.css)
const short = () => innerHeight < 500, GAP_X = () => (short() ? 132 : 172), GAP_Y = () => (short() ? 96 : 128);

export function installPreviews(map: MLMap): () => void {
  const pins = new Map<string, { m: Marker; img?: HTMLImageElement; url?: string; time: HTMLElement }>();
  let seq = 0;
  const camType = () => [...store.get().types.values()].find((t: any) => t.family === "camera" && t.kind === "object")?.id as string | undefined;
  const drop = (id: string) => { pins.get(id)?.m.remove(); pins.delete(id); };
  const stamp = (p: { img?: HTMLImageElement; url?: string; time: HTMLElement }) => {
    const t = Date.now();
    if (p.img && p.url) p.img.src = `${p.url}${p.url.includes("?") ? "&" : "?"}nexum_t=${t}`;
    p.time.textContent = p.img ? `immagine caricata alle ${new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "";
  };
  const pin = async (id: string, at: [number, number], label: string) => {
    const el = document.createElement("div");
    el.className = "cam-pin";
    el.dataset.testid = "cam-preview";
    el.dataset.id = id;
    el.addEventListener("click", (e) => { e.stopPropagation(); store.select(id, "cam-preview"); });
    const box = document.createElement("div"), cap = document.createElement("div"), name = document.createElement("b"), time = document.createElement("span");
    box.className = "cam-pin-media"; cap.className = "cam-pin-cap";
    name.textContent = label; cap.append(name, time); el.append(box, cap);
    const entry: { m: Marker; img?: HTMLImageElement; url?: string; time: HTMLElement } = { m: new Marker({ element: el, anchor: "bottom", offset: [0, -16] }).setLngLat(at).addTo(map), time };
    pins.set(id, entry);
    try {
      const r = await call<any>(`/entities/${id}`, undefined, { channel: `cam-pv-${id}` });
      const p = r.data?.properties ?? {};
      el.dataset.status = p.availability ?? "unknown";
      if ((p.availability === "current_snapshot" || p.availability === "live_stream") && /^https:\/\//.test(p.image_url ?? "") && p.stream_type !== "mjpeg") {
        const img = document.createElement("img");
        img.alt = label; img.referrerPolicy = "no-referrer"; img.loading = "lazy";
        img.onerror = () => { box.textContent = "immagine non disponibile ora"; box.className = "cam-pin-media na"; time.textContent = ""; };
        box.append(img); entry.img = img; entry.url = p.image_url;
        // a live camera's still: the video is in its card (a still is never called LIVE)
        if (p.availability === "live_stream") { const tag = document.createElement("i"); tag.className = "cam-pin-live"; tag.textContent = "diretta nella scheda"; box.append(tag); }
        stamp(entry);
      } else if (p.availability === "live_stream" || p.availability === "external_live") {
        box.className = "cam-pin-media live"; box.textContent = "● LIVE · tocca per aprire";
      } else {
        box.className = "cam-pin-media na"; box.textContent = p.availability === "offline" || p.availability === "dead" ? "fuori servizio" : "solo collegamento";
      }
    } catch { box.className = "cam-pin-media na"; box.textContent = "scheda non disponibile"; }
  };
  const refresh = async () => {
    const t = camType();
    if (!ops.get().layers.camPreviews || !t) { for (const id of [...pins.keys()]) drop(id); return; }
    if (map.getZoom() < MIN_Z) { for (const id of [...pins.keys()]) drop(id); return; }
    const my = ++seq, b = map.getBounds();
    const r = await call<any>("/projections/map", { s: { ...store.get().scope, viewport: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], z: 14, types: [t] },
      b: { max_items: 60, lod: "refs" } }, { channel: "cam-previews" }).catch(() => null);
    if (!r || my !== seq) return;
    const d = store.normalize(r.data), c = map.getCenter();
    const near = ((d.items ?? []) as any[]).map((x) => store.entity(x.$ref)).filter((e: any) => e?.point)
      .sort((a: any, z: any) => Math.hypot(a.point[0] - c.lng, a.point[1] - c.lat) - Math.hypot(z.point[0] - c.lng, z.point[1] - c.lat)).slice(0, MAX * 3);
    // never two tiles over each other: a tile is drawn only where it does not cover one already chosen
    const placed: { x: number; y: number }[] = [];
    const cv = map.getCanvas(), W = cv.clientWidth, H = cv.clientHeight;
    const chosen = near.filter((e: any) => {
      const q = map.project(e.point);
      // the whole tile inside the map (never under the bars or past an edge, where a tap would miss it)
      if (q.y < GAP_Y() + 24 || q.y > H - 8 || q.x < GAP_X() / 2 + 4 || q.x > W - GAP_X() / 2 - 4) return false;
      if (placed.some((o) => Math.abs(o.x - q.x) < GAP_X() && Math.abs(o.y - q.y) < GAP_Y())) return false;
      placed.push(q); return true;
    });
    near.length = 0; near.push(...chosen);
    const keep = new Set(near.map((e: any) => e.id));
    for (const id of [...pins.keys()]) if (!keep.has(id)) drop(id);
    for (const e of (near as any[]).slice(0, MAX)) if (!pins.has(e.id)) pin(e.id, e.point, e.label ?? "");
    for (const id of [...pins.keys()]) if (![...near.slice(0, MAX)].some((e: any) => e.id === id)) drop(id);
    mark();
  };
  // the camera in focus: its tile outlined
  const mark = () => { const f = store.get().focus; pins.forEach((p, id) => p.m.getElement().classList.toggle("sel", id === f)); };
  const unfocus = store.subscribe(mark);
  const timer = window.setInterval(() => pins.forEach((p) => stamp(p)), REFRESH_MS);
  map.on("moveend", refresh);
  const unsub = ops.subscribe(refresh);
  refresh();
  return () => { window.clearInterval(timer); map.off("moveend", refresh); unsub(); unfocus(); for (const id of [...pins.keys()]) drop(id); };
}
