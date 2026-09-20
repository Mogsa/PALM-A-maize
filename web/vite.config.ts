import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// pdf.js 6's default build calls Map.getOrInsertComputed and other functions Safari 18
// does not have, so a paper never renders there. The legacy build ships the same API with
// those polyfilled. react-pdf imports the bare package, so it is aliased here.
const PDFJS_LEGACY = "pdfjs-dist/legacy/build/pdf.mjs";

export default defineConfig(({ mode }) => {
  const apiPort = loadEnv(mode, ".", "PAPERBOARD_").PAPERBOARD_API_PORT ?? "8765";
  return {
    plugins: [react()],
    resolve: { alias: [{ find: /^pdfjs-dist$/, replacement: PDFJS_LEGACY }] },
    server: { proxy: { "/api": `http://127.0.0.1:${apiPort}` } },
    preview: { proxy: { "/api": `http://127.0.0.1:${apiPort}` } },
    test: { environment: "jsdom", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
  };
});
