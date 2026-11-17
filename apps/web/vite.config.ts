import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { artistsData } from "./plugins/artists-data.ts";

// GitHub Pages では BASE_PATH=/lovely-memory/ を渡してビルドする
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), artistsData()],
});
