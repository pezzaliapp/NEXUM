// PHYSICAL ACCEPTANCE GOLDEN TESTS (2026-10-06): what a person sees and touches, on every phone of the suite —
//   WEBCAM   the mark tapped → THAT camera's viewer (name, id, its own media from its own publisher, its state said
//            exactly) → nearby cameras only after it, apart, with distances; on-map previews belong to their marks.
//            A LIVE · B CURRENT SNAPSHOT · C LINK ONLY (Parma, regression) · D OFFLINE (Huaraz) · E SEVERAL NEARBY (London)
//   NEWS     a point tapped → an event a person can read (what, where, when, reported not verified, how many articles and
//            outlets) → the sources → the technical codes only on request → the original source, said as external.
// The media come from the real publishers (no mock): a publisher that fails is said as such by the viewer, and the
// test says which. Camera records: the live world's own ids.
import { expect, test, type Page } from "@playwright/test";

const CAM = {
  live: { id: "obj_bftkjvw5ykudnbsfefwhim76gy", at: [14.9934, 37.751], label: "Etna (live)", host: "garr.tv/static/streaming-playlists/hls/c6c70a03" },
  snap: { id: "obj_hbayb4mk24g67ns6cxmp3me22y", at: [24.948435, 60.244449], label: "Kelikamera Helsinki Pakila", img: "https://weathercam.digitraffic.fi/C0151301.jpg" },
  link: { id: "obj_eoym3e6uoifmzq4qo5aytj3dtm", at: [10.327664, 44.801922], label: "Piazza Garibaldi" },
  off: { id: "obj_dxtmzhrouecadeei2sml2gfi34", at: [-77.531599, -9.530189], label: "Huaraz - Blick nach Osten", img: "foto-webcam.eu/webcam/huaraz/" },
  near: { id: "obj_sgmzueyp5cdhdsqy2zjzyolm3m", at: [-0.13484, 51.5096], label: "Piccadilly Circus" },
} as const;

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
const focus = (page: Page) => page.evaluate(() => (window as any).__nexum.store.get().focus);
/** The camera's own mark on the map, tapped (as a person does): the map at street scale on it, a tap where it is drawn. */
async function tapMark(page: Page, at: readonly number[], id: string) {
  // the Webcam category on the map (the person's choice, as in Filtri); the Telecamere tool alone brings the marks only
  // while it is open (2026-10-06, physical test 3)
  await page.evaluate(() => { const s = (window as any).__nexum.store, m = s.get().mapTypes;
    if (Array.isArray(m) && !m.includes("camera.public_webcam")) s.setMapTypes([...m, "camera.public_webcam"]); });
  await page.evaluate((c) => { const n = (window as any).__nexum; n.store.set({ inspectorOpen: false }); n.map.jumpTo({ center: c, zoom: 17 }); }, at as number[]);
  await page.waitForTimeout(1500);
  // the mark brought to a part of the map nothing covers (a landscape phone's panels cover its centre)
  await page.evaluate((c) => {
    const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
    const free = (x: number, y: number) => [[0, 0], [-14, -14], [14, 14], [-14, 14], [14, -14]].every(([dx, dy]) => document.elementFromPoint(b.left + x + dx, b.top + y + dy)?.tagName === "CANVAS");
    let best: [number, number] | null = null;
    for (let y = 40; y < b.height - 30 && !best; y += 10) for (let x = 40; x < b.width - 40; x += 10) if (free(x, y)) { best = [x, y]; break; }
    if (best) m.easeTo({ center: c, zoom: 17, duration: 0, offset: [best[0] - b.width / 2, best[1] - b.height / 2] });
  }, at as number[]);
  await page.waitForTimeout(2500);
  const xy = await page.evaluate((c) => { const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect(), p = m.project(c);
    return [b.left + p.x, b.top + p.y]; }, at as number[]);
  await page.touchscreen.tap(xy[0], xy[1]);
  // several cameras at one place open as a list: the right one is chosen there
  const pick = page.locator(`[data-id="${id}"]`).first();
  if (await pick.isVisible().catch(() => false)) await pick.tap();
  await expect.poll(() => focus(page), { timeout: 20_000 }).toBe(id);
}
const imgState = (page: Page) => page.evaluate(() => {
  const i = document.querySelector('[data-testid="cam-figure"] img') as HTMLImageElement | null;
  return i ? (i.complete ? (i.naturalWidth > 0 ? "ok" : "broken") : "loading") : document.querySelector('[data-testid="media-error"]') ? "error" : "none";
});

