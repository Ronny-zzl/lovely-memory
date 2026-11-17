import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages では https://<user>.github.io/lovely-memory/ で配信される
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
