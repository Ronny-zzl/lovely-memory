import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { artistsData } from "./plugins/artists-data.ts";
import { ogMeta } from "./plugins/og-meta.ts";

// 通常のパスでルーティングするため、アセットは絶対パス（サイトはドメインのルートに置く）
export default defineConfig({
  base: "/",
  plugins: [react(), artistsData(), ogMeta()],
});
