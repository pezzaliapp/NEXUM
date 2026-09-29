// W25 hub protection on D2 (aggregate nodes, paginated expansion, deterministic stable layout), W26 path = Core.
import { expect, test } from "@playwright/test";
import { api, FX, open, select, stage } from "./helpers";

test("W25 hub protection, pagination without duplicates, stable deterministic layout (D2)", async ({ page }) => {
  await open(page, "d2");
  await stage(page, "graph");
  const hub = FX.d2_hubs[0];
  await select(page, hub, "test", false);
  const g = page.getByTestId("graph");
  await expect(g).toHaveAttribute("data-root", hub, { timeout: 30000 });
  const order0 = await page.evaluate(() => (window as any).__nexum.graph.order());
  expect(order0).toBeLessThanOrEqual(2000);
  const aggs = await page.evaluate(() => (window as any).__nexum.graph.aggregates());
  expect(aggs.length).toBeGreaterThan(0);
  const agg = aggs.sort((a: any, b: any) => b.count - a.count)[0];
  // exact count: equals the Core's total for that group
  const core = await api(page, `/graph/expand?node=${agg.anchor}&edge_kind=${agg.edge_kind}&type=${agg.type}&dir=${agg.direction}&b=${encodeURIComponent('{"max_nodes":1}')}`);
  expect(agg.count).toBe(core.total);
  // positions of the first render
  const pos0 = await page.evaluate(() => (window as any).__nexum.graph.positions());
  // click the aggregate node on the canvas
  const pt = await page.evaluate((id) => {
    const G = (window as any).__nexum.graph;
    const a = G.graph.getNodeAttributes(id);
    return G.sigma.graphToViewport({ x: a.x, y: a.y });
  }, agg.id);
  const box = (await g.boundingBox())!;
  await page.mouse.click(box.x + pt.x, box.y + pt.y);
  await expect(page.getByTestId("agg-panel")).toBeVisible();
  let prev = await page.evaluate(() => (window as any).__nexum.graph.order());
  for (let i = 0; i < 5; i++) {
    await page.getByTestId("agg-next").click();
    await expect.poll(() => page.evaluate(() => (window as any).__nexum.graph.order())).toBeGreaterThan(prev);
    const now = await page.evaluate(() => (window as any).__nexum.graph.order());
    expect(now - prev).toBeLessThanOrEqual(200);          // one page, never more
    expect(now).toBeLessThanOrEqual(2000);
    prev = now;
  }
  const nodes = await page.evaluate(() => (window as any).__nexum.graph.graph.nodes());
  expect(new Set(nodes).size).toBe(nodes.length);
  // existing nodes never moved
  const pos1 = await page.evaluate(() => (window as any).__nexum.graph.positions());
  for (const [id, p] of Object.entries(pos0) as any) {
    if (pos1[id]) { expect(pos1[id].x).toBeCloseTo(p.x, 9); expect(pos1[id].y).toBeCloseTo(p.y, 9); }
  }
  // same context → same layout
  await select(page, FX.d2_hubs[1], "test", false);
  await expect(g).toHaveAttribute("data-root", FX.d2_hubs[1], { timeout: 30000 });
  await select(page, hub, "test", false);
  await expect(g).toHaveAttribute("data-root", hub, { timeout: 30000 });
  const pos2 = await page.evaluate(() => (window as any).__nexum.graph.positions());
  expect(Object.keys(pos2).sort()).toEqual(Object.keys(pos0).sort());
  for (const [id, p] of Object.entries(pos0) as any) { expect(pos2[id].x).toBe(p.x); expect(pos2[id].y).toBe(p.y); }
});

test("W26 path between two elements equals the Core's on 30 pairs", async ({ page }) => {
  await open(page, "d1");
  await stage(page, "graph");
  for (const [a, b] of FX.path_pairs) {
    await select(page, a);
    await expect(page.getByTestId("graph")).toHaveAttribute("data-root", a, { timeout: 15000 });
    await page.evaluate((x) => (window as any).__nexum.store.setSecondary(x), b);
    await page.getByTestId("path-btn").click();
    const res = page.getByTestId("path-result");
    await expect(res).toBeVisible();
    const core = await api(page, `/graph/path?a=${a}&b=${b}&max_hops=4`);
    const ids = (core.data.path ?? []).map((x: any) => x.id).join(",");
    if (ids) await expect(res).toHaveAttribute("data-path", ids);
    else await expect(res).toContainText("Nessun percorso entro 4 passaggi");
  }
});
