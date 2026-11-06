import type { Page } from "@playwright/test";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co";

/**
 * Signs in as a fake user with no backend: the session sits in local storage and the one network question the
 * signed-in shell asks (who is signed in) is answered here. Lesson content is bundled, so lessons play.
 */
export async function signInAsFakeUser(
  page: Page,
  { userMetadata = { learner_profile: { dismissedAt: "2026-11-06T00:00:00Z" } } as object } = {},
) {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "layout@example.test",
    app_metadata: {},
    // A learner past the one-time Complete your profile, unless a spec says otherwise.
    user_metadata: userMetadata,
    created_at: "2026-01-01T00:00:00Z",
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = 4_000_000_000;
  const session = {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, role: "authenticated", exp })}.x`,
    refresh_token: "layout-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user,
  };
  const key = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
      // Answer the cookie banner before the app starts, so it never sits over the Check bar.
      localStorage.setItem("lingua.cookie-consent.v1", "essential");
    },
    [key, JSON.stringify(session)],
  );
  await page.route(`${new URL(SUPABASE_URL).origin}/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) return route.fulfill({ json: user });
    return route.fulfill({ status: 200, json: [] });
  });
}

/** Encodes a plain JSON value the way TanStack Start's server functions answer (seroval), for faking one. */
function seroval(value: unknown, ids = { next: 1 }): unknown {
  if (value === undefined) return { t: 2, s: 1 };
  if (value === null) return { t: 2, s: 0 };
  if (value === true) return { t: 2, s: 2 };
  if (value === false) return { t: 2, s: 3 };
  if (typeof value === "number") return { t: 0, s: value };
  if (typeof value === "string") return { t: 1, s: value };
  if (Array.isArray(value)) {
    const i = ids.next++;
    return { t: 9, i, l: value.length, a: value.map((v) => seroval(v, ids)), o: 0 };
  }
  const i = ids.next++;
  const entries = Object.entries(value as Record<string, unknown>);
  return {
    t: 10,
    i,
    p: { k: entries.map(([k]) => k), v: entries.map(([, v]) => seroval(v, ids)) },
    o: 0,
  };
}

function serverFnBody(result: unknown): string {
  const ids = { next: 1 };
  const encoded = seroval(result, ids);
  return JSON.stringify({
    t: 10,
    i: 0,
    p: {
      k: ["result", "error", "context"],
      v: [encoded, { t: 2, s: 1 }, { t: 10, i: ids.next, p: { k: [], v: [] }, o: 0 }],
    },
    o: 0,
  });
}

/**
 * Answers the lesson's server functions with no backend: a session token, a heart lost, and a saved completion
 * (+70 XP, what the XP formula pays for 7 of 8 right on a first try, and a 4-day streak), so a whole lesson plays to the celebration.
 */
export async function fakeLessonServer(page: Page, { streak = 4, xp = 70 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const answers: Record<string, unknown> = {
    startLessonSession: { token: "fake-session" },
    loseHeartRemote: { hearts: 4 },
    completeLessonRemote: {
      xpGain: xp,
      newlyUnlocked: [],
      heartsBonus: null,
      progress: {
        xp: 120,
        streak,
        longestStreak: streak,
        lastActiveDate: today,
        hearts: 5,
        heartsRefillAt: null,
        streakFreezes: 0,
        leagueTier: 0,
      },
    },
  };
  await fakeServerFns(page, answers);
}

/** Answers the named server functions (by their export name) with the given values; others fall through. */
export async function fakeServerFns(page: Page, answers: Record<string, unknown>) {
  await page.route("**/_serverFn/**", async (route) => {
    const id = route.request().url().split("/_serverFn/")[1]?.split("?")[0] ?? "";
    const name = Buffer.from(id, "base64url").toString("utf8");
    const hit = Object.keys(answers).find((k) => name.includes(`"${k}_createServerFn`));
    if (!hit) return route.fallback();
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: serverFnBody(answers[hit]),
    });
  });
}
