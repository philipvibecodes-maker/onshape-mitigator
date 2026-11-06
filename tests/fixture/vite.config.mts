import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "offline-replay-routes",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
          if (/^\/documents\/[^/]+\/(w|v|m)\/[^/]+\/e\/[^/]+$/.test(pathname))
            request.url = "/tests/replay/";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve("src"),
      "webextension-polyfill": path.resolve("tests/fixture/browser.ts"),
    },
  },
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});
