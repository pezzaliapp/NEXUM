// AUTOMATIC UPDATE (2026-10-06, master pass): every deploy becomes the running version without the person doing
// anything technical. The build's id is compiled in (__NEXUM_BUILD__) and published as /version.json (never cached).
// It is checked when the app comes back to the screen (an installed app on iOS resumes instead of reloading), on focus,
// when the network returns and every 5 minutes. A newer build is applied at a safe moment: at once when the app was off
// screen, otherwise after 30 s without touch or typing while no tool is drawing or picking. The reload keeps the view
// (focus, camera, base map, projection in the address; layers, trail, shapes in the browser's storage). A chunk of the old
// build that is gone from the host (after a deploy) triggers the same update instead of a broken panel. Loop guard: one
// reload per new build every 2 minutes. The service worker (/sw.js) keeps the app usable offline and never pins an old
// version: pages are network-first, and the new worker takes over at once.
const BUILD = __NEXUM_BUILD__;
const KEY = "nexum.update";
// VISIBLE UPDATE (2026-10-06, physical test): the state the page shows — a newer build announced (with AGGIORNA ORA),
// a reload already tried for it (the host still serves the old one), the build this page was updated from
export interface UpdateState { running: string; pending: string | null; retrying: boolean; justUpdated: string | null; needed: boolean }
let ust: UpdateState = { running: BUILD, pending: null, retrying: false, justUpdated: null, needed: false };
const usubs = new Set<() => void>();
const uset = (p: Partial<UpdateState>) => { ust = { ...ust, ...p }; usubs.forEach((f) => f()); };
export const updateState = { get: () => ust, subscribe(f: () => void) { usubs.add(f); return () => { usubs.delete(f); }; }, dismiss: () => uset({ justUpdated: null }),
  /** A part the person opened could not load (its code is gone from the host): only then the notice says so. */
  needed() { if (!pending) { pending = "nuova"; w.__nexum.updatePending = pending; } uset({ pending, needed: true }); check(); } };
const tried = (target: string) => { try { const g = JSON.parse(sessionStorage.getItem(KEY) ?? "null"); return !!g && g.to === target && Date.now() - g.t < 120_000; } catch { return false; } };
let pending: string | null = null, lastInput = Date.now(), wasHidden = false;
const w = window as any;

function busy() {
  const a = document.activeElement as HTMLElement | null;
  return !!(w.__nexumDrawing || w.__nexumPicking || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || document.querySelector("video, iframe"));   // watching something
}
/** The view in the address, so the reloaded page opens where the person was (read by the permalink code). */
function keepView() {
  const m = w.__nexum?.map, o = w.__nexum?.ops?.get?.();
  if (!m) return;
  const c = m.getCenter(), f = location.hash.match(/^#\/f\/[^&]*/)?.[0];
  const v = [`v=${c.lng.toFixed(4)},${c.lat.toFixed(4)},${m.getZoom().toFixed(2)}`, ...(o ? [`b=${o.base}`, `p=${o.projection}`] : [])].join("&");
  history.replaceState(history.state, "", f ? `${f}&${v}` : `#${v}`);
}
/** The new build REACHABLE before switching to it: the host may serve the new page a moment before its script (after a
 *  deploy); a page whose script cannot load never starts. Checked on the page and in the service worker. */
async function newReady(): Promise<boolean> {
  try {
    const html = await (await fetch("/", { cache: "no-store" })).text();
    const entry = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    if (!entry) return true;
    return (await fetch(entry)).ok;
  } catch { return false; }
}
let retryTimer = 0;
/** Not reachable yet: stay on the working build, say so, try again by itself. */
function notYet(retry: () => void) {
  w.__nexumUpdating = false;
  uset({ retrying: true });
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(retry, 15_000);
}
/** The new worker installed and active BEFORE the page reloads (never a worker taking over in the middle of a start). */
async function settleWorker() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return;
    await reg.update().catch(() => {});
    const t0 = Date.now();
    while ((reg.installing || reg.waiting) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 150));
  } catch { /* no worker: the page itself is never cached */ }
}
function apply(target: string) {
  try {
    const g = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (g && g.to === target && Date.now() - g.t < 120_000) return;      // already tried for this build: no loop
    sessionStorage.setItem(KEY, JSON.stringify({ to: target, from: BUILD, t: Date.now() }));
  } catch { /* storage off: the 2-minute guard below still holds for this page */ }
  if (w.__nexumUpdating) return;
  w.__nexumUpdating = true;
  newReady().then(async (ok) => {
    if (!ok) { try { sessionStorage.removeItem(KEY); } catch { /* ok */ } return notYet(() => apply(target)); }
    keepView();
    await settleWorker();
    location.reload();
  });
}
function maybeApply(resumed = false) {
  if (!pending || pending === BUILD) return;
  if (resumed || document.visibilityState === "hidden") return apply(pending);
  if (!busy() && Date.now() - lastInput > 30_000) apply(pending);
}
async function check(resumed = false) {
  try {
    const r = await fetch("/version.json", { cache: "no-store" });
    if (!r.ok) return;
    const v = await r.json();
    if (v.build && v.build !== BUILD) { pending = v.build; w.__nexum.updatePending = pending; uset({ pending, retrying: tried(v.build) }); }
    maybeApply(resumed);
  } catch { /* offline: next time */ }
}

