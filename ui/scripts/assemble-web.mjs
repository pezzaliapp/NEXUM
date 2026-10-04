// Assemble the online deployment (Phase 3): the web build (dist-web) + the current snapshot + host configuration.
//   node scripts/assemble-web.mjs [--snapshot ../data/snapshot/d1] [--out ../data/deploy/web]
// Output (never versioned, under data/): index.html and assets, current.json, s/<version>/…, _headers (Cloudflare
// Pages), 404.html (a missing file answers 404, not the app), robots.txt, THIRD-PARTY-NOTICES.txt.
// Checks: ≤ 20,000 files and ≤ 25 MiB per file (Cloudflare Pages Free); O7 (≤ 9,000 snapshot files) is checked by the builder.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const snapRoot = path.resolve(root, arg("--snapshot", "../data/snapshot/d1"));
const out = path.resolve(root, arg("--out", "../data/deploy/web"));
const dist = path.join(root, "dist-web");
if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("dist-web missing: run `npm run build:web`");
const cur = JSON.parse(fs.readFileSync(path.join(snapRoot, "current.json"), "utf8"));
const snap = path.join(snapRoot, "s", cur.version);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(dist, out, { recursive: true, filter: (src) => !src.includes(`${path.sep}.vite`) });
// the snapshot's files are immutable: hard links keep the deployment folder cheap
const link = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); link(s, d); }
    else if (e.name !== "files.json") fs.linkSync(s, d);
  }
};
fs.mkdirSync(path.join(out, "s", cur.version), { recursive: true });
link(snap, path.join(out, "s", cur.version));
fs.writeFileSync(path.join(out, "current.json"), JSON.stringify(cur));

// images of approved sources, loaded only when the person opens them: an explicit list of origins, never a wildcard
const HOSTS = JSON.parse(fs.readFileSync(path.join(root, "media-hosts.json"), "utf8"));
// live video (2026-10-04): the origins of the publishers' live streams — HLS playlists and segments (read by the
// player: connect-src, media-src) and MJPEG streams (shown as an image: img-src)
const MEDIA = HOSTS.img, CONNECT = HOSTS.connect ?? [], VIDEO = HOSTS.video ?? [];
if ([...MEDIA, ...CONNECT, ...VIDEO].some((h) => !/^https:\/\/[a-z0-9.-]+(:\d{2,5})?$/.test(h))) throw new Error("media-hosts.json: only explicit https origins");
const CSP = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob: ${MEDIA.join(" ")}; ` +
  `media-src 'self' blob: ${VIDEO.join(" ")}; ` +
  `style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' ${[...CONNECT, ...VIDEO].join(" ")}; manifest-src 'self'; ` +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
fs.writeFileSync(path.join(out, "_headers"), [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: no-referrer",
  `  Content-Security-Policy: ${CSP}`,
  "  Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/s/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/current.json",
  "  Cache-Control: no-cache",
  "/index.html",
  "  Cache-Control: no-cache",
  "",
].join("\n"));
fs.writeFileSync(path.join(out, "404.html"),
  "<!doctype html><meta charset=utf-8><title>NEXUM — non trovato</title><p>Risorsa non trovata. <a href=\"/\">NEXUM</a></p>\n");
// test deployment: not indexed until the author approves the public address (E3)
fs.writeFileSync(path.join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");

// third-party notices: runtime packages distributed in the bundle (from the lockfile), Apache-2.0 text, data sources
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages;
const lic = JSON.parse(fs.readFileSync(path.join(root, "..", "data", "reports", "phase2", "licenses.json"), "utf8"));
const runtime = lic.list.filter((r) => r.class === "runtime_distributed").sort((a, b) => a.name.localeCompare(b.name));
const apache = fs.readFileSync(path.join(root, "node_modules", "detect-libc", "LICENSE"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(snap, "manifest.json"), "utf8"));
const notices = [
  "NEXUM — https://github.com/pezzaliapp/NEXUM — MIT License, Copyright (c) 2026 Alessandro Pezzali",
  "",
  "SOFTWARE DI TERZE PARTI DISTRIBUITO IN QUESTA APPLICAZIONE",
  ...runtime.map((r) => `- ${r.name} ${r.version} — ${r.license}${lock[`node_modules/${r.name}`]?.resolved ? ` — ${lock[`node_modules/${r.name}`].resolved}` : ""}`),
  "",
  "@sqlite.org/sqlite-wasm è distribuito con licenza Apache-2.0 (il pacchetto npm non include il testo della licenza,",
  "riportato qui sotto); SQLite è di pubblico dominio (https://sqlite.org/copyright.html).",
  "",
  "DATI (snapshot " + manifest.version + ", mondo " + manifest.world + ")",
  ...Object.entries(manifest.sources).map(([id, s]) => `- ${s.name} (${id}) — ${s.license_id} — ${s.attribution}`),
  "",
  "IMMAGINI DALL'ORBITA (chieste dal browser solo su richiesta; nessuna copia, nessun archivio, nessun proxy)",
  "- NASA GIBS / ESDIS (Worldview Snapshots), NASA CMR: imagery NASA, attribuzione richiesta; HLS S30: contains modified Copernicus Sentinel data.",
  "- EUMETSAT EUMETView: Contains modified EUMETSAT Meteosat data (Core data, CC BY 4.0).",
  "",
  "ILLUMINAZIONE DELLA MAPPA (non è una fonte di NEXUM: nessun elemento, regola o evidenza deriva da essa)",
  "- Giorno, notte e terminatore: calcolati nel browser dall'ora UTC corrente (posizione del Sole), nessun dato esterno.",
  "- ref/night-lights-2016.webp — Luci notturne: NASA Earth Observatory, Black Marble 2016 (VIIRS Day/Night Band),",
  "  composito delle notti serene del 2016, scala di grigi 0,1° ridotta a circa 0,13° (ui/scripts/night-lights.py).",
  "  Immagine di RIFERIMENTO, mai presentata come osservazione in tempo reale. NASA Images and Media Usage Guidelines:",
  "  generalmente non soggetta a copyright negli USA; NASA indicata come fonte; nessun avallo implicito.",
  "  https://earthobservatory.nasa.gov/images/144898/earth-at-night-black-marble-2016-color-maps",
  "",
  "=".repeat(78),
  apache,
].join("\n");
fs.writeFileSync(path.join(out, "THIRD-PARTY-NOTICES.txt"), notices);

// limits of the host
let files = 0, biggest = ["", 0];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else { files++; const s = fs.statSync(p).size; if (s > biggest[1]) biggest = [p, s]; }
} };
walk(out);
const report = { out, version: cur.version, files, biggest_file: path.relative(out, biggest[0]), biggest_bytes: biggest[1],
  limits: { files: 20000, bytes_per_file: 25 * 1024 * 1024 } };
if (files > 20000 || biggest[1] > 25 * 1024 * 1024) { console.error(JSON.stringify(report)); process.exit(1); }
console.log(JSON.stringify(report));
