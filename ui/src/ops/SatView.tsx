// SAT VIEW (2026-10-15): in the card of an observing spacecraft, what THAT spacecraft observed — its own product,
// never another spacecraft's — or the official live video where its operator publishes one. Everything is asked of the
// public services only when the person taps (nothing preloaded, nothing stored, nothing proxied); a service that does
// not answer is said unavailable and never blocks the map. Each image says its class (LIVE VIDEO · ULTIMA ACQUISIZIONE ·
// IMMAGINE STORICA · NON DISPONIBILE), source, spacecraft, instrument and the UTC time the service gives (a day-only
// product stays a day). The field drawn on the map says what it is: a real footprint, a theoretical swath, a horizon.
// Satellites and products are data: src/config/satview.json (services already allowed in media-hosts.json).

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import CFG from "../config/satview.json";
import IMG from "../config/imagery.json";
import OPS from "../config/ops.json";
import { orbitDetail, orbitTrack, splitAntimeridian } from "./orbits";
import { bboxOf, type LngLat } from "./geo";
import { capRing, classify, CLASS_LABEL, FIELD_LABEL, fmtAge, fmtUTC, horizonDeg, slotBack, swathQuads, wmsSlots, type FieldKind, type SatClass } from "./satgeo";

const C = CFG as any;
const T = C.text as Record<string, string>;   // the words shown, as data
const DAY = 86_400_000, HOUR = 3_600_000;
const STALE_MS = (C.stale_days as number) * DAY;
export const satConfig = (norad: number): any | null => C.sats[String(norad)] ?? null;

interface Shot { url: string; at: string; cls: SatClass; product: string; res?: string; note?: string; extra?: string }

