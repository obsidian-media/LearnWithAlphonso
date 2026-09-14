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
