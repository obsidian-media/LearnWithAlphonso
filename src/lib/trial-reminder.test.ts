import { describe, expect, it, vi } from "vitest";
import {
  buildTrialReminderEmail,
  manageUrlFor,
  needsReminder,
  priceToShow,
  reminderEnabled,
  type TrialSubscription,
} from "./trial-reminder";
import {
  supabaseTrialReminderStore,
  sweepTrialReminders,
  type TrialReminderDeps,
  type TrialReminderStore,
} from "./trial-reminder.server";
import { getTrialSubscription, RevenueCatHttpError } from "./revenuecat-entitlement";

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
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: " true " })).toBe(true);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "TRUE" })).toBe(false);
    expect(reminderEnabled({ TRIAL_REMINDER_ENABLED: "True" })).toBe(false);
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
    expect(m.text).toContain("your plan's regular price");
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

describe("priceToShow (the price rule)", () => {
  const plan = { period: "month" as const, price: "$12.99", priceCountry: "US" };
  it("shows the price only for a web trial whose offering country is the learner's country", () => {
    expect(priceToShow({ store: "web" }, plan, "US").price).toBe("$12.99");
    expect(priceToShow({ store: "web" }, plan, "us").price).toBe("$12.99");
  });
  it("omits it for an app-store trial, a different country, an unknown country or an unknown price country", () => {
    expect(priceToShow({ store: "app_store" }, plan, "US").price).toBeNull();
    expect(priceToShow({ store: "play_store" }, plan, "US").price).toBeNull();
    expect(priceToShow({ store: "web" }, plan, "CA").price).toBeNull();
    expect(priceToShow({ store: "web" }, plan, null).price).toBeNull();
    expect(priceToShow({ store: "web" }, { ...plan, priceCountry: null }, "US").price).toBeNull();
  });
  it("the email then says the regular price and points to the subscription page", () => {
    const m = buildTrialReminderEmail(
      trial({ store: "app_store" }),
      priceToShow({ store: "app_store" }, plan, "US"),
      "https://x.example/",
    );
    expect(m.text).not.toContain("$12.99");
    expect(m.text).toContain("your plan's regular price");
    expect(m.text).toContain("The exact amount is on your subscription page.");
  });
});