const fetchOpts: RequestInit = { referrerPolicy: "no-referrer", credentials: "omit" };
async function timed(url: string, init: RequestInit = {}, ms = 20_000): Promise<Response> {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...fetchOpts, ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

// ── the field on the map ──────────────────────────────────────────────────
const FIELD = "ops-satview-field";
function fieldSource(map: MLMap): GeoJSONSource {
  if (!map.getSource(FIELD)) {
    map.addSource(FIELD, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const before = map.getLayer("ops-orbit-track") ? "ops-orbit-track" : undefined;   // under the satellites and their track
    map.addLayer({ id: `${FIELD}-fill`, type: "fill", source: FIELD, paint: { "fill-color": ["get", "c"], "fill-opacity": ["get", "o"] } }, before);
    map.addLayer({ id: `${FIELD}-line`, type: "line", source: FIELD, paint: { "line-color": ["get", "c"], "line-width": 1.5, "line-opacity": 0.9,
      "line-dasharray": ["case", ["==", ["get", "k"], "footprint"], ["literal", [1, 0]], ["literal", [3, 2]]] } }, before);
  }
  return map.getSource(FIELD) as GeoJSONSource;
}
function dropField(map: MLMap) {
  if (!map.getStyle()) return;
  for (const l of [`${FIELD}-line`, `${FIELD}-fill`]) if (map.getLayer(l)) map.removeLayer(l);
  if (map.getSource(FIELD)) map.removeSource(FIELD);
}
const COLOR: Record<FieldKind, string> = { footprint: "#9FD07A", swath: "#E0A640", horizon: "#79A7C9" };
const polys = (k: FieldKind, rings: LngLat[][]): GeoJSON.Feature[] =>
  rings.map((r) => ({ type: "Feature", properties: { k, c: COLOR[k], o: k === "footprint" ? 0.22 : 0.1 }, geometry: { type: "Polygon", coordinates: [r] } }));

// ── the services ──────────────────────────────────────────────────────────
/** EUMETView: the layer's own time dimension (its newest slot), then the full disc at that exact slot. */
async function eumetCaps(layer: string): Promise<{ latest: string | null; start: string | null }> {
  const [ws, name] = layer.split(":");
  const r = await timed(`${(IMG as any).eumet.replace(/\/ows$/, "")}/${ws}/${name}/ows?service=WMS&request=GetCapabilities&version=1.3.0`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const x = await r.text();
  const m = x.match(/<Dimension[^>]*name="time"[^>]*>([^<]+)</);
  const d = x.match(/<Dimension[^>]*name="time"[^>]*default="([^"]+)"/);
  if (!m) throw new Error("nessun tempo dichiarato");
  return wmsSlots(m[1], d?.[1] ?? null);
}
async function eumetDisc(layer: string, time: string, lon: number): Promise<string | null> {
  const r = await timed(`${(IMG as any).eumet}?service=WMS&request=GetMap&version=1.3.0&crs=EPSG:4326&styles=&format=image/jpeg&bgcolor=0x000000&layers=${layer}` +
    `&bbox=-81,${lon - 81},81,${lon + 81}&width=768&height=768&time=${encodeURIComponent(time)}`);
  if (!r.ok) return null;
  const b = await r.blob();
  return b.type.startsWith("image/") && b.size > 3000 ? URL.createObjectURL(b) : null;     // an XML exception or an empty frame: nothing shown
}
/** NASA CMR: the newest granule of the spacecraft's own instrument collection (proof that it still delivers). */
async function cmrLatest(shortName: string): Promise<string | null> {
  const r = await timed(`${(IMG as any).cmr}?short_name=${encodeURIComponent(shortName)}&sort_key=-start_date&page_size=1`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json())?.feed?.entry?.[0]?.time_start ?? null;
}
/** NASA GIBS (WMS, EPSG:4326): the spacecraft's own daily layer around a point, on one UTC day. GIBS answers black where the
 *  layer has no data (night, gaps, a day not yet flown): a frame with almost nothing in it is no image. The day is
 *  confirmed by the service itself (the WMTS tile header "layer-time-actual") when it answers. */
const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
const GIBS_WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
async function covered(blob: Blob): Promise<number> {
  try {
    const bmp = await createImageBitmap(blob), w = 96, h = 64;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, w, h); bmp.close();
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 24) n++;
    return n / (w * h);
  } catch { return 1; }                                                // cannot measure: the image is shown, as the service sent it
}
async function gibsActualDay(layer: string, day: string, c: LngLat): Promise<string | null> {
  const z = 3, n = 2 ** z, x = Math.floor(((c[0] + 180) / 360) * n), la = (Math.max(-85, Math.min(85, c[1])) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  const r = await timed(`${GIBS_WMTS}/${layer}/default/${day}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`, {}, 10_000).catch(() => null);
  return r?.ok ? (r.headers.get("layer-time-actual") ?? "").slice(0, 10) || null : null;
}
async function gibsDay(layer: string, day: string, c: LngLat): Promise<{ url: string; at: string } | null> {
  const lat = Math.max(-72, Math.min(72, c[1]));
  const b = [c[0] - 12, lat - 8, c[0] + 12, lat + 8];
  const [r, actual] = await Promise.all([
    timed(`${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer},${(IMG as any).coastlines}&STYLES=&CRS=EPSG:4326` +
      `&BBOX=${b[1].toFixed(3)},${b[0].toFixed(3)},${b[3].toFixed(3)},${b[2].toFixed(3)}&WIDTH=720&HEIGHT=480&FORMAT=image/jpeg&TIME=${day}`),
    gibsActualDay(layer, day, c),
  ]);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (actual && actual !== day) return null;                         // the service would give another day: not this one
  const blob = await r.blob();
  if (!blob.type.startsWith("image/") || blob.size < 3000 || (await covered(blob)) < 0.05) return null;
  return { url: URL.createObjectURL(blob), at: day };
}
/** Earth Search: the newest Sentinel-2 L2A scenes of ONE platform (everywhere, or over a point). */
/** USABLE = under 60 % cloud and over half the tile with data (said in the card); otherwise every scene, newest first. */
export const USABLE = { cloud: 60, nodata: 50 };
async function stacScenes(platform: string, at: LngLat | undefined, usable: boolean): Promise<any[]> {
  const query: any = { platform: { eq: platform } };
  if (usable) { query["eo:cloud_cover"] = { lt: USABLE.cloud }; query["s2:nodata_pixel_percentage"] = { lt: USABLE.nodata }; }
  const body: any = { collections: OPS.stac.collections, limit: 6, query,
    sortby: [{ field: "properties.datetime", direction: "desc" }] };
  if (at) body.intersects = { type: "Point", coordinates: at };
  const r = await timed(OPS.stac.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  // only the scenes whose own metadata name THIS platform (never a neighbour's)
  return ((await r.json()).features ?? []).filter((f: any) => f.properties?.platform === platform);
}
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ── the section ───────────────────────────────────────────────────────────
export default function SatView({ map, id }: { map: MLMap; id: number }) {
  const s = satConfig(id);
  const [field, setField] = useState<FieldKind | null>(null);
  const [showField, setShowField] = useState(true);
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);         // what the service says about the spacecraft (CMR)
  const [scenes, setScenes] = useState<{ list: any[]; area: boolean } | null>(null);
  const [video, setVideo] = useState(false);
  const [useful, setUseful] = useState(true);                       // Sentinel-2: usable scenes only (clouds, empty tiles)
  const urlRef = useRef<string | null>(null);
  const footRef = useRef<LngLat[] | null>(null);                     // the real footprint of the scene on screen
  const keep = (url: string | null) => { if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current); urlRef.current = url; };
  useEffect(() => () => { keep(null); dropField(map); }, [map]);
  useEffect(() => { setShot(null); setErr(null); setState(null); setScenes(null); setVideo(false); keep(null); footRef.current = null; }, [id]);

  // the field: the theoretical swath along the calculated track, the calculated horizon — replaced by a real footprint
  useEffect(() => {
    if (!s) return;
    let live = true;
    const draw = async () => {
      if (!showField) { (map.getSource(FIELD) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] }); setField(null); return; }
      if (footRef.current) {                                            // a scene's real footprint replaces the theoretical swath
        fieldSource(map).setData({ type: "FeatureCollection", features: polys("footprint", [footRef.current]) });
        setField("footprint");
        return;
      }
      const d = await orbitDetail(id, Date.now());
      if (!live || !d || !map.getStyle()) return;
      if (s.swath_km) {
        const pts = await orbitTrack(id, Date.now() - 25 * 60_000, 50, 60);
        if (!live) return;
        const rings = splitAntimeridian(pts).flatMap((l) => swathQuads(l as LngLat[], s.swath_km));
        fieldSource(map).setData({ type: "FeatureCollection", features: polys("swath", rings) });
        setField("swath");
      } else {
        const ring = capRing([d.lng, d.lat], horizonDeg(d.alt));
        fieldSource(map).setData({ type: "FeatureCollection", features: ring ? polys("horizon", [ring]) : [] });
        setField(ring ? "horizon" : null);
      }
    };
    draw();
    const t = window.setInterval(draw, s.kind === "geo" ? 600_000 : 15_000);
    return () => { live = false; window.clearInterval(t); };
  }, [id, s, map, showField, shot]);

  if (!s) return null;

  const fail = (e: any) => { setErr(String(e?.name === "AbortError" ? "tempo scaduto" : e?.message ?? e)); setShot(null); keep(null); };

  // Meteosat-12: the full disc at the service's newest slot (or a slot hours before it, said historical)
  const runGeo = async (pKey: string, hoursBack = 0) => {
    const p = s.products.find((x: any) => x.key === pKey);
    setBusy(`${pKey}-${hoursBack}`); setErr(null);
    try {
      const slots = await eumetCaps(p.layer);
      const t = slots.latest && (hoursBack ? slotBack(slots.latest, hoursBack, slots.start) : slots.latest);
      const url = t ? await eumetDisc(p.layer, t, s.lon) : null;
      keep(url);
      setShot(url && t ? { url, at: t, product: `${p.label} · disco intero`, res: p.res,
        cls: classify(hoursBack === 0, Date.parse(t), Date.now(), 3 * HOUR) } : { url: "", at: "", cls: "none", product: p.label });
    } catch (e) { fail(e); }
    setBusy(null);
  };

  // NOAA-20/21, Terra, Aqua: the spacecraft's own daily mosaic around the point under it now (or the map's centre)
  const runDaily = async (where: "sub" | "map", daysBack = 0) => {
    setBusy(`${where}-${daysBack}`); setErr(null);
    try {
      const d = await orbitDetail(id, Date.now());
      const c: LngLat = where === "map" || !d ? [map.getCenter().lng, map.getCenter().lat] : [d.lng, d.lat];
      const [last, img] = await Promise.all([
        cmrLatest(s.cmr).catch(() => undefined),
        (async () => { for (let k = daysBack; k < daysBack + (daysBack ? 1 : 3); k++) { const f = await gibsDay(s.layer, isoDay(Date.now() - k * DAY), c); if (f) return { ...f, k }; } return null; })()
          .catch((e) => e as Error),
      ]);
      const delivering = last ? Date.now() - Date.parse(last) <= STALE_MS : null;
      setState(last === undefined ? "Stato dello strumento non verificato ora (NASA CMR non risponde)."
        : !last ? "NASA CMR non elenca dati recenti di questo strumento."
        : `Ultimo dato consegnato dallo strumento: ${fmtUTC(last)} (${fmtAge(last, Date.now())}) · NASA CMR${delivering ? "" : T.notDelivering}.`);
      if (img instanceof Error) throw img;                              // the image service did not answer: said, with the CMR state kept
      keep(img?.url ?? null);
      setShot(img ? { url: img.url, at: img.at, product: "Mosaico giornaliero · colori reali", res: s.res,
        cls: img.k === 0 && delivering !== false ? classify(true, Date.parse(img.at), Date.now(), 2 * DAY) : "historical",
        note: T.dailyNote,
        extra: where === "map" ? "centro della mappa" : "sotto la posizione calcolata ora" } : { url: "", at: "", cls: "none", product: "Mosaico giornaliero" });
    } catch (e) { fail(e); }
    setBusy(null);
  };

  // Sentinel-2A/B/C: the newest scenes of this platform (everywhere, or over the map's centre), with their footprint
  const runStac = async (area: boolean, usable = useful) => {
    setBusy(area ? "area" : "all"); setErr(null);
    try {
      const c = map.getCenter();
      const list = await stacScenes(s.platform, area ? [c.lng, c.lat] : undefined, usable);
      setScenes({ list, area });
      if (list.length) pick(list[0], 0, area, usable); else { setShot({ url: "", at: "", cls: "none", product: "Scena Sentinel-2" }); keep(null); }
    } catch (e) { fail(e); setScenes(null); }
    setBusy(null);
  };
  const pick = (f: any, i: number, area: boolean, usable = useful) => {
    const p = f.properties, href = f.assets?.thumbnail?.href ?? null;
    keep(null);
    setShot({ url: href ?? "", at: p.datetime, product: `Scena L2A · tessera ${p["s2:mgrs_tile"] ?? p["grid:code"] ?? "—"}`, res: "10 m (anteprima ridotta)",
      cls: href ? classify(i === 0 && !area, Date.parse(p.datetime), Date.now(), STALE_MS) : "none",
      note: `nuvolosità ${Math.round(p["eo:cloud_cover"] ?? 0)} %${p["s2:nodata_pixel_percentage"] != null ? ` · tessera senza dati ${Math.round(p["s2:nodata_pixel_percentage"])} %` : ""}` +
        (i === 0 ? ` · ${T.newest}${area ? " su quest'area" : ""}${usable ? ` tra quelle utili (nubi < ${USABLE.cloud} %, tessera coperta per oltre il ${100 - USABLE.nodata} %)` : ""}` : ""),
      extra: f.id });
    const ring = (f.geometry?.type === "Polygon" ? f.geometry.coordinates : f.geometry?.coordinates?.[0])?.[0] as LngLat[] | undefined;
    footRef.current = ring ?? null;
    if (ring && showField) {
      fieldSource(map).setData({ type: "FeatureCollection", features: polys("footprint", [ring]) });
      setField("footprint");
      const b = bboxOf(ring), card = document.querySelector("[data-testid=ops-orbit-card]")?.getBoundingClientRect();
      const mc = map.getCanvas().getBoundingClientRect(), touch = !!card && card.width > mc.width * 0.8;
      // the scene is fitted in the part of the map the card does not cover
      const pad = { top: 50, right: 70, bottom: touch && card ? Math.min(mc.height * 0.6, mc.bottom - card.top + 30) : 50, left: !touch && card ? Math.min(mc.width * 0.5, card.right - mc.left + 30) : 40 };
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, duration: 700, maxZoom: 8 });
    }
  };

  const cls = shot?.cls;
  return (
    <section className="satview" data-testid="satview" data-kind={s.kind}>
      <div className="hl-h">{T.heading}</div>
      <p className="xs dim">{s.instrument} · {s.source}. {s.note ?? ""}</p>

      {s.kind === "video" && (!video
        ? <button type="button" className="xs primary" data-testid="satview-video-start" onClick={() => setVideo(true)}>▶ Avvia il video ufficiale NASA</button>
        : <NasaIss playlist={s.playlist} onStop={() => setVideo(false)} />)}

      {s.kind === "geo" && <p className="xs faint">Colori reali: solo la parte illuminata del disco (il resto è nero, è notte). Di notte usa l'infrarosso.</p>}
      {s.kind === "geo" && <div className="sat-products">{s.products.map((p: any) => (
        <button key={p.key} type="button" className="chip" data-testid={`satview-geo-${p.key}`} disabled={!!busy} aria-busy={busy === `${p.key}-0`}
          onClick={() => runGeo(p.key)}>{busy === `${p.key}-0` ? "Chiedo…" : `${p.label} · ultima`}</button>))}</div>}

      {s.kind === "daily" && <div className="sat-products">
        <button type="button" className="chip" data-testid="satview-daily-sub" disabled={!!busy} onClick={() => runDaily("sub")}>{busy === "sub-0" ? "Chiedo…" : T.under}</button>
        <button type="button" className="chip" data-testid="satview-daily-map" disabled={!!busy} onClick={() => runDaily("map")}>{busy === "map-0" ? "Chiedo…" : "Centro della mappa"}</button></div>}

      {s.kind === "stac" && <div className="sat-products">
        <button type="button" className="chip" data-testid="satview-stac-all" disabled={!!busy} onClick={() => runStac(false)}>{busy === "all" ? "Chiedo…" : "Ultime acquisizioni"}</button>
        <button type="button" className="chip" data-testid="satview-stac-area" disabled={!!busy} onClick={() => runStac(true)}>{busy === "area" ? "Chiedo…" : "Sul centro della mappa"}</button></div>}

      {err && <p className="xs warn" data-testid="satview-error">{CLASS_LABEL.none}: il servizio non risponde ora ({err}). NEXUM continua a funzionare.</p>}
      {state && <p className="xs" data-testid="satview-state">{state}</p>}

      {shot && cls === "none" && <p className="xs warn" data-testid="satview-none"><b className="sat-class none">{CLASS_LABEL.none}</b> {T.none}</p>}
      {shot && cls !== "none" && (
        <figure className="sat-fig" data-testid="satview-frame" data-class={cls}>
          <img src={shot.url} alt={`${shot.product} · ${s.name}`} data-testid="satview-img" referrerPolicy="no-referrer"
            onError={() => setShot((x) => x && { ...x, cls: "none" })} />
          <figcaption className="xs">
            <b className={`sat-class ${cls}`} data-testid="satview-class">{CLASS_LABEL[cls!]}</b>{" "}
            <span data-testid="satview-time">{fmtUTC(shot.at)}</span><span className="dim"> · {fmtAge(shot.at, Date.now())}</span><br />
            <span data-testid="satview-meta">{T.metaLabel} <b>{s.name}</b> · strumento {s.instrument} · {shot.product}{shot.res ? ` · ${shot.res}` : ""}</span>
            {shot.extra && <span className="dim"> · {shot.extra}</span>}<br />
            {shot.note && <><span className="dim">{shot.note}</span><br /></>}
            <span className="faint" data-testid="satview-source">Fonte: {s.source} · {s.attribution}</span>
          </figcaption>
          {s.kind === "geo" && <div className="sat-timeline" role="group" aria-label="Momento dell'immagine">{[1, 6, 24].map((h) => {
            const pk = s.products.find((p: any) => shot.product.startsWith(p.label))?.key ?? s.products[0].key;
            return <button key={h} type="button" className="chip" disabled={!!busy} data-testid={`satview-geo-back-${h}`} onClick={() => runGeo(pk, h)}>−{h} h</button>; })}</div>}
          {s.kind === "daily" && <div className="sat-timeline" role="group" aria-label="Giorno dell'immagine">{[1, 2, 3].map((d) => (
            <button key={d} type="button" className="chip" disabled={!!busy} data-testid={`satview-daily-back-${d}`}
              onClick={() => runDaily(shot.extra === "centro della mappa" ? "map" : "sub", d)}>−{d} g</button>))}</div>}
        </figure>)}

      {scenes && scenes.list.length > 1 && <ul className="ops-list" data-testid="satview-scenes">{scenes.list.map((f, i) => (
        <li key={f.id}><button type="button" className="linklike" aria-pressed={shot?.extra === f.id} onClick={() => pick(f, i, scenes.area)}>{fmtUTC(f.properties.datetime)}</button>
          <span className="xs dim"> · nubi {Math.round(f.properties["eo:cloud_cover"] ?? 0)} % · {f.properties["s2:mgrs_tile"] ?? ""}</span></li>))}</ul>}
      {s.kind === "stac" && <label className="row xs"><input type="checkbox" checked={useful} data-testid="satview-stac-useful"
        onChange={() => { setUseful(!useful); if (scenes) runStac(scenes.area, !useful); }} /> solo scene utili (nubi &lt; {USABLE.cloud} %, tessera coperta per oltre il {100 - USABLE.nodata} %)</label>}
      {s.kind === "stac" && scenes && <p className="xs faint">{T.stacNote}</p>}

      <label className="row xs satview-field" data-testid="satview-field">
        <input type="checkbox" checked={showField} onChange={() => setShowField(!showField)} />
        <span className="grow">{field ? <><span className="ops-swatch" style={{ background: COLOR[field] }} /> {FIELD_LABEL[field]}</> : "Campo sulla mappa"}</span></label>
    </section>);
}

