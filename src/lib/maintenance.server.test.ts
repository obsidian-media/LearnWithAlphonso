import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ERASURE_RETRY_WINDOW_MS,
  handleMaintenance,
  OVERDUE_AFTER_MS,
  retryAppleRevocations,
  retryRevenueCatErasures,
  REVOCATION_RETRY_WINDOW_MS,
  sweepReports,
  UNDELIVERED_AFTER_MS,
  type MaintenanceDeps,
} from "./maintenance.server";
import type { EmailMessage } from "./report-notify.server";
import { costConfig } from "./ai-cost-config";
import type { AiCostSweepDeps } from "./ai-cost-sweep.server";
import type { TrialReminderDeps } from "./trial-reminder.server";

type Row = Record<string, unknown>;

/**
 * A small in-memory stand-in for the service client: real rows, real filters, so a test asserts on what is left
 * in the tables rather than on which methods were called.
 */
function fakeDb(tables: Record<string, Row[]>, failing: Record<string, string> = {}) {
  const from = (table: string) => {
    const rows = () => (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    let limit = Infinity;
    let order: { column: string; ascending: boolean; nullsFirst?: boolean } | null = null;
    const run = () => {
      if (failing[table]) return { data: null, error: { message: failing[table] } };
      const matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        tables[table] = rows().filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      if (op === "update") {
        for (const r of matched) Object.assign(r, patch);
        return { data: null, error: null };
      }
      const sorted = order
        ? [...matched].sort((a, b) => {
            const av = a[order!.column];
            const bv = b[order!.column];
            if (av == null || bv == null) {
              if (av == bv) return 0;
              return (av == null) === Boolean(order!.nullsFirst) ? -1 : 1;
            }
            return String(av).localeCompare(String(bv)) * (order!.ascending ? 1 : -1);
          })
        : matched;
      return { data: sorted.slice(0, limit).map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q,
      delete: () => ((op = "delete"), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      order: (column: string, o: { ascending: boolean; nullsFirst?: boolean }) => (
        (order = { column, ...o }),
        q
      ),
      limit: (n: number) => ((limit = n), q),
      upsert: (incoming: Row[], o: { onConflict: string }) => {
        if (failing[table]) return Promise.resolve({ error: { message: failing[table] } });
        for (const row of incoming) {
          const existing = rows().find((r) => r[o.onConflict] === row[o.onConflict]);
          if (existing) Object.assign(existing, row);
          else rows().push({ ...row });
        }
        return Promise.resolve({ error: null });
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return q;
  };
  return { from } as unknown as MaintenanceDeps["db"];
}

const NOW = new Date("2026-10-20T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const APPLE = { teamId: "t", keyId: "k", privateKey: "p", clientId: "c" } as never;

function makeDeps(tables: Record<string, Row[]>, over: Partial<MaintenanceDeps> = {}) {
  const sent: EmailMessage[] = [];
  const deps: MaintenanceDeps = {
    db: fakeDb(tables),
    now: () => NOW,
    send: async (m) => void sent.push(m),
    appleConfig: () => APPLE,
    revoke: async () => true,
    revenueCatConfig: () => ({ secretApiKey: "sk_test" }),
    eraseSubscriber: async () => "erased",
    cancelWebSubscription: async () => "none",
    alertTo: "owner@example.com",
    ...over,
  };
  return { deps, sent };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REPORT_NOTIFY_SECRET;
});

describe("retryAppleRevocations", () => {
  const pending = (id: string, age: number, attempts = 0): Row => ({
    id,
    refresh_token: `token-${id}`,
    created_at: ago(age),
    attempts,
    last_attempt_at: null,
  });

  it("opens a sealed credential before sending it to Apple", async () => {
    const { randomBytes } = await import("node:crypto");
    const { sealToken } = await import("./token-sealing.server");
    const key = randomBytes(32).toString("base64");
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", key);
    try {
      const row = { ...pending("a", 60_000), refresh_token: sealToken("token-a", key) };
      const tables = { apple_revocation_pending: [row] };
      const revoke = vi.fn(async () => true);
      const { deps } = makeDeps(tables, { revoke });
      expect(await retryAppleRevocations(deps)).toEqual({
        revoked: 1,
        stillPending: 0,
        expired: 0,
      });
      expect(revoke).toHaveBeenCalledWith(APPLE, "token-a");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("removes a credential once Apple confirms the revocation", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000)] };
    const revoke = vi.fn(async () => true);
    const { deps, sent } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 1, stillPending: 0, expired: 0 });
    expect(revoke).toHaveBeenCalledWith(APPLE, "token-a");
    expect(tables.apple_revocation_pending).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("keeps a credential, and counts the attempt, while Apple still refuses", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000, 2)] };
    const { deps } = makeDeps(tables, { revoke: async () => false });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 0 });
    expect(tables.apple_revocation_pending).toHaveLength(1);
    expect(tables.apple_revocation_pending[0]).toMatchObject({
      attempts: 3,
      last_attempt_at: NOW.toISOString(),
    });
  });

  it("treats a thrown revocation call as a refusal, not a crash", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000), pending("b", 30_000)] };
    const revoke = vi.fn(async (_c: unknown, token: string) => {
      if (token === "token-a") throw new Error("network");
      return true;
    });
    const { deps } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 1, stillPending: 1, expired: 0 });
    expect(tables.apple_revocation_pending.map((r) => r.id)).toEqual(["a"]);
  });

  it("tries one last time at the end of the window, then removes the credential and tells the owner", async () => {
    const tables = {
      apple_revocation_pending: [pending("old", REVOCATION_RETRY_WINDOW_MS + 1), pending("new", 1)],
    };
    const revoke = vi.fn(async () => false);
    const { deps, sent } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 1 });
    expect(revoke).toHaveBeenCalledWith(APPLE, "token-old");
    expect(tables.apple_revocation_pending.map((r) => r.id)).toEqual(["new"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@example.com");
    // The credential itself never leaves the database.
    expect(JSON.stringify(sent)).not.toContain("token-old");
  });

  it("holds credentials (inside the window) while the Apple secrets are missing", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000)] };
    const revoke = vi.fn(async () => true);
    const { deps } = makeDeps(tables, { appleConfig: () => null, revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 0 });
    expect(revoke).not.toHaveBeenCalled();
    expect(tables.apple_revocation_pending).toHaveLength(1);
  });
});

