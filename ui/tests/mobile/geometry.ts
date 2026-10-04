// Geometric checks of what a person actually sees on a touch screen — not "the element exists in the DOM":
//   overlap of interactive elements · text cut off · controls outside the viewport · targets < 44 px ·
//   an element covered by another at its own centre (hidden under a panel) · trail made of ellipses.
import { expect, type Page } from "@playwright/test";
import fs from "node:fs";

export const OUT = new URL("../../../data/reports/phase3/mobile/", import.meta.url);

export interface Geo {
  overflowX: boolean;
  overlaps: string[];
  clipped: string[];
  outside: string[];
  small: string[];
  covered: string[];
}

/** Text allowed to end in an ellipsis because the same text is shown whole on the same screen (declared). */
const ELLIPSIS_OK = [".tb-name", ".phone-attr", ".maplabel"];

export async function geometry(page: Page, scope = "body"): Promise<Geo> {
  return page.evaluate(({ scope, ok }) => {
    const W = innerWidth, H = innerHeight;
    // layers: with an overlay open only the overlay is in front; with the card open in full, the surface is behind it
    const layer = document.querySelector(".ov") ?? null;
    const root = layer ?? document.querySelector(scope) ?? document.body;
    const behind = (el: Element) => !layer && !!document.querySelector('.insp[data-sheet="full"]') && !!el.closest(".stage");
    const vis = (el: Element) => {
      // closed <details>, content-visibility, visibility and opacity: what the browser really paints
      if ((el as any).checkVisibility && !(el as any).checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
      if (el.closest("details:not([open])") && !el.closest("summary")) return false;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}` +
      `"${((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 32)}"`;
    // the visible rectangle of an element: its box clipped by every scrolling/clipping ancestor
    const clipRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
          const q = p.getBoundingClientRect();
          x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
          // a sticky header of the scroller hides what scrolls beneath it (normal scrolling, not an overlap)
          for (const h of Array.from(p.children)) {
            if (h.contains(el) || getComputedStyle(h).position !== "sticky") continue;
            y0 = Math.max(y0, h.getBoundingClientRect().bottom);
          }
        }
      }
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    };
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && p.scrollHeight > p.clientHeight + 1) return true;
      }
      return false;
    };
    const topAt = (el: Element) => {
      const c = clipRect(el);
      if (c.w <= 8 || c.h <= 8) return true;                       // not on screen (or a sliver at a scroll edge)
      const x = Math.min(W - 1, Math.max(0, (c.x0 + c.x1) / 2)), y = Math.min(H - 1, Math.max(0, (c.y0 + c.y1) / 2));
      const hit = document.elementFromPoint(x, y);
      if (!!hit && (hit === el || el.contains(hit) || hit.contains(el))) return true;
      coveredBy.set(el, `${hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : "nothing"} at ${Math.round(x)},${Math.round(y)}`);
      return false;
    };
    const coveredBy = new Map<Element, string>();
    const SEL = "button, summary, a[href], .ref, [role=button], [role=option], [role=menuitem], .typerow";
    const els = [...root.querySelectorAll(SEL)].filter(vis).filter((el) => !el.closest(".maplabels, [aria-hidden=true]") && !behind(el));
    const outside: string[] = [], small: string[] = [], covered: string[] = [], overlaps: string[] = [];
    const onScreen = els.filter((el) => { const c = clipRect(el); return c.w > 2 && c.h > 2; });
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!inScroller(el) && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) outside.push(name(el));
    }
    for (const el of onScreen) {
      const r = el.getBoundingClientRect();
      const nested = el.parentElement?.closest(SEL);
      if (!nested && (r.height < 43.5 || (el.tagName === "BUTTON" && r.width < 43.5))) small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (!topAt(el)) covered.push(`${name(el)} under ${coveredBy.get(el)}`);
    }
    // panels drawn over the surface without taking touches (legend, attribution) must not lie over a control either
    const passive = [...root.querySelectorAll(".map-legend, .phone-attr, .graph-say > p, .graph-say > div > p")].filter(vis);
    for (const pnl of passive) for (const el of onScreen) {
      if (pnl.contains(el)) continue;
      const p = clipRect(pnl), q = clipRect(el);
      const ix = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), iy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
      if (ix > 3 && iy > 3) overlaps.push(`${name(pnl)} over ${name(el)}`);
    }
    for (let i = 0; i < onScreen.length; i++) for (let j = i + 1; j < onScreen.length; j++) {
      const a = onScreen[i], b = onScreen[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = clipRect(a), q = clipRect(b);
      const ix = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), iy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
      if (ix > 3 && iy > 3) overlaps.push(`${name(a)} × ${name(b)}`);
    }
    // text cut off: a visible element whose own text overflows its box (except the declared ellipsis cases)
    const clipped: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("h1, h2, h3, p, span, div, li, button, summary, label, dt, dd, figcaption")) {
      if (!vis(el) || el.closest(ok.join(",")) || el.closest(".maplibregl-map canvas") || behind(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX + cs.overflow) && cs.textOverflow !== "ellipsis" && !cs.webkitLineClamp) continue;
      if (el.scrollWidth > el.clientWidth + 1 || (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && el.scrollHeight > el.clientHeight + 2)) {
        const c = clipRect(el);
        if (c.w > 2 && c.h > 2) clipped.push(name(el));
      }
    }
    // a layout wider than the screen makes a mobile browser zoom the whole page out (layout ≠ visual viewport)
    const zoomedOut = !!visualViewport && (innerWidth > visualViewport.width * visualViewport.scale + 1 || innerHeight > visualViewport.height * visualViewport.scale + 1);
    return { overflowX: document.documentElement.scrollWidth > W + 1 || zoomedOut, overlaps: overlaps.slice(0, 12), clipped: clipped.slice(0, 12),
      outside: outside.slice(0, 12), small: small.slice(0, 12), covered: covered.slice(0, 12) };
  }, { scope, ok: ELLIPSIS_OK });
}

/** Every geometric rule at once; the screenshot of the step is kept for the comparison page. */
export async function check(page: Page, project: string, step: string, opts: { allowCovered?: RegExp; allowOutside?: RegExp } = {}) {
  await page.waitForTimeout(350);
  const dir = new URL(`${project}/`, OUT);
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: new URL(`${step}.jpg`, dir).pathname, type: "jpeg", quality: 70 });
  const g = await geometry(page);
  const covered = opts.allowCovered ? g.covered.filter((c) => !opts.allowCovered!.test(c)) : g.covered;
  fs.writeFileSync(new URL(`${step}.json`, dir), JSON.stringify({ project, step, ...g, covered }, null, 1));
  expect.soft(g.overflowX, `${step}: horizontal page scroll`).toBe(false);
  expect.soft(g.overlaps, `${step}: overlapping controls`).toEqual([]);
  expect.soft(g.clipped, `${step}: text cut off`).toEqual([]);
  const outside = opts.allowOutside ? g.outside.filter((c) => !opts.allowOutside!.test(c)) : g.outside;
  expect.soft(outside, `${step}: controls outside the viewport`).toEqual([]);
  expect.soft(g.small, `${step}: touch targets < 44 px`).toEqual([]);
  expect.soft(covered, `${step}: controls hidden under something else`).toEqual([]);
}

/** Visible, whole, inside the screen and on top at its centre. */
export async function seen(page: Page, selector: string, what: string) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { ok: false, why: "missing" };
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return { ok: false, why: "not rendered" };
    if (b.top < 0 || b.left < 0 || b.bottom > innerHeight || b.right > innerWidth) return { ok: false, why: `outside ${JSON.stringify([b.left, b.top, b.right, b.bottom])}` };
    if (getComputedStyle(el).pointerEvents === "none") {
      // drawn over the map without taking touches (place names): covered if a panel or control overlaps it
      const over = [...document.querySelectorAll(".insp, .card-strip, .view-toolbar > *, .ov, .scrim, .map-legend, .graph-say > *, .maplibregl-ctrl, .tabs")]
        .find((o) => { const q = o.getBoundingClientRect(); return q.width > 0 && getComputedStyle(o).display !== "none" &&
          q.left < b.right - 2 && q.right > b.left + 2 && q.top < b.bottom - 2 && q.bottom > b.top + 2; });
      return over ? { ok: false, why: `covered by ${over.className}` } : { ok: true, why: "" };
    }
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 14));
    if (!hit || !(hit === el || el.contains(hit))) return { ok: false, why: `covered by ${hit?.className}` };
    return { ok: true, why: "" };
  }, selector);
  expect(r.ok, `${what}: ${r.why}`).toBe(true);
}
