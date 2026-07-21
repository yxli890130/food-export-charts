import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:4300",
    browserName: "chromium",
  },
  webServer: {
    command: "npm run dev -- --port 4300",
    url: "http://localhost:4300",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