describe("retryRevenueCatErasures", () => {
  const pending = (id: string, age: number, attempts = 0): Row => ({
    app_user_id: id,
    created_at: ago(age),
    attempts,
    last_attempt_at: null,
  });

  it("removes the row once RevenueCat confirms the erase", async () => {
    const tables = { revenuecat_erasure_pending: [pending("user-a", 60_000)] };
    const eraseSubscriber = vi.fn(async () => "erased" as const);
    const { deps, sent } = makeDeps(tables, { eraseSubscriber });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 1, stillPending: 0, expired: 0 });
    expect(eraseSubscriber).toHaveBeenCalledWith({ secretApiKey: "sk_test" }, "user-a");
    expect(tables.revenuecat_erasure_pending).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("keeps the row, and counts the attempt, while the erase keeps failing or throwing", async () => {
    const tables = {
      revenuecat_erasure_pending: [pending("user-a", 60_000, 4), pending("user-b", 30_000)],
    };
    const eraseSubscriber = vi.fn(async (_c: unknown, id: string) => {
      if (id === "user-b") throw new Error("network");
      return "failed" as const;
    });
    const { deps } = makeDeps(tables, { eraseSubscriber });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 0, stillPending: 2, expired: 0 });
    expect(tables.revenuecat_erasure_pending.map((r) => r.attempts)).toEqual([5, 1]);
  });

  it("after 30 days hands the id to the owner by email, once, and never logs it", async () => {
    const tables = {
      revenuecat_erasure_pending: [
        pending("11111111-aaaa-4bbb-8ccc-222222222222", ERASURE_RETRY_WINDOW_MS + 1),
        pending("user-new", 1),
      ],
    };
    const { deps, sent } = makeDeps(tables, { eraseSubscriber: async () => "failed" });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 0, stillPending: 1, expired: 1 });
    expect(tables.revenuecat_erasure_pending.map((r) => r.app_user_id)).toEqual(["user-new"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("11111111-aaaa-4bbb-8ccc-222222222222");
    expect(sent[0].text).not.toContain("user-new");
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("11111111-aaaa-4bbb-8ccc-222222222222");
    expect(await retryRevenueCatErasures(deps)).toMatchObject({ expired: 0 });
    expect(sent).toHaveLength(1);
  });

  it("cancels web billing before erasing, and erases once there is nothing left to cancel", async () => {
    const tables = { revenuecat_erasure_pending: [pending("user-a", 60_000)] };
    const order: string[] = [];
    const cancelWebSubscription = vi.fn(async () => (order.push("cancel"), "cancelled" as const));
    const eraseSubscriber = vi.fn(async () => (order.push("erase"), "erased" as const));
    const { deps } = makeDeps(tables, { cancelWebSubscription, eraseSubscriber });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 1, stillPending: 0, expired: 0 });
    expect(order).toEqual(["cancel", "erase"]);
  });

  it("a web subscription that still cannot be cancelled is never erased, never expired, and is logged every run", async () => {
    const id = "33333333-aaaa-4bbb-8ccc-444444444444";
    const tables = { revenuecat_erasure_pending: [pending(id, ERASURE_RETRY_WINDOW_MS + 1)] };
    const eraseSubscriber = vi.fn(async () => "erased" as const);
    const { deps, sent } = makeDeps(tables, {
      cancelWebSubscription: async () => "failed",
      eraseSubscriber,
    });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 0, stillPending: 1, expired: 0 });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 0, stillPending: 1, expired: 0 });
    expect(eraseSubscriber).not.toHaveBeenCalled();
    expect(tables.revenuecat_erasure_pending).toHaveLength(1);
    expect(sent).toEqual([]);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged.match(/web subscription was NOT cancelled/g)).toHaveLength(2);
    expect(logged).not.toContain(id);
  });

  it("rows stuck on a failed cancel never starve newer erasures (least recently tried first) (I3)", async () => {
    const stuck = Array.from({ length: 20 }, (_, i) => ({
      ...pending(`stuck-${i}`, 10 * 86_400_000 + i, 9),
      last_attempt_at: new Date(NOW.getTime() - 60_000).toISOString(),
    }));
    const tables = { revenuecat_erasure_pending: [...stuck, pending("fresh", 60_000)] };
    const cancelWebSubscription = vi.fn(async (_c: unknown, id: string) =>
      id.startsWith("stuck") ? ("failed" as const) : ("none" as const),
    );
    const eraseSubscriber = vi.fn(async () => "erased" as const);
    const { deps } = makeDeps(tables, { cancelWebSubscription, eraseSubscriber });
    const result = await retryRevenueCatErasures(deps);
    expect(result.erased).toBe(1);
    expect(eraseSubscriber).toHaveBeenCalledWith({ secretApiKey: "sk_test" }, "fresh");
  });

  it("tells the owner once, by email with the id, when a web cancel keeps failing (I4)", async () => {
    const id = "55555555-aaaa-4bbb-8ccc-666666666666";
    const tables = { revenuecat_erasure_pending: [pending(id, 2 * 86_400_000, 2)] };
    const { deps, sent } = makeDeps(tables, { cancelWebSubscription: async () => "failed" });
    await retryRevenueCatErasures(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@example.com");
    expect(sent[0].text).toContain(id);
    await retryRevenueCatErasures(deps);
    await retryRevenueCatErasures(deps);
    expect(sent).toHaveLength(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain(id);
  });

  it("holds rows while RevenueCat is not configured on the server", async () => {
    const tables = { revenuecat_erasure_pending: [pending("user-a", 60_000)] };
    const eraseSubscriber = vi.fn(async () => "erased" as const);
    const { deps } = makeDeps(tables, { revenueCatConfig: () => null, eraseSubscriber });
    expect(await retryRevenueCatErasures(deps)).toEqual({ erased: 0, stillPending: 1, expired: 0 });
    expect(eraseSubscriber).not.toHaveBeenCalled();
  });
});

