// NAVIGATION, DRIVEN BY A SIMULATED GPS (2026-10-08, technical acceptance before the author's road test). The device's
// position is a scripted fake (navigator.geolocation replaced before the app loads): fixes with their accuracy along
// the real route (Parma → Reggio Emilia, as the routing service draws it), a stop with jitter, a detour, a loss of
// signal and its recovery, a start away from the route. Checked: the GPS state and accuracy shown; the next manoeuvre
// always ahead (never one already passed) and spoken once, in the route's order, in Italian; no reroute while on the
// route (also on long straight segments); one reroute when off it, from the device's position; the signal lost said and
// waited out; Ferma ends voice, position and reroutes, keeping the route; no request and no growth while stopped.
// Not a road test: the author's own test on the road stays open.
import { expect, type Page } from "@playwright/test";


const FAKE = () => {
  const G: any = ((window as any).__gps = { watchers: new Map(), id: 0, last: null, cleared: 0, spoken: [] as [number, string][], cancels: 0, locks: 0, released: 0 });
  G.push = (lat: number, lng: number, acc = 8) => {
    const p = { coords: { latitude: lat, longitude: lng, accuracy: acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    G.last = p; for (const w of G.watchers.values()) w.ok(p);
  };
  G.error = (code: number) => { for (const w of G.watchers.values()) w.err?.({ code, message: "simulated" }); };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition(ok: any, err: any) { const id = ++G.id; G.watchers.set(id, { ok, err }); if (G.last) setTimeout(() => ok(G.last), 30); return id; },
    clearWatch(id: number) { if (G.watchers.delete(id)) G.cleared++; },
    getCurrentPosition(ok: any) { if (G.last) ok(G.last); },
  } });
  const sp = speechSynthesis.speak.bind(speechSynthesis), cancel = speechSynthesis.cancel.bind(speechSynthesis);
  speechSynthesis.speak = (u: SpeechSynthesisUtterance) => { G.spoken.push([Date.now(), u.text]); try { sp(u); } catch { /* no voice */ } };
  speechSynthesis.cancel = () => { G.cancels++; try { cancel(); } catch { /* none */ } };
  const wl = (navigator as any).wakeLock;
  if (wl?.request) { const req = wl.request.bind(wl); wl.request = async (t: string) => { const s = await req(t); G.locks++; s.addEventListener("release", () => G.released++); return s; }; }
};

