import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // The API lives in apps/api (port 8787); only /api/* is forwarded.
      "/api": {
        target: "http://localhost:8787",
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
