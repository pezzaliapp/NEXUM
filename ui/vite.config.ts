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

export default defineConfig(({ mode }) => {
  const web = mode === "web";
  return {
    plugins: [react(), ...(web ? [installable()] : [])],
    define: { __NEXUM_WEB__: JSON.stringify(web) },
    publicDir: web ? "web-public" : "public",
    // "@nexum/web": the snapshot client in the web build, an inert stub in the local build
    resolve: { alias: { "@nexum/web": fileURLToPath(new URL(web ? "./src/snapshot/client.ts" : "./src/snapshot/stub.ts", import.meta.url)) } },
    server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8765" } },
    optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
    worker: { format: "es" },
    build: { outDir: web ? "dist-web" : "dist", sourcemap: false, chunkSizeWarningLimit: 1200, manifest: true },
  };
});
