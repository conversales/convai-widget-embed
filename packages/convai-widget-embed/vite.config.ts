import { defineConfig } from "vite";
import analyzer from "vite-bundle-analyzer";

export default defineConfig({
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  build: {
    lib: {
      name: "ConvaiWidgetEmbed",
      entry: "src/index.ts",
      fileName: () => "index.js",
      formats: ["iife"],
    },
    outDir: "dist",
  },
  plugins: [...(process.env.ANALYZE ? [analyzer()] : [])],
});
