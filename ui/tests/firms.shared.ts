// NASA FIRMS IN THE TESTS (2026-10-21): the browser draws a hotspot as an active fire only within the last 24 hours of
// its clock, and the snapshots of the tests are older than that. For the tests that need a hotspot to click, the
// snapshot's own table is answered with every acquisition time moved by the same amount, so that its newest detection
// is one hour old (same rows, same places, same spacing in time). Routed on the context: the service worker's requests
// are rewritten too.
import type { BrowserContext } from "@playwright/test";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16);

export async function recentHotspots(ctx: BrowserContext) {
  await ctx.route(/\/s\/[^/]+\/api\/tables\/hotspots\.json$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    const t = (x: string) => Date.parse(`${x}:00Z`);
    const newest = Math.max(...body.data.rows.map((r: any[]) => t(r[4])));
    const shift = Date.now() - 3_600_000 - newest;
    body.data.rows = body.data.rows.map((r: any[]) => [...r.slice(0, 4), utc(t(r[4]) + shift), ...r.slice(5)]);
    return route.fulfill({ response: res, json: body });
  });
}
