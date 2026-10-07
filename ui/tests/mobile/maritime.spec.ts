// MARITTIMO on a phone (physical test, 2026-10-06): ships, ports, chokepoints and cables are findable as separate
// switches (palette and Livelli), each turns into something visible on the map — or says none is in view and goes where
// they are — and a real tap on what is drawn explains it with its source. Mediterranean/Italy views and Baltic ships.
import { expect, test, type Page } from "@playwright/test";

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
  await page.waitForFunction(() => (window as any).__nexum.ops, null, { timeout: 30_000 });
  return errors;
}
/** A free spot of the map (not under a sheet, a label or a control) where `layer` is the topmost answering feature. */
const spot = (page: Page, layer: string) => page.evaluate((layer) => {
  const m = (window as any).__nexum.map, b = m.getCanvas().getBoundingClientRect();
  for (let y = 60; y < b.height - 20; y += 5) for (let x = 20; x < b.width - 60; x += 5) {
    if (document.elementFromPoint(b.left + x, b.top + y)?.tagName !== "CANVAS") continue;
    const top = m.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]]).filter((t: any) => /^(nexum-(items|hl|pts)|ops-)/.test(t.layer.id) && !/ops-(hl|aurora|hotspots-heat|orbit-track)$/.test(t.layer.id));
    if (top[0]?.layer.id === layer) return [b.left + x, b.top + y] as [number, number];
  }
  return null;
}, layer);
const card = (page: Page) => page.getByTestId("ops-feat-card");

