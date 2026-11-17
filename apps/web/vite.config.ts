import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { artistsData } from "./plugins/artists-data.ts";

// hash ルーティングなので、アセットを相対パスにしておけば どの URL 配下に置いても動く
// （GitHub Pages の /lovely-memory/ でも Cloudflare Pages のルートでも同じビルドを使える）
export default defineConfig({
  base: "./",
  plugins: [react(), artistsData()],
});
