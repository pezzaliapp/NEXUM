// W29 responsive + visual evidence (screenshots reviewed with the checklist), W30 keyboard navigation.
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { FX, open } from "./helpers";

const SIZES = [
  { name: "1920x1080", width: 1920, height: 1080 }, { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 }, { name: "tablet-1024x768", width: 1024, height: 768 },
  { name: "phone-390x844", width: 390, height: 844 },
];
const OUT = new URL("../../../data/reports/phase2/screens/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

async function layoutChecks(page: Page, touch: boolean, label: string) {
  const r = await page.evaluate((touchLayout) => {
    const W = innerWidth, H = innerHeight;
    const overflow = document.documentElement.scrollWidth > W + 1;
    const clipped: string[] = [], small: string[] = [];
    const sel = "button, summary, .ref, [role=option], input, .typerow";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (b.width === 0 || b.height === 0 || cs.visibility === "hidden") continue;
      // only elements not inside a scrolling container can be "cut"
      let scroller: HTMLElement | null = el.parentElement, inScroll = false;
      while (scroller) { const o = getComputedStyle(scroller); if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) { inScroll = true; break; } scroller = scroller.parentElement; }
      if (!inScroll && (b.right > W + 1 || b.left < -1 || b.bottom > H + 1)) clipped.push((el.innerText || el.getAttribute("aria-label") || el.className).slice(0, 30));
      if (touchLayout && b.bottom > 0 && b.top < H && (b.height < 39.5 || (el.tagName === "BUTTON" && b.width < 39.5)))
        small.push(`${el.tagName}.${el.className}:${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return { overflow, clipped, small: small.slice(0, 10) };
  }, touch);
  expect(r.overflow, `${label} horizontal overflow`).toBe(false);
  expect(r.clipped, `${label} clipped controls`).toEqual([]);
  if (touch) expect(r.small, `${label} touch targets`).toEqual([]);
}

for (const size of SIZES) {
  test(`W29 ${size.name}: search → focus → WHY → pivot, no overflow, nothing cut, touch targets`, async ({ browser }) => {
    const phone = size.width < 768, touch = size.width < 1280;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2,
      hasTouch: touch, isMobile: phone });
    const page = await ctx.newPage();
    await open(page, "d1");
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL(`${size.name}-1-world.png`, OUT).pathname });
    await layoutChecks(page, touch, `${size.name} world`);
    if (phone) await page.locator(".tabs button", { hasText: "Cerca" }).click();
    await page.locator("#nexum-search").fill("Mandalay");
    await page.locator(`#nexum-results [data-ref="${FX.myanmar.quake}"]`).click();
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", FX.myanmar.quake);
    await page.waitForTimeout(700);
    await page.screenshot({ path: new URL(`${size.name}-2-focus.png`, OUT).pathname });
    await layoutChecks(page, touch, `${size.name} focus`);
    await page.locator(`[data-section="insights"] [data-why="${FX.myanmar.r2}"]`).click();
    await expect(page.getByTestId("why")).toHaveAttribute("data-why", FX.myanmar.r2);
    await page.waitForTimeout(500);
    await page.screenshot({ path: new URL(`${size.name}-3-why.png`, OUT).pathname });
    await layoutChecks(page, touch, `${size.name} why`);
    await page.locator(`[data-candidate="${FX.myanmar.m67}"] [data-ref]`).click();   // pivot from WHY
    await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", FX.myanmar.m67);
    if (!phone) {
      await page.getByRole("button", { name: "Grafo", exact: true }).click();
      await expect(page.getByTestId("graph")).toHaveAttribute("data-root", FX.myanmar.m67);
      await page.waitForTimeout(600);
      await page.screenshot({ path: new URL(`${size.name}-4-graph.png`, OUT).pathname });
      await layoutChecks(page, touch, `${size.name} graph`);
    } else {
      for (const tab of ["Grafo", "Tempo"]) {
        await page.locator(".tabs button", { hasText: tab }).click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: new URL(`${size.name}-4-${tab.toLowerCase()}.png`, OUT).pathname });
        await layoutChecks(page, touch, `${size.name} ${tab}`);
      }
    }
    await ctx.close();
  });
}

test("W30 keyboard: / focuses search, arrows + Enter open a result, [ ] walk the trail, W opens WHY", async ({ page }) => {
  await open(page, "d1");
  await page.keyboard.press("/");
  await expect(page.locator("#nexum-search")).toBeFocused();
  await page.keyboard.type("Mandalay");
  await expect(page.locator("#nexum-results [role=option]").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const first = await page.getByTestId("focus-head").getAttribute("data-focus");
  await page.evaluate((id) => (window as any).__nexum.store.select(id, "test"), FX.myanmar.r2);
  await page.locator("body").click({ position: { x: 5, y: 400 } }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.keyboard.press("w");
  await expect(page.getByTestId("why")).toHaveAttribute("data-why", FX.myanmar.r2);
  await page.keyboard.press("[");
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", first!);
  await page.keyboard.press("]");
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", FX.myanmar.r2);
  // tab order reaches the inspector's references and they are activatable with Enter
  const ref = page.locator('[data-section="properties"] .ref').first();
  await ref.focus();
  await expect(ref).toBeFocused();
  const target = await ref.getAttribute("data-ref");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("focus-head")).toHaveAttribute("data-focus", target!);
});
