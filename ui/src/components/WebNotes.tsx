// Online workspace only (web build): published snapshot and its age (O14), a newer published snapshot (reload),
// where the trail lives and whether the browser keeps it (E6). The local build renders none of this.

import { useEffect, useState } from "react";
import { SNAPSHOT } from "../lib/api";
import * as web from "@nexum/web";
import { S } from "../lib/strings";

type Info = { version: string; built_utc: string };

function useSnapshot(): { info: Info | null; newer: Info | null; age: string } {
  const [info, setInfo] = useState<Info | null>(null);
  const [newer, setNewer] = useState<Info | null>(null);
  const [age, setAge] = useState("");
  useEffect(() => {
    if (!SNAPSHOT) return;
    let off = () => {};
    let alive = true;
    off = web.onSnapshot((i, n) => { if (alive) { setInfo(i); setNewer(n); setAge(web.ageText(i.built_utc)); } });
    const t = setInterval(() => setInfo((i) => (i ? { ...i } : i)), 60_000);
    return () => { alive = false; off(); clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!SNAPSHOT || !info) return;
    setAge(web.ageText(info.built_utc));
  }, [info]);
  return { info, newer, age };
}

const utcMinute = (iso: string) => iso.replace("T", " ").slice(0, 16);

/** Snapshot identity and age (status bar on desktop and tablet, map attribution line on phone). */
export function SnapshotAge({ compact = false }: { compact?: boolean }) {
  const { info, age } = useSnapshot();
  if (!SNAPSHOT || !info) return null;
  return (
    <span className="mono" data-testid="snapshot-age" data-version={info.version} title={`${S.web.snapshot} ${info.version}`}>
      {compact ? `${S.web.snapshot} · ${age}` : `${S.web.snapshot} · ${S.web.builtAt(utcMinute(info.built_utc), age)}`}
    </span>
  );
}

/** A newer snapshot was published: the session keeps its own version (never mixed) and offers a reload. */
export function NewSnapshotBanner() {
  const { newer } = useSnapshot();
  if (!SNAPSHOT || !newer) return null;
  return (
    <div className="web-banner" role="status" data-testid="snapshot-newer">
      {S.web.newer} <button type="button" onClick={() => location.reload()}>{S.web.reload}</button>
    </div>
  );
}

/** Where the trail lives online (E6): this browser only; persistence as granted by the browser; Safari's 7-day rule. */
export function TrailWebNote({ persisted }: { persisted: boolean | null }) {
  const [safari, setSafari] = useState(false);
  useEffect(() => {
    if (SNAPSHOT) setSafari(web.safariEviction());
  }, []);
  const [noteShown, showNote] = useState(false);
  if (!SNAPSHOT) return null;
  const text = [S.web.trailLocal, persisted === true ? S.web.persisted : persisted === false ? S.web.notPersisted : "",
    safari ? S.web.safari7 : ""].filter(Boolean).join(" ");
  return (
    <>
      <button type="button" className="web-note" data-testid="trail-web-note" data-persisted={String(persisted)}
        aria-label={text} title={text} aria-expanded={noteShown} onClick={() => showNote(!noteShown)}>ⓘ</button>
      {noteShown && <div className="web-pop" role="note" data-testid="trail-web-text" onClick={() => showNote(false)}>{text}</div>}
    </>
  );
}

export async function requestPersist(): Promise<boolean | null> {
  if (!SNAPSHOT) return null;
  return web.requestPersist();
}
