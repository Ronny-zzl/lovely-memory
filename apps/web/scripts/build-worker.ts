/*
 * Cloudflare Pages 用の dist/_worker.js（API）と dist/_routes.json を作る。vite build の後に実行。
 * _routes.json で /api/* と /assets/* だけを Worker に回し、ほかの静的ファイルは Worker を通さない（無料枠の消費を抑える）。
 * /assets/* は、無いファイルに SPA の HTML が返って CDN にキャッシュされるのを防ぐため（worker/index.ts の serveAsset）。
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
await build({
  entryPoints: [`${root}worker/index.ts`],
  outfile: `${root}dist/_worker.js`,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: true,
  logLevel: "warning",
});
await writeFile(`${root}dist/_routes.json`, JSON.stringify({ version: 1, include: ["/api/*", "/assets/*"], exclude: [] }, null, 2) + "\n");
console.log("worker: dist/_worker.js, dist/_routes.json");