/** The ISS: NASA's official playlist "Live Video from the International Space Station", started by the person only.
 *  LIVE VIDEO only when the player itself reports a live stream that is playing; otherwise said as what it is. */
function NasaIss({ playlist, onStop }: { playlist: string; onStop: () => void }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [st, setSt] = useState<{ playing: boolean; live: boolean | null; off: boolean; title?: string }>({ playing: false, live: null, off: false });
  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(ev.origin) || ev.source !== frame.current?.contentWindow) return;
      let d: any;
      try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch { return; }
      if (d?.event === "onError") setSt((x) => ({ ...x, off: true }));
      const i = d?.info;
      if (!i || typeof i !== "object") { if (d?.event === "onStateChange" && d.info === 1) setSt((x) => ({ ...x, playing: true })); return; }
      setSt((x) => ({ ...x,
        playing: i.playerState != null ? i.playerState === 1 || (x.playing && i.playerState === 3) : x.playing,
        live: typeof i.videoData?.isLive === "boolean" ? i.videoData.isLive : x.live,
        title: i.videoData?.title || x.title }));
    };
    addEventListener("message", on);
    const hello = window.setInterval(() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "iss", channel: "widget" }), "*"), 1000);
    const t = window.setTimeout(() => setSt((x) => (x.playing ? x : { ...x, off: true })), 25_000);
    return () => { removeEventListener("message", on); window.clearInterval(hello); window.clearTimeout(t); };
  }, [playlist]);
  const q = `listType=playlist&list=${encodeURIComponent(playlist)}&autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  const cls: SatClass | null = st.off && !st.playing ? "none" : st.playing && st.live === true ? "live" : st.playing && st.live === false ? "historical" : null;
  return (
    <figure className="media-fig live ops-yt" data-testid="satview-video" data-class={cls ?? "pending"}>
      <iframe ref={frame} src={`https://www.youtube-nocookie.com/embed/videoseries?${q}`} title="NASA · Live Video from the International Space Station"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      <figcaption className="xs" data-testid="satview-video-state">
        {cls === "live" ? <b className="sat-class live">● {CLASS_LABEL.live}</b>
          : cls === "historical" ? <b className="sat-class historical">{CLASS_LABEL.historical} · video registrato, non in diretta</b>
          : cls === "none" ? <b className="sat-class none">{CLASS_LABEL.none} · la NASA non trasmette ora</b>
          : <span className="dim">{st.playing ? "In riproduzione · diretta non confermata dal lettore" : "collegamento alla playlist NASA…"}</span>}
        {st.title && <span className="dim"> · «{st.title}»</span>}
        <br /><span className="faint">{T.issSource}</span>
        {" "}<button type="button" className="xs" data-testid="satview-video-stop" onClick={onStop}>Ferma</button></figcaption>
    </figure>);
}