test("WEBCAM A · LIVE: the mark → Etna's own video from GARR, said LIVE only as video, actions present", async ({ page }, info) => {
  const errors = await open(page);
  const asked: string[] = [];
  page.on("request", (r) => asked.push(r.url()));
  await tapMark(page, CAM.live.at, CAM.live.id);
  await expect(page.getByTestId("focus-head")).toContainText(CAM.live.label);
  const v = page.getByTestId("media");
  await expect(v).toHaveAttribute("data-cam", CAM.live.id);
  await expect(page.getByTestId("media-status")).toHaveText("● LIVE");
  await expect(page.getByTestId("live-player")).toBeAttached({ timeout: 20_000 });
  await expect.poll(() => asked.some((u) => u.includes(CAM.live.host)), { timeout: 30_000 }).toBeTruthy();      // its own stream
  await expect(v).not.toHaveAttribute("data-live-state", "loading", { timeout: 45_000 });
  const st = await v.getAttribute("data-live-state");
  info.annotations.push({ type: "live", description: `GARR stream state: ${st}` });
  if (info.project.name.startsWith("fold")) expect(st, "Chrome plays the publisher's HLS").toBe("playing");
  if (st === "playing") await expect(page.getByTestId("cam-time")).toContainText("IN ONDA");
  else await expect(page.getByTestId("cam-time")).toContainText("non risponde");                      // said, never faked
  for (const t of ["media-reload", "cam-locate", "cam-full"]) await expect(page.getByTestId(t)).toBeVisible();
  expect(errors).toEqual([]);
});

test("WEBCAM B · CURRENT SNAPSHOT: the mark → Pakila's own image at once, timestamped, never LIVE; fullscreen; nearby apart", async ({ page }) => {
  const errors = await open(page);
  await tapMark(page, CAM.snap.at, CAM.snap.id);
  await expect(page.getByTestId("focus-head")).toContainText(CAM.snap.label);
  await expect(page.getByTestId("media")).toHaveAttribute("data-cam", CAM.snap.id);
  await expect(page.getByTestId("media-status")).toContainText("IMMAGINE CORRENTE");
  await expect(page.getByTestId("media-status")).not.toContainText("LIVE");
  await expect(page.getByTestId("cam-state-text")).toContainText("non un video");
  const img = page.getByTestId("cam-figure").locator("img");
  await expect(img).toHaveCount(1);                                               // one image: this camera's
  expect(await img.getAttribute("src")).toContain(CAM.snap.img);                  // from its own publisher, no copy
  expect(await img.getAttribute("referrerpolicy")).toBe("no-referrer");
  await expect.poll(() => imgState(page), { timeout: 30_000 }).toBe("ok");
  await expect(page.getByTestId("cam-time")).toContainText(/immagine chiesta al gestore alle \d\d:\d\d:\d\d/);
  // refresh: a new request, same camera
  const before = await img.getAttribute("src");
  await page.getByTestId("media-reload").tap();
  await expect.poll(() => img.getAttribute("src")).not.toBe(before);
  expect(await img.getAttribute("src")).toContain(CAM.snap.img);
  // full screen and back
  await page.getByTestId("cam-full").tap();
  await expect(page.getByTestId("cam-figure")).toHaveClass(/full/);
  await page.getByRole("button", { name: "Chiudi" }).last().tap();
  await expect(page.getByTestId("cam-figure")).not.toHaveClass(/full/);
  // other cameras: after the viewer, apart, never this one, by distance
  const near = page.getByTestId("cam-near");
  await expect(near).toBeAttached({ timeout: 30_000 });
  await expect(near).toContainText("Altre telecamere vicine");
  const refs = await near.getByTestId("cam-near-item").evaluateAll((l) => l.map((x) => (x as HTMLElement).dataset.ref));
  expect(refs).not.toContain(CAM.snap.id);
  const order = await page.evaluate(() => { const v = document.querySelector('[data-testid="cam-figure"]')!, n = document.querySelector('[data-testid="cam-near"]')!;
    return !!(v.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); });
  expect(order, "nearby cameras come after this camera's viewer").toBeTruthy();
  expect(errors).toEqual([]);
});

test("WEBCAM C · LINK ONLY (Parma regression): said first, the publisher's page, no image anywhere", async ({ page }) => {
  const errors = await open(page);
  const asked: string[] = [];
  page.on("request", (r) => { if (/comune\.parma\.it|skylinewebcams/.test(r.url())) asked.push(r.url()); });
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), CAM.link.id);
  await expect(page.getByTestId("focus-head")).toContainText(CAM.link.label, { timeout: 30_000 });
  await expect(page.getByTestId("media-status")).toContainText("SOLO COLLEGAMENTO");
  await expect(page.getByTestId("webcam-link")).toHaveAttribute("href", /comune\.parma\.it/);
  await expect(page.getByTestId("media-img")).toHaveCount(0);
  await expect(page.getByTestId("cam-figure")).toHaveCount(0);
  expect(asked).toEqual([]);
  expect(errors).toEqual([]);
});