/** AGGIORNA ORA: the newest worker activated (if any is waiting), the view kept, the page reloaded on the new build. */
export async function applyNow() {
  const target = pending ?? "unknown";
  if (w.__nexumUpdating) return;
  w.__nexumUpdating = true;
  if (!(await newReady())) return notYet(() => applyNow());
  try { sessionStorage.setItem(KEY, JSON.stringify({ to: target, from: BUILD, t: Date.now(), manual: true })); } catch { /* ok */ }
  keepView();
  await settleWorker();
  location.reload();
}

export function installUpdater() {
  if (!__NEXUM_WEB__) return;
  // after an update: say so once (the build this page now runs, and the one before)
  try {
    const g = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (g && g.from && g.from !== BUILD && !g.shown) { uset({ justUpdated: g.from }); sessionStorage.setItem(KEY, JSON.stringify({ ...g, shown: true })); }
  } catch { /* ok */ }
  (w.__nexum ??= {}).build = BUILD;
  try { performance.setResourceTimingBufferSize(2000); } catch { /* ok */ }
  document.documentElement.dataset.build = BUILD;
  for (const e of ["pointerdown", "keydown", "wheel"]) addEventListener(e, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") wasHidden = true;
    else { const r = wasHidden; wasHidden = false; check(r); }
  });
  addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) check(true); });
  addEventListener("online", () => check());
  addEventListener("focus", () => check());
  setInterval(() => (pending ? maybeApply() : check()), 60_000 * 5);
  setInterval(() => maybeApply(), 10_000);
  // a lazy part of the old build is gone from the host: never a reload under the finger — a new version exists (the
  // notice, AGGIORNA ORA; the automatic update at the next safe moment). Most of these are warm-ups the person never asked
  // for: "serve per aprire questa funzione" is said only when a part the person opened cannot show (lib/stale.tsx).
  addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    if (!pending) { pending = "nuova"; w.__nexum.updatePending = pending; }
    uset({ pending });
    check();
  });
  // the service worker, once the world is drawn (it never competes with the first load)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1")) {
    const go = () => navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    if (document.readyState === "complete") setTimeout(go, 4000); else addEventListener("load", () => setTimeout(go, 4000), { once: true });
    // offline: the files this page already loaded before the worker took over go through it once (from the browser's
    // own cache: no new download), so the app and the data seen open without network
    navigator.serviceWorker?.ready.then(() => setTimeout(() => {
      if (!navigator.serviceWorker.controller || sessionStorage.getItem("nexum.warm") === BUILD) return;
      try { sessionStorage.setItem("nexum.warm", BUILD); } catch { /* ok */ }
      for (const e of performance.getEntriesByType("resource")) {
        const u = new URL(e.name);
        if (u.origin === location.origin && /^\/(assets|s)\/|^\/current\.json$/.test(u.pathname)) fetch(u.pathname).catch(() => {});
      }
    }, 1500)).catch(() => {});
    let had = !!navigator.serviceWorker?.controller;
    navigator.serviceWorker?.addEventListener("controllerchange", () => { if (had && pending) maybeApply(); had = true; });
  }
}
