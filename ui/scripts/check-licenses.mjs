// W2 — licence policy (ui/license-policy.json): runtime/distributed packages vs build-only packages, with nominal,
// verified exceptions. The direct dependencies must be exactly the approved ones (§M).
// Writes ../data/reports/phase2/licenses.json; exit 1 on any violation.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repo = path.resolve(root, "..");
const policy = JSON.parse(fs.readFileSync(process.env.NEXUM_LICENSE_POLICY ?? path.join(root, "license-policy.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
// @sqlite.org/sqlite-wasm: Phase 3 decision E4 (approved 2026-09-29), Apache-2.0 — the Core's FTS5 index in the browser
// hls.js (2026-10-04, Apache-2.0): plays the publishers' live HLS video in browsers without native HLS, loaded only
// when a person starts a live camera
const RUNTIME = ["@sqlite.org/sqlite-wasm", "graphology", "hls.js", "maplibre-gl", "react", "react-dom", "sigma"];
const DEV = ["@playwright/test", "@types/react", "@types/react-dom", "@vitejs/plugin-react", "typescript", "vite"];
const problems = [];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (!same(Object.keys(pkg.dependencies ?? {}), RUNTIME)) problems.push({ direct: "runtime dependencies differ" });
if (!same(Object.keys(pkg.devDependencies ?? {}), DEV)) problems.push({ direct: "dev dependencies differ" });

// runtime closure through the lockfile (node resolution: nested first, then top level)
const entries = lock.packages;
const resolve = (from, name) => {
  let dir = from;
  while (true) {
    const cand = (dir ? dir + "/" : "") + "node_modules/" + name;
    if (entries[cand]) return cand;
    if (!dir) return null;
    const i = dir.lastIndexOf("/node_modules/");
    dir = i >= 0 ? dir.slice(0, i) : "";
  }
};
const runtime = new Set();
const stack = RUNTIME.map((n) => resolve("", n));
while (stack.length) {
  const k = stack.pop();
  if (!k || runtime.has(k)) continue;
  runtime.add(k);
  for (const d of Object.keys({ ...(entries[k].dependencies ?? {}), ...(entries[k].peerDependencies ?? {}) })) stack.push(resolve(k, d));
}
const nameOf = (k) => k.replace(/^.*node_modules\//, "");
const licOf = (k) => entries[k].license ?? (fs.existsSync(path.join(root, k, "package.json"))
  ? JSON.parse(fs.readFileSync(path.join(root, k, "package.json"), "utf8")).license : null);

// verification helpers for build-only exceptions
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const distFiles = walk(path.join(root, "dist"));
const distHashes = new Set(distFiles.map(sha));
const distJs = distFiles.filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: repo }).toString()
  .split("\n").filter(Boolean).map((f) => path.join(repo, f)).filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
const trackedHashes = new Set(tracked.map(sha));

const list = [];
for (const k of Object.keys(entries)) {
  if (!k || !fs.existsSync(path.join(root, k))) continue;
  const name = nameOf(k), lic = String(licOf(k)), isRuntime = runtime.has(k);
  const row = { name, version: entries[k].version, license: lic, class: isRuntime ? "runtime_distributed" : "build_only" };
  list.push(row);
  if (isRuntime) {
    if (!policy.runtime_distributed.allow.includes(lic)) problems.push({ ...row, why: "runtime licence not allowed" });
    continue;
  }
  if (policy.build_only.allow.includes(lic)) continue;
  const ex = policy.build_only.exceptions.find((e) => e.packages.includes(name) && e.license === lic);
  if (!ex) { problems.push({ ...row, why: "build-only licence not allowed and no approved exception" }); continue; }
  const files = walk(path.join(root, k)).filter((f) => !f.endsWith("package.json"));
  const checks = {
    not_runtime: !isRuntime && entries[k].dev === true,
    not_in_bundle: files.every((f) => !distHashes.has(sha(f))) && !new RegExp(`["'\`]${name}["'\`/]`).test(distJs),
    not_copied_in_project: files.every((f) => !trackedHashes.has(sha(f))) && !tracked.some((f) => f.includes(`/${name}/`)),
  };
  row.exception = { approved_on: ex.approved_on, checks };
  if (!Object.values(checks).every(Boolean)) problems.push({ ...row, why: "exception conditions not met" });
}
const out = { packages: list.length, runtime_distributed: list.filter((r) => r.class === "runtime_distributed").length,
  build_only: list.filter((r) => r.class === "build_only").length,
  by_license: list.reduce((m, r) => ((m[`${r.class}:${r.license}`] = (m[`${r.class}:${r.license}`] ?? 0) + 1), m), {}),
  exceptions_used: list.filter((r) => r.exception).map((r) => ({ name: r.name, license: r.license, ...r.exception })), problems };
fs.mkdirSync(path.join(repo, "data", "reports", "phase2"), { recursive: true });
fs.writeFileSync(path.join(repo, "data", "reports", "phase2", "licenses.json"), JSON.stringify({ ...out, list }, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(problems.length ? 1 : 0);