/** An in-memory store with the real tables' semantics: dedupe on user_id and a last-checked time per learner. */
function makeStore(opts: {
  reminded?: string[];
  candidates: string[];
  checked?: Record<string, Date>;
}) {
  const reminded = new Set(opts.reminded ?? []);
  const checked = new Map<string, Date>(Object.entries(opts.checked ?? {}));
  const store: TrialReminderStore = {
    async candidates(_since, checkedBefore, limit) {
      return opts.candidates
        .filter((id) => !reminded.has(id))
        .filter((id) => !checked.has(id) || checked.get(id)! < checkedBefore)
        .sort((a, b) => (checked.get(a)?.getTime() ?? -1) - (checked.get(b)?.getTime() ?? -1))
        .slice(0, limit);
    },
    async markChecked(userId, at) {
      checked.set(userId, at);
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
  return { store, reminded, checked };
}

function makeDeps(
  over: Partial<TrialReminderDeps> & { trials?: Record<string, TrialSubscription | null> },
) {
  const sent: { to: string; subject: string; text: string }[] = [];
  const { trials = {}, ...rest } = over;
  const clock = { t: NOW.getTime() };
  const sleeps: number[] = [];
  const deps: TrialReminderDeps = {
    enabled: true,
    now: () => new Date(clock.t),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    store: makeStore({ candidates: Object.keys(trials) }).store,
    readTrial: vi.fn(async (id: string) => trials[id] ?? null),
    planFor: async () => ({ period: "month", price: "$12.99", priceCountry: "US" }),
    countryOf: async () => "US",
    emailOf: async (id) => `${id}@example.test`,
    sendEmail: async (m) => {
      sent.push({ to: m.to, subject: m.subject, text: m.text });
    },
    from: "Alphonso <hello@example.test>",
    ...rest,
  };
  return { deps, sent, clock, sleeps };
}

describe("sweepTrialReminders", () => {
  it("does nothing at all when switched off: no read, no RevenueCat call, no email", async () => {
    const { deps, sent } = makeDeps({ enabled: false, trials: { a: trial() } });
    const candidates = vi.spyOn(deps.store, "candidates");
    const r = await sweepTrialReminders(deps);
    expect(r.status).toBe("off");
    expect(deps.readTrial).not.toHaveBeenCalled();
    expect(candidates).not.toHaveBeenCalled();
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
    expect(r).toMatchObject({ status: "done", checked: 4, sent: 1, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(["due@example.test"]);
  });

  it("sends at most one email per trial, however often it sweeps", async () => {
    const { store } = makeStore({ candidates: ["a"] });
    const { deps, sent, clock } = makeDeps({ store, trials: { a: trial() } });
    await sweepTrialReminders(deps);
    clock.t += 21 * 3_600_000; // due to be checked again, still inside the window
    await sweepTrialReminders(deps);
    expect(sent).toHaveLength(1);
  });

  it("a learner already reminded is never emailed", async () => {
    const { store } = makeStore({ candidates: ["a"], reminded: ["a"] });
    const { deps, sent } = makeDeps({ store, trials: { a: trial() } });
    await sweepTrialReminders(deps);
    expect(sent).toHaveLength(0);
  });

  it("two overlapping claims cannot both send", async () => {
    const { store } = makeStore({ candidates: [] });
    expect(await store.claim("a", NOW)).toBe(true);
    expect(await store.claim("a", NOW)).toBe(false);
  });

  it("reads each learner at most once per 20 hours, so a 15-minute sweep does not re-read them", async () => {
    const { deps, clock } = makeDeps({ trials: { a: trial({ trialEndsAt: inDays(6) }) } });
    await sweepTrialReminders(deps);
    clock.t += 15 * 60_000;
    await sweepTrialReminders(deps);
    expect(deps.readTrial).toHaveBeenCalledTimes(1);
    clock.t += 20 * 3_600_000;
    await sweepTrialReminders(deps);
    expect(deps.readTrial).toHaveBeenCalledTimes(2);
  });

  it("a failed send releases the claim so the next sweep retries, and does not stop the others", async () => {
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

  it("a RevenueCat outage for one learner leaves them unchecked for the next sweep", async () => {
    const { store, checked } = makeStore({ candidates: ["a", "b"] });
    const { deps, sent } = makeDeps({
      store,
      readTrial: async (id) => {
        if (id === "a") throw new Error("socket hang up");
        return trial();
      },
    });
    const r = await sweepTrialReminders(deps);
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(checked.has("a")).toBe(false);
    expect(checked.has("b")).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("does not send without a sender", async () => {
    const { deps, sent } = makeDeps({ trials: { a: trial() }, from: "" });
    const r = await sweepTrialReminders(deps);
    expect(r.status).toBe("no-sender");
    expect(sent).toHaveLength(0);
  });

  it("puts the price in the email only under the price rule", async () => {
    const web = makeDeps({ trials: { a: trial({ store: "web" }) } });
    await sweepTrialReminders(web.deps);
    expect(web.sent[0]!.text).toContain("$12.99 per month");
    const store = makeDeps({ trials: { a: trial({ store: "app_store" }) } });
    await sweepTrialReminders(store.deps);
    expect(store.sent[0]!.text).not.toContain("$12.99");
    expect(store.sent[0]!.text).toContain("your plan's regular price");
  });
});

describe("the time budget, the cursor and the rate limit", () => {
  const many = (n: number) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`u${i}`, null]));

  it("stops reading when the budget is spent, and the next sweep resumes with the learners not yet read", async () => {
    const { store, checked } = makeStore({ candidates: Object.keys(many(10)) });
    const { deps, clock } = makeDeps({ store });
    // Every read takes 5 s of the clock.
    deps.readTrial = vi.fn(async () => {
      clock.t += 5_000;
      return null;
    });
    const first = await sweepTrialReminders(deps);
    expect(first.status).toBe("budget");
    expect(first.checked).toBe(4); // 4 x 5 s reaches the 18 s budget
    expect(checked.size).toBe(4);

    clock.t += 15 * 60_000;
    const second = await sweepTrialReminders(deps);
    // The four already read are not read again (20 h); the next four are.
    expect(second.checked).toBe(4);
    expect(checked.size).toBe(8);
    expect([...checked.keys()].sort()).toEqual(["u0", "u1", "u2", "u3", "u4", "u5", "u6", "u7"]);
  });

  it("never starves: least recently checked first, so a long list is covered over successive sweeps", async () => {
    const ids = Object.keys(many(6));
    const { store, checked } = makeStore({
      candidates: ids,
      checked: {
        u0: new Date(NOW.getTime() - 30 * 3_600_000),
        u1: new Date(NOW.getTime() - 25 * 3_600_000),
      },
    });
    const { deps } = makeDeps({ store });
    const order: string[] = [];
    deps.readTrial = async (id) => {
      order.push(id);
      return null;
    };
    await sweepTrialReminders(deps);
    // Never-checked learners first, then the oldest checks.
    expect(order.slice(-2)).toEqual(["u0", "u1"]);
    expect(checked.size).toBe(6);
  });

  it("pauses between reads", async () => {
    const { deps, sleeps } = makeDeps({ trials: many(3) });
    await sweepTrialReminders(deps);
    expect(sleeps).toEqual([150, 150]);
  });

  it("stops the sweep on a 429 and does not mark the rest as read", async () => {
    const { store, checked } = makeStore({ candidates: ["a", "b", "c"] });
    const { deps } = makeDeps({ store });
    deps.readTrial = vi.fn(async (id: string) => {
      if (id === "b") throw new RevenueCatHttpError(429);
      return null;
    });
    const r = await sweepTrialReminders(deps);
    expect(r.status).toBe("rate-limited");
    expect(deps.readTrial).toHaveBeenCalledTimes(2);
    expect([...checked.keys()]).toEqual(["a"]);
  });

  it("stops after 3 server errors in a row, but a success in between resets the count", async () => {
    const run = async (pattern: (number | null)[]) => {
      const ids = pattern.map((_, i) => `u${i}`);
      const { store } = makeStore({ candidates: ids });
      const { deps } = makeDeps({ store });
      let i = 0;
      deps.readTrial = vi.fn(async () => {
        const code = pattern[i++];
        if (code) throw new RevenueCatHttpError(code);
        return null;
      });
      const r = await sweepTrialReminders(deps);
      return { r, reads: (deps.readTrial as ReturnType<typeof vi.fn>).mock.calls.length };
    };
    const stopped = await run([503, 502, 500, null, null]);
    expect(stopped.r.status).toBe("rate-limited");
    expect(stopped.reads).toBe(3);
    const carried = await run([503, 502, null, 500, 503, null]);
    expect(carried.r.status).toBe("done");
    expect(carried.reads).toBe(6);
  });
});

/** The real store, over a Supabase client that records the exact calls it is given. */
describe("supabaseTrialReminderStore", () => {
  function fakeClient(
    reply: Record<
      string,
      { data?: unknown; error?: { message: string; code?: string } | null }
    > = {},
  ) {
    const calls: { op: string; args: unknown[] }[] = [];
    const answer = (key: string) => ({ data: null, error: null, ...(reply[key] ?? {}) });
    const chain = (table: string) => {
      const q: Record<string, unknown> = {};
      q.insert = async (row: unknown) => (
        calls.push({ op: `${table}.insert`, args: [row] }),
        answer(`${table}.insert`)
      );
      q.upsert = async (row: unknown, opts: unknown) => (
        calls.push({ op: `${table}.upsert`, args: [row, opts] }),
        answer(`${table}.upsert`)
      );
      q.delete = () => ({
        eq: async (col: string, v: unknown) => (
          calls.push({ op: `${table}.delete.eq`, args: [col, v] }),
          answer(`${table}.delete`)
        ),
      });
      return q;
    };
    const client = {
      from: chain,
      rpc: async (fn: string, args: unknown) => (
        calls.push({ op: `rpc.${fn}`, args: [args] }),
        answer(`rpc.${fn}`)
      ),
    };
    return { client, calls };
  }

  it("candidates: asks the database function with the exact window, cutoff and limit, in its order", async () => {
    const { client, calls } = fakeClient({
      "rpc.trial_reminder_candidates": { data: [{ user_id: "u2" }, { user_id: "u1" }] },
    });
    const ids = await supabaseTrialReminderStore(client).candidates(
      "2026-11-17",
      new Date("2026-11-25T14:00:00Z"),
      200,
    );
    expect(ids).toEqual(["u2", "u1"]);
    expect(calls).toEqual([
      {
        op: "rpc.trial_reminder_candidates",
        args: [
          {
            p_active_since: "2026-11-17",
            p_checked_before: "2026-11-25T14:00:00.000Z",
            p_limit: 200,
          },
        ],
      },
    ]);
  });

  it("markChecked: upserts on user_id with the time", async () => {
    const { client, calls } = fakeClient();
    await supabaseTrialReminderStore(client).markChecked("u1", new Date("2026-11-26T10:00:00Z"));
    expect(calls).toEqual([
      {
        op: "trial_reminder_checked.upsert",
        args: [
          { user_id: "u1", checked_at: "2026-11-26T10:00:00.000Z" },
          { onConflict: "user_id" },
        ],
      },
    ]);
  });

  it("claim: inserts, and maps a duplicate key (23505) to false without throwing", async () => {
    const ok = fakeClient();
    expect(
      await supabaseTrialReminderStore(ok.client).claim("u1", new Date("2026-11-28T10:00:00Z")),
    ).toBe(true);
    expect(ok.calls[0]).toEqual({
      op: "trial_reminders.insert",
      args: [{ user_id: "u1", trial_ends_at: "2026-11-28T10:00:00.000Z" }],
    });
    const dup = fakeClient({
      "trial_reminders.insert": { error: { message: "dup", code: "23505" } },
    });
    expect(await supabaseTrialReminderStore(dup.client).claim("u1", NOW)).toBe(false);
  });

  it("claim: any other database error throws, so a learner is never emailed on an unknown claim state", async () => {
    const bad = fakeClient({
      "trial_reminders.insert": { error: { message: "boom", code: "08006" } },
    });
    await expect(supabaseTrialReminderStore(bad.client).claim("u1", NOW)).rejects.toThrow(
      /claim failed/,
    );
  });

  it("release: deletes that learner's claim, and a failure throws", async () => {
    const ok = fakeClient();
    await supabaseTrialReminderStore(ok.client).release("u1");
    expect(ok.calls).toEqual([{ op: "trial_reminders.delete.eq", args: ["user_id", "u1"] }]);
    const bad = fakeClient({ "trial_reminders.delete": { error: { message: "x" } } });
    await expect(supabaseTrialReminderStore(bad.client).release("u1")).rejects.toThrow();
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
