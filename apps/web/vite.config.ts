import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiDev } from "./plugins/api-dev.ts";
import { artistsData } from "./plugins/artists-data.ts";
import { preloadRoute } from "./plugins/preload-route.ts";
import { serviceWorker } from "./plugins/service-worker.ts";
import { siteMeta } from "./plugins/site-meta.ts";

// 通常のパスでルーティングするため、アセットは絶対パス（サイトはドメインのルートに置く）
export default defineConfig(({ isSsrBuild }) => ({
  base: "/",
  // エラーの記録に、どのビルドで起きたかを残す（GitHub Actions ではコミット）
  define: {
    __BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "local"),
    // ビルドした日（JST）。ビルド時に作る HTML はこの日付で描き、ブラウザで引き継いだ後に今日の日付で描き直す（src/hydration.ts）
    __BUILD_TODAY__: JSON.stringify(new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date())),
    // サイトの URL（共有のリンク用）。ビルド時の HTML では location が無いので、これを使う
    __SITE_ORIGIN__: JSON.stringify((process.env.SITE_URL ?? "https://lovely-memory.moe").replace(/\/$/, "")),
  },
  plugins: [react(), artistsData(), apiDev(), siteMeta(), preloadRoute(), serviceWorker()],
  build: isSsrBuild
    ? {
        // ビルド時の描画用（scripts/prerender.ts が dist-ssr/entry-server.js を読み込む）。public/ は要らない
        copyPublicDir: false,
        rollupOptions: { output: { entryFileNames: "[name].js", chunkFileNames: "assets/[name]-[hash].js" } },
      }
    : {
        rollupOptions: {
          // ファイル名の「v2」は、2026-11-19 に CDN・ブラウザ・Service Worker に HTML が JS として残ってしまったのを避けるため、
          // 全ファイルの URL を一度だけ変えたもの（中身が同じでも新しい URL で取り直させる）。上げる必要があるのは同じ事故のときだけ
          output: {
            entryFileNames: "assets/[name]-v2-[hash].js",
            chunkFileNames: "assets/[name]-v2-[hash].js",
            assetFileNames: "assets/[name]-v2-[hash][extname]",
          },
        },
      },
}));
