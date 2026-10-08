// ONE REQUEST A SECOND PER PROVIDER, FOR THE WHOLE APP (2026-10-07, Wave 1). The community services NEXUM asks on the
// person's request (FOSSGIS routing, Photon) allow at most one request a second from an application — not from each tab.
// The turn is shared by every NEXUM tab of this browser: a Web Lock per provider orders the requests, the time of the
// last one is kept in localStorage. Without Web Locks or storage (private windows, old browsers) the pace still holds
// within the tab.

const GAP = 1100;
const local = new Map<string, number>();
const key = (host: string) => `nexum.pace.${host}`;
const lastOf = (host: string) => {
  let t = local.get(host) ?? 0;
  try { t = Math.max(t, Number(localStorage.getItem(key(host))) || 0); } catch { /* storage unavailable */ }
  return t;
};
const mark = (host: string, t: number) => {
  local.set(host, t);
  try { localStorage.setItem(key(host), String(t)); } catch { /* storage unavailable */ }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const queue = new Map<string, Promise<void>>();

/** Wait for this provider's turn (one request a second across the app), then take it. */
export async function polite(host: string): Promise<void> {
  const take = async () => {
    const wait = lastOf(host) + GAP - Date.now();
    if (wait > 0) await sleep(Math.min(wait, GAP));
    mark(host, Date.now());
  };
  const locks = (globalThis.navigator as any)?.locks;
  if (locks?.request) {
    try { await locks.request(`nexum-pace-${host}`, take); return; } catch { /* lock refused: the tab's own pace */ }
  }
  // within the tab: queue behind the previous request of this provider
  const prev = queue.get(host) ?? Promise.resolve();
  const next = prev.then(take);
  queue.set(host, next.catch(() => {}));
  await next;
}
// the running pace, for the end-to-end check across tabs
if (typeof window !== "undefined") ((window as any).__nexum ??= {}).polite = polite;
