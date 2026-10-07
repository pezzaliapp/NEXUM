// THE CAMERA VIEWER (2026-10-06, physical acceptance — OSIRIS's operational experience as golden reference, NEXUM's own
// rules): the camera the person tapped, first and alone —
//   what it shows NOW, at once: the publisher's live video (muted) or its current image, loaded straight from the
//     publisher by this tap (no NEXUM copy, no proxy, no forged headers), refreshed while the viewer is open;
//   its state said exactly: LIVE video ≠ current image ≠ old image ≠ offline ≠ link only — a still is never "LIVE";
//   offline: the last image the publisher still serves, said as not current, with its date;
//   where it is and who runs it; refresh, locate on the map, full screen, the publisher's own page;
// and only after it, clearly apart, OTHER cameras near it with their distance (never mixed with this one).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { call } from "../lib/api";
import { registerLayer } from "../lib/layers";
import { S } from "../lib/strings";
import { store, useStore } from "../store";

const LivePlayer = lazy(() => import("./LivePlayer"));
/** The viewer's words (here, not in the first bundle: the viewer loads only when a camera is opened). */
const C = {
  state: { live_stream: "video in diretta del gestore: collegamento…", live_on: "video in diretta del gestore, adesso", live_down: "la diretta del gestore non risponde ora",
    current_snapshot: "immagine fissa che il gestore aggiorna (non un video)", stale: "immagine vecchia: la camera non mostra la situazione attuale",
    offline: "la camera è fuori servizio: nessuna immagine attuale", external_live: "diretta visibile solo sul sito del gestore",
    dead: "sorgente non più valida", blocked: "la fonte esiste ma non consente di mostrarla altrove", unknown: "stato non verificabile ora" } as Record<string, string>,
  last: "ULTIMA IMMAGINE · non attuale",
  noLast: "Fuori servizio: il gestore non fornisce più nemmeno l'ultima immagine.",
  nothing: "Nessuna immagine o diretta che NEXUM possa mostrare per questa camera.",
  offline: "OFFLINE: la fonte segnala questa camera come non in servizio. Se c'è, l'immagine sopra è l'ultima che il gestore pubblica ancora, non quella di adesso.",
  loadedAt: (t: string) => `immagine chiesta al gestore alle ${t}`,
  loading: "carico l'immagine dal gestore…",
  every: (s: number) => `si aggiorna da sola ogni ${s} s mentre è aperta`,
  observed: (d: string, a: string) => `ultima immagine dichiarata dalla fonte: ${d}${a ? ` (${a})` : ""}`,
  playing: "● IN ONDA: i fotogrammi arrivano adesso dal gestore (audio disattivato)",
  refresh: "Aggiorna", locate: "Sulla mappa", full: "Schermo intero", source: "Apri la fonte originale",
  privacy: "L'immagine o il video arrivano direttamente dal gestore quando apri la camera: NEXUM non li copia, non li registra e non li analizza.",
  nearTitle: "Altre telecamere vicine",
  nearNote: (l: string) => `Non sono «${l}»: altre camere entro ~25 km, con la distanza da questa.`,
  nearNone: "Nessun'altra telecamera entro ~25 km.",
};
const REFRESH_MS = 30_000;                 // a current image, while the viewer is open and visible (never faster)
const NEAR_DEG = 0.25, NEAR_MAX = 6;

const https = (u: unknown): string | null => (typeof u === "string" && /^https:\/\//.test(u) ? u : null);
const fresh = (u: string, t: number) => `${u}${u.includes("?") ? "&" : "?"}nexum_t=${t}`;
const hhmmss = (t: number) => new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function age(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const m = Math.round((Date.now() - t) / 60000);
  return m < 90 ? `${Math.max(0, m)} min fa` : m < 2880 ? `${Math.round(m / 60)} h fa` : `${Math.round(m / 1440)} giorni fa`;
}
const day = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : iso; };

