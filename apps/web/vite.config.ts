import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiDev } from "./plugins/api-dev.ts";
import { artistsData } from "./plugins/artists-data.ts";
import { preloadRoute } from "./plugins/preload-route.ts";
import { serviceWorker } from "./plugins/service-worker.ts";
import { siteMeta } from "./plugins/site-meta.ts";

// 通常のパスでルーティングするため、アセットは絶対パス（サイトはドメインのルートに置く）
export default defineConfig({
  base: "/",
  // エラーの記録に、どのビルドで起きたかを残す（GitHub Actions ではコミット）
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? "local") },
  plugins: [react(), artistsData(), apiDev(), siteMeta(), preloadRoute(), serviceWorker()],
});
