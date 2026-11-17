import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { artistsData } from "./plugins/artists-data.ts";
import { siteMeta } from "./plugins/site-meta.ts";

// 通常のパスでルーティングするため、アセットは絶対パス（サイトはドメインのルートに置く）
export default defineConfig({
  base: "/",
  plugins: [react(), artistsData(), siteMeta()],
});
