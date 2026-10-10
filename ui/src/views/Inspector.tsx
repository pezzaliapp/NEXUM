import { lazyStale } from "../lib/stale";
import { Suspense } from "react";
import { S } from "../lib/strings";
import { dismissTop, isSheet, isTouch } from "../lib/layers";
import { store, useStore } from "../store";
import { WorldSummary } from "./WorldSummary";
import { sheetDrag, sheetRoom } from "../lib/sheetdrag";

// the element's card and its explanation are their own download (2026-10-04): the opening world view never pays for
// them (O6); they are fetched at the person's first gesture (press, touch or key), before any element can be chosen
const loadObject = () => import("./ObjectMode");
const loadWhy = () => import("./WhyView");
const ObjectMode = lazyStale(() => loadObject().then((m) => ({ default: m.ObjectMode })));
const WhyView = lazyStale(() => loadWhy().then((m) => ({ default: m.WhyView })));
if (typeof window !== "undefined") {
  const warm = () => { loadObject().catch(() => {}); loadWhy().catch(() => {}); for (const ev of ["pointerdown", "touchstart", "keydown"]) removeEventListener(ev, warm, true); };
  for (const ev of ["pointerdown", "touchstart", "keydown"]) addEventListener(ev, warm, { capture: true, passive: true });   // an intent, not a passing cursor
}

// Desktop: the inspector column (Phase 2). Touch: THE FOCUS CARD — a bottom sheet under 700 px (name line · first
// connections · everything), a side panel from 700 px; same content, same order, same behaviour.
export function Inspector() {
  const panel = useStore((s) => s.panel);
  const focus = useStore((s) => s.focus);
  const whyId = useStore((s) => s.whyId);
  const sheet = useStore((s) => s.sheet);
  const touch = isTouch(), asSheet = isSheet();
  const body = panel === "why" && whyId ? <Suspense fallback={<p className="note" style={{ padding: 12 }}>{S.loading}</p>}><WhyView id={whyId} /></Suspense>
    : focus ? <Suspense fallback={<p className="note" style={{ padding: 12 }}>{S.loading}</p>}><ObjectMode id={focus} /></Suspense> : (
    <>
      <div className="phead"><h2>{S.worldSummary}</h2><span className="grow" />
        <button type="button" className="tab-only" onClick={() => store.set({ inspectorOpen: false, sheet: "peek" })}>{S.closePanel}</button></div>
      <WorldSummary />
    </>
  );
  return (
    <aside className="insp" aria-label="inspector" data-testid="inspector" data-panel={panel}
      data-sheet={touch ? (asSheet ? sheet : "side") : undefined}>
      {asSheet && <SheetHandle />}
      {asSheet && <button type="button" className="sheet-close" aria-label={S.m.close} title={S.m.close} data-testid="sheet-close"
        onClick={() => (panel === "why" && whyId ? dismissTop() : focus ? store.closeCard() : store.set({ inspectorOpen: false, sheet: "peek" }))}>×</button>}
      {body}
      {asSheet && focus && sheet === "peek" && panel !== "why" && (
        <button type="button" className="sheet-more" data-testid="sheet-more" onClick={() => store.set({ sheet: "full" })}>
          {S.m.openAll} ▴</button>)}
    </aside>
  );
}

/** Drag or tap: mini ⇄ peek ⇄ full. The name line (mini) never disappears while there is a focus. */
function SheetHandle() {
  const focus = useStore((s) => s.focus);
  const sheet = useStore((s) => s.sheet);
  const order = ["mini", "peek", "full"] as const;
  const go = (next: (typeof order)[number]) =>
    store.set({ sheet: next, ...(next !== "full" && store.get().panel === "why" ? { panel: focus ? "object" : "world", whyId: null } : {}) });
  const step = (d: 1 | -1) => go(order[Math.max(0, Math.min(2, order.indexOf(store.get().sheet) + d))]);
  // the card follows the finger and settles on the nearest height: name line · half (the map above) · whole screen
  const drag = sheetDrag(() => document.querySelector<HTMLElement>(".touch.as-sheet .insp"),
    () => [{ name: "mini", px: 96 }, { name: "peek", px: Math.min(420, Math.max(250, innerHeight * 0.52)) }, { name: "full", px: sheetRoom() }],
    () => store.get().sheet, (n) => go(n as (typeof order)[number]), () => step(store.get().sheet === "full" ? -1 : 1));
  return (
    <div className="sheet-handle" data-testid="sheet-handle" role="button" tabIndex={0} aria-label={S.m.sheetHandle}
      aria-expanded={sheet === "full"} {...drag}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(sheet === "full" ? -1 : 1); } }}>
      <span className="grip" aria-hidden />
    </div>
  );
}
