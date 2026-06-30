import preact from "@preact/preset-vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import analyzer from "vite-bundle-analyzer";
import tailwindcss from "@tailwindcss/vite";
import tailwindShadowDOM from "./vite-plugin-tailwind-shadowdom";

export default defineConfig({
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  build: {
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"],
    },
    outDir: "dist",
    rolldownOptions: {
      external: id =>
        id.startsWith("preact") ||
        id.startsWith("@preact") ||
        id.startsWith("@elevenlabs"),
    },
  },
  plugins: [
    tailwindcss(),
    tailwindShadowDOM(),
    preact(),
    ...(process.env.ANALYZE ? [analyzer()] : []),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [
            "src/index.test.ts",
            "src/widget/DismissButton.test.ts",
            "src/widget/UploadFileButton.test.ts",
            "src/widget/BusinessModeProducts.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: [
            "src/index.test.ts",
            "src/widget/DismissButton.test.ts",
            "src/widget/UploadFileButton.test.ts",
            "src/widget/BusinessModeProducts.test.ts",
          ],
          browser: {
            enabled: true,
            headless: true,
            instances: [
              {
                browser: "chromium",
                provider: playwright({
                  launchOptions: {
                    args: [
                      "--use-fake-device-for-media-stream",
                      "--use-fake-ui-for-media-stream",
                    ],
                  },
                  contextOptions: {
                    permissions: ["microphone"],
                  },
                }),
              },
            ],
          },
        },
      },
    ],
  },
});
