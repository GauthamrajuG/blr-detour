// MapLibre v6 runs its tile parser in a module worker that bundlers don't emit.
// Copy it to /public so the app can point maplibre at it with setWorkerUrl().
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgPath = require.resolve("maplibre-gl/package.json");
const src = path.join(path.dirname(pkgPath), "dist", "maplibre-gl-worker.mjs");
const outDir = path.join(process.cwd(), "public", "maplibre");
mkdirSync(outDir, { recursive: true });
copyFileSync(src, path.join(outDir, "maplibre-gl-worker.mjs"));
console.log("copied maplibre worker to public/maplibre/");
