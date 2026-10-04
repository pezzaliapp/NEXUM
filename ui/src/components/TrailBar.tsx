// TRAIL — the investigation path. Every focus change is a step {ref, scope}. Saved in the TRAIL DB (D5), separate
// from the world; exported and imported as JSON. Steps whose ref no longer exists are shown as "non più presente".

import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError, call, plain } from "../lib/api";
import { SHAPE } from "../lib/palette";
import { S } from "../lib/strings";
import { store, useStore } from "../store";
import { requestPersist, TrailWebNote } from "./WebNotes";

/** Trail state and actions, shared by the desktop trail bar and the touch "Percorso" sheet. */
export function useTrail() {
  const trail = useStore((s) => s.trail);
  const wv = useStore((s) => s.worldVersion);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [list, setList] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);   // online only (E6)
  const fileRef = useRef<HTMLInputElement>(null);

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


  const save = async () => {
    const t = store.get().trail;
    await plain(`/trails/${t.id}`, { method: "PUT", body: { name: t.name, steps: t.steps } });
    store.set({ trail: { ...store.get().trail, savedAt: Date.now(), dirty: false } });
    requestPersist().then(setPersisted, () => {});
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

  return { trail, missing, list, setList, msg, persisted, fileRef, save, openList, load, exportJson, importJson };
}

/** Saved trails (dialog) and the hidden file input for imports. */
function SavedList({ t }: { t: ReturnType<typeof useTrail> }) {
  return (
    <>
      <input ref={t.fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && t.importJson(e.target.files[0])} />
      {t.list && (
        <div className="dialog" role="dialog" onClick={() => t.setList(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="row"><strong>{S.trailList}</strong><span className="grow" />
              <button type="button" onClick={() => { store.newTrail(); t.setList(null); }}>{S.trailNew}</button>
              <button type="button" onClick={() => t.setList(null)}>{S.closePanel}</button></div>
            <ul className="list" style={{ marginTop: 8 }}>
              {!t.list.length && <li className="dim">{S.none}</li>}
              {t.list.map((x) => (
                <li key={x.trail_id} className="row"><button type="button" className="ref" onClick={() => t.load(x.trail_id)}>
                  <span className="lbl">{x.name}</span></button><span className="grow" />
                  <span className="xs dim mono">{x.steps} · {new Date(x.updated_ms).toISOString().slice(0, 16).replace("T", " ")}</span></li>))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export function TrailBar() {
  const t = useTrail();
  const { trail, missing, msg, persisted, save, openList, exportJson, fileRef } = t;
  const stepsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { stepsRef.current?.querySelector(".current")?.scrollIntoView({ block: "nearest", inline: "nearest" }); },
    [trail.index]);
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
      <TrailWebNote persisted={persisted} />
      <button type="button" onClick={save} disabled={!trail.steps.length} data-testid="trail-save"
        title={trail.dirty ? S.trailSave : S.trailSaved}>{S.trailSave}{trail.dirty ? " •" : ""}</button>
      <button type="button" onClick={openList} data-testid="trail-list" title={S.trailList} aria-label={S.trailList}>☰<span className="desk"> {S.trailList}</span></button>
      <button type="button" onClick={exportJson} disabled={!trail.steps.length} data-testid="trail-export" className="desk">{S.trailExport}</button>
      <button type="button" onClick={() => fileRef.current?.click()} className="desk">{S.trailImport}</button>
      <SavedList t={t} />
    </nav>
  );
}

/** Touch layouts: the path with full names (one line each, wrapped, never "…"), and the trail actions. */
export function TrailSheet() {
  const t = useTrail();
  const { trail, missing } = t;
  return (
    <div className="ov-body" data-testid="trail-sheet">
      <div className="ov-h"><span className="grow" />{S.trailSteps(trail.steps.length)}</div>
      {!trail.steps.length && <p className="note">{S.trailEmpty}</p>}
      <ol className="path-list">
        {trail.steps.map((s, i) => (
          <li key={`${i}-${s.ref}`}>
            <button type="button" className={`path-step${i === trail.index ? " current" : ""}${missing.has(s.ref) ? " missing" : ""}`}
              data-step={i} data-ref={s.ref} aria-current={i === trail.index ? "step" : undefined}
              onClick={() => !missing.has(s.ref) && store.go(i)}>
              <span className="path-n mono">{i + 1}</span>
              <span className="path-lbl">{store.entity(s.ref)?.label ?? s.label}{missing.has(s.ref) ? ` — ${S.trailMissing}` : ""}</span>
            </button>
          </li>))}
      </ol>
      <div className="ov-actions">
        <button type="button" className="primary" onClick={t.save} disabled={!trail.steps.length} data-testid="trail-save">
          {S.trailSave}{trail.dirty ? " •" : ""}</button>
        <button type="button" className="primary" onClick={t.openList} data-testid="trail-list">{S.trailList}</button>
        <button type="button" className="primary" onClick={() => store.newTrail()}>{S.trailNew}</button>
        <button type="button" className="primary" onClick={t.exportJson} disabled={!trail.steps.length} data-testid="trail-export">{S.trailExport}</button>
        <button type="button" className="primary" onClick={() => t.fileRef.current?.click()}>{S.trailImport}</button>
        {t.msg && <span className="xs accent">{t.msg}</span>}
        <TrailWebNote persisted={t.persisted} />
      </div>
      <SavedList t={t} />
    </div>
  );
}
