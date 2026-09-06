import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function preloadPdfWorker(): Plugin {
  return {
    name: "preload-pdf-worker",
    closeBundle() {
      const dist = path.resolve("dist");
      const htmlPath = path.join(dist, "index.html");
      const assetsDir = path.join(dist, "assets");
      if (!existsSync(htmlPath) || !existsSync(assetsDir)) return;
      const worker = readdirSync(assetsDir).find((name) => name.startsWith("pdf.worker") && name.endsWith(".mjs"));
      if (!worker) return;
      const href = `/assets/${worker}`;
      let html = readFileSync(htmlPath, "utf8");
      if (html.includes(`rel="modulepreload" href="${href}"`)) return;
      html = html.replace("</head>", `    <link rel="modulepreload" href="${href}" />\n  </head>`);
      writeFileSync(htmlPath, html);
    },
  };
}

export default defineConfig({
  base: process.env.WEPAPER_BASE || "/",
  plugins: [react(), preloadPdfWorker()],
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
