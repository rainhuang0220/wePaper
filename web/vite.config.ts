import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.WEPAPER_BASE || "/",
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/paper": "http://127.0.0.1:8788",
      "/wepaper/api": {
        target: "http://127.0.0.1:8788",
        rewrite: (path) => path.replace(/^\/wepaper/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
