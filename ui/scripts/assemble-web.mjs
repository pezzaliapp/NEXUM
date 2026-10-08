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
const MEDIA = HOSTS.img, CONNECT = HOSTS.connect ?? [], VIDEO = HOSTS.video ?? [], FRAME = HOSTS.frame ?? [], TILES = HOSTS.tiles ?? [];
if ([...MEDIA, ...CONNECT, ...VIDEO, ...FRAME, ...TILES].some((h) => !/^https:\/\/[a-z0-9.-]+(:\d{2,5})?$/.test(h))) throw new Error("media-hosts.json: only explicit https origins");
// the full policy travels in the page itself (a <meta> element, the first one of <head>): Cloudflare Pages drops a header
// value longer than 2,000 characters (2026-10-04: the allowlist of the operational tools is ~3,000), and a dropped
// policy is no policy. The header keeps what a <meta> policy cannot carry (frame-ancestors) and two hard locks.
const CSP = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob: ${[...MEDIA, ...TILES].join(" ")}; ` +
  `media-src 'self' blob: ${VIDEO.join(" ")}; ` +
  `style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' ${[...CONNECT, ...VIDEO, ...TILES].join(" ")}; manifest-src 'self'; ` +
  `frame-src ${FRAME.length ? FRAME.join(" ") : "'none'"}; ` +
  "object-src 'none'; base-uri 'self'";
const CSP_HEADER = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";
const indexFile = path.join(out, "index.html");
const html = fs.readFileSync(indexFile, "utf8");
if (!/<meta charset="UTF-8"\s*\/?>/i.test(html)) throw new Error("index.html: no <meta charset> to anchor the policy");
fs.writeFileSync(indexFile, html.replace(/(<meta charset="UTF-8"\s*\/?>)/i, `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`));
fs.writeFileSync(path.join(out, "_headers"), [
  "/*",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: no-referrer",
  `  Content-Security-Policy: ${CSP_HEADER}`,
  "  Permissions-Policy: geolocation=(self), camera=(), microphone=(), interest-cohort=()",   // geolocation: SKY, only when the person asks
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/vendor/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/s/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/current.json",
  "  Cache-Control: no-cache",
  "/index.html",
  "  Cache-Control: no-cache",
  "/",
  "  Cache-Control: no-cache",
  "/version.json",
  "  Cache-Control: no-store",
  "/providers.json",
  "  Cache-Control: no-cache",
  "/sw.js",
  "  Cache-Control: no-cache",
  "/manifest.webmanifest",
  "  Cache-Control: no-cache",
  "",
].join("\n"));
// Cloudflare Pages ignores a header value over 2,000 characters: never let a policy be dropped silently
for (const l of fs.readFileSync(path.join(out, "_headers"), "utf8").split("\n")) if (l.length > 1900) throw new Error(`_headers: line over Pages' limit (${l.length})`);
fs.writeFileSync(path.join(out, "404.html"),
  "<!doctype html><meta charset=utf-8><title>NEXUM — non trovato</title><p>Risorsa non trovata. <a href=\"/\">NEXUM</a></p>\n");
// the routing services, read by the app at run time (FOSSGIS: service addresses not fixed in the app; switched here)
fs.writeFileSync(path.join(out, "providers.json"), JSON.stringify({ note: "NEXUM routing providers, in order of use; set \"on\": false to switch one off", route: JSON.parse(fs.readFileSync(path.join(root, "src", "config", "ops.json"), "utf8")).route.providers }, null, 1) + "\n");
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
  "RETE MARITTIMA (api/tables/searoutes.json, il motore della «Rotta marittima tra due porti»; non disegnata come livello)",
  "- Derivata da Eurostat SeaRoute \"MARNET\" (© European Union, Eurostat; https://github.com/eurostat/searoute, commit",
  "  0d777c05758503361d799dc0c0a23e09be1d82ae, file marnet_plus_50km.gpkg), licenza EUPL-1.2: testo in /licenses/EUPL-1.2.txt.",
  "- Basata su Oak Ridge National Laboratory, Center for Transportation Analysis, \"Global Shipping Lane Network / global",
  "  seaways\" (Intermodal Transportation Network, 2000; dichiarata di pubblico dominio da ORNL), tramite l'archivio",
  "  GeoCommons (geoiq/gc_data, dataset 25).",
  "- MODIFICATA da NEXUM il 2026-10-07: coordinate arrotondate a 0,01°, tratti contigui uniti — connectors/searoute_marnet.py.",
  "  Il file derivato è distribuito con licenza EUPL-1.2. Nessuna approvazione di Eurostat o di ORNL è implicata.",
  "- Porti di partenza e arrivo: NGA World Port Index (pubblico dominio).",
  "",
  "SERVIZI CHIESTI DAL BROWSER SOLO SU RICHIESTA (strumenti e livelli operativi; nessuna copia, nessun proxy)",
  ...(() => { const O = JSON.parse(fs.readFileSync(path.join(root, "src", "config", "ops.json"), "utf8"));
    return [O.alerts.geoCredit, O.alerts.gdacsCredit, O.alerts.nwsCredit, O.portwatch.credit, O.route.credit, O.cables.credit, O.routes.credit, O.arcgis.credit].map((c) => `- ${c}`); })(),
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
// the licence of the derived maritime network (EUPL-1.2, its text as Eurostat publishes it at the pinned commit)
fs.mkdirSync(path.join(out, "licenses"), { recursive: true });
fs.copyFileSync(path.join(root, "licenses", "EUPL-1.2.txt"), path.join(out, "licenses", "EUPL-1.2.txt"));

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
