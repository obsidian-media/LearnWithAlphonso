import { test, expect } from "@playwright/test";

/**
 * Covers the unauthenticated golden path: land, go to sign-in, check the
 * legal pages load. Doesn't cover anything behind `_authenticated` --
 * see playwright.config.ts's top comment for why.
 */

test("landing page loads and opens the first run", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Learn with Alphonso/i);
  // Not pinning the exact hero sentence -- see §0.1d/§0.1-f in
  // docs/BACKLOG.md: a guard asserting one exact copy string is a guard
  // against the string being *changed*, not against it being wrong, which
  // is exactly backwards when (as happened here) the string was stale.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Get started — it's free" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { name: /What should I call you/ })).toBeVisible();
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
  ["/terms", /Terms of Use — Alphonso/],
  ["/support", /Support — Alphonso/],
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

test("defaults to the royal theme with no stored preference", async ({ page }) => {
  await page.goto("/");
  // The inline boot script in src/routes/__root.tsx writes data-palette before first paint, so a fresh
  // visitor gets an explicit "royal" rather than no attribute. toHaveAttribute rather than a one-shot
  // page.evaluate: the attribute is written while the page loads, and the web-first assertion retries.
  await expect(page.locator("html")).toHaveAttribute("data-palette", "royal");
});

test("applies the meadow theme from localStorage before first paint", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "meadow");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "meadow");
  const fontDisplay = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-display"),
  );
  expect(fontDisplay).toContain("Fraunces");
});

test("a retired theme kept on the device paints as royal", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "studio-ink");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "royal");
});
