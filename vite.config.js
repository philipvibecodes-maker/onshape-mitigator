import path from "node:path";
import { copyFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { build, defineConfig } from "vite";

function buildPageBridge() {
  return {
    name: "build-page-bridge",
    closeBundle: async () => {
      await build({
        configFile: false,
        resolve: {
          alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
          },
        },
        build: {
          outDir: "dist",
          emptyOutDir: false,
          lib: {
            entry: "src/adapter/page.ts",
            name: "OnshapePageBridge",
            formats: ["iife"],
            fileName: () => "onshape-page-bridge.js",
          },
          rollupOptions: {
            output: {
              codeSplitting: false,
            },
          },
        },
      });
      await copyFile("LICENSE", "dist/LICENSE");
      await copyFile("NOTICE", "dist/NOTICE");
    },
  };
}

export default defineConfig({
  plugins: [react(), buildPageBridge()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "src/main.tsx",
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
