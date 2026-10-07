// NEXUM service worker (generated at build time from scripts/sw-template.js; the build id makes every deploy a new
// worker, so the browser installs it on its next check). Same-origin GET requests only: third-party requests (map
// tiles, cameras, providers) are never touched, stored or seen. Never pins an old version:
//   the page (navigations)     network first; the stored copy only when offline
//   /assets/* (hashed, immutable)  stored on use in one shared store (names never collide; a page still open, or a
//                                  rollback to an earlier deploy, finds its files); the oldest trimmed past a cap
//   /s/<version>/* (snapshot data) stored on use (versioned, immutable), capped
//   /version.json, /sw.js          network only (they are how an update is found)
//   /current.json                  network first (offline: the last one, so the stored snapshot opens)
//   anything else                  network first, stored copy offline
const BUILD = "__BUILD__";
const SHELL = __SHELL__;
const C_PAGE = "nexum-page-" + BUILD, C_ASSETS = "nexum-assets", C_DATA = "nexum-data", C_MISC = "nexum-misc";
const DATA_MAX = 4000, ASSETS_MAX = 800;

self.addEventListener("install", (e) => {
  // this build's page in this build's own page store; its files in the shared store
  e.waitUntil(Promise.all([caches.open(C_ASSETS).then((c) => c.addAll(SHELL.filter((u) => u !== "/"))), caches.open(C_PAGE).then((c) => c.add("/")),
    keepPointer()])
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys())
      if (k.startsWith("nexum-page-") && k !== C_PAGE) await caches.delete(k);
    for (const [name, max] of [[C_DATA, DATA_MAX], [C_ASSETS, ASSETS_MAX]]) {
      const c = await caches.open(name), ks = await c.keys();
      for (const r of ks.slice(0, Math.max(0, ks.length - max))) await c.delete(r);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(req, cache, key) {
  try {
    // by URL: a navigation Request with options is refused by some engines (WebKit), which would serve the stored page
    const res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });
    if (res.ok) (await caches.open(cache)).put(key ?? req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key ?? req);
    if (hit) return hit;
    throw err;
  }
}
// THE PAGE (physical test, 2026-10-06): right after a deploy the host may serve the new page while the new build's
// script still answers 404 for a moment. A page whose script cannot load never starts — so the new page is served only
// once its main script is reachable (and stored); until then the last working page is served (the old build keeps
// working, and says a new version is coming). Offline: the stored page.
/** The pointer to the current data snapshot, always kept (offline, the app needs it to open its data; the data files
 *  themselves are immutable and come from the stores). */
async function keepPointer() {
  try { const r = await fetch("/current.json", { cache: "no-cache" }); if (r.ok) await (await caches.open(C_DATA)).put("/current.json", r); } catch { /* offline: keep the last */ }
}
/** The stored page: this build's own first (never another build's page from the shared stores). */
async function storedPage() { return (await (await caches.open(C_PAGE)).match("/")) || caches.match("/"); }
async function page(req) {
  let res;
  try { res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" }); }
  catch (err) { const hit = await storedPage(); if (hit) return hit; throw err; }
  if (!res.ok) return res;
  const html = await res.clone().text();
  const entry = (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0];
  if (entry) {
    let ok = !!(await caches.match(entry));
    if (!ok) {
      const a = await fetch(entry).catch(() => null);
      ok = !!a && a.ok;
      if (ok) await (await caches.open(C_ASSETS)).put(entry, a);
    }
    if (!ok) { const hit = await storedPage(); if (hit) return hit; }
  }
  await (await caches.open(C_PAGE)).put("/", res.clone());
  keepPointer();
  return res;
}
async function cacheFirst(req, cache) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") (await caches.open(cache)).put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(page(req)); return; }
  const p = url.pathname;
  if (p === "/version.json" || p === "/sw.js") return;
  if (p.startsWith("/assets/") || p.startsWith("/vendor/")) { e.respondWith(cacheFirst(req, C_ASSETS)); return; }
  if (p.startsWith("/s/")) { e.respondWith(cacheFirst(req, C_DATA)); return; }
  if (p === "/current.json") { e.respondWith(networkFirst(req, C_DATA, "/current.json")); return; }
  e.respondWith(networkFirst(req, C_MISC));
});
