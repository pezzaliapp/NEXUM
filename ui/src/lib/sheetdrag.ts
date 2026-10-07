// A TOUCH SHEET'S HANDLE (2026-10-05, physical test #4): the sheet follows the finger while dragged and settles on the
// nearest of its heights (a quick swipe moves one step even when it ends near the start); a tap steps through them.
// Shared by the focus card and the map tools' sheet.
import type { PointerEvent as RPE } from "react";

export interface Snap { name: string; px: number }

export function sheetDrag(el: () => HTMLElement | null, snaps: () => Snap[], current: () => string, settle: (name: string) => void, tap: () => void) {
  let y0 = 0, h0 = 0, on = false;
  const box = () => el();
  return {
    onPointerDown(e: RPE) {
      const b = box();
      if (!b) return;
      on = true; y0 = e.clientY; h0 = b.getBoundingClientRect().height;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e: RPE) {
      const b = box();
      if (!on || !b || Math.abs(e.clientY - y0) < 6) return;
      const s = snaps(), lo = Math.min(...s.map((x) => x.px)), hi = Math.max(...s.map((x) => x.px));
      Object.assign(b.style, { height: `${Math.max(lo, Math.min(hi, h0 - (e.clientY - y0)))}px`, top: "auto", maxHeight: "none", transition: "none" });
    },
    onPointerUp(e: RPE) {
      const b = box();
      if (!on || !b) return;
      on = false;
      const dy = e.clientY - y0, h = b.getBoundingClientRect().height;
      Object.assign(b.style, { height: "", top: "", maxHeight: "", transition: "" });
      if (Math.abs(dy) < 8) { tap(); return; }
      const s = [...snaps()].sort((a, b) => a.px - b.px);
      let i = s.reduce((best, x, k) => (Math.abs(x.px - h) < Math.abs(s[best].px - h) ? k : best), 0);
      const from = s.findIndex((x) => x.name === current());
      if (i === from && Math.abs(dy) > 30) i = Math.max(0, Math.min(s.length - 1, from + (dy < 0 ? 1 : -1)));
      settle(s[i].name);
    },
    onPointerCancel() { const b = box(); on = false; if (b) Object.assign(b.style, { height: "", top: "", maxHeight: "", transition: "" }); },
  };
}

/** The usable height between the top bar and the bottom navigation (CSS px). */
export function sheetRoom(): number {
  const cs = getComputedStyle(document.querySelector(".app") ?? document.documentElement);
  const v = (n: string, d: number) => parseFloat(cs.getPropertyValue(n)) || d;
  const nav = document.querySelector(".app.touch .tabs")?.getBoundingClientRect().height ?? v("--tab-h", 56);
  return innerHeight - v("--cmd-h", 48) - nav;
}