describe("sweepReports", () => {
  const report = (id: string, age: number): Row => ({ id, kind: "user", created_at: ago(age) });

  it("emails the owner once about a report whose first notification never went out", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", UNDELIVERED_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 1, escalated: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("r1");
    expect(tables.content_report_delivery).toMatchObject([
      { report_id: "r1", notified_at: NOW.toISOString(), attempts: 1 },
    ]);
    // The next pass finds it delivered and stays quiet.
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toHaveLength(1);
  });

  it("leaves alone a report the trigger already emailed, and one too new to have been missed", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("sent", UNDELIVERED_AFTER_MS + 1000), report("fresh", 1000)],
      content_report_delivery: [
        { report_id: "sent", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toEqual([]);
  });

  it("keeps a report undelivered, and counts the attempt, when the email fails", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", UNDELIVERED_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps } = makeDeps(tables, {
      send: async () => {
        throw new Error("mail down");
      },
    });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(tables.content_report_delivery).toMatchObject([
      { report_id: "r1", notified_at: null, attempts: 1 },
    ]);
  });

  it("reminds the owner once about a report still open near the response window", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [
        report("late", OVERDUE_AFTER_MS + 1000),
        report("recent", OVERDUE_AFTER_MS - 60_000),
      ],
      content_report_delivery: [
        { report_id: "late", notified_at: ago(OVERDUE_AFTER_MS), escalated_at: null, attempts: 0 },
        { report_id: "recent", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("late");
    expect(sent[0].text).not.toContain("recent");
    const late = tables.content_report_delivery.find((r) => r.report_id === "late")!;
    expect(late.escalated_at).toBe(NOW.toISOString());
    // The first notification's record is kept, not overwritten.
    expect(late.notified_at).toBe(ago(OVERDUE_AFTER_MS));
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toHaveLength(1);
  });

  it("does not mark a report escalated when the reminder fails, so the next pass tries again", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("late", OVERDUE_AFTER_MS + 1000)],
      content_report_delivery: [
        { report_id: "late", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps } = makeDeps(tables, {
      send: async () => {
        throw new Error("mail down");
      },
    });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(tables.content_report_delivery[0].escalated_at).toBeNull();
  });

  it("marks nothing delivered, and logs, when there is no address to send to", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", OVERDUE_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables, { alertTo: "" });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toEqual([]);
    expect(tables.content_report_delivery).toEqual([]);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("REPORT_NOTIFY_TO");
  });

  it("never quotes a report's free text or names, only its id, kind and time", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [
        {
          ...report("r1", UNDELIVERED_AFTER_MS + 1000),
          reason: "SECRET-REASON",
          kind: "ai_response",
        },
      ],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    await sweepReports(deps);
    expect(sent[0].text).toContain("ai_response");
    expect(sent[0].text).not.toContain("SECRET-REASON");
  });
});

