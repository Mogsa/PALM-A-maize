import { defineConfig } from "@playwright/test";

const apiPort = process.env.PAPERBOARD_API_PORT ?? "8765";
const webPort = process.env.PAPERBOARD_WEB_PORT ?? "4173";

export default defineConfig({
  workers: 1, // specs share the temporary paper store

  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${webPort}`, viewport: { width: 1400, height: 1000 } },
  webServer: [
    { command: "node e2e/server.mjs", url: `http://127.0.0.1:${apiPort}/api/papers`, reuseExistingServer: false, timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 } },
    { command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${webPort}`, url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false },
  ],
});
