import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          input: resolve("src/main/input.ts"),
        },
      },
    },
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  // The renderer ships as one bundle; minified it parses faster at startup.
  renderer: { plugins: [react()], build: { minify: true } },
});
