// U8 — gzip -9 size of the initial JavaScript (entry + its static imports, from the Vite manifest) and of all JS in dist.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(dist, ".vite", "manifest.json"), "utf8"));
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).length;
const entry = Object.values(manifest).find((c) => c.isEntry);
const initial = new Set();
const walk = (c) => { if (!c || initial.has(c.file)) return; initial.add(c.file); (c.imports ?? []).forEach((k) => walk(manifest[k])); };
walk(entry);
const initialKb = [...initial].filter((f) => f.endsWith(".js")).reduce((a, f) => a + gz(f), 0) / 1000;
const all = fs.readdirSync(path.join(dist, "assets")).filter((f) => f.endsWith(".js"));
const totalKb = all.reduce((a, f) => a + gz(path.join("assets", f)), 0) / 1000;
const out = { initial_js_gz_kb: +initialKb.toFixed(1), total_js_gz_kb: +totalKb.toFixed(1), files: all,
  target: "initial ≤ 600 kB, total ≤ 900 kB", pass: initialKb <= 600 && totalKb <= 900 };
console.log(JSON.stringify(out));
fs.writeFileSync(path.join(dist, "..", "..", "data", "reports", "phase2", "bundle.json"), JSON.stringify(out, null, 1));