test("WEBCAM D · OFFLINE (Huaraz): Huaraz first, OFFLINE, its last image said as not current with its date; no other camera's image", async ({ page }) => {
  const errors = await open(page);
  await tapMark(page, CAM.off.at, CAM.off.id);
  await expect(page.getByTestId("focus-head")).toContainText(CAM.off.label);
  await expect(page.getByTestId("media")).toHaveAttribute("data-cam", CAM.off.id);
  await expect(page.getByTestId("media-status")).toHaveText(/OFFLINE/);
  await expect(page.getByTestId("media-off")).toContainText("non in servizio");
  await expect(page.getByTestId("cam-observed")).toContainText("2026");
  await expect.poll(() => imgState(page), { timeout: 30_000 }).not.toBe("loading");
  const st = await imgState(page);
  if (st === "ok") {
    await expect(page.getByTestId("cam-last")).toContainText("non attuale");
    expect(await page.getByTestId("cam-figure").locator("img").getAttribute("src")).toContain(CAM.off.img);
  } else await expect(page.getByTestId("media-error")).toBeVisible();
  // whatever comes after is apart and named as OTHER cameras
  await expect(page.getByTestId("cam-near")).toContainText("Altre telecamere vicine", { timeout: 30_000 });
  expect(await page.locator('[data-testid="media"] img').evaluateAll((l) => l.map((i) => (i as HTMLImageElement).src).filter((s) => !s.includes("huaraz")))).toEqual([]);
  expect(errors).toEqual([]);
});

test("WEBCAM E · SEVERAL NEARBY (London): previews each on its own mark; a tile tapped opens THAT camera; nearby by distance", async ({ page }) => {
  const errors = await open(page);
  await tapMark(page, CAM.near.at, CAM.near.id);
  await expect(page.getByTestId("focus-head")).toContainText(CAM.near.label);
  const near = page.getByTestId("cam-near-item");
  await expect(near.first()).toBeAttached({ timeout: 30_000 });
  const km = await near.evaluateAll((l) => l.map((x) => { const t = x.textContent ?? ""; const m = t.match(/· ([\d.,]+) (m|km)/); return m ? Number(m[1].replace(".", "").replace(",", ".")) * (m[2] === "m" ? 0.001 : 1) : NaN; }));
  expect(km.length).toBeGreaterThan(2);
  expect([...km].sort((a, b) => a - b)).toEqual(km);                              // nearest first
  // the on-map previews (opt-in), at street scale
  await page.evaluate((c) => { const n = (window as any).__nexum; n.store.set({ inspectorOpen: false, sheet: "mini" }); n.ops.layer("camPreviews", true);
    // Piccadilly low in the map: room above it for the tiles (a tile is drawn only where it fits)
    n.map.easeTo({ center: c, zoom: 15.5, duration: 0, offset: [0, n.map.getCanvas().clientHeight * 0.22] }); }, CAM.near.at as unknown as number[]);
  const tiles = page.getByTestId("cam-preview");
  await expect(tiles.first()).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  const n = await tiles.count();
  expect(n).toBeGreaterThanOrEqual(1);                                            // a landscape phone's short map has room for one
  expect(n).toBeLessThanOrEqual(8);
  // every tile sits on its own camera's mark (stem: the tile's bottom centre just above the camera's point)
  const geo = await page.evaluate(() => {
    const m = (window as any).__nexum.map, s = (window as any).__nexum.store, b = m.getCanvas().getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="cam-preview"]')].map((el) => {
      const r = el.getBoundingClientRect(), e = s.entity((el as HTMLElement).dataset.id), p = m.project(e.point);
      return { id: (el as HTMLElement).dataset.id, dx: r.left + r.width / 2 - (b.left + p.x), dy: (b.top + p.y) - r.bottom, sel: el.classList.contains("sel") };
    });
  });
  for (const g of geo) { expect(Math.abs(g.dx), `tile ${g.id} centred on its mark`).toBeLessThan(3); expect(g.dy, `tile ${g.id} just above its mark`).toBeGreaterThan(5); expect(g.dy).toBeLessThan(40); }
  // tiles never cover each other
  const rects = await tiles.evaluateAll((l) => l.map((x) => x.getBoundingClientRect().toJSON()));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], c = rects[j];
    expect(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top, "tiles do not overlap").toBeTruthy();
  }
  // a tile tapped opens THAT camera, with its own image
  const other = geo.find((g) => g.id !== CAM.near.id && !g.sel) ?? geo[0];
  const t = page.locator(`[data-testid="cam-preview"][data-id="${other.id}"]`);
  const box = (await t.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 3);
  await expect.poll(() => focus(page), { timeout: 15_000 }).toBe(other.id);
  await expect(page.getByTestId("media")).toHaveAttribute("data-cam", other.id, { timeout: 20_000 });
  const src = await page.getByTestId("cam-figure").locator("img").getAttribute("src").catch(() => null);
  if (src) expect(src).toContain("jamcams.tfl.gov.uk");
  // its tile, when still drawn (opening the card can move the map), is the outlined one
  const mine = page.locator(`[data-testid="cam-preview"][data-id="${other.id}"]`);
  if (await mine.count()) await expect(mine).toHaveClass(/sel/);
  await page.evaluate(() => (window as any).__nexum.ops.layer("camPreviews", false));
  expect(errors).toEqual([]);
});

