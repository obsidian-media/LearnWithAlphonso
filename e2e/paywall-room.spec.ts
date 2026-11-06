import { expect, test, type Page } from "@playwright/test";
import { signInAsFakeUser } from "./lesson-helpers";

/**
 * The round-6 Alphonso Pro paywall (BACKLOG 0.0-bk) at phone width, with no backend: the top, the plans with and
 * without a trial, no offer on sale, and the welcome after buying. Set PAYWALL_SHOTS_DIR to also write the owner's
 * sign-off screenshots.
 *
 * TEST FIXTURES ONLY: every offer below is made up and answered here in the browser. The app holds no price; the real
 * ones come from RevenueCat Web Billing through /api/pro-offering.
 */
const SHOTS = process.env.PAYWALL_SHOTS_DIR;
const PHONE = { width: 393, height: 852 };

const FIXTURE_YEARLY = {
  period: "year",
  price: "$59.99",
  amountMicros: 59_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.example.test/year",
};
const FIXTURE_MONTHLY = {
  period: "month",
  price: "$9.99",
  amountMicros: 9_990_000,
  currency: "USD",
  trialDays: 7,
  purchaseUrl: "https://pay.example.test/month",
};

/** TanStack Start's server-function answer (seroval) for a plain JSON value. */
function seroval(value: unknown, ids = { next: 1 }): unknown {
  if (value === undefined) return { t: 2, s: 1 };
  if (value === null) return { t: 2, s: 0 };
  if (value === true) return { t: 2, s: 2 };
  if (value === false) return { t: 2, s: 3 };
  if (typeof value === "number") return { t: 0, s: value };
  if (typeof value === "string") return { t: 1, s: value };
  const i = ids.next++;
  if (Array.isArray(value))
    return { t: 9, i, l: value.length, a: value.map((v) => seroval(v, ids)), o: 0 };
  const entries = Object.entries(value as Record<string, unknown>);
  return {
    t: 10,
    i,
    p: { k: entries.map(([k]) => k), v: entries.map(([, v]) => seroval(v, ids)) },
    o: 0,
  };
}

async function fakeServer(page: Page, { pro, offering }: { pro: boolean; offering: unknown }) {
  const answers: Record<string, unknown> = {
    getMyProfile: { display_name: "Sam Rivera" },
    getAiConsent: { grantedAt: "2026-11-01T00:00:00Z" },
    getNameStatus: { displayName: "Sam Rivera", needsPrompt: false, prefill: "" },
  };
  await page.route("**/_serverFn/**", async (route) => {
    const id = route.request().url().split("/_serverFn/")[1]?.split("?")[0] ?? "";
    const name = Buffer.from(id, "base64url").toString("utf8");
    const hit = Object.keys(answers).find((k) => name.includes(`"${k}_createServerFn`));
    if (!hit) return route.fallback();
    const ids = { next: 1 };
    const result = seroval(answers[hit], ids);
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: JSON.stringify({
        t: 10,
        i: 0,
        p: {
          k: ["result", "error", "context"],
          v: [result, { t: 2, s: 1 }, { t: 10, i: ids.next, p: { k: [], v: [] }, o: 0 }],
        },
        o: 0,
      }),
    });
  });
  await page.route("**/api/pro-status", (route) =>
    route.fulfill({
      json: { pro, store: pro ? "web" : null, trialEligible: !pro, manageUrl: null },
    }),
  );
  await page.route("**/api/pro-offering**", (route) =>
    route.fulfill(offering as { status: number; json: unknown }),
  );
}

async function openPaywall(page: Page, offering: unknown) {
  await page.setViewportSize(PHONE);
  await signInAsFakeUser(page);
  await fakeServer(page, { pro: false, offering });
  await page.goto("/hector");
  await expect(
    page.getByRole("heading", { level: 1, name: /A tutor who remembers you/ }),
  ).toBeVisible();
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string, { full = false } = {}) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });
}

async function scrollToPlans(page: Page) {
  await page
    .locator("[data-pro-card]")
    .evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  await page.waitForTimeout(300);
}

test("the top: Hector in his library, the Pro card with the name, the example call and three facts", async ({
  page,
}) => {
  await openPaywall(page, { status: 200, json: { plans: [FIXTURE_YEARLY, FIXTURE_MONTHLY] } });
  await expect(page.getByRole("img", { name: "Hector in his library" })).toBeVisible();
  await expect(page.locator("[data-pro-tag]").getByText("Sam")).toBeVisible();
  await expect(page.getByRole("figure", { name: "Example call" })).toBeVisible();
  await expect(page.getByRole("list", { name: "What Pro gives you" })).toBeInViewport();
  await noSideScroll(page);
  await page.waitForTimeout(400);
  await shot(page, "1-top");
});

test("plans with a trial: yearly selected, the date, Start free trial", async ({ page }) => {
  await openPaywall(page, { status: 200, json: { plans: [FIXTURE_YEARLY, FIXTURE_MONTHLY] } });
  await scrollToPlans(page);
  await expect(page.getByRole("radio", { name: /Yearly/ })).toBeChecked();
  await expect(page.getByText("Free for 7 days")).toBeVisible();
  await expect(page.getByText(/First payment on/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start free trial" })).toBeInViewport();
  const [price, trial] = await Promise.all(
    [page.getByText("$59.99 a year after the trial"), page.getByText("Free for 7 days")].map((l) =>
      l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ),
  );
  expect(price).toBeGreaterThanOrEqual(trial);
  await noSideScroll(page);
  await shot(page, "2-plans-trial");
  await shot(page, "2b-whole-page-trial", { full: true });
});

test("plans with no trial: Subscribe, and no trial mentioned", async ({ page }) => {
  await openPaywall(page, {
    status: 200,
    json: {
      plans: [
        { ...FIXTURE_YEARLY, trialDays: null },
        { ...FIXTURE_MONTHLY, trialDays: null },
      ],
    },
  });
  await scrollToPlans(page);
  await expect(page.getByRole("button", { name: "Subscribe" })).toBeInViewport();
  await expect(page.locator("[data-paywall]")).not.toContainText(/trial/i);
  await shot(page, "3-plans-no-trial");
  await shot(page, "3b-whole-page-no-trial", { full: true });
});

test("no offer on sale: Coming soon, no price", async ({ page }) => {
  await openPaywall(page, {
    status: 503,
    json: { error: "offering-unavailable", reason: "not-configured" },
  });
  await scrollToPlans(page);
  await expect(page.getByText("Coming soon")).toBeInViewport();
  await expect(page.locator("[data-paywall-plans]")).not.toContainText(/[$€£¥]|\d/);
  await shot(page, "4-no-offering");
  await shot(page, "4b-whole-page-no-offering", { full: true });
});

test("welcome after buying: Hector in his room, three openers, Call Hector", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAsFakeUser(page);
  await fakeServer(page, { pro: true, offering: { status: 409, json: { error: "already-pro" } } });
  await page.goto("/pro-return");
  await expect(page.getByRole("button", { name: "Call Hector" })).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome, Sam.");
  await expect(
    page.getByRole("list", { name: "Try one of these" }).getByRole("listitem"),
  ).toHaveCount(3);
  await noSideScroll(page);
  // Mid-burst, as the mock's light scatter.
  await page.waitForTimeout(500);
  await shot(page, "5-welcome");
});
