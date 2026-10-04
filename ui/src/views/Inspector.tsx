import { useRef } from "react";
import { S } from "../lib/strings";
import { isSheet, isTouch } from "../lib/layers";
import { store, useStore } from "../store";
import { ObjectMode } from "./ObjectMode";
import { WhyView } from "./WhyView";
import { WorldSummary } from "./WorldSummary";

// Desktop: the inspector column (Phase 2). Touch: THE FOCUS CARD — a bottom sheet under 700 px (name line · first
// connections · everything), a side panel from 700 px; same content, same order, same behaviour.
export function Inspector() {
  const panel = useStore((s) => s.panel);
  const focus = useStore((s) => s.focus);
  const whyId = useStore((s) => s.whyId);
  const sheet = useStore((s) => s.sheet);
  const touch = isTouch(), asSheet = isSheet();
  const body = panel === "why" && whyId ? <WhyView id={whyId} /> : focus ? <ObjectMode id={focus} /> : (
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
      {body}
      {asSheet && focus && sheet === "peek" && panel !== "why" && (
        <button type="button" className="sheet-more" data-testid="sheet-more" onClick={() => store.set({ sheet: "full" })}>
          {S.m.openAll} ▴</button>)}
    </aside>
  );
}

/** Drag or tap: mini ⇄ peek ⇄ full. The name line (mini) never disappears while there is a focus. */
function SheetHandle() {
  const start = useRef<{ y: number; id: number } | null>(null);
  const focus = useStore((s) => s.focus);
  const sheet = useStore((s) => s.sheet);
  const order = ["mini", "peek", "full"] as const;
  const step = (d: 1 | -1) => {
    const i = order.indexOf(store.get().sheet);
    const next = order[Math.max(0, Math.min(2, i + d))];
    store.set({ sheet: next, ...(next !== "full" && store.get().panel === "why" ? { panel: focus ? "object" : "world", whyId: null } : {}) });
  };
  return (
    <div className="sheet-handle" data-testid="sheet-handle" role="button" tabIndex={0} aria-label={S.m.sheetHandle}
      aria-expanded={sheet === "full"}
      onPointerDown={(e) => { start.current = { y: e.clientY, id: e.pointerId }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dy = e.clientY - s.y;
        if (dy < -30) step(1);
        else if (dy > 30) step(-1);
        else step(sheet === "full" ? -1 : 1);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(sheet === "full" ? -1 : 1); } }}>
      <span className="grip" aria-hidden />
    </div>
  );
}
