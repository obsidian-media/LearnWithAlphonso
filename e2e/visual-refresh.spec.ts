import { writeFileSync } from "node:fs";
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

/** Signs the throwaway learner in, naming them the first time the name prompt shows. */
async function signIn(page: import("@playwright/test").Page) {
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
  const prompt = page.getByRole("heading", { name: copy.title });
  // isVisible() never waits, so wait for the prompt explicitly.
  if (
    await prompt.waitFor({ state: "visible", timeout: 15_000 }).then(
      () => true,
      () => false,
    )
  ) {
    await page.getByLabel(copy.fieldLabel).fill("Robin Visual");
    await page.getByRole("button", { name: copy.save }).click();
    await expect(prompt).toBeHidden();
  }
}

test("screenshots of the redesigned screens in every theme", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);

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
        // What a phone actually shows first, taken from the top before the full-page shot. A full-page shot
        // stretches the window to the page height, which blows fixed scene backgrounds up, drops sticky bars
        // mid-page and can leave a long page scrolled.
        if (width === 390) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(150);
          await page.screenshot({
            path: `test-results/visual-refresh/${theme}-${width}-${screen.name}-screen.png`,
          });
        }
        await page.screenshot({
          path: `test-results/visual-refresh/${theme}-${width}-${screen.name}.png`,
          fullPage: true,
        });
      }
    }
  }
});

// Two screens a fresh learner only reaches by doing something: lesson complete (finish a lesson) and Hector
// (allow AI first). Phone size, default theme. Its own test and time budget, so it can never starve the sweep
// above; each shot is best effort and logs rather than fails.
test("screenshots of lesson complete and Hector", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await signIn(page);
  await page.evaluate(() => window.localStorage.setItem("theme", "canopy"));
  await page.setViewportSize({ width: 390, height: 844 });
  const shot = (name: string) =>
    page.screenshot({ path: `test-results/visual-refresh/canopy-390-${name}-screen.png` });
  try {
    await playLessonToTheEnd(page);
    // Mid-celebration: the clip is playing and the numbers have counted up.
    await page.waitForTimeout(1300);
    await shot("lesson-complete");
  } catch (e) {
    // The github reporter drops console output, so leave the evidence next to the shots.
    await shot("lesson-complete-failed").catch(() => {});
    writeFileSync("test-results/visual-refresh/lesson-complete-failed.txt", String(e));
  }
  try {
    await page.goto("/hector");
    const allow = page.getByRole("button", { name: "Review and allow" });
    if (
      await allow.waitFor({ state: "visible", timeout: 15_000 }).then(
        () => true,
        () => false,
      )
    ) {
      await allow.click();
      await page.getByRole("button", { name: "Allow", exact: true }).click();
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await shot("hector");
  } catch (e) {
    console.warn(`hector shot skipped: ${(e as Error).message}`);
  }
});

/** Plays the first lesson with the right answers, read from the curriculum, until the finish screen shows. */
async function playLessonToTheEnd(page: import("@playwright/test").Page) {
  await page.goto(`/lesson/${LESSON.id}`);
  await page.getByRole("button", { name: "Begin lesson" }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  for (let step = 0; step < 40; step++) {
    if ((await page.locator('[data-stage="complete"]').count()) > 0) return;
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible()) {
      await gotIt.click();
      continue;
    }
    const next = page.getByRole("button", { name: /^(Continue|Finish)$/ });
    if (await next.isVisible()) {
      // The last Finish swaps the screen out while it is clicked; the next loop sees the finish stage.
      await next.click({ timeout: 5_000 }).catch(() => {});
      continue;
    }
    let answered = false;
    for (const x of LESSON.questions) {
      if (!(await page.getByText(x.prompt, { exact: true }).first().isVisible())) continue;
      if (x.type === "mc") {
        await page.getByRole("button", { name: x.choices[x.answer], exact: true }).click();
      } else if (x.type === "fill") {
        await page.getByPlaceholder("Type your answer").fill(x.answer);
      } else {
        throw new Error(`no answer path for a ${x.type} question`);
      }
      answered = true;
      break;
    }
    if (!answered) {
      await page.waitForTimeout(400);
      continue;
    }
    await page.getByRole("button", { name: "Check" }).click();
  }
  throw new Error("the finish screen never showed");
}
