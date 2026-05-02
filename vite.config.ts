import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig(() => ({
  plugins: [
    {
      name: "local-static-asset-rewrite",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/brand/")) {
            req.url = `/static${req.url}`;
          } else if (req.url === "/manifest.json") {
            req.url = "/static/manifest.json";
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.startsWith("/brand/")) {
            req.url = `/static${req.url}`;
          } else if (req.url === "/manifest.json") {
            req.url = "/static/manifest.json";
          }
          next();
        });
      },
    },
    nodePolyfills({
      include: ["stream", "crypto", "process"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    react(),
  ],
  build: {
    target: "esnext",
    assetsDir: "_assets",
    chunkSizeWarningLimit: 4000,
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
    include: ["@react-pdf-viewer/core"],
    esbuildOptions: {
      target: "esnext",
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: true,
    proxy: {
      "/_api": "http://localhost:3333",
      "/api": "http://localhost:3333",
    },
  },
}));
