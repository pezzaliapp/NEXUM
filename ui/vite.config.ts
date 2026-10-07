import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The UI always calls relative /api/v1 URLs.
// - default mode (Phase 2, local): in development Vite forwards them to the local service; in production the service
//   itself serves the built files (same origin, no CORS).
// - "web" mode (Phase 3, `vite build --mode web` → dist-web): the same UI, whose /api/v1 is answered in the browser
//   from the static snapshot (src/snapshot); installable manifest (E6). `__NEXUM_WEB__` is a build-time constant, so
//   the local build contains none of the snapshot code.
const installable = (): Plugin => ({
  name: "nexum-installable",
  transformIndexHtml: () => [
    { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "theme-color", content: "#0D1012" }, injectTo: "head" },
    { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }, injectTo: "head" },
    { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "NEXUM" }, injectTo: "head" },
  ],
});

// ONE COPY OF THE MAP ENGINE (2026-10-06, master pass): MapLibre 6's main thread and its worker both import the same
// shared module (maplibre-gl-shared.mjs). Bundled by Vite, the worker carried its own copy (~516 KB, ~140 KB compressed,
// downloaded twice at every first visit). Now MapLibre's two files are served unchanged from a versioned path — only the
// worker's one import is renamed .js, which every host serves as a script — and the main bundle imports the shared module
// from that same address: one download, cached for a year. Same code, same version, no CDN.
const MLV = JSON.parse(fs.readFileSync(new URL("./node_modules/maplibre-gl/package.json", import.meta.url), "utf8")).version;
export const MAP_VENDOR = `/vendor/maplibre/${MLV}`;
const ML_DIST = new URL("./node_modules/maplibre-gl/dist/", import.meta.url);
const mapVendor = (): Plugin => ({
  name: "nexum-map-vendor",
  enforce: "pre",
  resolveId(id, importer) {
    if (id === "./maplibre-gl-shared.mjs" && importer?.includes("maplibre-gl")) return { id: `${MAP_VENDOR}/maplibre-gl-shared.js`, external: true };
    return null;
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: `${MAP_VENDOR.slice(1)}/maplibre-gl-shared.js`, source: fs.readFileSync(new URL("maplibre-gl-shared.mjs", ML_DIST)) });
    this.emitFile({ type: "asset", fileName: `${MAP_VENDOR.slice(1)}/maplibre-gl-worker.js`,
      source: fs.readFileSync(new URL("maplibre-gl-worker.mjs", ML_DIST), "utf8").replace('"./maplibre-gl-shared.mjs"', '"./maplibre-gl-shared.js"') });
  },
  configureServer(server) {   // development: the same addresses, straight from node_modules
    server.middlewares.use((req, res, next) => {
      const m = req.url?.match(/^\/vendor\/maplibre\/[^/]+\/maplibre-gl-(shared|worker)\.js/);
      if (!m) return next();
      let src = fs.readFileSync(new URL(`maplibre-gl-${m[1]}.mjs`, ML_DIST), "utf8");
      if (m[1] === "worker") src = src.replace('"./maplibre-gl-shared.mjs"', '"./maplibre-gl-shared.js"');
      res.setHeader("Content-Type", "application/javascript"); res.end(src);
    });
  },
});

// AUTOMATIC UPDATE (2026-10-06): every web build has its own id, compiled in and published as /version.json; the service
// worker is generated with it and with the files of the first screen (entry script, its static imports, styles)
const BUILD = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12) + "-" + Math.random().toString(36).slice(2, 6);
const release = (): Plugin => ({
  name: "nexum-release",
  generateBundle(_o, bundle) {
    const entry = Object.values(bundle).find((c: any) => c.type === "chunk" && c.isEntry) as any;
    const shell = new Set<string>(["/"]);
    const walk = (f: string) => { const c: any = bundle[f]; if (!c || shell.has("/" + f)) return; shell.add("/" + f);
      for (const css of c.viteMetadata?.importedCss ?? []) shell.add("/" + css); for (const i of c.imports ?? []) walk(i); };
    if (entry) walk(entry.fileName);
    shell.add(`${MAP_VENDOR}/maplibre-gl-shared.js`); shell.add(`${MAP_VENDOR}/maplibre-gl-worker.js`);
    const tpl = fs.readFileSync(new URL("./scripts/sw-template.js", import.meta.url), "utf8");
    this.emitFile({ type: "asset", fileName: "sw.js", source: tpl.replace("__BUILD__", BUILD).replace("__SHELL__", JSON.stringify([...shell])) });
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD, built_at: new Date().toISOString() }) });
  },
});

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    plugins: [mapVendor(), react(), ...(web ? [installable(), release()] : [])],
    define: { __NEXUM_WEB__: JSON.stringify(web), __NEXUM_BUILD__: JSON.stringify(web ? BUILD : "local"), __MAP_VENDOR__: JSON.stringify(MAP_VENDOR) },
    publicDir: web ? "web-public" : "public",
    // "@nexum/web": the snapshot client in the web build, an inert stub in the local build
    // "@nexum/sgp4": the SGP4 orbit propagator (satellite.js, MIT), named by what it does in the domain-agnostic UI
    resolve: { alias: { "@nexum/web": fileURLToPath(new URL(web ? "./src/snapshot/client.ts" : "./src/snapshot/stub.ts", import.meta.url)),
      "@nexum/sgp4": "satellite.js" } },
    server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8765" } },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
    worker: { format: "es" },
    build: { outDir: web ? "dist-web" : "dist", sourcemap: false, chunkSizeWarningLimit: 1200, manifest: true },
  };
});
