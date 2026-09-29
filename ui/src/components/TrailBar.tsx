// TRAIL — the investigation path. Every focus change is a step {ref, scope}. Saved in the TRAIL DB (D5), separate
// from the world; exported and imported as JSON. Steps whose ref no longer exists are shown as "non più presente".

import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError, call, plain } from "../lib/api";
import { SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";

export function TrailBar() {
  const trail = useStore((s) => s.trail);
  const wv = useStore((s) => s.worldVersion);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [list, setList] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  // detect references that no longer exist (e.g. after a world rebuild)
  useEffect(() => {
    let alive = true;
    const unknown = trail.steps.map((s) => s.ref).filter((id) => !store.entity(id));
    Promise.all(unknown.map((id) => call(`/entities/${id}`, { lod: "refs" }).then((r) => { store.normalize(r.data); return null; },
      (e) => (e instanceof ApiError && e.status === 404 ? id : null)))).then((res) => {
      if (alive) setMissing(new Set(res.filter(Boolean) as string[]));
    });
    return () => { alive = false; };
  }, [trail.id, trail.steps.length, wv]);

  useEffect(() => { stepsRef.current?.querySelector(".current")?.scrollIntoView({ block: "nearest", inline: "nearest" }); },
    [trail.index]);

  const save = async () => {
    const t = store.get().trail;
    await plain(`/trails/${t.id}`, { method: "PUT", body: { name: t.name, steps: t.steps } });
    store.set({ trail: { ...store.get().trail, savedAt: Date.now(), dirty: false } });
    setMsg(S.trailSaved);
    setTimeout(() => setMsg(null), 1500);
  };
  const openList = async () => setList((await plain<any>("/trails")).data.items);
  const load = async (id: string) => { const r = await plain<any>(`/trails/${id}`); store.loadTrail(r.data); setList(null); };
  const exportJson = async () => {
    const t = store.get().trail;
    if (t.dirty || !t.savedAt) await save();
    const doc = await plain<any>(`/trails/${t.id}/export`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" }));
    a.download = `nexum-trail-${t.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = async (f: File) => {
    try {
      const r = await plain<any>("/trails/import", { method: "POST", body: JSON.parse(await f.text()) });
      store.loadTrail(r.data);
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <nav className="trail" aria-label="trail" data-testid="trail">
      <button type="button" onClick={() => store.back()} disabled={trail.index <= 0} title={`${S.trailBack} ([)`} aria-label={S.trailBack}>◂</button>
      <button type="button" onClick={() => store.forward()} disabled={trail.index >= trail.steps.length - 1}
        title={`${S.trailForward} (])`} aria-label={S.trailForward}>▸</button>
      <div className="steps" ref={stepsRef}>
        {!trail.steps.length && <span className="dim">{S.trailEmpty}</span>}
        {trail.steps.map((s, i) => (
          <Fragment key={`${i}-${s.ref}`}>
            {i > 0 && <span className="sep">›</span>}
            <button type="button" className={`step${i === trail.index ? " current" : ""}${missing.has(s.ref) ? " missing" : ""}`}
              data-step={i} data-ref={s.ref} title={missing.has(s.ref) ? `${s.label} — ${S.trailMissing}` : s.label}
              onClick={() => !missing.has(s.ref) && store.go(i)}>
              <span aria-hidden>{SHAPE[s.kind] ?? ""} </span>{store.entity(s.ref)?.label ?? s.label}
            </button>
          </Fragment>
        ))}
      </div>
      {msg && <span className="xs accent">{msg}</span>}
      <button type="button" onClick={save} disabled={!trail.steps.length} data-testid="trail-save"
        title={trail.dirty ? S.trailSave : S.trailSaved}>{S.trailSave}{trail.dirty ? " •" : ""}</button>
      <button type="button" onClick={openList} data-testid="trail-list" title={S.trailList} aria-label={S.trailList}>☰<span className="desk"> {S.trailList}</span></button>
      <button type="button" onClick={exportJson} disabled={!trail.steps.length} data-testid="trail-export" className="desk">{S.trailExport}</button>
      <button type="button" onClick={() => fileRef.current?.click()} className="desk">{S.trailImport}</button>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      {list && (
        <div className="dialog" role="dialog" onClick={() => setList(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="row"><strong>{S.trailList}</strong><span className="grow" />
              <button type="button" onClick={() => { store.newTrail(); setList(null); }}>{S.trailNew}</button>
              <button type="button" onClick={() => setList(null)}>{S.closePanel}</button></div>
            <ul className="list" style={{ marginTop: 8 }}>
              {!list.length && <li className="dim">{S.none}</li>}
              {list.map((t) => (
                <li key={t.trail_id} className="row"><button type="button" className="ref" onClick={() => load(t.trail_id)}>
                  <span className="lbl">{t.name}</span></button><span className="grow" />
                  <span className="xs dim mono">{t.steps} · {new Date(t.updated_ms).toISOString().slice(0, 16).replace("T", " ")}</span></li>))}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}
