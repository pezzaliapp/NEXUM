// FASE 8 — real cases of the published world, across every domain (bench/phase3/cases_live.json, picked from the world
// by bench/phase3/pick_cases.py: per type the element with the most connections and one with none). For each case a
// person can: open it → understand what it is (what · where · when) → find the connections found by NEXUM, or read
// that there is none (a plain geographic link is never listed among them) → ask "Perché?" → see evidence and sources →
// pivot → come back. An element without connections must not get invented ones.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.NEXUM_WEB ?? "http://127.0.0.1:8791/";
const CASES: { id: string; label: string; type: string; kind: string; insights: number }[] =
  JSON.parse(fs.readFileSync(new URL("../../../bench/phase3/cases_live.json", import.meta.url), "utf8"));
const OUT = new URL("../../../data/reports/phase3/cases-report.json", import.meta.url);

async function ready(page: Page, id: string) {
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", id);
  await page.waitForFunction((i) => (window as any).__nexum.store.get().context?.id === i, id, { timeout: 30_000 });
  await expect(page.getByTestId("connections")).toBeVisible();
}

for (const [label, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 430, height: 740 }]] as const) {
  test(`${CASES.length} real cases on ${label}: understand → connections or statement → Perché? → evidence → pivot → back`, async ({ browser }) => {
    test.setTimeout(1_200_000);
    const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 1280, hasTouch: vp.width < 1280 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => performance.getEntriesByName("nexum:ready").length > 0, null, { timeout: 90_000 });
    const report: any[] = [];
    for (const c of CASES) {
      await page.evaluate((i) => (window as any).__nexum.store.select(i, "search"), c.id);
      await ready(page, c.id);
      if (vp.width < 700) await page.getByTestId("sheet-more").click().catch(() => {});
      const r: any = { ...c, viewport: label };
      // understand: what (always), when (events and insights)
      r.what = (await page.getByTestId("focus-what").innerText()).trim();
      expect(r.what.length, `${c.id} what`).toBeGreaterThan(2);
      if (c.kind !== "object") expect(r.what, `${c.id} date`).toMatch(/\d{1,2} [a-z]{3} \d{4}/);
      // connections or the explicit statement; never a plain geographic link among them
      const rows = page.locator('[data-testid="connections"] > .conn-list > .conn-row');
      r.connections = await rows.count();
      r.empty = await page.getByTestId("conn-empty").count() ? await page.getByTestId("conn-empty").innerText() : null;
      expect(r.connections > 0 || !!r.empty, `${c.id} connections or statement`).toBe(true);
      expect(await page.locator('[data-testid="connections"] > .conn-list > .conn-row[data-geo]').count(), `${c.id} geography among connections`).toBe(0);
      if (c.insights === 0 && c.kind !== "insight") {
        const insRows = await page.locator('[data-testid="connections"] > .conn-list > .conn-row[data-cat="insight"]').count();
        expect(insRows, `${c.id} invented rule outputs`).toBe(0);
      }
      r.geo = await page.locator('[data-testid="conn-geo"] .conn-row').count();
      // sources of the element
      r.sources = await page.locator('[data-section="sources"] .list > li').count();
      expect(r.sources, `${c.id} sources`).toBeGreaterThan(0);
      // Perché? → explanation with its evidence
      const why = page.locator('.focushead [data-why], [data-testid="insight-why"], [data-testid="connections"] .conn-row [data-why]').first();   // declared change: insight-why
      if (await why.count()) {
        const wid = await why.getAttribute("data-why");
        await why.click();
        await expect(page.getByTestId("why")).toHaveAttribute("data-why", wid!);
        await expect(page.locator('[data-why-block]').first()).toBeVisible({ timeout: 30_000 });
        r.why = wid;
        r.why_blocks = await page.locator("[data-why-block]").count();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("why")).toHaveCount(0);
      }
      // pivot through the first connection (or the first geographic row), then back
      const pivot = page.locator('[data-testid="connections"] .conn-row .ref').first();
      if (await pivot.count()) {
        const target = await pivot.getAttribute("data-ref");
        if (vp.width < 700 && !(await pivot.isVisible())) await page.getByTestId("sheet-more").click().catch(() => {});
        await pivot.click();
        await ready(page, target!);
        r.pivot = target;
        await page.evaluate(() => (window as any).__nexum.store.back());
        await ready(page, c.id);
      }
      report.push(r);
    }
    const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
    fs.writeFileSync(OUT, JSON.stringify({ ...prev, [label]: report }, null, 1));
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
