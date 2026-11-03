import { expect, test } from "@playwright/test";
import { curriculum } from "../src/data/curriculum";
import nameFixtures from "../src/lib/name-onboarding.fixtures.json" with { type: "json" };

/**
 * Screenshot sweep of the redesigned screens in every theme, at phone and desktop width, for a person to
 * review (written to test-results/visual-refresh/). It asserts only that each screen rendered, never pixels.
 *
 * Runs in the CI job `e2e-signed-in` against the throwaway local Supabase stack, like signed-in.spec.ts:
 * it creates its own user with the service key and deletes it afterwards. Without the variables it skips.
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
test.skip(!SUPABASE_URL || !SERVICE_KEY, "needs a local Supabase stack");

const THEMES = ["canopy", "meadow", "manuscript", "studio-ink"] as const;
const WIDTHS = [390, 1280] as const;
const LESSON = curriculum[0].lessons[0];
const SCREENS: { name: string; path: string; ready: string }[] = [
  { name: "learn", path: "/learn", ready: "Continue" },
  { name: "practice", path: "/converse", ready: "Scenarios" },
  { name: "lesson-overview", path: `/lesson/${LESSON.id}`, ready: "Begin lesson" },
  { name: "listen", path: "/listen", ready: "Listen" },
  { name: "profile", path: "/profile", ready: "Achievements" },
];

const email = `visual-${Date.now()}@example.test`;
const password = `Vis-${crypto.randomUUID()}`;
let userId = "";

async function admin(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

test.beforeAll(async () => {
  const user = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  userId = user.id;
});

test.afterAll(async () => {
  if (userId) await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
});

test("screenshots of the redesigned screens in every theme", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/learn/, { timeout: 30_000 });
  const copy = nameFixtures.copy;
  await expect(page.getByRole("heading", { name: copy.title })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(copy.fieldLabel).fill("Robin Visual");
  await page.getByRole("button", { name: copy.save }).click();
  await expect(page.getByRole("heading", { name: copy.title })).toBeHidden();

  for (const theme of THEMES) {
    // A new learner has no saved theme, so the stored one decides (resolveInitialTheme).
    await page.evaluate((t) => window.localStorage.setItem("theme", t), theme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const screen of SCREENS) {
        await page.goto(screen.path);
        await expect(page.getByText(screen.ready, { exact: true }).first()).toBeVisible({
          timeout: 30_000,
        });
        await page.waitForLoadState("networkidle");
        // Let entrance animations settle so the shot shows the resting state.
        await page.waitForTimeout(700);
        await page.screenshot({
          path: `test-results/visual-refresh/${theme}-${width}-${screen.name}.png`,
          fullPage: true,
        });
        // What a phone actually shows first. A full-page shot stretches the window to the page height, which
        // blows fixed scene backgrounds up and drops sticky bars mid-page, so the phone frame is kept as well.
        if (width === 390) {
          await page.screenshot({
            path: `test-results/visual-refresh/${theme}-${width}-${screen.name}-screen.png`,
          });
        }
      }
    }
  }
});
