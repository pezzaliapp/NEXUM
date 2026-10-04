// LIVE VIDEO of a public camera (2026-10-04): the publisher's own stream, played by the browser only when the person
// starts it — HLS (native where the browser has it, hls.js otherwise, loaded only now) or MJPEG (an image that keeps
// receiving frames). "In onda" is said only once frames arrive; a stream that does not answer is said as such and the
// camera's current image stays available. Nothing is recorded, copied or relayed.
import { useEffect, useRef, useState } from "react";
import { S } from "../lib/strings";

export default function LivePlayer({ url, type, label, onState }: { url: string; type: string; label: string;
  onState?: (s: "loading" | "playing" | "error") => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"loading" | "playing" | "error">("loading");
  const set = (s: "loading" | "playing" | "error") => { setState(s); onState?.(s); };
  useEffect(() => {
    if (type !== "hls") return;
    const v = video.current;
    if (!v) return;
    let hls: any = null, dead = false;
    const playing = () => set("playing");
    const failed = () => set("error");
    v.addEventListener("playing", playing);
    v.addEventListener("error", failed);
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url;
      v.play().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (dead) return;
        if (!Hls.isSupported()) { failed(); return; }
        hls = new Hls({ lowLatencyMode: false, backBufferLength: 30 });
        hls.on(Hls.Events.ERROR, (_e: any, d: any) => { if (d?.fatal) failed(); });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
      }, failed);
    }
    // a stream that never starts within 25 s is said as not answering
    const t = setTimeout(() => { if (v.readyState < 2) failed(); }, 25_000);
    return () => {
      dead = true; clearTimeout(t);
      v.removeEventListener("playing", playing); v.removeEventListener("error", failed);
      if (hls) hls.destroy();
      v.removeAttribute("src"); v.load();
    };
  }, [url, type]);
  return (
    <figure className="media-fig live" data-testid="live-player" data-state={state} data-stream={type}>
      {type === "hls"
        ? <video ref={video} muted playsInline controls aria-label={label} data-testid="live-video" />
        : <img src={url} alt={label} referrerPolicy="no-referrer" data-testid="live-mjpeg" onLoad={() => set("playing")} onError={() => set("error")} />}
      <figcaption className="xs" data-testid="live-state">
        {state === "playing" ? <b className="live-on">● {S.media.onAir}</b> : state === "error" ? <span className="warn">{S.media.streamDown}</span> : <span className="dim">{S.media.connecting}</span>}
      </figcaption>
    </figure>);
}
