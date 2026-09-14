import { defineConfig, devices } from "@playwright/test";

/**
 * Scoped to routes that render without a real Supabase backend: none of
 * `/`, `/auth`, `/privacy`, `/terms`, `/cookies`, `/reset-password` require
 * an authenticated
 * session, and Supabase's client-side `getSession()` resolves from local
 * storage without a network call when there's no stored session -- so
 * these render fine even against placeholder credentials. Anything behind
 * `_authenticated` (learn, lesson, review, profile, league, converse)
 * needs a real signed-in session and a seeded test account; add it here
 * once that exists (see ARCHITECTURE.md / AUDIT.md "Still open").
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
