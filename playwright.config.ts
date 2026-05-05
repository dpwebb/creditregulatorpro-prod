import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:5175";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: ".local/playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_SKIP_WEB_SERVER === "true"
    ? undefined
    : {
        command: "pnpm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000,
      },
});
