// W16 (full investigation journey, Myanmar), W3/W8 (local-first, offline), W24 (attributions), W14 (selection kept
// across view changes), W15 (OBJECT MODE complete).
import { expect, test } from "@playwright/test";
import { api, focusOf, FX, open } from "./helpers";

const M = FX.myanmar;
const SECTIONS = ["identity", "type", "properties", "sources", "evidence", "relations", "related-objects",
  "related-events", "timeline", "geography", "insights", "provenance"];

test("W16 + W3 + W8 + W24: the whole investigation, offline, without leaving the workspace", async ({ page }) => {
  const { external, errors } = await open(page, "d1", { blockExternal: true });
  // declared change (2026-10-01): NEXUM opens on the last 12 months; this investigation spans every year, so the
  // person chooses the whole period first (an explicit choice, as in the workspace)
  await page.evaluate(() => (window as any).__nexum.store.setPeriod({ kind: "all" }));
  const navs: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  const attributions = async () => {
    const txt = await page.getByTestId("attributions").innerText();
    const srcs = await page.locator('[data-section="sources"] .list > li > div:first-child').allInnerTexts();
    const st = await api(page, "/status");
    for (const name of srcs) {
      const s = st.data.sources.find((x: any) => x.name === name);
      expect(s, name).toBeTruthy();
      expect(txt).toContain(s.attribution);
    }
  };
  // see the world
  await expect(page.getByTestId("map")).toBeVisible();
  await expect(page.getByTestId("map-lod")).toContainText(/aggregato|elementi/);
  // find Myanmar with search, select it
  await page.locator("#nexum-search").fill("Myanmar");
  await page.locator(`#nexum-results [data-ref="${M.mm}"]`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.mm);
  await expect(page.getByTestId("map")).toHaveAttribute("data-selected", M.mm);
  for (const s of SECTIONS) await expect(page.locator(`[data-section="${s}"]`)).toHaveCount(1);
  await attributions();
  // OBJECT → OBJECT: Myanmar → Mandalay International (relations)
  await page.getByTestId("relations-more").first().click();
  await page.locator(`[data-section="relations"] [data-ref="${M.vymd}"]`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.vymd);
  await attributions();
  // OBJECT → EVENT: VYMD → M7.7 (related events)
  await page.locator(`[data-section="related-events"] [data-ref="${M.quake}"]`).click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);
  // follow its timeline: the focus track contains the event
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-appears", "mark");
  // EVENT → INSIGHT: M7.7 → R2 association
  await page.locator(`[data-section="insights"] [data-ref="${M.r2}"]`).first().click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.r2);
  // WHY THIS RELATION? — rule, candidates, representative, rejected, confidence recomputed
  await page.locator(`.focushead [data-why="${M.r2}"]`).click();
  const why = page.getByTestId("why");
  await expect(why).toHaveAttribute("data-why", M.r2);
  await page.getByTestId("why-technical").locator("summary").click();   // declared change: engine details collapsed by default
  await expect(page.getByTestId("why-rule")).toHaveText("event_event_association");
  await expect(page.locator(`[data-candidate="${M.quake}"]`)).toBeVisible();
  await expect(page.locator(`[data-candidate="${M.m67}"]`)).toBeVisible();
  await expect(page.getByTestId("why-representative")).toHaveAttribute("data-ref", M.quake);
  await expect(page.locator(`[data-rejected="${M.m67}"]`)).toContainText("membro del gruppo scelto, non rappresentante");
  await expect(page.getByTestId("group-support-0")).toHaveText("0,68");
  await expect(page.getByTestId("why-recompute")).toHaveAttribute("data-match", "true");
  await expect(page.getByTestId("why-caution")).toBeVisible();
  // down to evidence, source record and licence
  const raw = page.locator(`[data-member-evidence="${M.quake}"] [data-raw]`).first();
  await raw.click();
  await expect(page.getByTestId("raw-record").first()).toContainText("us7000pn9s");
  await expect(page.getByTestId("raw-record").first()).toContainText("public-domain");
  // back to the element, then INSIGHT → OBJECT: R2 → Myanmar (member P)
  await page.getByRole("button", { name: /Torna all'elemento/ }).click();
  // declared change (2026-10-03, Phase 3B · A2): members with their roles sit under "Dettagli tecnici", collapsed by default
  await page.getByTestId("detail-technical").locator(":scope > summary").click();
  await page.locator(`[data-section="properties"] [data-ref="${M.mm}"]`).first().click();
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.mm);
  // change focus from the graph and continue
  await page.getByRole("button", { name: "Mappa + Grafo" }).click();
  await expect(page.getByTestId("graph")).toHaveAttribute("data-root", M.mm);
  await expect(page.getByTestId("map")).toHaveAttribute("data-selected", M.mm);
  // GRAPH → pivot: click a neighbour node on the canvas; it becomes the new focus in every view
  const target = await page.evaluate((mm) => {
    const G = (window as any).__nexum.graph;
    const id = G.graph.nodes().find((n: string) => n !== mm && G.graph.getNodeAttribute(n, "kind") === "event");
    const a = G.graph.getNodeAttributes(id);
    return { id, pt: G.sigma.graphToViewport({ x: a.x, y: a.y }) };
  }, M.mm);
  const gbox = (await page.getByTestId("graph").boundingBox())!;
  await page.mouse.click(gbox.x + target.pt.x, gbox.y + target.pt.y);
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", target.id);
  await expect(page.getByTestId("map")).toHaveAttribute("data-selected", target.id);
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-selected", target.id);
  // the trail holds ≥ 5 steps and ◀ ▶ walk it
  const steps = await page.locator("[data-step]").count();
  expect(steps).toBeGreaterThanOrEqual(5);
  await page.getByRole("button", { name: "Passo precedente" }).click();
  expect(await focusOf(page)).toBe(M.mm);
  await page.getByRole("button", { name: "Passo successivo" }).click();
  expect(await focusOf(page)).toBe(target.id);
  // one page, no reload, no external request, no page error
  expect(navs.filter((u) => !u.includes("#")).length).toBe(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("W14: changing view keeps selection, focus, scope and trail", async ({ page }) => {
  await open(page, "d1");
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), M.quake);
  await page.evaluate(() => (window as any).__nexum.store.setScope({ min_confidence: 0.5 }));
  const before = await page.evaluate(() => { const s = (window as any).__nexum.store.get(); return JSON.stringify([s.focus, s.scope, s.trail.steps.map((x: any) => x.ref)]); });
  for (const name of ["Grafo", "Mappa + Grafo", "Mappa"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", M.quake);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Grafo/ }).last().click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const after = await page.evaluate(() => { const s = (window as any).__nexum.store.get(); return JSON.stringify([s.focus, s.scope, s.trail.steps.map((x: any) => x.ref)]); });
  expect(after).toBe(before);
});
