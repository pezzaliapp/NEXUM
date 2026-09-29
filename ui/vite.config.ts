import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The UI always calls relative /api/v1 URLs: in development Vite forwards them to the local service,
// in production the service itself serves the built files (same origin, no CORS).
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, proxy: { "/api": "http://127.0.0.1:8765" } },
  worker: { format: "es" },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200, manifest: true },
});