test("MARITTIMO: findable in the palette, each switch shows something (or goes where it is), each thing explains itself", async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId("ops-tools").click();
  const g = page.getByTestId("ops-quick-maritime");
  await expect(g).toBeVisible();
  await expect(g).toContainText("Marittimo");
  for (const [k, t] of [["ais", "Navi"], ["ports", "Porti"], ["choke", "Stretti marittimi"], ["cables", "Cavi sottomarini"], ["naval", "Basi navali"]])
    await expect(page.getByTestId(`ops-quick-mrow-${k}`)).toContainText(t);
  // the sea route: an action (one computed route), not a layer of the whole network
  await expect(page.getByTestId("ops-quick-searoute")).toContainText("Rotta marittima tra due porti");
  await expect(page.getByTestId("ops-quick-routes")).toHaveCount(0);
  await expect(page.getByTestId("ops-quick-mrow-ais")).toContainText("solo Mar Baltico");
  // Porti: from the palette → Livelli at half, the map above; Italy in view
  await page.getByTestId("ops-quick-ports").click();
  await expect(page.getByTestId("ops-panel-layers")).toBeVisible();
  await expect(page.getByTestId("ops-layer-ports")).toBeChecked();
  await page.evaluate(() => (window as any).__nexum.map.jumpTo({ center: [12.3, 44.6], zoom: 6.5 }));   // Adriatic: Ravenna, Venezia, Ancona…
  await expect(page.getByTestId("ops-layer-mstat-ports")).toContainText("nella vista attuale", { timeout: 40_000 });
  await page.getByTestId("ops-sheet-handle").click().catch(() => {});        // the sheet down when it is a bottom sheet (more map)
  await page.evaluate(() => (window as any).__nexum.ops.set({ sheet: "peek" }));
  await page.waitForTimeout(1200);
  let s = await spot(page, "ops-ports");
  expect(s, "a port on the visible map").not.toBeNull();
  await page.touchscreen.tap(...s!);
  await expect(card(page)).toHaveAttribute("data-layer", "ops-ports", { timeout: 10_000 });
  await expect(page.getByTestId("ops-port-daily")).toContainText("scali", { timeout: 30_000 });
  await expect(page.getByTestId("ops-feat-source")).toContainText("IMF PortWatch");
  await page.getByTestId("ops-feat-close").tap();
  // Stretti: none in this view → "Vai a…" → there, tapped, measured
  await page.evaluate(() => (window as any).__nexum.ops.set({ sheet: "half" }));
  await page.getByTestId("ops-layer-choke").click();
  await expect(page.getByTestId("ops-layer-mstat-choke")).toContainText(/nella vista attuale/, { timeout: 30_000 });
  const goChoke = page.getByTestId("ops-layer-go-choke");
  if (await goChoke.isVisible()) await goChoke.click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__nexum.ops.set({ sheet: "peek" }));
  await page.waitForTimeout(1200);
  s = await spot(page, "ops-choke");
  expect(s, "a chokepoint on the visible map").not.toBeNull();
  await page.touchscreen.tap(...s!);
  await expect(card(page)).toHaveAttribute("data-layer", "ops-choke");
  await expect(page.getByTestId("ops-choke-daily")).toContainText("transiti", { timeout: 30_000 });
  await page.getByTestId("ops-feat-close").tap();
  // Cavi: the Mediterranean, tapped, OpenStreetMap
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("choke", false); o.layer("ports", false); o.set({ sheet: "half" }); });
  await page.getByTestId("ops-layer-cables").click();
  await expect(page.getByTestId("ops-layer-mstat-cables")).toContainText(/nella vista attuale/, { timeout: 30_000 });
  await page.evaluate(() => { (window as any).__nexum.map.jumpTo({ center: [12.4, 37.9], zoom: 6.5 }); (window as any).__nexum.ops.set({ sheet: "peek" }); });
  await page.waitForTimeout(2000);
  s = await spot(page, "ops-cables");
  expect(s, "a cable on the visible map").not.toBeNull();
  await page.touchscreen.tap(...s!);
  await expect(card(page)).toHaveAttribute("data-layer", "ops-cables");
  await expect(page.getByTestId("ops-feat-source")).toContainText("OpenStreetMap");
  await page.getByTestId("ops-feat-close").tap();
  // Rotta marittima tra due porti (2026-10-07, stabilization): ONE computed route, said as modelled; the ports open their
  // NEXUM cards; Genova → Shanghai via Suez, Suez avoided → longer; closed → nothing of it is left
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("cables", false); o.set({ sheet: "half" }); });
  await page.getByTestId("searoute-open").click();
  await expect(page.getByTestId("searoute-panel")).toBeVisible();
  const pickPort = async (id: string, q: string) => { await page.getByTestId(id).fill(q); await page.getByTestId(`${id}-hits`).locator("button").first().click({ timeout: 20_000 }); };
  await pickPort("searoute-from", "Livorno"); await pickPort("searoute-to", "Olbia");
  await expect(page.getByTestId("searoute-result")).toContainText("ROTTA MODELLATA", { timeout: 30_000 });
  await expect(page.getByTestId("searoute-result")).toContainText("non una nave osservata");
  await expect(page.getByTestId("searoute-port-a")).toContainText("Livorno");
  expect(await page.evaluate(() => (window as any).__nexum.map.getStyle().layers.filter((l: any) => /searoute|ops-routes/.test(l.id)).map((l: any) => l.id))).toEqual(["ops-searoute"]);
  expect(await page.getByTestId("searoute-tech").evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  await expect(page.getByTestId("searoute-near")).not.toContainText("cerco", { timeout: 60_000 });
  await page.getByTestId("searoute-from").fill(""); await pickPort("searoute-from", "Genova");
  await page.getByTestId("searoute-to").fill(""); await pickPort("searoute-to", "Shanghai");
  await expect(page.getByTestId("searoute-passes")).toContainText("Suez", { timeout: 30_000 });
  const viaSuez = Number((await page.getByTestId("searoute-km").textContent())!.replace(/\D/g, ""));
  expect(viaSuez).toBeGreaterThan(15000); expect(viaSuez).toBeLessThan(20000);
  await page.getByTestId("searoute-avoid-suez").check();
  await expect.poll(async () => Number(((await page.getByTestId("searoute-km").textContent()) ?? "").replace(/\D/g, "")), { timeout: 20_000 }).toBeGreaterThan(viaSuez + 3000);
  await page.getByTestId("searoute-close").click();
  expect(await page.evaluate(() => { const m = (window as any).__nexum.map; return [!!m.getLayer("ops-searoute"), !!m.getSource("ops-searoute")]; })).toEqual([false, false]);
  await page.evaluate(() => (window as any).__nexum.ops.layer("cables", true));
  // Navi: Baltic only — from the Mediterranean, the switch says so and goes there
  await page.evaluate(() => { const o = (window as any).__nexum.ops; o.layer("cables", false); o.set({ sheet: "half" }); });
  await page.getByTestId("ops-layer-ais").click();
  const st = page.getByTestId("ops-layer-mstat-ais");
  await expect(st).toBeVisible();
  await expect.poll(async () => (await st.textContent()) ?? "", { timeout: 40_000 }).toMatch(/nessuno nella vista attuale|nella vista attuale|caricamento/);
  if (await page.getByTestId("ops-layer-go-ais").isVisible()) {
    await page.getByTestId("ops-layer-go-ais").click();
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => (window as any).__nexum.map.getCenter().toArray())).toEqual([expect.closeTo(20.5, 0), expect.closeTo(59.3, 0)]);
  }
  await page.evaluate(() => (window as any).__nexum.ops.layer("ais", false));
  expect(errors).toEqual([]);
});
