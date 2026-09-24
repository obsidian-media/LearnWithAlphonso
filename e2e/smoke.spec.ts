import { test, expect } from "@playwright/test";

/**
 * Covers the unauthenticated golden path: land, go to sign-in, check the
 * legal pages load. Doesn't cover anything behind `_authenticated` --
 * see playwright.config.ts's top comment for why.
 */

test("landing page loads and links to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Learn with Alphonso/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Learn English with lessons that actually stick.",
  );
  await page.getByRole("link", { name: "Get started — it's free" }).click();
  await expect(page).toHaveURL(/\/auth$/);
});

test("sign-in page loads", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveTitle(/Sign in — Alphonso/);
});

test("reset-password page loads without a recovery token", async ({ page }) => {
  // No beforeLoad redirect guard on this route -- it renders regardless
  // and gates the form on client-side auth-event state, so a plain visit
  // (no PASSWORD_RECOVERY session) should still render, not error out.
  await page.goto("/reset-password");
  await expect(page).toHaveTitle(/Set a new password — Alphonso/);
});

for (const [path, titlePattern] of [
  ["/privacy", /Privacy Policy — Alphonso/],
  ["/terms", /Terms of Service — Alphonso/],
  ["/cookies", /Cookie Policy — Alphonso/],
] as const) {
  test(`${path} loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(titlePattern);
  });
}

test("unknown route shows the 404 page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByText("404")).toBeVisible();
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL("/");
});

test("defaults to the canopy theme with no stored preference", async ({ page }) => {
  await page.goto("/");
  // Canopy became the web default alongside iOS's (resolveInitialTheme in
  // src/lib/theme.ts), so a fresh visitor now gets an explicit
  // data-theme="canopy" rather than falling through to :root's Meadow with
  // no attribute at all -- which is what this test used to assert.
  //
  // toHaveAttribute rather than a one-shot page.evaluate: the attribute is
  // written during hydration, so reading it immediately after goto() is a
  // race. This matches the studio-ink test below.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "canopy");
});

test("applies the studio-ink theme from localStorage before first paint", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "studio-ink");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "studio-ink");
  const fontDisplay = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-display"),
  );
  expect(fontDisplay).toContain("Instrument Serif");
});
