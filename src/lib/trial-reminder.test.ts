import { describe, expect, it, vi } from "vitest";
import {
  buildTrialReminderEmail,
  manageUrlFor,
  needsReminder,
  reminderEnabled,
  type TrialSubscription,
} from "./trial-reminder";
import {
  sweepTrialReminders,
  type TrialReminderDeps,
  type TrialReminderStore,
} from "./trial-reminder.server";
import { getTrialSubscription } from "./revenuecat-entitlement";

const NOW = new Date("2026-11-26T10:00:00Z");
const DAY = 86_400_000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);

const trial = (over: Partial<TrialSubscription> = {}): TrialSubscription => ({
  productId: "alphonso_pro_monthly",
  trialEndsAt: inDays(2),
  store: "app_store",
  willNotRenew: false,
  billingIssue: false,
  managementUrl: null,
  ...over,
});

describe("reminderEnabled (the off switch)", () => {
  it("is off unless TRIAL_REMINDER_ENABLED is the word true", () => {
    expect(reminderEnabled({})).toBe(false);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "" })).toBe(false);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "1" })).toBe(false);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "false" })).toBe(false);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "true" })).toBe(true);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: " TRUE " })).toBe(true);
  });
});

describe("needsReminder (selection)", () => {
  it("selects a trial ending within 3 days", () => {
    expect(needsReminder(trial({ trialEndsAt: inDays(2) }), NOW)).toBe(true);
    expect(needsReminder(trial({ trialEndsAt: inDays(3) }), NOW)).toBe(true);
    expect(needsReminder(trial({ trialEndsAt: inDays(0.1) }), NOW)).toBe(true);
  });
  it("leaves a trial that ends later, or has already ended", () => {
    expect(needsReminder(trial({ trialEndsAt: inDays(3.5) }), NOW)).toBe(false);
    expect(needsReminder(trial({ trialEndsAt: inDays(6) }), NOW)).toBe(false);
    expect(needsReminder(trial({ trialEndsAt: inDays(-0.1) }), NOW)).toBe(false);
  });
  it("leaves a trial the learner already cancelled, or with a payment problem", () => {
    expect(needsReminder(trial({ willNotRenew: true }), NOW)).toBe(false);
    expect(needsReminder(trial({ billingIssue: true }), NOW)).toBe(false);
  });
});

describe("the email", () => {
  it("states the date, the plan and the price exactly as given, and links to manage it", () => {
    const m = buildTrialReminderEmail(
      trial(),
      { period: "month", price: "$12.99" },
      "https://billing.example/portal",
    );
    expect(m.subject).toBe("Your Alphonso Pro free trial ends on Saturday 28 November");
    expect(m.text).toContain("ends on Saturday 28 November");
    expect(m.text).toContain("the monthly plan at $12.99 per month");
    expect(m.text).toContain("https://billing.example/portal");
    expect(m.text).toMatch(/cancel any time before then and you will not be charged/);
  });
  it("never invents a price when RevenueCat reported none", () => {
    const m = buildTrialReminderEmail(trial(), { period: null, price: null }, "https://x.example/");
    expect(m.text).not.toMatch(/[$€£]\s?\d/);
    expect(m.text).toContain("the price shown on your subscription page");
    expect(m.text).toContain("the paid plan");
  });
  it("names the yearly plan", () => {
    const m = buildTrialReminderEmail(
      trial(),
      { period: "year", price: "$99" },
      "https://x.example/",
    );
    expect(m.text).toContain("the yearly plan at $99 per year");
  });
  it("manage link: RevenueCat's link first, then the store's own page", () => {
    expect(manageUrlFor({ store: "web", managementUrl: "https://billing.example/p" })).toBe(
      "https://billing.example/p",
    );
    expect(manageUrlFor({ store: "app_store", managementUrl: null })).toContain("apple.com");
    expect(manageUrlFor({ store: "play_store", managementUrl: null })).toContain("play.google.com");
  });
});

