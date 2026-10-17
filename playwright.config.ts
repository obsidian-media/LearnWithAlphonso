import { defineConfig, devices } from "@playwright/test";

/**
 * Most specs cover routes that render without a real Supabase backend: none of
 * `/`, `/auth`, `/privacy`, `/terms`, `/cookies`, `/reset-password` require
 * an authenticated session, and Supabase's client-side `getSession()`
 * resolves from local storage without a network call when there's no stored
 * session -- so these render fine even against placeholder credentials.
 * `e2e/signed-in.spec.ts` is the signed-in journey; it needs a local Supabase
 * stack (CI job `e2e-signed-in`) and skips without one.
 */
// Overridable for a machine where 8080 is taken; CI uses the default.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
