import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Run locally against a running dev server:
 *
 *   npx playwright install chromium   # one-time browser download
 *   npm run dev                       # in one terminal
 *   npm run test:e2e                  # in another
 *
 * Requires a seeded founder account (npm run db:seed) and a reachable DATABASE_URL.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