/** Points every `step` metres along a polyline [lng, lat][]. */
export function along(line: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [line[0]];
  const m = (a: [number, number], b: [number, number]) => { const k = Math.cos((a[1] * Math.PI) / 180) * 111320;
    return Math.hypot((b[0] - a[0]) * k, (b[1] - a[1]) * 110540); };
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], L = m(a, b);
    let t = step - carry;
    while (t <= L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    carry = L - (t - step);
  }
  return out;
}
export async function setup(page: Page, from = "Parma", to = "Reggio Emilia") {
  await page.addInitScript(FAKE);
  const routing: number[] = [];
  page.on("request", (r) => { if (/openstreetmap\.de\//.test(r.url())) routing.push(Date.now()); });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__nexum.ops.set({ tool: "route" }));
  for (const [id, q] of [["ops-route-from", from], ["ops-route-to", to]]) {
    await page.getByTestId(id).fill(q);
    await page.locator(".ops-sugg button").first().click({ timeout: 40_000 });
  }
  await page.getByTestId("ops-route-go").click();
  await expect(page.getByTestId("ops-route-result")).toBeVisible({ timeout: 60_000 });
  const line: [number, number][] = await page.evaluate(() => (window as any).__nexum.map.getSource("ops-route").serialize().data.geometry.coordinates);
  const steps: string[] = (await page.getByTestId("ops-route-steps").locator("li button").allTextContents()).map((s) => s.trim());
  return { routing, errors, line, steps };
}
export const gps = (page: Page) => page.evaluate(() => { const G = (window as any).__gps; return { watchers: G.watchers.size, spoken: G.spoken.map((x: any) => x[1]), cancels: G.cancels, locks: G.locks, released: G.released }; });
export const push = (page: Page, p: [number, number], acc = 8) => page.evaluate(({ p, acc }) => (window as any).__gps.push(p[1], p[0], acc), { p, acc });


/** The full scenario on one page: drive, stop, signal lost and back, detour, Ferma. */
export async function driveScenario(page: Page) {
    const { routing, errors, line, steps } = await setup(page);
    expect(steps.length).toBeGreaterThan(3);
    const track = along(line, 25);   // 25 m apart: a fix a second at 90 km/h, interpolated between the shape's vertices
    await push(page, track[0], 6);
    await page.getByTestId("ops-nav-toggle").click();
    await expect(page.getByTestId("ops-nav-gps")).toHaveAttribute("data-gps", "fix", { timeout: 10_000 });
    await expect(page.getByTestId("ops-nav-gps")).toContainText("±6 m");
    const r0 = routing.length;
    // DRIVE the first 6 km of the route: the manoeuvre shown (its index in the route) and each one spoken
    const seen: number[] = [], saidAt: number[] = [];
    const n = Math.min(track.length, 240);
    // the departure, said at the first fix
    await expect.poll(() => page.evaluate(() => (window as any).__gps.spoken.length), { timeout: 10_000 }).toBeGreaterThan(0);
    let spokenN = await page.evaluate(() => (window as any).__gps.spoken.length);
    for (let k = 0; k < spokenN; k++) saidAt.push(0);
    for (let i = 1; i < n; i++) {
      await push(page, track[i], 8);
      await page.waitForTimeout(60);
      const s = await page.evaluate(() => { const e = document.querySelector('[data-testid="ops-nav"]'); return { step: Number(e?.getAttribute("data-step") ?? -1), said: (window as any).__gps.spoken.length }; });
      if (s.step >= 0 && seen[seen.length - 1] !== s.step) seen.push(s.step);
      if (s.said > spokenN) { for (let k = spokenN; k < s.said; k++) saidAt.push(s.step); spokenN = s.said; }
    }
    await page.waitForTimeout(400);
    const drive = await gps(page);
    expect(routing.length - r0, "no reroute while on the route").toBe(0);
    expect(drive.spoken.filter((t: string) => /Ricalcolo/.test(t)), "no 'Ricalcolo' on the route").toEqual([]);
    // the manoeuvre shown always ahead: never back to one already passed
    for (let k = 1; k < seen.length; k++) expect(seen[k], `shown in order: ${JSON.stringify(seen)}`).toBeGreaterThan(seen[k - 1]);
    // each manoeuvre spoken at most once, in the route's order, in Italian form
    for (let k = 1; k < saidAt.length; k++) expect(saidAt[k], `spoken once each, in order: ${JSON.stringify(saidAt)} ${JSON.stringify(drive.spoken)}`).toBeGreaterThan(saidAt[k - 1]);
    expect(drive.spoken.length, "instructions spoken while driving").toBeGreaterThan(3);
    expect(saidAt[0], "the departure said first").toBe(0);
    for (const [k, t] of drive.spoken.entries()) {
      if (k > 0) expect(t, "a manoeuvre ahead said with its distance").toMatch(/^Tra \d+ metri, /);
      expect(steps[saidAt[k]], `spoken text = the step's own instruction (${t})`).toContain(t.replace(/^Tra \d+ metri, /, "").replace(/\.$/, ""));
    }
    // STOP for 20 s at the same place (jitter ±5 m): nothing new said, no request
    const here = track[n - 1], spoken0 = drive.spoken.length, r1 = routing.length;
    for (let i = 0; i < 20; i++) { await push(page, [here[0] + ((i % 3) - 1) * 5e-5, here[1] + ((i % 2) * 2 - 1) * 4e-5], 12); await page.waitForTimeout(1000); }
    const stop = await gps(page);
    expect(stop.spoken.length, "nothing new said while stopped").toBe(spoken0);
    expect(routing.length, "no request while stopped").toBe(r1);
    // SIGNAL LOST (timeout, then unavailable) for 15 s: said, the navigation waits; BACK: shown again
    await page.evaluate(() => (window as any).__gps.error(3));
    await expect(page.getByTestId("ops-nav-gps")).toHaveAttribute("data-gps", "weak");
    await page.waitForTimeout(8000);
    await page.evaluate(() => (window as any).__gps.error(2));
    await page.waitForTimeout(7000);
    await expect(page.getByTestId("ops-nav-toggle")).toContainText("Ferma");
    expect((await gps(page)).watchers, "still watching for the signal").toBe(1);
    expect(routing.length, "no request while the signal is lost").toBe(r1);
    await push(page, here, 9);
    await expect(page.getByTestId("ops-nav-gps")).toHaveAttribute("data-gps", "fix");
    // DETOUR: 400 m off the route for 12 s → one reroute from the device's position
    const r2 = routing.length;
    for (let i = 0; i < 12; i++) { await push(page, [here[0] + 0.005, here[1] + 0.0004 * i], 8); await page.waitForTimeout(1000); }
    await expect.poll(() => routing.length - r2, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(3000);
    const det = await gps(page);
    expect(det.spoken.filter((t: string) => /Ricalcolo/.test(t)).length, "one 'Ricalcolo del percorso'").toBe(1);
    await expect(page.getByTestId("ops-route-from")).toHaveValue("La tua posizione");
    await expect(page.getByTestId("ops-nav-toggle")).toContainText("Ferma");
    expect(routing.length - r2, "one routing request for the reroute (plus at most the elevation)").toBeLessThanOrEqual(2);
    // FERMA: voice cancelled, position released, no reroute, the route kept — for 30 s of moving fixes
    await page.getByTestId("ops-nav-toggle").click();
    const end = await gps(page);
    expect(end.watchers, "no position watcher").toBe(0);
    expect(end.cancels, "the voice cancelled").toBeGreaterThan(0);
    const said0 = end.spoken.length, r3 = routing.length;
    for (let i = 0; i < 30; i++) { await push(page, [here[0] + 0.01, here[1] + 0.0005 * i], 8); await page.waitForTimeout(1000); }
    expect((await gps(page)).spoken.length, "nothing said after Ferma").toBe(said0);
    expect(routing.length, "no request after Ferma").toBe(r3);
    expect(await page.evaluate(() => (window as any).__nexum.map.getSource("ops-route")?.serialize().data.geometry?.coordinates?.length ?? 0), "the route kept").toBeGreaterThan(10);
    await expect(page.getByTestId("ops-nav-active")).toHaveCount(0);
  expect(errors).toEqual([]);
}

/** A whole route with motorway stretches (long straight segments, few vertices), driven fast: never "off the route". */
export async function motorway(page: Page, from: string, to: string) {
  const { routing, errors, line } = await setup(page, from, to);
  const track = along(line, 60);
  await push(page, track[0], 6);
  await page.getByTestId("ops-nav-toggle").click();
  await expect(page.getByTestId("ops-nav-gps")).toHaveAttribute("data-gps", "fix", { timeout: 10_000 });
  const r0 = routing.length;
  let last = -1, back = 0;
  for (let i = 1; i < track.length; i++) {
    await push(page, track[i], 10);
    if (i % 10 === 0) { const s = Number(await page.getByTestId("ops-nav").getAttribute("data-step")); if (s < last) back++; last = Math.max(last, s); }
    await page.waitForTimeout(15);
  }
  await page.waitForTimeout(500);
  const g = await gps(page);
  expect(routing.length - r0, "no reroute on the route").toBe(0);
  expect(g.spoken.filter((t: string) => /Ricalcolo/.test(t)), "never 'Ricalcolo' on the route").toEqual([]);
  expect(back, "the manoeuvre shown never goes back").toBe(0);
  await page.getByTestId("ops-nav-toggle").click();
  expect((await gps(page)).watchers).toBe(0);
  expect(errors).toEqual([]);
  return { km: line.length, fixes: track.length };
}
