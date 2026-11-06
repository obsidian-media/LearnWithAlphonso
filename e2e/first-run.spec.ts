import { expect, test, type Page, type Request } from "@playwright/test";
import { fakeServerFns, signInAsFakeUser } from "./lesson-helpers";

/**
 * The first run (visual round 6, BACKLOG 0.0-bd) in a real browser, with no backend. What it guards that a unit test
 * cannot: the requests the page really makes. Before sign-in, and on the under-13 path at all, nothing may go to
 * Supabase, a server function or our API.
 *
 * With FIRST_RUN_SHOTS=<dir> it also saves a phone-width screenshot of every step, named after the mock-up's steps.
 */
const SUPABASE = new URL(process.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co").origin;
const SHOTS = process.env.FIRST_RUN_SHOTS;

test.use({ viewport: { width: 390, height: 844 } });

function watchRequests(page: Page): Request[] {
  const sent: Request[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (url.startsWith(SUPABASE) || url.includes("/_serverFn/") || url.includes("/api/"))
      sent.push(r);
  });
  return sent;
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(450); // let the room crossfade settle
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function start(page: Page) {
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/welcome");
  await page.waitForLoadState("networkidle");
}

const btn = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });

async function walkToAge(page: Page) {
  await expect(page.getByRole("heading", { name: /What should I call you/ })).toBeVisible();
  await page.getByLabel("Your first name").fill("Sam");
  await shot(page, "01-hello");
  await btn(page, "Nice to meet you").click();
  await btn(page, /Spanish/).click();
  await shot(page, "02-course");
  await btn(page, "Continue").click();
  await shot(page, "03-about-you");
  await btn(page, "Continue").click();
  await btn(page, /Travel/).click();
  await shot(page, "04-goal");
  await btn(page, "Continue").click();
  await btn(page, /I know some/).click();
  await shot(page, "05-level");
  await btn(page, "Continue").click();
  await btn(page, /10 minutes/).click();
  await shot(page, "06-daily-time");
  await btn(page, "Continue").click();
  await expect(page.getByRole("heading", { name: "How old are you?" })).toBeVisible();
}

test("under 13: the kind stop, nothing sent, and it stays closed on this device", async ({
  page,
}) => {
  const sent = watchRequests(page);
  await start(page);
  await walkToAge(page);
  await shot(page, "07-age");
  await btn(page, /under 13/i).click();
  // From here on, every request at all: only the page's own files (pictures, scripts) may load, nothing may be
  // posted, and nothing may leave this origin (analytics, Supabase, a server function, our API).
  const origin = new URL(page.url()).origin;
  const after: Request[] = [];
  page.on("request", (r) => after.push(r));
  await btn(page, "Continue").click();
  const stop = page.getByRole("heading", { name: "Thanks for wanting to learn with me!" });
  await expect(stop).toBeVisible();
  await shot(page, "14-under-13");
  expect(await page.evaluate(() => localStorage.getItem("lwa.firstRun.v1"))).toBeNull();
  await btn(page, "OK").click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState("networkidle");
  const leaving = after.filter(
    (r) =>
      r.method() !== "GET" ||
      new URL(r.url()).origin !== origin ||
      /\/_serverFn\/|\/api\//.test(r.url()),
  );
  expect(leaving.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);

  // Back to the start, a reload, and the sign-up page: still the stop.
  await page.goto("/welcome");
  await expect(stop).toBeVisible();
  await page.goto("/auth?mode=signup");
  await expect(stop).toBeVisible();
  await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  expect(sent.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
});

test("a new learner reaches sign-in without a single request, then signs up by email", async ({
  page,
}) => {
  const sent = watchRequests(page);
  await start(page);
  await walkToAge(page);
  await btn(page, /25–34/).click();
  await btn(page, "Continue").click();
  await btn(page, /Food/).click();
  await btn(page, /Music/).click();
  await shot(page, "08-interests");
  await btn(page, "Continue").click();
  await btn(page, "Buenos días").click();
  await btn(page, "Check").click();
  await expect(page.getByText("¡Muy bien, Sam!")).toBeVisible();
  await shot(page, "09-first-taste");
  await btn(page, "Next").click();
  await btn(page, "Thank you").click();
  await btn(page, "Check").click();
  await btn(page, "Next").click();
  await expect(page.getByRole("heading", { name: "Sam, here's your Spanish plan!" })).toBeVisible();
  await expect(page.locator("[data-plan-path] li")).toHaveCount(3);
  await shot(page, "10-your-plan");
  await btn(page, "Save my plan").click();
  await expect(page.getByRole("heading", { name: "Let's save your plan, Sam." })).toBeVisible();
  await shot(page, "11-sign-in");
  expect(sent.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);

  // The answers wait in this browser, as a range and never a birth date.
  const draft = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("lwa.firstRun.v1"))) ?? "{}",
  );
  expect(draft).toMatchObject({ name: "Sam", course: "es", goal: "travel", ageRange: "25-34" });

  await btn(page, /Continue with email/).click();
  await expect(page).toHaveURL(/\/auth\?.*mode=signup/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByPlaceholder("Display name")).toHaveValue("Sam");
});

