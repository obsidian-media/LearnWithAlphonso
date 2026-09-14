import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Real axe-core scans against a rendered page, run in CI where a browser
 * exists -- the practical substitute for the local browser this sandbox
 * couldn't run (see AUDIT.md "Still open"). Scoped to the same
 * unauthenticated routes as smoke.spec.ts; extend once authenticated
 * pages are reachable in CI.
 */
for (const path of ["/", "/auth", "/privacy", "/terms", "/cookies"]) {
  test(`${path} has no serious/critical accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
