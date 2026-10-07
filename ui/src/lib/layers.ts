// Layers of the touch layouts (< 1120 px), from the top: an overlay (Filtri, menu, Percorso, Cerca, info), the
// explanation "Perché?" inside the focus card, the focus card opened in full. One gesture closes the topmost:
// a tap on the scrim, the system Back button (Android) or Esc. Desktop keeps Esc (Phase 2).
import { store } from "../store";

/** The full workspace from this viewport width (CSS px; the same value as the stylesheet's media queries). Below it the
 *  compact layouts. Set by the available viewport, never by the device: a desktop window from 1120 px (e.g. a 1440 px
 *  screen at 125 % browser zoom) keeps the workspace; a Fold open (884, 1104 landscape) and tablets keep the compact one. */
export const DESK_W = 1120;
export const isTouch = () => typeof innerWidth === "number" && innerWidth < DESK_W;
export const isSheet = () => typeof innerWidth === "number" && innerWidth < 700;
/** The four experiences (2026-10-02), not one layout resized:
 *  phone   < 700 px wide (phones in portrait, Fold closed): map first, one compact discovery, the feed in its own sheet
 *  land    700–1119 px wide and < 500 px high (phones in landscape): map first, compact strip; the card at the side
 *  tablet  700–1119 px wide and ≥ 500 px high (Fold open, tablets): map + side panel (the feed at home, then the card)
 *  desk    ≥ 1120 px: the full workspace */
export type Layout = "phone" | "land" | "tablet" | "desk";
export const layoutOf = (): Layout => innerWidth >= DESK_W ? "desk" : innerWidth < 700 ? "phone" : innerHeight < 500 ? "land" : "tablet";

// layers that live outside the workspace store (the map's tools sheet, 2026-10-05): one open at a time, topmost
const extra: { open: () => boolean; close: () => void }[] = [];
let resync: (() => void) | null = null;
/** A layer of its own (the map's tools): Back and Esc close it first; `changed()` must be called when it opens or closes. */
export function registerLayer(l: { open: () => boolean; close: () => void }) {
  extra.unshift(l);   // the newest is on top
  return { changed: () => resync?.(), off: () => { const i = extra.indexOf(l); if (i >= 0) extra.splice(i, 1); } };
}

export function hasLayer(): boolean {
  const s = store.get();
  return extra.some((l) => l.open()) || !!s.overlay || (s.panel === "why" && !!s.whyId) || (isSheet() && s.sheet === "full");
}

/** Close the topmost layer; false when there is none. */
export function dismissTop(): boolean {
  const top = extra.find((l) => l.open());
  if (top) { top.close(); return true; }
  const s = store.get();
  if (s.overlay) { store.set({ overlay: null, railOpen: false }); return true; }
  if (s.panel === "why" && s.whyId) { store.set({ panel: s.focus ? "object" : "world", whyId: null, sheet: "peek" }); return true; }
  if (isSheet() && s.sheet === "full") { store.set({ sheet: "peek" }); return true; }
  return false;
}

export function openOverlay(o: NonNullable<ReturnType<typeof store.get>["overlay"]>) {
  const cur = store.get().overlay;
  store.set({ overlay: cur === o ? null : o, railOpen: cur !== o && o === "filters" });
}

/** The system Back button closes the topmost layer: one history entry stands for "a layer is open". */
export function installBackHandling() {
  let pushed = false;
  let ignore = 0;
  const sync = () => {
    if (!isTouch()) return;
    const open = hasLayer();
    if (open && !pushed) { history.pushState({ nexumLayer: 1 }, "", location.href); pushed = true; }
    else if (!open && pushed) { pushed = false; ignore++; history.back(); }
  };
  const onPop = () => {
    if (ignore) { ignore--; afterPop(); return; }
    if (!pushed) return;
    pushed = false;
    dismissTop();
    afterPop();
  };
  // the page URL names the current focus (#/f/<id>): going back over our entry must not restore an older one
  const afterPop = () => {
    const f = store.get().focus;
    history.replaceState(null, "", f ? `#/f/${f}` : location.pathname);
    queueMicrotask(sync);
  };
  addEventListener("popstate", onPop);
  const off = store.subscribe(sync);
  resync = sync;
  return () => { removeEventListener("popstate", onPop); off(); resync = null; };
}
