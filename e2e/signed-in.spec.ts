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
const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY;

// In the CI job a missing variable is a failure, never a silent skip (E2E_REQUIRED=1 there).
if (process.env.E2E_REQUIRED === "1" && (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY)) {
  throw new Error("E2E_REQUIRED is set but a required local Supabase URL/key is empty");
}
// It creates and deletes auth users with the service key: never point it at a hosted project.
if (SUPABASE_URL && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) {
  throw new Error(`E2E_SUPABASE_URL must be a local stack, got ${new URL(SUPABASE_URL).host}`);
}

test.skip(
  !SUPABASE_URL || !SERVICE_KEY || !ANON_KEY,
  "needs a local Supabase stack (E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY, E2E_SUPABASE_ANON_KEY)",
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
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
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
  test.setTimeout(120_000);
  // Answer the cookie banner before the app starts, so it can never appear later over the lesson buttons.
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/auth");
  // Typing before hydration is lost when React takes over the inputs.
  await page.waitForLoadState("networkidle");
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
  // A lesson with vocabulary shows it first; one without goes straight to the first question.
  const startPractice = page.getByRole("button", { name: "Start practice" });
  const check = page.getByRole("button", { name: "Check", exact: true });
  await expect(startPractice.or(check)).toBeVisible();
  if (await startPractice.isVisible()) await startPractice.click();

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

  // Exercise the real PostgreSQL RPC from two simultaneous PostgREST requests.
  // Both carry the same state versions; row locking must let one apply and force
  // the other to observe a conflict rather than lose a progress update.
  const [progressRows, languageRows, activityRows] = await Promise.all([
    admin(`/rest/v1/user_progress?user_id=eq.${userId}&select=*`),
    admin(`/rest/v1/language_progress?user_id=eq.${userId}&language=eq.en&select=*`),
    admin(
      `/rest/v1/activity_days?user_id=eq.${userId}&day=eq.${new Date().toISOString().slice(0, 10)}&select=*`,
    ),
  ]);
  expect(progressRows).toHaveLength(1);
  expect(languageRows).toHaveLength(1);
  const progress = progressRows[0];
  const language = languageRows[0];
  const activity = activityRows[0];
  const expected = {
    p_updated_at: progress.updated_at,
    lp_updated_at: language.updated_at,
    completion_xp: null,
    day_xp: activity?.xp_earned ?? null,
  };
  const today = new Date().toISOString().slice(0, 10);
  const unauthorizedRpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_lesson_completion`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    // If the role ever receives EXECUTE, invalid arguments fail inside the
    // function (400), whereas the intended privilege denial is 401/403.
    body: JSON.stringify({
      _user_id: null,
      _course: null,
      _lesson_id: null,
      _level: null,
      _today: null,
      _expected: null,
      _next: null,
      _missed_question_ids: null,
      _activity_events: null,
    }),
  });
  expect([401, 403]).toContain(unauthorizedRpc.status);
  const competingCompletions = ["e2e-concurrent-a", "e2e-concurrent-b"].map((lessonId) =>
    admin("/rest/v1/rpc/apply_lesson_completion", {
      method: "POST",
      body: JSON.stringify({
        _user_id: userId,
        _course: "en",
        _lesson_id: lessonId,
        _level: "A1",
        _today: today,
        _expected: expected,
        _next: {
          streak: progress.streak,
          longest_streak: progress.longest_streak,
          last_active_date: progress.last_active_date,
          hearts: progress.hearts,
          hearts_refill_at: progress.hearts_refill_at,
          streak_freezes: progress.streak_freezes,
          xp: language.xp + 7,
          league_tier: language.league_tier,
          best_correct: 1,
          total: 1,
          best_xp: 7,
          day_xp: (activity?.xp_earned ?? 0) + 7,
        },
        _missed_question_ids: [],
        _activity_events: [],
      }),
    }),
  );
  const transitions = await Promise.all(competingCompletions);
  expect(transitions.map((transition) => transition.status).sort()).toEqual([
    "applied",
    "conflict",
  ]);
  const concurrentRows = await admin(
    `/rest/v1/lesson_completions?user_id=eq.${userId}&lesson_id=in.(e2e-concurrent-a,e2e-concurrent-b)&select=lesson_id`,
  );
  expect(concurrentRows).toHaveLength(1);
});
