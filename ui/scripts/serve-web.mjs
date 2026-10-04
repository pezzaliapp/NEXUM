// Local static host for the online deployment, behaving like Cloudflare Pages where it matters for tests:
// _headers rules, 404.html for missing files, Range requests ignored (200 with the full body, as measured on
// Cloudflare Pages), on-the-fly brotli/gzip for text types, no compression for .jgz (already gzip) or images.
//   node scripts/serve-web.mjs [--dir ../data/deploy/web] [--port 8790]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const dir = path.resolve(root, arg("--dir", "../data/deploy/web"));
const port = Number(arg("--port", "8790"));

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".jgz": "application/octet-stream" };
const COMPRESS = /^(text\/|application\/(javascript|json|manifest\+json|wasm)|image\/svg)/;

function rules() {
  const f = path.join(dir, "_headers");
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) out.push({ pat: new RegExp("^" + line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"), h: {} });
    else { const i = line.indexOf(":"); out.at(-1).h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}

const stats = { requests: 0, bytes: 0 };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/__stats") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(stats)); return; }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(dir, p);
  let status = 200;
  if (!f.startsWith(dir) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { f = path.join(dir, "404.html"); status = 404; }
  let body = fs.readFileSync(f);
  const type = TYPES[path.extname(f)] ?? "application/octet-stream";
  const headers = { "Content-Type": type };
  for (const r of rules()) if (r.pat.test(p)) Object.assign(headers, r.h);
  const ae = req.headers["accept-encoding"] ?? "";
  if (COMPRESS.test(type) && body.length > 512) {
    if (/\bbr\b/.test(ae)) { body = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }); headers["Content-Encoding"] = "br"; }
    else if (/gzip/.test(ae)) { body = zlib.gzipSync(body, { level: 6 }); headers["Content-Encoding"] = "gzip"; }
  }
  headers["Content-Length"] = String(body.length);
  stats.requests++; stats.bytes += body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}).listen(port, "127.0.0.1", () => console.log(`NEXUM web → http://127.0.0.1:${port}/ (${dir})`));