/** An in-memory store with the real tables' semantics: a primary key on user_id and a scan marker. */
function makeStore(opts: { reminded?: string[]; candidates: string[]; lastScan?: Date }) {
  const reminded = new Set(opts.reminded ?? []);
  let lastScan = opts.lastScan ?? new Date(0);
  const store: TrialReminderStore = {
    async claimScan(now, gap) {
      if (now.getTime() - lastScan.getTime() < gap) return false;
      lastScan = now;
      return true;
    },
    async candidates(_since, limit) {
      return opts.candidates.filter((id) => !reminded.has(id)).slice(0, limit);
    },
    async claim(userId) {
      if (reminded.has(userId)) return false;
      reminded.add(userId);
      return true;
    },
    async release(userId) {
      reminded.delete(userId);
    },
  };
  return { store, reminded };
}

function makeDeps(
  over: Partial<TrialReminderDeps> & { trials?: Record<string, TrialSubscription | null> },
) {
  const sent: { to: string; subject: string; text: string }[] = [];
  const { trials = {}, ...rest } = over;
  const deps: TrialReminderDeps = {
    enabled: true,
    now: () => NOW,
    store: makeStore({ candidates: Object.keys(trials) }).store,
    readTrial: vi.fn(async (id: string) => trials[id] ?? null),
    planFor: async () => ({ period: "month", price: "$12.99" }),
    emailOf: async (id) => `${id}@example.test`,
    sendEmail: async (m) => {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
    },
    from: "Alphonso <hello@example.test>",
    ...rest,
  };
  return { deps, sent };
}

