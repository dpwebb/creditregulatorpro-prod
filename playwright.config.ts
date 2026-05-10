import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:5175";
const captureArtifacts = process.env.E2E_CAPTURE_ARTIFACTS === "true";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: ".local/playwright-report" }]],
  use: {
    baseURL,
    trace: captureArtifacts ? "retain-on-failure" : "off",
    screenshot: captureArtifacts ? "only-on-failure" : "off",
    video: "off",
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
