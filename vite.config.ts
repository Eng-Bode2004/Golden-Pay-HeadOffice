import { copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Static hosts that serve 404.html for unknown paths then open the app at any page address. */
const spaFallback = (): Plugin => {
  let outDir = "dist";
  return {
    name: "golden-pay-spa-fallback",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await copyFile(join(outDir, "index.html"), join(outDir, "404.html"));
    },
  };
};

// The Golden Pay Head Office dashboard: attendance, payroll, staff, expenses, rules and
// report templates.
export default defineConfig({
  plugins: [react({ babel: { plugins: ["./localization.cjs"] } }), spaFallback()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 4150),
    proxy: {
      // The live backend on Thalmet Cloud; set IDENTITY_API_URL=http://127.0.0.1:4001 to use a local one.
      "/api": { target: process.env.IDENTITY_API_URL ?? "https://golden-pay-backend-golden-pay-services.cloud.thalmet.com", changeOrigin: true, secure: true },
    },
  },
});