test("after sign-in: answers saved once, the picture, how you heard, then Meet Hector", async ({
  page,
}) => {
  await signInAsFakeUser(page, { userMetadata: {} });
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "lwa.firstRun.v1",
      JSON.stringify({
        name: "Sam",
        course: "es",
        goal: "travel",
        level: "some",
        dailyMinutes: 10,
        ageRange: "25-34",
        interests: ["food", "travel", "music"],
      }),
    ),
  );
  const saved: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/_serverFn/"))
      saved.push(
        Buffer.from(r.url().split("/_serverFn/")[1].split("?")[0], "base64url").toString("utf8"),
      );
  });
  await fakeServerFns(page, {
    saveLearnerProfile: { showFlag: false },
    getMyProfile: { display_name: "Sam", country: null, avatar_seed: "3fa9c1d2" },
    updateProfile: { ok: true },
    getNameStatus: null,
  });
  // The web offer is not set up yet (503): no trial line.
  await page.route("**/api/pro-offering**", (r) =>
    r.fulfill({ status: 503, json: { error: "offering-unavailable" } }),
  );

  await page.goto("/hello");
  await expect(page.getByRole("heading", { name: "Pick your picture, Sam." })).toBeVisible();
  expect(saved.filter((n) => n.includes("saveLearnerProfile"))).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("lwa.firstRun.v1"))).toBeNull();
  await btn(page, "Fox").click();
  await shot(page, "avatar-picker-first-run");
  await btn(page, "Continue").click();
  await expect(page.getByRole("heading", { name: /how did you hear about me/ })).toBeVisible();
  await btn(page, "Instagram or TikTok").click();
  await shot(page, "13-how-did-you-hear");
  await btn(page, "Continue").click();
  await expect(page.getByRole("heading", { name: "¡Hola, Sam! I'm Hector." })).toBeVisible();
  await expect(btn(page, "See what Hector can do")).toBeVisible();
  await expect(page.locator("[data-trial-line]")).toHaveCount(0);
  await shot(page, "12-meet-hector");
});

test("Meet Hector shows the store's trial length when the offer has one", async ({ page }) => {
  await signInAsFakeUser(page);
  await fakeServerFns(page, { getNameStatus: null, saveLearnerProfile: { showFlag: false } });
  await page.route("**/api/pro-offering**", (r) =>
    r.fulfill({
      json: { price: null, period: "month", trialDays: 7, purchaseUrl: "https://example.test" },
    }),
  );
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "lwa.firstRun.v1",
      JSON.stringify({ name: "Sam", course: "es", interests: ["food"] }),
    ),
  );
  await fakeServerFns(page, {
    getMyProfile: { display_name: "Sam", country: null, avatar_seed: "animal:fox" },
  });
  await page.goto("/hello");
  await btn(page, "Keep my initial").click();
  await btn(page, "Skip").click();
  await expect(
    page.getByText("7 days free, then your plan's price. Cancel any time."),
  ).toBeVisible();
  await expect(btn(page, "Try a free call with Hector")).toBeVisible();
  await shot(page, "12-meet-hector-with-store-trial");
});

test("an existing learner sees Complete your profile once, without the course or sign-in", async ({
  page,
}) => {
  await signInAsFakeUser(page, { userMetadata: {} });
  await fakeServerFns(page, {
    getMyProfile: { display_name: "Robin Tester", country: "CA", avatar_seed: "3fa9c1d2" },
    getNameStatus: null,
    saveLearnerProfile: { showFlag: true },
  });
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/complete-profile/);
  await expect(page.getByRole("heading", { name: /What should I call you/ })).toBeVisible();
  await expect(page.getByLabel("Your first name")).toHaveValue("Robin");
  await expect(page.getByText("Question 1 of 7")).toBeVisible();
  await shot(page, "complete-your-profile-01-hello");
  await btn(page, "Nice to meet you").click();
  await expect(page.getByRole("heading", { name: "Tell me a bit about you." })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show my flag on leaderboards" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await shot(page, "complete-your-profile-02-about-you");
  await btn(page, "Back").click();
  const dismissed = page.waitForRequest(
    (r) => r.url().includes("/_serverFn/") && (r.postData() ?? "").includes("dismissed"),
  );
  await btn(page, "Not now").click();
  // Not now is saved on the account (the server stamps the time), so it never shows again.
  await dismissed;
});

test("Profile: change the picture to one of the 16 animals", async ({ page }) => {
  await signInAsFakeUser(page);
  await fakeServerFns(page, {
    getMyProfile: { display_name: "Sam", country: null, avatar_seed: "3fa9c1d2" },
    getNameStatus: null,
    getWeaknessTrend: { categories: [] },
    updateProfile: { ok: true },
  });
  await page.addInitScript(() =>
    window.localStorage.setItem("lingua.cookie-consent.v1", "essential"),
  );
  await page.goto("/profile");
  await btn(page, "Change picture").click();
  const dialog = page.getByRole("dialog", { name: "Your profile picture" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Owl" }).click();
  await shot(page, "avatar-picker-profile");
  const save = page.waitForRequest(
    (r) => r.url().includes("/_serverFn/") && (r.postData() ?? "").includes("animal:owl"),
  );
  await dialog.getByRole("button", { name: "Save picture" }).click();
  await save;
  await expect(page.locator('[data-avatar="owl"]').first()).toBeVisible();
  await shot(page, "profile-with-animal");
});
