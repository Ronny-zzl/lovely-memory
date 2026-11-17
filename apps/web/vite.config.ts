import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import YAML from "yaml";

/** artists/*\/setlists/*.yaml をビルド時に JSON モジュールへ変換する（ブラウザに YAML パーサを載せない） */
function yamlPlugin(): Plugin {
  return {
    name: "lovely-memory:yaml",
    transform(code, id) {
      if (!/\.ya?ml$/.test(id)) return null;
      return { code: `export default ${JSON.stringify(YAML.parse(code))};`, map: null };
    },
  };
}

// GitHub Pages では BASE_PATH=/lovely-memory/ を渡してビルドする
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), yamlPlugin()],
});