export default function CamViewer({ id, props }: { id: string; props: Record<string, any> }) {
  const e = store.entity(id);
  const avail: string = props.availability ?? "unknown";
  const still = https(props.image_url), page = https(props.page_url), credit = https(props.credit_url) ?? page;
  const stream = avail === "live_stream" && https(props.stream_url) && (props.stream_type === "hls" || props.stream_type === "mjpeg") ? props.stream_url as string : null;
  const showsImage = !!still && props.stream_type !== "mjpeg" && ["current_snapshot", "stale", "offline", "unknown"].includes(avail);
  const [t, setT] = useState(() => Date.now());
  const [img, setImg] = useState<"loading" | "ok" | "error">("loading");
  const [live, setLive] = useState<"loading" | "playing" | "error">("loading");
  const [full, setFull] = useState(false);
  const fig = useRef<HTMLDivElement>(null);
  useEffect(() => { setT(Date.now()); setImg("loading"); setLive("loading"); setFull(false); }, [id]);
  // a current image is reloaded while the viewer is open and the page visible
  useEffect(() => {
    if (avail !== "current_snapshot" || !showsImage) return;
    const tick = window.setInterval(() => { if (document.visibilityState === "visible") { setImg("loading"); setT(Date.now()); } }, REFRESH_MS);
    return () => window.clearInterval(tick);
  }, [id, avail, showsImage]);
  // full screen: the media over everything (every phone, iPhone included); Back, Esc or a tap close it
  useEffect(() => {
    if (!full) return;
    const l = registerLayer({ open: () => true, close: () => setFull(false) });
    l.changed();
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setFull(false); };
    addEventListener("keydown", esc);
    return () => { removeEventListener("keydown", esc); l.off(); l.changed(); };
  }, [full]);
  const locate = () => {
    const m = (window as any).__nexum?.map, p = e?.point;
    if (!m || !p) return;
    m.flyTo({ center: p, zoom: Math.max(m.getZoom(), 14), duration: 900 });
    if (innerWidth < 700) store.set({ sheet: "peek" });
  };
  const offline = avail === "offline" || props.in_service === false;
  const where = [props.subject, props.route, props.place_note].filter(Boolean).join(" · ");
  const observed = props.image_observed_at ? String(props.image_observed_at) : null;

  // LINK ONLY: the publisher does not allow its images elsewhere — said first, the way to its page
  if (avail === "link_only") return (
    <section className="media cam" data-testid="media" data-media-kind="link_only" data-cam={id}>
      <div className="cam-state"><span className="tag link_only" data-testid="media-status">{S.media.status.link_only}</span></div>
      <p className="xs dim" data-testid="cam-where">{[where, props.operator].filter(Boolean).join(" · ")}</p>
      <p className="xs">{props.terms_note ?? S.media.linkNote}</p>
      {page && <a className="primary media-open" data-testid="webcam-link" href={page} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{S.media.linkOpen} ↗</a>}
      <CamActions locate={locate} page={null} />
      <NearCams id={id} />
    </section>);

  const media = stream
    ? <>{live !== "error" || !still ? <Suspense fallback={<p className="xs dim">{S.media.connecting}</p>}>
        <LivePlayer key={t} url={stream} type={props.stream_type} label={e?.label ?? ""} onState={setLive} /></Suspense>
        // the stream down: the camera's current image instead, said as an image (never as live)
        : <img key={t} src={fresh(still, t)} alt={e?.label ?? ""} referrerPolicy="no-referrer" decoding="async" data-testid="media-img" />}</>
    : showsImage
      ? (img === "error"
        ? <p className="note cam-na" data-testid="media-error">{offline ? C.noLast : S.media.error}</p>
        : <img key={t} src={fresh(still!, t)} alt={e?.label ?? ""} referrerPolicy="no-referrer" decoding="async" data-testid="media-img"
            onLoad={() => setImg("ok")} onError={() => setImg("error")} />)
      : <p className="note cam-na" data-testid="media-error">{C.nothing}</p>;
  const state = stream ? (live === "playing" ? "live_on" : live === "error" ? "live_down" : "live_stream") : offline ? "offline" : avail;
  return (
    <section className="media cam" data-testid="media" data-media-kind={stream ? "live_video" : "current_image"} data-cam={id} data-live-state={stream ? live : undefined}>
      <div className="cam-state">
        <span className={`tag ${stream ? "live_stream" : avail}`} data-testid="media-status">{stream ? S.media.status.live_stream : S.media.status[offline ? "offline" : avail] ?? S.media.status.unknown}</span>
        <span className="xs" data-testid="cam-state-text">{C.state[state] ?? C.state.unknown}</span>
      </div>
      <div ref={fig} className={`cam-fig${full ? " full" : ""}`} data-testid="cam-figure" onClick={() => full && setFull(false)}>
        {media}
        {offline && showsImage && img !== "error" && <span className="cam-badge old" data-testid="cam-last">{C.last}</span>}
        {full && <button type="button" className="cam-full-close" aria-label="Chiudi" onClick={() => setFull(false)}>×</button>}
      </div>
      <p className="xs dim cam-time" data-testid="cam-time">
        {stream ? (live === "playing" ? C.playing : live === "error" ? S.media.streamDown : S.media.connecting)
          : showsImage ? <>{img === "ok" ? C.loadedAt(hhmmss(t)) : img === "loading" ? C.loading : ""}
            {avail === "current_snapshot" && img === "ok" ? ` · ${C.every(REFRESH_MS / 1000)}` : ""}</> : null}
        {props.image_refresh_min ? ` · ${S.media.refresh(String(Math.round(Number(props.image_refresh_min))))}` : ""}
        {observed && (offline || avail === "stale") ? <> · <span data-testid="cam-observed">{C.observed(day(observed), age(observed) ?? "")}</span></> : null}</p>
      {offline && <p className="xs warn" data-testid="media-off">{C.offline}</p>}
      {avail === "stale" && <p className="xs warn" data-testid="media-stale">{S.media.stale}</p>}
      <p className="xs dim" data-testid="cam-where">{[where, props.operator].filter(Boolean).join(" · ")}
        {props.credit ? <> · {S.media.credit}: {credit ? <a href={credit} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" data-testid="media-credit-link">{props.credit}</a> : props.credit}</> : null}</p>
      <CamActions locate={locate} page={page ?? credit} refresh={showsImage ? () => { setImg("loading"); setT(Date.now()); } : stream ? () => { setLive("loading"); setT(Date.now()); } : undefined}
        fullscreen={showsImage || stream ? () => setFull(true) : undefined} />
      <p className="xs faint">{C.privacy}</p>
      <NearCams id={id} />
    </section>);
}

function CamActions({ locate, page, refresh, fullscreen }: { locate: () => void; page: string | null; refresh?: () => void; fullscreen?: () => void }) {
  return (
    <div className="cam-actions">
      {refresh && <button type="button" data-testid="media-reload" onClick={refresh}>↻ {C.refresh}</button>}
      <button type="button" data-testid="cam-locate" onClick={locate}>◎ {C.locate}</button>
      {fullscreen && <button type="button" data-testid="cam-full" onClick={fullscreen}>⛶ {C.full}</button>}
      {page && <a href={page} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" data-testid="cam-source">{C.source} ↗</a>}
    </div>);
}

/** OTHER cameras near this one — after it, apart, each with its distance and state (never shown as this camera). */
function NearCams({ id }: { id: string }) {
  const e = store.entity(id);
  const types = useStore((s) => s.types);
  const [near, setNear] = useState<{ id: string; label: string; km: number; av: string }[] | null>(null);
  useEffect(() => {
    setNear(null);
    const p = e?.point, t = e?.type;
    if (!p || !t) return;
    let live = true;
    (async () => {
      const r = await call<any>("/projections/map", { s: { ...store.get().scope, viewport: [p[0] - NEAR_DEG, p[1] - NEAR_DEG, p[0] + NEAR_DEG, p[1] + NEAR_DEG], z: 12, types: [t] },
        b: { max_items: 80, lod: "refs" } }, { channel: `cam-near-${id}` });
      const d = store.normalize(r.data);
      const km = (q: [number, number]) => { const R = 6371, rad = Math.PI / 180, dl = (q[1] - p[1]) * rad, dn = (q[0] - p[0]) * rad;
        const h = Math.sin(dl / 2) ** 2 + Math.cos(p[1] * rad) * Math.cos(q[1] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
      const list = ((d.items ?? []) as any[]).map((x) => store.entity(x.$ref)).filter((x: any) => x?.point && x.id !== id)
        .map((x: any) => ({ id: x.id, label: x.label ?? x.id, km: km(x.point), av: "" })).sort((a, b) => a.km - b.km).slice(0, NEAR_MAX);
      if (!live) return;
      setNear(list);
      // each one's state (its own card, small): asked only for these few
      const avs = await Promise.all(list.map((x) => call<any>(`/entities/${x.id}`, undefined, { channel: `cam-near-av-${x.id}` }).then((r) => r.data?.properties?.availability ?? "", () => "")));
      if (live) setNear(list.map((x, i) => ({ ...x, av: avs[i] })));
    })().catch(() => live && setNear([]));
    return () => { live = false; };
  }, [id, types]);
  if (!near) return null;
  return (
    <div className="cam-near" data-testid="cam-near">
      <div className="conn-h">{C.nearTitle}</div>
      {!near.length ? <p className="xs dim" data-testid="cam-near-none">{C.nearNone}</p> : <>
        <p className="xs dim">{C.nearNote(e?.label ?? "")}</p>
        <ul className="ov-some">{near.map((x) => (
          <li key={x.id} data-testid="cam-near-item" data-ref={x.id} data-availability={x.av}>
            <button type="button" className="linklike" onClick={() => store.select(x.id, "cam-near")}>{x.label}</button>
            <span className="xs dim"> · {x.km < 1 ? `${Math.round(x.km * 1000)} m` : `${x.km.toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`}{x.av ? ` · ${S.media.status[x.av] ?? x.av}` : ""}</span></li>))}</ul></>}
    </div>);
}
