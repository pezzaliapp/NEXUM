// Layers of the touch layouts (< 1120 px), from the top: an overlay (Filtri, menu, Percorso, Cerca, info), the
// explanation "Perché?" inside the focus card, the focus card opened in full. One gesture closes the topmost:
// a tap on the scrim, the system Back button (Android) or Esc. Desktop keeps Esc (Phase 2).
// Under the layers, the screens (2026-10-10, first use on a phone): the element's card and the ones before it, the
// surface. ← in the top bar, the browser's Back and the iOS swipe all do the same: the topmost layer, then the screen
// before; only at the start (the map, nothing in focus) Back belongs to the browser.
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
const watchers = new Set<() => void>();
/** Called when a layer of its own opens or closes (the top bar's ← follows it). */
export function subscribeLayers(l: () => void) { watchers.add(l); return () => { watchers.delete(l); }; }
/** A layer of its own (the map's tools): Back and Esc close it first; `changed()` must be called when it opens or closes. */
export function registerLayer(l: { open: () => boolean; close: () => void }) {
  extra.unshift(l);   // the newest is on top
  return { changed: () => { resync?.(); watchers.forEach((w) => w()); }, off: () => { const i = extra.indexOf(l); if (i >= 0) extra.splice(i, 1); } };
}

export function hasLayer(): boolean {
  const s = store.get();
  return extra.some((l) => l.open()) || !!s.overlay || (s.panel === "why" && !!s.whyId) || (isSheet() && s.sheet === "full");
}

/** Something to go back to: a layer, an element's card (and the ones before it), a surface other than the map. */
export const canGoBack = () => hasLayer() || store.canUp();
/** Indietro: the topmost layer, otherwise the screen before; false at the start. */
export const goBack = () => dismissTop() || store.up();

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

/** The system Back button (and the iOS swipe) goes back inside NEXUM: one history entry stands for "there is somewhere to
 *  go back to", so Back never leaves the page while a card, a layer or another surface is open. */
export function installBackHandling() {
  let pushed = false;
  let ignore = 0;
  const sync = () => {
    if (!isTouch()) return;
    const open = canGoBack();
    if (open && !pushed) { history.pushState({ nexumLayer: 1 }, "", location.href); pushed = true; }
    else if (!open && pushed) { pushed = false; ignore++; history.back(); }
  };
  const onPop = () => {
    if (ignore) { ignore--; afterPop(); return; }
    if (!pushed) {
      // one of our entries reached with nothing of ours above it: Forward onto a card closed by Back (the card named by
      // the address opens again), or an entry left by a reload (nothing to show: the browser goes on, no dead Back)
      pushed = true;
      const m = location.hash.match(/#\/f\/((?:obj|evt|rel|ins)_[a-z0-9]+)/);
      if (m && m[1] !== store.get().focus) store.select(m[1], "url");
      afterPop();
      return;
    }
    pushed = false;
    goBack();
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
