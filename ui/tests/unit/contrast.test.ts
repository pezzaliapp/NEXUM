// W30 — every text colour token has contrast ≥ 4.5:1 on every background token (WCAG AA), computed from styles.css.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const token = (n: string) => root.match(new RegExp(`--${n}:\\s*(#[0-9A-Fa-f]{6})`))![1];
const lum = (h: string) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("W30 text tokens ≥ 4.5:1 on every background", () => {
  const out: string[] = [];
  for (const t of ["text", "dim", "faint", "accent", "link", "danger"])
    for (const b of ["bg", "panel", "raised"]) {
      const r = ratio(token(t), token(b));
      if (r < 4.5) out.push(`${t} on ${b}: ${r.toFixed(2)}`);
    }
  assert.deepEqual(out, []);
});

test("W30 visible keyboard focus is defined", () => {
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/);
});
