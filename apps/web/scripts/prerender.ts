/*
 * 各ページの HTML を、中身を描いた状態で作る（dist/<path>.html、トップは dist/index.html）。
 * ブラウザでは main.tsx がこの HTML を引き継ぐ（hydrate）ので、スクリプトを読み込む前から中身が見える。
 *
 * build の流れ（package.json）：
 *   1. vite build                                         ブラウザ用 → dist/
 *   2. vite build --ssr src/entry-server.tsx --outDir dist-ssr   ビルド時の描画用
 *   3. node scripts/prerender.ts                          これ
 *
 * - 型は dist/index.html（中身の代わりに読み込み中の形が入っている）。#root の中の印（app・/app）の間を差し替える
 * - ページの CSS・コードは、ページごとに <link> で最初から入れる（ブラウザで入れる小さなスクリプトは外す）
 * - 中身の無い型そのものは shell.html（オフラインで未訪問のページを開いたとき）と 404.html（存在しないパス）に残す
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROUTE_ASSETS_FILE, type RouteAssets } from "../plugins/preload-route.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const started = Date.now();

const server = (await import(pathToFileURL(join(root, "dist-ssr/entry-server.js")).href)) as {
  paths(): Promise<string[]>;
  render(path: string): Promise<string>;
};
const template = await readFile(join(dist, "index.html"), "utf8");
const assets = JSON.parse(await readFile(join(dist, ROUTE_ASSETS_FILE), "utf8")) as RouteAssets;

const APP = /<!--app-->[\s\S]*<!--\/app-->/;
const PRELOAD_SCRIPT = /<script data-route-preload[^>]*>[\s\S]*?<\/script>\s*/;
if (!APP.test(template) || !PRELOAD_SCRIPT.test(template))
  throw new Error("dist/index.html に #root の印（app・/app）か data-route-preload のスクリプトが無い");

/** パスのページ名（preload-route.ts のスクリプトの PAGE_OF と同じ判定） */
function pageOf(path: string): string | undefined {
  const s = path.split("/").filter(Boolean);
  if (s.length === 0) return "ArtistList";
  const PAGE_OF: Record<string, string> = {
    songs: s[2] ? "SongDetailPage" : "SongStatsPage",
    events: s[2] ? "EventDetailPage" : "EventsPage",
    trends: "TrendsPage",
    members: "MembersPage",
    attendance: "AttendancePage",
  };
  return s.length === 1 ? "SongStatsPage" : PAGE_OF[s[1]!];
}

/** ページの CSS（<link rel="stylesheet">）とコード（<link rel="modulepreload">） */
function linksFor(path: string): string {
  const page = pageOf(path);
  const artist = path.split("/").filter(Boolean)[0];
  const files = [...((page && assets.pages[page]) || []), ...((artist && assets.artists[artist]) || [])];
  return files
    .map((f) => (f.endsWith(".css") ? `<link rel="stylesheet" href="/${f}">` : `<link rel="modulepreload" href="/${f}">`))
    .join("\n    ");
}

async function write(path: string, html: string) {
  const file = join(dist, path === "/" ? "index.html" : `${path}.html`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

// 中身の無い型（ブラウザで描く）
await writeFile(join(dist, "shell.html"), template);
await writeFile(join(dist, "404.html"), template);

const paths = await server.paths();
// グループのトップ（/<id>）は楽曲のページへ移るだけなので、型のまま置く（ブラウザで移動する）
for (const id of new Set(paths.map((p) => p.split("/")[1]).filter(Boolean))) await write(`/${id}`, template);

for (const path of paths) {
  const body = await server.render(path);
  const html = template
    .replace(APP, () => `<!--app-->${body}<!--/app-->`)
    // どのパスの中身か（ブラウザは、今のパスと同じときだけ引き継ぐ）
    .replace('<div id="root">', () => `<div id="root" data-prerendered="${path}">`)
    .replace(PRELOAD_SCRIPT, "")
    .replace("</head>", () => `    ${linksFor(path)}\n  </head>`);
  await write(path, html);
}

await rm(join(dist, ROUTE_ASSETS_FILE));
console.log(`prerender: ${paths.length} ページ（${((Date.now() - started) / 1000).toFixed(1)} 秒）`);
