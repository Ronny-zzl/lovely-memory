import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { apiDev } from "./plugins/api-dev.ts";
import { artistsData } from "./plugins/artists-data.ts";
import { serviceWorker } from "./plugins/service-worker.ts";
import { siteMeta } from "./plugins/site-meta.ts";

// 通常のパスでルーティングするため、アセットは絶対パス（サイトはドメインのルートに置く）
export default defineConfig({
  base: "/",
  plugins: [react(), artistsData(), apiDev(), siteMeta(), serviceWorker()],
});
