// Parity suite, browser-model side (O4): answers the Core's parity cases (nexum.snapshot.parity) from the snapshot
// with the same code the browser runs (src/snapshot), in Node, and compares status and data.
// Ignored: timing_ms, bytes (serialisation measures) and the transport fields of `api` (channel, seq, elapsed, cache).
//   node tests/parity/run.ts [../data/snapshot/d1]      → exit 1 on any difference; report in the parity folder
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { SnapshotData } from "../../src/snapshot/data.ts";
import { SnapshotApi } from "../../src/snapshot/routes.ts";
import { openSearch } from "../../src/snapshot/search.ts";
import { decodePolygons } from "../../src/snapshot/basemap.ts";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../../../data/snapshot/d1"));
const cur = JSON.parse(fs.readFileSync(path.join(root, "current.json"), "utf8"));
const snap = path.join(root, "s", cur.version);
const pdir = path.join(root, "parity", cur.version);

const d = new SnapshotData(async (p) => {
  const f = path.join(snap, p);
  return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null;
}, async (b) => (b[0] === 0x1f && b[1] === 0x8b ? new Uint8Array(zlib.gunzipSync(b)) : b));
await d.init();
const api = new SnapshotApi(d);
api.rm.setSearchEngine(async () => openSearch(await d.bytes("search.sqlite.jgz")));

function params(o: Record<string, any>): Record<string, string> {
  // the workspace's query-string encoding (ui/src/lib/api.ts qs): objects as JSON, "" and null omitted
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    p[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return p;
}

function normalize(b: any): any {
  if (!b || typeof b !== "object") return b;
  const o = { ...b };
  delete o.timing_ms;
  delete o.bytes;
  if (o.api) o.api = { op: o.api.op, deadline_ms: o.api.deadline_ms, budget_applied: o.api.budget_applied };
  return o;
}

function diff(a: any, b: any, at = "$"): string | null {
  if (typeof a === "number" && typeof b === "number") return a === b ? null : `${at}: ${a} ≠ ${b}`;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object")
    return a === b ? null : `${at}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${at}: array/object mismatch`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${at}: length ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) { const r = diff(a[i], b[i], `${at}[${i}]`); if (r) return r; }
    return null;
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (JSON.stringify(ka) !== JSON.stringify(kb)) return `${at}: keys ${ka.join(",")} ≠ ${kb.join(",")}`;
  for (const k of ka) { const r = diff(a[k], b[k], `${at}.${k}`); if (r) return r; }
  return null;
}

const lines = zlib.gunzipSync(fs.readFileSync(path.join(pdir, "cases.jsonl.gz"))).toString("utf8").split("\n").filter(Boolean);
const stats: Record<string, { n: number; ok: number; ms: number }> = {};
const failures: any[] = [];
const t0 = performance.now();
for (const line of lines) {
  const c = JSON.parse(line);
  const t = performance.now();
  const r = c.group === "basemap" && c.path.endsWith(".bmz") ? { status: 200, body: decodePolygons(await d.bytes(c.path)) }
    : await api.handle("GET", "/api/v1" + c.path, params(c.params));
  const ms = performance.now() - t;
  const s = (stats[c.group] ??= { n: 0, ok: 0, ms: 0 });
  s.n += 1;
  s.ms += ms;
  const why = r.status !== c.status ? `status ${r.status} ≠ ${c.status}: ${JSON.stringify(r.body).slice(0, 200)}`
    : diff(normalize(r.body), normalize(c.body));
  if (why === null) s.ok += 1;
  else failures.push({ group: c.group, path: c.path, params: c.params, why });
}
const total = lines.length, ok = Object.values(stats).reduce((a, s) => a + s.ok, 0);
const report = { snapshot: cur.version, cases: total, identical: ok, different: total - ok,
  by_group: Object.fromEntries(Object.entries(stats).map(([g, s]) => [g, { cases: s.n, identical: s.ok,
    mean_ms: Math.round((s.ms / s.n) * 10) / 10 }])),
  seconds: Math.round((performance.now() - t0) / 100) / 10, failures: failures.slice(0, 200) };
fs.writeFileSync(path.join(pdir, "parity-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, failures: failures.slice(0, 25) }, null, 1));
process.exit(total === ok ? 0 : 1);