/** A free spot of the map where `layer` is the topmost answering feature. */
const spot = (page: Page, layer: string) => page.evaluate((layer) => {
  const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
  for (let y = 60; y < b.height - 20; y += 5) for (let x = 20; x < b.width - 60; x += 5) {
    if (document.elementFromPoint(b.left + x, b.top + y)?.tagName !== "CANVAS") continue;
    const top = m.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]]).filter((t: any) => /^(nexum-(items|hl|pts)|ops-)/.test(t.layer.id) && !/ops-(hl|aurora|hotspots-heat|orbit-track)$/.test(t.layer.id));
    if (top[0]?.layer.id === layer) return [b.left + x, b.top + y] as [number, number];
  }
  return null;
}, layer);

test("NEWS: a point → what was reported, where, when, by whom → its sources → codes on request → the original, said external", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => { const n = (window as any).__nexum; n.ops.layer("news", true); n.map.jumpTo({ center: [10, 45], zoom: 3.2 }); n.ops.set({ sheet: "peek" }); });
  await expect.poll(() => page.evaluate(() => (window as any).__nexum.ops.get().counts.news ?? 0), { timeout: 40_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2000);
  let s = await spot(page, "ops-news");
  if (!s) { await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [-90, 38], zoom: 3 })); await page.waitForTimeout(2000); s = await spot(page, "ops-news"); }
  expect(s, "a news point on the visible map").not.toBeNull();
  await page.touchscreen.tap(...s!);
  const card = page.getByTestId("ops-feat-card");
  await expect(card).toHaveAttribute("data-layer", "ops-news", { timeout: 10_000 });
  await expect(page.getByTestId("news-status")).toContainText("RIPORTATO DAI MEDIA");
  await expect(page.getByTestId("news-status")).toContainText("non verificato");
  await expect(page.getByTestId("news-sentence")).toContainText(/^Evento riportato dai media/);
  await expect(page.getByTestId("news-place")).not.toHaveText("—");
  await expect(page.getByTestId("news-when")).toContainText("UTC");
  await expect(page.getByTestId("news-count")).toContainText(/1 evento · \d+ articol[io] · \d+ testat[ae]/);
  // the codes are details, closed, after the understanding
  const tech = page.getByTestId("news-tech");
  expect(await tech.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  const order = await page.evaluate(() => { const a = document.querySelector('[data-testid="news-sentence"]')!, b = document.querySelector('[data-testid="news-tech"]')!;
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); });
  expect(order).toBeTruthy();
  const title = await page.getByTestId("ops-feat-title").textContent();
  expect(title).not.toMatch(/CAMEO|Goldstein/);
  // the sources, then the original
  await page.getByTestId("news-sources").locator("summary").tap();
  const links = page.getByTestId("news-sources").locator("a");
  expect(await links.count()).toBeGreaterThan(0);
  expect(await links.first().getAttribute("href")).toMatch(/^https?:\/\//);
  await expect(page.getByTestId("news-open")).toHaveText("APRI FONTE ORIGINALE ↗");
  expect(await page.getByTestId("news-open").getAttribute("target")).toBe("_blank");
  await tech.locator("summary").tap();
  await expect(tech).toContainText("Codice CAMEO");
  await expect(tech).toContainText("Goldstein");
  await expect(page.getByTestId("ops-feat-source")).toContainText("GDELT");
  expect(errors).toEqual([]);
});
