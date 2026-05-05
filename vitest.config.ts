import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["helpers/**/*.spec.ts?(x)", "tests/**/*.spec.ts?(x)"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    setupFiles: ["tests/setup/vitest.setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    restoreMocks: true,
    clearMocks: true,
  },
});
