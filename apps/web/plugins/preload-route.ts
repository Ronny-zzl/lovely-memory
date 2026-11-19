import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Plugin, Rollup } from "vite";

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

/*
 * 開いた URL のページのコードとアーティストのデータを、index.js と同時に読み込み始める。
 *
 * ページのコード（main.tsx の lazy）とアーティストのデータ（data.ts の import()）は、
 * index.js を読み込んで実行してから要求されるので、そのままだと読み込みが 1 段遅れる。
 * ビルド結果からそれぞれのチャンク（と、その先で必要になるチャンク）を調べ、
 * URL に合うものを <link rel="modulepreload"> で先に要求する小さなスクリプトを index.html に入れる。
 * ページの CSS も同じく <link rel="stylesheet"> で先に入れる（Vite は同じ href の link があれば読み込み直さない）。
 *
 * 同じ一覧を dist/route-assets.json にも書き出す。ビルド時に HTML を作る scripts/prerender.ts が、
 * ページごとの CSS を最初から <link> で入れるのに使う（その後で消す）。
 */

/** prerender.ts が読む一覧（pages: ページ名 → ファイル、artists: アーティスト id → ファイル） */
export type RouteAssets = { pages: Record<string, string[]>; artists: Record<string, string[]> };
export const ROUTE_ASSETS_FILE = "route-assets.json";

/** pages/ のファイル名 → main.tsx のルート。パスの判定はスクリプトの PAGE_OF と揃える */
const PAGES = [
  "ArtistList",
  "SongStatsPage",
  "SongDetailPage",
  "EventsPage",
  "EventDetailPage",
  "TrendsPage",
  "MembersPage",
  "AttendancePage",
];
const ARTIST_MODULE = /virtual:lovely-memory\/artist\/([^/?]+)$/;

/**
 * チャンクと、その先で読み込まれるチャンク・CSS のファイル名。
 * 入口（index.js）とそのまま読み込まれるもの（already）は、index.html に既に入っているので除く
 */
function filesFor(chunk: OutputChunk, bundle: OutputBundle, already: Set<string>): string[] {
  const out = new Set<string>();
  const visit = (c: OutputChunk) => {
    if (already.has(c.fileName) || out.has(c.fileName)) return;
    out.add(c.fileName);
    for (const f of c.imports) {
      const next = bundle[f];
      if (next?.type === "chunk") visit(next);
    }
    // CSS は依存先の後に自分の分（Vite が読み込む順と同じ。ページの CSS が部品の CSS より後に来る）
    for (const css of c.viteMetadata?.importedCss ?? []) if (!already.has(css)) out.add(css);
  };
  visit(chunk);
  return [...out];
}

export function preloadRoute(): Plugin {
  let assets: RouteAssets | undefined;
  return {
    name: "lovely-memory:preload-route",
    // ブラウザ用のビルドだけ（ビルド時の描画用のビルド --ssr では使わない）
    apply: (_config, env) => env.command === "build" && !env.isSsrBuild,
    async writeBundle(options) {
      if (assets) await writeFile(join(options.dir!, ROUTE_ASSETS_FILE), JSON.stringify(assets));
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return;
        const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === "chunk");
        const entry = chunks.find((c) => c.isEntry);
        if (!entry) return;
        const already = new Set<string>();
        filesFor(entry, bundle, already).forEach((f) => already.add(f));

        const pages: Record<string, string[]> = {};
        const artists: Record<string, string[]> = {};
        for (const c of chunks) {
          const id = c.facadeModuleId ?? "";
          const page = PAGES.find((p) => id.endsWith(`/pages/${p}.tsx`));
          if (page) pages[page] = filesFor(c, bundle, already);
          const artist = id.match(ARTIST_MODULE)?.[1];
          if (artist) artists[artist] = filesFor(c, bundle, already);
        }
        assets = { pages, artists };
        const missing = PAGES.filter((p) => !pages[p]);
        if (missing.length) this.warn(`preload-route: チャンクが見つからないページ: ${missing.join(", ")}`);

        const script = `(function(){
var P=${JSON.stringify(pages)},A=${JSON.stringify(artists)};
var s=location.pathname.split("/").filter(Boolean);
var PAGE_OF={songs:s[2]?"SongDetailPage":"SongStatsPage",events:s[2]?"EventDetailPage":"EventsPage",trends:"TrendsPage",members:"MembersPage",attendance:"AttendancePage"};
var page=s.length===0?"ArtistList":s.length===1?"SongStatsPage":PAGE_OF[s[1]];
var files=[].concat((page&&P[page])||[],(s[0]&&A[s[0]])||[]);
files.forEach(function(f){if(document.querySelector('link[href="/'+f+'"]'))return;var l=document.createElement("link");l.rel=f.slice(-4)===".css"?"stylesheet":"modulepreload";l.href="/"+f;document.head.appendChild(l);});
})();`;
        // ビルド時に中身を描いた HTML では、prerender.ts がこのスクリプトを外して <link> を直接入れる（目印の属性）
        return [{ tag: "script", attrs: { "data-route-preload": true }, children: script, injectTo: "head" }];
      },
    },
  };
}
