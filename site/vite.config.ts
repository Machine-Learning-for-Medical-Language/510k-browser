import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { type Connect, defineConfig, type Plugin } from "vite";

// Site data is produced by `uv run fda510k build-site-data` into ../build/site-data.
// In dev/preview it is served at ./data; in CI it is copied into dist/data.
const dataDir = resolve(process.env.SITE_DATA_DIR ?? "../build/site-data");

function serveSiteData(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const relative = url.pathname.match(/\/data\/(.+)$/)?.[1];
    if (!relative) return next();
    const file = resolve(dataDir, decodeURIComponent(relative));
    if (!file.startsWith(dataDir) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end(`Not found in ${dataDir}. Run: uv run fda510k all`);
      return;
    }
    res.setHeader("Content-Type", "application/json");
    createReadStream(file).pipe(res);
  };
  return {
    name: "serve-site-data",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

export default defineConfig({
  base: "./",
  plugins: [preact(), serveSiteData()],
  // The lazily loaded graph chunk is mostly Cytoscape (~490 kB, ~160 kB gzipped).
  build: { target: "es2022", chunkSizeWarningLimit: 600 },
});
