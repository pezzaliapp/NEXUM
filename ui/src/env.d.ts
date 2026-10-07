/// <reference types="vite/client" />
/// <reference types="geojson" />
/** true in the online (web) build, false in the local build — replaced at build time (vite.config.ts). */
declare const __NEXUM_WEB__: boolean;
/** the web build's id (vite.config.ts), published as /version.json: how a running page knows a newer deploy exists. */
declare const __NEXUM_BUILD__: string;
/** where MapLibre's shared engine and worker are served (vite.config.ts): one copy for the main thread and the worker. */
declare const __MAP_VENDOR__: string;
