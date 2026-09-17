import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1400, height: 1000 } },
  webServer: [
    { command: "node e2e/server.mjs", url: "http://127.0.0.1:8765/api/papers", reuseExistingServer: false, timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 } },
    { command: "npm run build && npm run preview -- --host 127.0.0.1", url: "http://127.0.0.1:4173", reuseExistingServer: false },
  ],
});
