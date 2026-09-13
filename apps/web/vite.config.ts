import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Only /api/* is forwarded to apps/api.
      //
      // The API's own default is 8787, but this machine already runs an
      // unrelated service there, so apps/api/.env sets PORT=8788 and this
      // default follows it. Override with API_PROXY_TARGET if yours differs.
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // The workspace-linked core package must share this app's React instance.
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // @fitbuilder/core is raw TS source (main: ./src/index.ts); let Vite transform it directly.
    exclude: ["@fitbuilder/core"],
  },
}));
