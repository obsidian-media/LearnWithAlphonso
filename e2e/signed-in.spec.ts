import { expect, test, type Page } from "@playwright/test";
import { curriculum } from "../src/data/curriculum";
// The same copy the name prompt renders (src/lib/name-onboarding.ts reads this file).
import nameFixtures from "../src/lib/name-onboarding.fixtures.json" with { type: "json" };

const NAME_ONBOARDING_COPY = nameFixtures.copy;

/**
 * The one signed-in journey: sign in with a password, pass the public-name prompt, finish the first English
 * lesson with every answer right, and confirm the server saved it.
 *
 * Runs only against a throwaway local Supabase stack (CI job `e2e-signed-in`, or locally: `supabase start`, then
 * export the variables below and `bun run dev`). It creates its own user with the service key and deletes it
 * afterwards, so it never touches real data. Without the variables it skips.
 */
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;

test.skip(
  !SUPABASE_URL || !SERVICE_KEY,
  "needs a local Supabase stack (E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY)",
);

const LESSON = curriculum[0].lessons[0];
const email = `e2e-${Date.now()}@example.test`;
const password = `E2e-${crypto.randomUUID()}`;
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
  if (!res.ok)
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
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

/** Answers whichever lesson question is on screen with its correct answer, the way a learner would. */
async function answerCurrentQuestion(page: Page) {
  for (const q of LESSON.questions) {
    if (
      !(await page
        .getByText(q.prompt, { exact: true })
        .first()
        .isVisible()
        .catch(() => false))
    )
      continue;
    if (q.type === "mc") {
      await page.getByRole("button", { name: q.choices[q.answer], exact: true }).click();
    } else if (q.type === "fill") {
      await page.getByPlaceholder("Type your answer").fill(q.answer);
    } else {
      throw new Error(`the first lesson gained a ${q.type} question; extend this test`);
    }
    return;
  }
  throw new Error("no known question prompt is visible");
}

test("a learner signs in, names themselves, finishes a lesson and it is saved", async ({
  page,
}) => {
  await page.goto("/auth");
  // Typing before hydration is lost when React takes over the inputs.
  await page.waitForLoadState("networkidle");
  const cookies = page.getByRole("dialog", { name: "Cookie choices" });
  if (await cookies.isVisible().catch(() => false)) {
    await cookies.getByRole("button", { name: "Essential only" }).click();
    await expect(cookies).toBeHidden();
  }
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/learn/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: NAME_ONBOARDING_COPY.title })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel(NAME_ONBOARDING_COPY.fieldLabel).fill("Robin Tester");
  await page.getByRole("button", { name: NAME_ONBOARDING_COPY.save }).click();
  await expect(page.getByRole("heading", { name: NAME_ONBOARDING_COPY.title })).toBeHidden();

  await page.goto(`/lesson/${LESSON.id}`);
  await page.getByRole("button", { name: "Begin lesson" }).click();
  const startPractice = page.getByRole("button", { name: "Start practice" });
  if (await startPractice.isVisible().catch(() => false)) await startPractice.click();

  for (let i = 0; i < LESSON.questions.length; i++) {
    await answerCurrentQuestion(page);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByText("Nice.")).toBeVisible();
    const last = i === LESSON.questions.length - 1;
    await page.getByRole("button", { name: last ? "Finish" : "Continue", exact: true }).click();
  }

  await expect(page.getByText(/lesson complete/i).first()).toBeVisible({ timeout: 30_000 });

  const rows = await admin(
    `/rest/v1/lesson_completions?user_id=eq.${userId}&select=lesson_id,correct,total,xp_earned`,
  );
  expect(rows).toEqual([
    expect.objectContaining({
      lesson_id: LESSON.id,
      correct: LESSON.questions.length,
      total: LESSON.questions.length,
    }),
  ]);
  const profile = await admin(`/rest/v1/profiles?id=eq.${userId}&select=display_name`);
  expect(profile[0].display_name).toBe("Robin Tester");
});