describe("sweepTrialReminders", () => {
  it("does nothing at all when switched off: no read, no RevenueCat call, no email", async () => {
    const { deps, sent } = makeDeps({ enabled: false, trials: { a: trial() } });
    const claimScan = vi.spyOn(deps.store, "claimScan");
    const r = await sweepTrialReminders(deps);
    expect(r.status).toBe("off");
    expect(deps.readTrial).not.toHaveBeenCalled();
    expect(claimScan).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it("emails only learners whose trial is due", async () => {
    const { deps, sent } = makeDeps({
      trials: {
        due: trial(),
        later: trial({ trialEndsAt: inDays(6) }),
        none: null,
        off: trial({ willNotRenew: true }),
      },
    });
    const r = await sweepTrialReminders(deps);
    expect(r).toMatchObject({ status: "scanned", checked: 4, sent: 1, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(["due@example.test"]);
  });

  it("sends at most one email per trial, however often it scans", async () => {
    const { store } = makeStore({ candidates: ["a"] });
    const { deps, sent } = makeDeps({ store, trials: { a: trial() } });
    await sweepTrialReminders(deps);
    // A later scan (a day on) finds the same learner still in the window: no second email.
    await sweepTrialReminders({ ...deps, now: () => new Date(NOW.getTime() + DAY) });
    expect(sent).toHaveLength(1);
  });

  it("a learner already reminded is never emailed, even if a scan is due", async () => {
    const { store } = makeStore({ candidates: ["a"], reminded: ["a"] });
    const { deps, sent } = makeDeps({ store, trials: { a: trial() } });
    const r = await sweepTrialReminders(deps);
    expect(sent).toHaveLength(0);
    expect(r.sent).toBe(0);
  });

  it("two overlapping claims cannot both send", async () => {
    const { store } = makeStore({ candidates: [] });
    expect(await store.claim("a", NOW)).toBe(true);
    expect(await store.claim("a", NOW)).toBe(false);
  });

  it("scans about once a day, not every 15 minutes", async () => {
    const { deps } = makeDeps({ trials: { a: trial() } });
    const first = await sweepTrialReminders(deps);
    const again = await sweepTrialReminders({
      ...deps,
      now: () => new Date(NOW.getTime() + 15 * 60_000),
    });
    expect(first.status).toBe("scanned");
    expect(again.status).toBe("not-due");
  });

  it("a failed send releases the claim so the next scan retries, and does not stop the others", async () => {
    const { store, reminded } = makeStore({ candidates: ["a", "b"] });
    let calls = 0;
    const sent: string[] = [];
    const { deps } = makeDeps({
      store,
      trials: { a: trial(), b: trial() },
      sendEmail: async (m) => {
        calls += 1;
        if (calls === 1) throw new Error("Resend 500");
        sent.push(m.to);
      },
    });
    const r = await sweepTrialReminders(deps);
    expect(r).toMatchObject({ checked: 2, sent: 1, failed: 1 });
    expect(reminded.has("a")).toBe(false);
    expect(reminded.has("b")).toBe(true);
    expect(sent).toEqual(["b@example.test"]);
  });

  it("a learner with no email address is skipped without a claim", async () => {
    const { store, reminded } = makeStore({ candidates: ["a"] });
    const { deps, sent } = makeDeps({ store, trials: { a: trial() }, emailOf: async () => null });
    await sweepTrialReminders(deps);
    expect(sent).toHaveLength(0);
    expect(reminded.size).toBe(0);
  });

  it("a RevenueCat outage for one learner leaves them for the next scan", async () => {
    const { store, reminded } = makeStore({ candidates: ["a", "b"] });
    const { deps, sent } = makeDeps({
      store,
      trials: { b: trial() },
      readTrial: async (id) => {
        if (id === "a") throw new Error("RevenueCat subscriber read failed (HTTP 503)");
        return trial();
      },
    });
    const r = await sweepTrialReminders(deps);
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(reminded.has("a")).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("does not send without a sender", async () => {
    const { deps, sent } = makeDeps({ trials: { a: trial() }, from: "" });
    const r = await sweepTrialReminders(deps);
    expect(r.status).toBe("no-sender");
    expect(sent).toHaveLength(0);
  });
});

describe("getTrialSubscription (what RevenueCat reports)", () => {
  const config = { secretApiKey: "sk_test" };
  const reply = (subscriptions: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    (async () =>
      new Response(JSON.stringify({ subscriber: { subscriptions, ...extra } }), {
        status: 200,
      })) as unknown as typeof fetch;

  it("reads the trial's product, end date and store", async () => {
    const t = await getTrialSubscription(
      config,
      "u1",
      reply({
        prod_a: { period_type: "trial", expires_date: "2026-11-28T10:00:00Z", store: "app_store" },
      }),
    );
    expect(t).toMatchObject({ productId: "prod_a", store: "app_store", willNotRenew: false });
    expect(t?.trialEndsAt.toISOString()).toBe("2026-11-28T10:00:00.000Z");
  });
  it("ignores a paid period, a sandbox purchase and the Test Store", async () => {
    const f = reply({
      paid: { period_type: "normal", expires_date: "2026-11-28T10:00:00Z", store: "app_store" },
      sb: {
        period_type: "trial",
        expires_date: "2026-11-28T10:00:00Z",
        store: "app_store",
        is_sandbox: true,
      },
      ts: { period_type: "trial", expires_date: "2026-11-28T10:00:00Z", store: "test_store" },
    });
    expect(await getTrialSubscription(config, "u1", f)).toBeNull();
  });
  it("flags a cancelled renewal and a billing problem", async () => {
    const t = await getTrialSubscription(
      config,
      "u1",
      reply({
        p: {
          period_type: "trial",
          expires_date: "2026-11-28T10:00:00Z",
          store: "app_store",
          unsubscribe_detected_at: "2026-11-27T00:00:00Z",
          billing_issues_detected_at: "2026-11-27T00:00:00Z",
        },
      }),
    );
    expect(t).toMatchObject({ willNotRenew: true, billingIssue: true });
  });
  it("throws on an outage rather than reporting no trial; a 404 is no trial", async () => {
    await expect(
      getTrialSubscription(
        config,
        "u1",
        (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/HTTP 503/);
    expect(
      await getTrialSubscription(
        config,
        "u1",
        (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
  });
});