describe("handleMaintenance", () => {
  const SECRET = "s".repeat(40);
  const req = (secret?: string) =>
    new Request("https://example.com/api/internal/maintenance", {
      method: "POST",
      headers: secret ? { "x-report-notify-secret": secret } : {},
      body: "{}",
    });

  it("is refused without the shared secret, before anything is read", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const make = vi.fn();
    expect((await handleMaintenance(req(), make)).status).toBe(401);
    expect((await handleMaintenance(req("x".repeat(40)), make)).status).toBe(401);
    expect(make).not.toHaveBeenCalled();
  });

  it("is refused when the secret is not configured", async () => {
    const make = vi.fn();
    expect((await handleMaintenance(req(SECRET), make)).status).toBe(503);
    expect(make).not.toHaveBeenCalled();
  });

  it("runs both tasks and reports counts only", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const tables: Record<string, Row[]> = {
      apple_revocation_pending: [
        { id: "a", refresh_token: "token-a", created_at: ago(1000), attempts: 0 },
      ],
      content_reports: [{ id: "r1", kind: "user", created_at: ago(UNDELIVERED_AFTER_MS + 1000) }],
      content_report_delivery: [],
    };
    const { deps } = makeDeps(tables);
    const res = await handleMaintenance(req(SECRET), async () => deps);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      ok: true,
      failures: [],
      revocations: { revoked: 1, stillPending: 0, expired: 0 },
      reports: { delivered: 1, escalated: 0 },
      erasures: { erased: 0, stillPending: 0, expired: 0 },
    });
    expect(body).not.toContain("token-a");
  });

  describe("the trial reminder step", () => {
    const reminder = (over: Partial<TrialReminderDeps> = {}): TrialReminderDeps => ({
      enabled: true,
      now: () => new Date("2026-11-26T10:00:00Z"),
      store: {
        markChecked: async () => {},
        candidates: async () => [],
        claim: async () => true,
        release: async () => {},
      },
      readTrial: async () => null,
      planFor: async () => ({ period: null, price: null }),
      emailOf: async () => null,
      countryOf: async () => null,
      sleep: async () => {},
      sendEmail: async () => {},
      from: "Alphonso <a@example.com>",
      ...over,
    });

    it("is part of the pass and its counts are reported", async () => {
      process.env.REPORT_NOTIFY_SECRET = SECRET;
      const { deps } = makeDeps({}, { trialReminders: reminder() });
      const res = await handleMaintenance(req(SECRET), async () => deps);
      expect((await res.json()).trialReminders).toEqual({
        status: "done",
        checked: 0,
        sent: 0,
        failed: 0,
      });
    });

    it("a failing reminder step is named in failures and does not stop the pass", async () => {
      process.env.REPORT_NOTIFY_SECRET = SECRET;
      const { deps } = makeDeps(
        {},
        {
          trialReminders: reminder({
            store: {
              candidates: async () => {
                throw new Error("db down");
              },
              markChecked: async () => {},
              claim: async () => true,
              release: async () => {},
            },
          }),
        },
      );
      const res = await handleMaintenance(req(SECRET), async () => deps);
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.failures).toEqual(["trial-reminders"]);
      expect(body.erasures).not.toBeNull();
  describe("the database settlements run in every pass", () => {
    const run = async (
      rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>,
    ) => {
      process.env.REPORT_NOTIFY_SECRET = SECRET;
      const { deps } = makeDeps({}, { settle: { rpc: rpc as never } });
      const res = await handleMaintenance(req(SECRET), async () => deps);
      return { status: res.status, body: await res.json() };
    };

    it("settles the closed season cohorts and last weeks' challenge rewards, and reports the counts", async () => {
      const calls: string[] = [];
      const { status, body } = await run(async (fn) => {
        calls.push(fn);
        return { data: fn === "resolve_closed_season_cohorts" ? 3 : 7, error: null };
      });
      expect(status).toBe(200);
      expect(calls).toEqual(["resolve_closed_season_cohorts", "settle_closed_weekly_challenges"]);
      expect(body).toMatchObject({ ok: true, seasonsSettled: 3, challengesPaid: 7 });
    });

    it("a refused settlement is a failure of the pass, not a quiet zero, and the other still runs", async () => {
      const { status, body } = await run(async (fn) =>
        fn === "resolve_closed_season_cohorts"
          ? { data: null, error: { message: "permission denied" } }
          : { data: 2, error: null },
      );
      expect(status).toBe(500);
      expect(body).toMatchObject({
        ok: false,
        failures: ["season-cohorts"],
        seasonsSettled: null,
        challengesPaid: 2,
      });
    });
  });

  describe("the spend breaker's failures reach the pass's status", () => {
    const cfg = costConfig({});
    const aiCost = (
      trip: { data: unknown; error: { message: string; code?: string } | null },
      send: () => Promise<void> = async () => {},
    ): AiCostSweepDeps => ({
      rpc: async (fn) =>
        fn === "trip_ai_spend_breaker"
          ? trip
          : { data: fn === "rollup_ai_cost_log" ? 0 : null, error: null },
      now: () => new Date("2026-11-18T00:30:00Z"),
      send,
      ownerEmail: "owner@example.com",
      from: "Alphonso <a@example.com>",
      cfg,
    });
    const run = async (a: AiCostSweepDeps) => {
      process.env.REPORT_NOTIFY_SECRET = SECRET;
      const { deps } = makeDeps({}, { aiCost: a });
      const res = await handleMaintenance(req(SECRET), async () => deps);
      return { status: res.status, body: await res.json() };
    };

    it("a breaker that cannot be asked fails the pass (500, named in failures)", async () => {
      const r = await run(aiCost({ data: null, error: { message: "db down" } }));
      expect(r.status).toBe(500);
      expect(r.body.ok).toBe(false);
      expect(r.body.failures).toContain("ai-spend-breaker");
    });

    it("a trip whose email could not be sent fails the pass too (AI is off and nobody was told)", async () => {
      const r = await run(
        aiCost({ data: { tripped: true, totalMicro: 120_000_000 }, error: null }, async () => {
          throw new Error("smtp");
        }),
      );
      expect(r.status).toBe(500);
      expect(r.body.failures).toContain("ai-spend-breaker");
    });

    it("a trip that was emailed, a quiet pass and a database without the function are all fine", async () => {
      for (const trip of [
        { data: { tripped: true, totalMicro: 120_000_000 }, error: null },
        { data: { tripped: false, totalMicro: 1 }, error: null },
        { data: null, error: { message: "no function", code: "PGRST202" } },
      ]) {
        const r = await run(aiCost(trip));
        expect(r.status, JSON.stringify(trip)).toBe(200);
        expect(r.body.failures).toEqual([]);
      }
    });
  });

  it("also runs the support notices when they are wired in, and a failure there stops nothing else", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const store = {
      getRow: async () => null,
      waitingRows: async () => [],
      recipient: async () => null,
      emailsSentSince: async () => 0,
      save: async () => {},
      unseenNewTickets: async () => ["c-1", "c-2"],
      lastDigestAt: async () => null,
      markSeen: async () => {},
    };
    const support = {
      store,
      now: () => NOW,
      sendEmail: async () => {},
      sendPush: async () => {},
      ownerEmail: "owner@example.com",
      supportFrom: "Support <s@example.com>",
    };
    const ok = makeDeps({}, { support });
    const res = await handleMaintenance(req(SECRET), async () => ok.deps);
    const body = (await res.json()) as { ok: boolean; support: unknown };
    expect(body.ok).toBe(true);
    expect(body.support).toEqual({ retried: 0, delivered: 0, gaveUp: 0, digest: 2 });

    const broken = makeDeps(
      {},
      {
        support: {
          ...support,
          store: {
            ...store,
            waitingRows: async () => {
              throw new Error("db down");
            },
          },
        },
      },
    );
    const failed = await handleMaintenance(req(SECRET), async () => broken.deps);
    const failedBody = (await failed.json()) as {
      ok: boolean;
      failures: string[];
      revocations: unknown;
    };
    expect(failed.status).toBe(500);
    expect(failedBody.failures).toEqual(["support-notices"]);
    expect(failedBody.revocations).toEqual({ revoked: 0, stillPending: 0, expired: 0 });
  });

  it("still sweeps reports when the revocation step fails, and says which step failed", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const tables: Record<string, Row[]> = {
      content_reports: [{ id: "r1", kind: "user", created_at: ago(UNDELIVERED_AFTER_MS + 1000) }],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    deps.db = fakeDb(tables, { apple_revocation_pending: "permission denied" });
    const res = await handleMaintenance(req(SECRET), async () => deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      failures: ["apple-revocations"],
      reports: { delivered: 1, escalated: 0 },
    });
    expect(sent).toHaveLength(1);
  });
});
